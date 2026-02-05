# Coding Conventions

**Analysis Date:** 2026-02-05

## Naming Patterns

**Files:**
- PascalCase for classes: `agent.ts`, `llm.ts`, `tmux.ts`, `gateway/index.ts`
- lowercase for utilities/services: `index.ts`
- No file extensions in imports (uses `.js` suffix for ESM compatibility)

**Functions:**
- camelCase for all functions and methods
- Private methods prefixed with underscore is NOT used; instead use `private` visibility modifier
- Async functions clearly indicate async intent with `async` keyword

**Variables:**
- camelCase for all variable names
- PascalCase for types and interfaces
- UPPERCASE for constants (e.g., `DELEGATION_SYSTEM_PROMPT`, `JARVIS_SESSION`)
- Abbreviated names used in imports: `msg` for Message, `err` for Error

**Types:**
- PascalCase for all interfaces and types
- Types used for unions/variants: `type ModelTier = "triage" | "smart"`
- Interfaces used for object structures with multiple fields
- Generic function types inline in interfaces: `execute: (params: Record<string, unknown>) => Promise<string>`

## Code Style

**Formatting:**
- No linting config detected (no .eslintrc or similar)
- No formatting config detected (no .prettierrc)
- Indentation appears to be 2 spaces (standard Node.js convention)
- Lines appear to follow no strict length limit

**Linting:**
- TypeScript strict mode enabled in `tsconfig.json`
- `esModuleInterop: true` for SDK imports
- No ESLint/Prettier configuration found
- No pre-commit hooks or lint commands in package.json scripts

## Import Organization

**Order:**
1. Node.js built-in imports (using `node:` prefix): `import { randomUUID } from "node:crypto"`
2. Third-party SDK/library imports: `import Anthropic from "@anthropic-ai/sdk"`
3. Relative imports from local packages: `import { LLMClient } from "./llm.js"`
4. Type imports: `import type { ModelConfig } from "./types.js"`

**Path Aliases:**
- Workspace packages use path prefixes: `@jarvis/core`, `@jarvis/gateway`, `@jarvis/scheduler`
- Relative paths use `.js` extension for ESM: `import { LLMClient } from "./llm.js"`
- Deep imports from local packages included in exports: `export { AgentOrchestrator } from "./agent.js"`

## Error Handling

**Patterns:**
- Throw Error with descriptive message: `throw new Error(\`Unsupported provider: \${provider}\`)`
- Try-catch blocks around external calls (LLM, tmux commands, channel operations)
- Fallback/default returns for missing values: `??` nullish coalescing operator
- Optional method returns: `switchMode()` returns `ModeConfig | null`
- Errors logged via console with context prefix: `console.error(\`[gateway] Error processing message: \${errorMsg}\`)`

**Error Context:**
- Console logs use `[module-name]` prefix for context: `[llm]`, `[gateway]`, `[scheduler]`
- Transient errors (network) handled with retry logic in `LLMClient.chat()`
- Non-retryable errors thrown immediately

## Logging

**Framework:** console (native Node.js)

**Patterns:**
- `console.log()` for informational messages
- `console.warn()` for non-critical issues (missing config, transient errors)
- `console.error()` for fatal/important errors
- Context prefix in brackets: `console.log("[gateway] message")`
- Error details included: `console.error(\`[scheduler] failed:\`, err instanceof Error ? err.message : err)`
- Truncated long strings for readability: `msg.text.slice(0, 100)`, `response.text.slice(0, 200)`

## Comments

**When to Comment:**
- JSDoc comments for public methods and exported functions
- Inline comments for non-obvious logic (especially in agent delegation flow)
- Comments on long utility functions explaining steps

**JSDoc/TSDoc:**
- Used sparingly; types are generally self-documenting
- Block comments for class-level purpose: see `Gateway` class
- Single-line comments for complex logic steps

Example from codebase:
```typescript
/**
 * The Gateway routes incoming messages from channels to the agent orchestrator,
 * manages mode context, and routes responses back to the originating channel.
 */
export class Gateway {
```

## Function Design

**Size:** Functions range from 5-30 lines; larger functions (50+ lines) decomposed into private helpers
- `handleMessage()` in `AgentOrchestrator` delegates to `delegateToSmart()` and `runSmartAgent()`
- `chat()` in `LLMClient` delegates to provider-specific methods: `chatAnthropic()`, `chatOpenAI()`, `chatOpenRouter()`

**Parameters:**
- Request objects used for multiple related parameters: `LLMRequest`, `GatewayConfig`
- Optional callbacks passed explicitly: `onProgress?: (status: string) => void`
- Configuration objects passed as second parameter to constructors
- Type-safe parameter objects preferred over varargs

**Return Values:**
- Async functions always return `Promise<T>`
- Explicit return types on all public methods
- Nullable returns typed as `T | null` or `T | undefined`
- Union types for conditional returns: `AgentResponse | null`

## Module Design

**Exports:**
- `index.ts` files re-export public API: see `packages/core/src/index.ts`
- Type exports separate from value exports: `export type { ... }` vs `export { ... }`
- Single class per module (except `index.ts` which re-exports)

**Barrel Files:**
- Used in `packages/core/src/index.ts` to aggregate exports
- Pattern: `export { ClassName } from "./file.js"`
- Type-only exports: `export type { TypeName } from "./file.js"`

## API Boundaries

**Interface Segregation:**
- Channels implement `Channel` interface with optional methods: `sendTyping?`, `sendPlaceholder?`, `editMessage?`
- Integrations implement `Integration` interface: `name`, `tools`, `initialize()`, `shutdown()`
- Tool definitions: `ToolDefinition` interface with `name`, `description`, `parameters`, `execute()`

**Dependency Injection:**
- Classes accept dependencies in constructor: `constructor(llm: LLMClient, tmux: TmuxManager)`
- Configuration passed as objects: `constructor(config: GatewayConfig)`
- Handler callbacks set via methods: `setStatusHandler(handler: (update: StatusUpdate) => void)`

---

*Convention analysis: 2026-02-05*
