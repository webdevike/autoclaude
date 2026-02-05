# Domain Pitfalls

**Domain:** Self-hosted personal AI assistant migration to pi-mono
**Researched:** 2026-02-05
**Confidence:** HIGH (verified from official pi-mono sources, production reports, and OpenClaw case studies)

---

## Critical Pitfalls

Mistakes that cause rewrites, production failures, or major security issues.

### Pitfall 1: Context Injection Without Visibility

**What goes wrong:** Tools and frameworks inject content into the LLM context "behind your back" that isn't visible in the UI or logs. MCP servers alone consume 7-9% of your context window before you start working, often for tools never used in that session.

**Why it happens:** Teams adopt frameworks that prioritize convenience over observability. Pre-loading all available tools seems like good DX but creates invisible context bloat.

**Consequences:**
- Context exhaustion before task completion
- Unable to debug why the agent "forgot" earlier instructions
- Token costs 2-3x higher than expected
- Performance degradation as context fills (NoLiMa study shows LLM performance drops significantly as context length increases)

**Warning signs:**
- Agent starts "forgetting" things in long conversations
- Token usage spikes without visible correlation to conversation length
- Models start performing worse mid-conversation despite no change in task complexity
- Context window overflow errors (especially when hitting 70-80% capacity)

**Prevention strategy:**
- Adopt pi-mono's minimal tool philosophy (4 core tools: Read, Write, Edit, Bash)
- Use progressive disclosure: load tools only when needed
- Implement explicit context tracking showing what's in the system prompt
- Monitor token usage per-component (system prompt, tools, conversation, RAG)
- Trigger summarization at 70-80% context capacity

**Which phase:** Phase 1 (Architecture) - build observability first, not as an afterthought

**Sources:**
- [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Context Window Overflow in 2026](https://redis.io/blog/context-window-overflow/)

---

### Pitfall 2: Self-Modifying Config Without Guardrails

**What goes wrong:** Agents that edit their own configuration files can execute high-risk changes across entire infrastructure without human authorization gates, or corrupt config files with malformed JSON.

**Why it happens:** Self-configuring agents seem like powerful automation but lack architectural constraints. Teams implement "edit any config" as a feature without considering blast radius.

**Consequences:**
- Agent breaks itself by corrupting JSON config (no validation)
- Security credentials accidentally committed or leaked
- Runaway changes applied to production without rollback capability
- "Prompt decay" where the system prompt loses effectiveness over time

**Warning signs:**
- Config files with syntax errors that prevent agent startup
- Git history shows rapid, unreviewed config changes
- Agent behavior changes unpredictably over time
- Multiple failed attempts to parse config at startup

**Prevention strategy:**
- **Staged rollout:** Require human approval for all config changes
- **JSON schema validation:** Use Pydantic or similar to validate before write
- **Version control:** Auto-commit config changes with descriptive messages
- **Rollback capability:** Keep last-known-good config, detect startup failures
- **Audit trail:** Log what prompted each config change and the diff applied
- **Scope limits:** Allow editing of preferences but not security-critical settings (API keys, allowed users, OAuth tokens)

**Which phase:** Phase 2 (Self-Configuration) - must implement validation and rollback before enabling self-editing

**Detection:** Monitor for JSON parse errors, validate on read, implement health checks

**Sources:**
- [Self-modifying AI agent configuration pitfalls](https://www.uscsinstitute.org/cybersecurity-insights/blog/what-is-ai-agent-security-plan-2026-threats-and-strategies-explained)
- [OWASP ASI Top 10 2026](https://medium.com/@oracle_43885/owasps-ai-agent-security-top-10-agent-security-risks-2026-fc5c435e86eb)

---

### Pitfall 3: Tmux Zombie Process Accumulation

**What goes wrong:** When tmux sessions are killed, sub-agents become orphaned (PPID=1) and continue consuming memory (~200MB each). After repeated restarts, memory exhaustion crashes the system.

**Why it happens:** `tmux kill-session` only sends SIGHUP to the foreground process. Sub-agents that fork or reparent escape cleanup. No periodic cleanup process exists.

**Consequences:**
- VPS runs out of memory after days/weeks
- Hundreds of zombie processes accumulate
- No clear connection between "kill session" and memory growth
- Requires manual intervention or VPS restart

**Warning signs:**
- Memory usage grows monotonically despite killing sessions
- `ps aux` shows processes with PPID=1 matching agent names
- Tmux session count doesn't match actual agent process count
- System becomes unresponsive after extended uptime

**Prevention strategy:**
- **Defense-in-depth cleanup:**
  - Layer 1: Kill by process group when killing tmux session
  - Layer 2: Kill by TTY when killing tmux session
  - Layer 3: Periodic cleanup job for orphaned processes (cronjob every 6 hours)
- **Socket directory convention:** Place all tmux sockets under `CLAUDE_TMUX_SOCKET_DIR`
- **Session naming:** Use predictable naming (e.g., `smart-${sessionId}`) to identify agent processes
- **Monitoring:** Alert when orphan count exceeds threshold (>10 processes)

**Which phase:** Phase 1 (Architecture) - implement before deploying to VPS

**Detection:** `ps -eo ppid,pid,comm | grep "^1 " | grep -i agent`

**Sources:**
- [Gastown orphan process cleanup](https://github.com/steveyegge/gastown/issues/29)
- [Tmux agent orchestration best practices](https://x.com/kieranklaassen/status/2007128073813336206)

---

### Pitfall 4: Triage Model Blindly Routing All Complex Tasks

**What goes wrong:** Two-tier delegation works in theory but fails in practice when the triage model over-delegates. Every task goes to the expensive smart tier, or simple tasks get routed to smart agents wasting time and money.

**Why it happens:** Triage prompt is too conservative ("delegate anything complex") or lacks concrete examples. The cheap model lacks calibration for what truly needs delegation.

**Consequences:**
- Smart tier (expensive) handles 90%+ of requests
- Cost is 10-15x higher than expected
- No actual cost savings from two-tier architecture
- Smart tier queue backs up with trivial tasks

**Warning signs:**
- OpenRouter/Anthropic bills 5-10x higher than projected
- Delegation rate >70% (should be 30-50% for personal assistant)
- Simple questions like "what's my schedule?" trigger smart agents
- Users report slow responses for basic queries

**Prevention strategy:**
- **Concrete examples in triage prompt:**
  - "Handle yourself: greetings, status checks, simple factual Q&A, mode switching"
  - "Delegate: multi-step tasks, code review, integration work, planning"
- **Cost monitoring from day one:** Track delegation rate and cost per request tier
- **Test dataset:** Build 50-example test set covering task spectrum, measure delegation accuracy
- **Fallback rule:** If smart agent completes in <5 seconds, could have been handled by triage
- **Calibration loop:** Weekly review of mis-routed tasks, update triage prompt

**Which phase:** Phase 1 (Architecture) - critical to get right before deploying, then Phase 3 (Optimization) - tune based on production data

**Detection:** Log every delegation decision with task description and tier chosen

**Sources:**
- [Triangle: Multi-LLM Agent Triage](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/02/TRIANGLE_FSE25.pdf)
- [Multi-Agent System Architecture Patterns](https://www.comet.com/site/blog/multi-agent-systems/)

---

### Pitfall 5: OAuth Token Refresh Failures in Production

**What goes wrong:** Gmail OAuth tokens expire after 6 months of non-use, or Google revokes them when reaching the 100-token-per-client limit. Agent suddenly can't access Gmail without manual re-auth.

**Why it happens:** Google Cloud projects default to "Testing" mode (unreliable). Refresh tokens aren't automatically rotated. No monitoring for token expiration.

**Consequences:**
- Silent failure: agent thinks it can access Gmail but gets 401 errors
- User must manually re-authenticate mid-conversation
- If at 100-token limit, must revoke old tokens before adding new ones
- Gmail integration appears "broken" intermittently

**Warning signs:**
- Gmail tool calls return 401 Unauthorized
- Token hasn't been used in 4+ months
- Google Cloud Console shows app in "Testing" mode
- Error logs show "invalid_grant" or "token_expired"

**Prevention strategy:**
- **Production mode:** Switch Google Cloud app to "Production" immediately (Testing mode is unreliable)
- **Token rotation:** Implement automatic refresh token rotation (new refresh token with every access token refresh)
- **Expiration monitoring:** Track last token use, alert at 5 months (before 6-month expiration)
- **Token limit management:** Track token count, implement revocation for unused tokens
- **Graceful degradation:** Detect 401, send user message "Gmail auth expired, please re-authenticate: [link]"
- **Health checks:** Daily smoke test of each OAuth integration

**Which phase:** Phase 2 (Integrations) - implement token management before deploying Gmail integration

**Detection:** Monitor HTTP 401 responses from Google APIs, track days since last successful auth

**Sources:**
- [OAuth Gmail API integration pitfalls](https://developers.google.com/identity/protocols/oauth2)
- [OpenClaw Gmail setup guide](https://superconscious.agency/blog/openclaw-connect-gmail/)
- [Token refresh limits](https://dev.to/composiodev/4-best-ai-agent-authentication-platforms-to-consider-in-2026-32o8)

---

### Pitfall 6: Memory Poisoning Through Persistent Preferences

**What goes wrong:** Persistent preferences stored in JSON become attack vectors. Malicious input (via prompt injection or compromised skill) writes harmful data to preferences. Agent loads poisoned preferences and executes unintended actions.

**Why it happens:** Preferences are treated as "data" rather than "code," but LLMs blur this distinction. No input validation on what can be written to preferences.

**Consequences:**
- Agent executes commands based on injected preferences
- Preferences contain instructions to exfiltrate data to external servers
- Subtle behavior changes that go unnoticed until damage is done
- Audit trail only shows "agent loaded preferences" not "preferences were compromised"

**Warning signs:**
- Preferences file contains executable code or URLs
- Unexpected commands in user preferences (shell commands, curl to unknown domains)
- Preference changes without explicit user request
- Preferences contain instructions rather than data ("always send summaries to [malicious URL]")

**Prevention strategy:**
- **Schema validation:** JSON schema strictly defines allowed preference types (no URLs, no code blocks)
- **Allowlist approach:** Only specific preference keys can be written
- **Diff approval:** Show user diff before committing preference changes
- **Sandboxed preferences:** Preferences can affect behavior but never trigger executable actions directly
- **Audit logging:** Log what triggered each preference change (user message, session ID)
- **Regular review:** Monthly audit of preferences for suspicious content

**Which phase:** Phase 2 (Self-Configuration) - implement validation before enabling preference persistence

**Detection:** Scan preferences for regex patterns (URLs, shell operators, code keywords)

**Sources:**
- [OWASP ASI: Memory Poisoning](https://www.kaspersky.com/blog/top-agentic-ai-risks-2026/55184/)
- [Agent Memory Security](https://blog.dust.tt/agent-memory-building-persistence-into-ai-collaboration/)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or require significant rework.

### Pitfall 7: Over-Indexing on External Tool Standards (MCP)

**What goes wrong:** Teams adopt MCP (Model Context Protocol) thinking it's the "standard," but MCP constrains hot-reloading, forces tools into system context at startup, and limits agent's ability to extend itself.

**Why it happens:** MCP sounds like a good architecture (standard protocol for tools). Framework-first thinking prioritizes "using the standard" over "solving the actual problem."

**Consequences:**
- Tools loaded at startup consume 7-9% of context for unused capabilities
- Can't hot-reload tools without restarting entire agent
- Agent can't write and test new tools in the same session
- Forces static tool architecture instead of dynamic extension

**Warning signs:**
- Must restart agent to add new tool
- Context fills quickly with tool definitions you don't use
- Agent says "I don't have that capability" when it could easily implement it
- Development cycle requires code → restart → test loop

**Prevention strategy:**
- Follow pi-mono philosophy: agents extend themselves via code
- Use MCP only for truly external services (not agent-writable tools)
- Keep 4 core tools (Read, Write, Edit, Bash), implement everything else as skills/extensions
- Hot-reload agent-written extensions without restart
- Let agent write, test, iterate on tools in a single workflow

**Which phase:** Phase 1 (Architecture) - decide tool philosophy before building

**Sources:**
- [Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)
- [What I learned building pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)

---

### Pitfall 8: API Rate Limiting Without Backoff/Retry

**What goes wrong:** Agent hammers Linear/Notion APIs without respecting rate limits. Gets 429 responses. Doesn't implement exponential backoff. User sees "API error" without understanding why.

**Why it happens:** Teams build integrations without reading API docs. Assume APIs are unlimited. Don't test at scale.

**Consequences:**
- API credentials get rate-limited or temporarily banned
- Users see cryptic "429 Too Many Requests" errors
- Agent appears broken during high-usage periods
- No graceful degradation

**Warning signs:**
- HTTP 429 errors in logs
- API calls fail intermittently
- Errors cluster during active use periods
- No delay between failed API calls and retries

**Prevention strategy:**
- **Read API docs first:** Notion (3 req/sec average), Linear (varies by plan)
- **Exponential backoff:** 1s → 2s → 4s → 8s with jitter
- **Rate limiting library:** Use bottleneck, p-limit, or similar
- **Graceful error messages:** "Notion API rate limited, waiting 5 seconds..." instead of raw error
- **Request batching:** Combine multiple operations where API supports it
- **Caching:** Cache frequently accessed data (project list, workspace settings)

**Which phase:** Phase 2 (Integrations) - implement before deploying each integration

**Detection:** Monitor 429 responses, track retry attempts

**Sources:**
- [Notion API Rate Limits](https://developers.notion.com/reference/request-limits)
- [API Rate Limiting 2026 Guide](https://www.levo.ai/resources/blogs/api-rate-limiting-guide-2026)

---

### Pitfall 9: Multi-Channel Context Fragmentation

**What goes wrong:** User starts conversation in Telegram, switches to WhatsApp, agent has no memory of previous context. Users frustrated: "I already told you this in Telegram!"

**Why it happens:** Each channel maintains separate conversation history. No shared identity across channels. No context synchronization.

**Consequences:**
- Poor user experience (have to repeat themselves)
- Users stick to single channel, defeating multi-channel purpose
- Agent appears "dumb" for forgetting
- Duplicated effort across channels

**Warning signs:**
- Users explicitly say "as I mentioned in [other channel]..."
- Same questions asked across different channels
- Low usage of secondary channels
- Support requests about "agent forgetting"

**Prevention strategy:**
- **Unified identity:** Map Telegram username → Gmail → unique user ID
- **Shared conversation store:** Persist to database/file with user ID, not channel ID
- **Context retrieval:** Load last N messages across all channels when responding
- **Cross-channel references:** Agent mentions "based on our Telegram conversation..."
- **Gateway pattern:** Clawdbot/Moltbot-style gateway that preserves identity

**Which phase:** Phase 3 (Multi-Channel) - plan architecture in Phase 1, implement in Phase 3

**Detection:** Track conversation topics per-user across channels

**Sources:**
- [Clawdbot: One Brain, Many Channels](https://medium.com/@imranmsa93/how-clawdbot-enables-one-brain-many-channels-ai-agents-across-whatsapp-slack-telegram-and-b49242261419)
- [Moltbot Review](https://leaveit2ai.com/ai-tools/productivity/moltbot)

---

### Pitfall 10: Insufficient LLM Cost Monitoring

**What goes wrong:** Team deploys agent, costs spiral out of control. No per-user cost tracking. No budget alerts. Recursive loop burns through $500 in an hour.

**Why it happens:** Teams focus on functionality first, treat monitoring as "nice to have." Costs seem small in testing (few requests) but scale nonlinearly in production.

**Consequences:**
- Surprise $5,000 bill at end of month
- Can't identify what's driving costs (model? user? task type?)
- No data to optimize which tasks should use cheap vs expensive models
- Project gets canceled due to unsustainable costs

**Warning signs:**
- Monthly API bill 3x+ higher than expected
- Can't explain why costs increased week-over-week
- No per-user or per-task cost breakdown
- Users running agents in infinite loops without detection

**Prevention strategy:**
- **Track from day one:** Log every LLM call with cost, user, task type, tier
- **Per-user budgets:** Alert when user exceeds $X/day or $Y/month
- **Anomaly detection:** Flag when costs spike 2x+ vs rolling average
- **Dashboard:** Real-time view of costs by tier, user, task type
- **Caching:** Implement prompt caching (saves 90% on repeated context)
- **Cost-aware routing:** Cheap model for triage, expensive for complex tasks only
- **Budget for 1.5x:** Initial estimate will be wrong, plan for 50% overage

**Which phase:** Phase 1 (Architecture) - build cost tracking into LLM client from start

**Detection:** Daily cost review, anomaly detection for 2x+ spikes

**Sources:**
- [LLM Cost Monitoring Guide](https://langwatch.ai/blog/4-best-tools-for-monitoring-llm-agentapplications-in-2026)
- [AI Agent Production Costs 2026](https://www.agentframeworkhub.com/blog/ai-agent-production-costs-2026)
- [How to Cut LLM Costs by 90%](https://www.helicone.ai/blog/monitor-and-optimize-llm-costs)

---

### Pitfall 11: No Evaluation/Testing Framework

**What goes wrong:** Team ships changes without testing whether agent quality degraded. Subtle regressions go unnoticed until users complain. No way to compare "is this prompt better?"

**Why it happens:** Building evals feels like overhead. LLM outputs are non-deterministic, so teams think "testing doesn't apply." Prioritize new features over quality gates.

**Consequences:**
- Prompt changes break existing functionality
- No confidence when updating models or system prompts
- "Debugging by vibes" - can't tell if changes help or hurt
- Agent quality degrades over time (prompt decay)

**Warning signs:**
- Changes deployed without testing
- No test dataset of example conversations
- Can't answer "did this prompt change improve delegation accuracy?"
- Regressions discovered by users, not developers

**Prevention strategy:**
- **Build test dataset early:** 50-100 examples covering task spectrum (simple → complex)
- **Eval metrics:** Delegation accuracy, task success rate, refusal rate, cost per task
- **Regression testing:** Run evals before merging prompt/model changes
- **Human review:** Sample 10 random conversations weekly
- **LLM-as-judge:** Use strong model to grade weak model outputs
- **52% of orgs run offline evals:** Industry standard for production agents

**Which phase:** Phase 3 (Optimization) - build after core functionality works, before scaling

**Detection:** Track quality metrics weekly (success rate, user satisfaction)

**Sources:**
- [State of AI Agent Engineering](https://www.langchain.com/state-of-agent-engineering)
- [Best AI Testing Tools 2026](https://www.virtuosoqa.com/post/best-ai-testing-tools)

---

### Pitfall 12: No Fallback Provider Strategy

**What goes wrong:** OpenRouter goes down or rate-limits. Agent completely stops working. Users blocked until provider recovers.

**Why it happens:** Teams build against single provider. Don't test failover scenarios. Assume uptime is 100%.

**Consequences:**
- Agent unavailable during provider outages (happens regularly)
- Users see raw error messages without context
- No graceful degradation to alternative provider
- Business continuity dependent on single vendor SLA

**Warning signs:**
- Agent returns 503 Service Unavailable to users
- No fallback configured in code
- Can't switch providers without code change
- Incidents correlate with provider status pages

**Prevention strategy:**
- **Multi-provider architecture:** OpenRouter (primary) → OpenAI (fallback) → Anthropic (last resort)
- **Automatic failover:** Retry same provider 3x with backoff, then switch to fallback
- **Compatibility layer:** Abstract provider differences (unified API format)
- **Model mapping:** Define fallback models (gpt-4 → claude-3-opus → gpt-4o)
- **Monitoring:** Track which provider handled each request
- **Test failover:** Monthly drill - disable primary, verify fallback works

**Which phase:** Phase 1 (Architecture) - design LLM client with multi-provider support from start

**Detection:** Monitor provider distribution, alert if fallback usage >10%

**Sources:**
- [OpenRouter Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [LLM Platform Outage Handling](https://www.requesty.ai/blog/handling-llm-platform-outages-what-to-do-when-openai-anthropic-deepseek-or-others-go-down)
- [Zero-Downtime LLM Architecture](https://www.requesty.ai/blog/implementing-zero-downtime-llm-architecture-beyond-basic-fallbacks)

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 13: Treating Agent as Drop-In Replacement for Human

**What goes wrong:** Users expect agent to handle everything a human assistant would. Agent can't, users get frustrated. Over-promise on capabilities, under-deliver on reliability.

**Why it happens:** Marketing calls it "your AI assistant." Users don't understand limitations. Demo works great, production has edge cases.

**Consequences:**
- Users try tasks agent can't handle
- Frustration when agent fails "obvious" tasks
- Loss of trust after early failures
- Support overhead explaining limitations

**Prevention strategy:**
- Set realistic expectations upfront
- Document what agent CAN'T do
- Provide clear error messages when hitting limitations
- Graceful refusal: "I can't do X, but I can do Y instead"
- Incremental capability expansion (start narrow, expand over time)

**Which phase:** All phases - manage expectations continuously

---

### Pitfall 14: Deployment Without Health Checks

**What goes wrong:** Agent crashes silently. Tmux session dies. No alerts. Users message, get no response. Team finds out hours later.

**Why it happens:** VPS deployment is simple (`tmux new -d ./start.sh`), so teams skip monitoring. Assume it'll "just work."

**Consequences:**
- Silent failures go unnoticed
- Users think agent is ignoring them
- No visibility into what failed or when
- Delayed incident response

**Prevention strategy:**
- **Heartbeat endpoint:** HTTP endpoint that returns 200 if healthy
- **External monitoring:** UptimeRobot, BetterUptime, or similar
- **Log aggregation:** Ship logs to centralized location
- **Crash restart:** systemd service file with restart policy
- **Alert on failure:** Telegram/email notification when health check fails

**Which phase:** Phase 4 (Deployment) - implement before moving to VPS

---

### Pitfall 15: Running Agent as Root on VPS

**What goes wrong:** Agent has full system access. Malicious input or compromised skill can execute arbitrary commands as root. Complete system compromise possible.

**Why it happens:** SSH as root is convenient. Agent needs to install packages. Seems easier than configuring sudo.

**Consequences:**
- Security nightmare (principle of least privilege violated)
- Agent can modify system files, install packages, read all data
- No isolation between agent and system
- Audit trail doesn't distinguish between legitimate and malicious actions

**Prevention strategy:**
- **Dedicated user:** Create `jarvis` user with limited permissions
- **Sudo whitelist:** Only specific commands allowed via sudo (if needed)
- **Docker container:** Run agent in container with resource limits
- **MicroVMs:** For untrusted code execution (Firecracker, Kata)
- **File system restrictions:** Agent only writes to `/home/jarvis/workspace`

**Which phase:** Phase 4 (Deployment) - configure before initial VPS deployment

**Sources:**
- [Security for Production AI Agents](https://iain.so/security-for-production-ai-agents-in-2026)
- [AI Agent Sandboxing](https://blaxel.ai/blog/what-is-a-sandbox-environment)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| **Phase 1: Architecture** | Adopting frameworks that hide context usage | Build context observability from day one, follow pi-mono minimal tool philosophy |
| **Phase 1: Architecture** | No cost tracking infrastructure | Implement LLM client with per-call cost logging before any other features |
| **Phase 1: Architecture** | Single provider dependency | Design multi-provider LLM client with automatic failover |
| **Phase 2: Triage Delegation** | Over-delegating to smart tier | Build 50-example test set, track delegation rate and cost per tier |
| **Phase 2: Self-Configuration** | No validation on config edits | JSON schema validation + version control + rollback capability |
| **Phase 2: Integrations** | OAuth token refresh failures | Switch Google app to Production mode, implement token rotation and expiration monitoring |
| **Phase 2: Integrations** | API rate limiting breaks agent | Exponential backoff, request batching, graceful error messages |
| **Phase 3: Multi-Channel** | Context fragmentation across channels | Unified user identity, shared conversation store, gateway pattern |
| **Phase 3: Preferences** | Memory poisoning via preferences | Schema validation, allowlist approach, diff approval |
| **Phase 3: Optimization** | No evaluation framework | Build test dataset + regression testing before scaling |
| **Phase 4: Deployment** | Tmux zombie processes | Defense-in-depth cleanup (process group, TTY, periodic cron) |
| **Phase 4: Deployment** | Silent crashes without alerts | Health checks + external monitoring + systemd restart policy |
| **Phase 4: Deployment** | Running as root | Dedicated user with limited permissions |

---

## Pi-Mono Migration Specific

Critical considerations when migrating from custom agent code to pi-mono architecture.

### Migration Pitfall 1: Tool Philosophy Mismatch

**Problem:** Your custom agent has 15+ specialized tools. Pi-mono expects 4 core tools + extensions.

**What breaks:** Direct tool migration creates context bloat. Agent can't extend itself because everything is pre-built.

**Solution:**
- Keep Read, Write, Edit, Bash as core
- Convert specialized tools to hot-reloadable extensions
- Let agent write and maintain extensions as TypeScript modules
- Only keep tools that truly need LLM context (not everything)

---

### Migration Pitfall 2: Background Process Assumptions

**Problem:** Your agent uses background bash processes. Pi-mono prefers tmux for observability.

**What breaks:** Can't debug background processes. Can't co-debug with agent. Zombie processes accumulate.

**Solution:**
- Migrate background tasks to tmux windows
- Use tmux for any long-running agent sessions
- Implement proper process cleanup (see Pitfall 3)
- Embrace observability over convenience

---

### Migration Pitfall 3: Stateful Orchestrator Pattern

**Problem:** Your gateway maintains conversation state in memory. Pi-mono prefers stateless handoffs.

**What breaks:** Doesn't scale beyond single instance. Memory leaks over time. Crash loses all state.

**Solution:**
- Move state to persistent storage (files, DB)
- Gateway becomes thin routing layer
- Session state persists in files or session objects
- Enables horizontal scaling and crash recovery

---

### Migration Pitfall 4: Custom Prompt vs System Extension

**Problem:** Your custom behavior lives in 10,000-token system prompt. Pi-mono expects minimal prompt + extensions.

**What breaks:** Context window filled with instructions. Can't update behavior without restarting.

**Solution:**
- Extract domain-specific logic to extensions
- Keep system prompt under 500 tokens
- Use skills for workflow-specific patterns
- Hot-reload extensions rather than restarting

---

## Security Considerations Summary

**Top 3 Security Risks for Self-Hosted Personal AI:**

1. **Prompt Injection → Data Exfiltration:** Skills or preferences contain instructions to send data to attacker-controlled servers
2. **Static Credentials:** API keys in config files with no rotation or expiration
3. **Privilege Escalation:** Agent running as root or with excessive permissions

**Mitigation Checklist:**
- [ ] Validate all user-provided data before persistence (preferences, config edits)
- [ ] Scan preferences/config for executable content (URLs, shell commands)
- [ ] Rotate OAuth tokens automatically
- [ ] Run agent as dedicated non-root user
- [ ] Implement audit logging for all file writes and command executions
- [ ] Use short-lived credentials where possible
- [ ] Monitor for anomalous behavior (unexpected file access, network connections)

---

## Sources & Further Reading

**Pi-Mono Architecture:**
- [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) - Critical lessons from pi-coding-agent creator
- [Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/) - Pi-mono design philosophy and patterns
- [Pi-mono GitHub Repository](https://github.com/badlogic/pi-mono) - Official toolkit

**Production AI Agent Pitfalls:**
- [Why AI Pilots Fail in Production](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) - Dumb RAG, brittle connectors, polling tax
- [State of AI Agent Engineering](https://www.langchain.com/state-of-agent-engineering) - Industry survey on observability, testing, quality
- [5 Fatal Mistakes in Production](https://dev.to/agentsphere/5-fatal-mistakes-why-your-ai-agent-keeps-failing-in-production-4pk3)

**Security & Safety:**
- [Personal AI Agents Are a Security Nightmare](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare) - OpenClaw security analysis
- [OWASP Agentic Security Initiative Top 10](https://medium.com/@oracle_43885/owasps-ai-agent-security-top-10-agent-security-risks-2026-fc5c435e86eb) - Tool misuse, memory poisoning, privilege compromise
- [Security for Production AI Agents 2026](https://iain.so/security-for-production-ai-agents-in-2026)

**Context & Memory Management:**
- [Context Window Overflow in 2026](https://redis.io/blog/context-window-overflow/) - How to handle context exhaustion
- [Ultimate Guide to LLM Memory](https://medium.com/@sonitanishk2003/the-ultimate-guide-to-llm-memory-from-context-windows-to-advanced-agent-memory-systems-3ec106d2a345) - Memory tiering, summarization

**Cost & Observability:**
- [LLM Cost Monitoring Tools 2026](https://langwatch.ai/blog/4-best-tools-for-monitoring-llm-agentapplications-in-2026)
- [AI Agent Production Costs 2026](https://www.agentframeworkhub.com/blog/ai-agent-production-costs-2026) - Real cost data
- [Best LLM Monitoring Tools](https://www.braintrust.dev/articles/best-llm-monitoring-tools-2026)

**Integration Challenges:**
- [OAuth Agent-to-Agent Authentication](https://dev.to/composiodev/4-best-ai-agent-authentication-platforms-to-consider-in-2026-32o8)
- [Notion API Rate Limits](https://developers.notion.com/reference/request-limits) - 3 req/sec average
- [OpenRouter Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)

**Multi-Agent Patterns:**
- [Triangle: Multi-LLM Agent Triage](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/02/TRIANGLE_FSE25.pdf) - Microsoft Research on triage systems
- [Multi-Agent Systems Architecture](https://www.comet.com/site/blog/multi-agent-systems/) - Delegation patterns

**Tmux & Process Management:**
- [Gastown Orphan Process Cleanup](https://github.com/steveyegge/gastown/issues/29) - Defense-in-depth strategy
- [Tmux Agent Orchestration](https://x.com/kieranklaassen/status/2007128073813336206)

**Multi-Channel Messaging:**
- [Clawdbot: One Brain, Many Channels](https://medium.com/@imranmsa93/how-clawdbot-enables-one-brain-many-channels-ai-agents-across-whatsapp-slack-telegram-and-b49242261419) - Gateway pattern for unified context
- [Moltbot Review](https://leaveit2ai.com/ai-tools/productivity/moltbot) - Context persistence across channels
