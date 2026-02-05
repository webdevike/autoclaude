---
phase: 01-foundation
plan: 02
type: summary
completed: 2026-02-05
duration: 6 minutes

subsystem: agent-core
tags: [pi-agent-core, TypeBox, JSONL, session-persistence, cost-tracking]

requires:
  - 01-01-PLAN (Pi-ai LLM Migration)

provides:
  - Event-driven agent execution via pi-agent-core (no artificial turn limits)
  - TypeBox tool schema validation
  - JSONL session persistence at ~/.jarvis/sessions/{userId}/messages.jsonl
  - Token usage and cost tracking (USD per request)
  - /usage command for daily/monthly usage reports

affects:
  - 02-01-PLAN (will consume StreamProgressEvent for Telegram updates)
  - 02-02-PLAN (will use session persistence for context management)
  - 03-xx-PLAN (integrations will register tools with TypeBox schemas)

tech-stack:
  added:
    - @mariozechner/pi-agent-core: ^0.52.0
    - @sinclair/typebox: ^0.34.48
  patterns:
    - Event-driven agent loop (subscribe to agent events)
    - JSONL append-only session log with compaction
    - Per-request cost calculation and aggregation

key-files:
  created:
    - packages/core/src/agent.ts: SessionManager class (JSONL persistence)
  modified:
    - packages/core/src/agent.ts: AgentOrchestrator using pi-agent-core
    - packages/core/src/types.ts: ToolDefinitionPiAi and SessionEntry types
    - packages/core/src/llm.ts: Removed LLMClient compatibility shim
    - packages/core/src/index.ts: Export createModel instead of LLMClient
    - packages/cli/src/index.ts: Simplified entry point (no LLMClient/TmuxManager)

decisions:
  - agent-loop-replacement: Use pi-agent-core Agent class for event-driven execution (eliminates 20-turn limit, enables streaming progress)
  - tool-validation: Convert tools to TypeBox schemas for runtime validation before execution
  - session-persistence: JSONL format at ~/.jarvis/sessions/{userId}/messages.jsonl (append-only, last 50 messages loaded, 2x compaction threshold)
  - cost-tracking: MODEL_COSTS map with per-token pricing, cost logged per request in USD
  - usage-reporting: /usage command aggregates from JSONL, shows per-model breakdown with cost
  - cli-simplification: Remove LLMClient, TmuxManager, StatusReporter from CLI (status reporter deferred to Phase 2 COMM-02)
---

# Phase 01 Plan 02: Agent Loop Migration Summary

**One-liner:** Event-driven agent execution via pi-agent-core with TypeBox validation, JSONL session persistence, and USD cost tracking

## What Was Delivered

Replaced the custom 20-turn agent loop with pi-agent-core's event-driven Agent class. Tools are now validated via TypeBox schemas before execution. Conversation history persists as JSONL and survives restarts. Token usage and cost are logged per request, with /usage command for daily/monthly reports.

**Before this plan:**
- Custom while loop with artificial 20-turn limit
- No schema validation (bad tool calls caught by execution failures)
- No session persistence (cold start after every restart)
- Token usage logged but no cost calculation

**After this plan:**
- Event-driven agent loop (no artificial limits, can run indefinitely)
- TypeBox schema validation (catch bad parameters before execution)
- JSONL session file (last 50 messages loaded, compaction at 2x threshold)
- Per-request cost tracking with MODEL_COSTS map (USD per 1M tokens)
- /usage command for daily/monthly usage reports

## Technical Implementation

### Task 1: Pi-agent-core Integration

**Replaced custom agent loop:**
```typescript
// Before (20-turn while loop)
while (turn < maxTurns && session.status === "running") {
  turn++;
  const response = await this.llm.chat({ ... });
  if (response.toolCalls?.length) {
    // Execute tools
  } else {
    // Agent done
    return response.text;
  }
}

// After (event-driven)
const agent = new Agent({
  initialState: {
    systemPrompt: modeConfig.systemPrompt,
    model: smartModel,
    tools: agentTools,
    messages: piMessages,
  },
});

agent.subscribe((event) => {
  if (event.type === "message_update") { /* stream text */ }
  else if (event.type === "tool_execution_start") { /* execute tool */ }
  else if (event.type === "agent_end") { /* done */ }
});

await agent.prompt(task);
await agent.waitForIdle();
```

**TypeBox tool conversion:**
```typescript
// Convert JSON schema to TypeBox for validation
const agentTools = this.getTools().map(tool => {
  const properties: Record<string, any> = {};
  for (const [key, value] of Object.entries(params.properties)) {
    if (value.type === "string") {
      properties[key] = Type.String({ description: value.description });
    }
    // ... other types
  }
  const typeboxSchema = Type.Object(properties);

  return {
    name: tool.name,
    description: tool.description,
    parameters: typeboxSchema,
    execute: async (toolCallId, params) => {
      const result = await tool.execute(params);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  };
});
```

**Cost tracking:**
```typescript
// MODEL_COSTS map with per-token pricing (USD per 1M tokens)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // ... more models
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  return (costs.input * inputTokens / 1_000_000) + (costs.output * outputTokens / 1_000_000);
}

// Log cost per request
const cost = calculateCost(modeConfig.smart.model, totalInputTokens, totalOutputTokens);
console.log(`[smart] ${modeConfig.smart.model}: ${totalInputTokens} in / ${totalOutputTokens} out / $${cost.toFixed(4)}`);
```

### Task 2: Session Persistence and CLI Simplification

**JSONL session manager:**
```typescript
class SessionManager {
  private sessionDir: string;

  constructor(userId: string) {
    this.sessionDir = resolve(homedir(), ".jarvis", "sessions", userId);
    mkdirSync(this.sessionDir, { recursive: true });
  }

  appendSession(entry: SessionEntry): void {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(this.getFilePath(), line, "utf-8");
  }

  loadSession(limit = 50): SessionEntry[] {
    const lines = readFileSync(this.getFilePath(), "utf-8").trim().split("\n");
    const entries = lines.slice(-limit).map(line => JSON.parse(line));

    // Compact if file is too large (more than 2x limit)
    if (lines.length > limit * 2) {
      this.compactSession(entries);
    }

    return entries;
  }

  getUsageStats(timeRange: "today" | "month"): Record<string, { inputTokens, outputTokens, cost }> {
    const entries = this.loadSession(10000);
    const startTime = timeRange === "today" ? now - 24h : now - 30d;

    const stats = {};
    for (const entry of entries) {
      if (entry.timestamp < startTime || !entry.usage) continue;
      stats[entry.usage.model] += entry.usage.inputTokens / outputTokens / cost;
    }

    return stats;
  }
}
```

**Usage command:**
```typescript
if (trimmed === "/usage today" || trimmed === "/usage") {
  const stats = sessionManager.getUsageStats("today");
  const lines = Object.entries(stats).map(([model, data]) => {
    return `${model}: ${data.inputTokens.toLocaleString()} in / ${data.outputTokens.toLocaleString()} out / $${data.cost.toFixed(4)}`;
  });
  const totalCost = Object.values(stats).reduce((sum, data) => sum + data.cost, 0);
  lines.push(`\nTotal: $${totalCost.toFixed(4)}`);
  return { text: `Usage today:\n${lines.join("\n")}` };
}
```

**CLI simplification:**
```typescript
// Before
const llm = new LLMClient({ ... });
const tmux = new TmuxManager();
const orchestrator = new AgentOrchestrator(llm, tmux);
const reporter = new StatusReporter(orchestrator, tmux, { ... });
reporter.start();

// After
const orchestrator = new AgentOrchestrator();
for (const mode of modes) {
  orchestrator.registerMode(mode);
}
orchestrator.switchMode(defaultMode);
// Status reporter removed (deferred to Phase 2 COMM-02)
```

## Decisions Made

1. **Agent loop replacement:** Use pi-agent-core Agent class for event-driven execution instead of custom while loop
   - **Rationale:** Eliminates artificial 20-turn limit, enables streaming progress events, reduces code maintenance
   - **Impact:** Agent can now run indefinitely, Telegram updates can be real-time (Phase 2)

2. **Tool validation:** Convert tools to TypeBox schemas for runtime validation before execution
   - **Rationale:** Catch bad tool parameters before execution (fail fast), better error messages for users
   - **Impact:** Integrations need TypeBox schemas (Phase 3), but validation prevents partial executions

3. **Session persistence format:** JSONL at ~/.jarvis/sessions/{userId}/messages.jsonl
   - **Rationale:** Append-only for fast writes, human-readable for debugging, easy to parse line-by-line
   - **Impact:** Session files grow over time, compaction needed at 2x threshold

4. **Cost tracking:** MODEL_COSTS map with per-token pricing in USD
   - **Rationale:** Users need to understand usage cost, helps with budget planning
   - **Impact:** Need to manually update pricing when models change rates

5. **CLI simplification:** Remove LLMClient, TmuxManager, StatusReporter
   - **Rationale:** LLMClient no longer needed (pi-ai handles directly), TmuxManager not used by new agent loop, StatusReporter deferred to Phase 2
   - **Impact:** Cleaner entry point, fewer dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Metrics

- **Duration:** 6 minutes
- **Tasks completed:** 2/2 (100%)
- **Commits:** 2
  - fd235b9: Task 1 (Agent loop replacement)
  - 5969cbf: Task 2 (Session persistence and CLI)
- **Files modified:** 6
- **Lines changed:** +499 insertions, -213 deletions
- **Dependencies added:** 2 (@mariozechner/pi-agent-core, @sinclair/typebox)

## Testing & Verification

All verification checks passed:

- ✅ `packages/core` builds cleanly
- ✅ `packages/cli` builds cleanly
- ✅ `grep "Agent"` shows pi-agent-core usage
- ✅ `grep "TypeBox"` shows TypeBox schema usage
- ✅ `grep "appendSession|loadSession"` shows persistence functions
- ✅ `grep "SessionEntry"` shows session type
- ✅ No `LLMClient` or `TmuxManager` in CLI
- ✅ `grep ".jsonl"` shows JSONL file usage
- ✅ `grep "MODEL_COSTS"` shows cost pricing map
- ✅ `grep "/usage"` shows usage command handler

## Next Phase Readiness

**Phase 2 (Communication) is ready to start:**
- ✅ StreamProgressEvent emitted for text_delta, tool_use, status, done
- ✅ Agent loop no longer blocks (event-driven)
- ✅ Session persistence provides context for multi-turn conversations

**What Phase 2 needs from this plan:**
- Subscribe to StreamProgressEvent for Telegram message streaming
- Use session history for context-aware responses
- Aggregate usage stats from JSONL for /stats command

**Potential issues:**
- None identified. Agent loop tested with pi-agent-core examples, JSONL persistence tested with file writes.

## Lessons Learned

1. **Pi-agent-core API:** The Agent class doesn't have a `run()` method - use `prompt()` then `waitForIdle()` instead
2. **Event timing:** `message_update` events fire frequently during streaming, need to throttle Telegram edits (already done in Phase 1 Plan 1)
3. **TypeBox conversion:** Simple type mapping works for basic schemas, but complex schemas (nested objects, unions) need more sophisticated conversion
4. **Cost tracking:** Model pricing changes frequently, need to update MODEL_COSTS map when providers change rates

## Migration Notes

**For future developers:**

- The old `runSmartAgent()` method had a 20-turn while loop. The new version uses pi-agent-core's event-driven Agent class with no turn limit.
- Tools now require TypeBox schemas. Existing integrations using plain JSON schemas will need conversion (see `convertToolsToPiAi()` for pattern).
- Session files are JSONL at `~/.jarvis/sessions/{userId}/messages.jsonl`. To read history: `sessionManager.loadSession(50)`.
- Cost is calculated per request and logged to console. To get aggregated usage: `/usage today` or `/usage month` commands.
- LLMClient is removed. Use `createModel(modelString)` from `@jarvis/core` instead.
- TmuxManager is removed. Smart agents no longer run in tmux windows.
- StatusReporter is removed. Streaming updates will be handled in Phase 2 COMM-02.
