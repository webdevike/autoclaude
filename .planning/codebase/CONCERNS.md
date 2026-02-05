# Codebase Concerns

**Analysis Date:** 2026-02-05

## Tech Debt

### Global State in Telegram Channel
- **Issue:** `chatIdMap` is a module-level global Map that stores user->chatId mappings with no expiration or cleanup mechanism
- **Files:** `packages/channels/telegram/src/index.ts` (line 234)
- **Impact:** Memory leak over long-running sessions. Map grows unbounded as new users message the bot. In production, this can cause the gateway process to consume increasing memory indefinitely.
- **Fix approach:** Replace with a time-bounded cache (LRU or TTL-based) that evicts stale entries. Alternative: fetch chatId dynamically from incoming message metadata rather than persisting state.

### Non-Idempotent Message Sending in Telegram
- **Issue:** `send()` and `editMessage()` split long messages into chunks without transaction semantics. If the process crashes mid-send, some chunks go through while others don't, leaving the user with incomplete responses.
- **Files:** `packages/channels/telegram/src/index.ts` (lines 193-206, 209-225)
- **Impact:** Inconsistent user experience for responses over 4096 characters. No way to rollback partial sends or indicate truncation.
- **Fix approach:** Batch chunks as a single logical unit or add explicit truncation indicators. Consider using Telegram's media grouping feature if available, or store pending sends in a queue with idempotency keys.

### Type Unsafety in CLI Initialization
- **Issue:** Line 114 uses unsafe type casting: `(gateway as unknown as { channels: Map<string, unknown> }).channels?.values()`
- **Files:** `packages/cli/src/index.ts` (line 114)
- **Impact:** Gateway's channels property is private and not exposed in interface. This violates encapsulation and could break if internal structure changes. Fragile to refactoring.
- **Fix approach:** Add getter method to Gateway class to expose channels publicly, or restructure to pass channels directly to StatusReporter during initialization.

### No-op Non-Fatal Errors
- **Issue:** Many error conditions are silently logged and swallowed (tmux window creation failures, Telegram API failures, message send failures)
- **Files:** `packages/channels/telegram/src/index.ts` (lines 85, 157-160), `packages/core/src/tmux.ts` (lines 60-62, 96-98, 119-121, 135-138)
- **Impact:** Agent sessions may appear to succeed but actually fail silently. Users never know if their requests were processed. Gateway continues operating in degraded state.
- **Fix approach:** Implement explicit error tracking. Return error responses to user when critical operations fail. Add structured logging with severity levels.

### Unbounded Token Consumption in Agent Loop
- **Issue:** `runSmartAgent` has hardcoded `maxTurns = 20` limit but no token budget. Agent can exhaust monthly API quotas or incur massive costs with long-context conversations
- **Files:** `packages/core/src/agent.ts` (lines 171-184)
- **Impact:** Cost explosion if agent gets into repetitive loops. No protection against expensive models consuming budget unexpectedly.
- **Fix approach:** Add token budget tracking per session. Implement early termination when budget is exceeded. Log token usage per turn.

### Delegation String Parsing
- **Issue:** Agent delegation uses brittle string parsing: `text.indexOf("DELEGATE:")` to detect when triage agent decides to delegate
- **Files:** `packages/core/src/agent.ts` (lines 117-121)
- **Impact:** If LLM output changes formatting or "DELEGATE:" appears in the response text for another reason, delegation fails silently and request is handled by triage model instead of smart agent. Not deterministic.
- **Fix approach:** Use structured tool use instead. Define a "delegate" tool that triage agent can call, then parse tool calls rather than text output.

## Known Bugs

### Telegram Bot Offset Race Condition
- **Symptoms:** Bot may miss or reprocess updates if polling interval is interrupted
- **Files:** `packages/channels/telegram/src/index.ts` (lines 104-169)
- **Trigger:** If the tick() async function is awaited but offset hasn't been updated yet when two polls overlap
- **Workaround:** Offset is set for each update as it's processed (line 116), but there's a window before tick() completes and before the next iteration starts

### Missing Message Mode in Telegram Channel
- **Symptoms:** Message mode defaults to empty string instead of inheriting from channel default
- **Files:** `packages/channels/telegram/src/index.ts` (line 147): `mode: ""`
- **Trigger:** User sends message via Telegram, mode is not set, gateway assigns it based on channel mapping
- **Workaround:** Gateway has fallback logic to assign mode from channel config (packages/gateway/src/index.ts lines 46-49), but the message itself is incomplete

### Cron Jobs Can Stack If Slow
- **Symptoms:** If a scheduled cron takes longer than its interval to complete, the next invocation starts before the previous finishes, causing concurrent execution
- **Files:** `packages/scheduler/src/index.ts` (line 27-30)
- **Trigger:** Define a 5-minute cron that takes 10 minutes to execute
- **Workaround:** None — the scheduler will spawn multiple concurrent sessions for the same cron

## Security Considerations

### API Keys in Error Messages and Logs
- **Risk:** If API calls fail, error responses may leak portions of API keys or full responses containing secrets
- **Files:** `packages/core/src/llm.ts` (lines 216, 219), `packages/channels/telegram/src/index.ts` (lines 55, 61)
- **Current mitigation:** Error messages log only a slice of raw response bodies in some cases, but full response text could contain sensitive headers
- **Recommendations:** Sanitize error messages before logging. Never log raw API responses. Use structured error objects with redacted strings.

### No Input Validation on Tool Parameters
- **Risk:** Tool functions receive parameters directly from LLM with minimal validation. Malicious/confused LLM could inject commands
- **Files:** `packages/integrations/gmail/src/index.ts` (lines 27-55), `packages/integrations/notion/src/index.ts` (lines 23-38), `packages/integrations/linear/src/index.ts`
- **Current mitigation:** Type casting `(params.x as string)` but no actual validation
- **Recommendations:** Add schema validation (zod or similar) before executing any tool. Check parameter types and value ranges.

### Telegram Bot Token in Command Line Invocation
- **Risk:** Bot token is passed through environment variables which can be visible in process listings
- **Files:** `packages/cli/src/index.ts` (line 88)
- **Current mitigation:** `.env` file with TELEGRAM_BOT_TOKEN, but if bot crashes, token is visible in crash logs or core dumps
- **Recommendations:** Use keyring/secrets manager. Rotate tokens regularly. Never log or include tokens in error messages.

### No Authentication on Agent Delegation
- **Risk:** Anyone who can access the orchestrator can delegate tasks and consume API quota
- **Files:** `packages/core/src/agent.ts` (lines 89-129)
- **Current mitigation:** Telegram channel has user allowlist, but gateway/orchestrator has no authentication layer
- **Recommendations:** Implement per-mode access control. Validate sender identity throughout the request lifecycle.

## Performance Bottlenecks

### Synchronous String Processing in Tmux
- **Problem:** Each stdout/stderr line from processes spawned in tmux is sent via `execSync` to tmux send-keys. This blocks the event loop
- **Files:** `packages/core/src/tmux.ts` (lines 65-85)
- **Cause:** Using execSync instead of async tmux API. Each log line triggers a shell invocation.
- **Improvement path:** Use a tmux library with async support, or batch writes to reduce syscall overhead.

### N+1 Gmail Queries on Message List
- **Problem:** `gmail_list_messages` fetches message list, then issues N additional `get()` calls to fetch metadata for each message
- **Files:** `packages/integrations/gmail/src/index.ts` (lines 36-52)
- **Cause:** Gmail API doesn't return full headers in list endpoint, requires separate calls
- **Improvement path:** Use batch endpoint if available. Cache results. Limit list to 5 results instead of 10 to reduce calls.

### Unbounded Message History
- **Problem:** Messages array in agent loop grows indefinitely with each turn. Long conversations accumulate all prior message history in memory
- **Files:** `packages/core/src/agent.ts` (lines 167-223)
- **Cause:** No pruning or summarization of old turns
- **Improvement path:** Implement sliding window of last N messages, or summarize old turns into a single context message.

### Polling Interval for Telegram is Fixed
- **Problem:** Telegram polls at 2000ms interval regardless of traffic. Under load this is too slow; during quiet periods it's wasteful
- **Files:** `packages/channels/telegram/src/index.ts` (line 31)
- **Cause:** Simple setInterval with hardcoded delay
- **Improvement path:** Adaptive polling (increase interval when no messages, decrease under load) or use long-polling timeout server-side.

## Fragile Areas

### Agent Session State Management
- **Files:** `packages/core/src/agent.ts` (lines 38, 140-149, 165)
- **Why fragile:** Sessions are stored in memory only. If the process crashes, all active session state is lost. Users can't recover or check status. No persistence layer.
- **Safe modification:** Always return sessionId to client. Add recovery endpoint that checks tmux windows and restores session state from there.
- **Test coverage:** No tests for session lifecycle or crash recovery.

### Mode Configuration Loading
- **Files:** `packages/cli/src/index.ts` (lines 35-48)
- **Why fragile:** Silently skips missing config files with `catch` block. If personal.json is malformed JSON, it's skipped without error. System starts with fewer modes than expected.
- **Safe modification:** Validate each config file against schema on load. Fail fast if required mode is missing. Log detailed parse errors.
- **Test coverage:** No validation of config file format before use.

### Tmux Session Management
- **Files:** `packages/core/src/tmux.ts`
- **Why fragile:** Assumes tmux is installed and in PATH. Creates session once but never checks if it still exists. If session is killed externally, ensureSession() won't recreate it (it checks with has-session which fails).
- **Safe modification:** Wrap all tmux commands with existence checks. Implement automatic session recovery.
- **Test coverage:** No tests for missing tmux or session death.

### LLM Provider Fallback
- **Files:** `packages/core/src/llm.ts` (lines 63-85)
- **Why fragile:** Uses provider prefix from model string (e.g., "openrouter/model-name"). No validation that the specified provider is initialized. If only OpenAI key is set but config requests OpenRouter, request silently fails.
- **Safe modification:** Validate provider availability on init. Parse model strings with schema validation. Provide clear error when requested provider has no credentials.
- **Test coverage:** No tests for provider selection or credential validation.

## Scaling Limits

### In-Memory Session Map
- **Current capacity:** Limited by Node.js heap memory. Each session is a small object, but map is never cleaned up.
- **Limit:** After ~10,000 concurrent sessions, memory usage becomes significant. After ~50,000, process may OOM.
- **Scaling path:** Move sessions to external store (Redis). Implement session TTL and garbage collection.

### Telegram ChatId Map
- **Current capacity:** Limited by Node.js heap memory, similar to sessions.
- **Limit:** After ~100,000 unique users, map uses significant memory.
- **Scaling path:** Implement LRU cache with fixed size. Use Redis for distributed deployments.

### Single Tmux Session
- **Current capacity:** All agents run in a single tmux session with separate windows. Tmux can handle thousands of windows but becomes sluggish.
- **Limit:** Beyond ~500 windows, tmux list-windows becomes slow. Window capture (peek) may timeout.
- **Scaling path:** Shard agents across multiple tmux sessions. Implement window cleanup for completed jobs.

### Cron Job Execution
- **Current capacity:** node-cron is in-process. If many crons fire simultaneously, they compete for resources.
- **Limit:** Beyond ~100 concurrent cron tasks, scheduler thread becomes bottleneck.
- **Scaling path:** Move to distributed cron system (e.g., Bull queue with Redis).

## Dependencies at Risk

### grammY → Manual Fetch (Recent)
- **Risk:** Switched from grammY library to manual fetch-based polling due to grammY long-polling hanging in some environments
- **Impact:** Lost battle-tested library abstractions. Now maintaining custom Telegram client code which is error-prone.
- **Migration plan:** If custom polling becomes problematic, evaluate other Telegram libraries (node-telegram-bot-api, telegraf) or implement robust long-polling with proper error recovery.

### OpenRouter SDK Compatibility
- **Risk:** OpenAI SDK v4.104+ has incompatibility with OpenRouter response format. Code uses raw fetch() as workaround (`packages/core/src/llm.ts` line 182)
- **Impact:** Custom OpenRouter implementation duplicates logic from OpenAI client. Fragile to OpenRouter API changes.
- **Migration plan:** Monitor OpenAI SDK releases for fixes. Consider using OpenAI-compatible client libraries instead.

### Node-Cron Execution Model
- **Risk:** node-cron uses in-process scheduling. No distributed locking. In horizontal deployments, multiple instances will execute the same cron concurrently.
- **Impact:** Duplicate tool executions, race conditions on shared resources.
- **Migration plan:** If deployment becomes multi-instance, move to external scheduler (Bull, pg-boss) with distributed locking.

## Missing Critical Features

### No Audit Log
- **Problem:** No record of what agents did, when they used tools, what data they accessed
- **Blocks:** Cannot comply with data governance requirements. Cannot debug user issues or investigate misuse.
- **Solution:** Add structured logging of all tool executions with inputs/outputs. Store in central log store.

### No Rate Limiting
- **Problem:** No limits on API calls per user, mode, or globally. Agent can spam integrations
- **Blocks:** Cannot protect against cost explosion or abuse. Integration APIs may throttle and cause cascading failures.
- **Solution:** Implement token bucket rate limiting per user/mode. Add circuit breaker for external APIs.

### No Error Recovery
- **Problem:** If agent session crashes, there's no way to resume or recover state
- **Blocks:** Long-running tasks cannot survive process restarts. Users can't check status of incomplete work.
- **Solution:** Implement session persistence. Store conversation history and task state in database. Add recovery endpoints.

### No Multi-Instance Support
- **Problem:** All state is in-process. Running multiple instances of the gateway will lead to lost messages and duplicate executions
- **Blocks:** Cannot scale horizontally. Single process is a bottleneck and single point of failure.
- **Solution:** Move to distributed state store (Redis). Implement message queue for channel events.

## Test Coverage Gaps

### No Tests for Agent Delegation Logic
- **What's not tested:** Triage model correctly delegates complex requests. LLM response parsing works correctly. Tool calls are executed in order.
- **Files:** `packages/core/src/agent.ts` (lines 104-212)
- **Risk:** String parsing for "DELEGATE:" can silently fail. Tool execution errors aren't caught. Delegation might not work as expected.
- **Priority:** High

### No Tests for LLM Provider Selection
- **What's not tested:** Correct provider is selected based on model string. Missing credentials are handled gracefully. Fallback logic works.
- **Files:** `packages/core/src/llm.ts` (lines 88-101, 255-269)
- **Risk:** Wrong provider gets called. Uninitialized clients are used.
- **Priority:** Medium

### No Tests for Telegram Channel
- **What's not tested:** Polling loop correctness. Offset tracking. Message parsing. Authorization checks.
- **Files:** `packages/channels/telegram/src/index.ts`
- **Risk:** Bot may miss updates, reprocess updates, or crash on malformed messages.
- **Priority:** High

### No Tests for Config Loading
- **What's not tested:** Malformed JSON in config files. Missing required fields. Multiple modes load correctly.
- **Files:** `packages/cli/src/index.ts` (lines 35-48)
- **Risk:** Invalid configs are silently skipped. System starts with unexpected state.
- **Priority:** Medium

### No Tests for Cron Job Execution
- **What's not tested:** Cron expressions are validated. Jobs fire at correct times. Concurrent execution is handled.
- **Files:** `packages/scheduler/src/index.ts`
- **Risk:** Invalid cron expressions silently fail. Jobs may execute concurrently.
- **Priority:** Medium

### No Tests for Tool Execution
- **What's not tested:** Tool parameters are validated. Integration APIs are called correctly. Errors are handled.
- **Files:** `packages/integrations/**/*.ts`
- **Risk:** Invalid parameters passed to APIs. Errors aren't caught or reported.
- **Priority:** High

---

*Concerns audit: 2026-02-05*
