# Testing Patterns

**Analysis Date:** 2026-02-05

## Test Framework

**Runner:**
- Not detected - No test framework configured (no vitest.config.*, jest.config.*, or test dependencies)

**Assertion Library:**
- Not applicable - No testing framework present

**Run Commands:**
- No test commands configured in package.json scripts
- Only `build`, `type-check`, `clean`, and `dev` commands present

## Test File Organization

**Location:**
- No test files found in packages
- `find` search for `*.test.ts` and `*.spec.ts` returned no results in `/packages` directory
- Testing not implemented in this codebase

**Naming:**
- Not applicable

**Structure:**
- Not applicable

## Test Status

**Current State:**
- Zero test coverage
- No testing framework installed or configured
- No test utilities or fixtures present
- No mocking libraries

## Type Safety as Testing Strategy

**TypeScript Configuration:**
- `strict: true` enabled in `tsconfig.json` - acts as compile-time validation
- Explicit type annotations on all public APIs
- Type exports in `packages/core/src/index.ts` provide compile-time contracts
- `declaration: true` generates `.d.ts` files for type checking in dependents

**Type Coverage:**
- All function parameters typed: `(llm: LLMClient, tmux: TmuxManager)`
- All return types explicit: `async handleMessage(msg: Message): Promise<AgentResponse>`
- Interface definitions provide structure validation:
  - `ModelConfig` - type-safe LLM configuration
  - `Message` - type-safe message routing
  - `ToolDefinition` - type-safe tool parameter passing
  - `Channel` - type-safe channel interface with optional methods

## Manual Testing Approach

**Development Workflow:**
```bash
pnpm dev          # Start CLI with tsx live reload
pnpm build        # Compile TypeScript to dist/
pnpm type-check   # Run tsc --noEmit to validate types
```

**Integration Points for Manual Testing:**
- `packages/cli/src/index.ts` - Main entry point, loads config and initializes all components
- `packages/gateway/src/index.ts` - Routes messages through orchestrator
- `packages/core/src/agent.ts` - Core agent logic with delegation flow
- Environment configuration via `.env` file (see `.env.example`)

**Configuration-Based Testing:**
- Mode configuration in `config/personal.json` and `config/work.json`
- Different system prompts, model configurations (triage vs smart tier)
- Scheduler cron jobs in mode configs can be used to test recurring tasks

## Potential Test Targets (Not Implemented)

**Unit Test Candidates:**

1. **LLMClient** (`packages/core/src/llm.ts`):
   - Provider routing logic in `parseModel()`
   - Retry logic in `chat()` method
   - Response parsing for Anthropic, OpenAI, OpenRouter APIs
   - Tool call extraction from different response formats

2. **AgentOrchestrator** (`packages/core/src/agent.ts`):
   - Command parsing in `handleCommand()` (/mode, /sessions, /peek)
   - Delegation decision logic (DELEGATE: prefix detection)
   - Session management (create, track, retrieve)
   - Tool execution flow

3. **TmuxManager** (`packages/core/src/tmux.ts`):
   - Session creation and cleanup
   - Window management
   - Output capture (peek)
   - Process lifecycle

4. **Scheduler** (`packages/scheduler/src/index.ts`):
   - Cron validation and scheduling
   - Job execution and error handling
   - Job listing and removal

5. **Gateway** (`packages/gateway/src/index.ts`):
   - Message routing to correct mode
   - Error handling and fallback messages
   - Placeholder message editing flow
   - Broadcast messaging

**Integration Test Candidates:**

1. **Message Flow**: Message from channel → Gateway → AgentOrchestrator → Channels
2. **Delegation Flow**: Simple message → Triage → DELEGATE decision → Smart agent loop with tools
3. **Tool Execution**: Tool registration → Agent invocation → Result handling
4. **Cron Execution**: Scheduler fires → Message sent to orchestrator → Response handled
5. **Status Reporting**: Status updates emitted → Reporter sends via channels

## Coverage Gaps

**High Priority (Core Logic):**
- Agent delegation decision logic (no tests for DELEGATE: parsing)
- LLM provider retry logic (would catch regressions)
- Tool execution and error handling
- Session lifecycle management

**Medium Priority (Integration):**
- Channel message routing
- Mode switching
- Configuration loading

**Low Priority (Infrastructure):**
- Tmux wrapper commands (filesystem mocking complexity)
- Console logging output

## Recommendations for Implementation

**Phase 1: Framework Setup**
- Install test runner: `vitest` (lightweight, ESM-native) or `jest`
- Install assertion library: already have `typescript` and type checking
- Add test config file to each package

**Phase 2: Unit Tests**
- Start with pure functions: `parseModel()`, command parsing in `AgentOrchestrator`
- Mock external dependencies (fetch, LLM APIs, tmux commands)
- Test error paths and edge cases

**Phase 3: Integration Tests**
- Mock channels and integrations
- Test message flow through system
- Test delegation decision logic with mocked LLM responses

**Phase 4: CI/CD Integration**
- Add `test` script to each package.json
- Add `test:coverage` for coverage reporting
- Integrate into git pre-commit hooks

---

*Testing analysis: 2026-02-05*
