# Pitfalls Research

**Domain:** Adding persistent memory, identity systems, and HTTP tool APIs to existing AI assistant
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH

Research focused on integration pitfalls when adding these features to a working TypeScript agent (jarvis) built on Claude Code SDK, with existing JSONL sessions, preferences, and multi-surface architecture.

## Critical Pitfalls

### Pitfall 1: Memory Contradiction Accumulation

**What goes wrong:**
Naive persistent memory systems drown in contradictions as reality changes over time. The system retrieves "User prefers coffee" alongside "User stopped drinking coffee" with no way to resolve which is current. Semantic search returns both, agent gets confused, and users lose trust as the assistant cites outdated facts.

**Why it happens:**
Vector embeddings treat each memory independently—similarity search doesn't understand temporal relationships or supersession. Without explicit conflict resolution, old memories persist forever with equal weight to new ones.

**How to avoid:**
- Implement memory conflict resolution before semantic search goes live
- Track memory timestamps and recency weighting
- Use graph memory or explicit relationship tracking to link superseding memories
- Design memory consolidation to extract durable facts ("Acme Corp is in Room 105") and flag ephemeral state ("User is currently in Room 105")
- Pre-compaction flush should include conflict detection prompts

**Warning signs:**
- User corrections not reflected in subsequent retrievals
- Agent citing information user explicitly said changed
- Multiple contradictory memories retrieved for same query
- Memory search returning "User likes X" and "User dislikes X" simultaneously

**Phase to address:**
Phase 1 (Memory Foundation) must include conflict resolution strategy—not a later enhancement. OpenClaw-style pre-compaction flush helps but isn't sufficient alone.

---

### Pitfall 2: SOUL.md Prompt Injection Backdoor

**What goes wrong:**
SOUL.md is loaded into every system prompt, making it the highest-value target for attackers. Researchers demonstrated that attackers can modify SOUL.md to introduce long-term behavioral changes that persist across restarts. In the proof of concept, OpenClaw was instructed to create a scheduled task that periodically re-injects attacker-controlled logic into SOUL.md—a durable listener surviving even if the chat integration is removed.

**Why it happens:**
SOUL.md must be writable by the agent for self-evolution features (personality drift, learning boundaries), creating a write surface. The agent treats SOUL.md content as trusted instructions, not user input. Jarvis already has cron scheduling and self-configuration tools—the exact capabilities exploited in the attack.

**How to avoid:**
- NEVER allow agent to write SOUL.md directly—only through confirmed, audited operations
- Implement SOUL.md integrity checks on load (checksum, signature, git commit verification)
- Separate read-only identity (IDENTITY.md) from evolvable persona (PERSONA.md)
- Log all SOUL.md modifications with git commits for audit trail (jarvis already does best-effort git)
- Require explicit user confirmation for personality changes
- Sandbox agent tool execution—no access to systemd, cron re-registration, or SOUL.md path
- Consider SOUL.md immutable at runtime, editable only through CLI or manual process

**Warning signs:**
- Agent suggesting modifications to its own identity unprompted
- SOUL.md git history showing changes not initiated by user
- Agent requesting file system access to workspace root
- Scheduled tasks writing to workspace files
- Agent behavior drift not matching documented personality

**Phase to address:**
Phase 2 (Identity System) MUST address security before shipping. This is a known vulnerability with published exploits—not a theoretical risk.

---

### Pitfall 3: Context Window Budget Blowout

**What goes wrong:**
System prompt overhead balloons as you add SOUL.md (500-2k tokens), memory search results (1k-5k tokens), and tool definitions (2k-10k tokens). Production agents often carry extensive system prompts that repeat with every API call. Context allocation becomes a zero-sum game—more retrieved memories mean less conversation history. Without explicit budget allocation, you hit token limits mid-conversation or degrade performance as retrieval fills the window.

**Why it happens:**
Each component (soul, memory, tools, conversation) competes for context budget. Developers add features without tracking cumulative token usage. Claude Code SDK has built-in system prompt overhead—adding to it compounds the problem. Multi-million-token windows (2026) create false confidence that budget doesn't matter.

**How to avoid:**
- Measure baseline context usage FIRST: Claude Code system prompt + tool definitions + typical conversation
- Define explicit budget allocation: system (20%), soul (5%), memory (15%), tools (10%), conversation (50%)
- Implement dynamic allocation—simple queries reduce memory budget, complex queries increase it
- Truncate memory search results to fit budget, not just "top 10"
- Use pre-compaction flush to maintain conversation continuity without bloating context
- Monitor token usage per request in production
- Cache tool definitions client-side if Claude Code SDK allows (verify in Phase 3)

**Warning signs:**
- Requests failing with token limit errors
- Agent forgetting conversation context mid-session
- Memory search returning too many results
- System prompt approaching 10k+ tokens
- Latency increasing as conversation progresses
- Agent truncating responses unexpectedly

**Phase to address:**
Phase 1 (Memory Foundation) must define and enforce budget from day one. Retrofitting budget limits after memory is live requires painful rewrites.

---

### Pitfall 4: Embedding Cost Spiral

**What goes wrong:**
Naively embedding every message and memory operation causes costs to spiral. At scale, embedding generation becomes the primary cost driver—not LLM inference. Systems fail to batch embeddings, use rate-limited providers causing cascading bot failures, or embed duplicate content repeatedly.

**Why it happens:**
Developers treat embeddings as "free background operation" without measuring cost. Not batching requests wastes API calls. Not caching embeddings for identical content (preferences, SOUL.md) causes redundant processing. Rate limits on embedding providers (OpenAI) cascade to agent failures.

**How to avoid:**
- Use cost-effective embedding models: text-embedding-3-small ($0.02/$0.01 per 1M tokens) not ada-002
- Batch embedding generation whenever possible (50% cost savings with batch API for non-real-time)
- Cache embeddings for static content (SOUL.md, preferences, archived memories)
- Consider local embedding models for privacy and cost (sentence-transformers, ~1.1GB memory for BERT-base)
- Quantize to FP8 for 50%+ throughput gain with >99% similarity retention
- Only embed content destined for search—not ephemeral state
- Implement embedding budget tracking separate from LLM budget

**Warning signs:**
- Embedding API costs exceeding LLM costs
- Rate limit errors from embedding provider
- Identical content embedded multiple times
- Every user message triggers embedding generation
- No caching strategy for static content
- Memory search latency dominated by embedding time

**Phase to address:**
Phase 1 (Memory Foundation) must define embedding strategy. Phase 4 (Optimization) should add caching, batching, local models.

---

### Pitfall 5: Vector Index Corruption Without Recovery

**What goes wrong:**
ChromaDB SQLite-backed index becomes corrupted during unclean shutdown, disk failure, or concurrent access. Recovery requires technical debugging—dropping UUID directories, reindexing from WAL. Users lose all memory, agent becomes amnesiac. Index corruption is often silent until retrieval returns garbage or crashes.

**Why it happens:**
ChromaDB uses SQLite + binary HNSW index files (header.bin, link_lists.bin, data_level0.bin). Unclean shutdown during write leaves index inconsistent. Multiple processes accessing same collection concurrently violate SQLite locking. No automated corruption detection or recovery.

**How to avoid:**
- Implement graceful shutdown handlers for jarvis gateway + agent services
- Single-writer access pattern—only one process modifies collections
- Regular index integrity checks on startup (query small dataset, catch errors)
- Automated recovery: detect corruption → delete binary index → trigger reindex from WAL
- Keep embeddings in separate durable store (JSONL, SQLite table) so reindex is fast
- Regular backups of chroma.sqlite3 and collection data
- Monitor ChromaDB logs for corruption indicators
- Test recovery procedure in development (kill -9 during write)

**Warning signs:**
- sqlite3.OperationalError on queries
- Empty search results for known memories
- ChromaDB process crashes on collection access
- HNSW index files with mismatched timestamps
- WAL file growing without being checkpointed
- Permission errors on collection directories

**Phase to address:**
Phase 1 (Memory Foundation) must include recovery procedure and integrity checks. Don't wait for production corruption to discover you have no recovery path.

---

### Pitfall 6: HTTP Tool API Authentication Bypass

**What goes wrong:**
Adding an HTTP tool invoke endpoint without proper authentication creates an open RPC endpoint. Anyone on the network can invoke tools as the agent—send emails, modify Linear issues, execute code, read files. Combined with jarvis's Tailscale deployment, this means anyone with Tailscale access can control the agent.

**Why it happens:**
Developers focus on "make it work" before security. HTTP endpoint is easier to test without auth. Assuming network isolation (Tailscale) is sufficient security. Not realizing that tool execution has full agent privileges.

**How to avoid:**
- Require authentication on tool invoke endpoint from day one—no "add later"
- Options: API key (simple, rotate regularly), JWT (better, per-surface tokens), mTLS (best, certificate-based)
- Separate auth for each surface (Telegram, iOS, CLI)—token compromise doesn't expose all surfaces
- Rate limiting per client to prevent abuse
- Audit log of tool invocations with surface identity
- Principle of least privilege—tools declare required permissions, surfaces get subset
- Never rely solely on network isolation for security

**Warning signs:**
- Tool endpoint accessible without credentials
- Same API key used across all surfaces
- No rate limiting on tool invocations
- No audit trail of who invoked what
- Tool permissions not scoped per surface
- "Works without auth" in development

**Phase to address:**
Phase 3 (Tool API) must implement authentication before exposing HTTP endpoint. Security is not a Phase 4 optimization.

---

### Pitfall 7: Concurrent Tool Execution State Corruption

**What goes wrong:**
Multiple surfaces (Telegram + iOS + CLI) invoking tools concurrently creates race conditions. Two surfaces read preferences simultaneously, both modify, both write—last write wins, one update lost. Concurrent Gmail tool calls cause OAuth token refresh race condition—both request new tokens, one expires, calls fail. Shared state (session files, preferences, memory) corrupts under concurrent writes.

**Why it happens:**
Tools assume single-threaded execution. File-based state (JSONL, JSON preferences) doesn't handle concurrent writes atomically. HTTP/2 allows concurrent requests that developers didn't design for. OAuth token refresh isn't idempotent or concurrency-safe.

**How to avoid:**
- Use write-file-atomic npm package for all file writes (temp file + atomic rename)
- Implement distributed locks for critical sections (Redis, file locks, or simple filesystem lock files)
- Make tools idempotent where possible—same request yields same result
- OAuth token refresh: implement refresh lock with check-lock-refresh pattern
- Database-level concurrency controls if adding SQLite for preferences
- Request queuing for tools that can't handle concurrency (serialize Gmail operations)
- Test with concurrent requests in development—don't discover in production

**Warning signs:**
- Lost preference updates
- OAuth errors about invalid tokens
- Duplicate tool executions
- File corruption in session logs
- Race condition errors in logs
- Inconsistent state after concurrent operations
- EXDEV errors when temp file on different filesystem

**Phase to address:**
Phase 3 (Tool API) must address concurrency before multiple surfaces share the endpoint. Test with parallel requests from day one.

---

### Pitfall 8: JSONL Session Migration Data Loss

**What goes wrong:**
Migrating from v1.0 JSONL sessions to v2.0 workspace structure without backward compatibility causes history loss. Users lose context from previous conversations. Session resumption breaks. Preferences disappear. Agent becomes amnesiac about past interactions.

**Why it happens:**
New workspace structure (~/.jarvis/workspace/) uses different paths and formats than v1.0 sessions. Code assumes new format, doesn't check for legacy files. No migration script from JSONL to new memory structure. Developers test with clean workspace, don't discover migration issues until production upgrade.

**How to avoid:**
- Detect legacy session files on first v2.0 startup
- Automated migration: JSONL sessions → MEMORY.md + daily logs
- Keep JSONL sessions in parallel during migration window (dual write)
- Preferences migration: ensure keys map correctly to new structure
- Version detection in workspace (WORKSPACE_VERSION file)
- Rollback support: v2.0 → v1.0 shouldn't lose data
- Test migration with real v1.0 data, not just fresh installs
- Document migration procedure for manual recovery if automated fails

**Warning signs:**
- v2.0 startup doesn't see v1.0 preferences
- Conversation history disappears after upgrade
- Agent doesn't remember previous sessions
- No migration log or status
- Fresh workspace behavior on existing installation
- Preferences reset to defaults

**Phase to address:**
Phase 1 (Memory Foundation) must include migration from v1.0 JSONL. Don't break working system.

---

### Pitfall 9: Memory Search Retrieving Wrong Context

**What goes wrong:**
Semantic search retrieves "similar" memories that are contextually wrong. User asks about "current project status" and gets memories from 3 projects ago. Agent cites outdated information confidently. Similarity-based retrieval doesn't understand recency, relevance, or context boundaries.

**Why it happens:**
Vector search optimizes for similarity, not relevance. Embeddings treat all memories equally—no recency bias, no project scope, no user correction tracking. Retrieval doesn't understand conversation context—queries embedded without surrounding conversation.

**How to avoid:**
- Metadata filtering: tag memories with project, date, type, user-corrected flag
- Recency weighting: boost recent memories in ranking
- Hybrid search: BM25 keyword + vector similarity using Reciprocal Rank Fusion (RRF)
- Query expansion: embed user query with conversation context, not just the question
- User correction tracking: mark memories as superseded/outdated
- Relevance feedback: track which memories lead to useful responses vs. ignored
- Scoped retrieval: "current project" filter before semantic search

**Warning signs:**
- Agent citing information from wrong time period or project
- User frequently correcting retrieved context
- Memories from different domains mixed in results
- Recency not reflected in search results
- No way to scope search to specific categories
- BM25 and vector scores on completely different scales (unbounded vs. [0,2])

**Phase to address:**
Phase 1 (Memory Foundation) needs metadata schema and filtering. Phase 2 (Identity) adds scoping. Phase 4 (Optimization) implements hybrid search.

---

### Pitfall 10: Soul Personality Drift Without Tracking

**What goes wrong:**
SOUL.md evolves over time through small edits, gradually drifting from intended personality. Agent becomes inconsistent—different behavior in different sessions. No audit trail of personality changes. No way to revert to "known good" identity. Users can't trust agent behavior consistency.

**Why it happens:**
SOUL.md treated as mutable configuration, not versioned artifact. No change tracking or diff visibility. Incremental changes seem small but accumulate. Agent self-modification without user visibility. No baseline or testing for personality consistency.

**How to avoid:**
- Git commit every SOUL.md change with descriptive message (jarvis already does best-effort git)
- Periodic SOUL.md snapshots with dates (SOUL-2026-02-12.md backups)
- Drift detection: compare current SOUL.md to baseline, flag significant changes
- User review of personality changes: show diff before applying
- Rollback command: restore previous SOUL.md version
- Personality testing: standard scenarios that should yield consistent responses
- Separate stable identity (IDENTITY.md immutable) from evolvable persona (PERSONA.md tracked)

**Warning signs:**
- Agent behavior inconsistent across sessions
- SOUL.md modified without user knowledge
- No git history or timestamps on identity changes
- Can't explain why behavior changed
- No way to revert to previous personality
- Agent contradicting stated values or boundaries

**Phase to address:**
Phase 2 (Identity System) must implement change tracking and version control for SOUL.md. Don't ship mutable identity without auditability.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No embedding cache | Simpler code, no cache invalidation | 10x cost increase at scale, rate limit issues | MVP only, add in Phase 4 |
| Single global auth token | Easy to implement, works quickly | Token compromise exposes all surfaces, no per-surface revocation | Never—implement proper auth in Phase 3 |
| No memory conflict resolution | Simpler retrieval logic | User trust erosion, contradictory responses | Never—conflicts appear immediately |
| Skip migration script | Faster v2.0 development | Data loss on upgrade, user frustration | Never—v1.0 data has value |
| No context budget tracking | Add features without limits | Runtime failures, degraded performance | Early prototyping, track by Phase 1 end |
| File writes without atomic pattern | Standard fs.writeFile works | Corruption under concurrent access, race conditions | Never in multi-surface architecture |
| Vector-only search (no BM25) | One less system to integrate | Poor retrieval for keyword queries | Acceptable initially, add hybrid in Phase 4 |
| SOUL.md without git tracking | Simpler file management | No audit trail, security risk, drift blindness | Never—git tracking is critical |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ChromaDB | Not handling index corruption, no recovery procedure | Integrity checks on startup, automated reindex from WAL, corruption detection |
| Claude Code SDK | Assuming system prompt budget is unlimited, not measuring overhead | Measure baseline tokens, define allocation budget per component, track usage |
| Embedding API | Embedding every message, no batching, no caching | Batch requests, cache static content, use cost-effective models, local for privacy |
| OAuth (Gmail) | Token refresh race conditions with concurrent requests | Implement refresh lock, check-lock-refresh pattern, serialize refresh operations |
| File system (JSONL, preferences) | Using fs.writeFile directly, no atomicity | write-file-atomic package, temp file + atomic rename, same filesystem only |
| SOUL.md loading | Trusting file content as safe, no integrity check | Checksum verification, git commit tracking, separate read-only vs. evolvable |
| Memory retrieval | Pure vector similarity, no context filtering | Metadata filtering, recency weighting, hybrid BM25 + vector, query with context |
| Tool API | No authentication, relying on network isolation | API key/JWT/mTLS auth, rate limiting, per-surface tokens, audit logging |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Linear memory scan without index | All memories loaded and filtered in memory | Use vector index + metadata filtering from day one | >1000 memories (~1 week of active use) |
| Embedding on read path | High latency on memory queries | Embed on write, cache embeddings, batch generation | >100 queries/day |
| No context budget enforcement | Token limit errors, truncated responses | Define and enforce budget, dynamic allocation | Conversation >10 turns or memory >50 results |
| Single-threaded tool queue | Slow multi-surface response, timeouts | Concurrent execution with proper locking for shared state | >2 active surfaces |
| Full memory reindex on corruption | Minutes of downtime | Incremental reindex from WAL, keep embeddings separate | Index >10k vectors |
| BM25 index rebuild on every search | Search latency increases with corpus | Build index once, update incrementally, persist to disk | >5k documents |
| No memory compaction | Context window fills, can't fit conversation | Pre-compaction flush, periodic consolidation, ephemeral vs. durable | >50k tokens in memory |
| Synchronous embedding generation | Tool calls block on embedding | Async embedding with queue, batch processing | >10 memories/day |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Agent can modify SOUL.md directly | Persistent backdoor, behavioral compromise, scheduled re-infection | Read-only SOUL.md, user-confirmed changes only, git integrity checks |
| Tool API without authentication | Unauthorized tool execution, data exfiltration, service abuse | API key/JWT minimum, per-surface tokens, rate limiting, audit log |
| Embedding API keys in memory/logs | API key leakage, cost abuse, service compromise | Sanitize logs, use environment variables, rotate keys regularly |
| No tool permission scoping | Tool compromise exposes all capabilities | Least privilege per surface, tool permission declarations, user approval for sensitive |
| User input in memory without sanitization | Prompt injection via memory retrieval, behavior manipulation | Sanitize before storing, flag user content in metadata, validate on retrieval |
| OAuth tokens in plaintext files | Token theft, account compromise | Encrypt at rest, use system keychain, rotate regularly, refresh on boot |
| No audit trail for agent actions | Can't detect compromise, no accountability | Log tool invocations, SOUL.md changes, memory writes with surface identity |
| Cron + self-config tools unrestricted | Scheduled backdoor persistence, unauthorized scheduling | Require confirmation, no self-modification, audit cron changes, sandbox tool execution |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent memory storage | User doesn't know what's remembered, privacy concern | Explicit memory confirmations, "I'll remember that..." feedback, memory listing command |
| No way to forget | Can't remove embarrassing/wrong memories | /forget command, memory editing UI, expiration for ephemeral facts |
| Contradictory memory retrieval | Agent cites old + new info, confuses user | Conflict resolution, show recency in citations, "this supersedes..." |
| Personality drift without notice | Behavior changes unexpectedly, trust loss | Change notifications, "my personality was updated" message, rollback option |
| Memory search failures invisible | Wrong context used, no explanation why | Show retrieved memories, "based on..." attribution, confidence scores |
| No migration feedback | Data loss feels like bug, frustration | "Migrating v1.0 sessions..." progress, success confirmation, rollback if fails |
| Tool API errors opaque | "Something went wrong" without context | Surface-specific error messages, retry suggestions, tool status visibility |
| Pre-compaction without warning | Context disappears, conversation continuity breaks | "Consolidating memory..." notice, seamless transition, no mid-sentence compaction |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Memory search:** Vector retrieval works but missing conflict resolution, recency weighting, metadata filtering
- [ ] **SOUL.md loading:** File loads into prompt but missing integrity checks, injection prevention, change tracking
- [ ] **Tool API:** HTTP endpoint responds but missing authentication, rate limiting, concurrent execution handling
- [ ] **Embedding generation:** Creates vectors but missing batching, caching, cost tracking, error handling
- [ ] **ChromaDB integration:** Stores/retrieves but missing corruption detection, recovery procedure, integrity checks
- [ ] **Session migration:** New format works but missing v1.0 import, backward compatibility, rollback support
- [ ] **Pre-compaction flush:** Triggers before compaction but missing conflict detection, ephemeral vs. durable distinction
- [ ] **Context budget:** Fits in window today but missing allocation tracking, dynamic adjustment, monitoring
- [ ] **Concurrent access:** Works with one surface but missing atomic writes, distributed locks, race condition testing
- [ ] **OAuth refresh:** Works sequentially but missing concurrency safety, token expiry handling, refresh lock

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ChromaDB index corruption | LOW | 1. Stop services 2. Delete UUID directory under collection 3. Restart—reindex from WAL 4. Verify with test query |
| SOUL.md injection | MEDIUM | 1. Git log SOUL.md 2. Identify malicious commit 3. Git revert to known-good 4. Audit cron jobs 5. Review agent logs 6. Rotate API keys |
| Memory contradictions | LOW-MEDIUM | 1. Export all memories 2. Manual conflict resolution 3. Mark superseded memories 4. Reimport with metadata 5. Deploy conflict resolution |
| Context budget blowout | LOW | 1. Measure current usage 2. Define budget allocation 3. Truncate memory results 4. Implement enforcement 5. Monitor |
| Embedding cost spiral | MEDIUM | 1. Audit embedding calls 2. Add caching layer 3. Batch pending embeddings 4. Switch to cheaper model 5. Consider local |
| OAuth token race condition | LOW | 1. Implement refresh lock 2. Serialize refresh operations 3. Add retry logic 4. Test concurrent refresh |
| Data loss from migration | HIGH | 1. Restore from backup 2. Write migration script 3. Test on copy 4. Migrate with rollback 5. Verify integrity |
| Tool API auth bypass | MEDIUM | 1. Disable endpoint 2. Implement auth 3. Rotate compromised tokens 4. Audit tool logs 5. Re-enable with auth |
| Concurrent write corruption | MEDIUM | 1. Restore from backup/git 2. Implement atomic writes 3. Add distributed locks 4. Test concurrency 5. Deploy |
| Personality drift | LOW | 1. Git diff SOUL.md 2. Review changes 3. Revert to baseline 4. Document intended personality 5. Add change tracking |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Memory contradiction accumulation | Phase 1: Memory Foundation | Test with updating preferences, verify recency weighting works |
| SOUL.md prompt injection | Phase 2: Identity System | Attempt to modify SOUL.md via prompt, verify rejection + git tracking |
| Context window budget blowout | Phase 1: Memory Foundation | Load max memory results + long conversation, verify stays under budget |
| Embedding cost spiral | Phase 1: Memory Foundation, optimize in Phase 4 | Track embedding costs for 1 week, verify batching + caching effective |
| Vector index corruption | Phase 1: Memory Foundation | Kill process during write, verify automated recovery |
| HTTP tool API authentication | Phase 3: Tool API | Attempt unauthenticated request, verify rejection + rate limiting |
| Concurrent tool execution state corruption | Phase 3: Tool API | Parallel requests from multiple surfaces, verify no data loss |
| JSONL session migration data loss | Phase 1: Memory Foundation | Test upgrade from v1.0 install, verify sessions + preferences preserved |
| Memory search retrieving wrong context | Phase 1: Memory Foundation, improve in Phase 4 | Query with multiple projects, verify metadata filtering works |
| Soul personality drift | Phase 2: Identity System | Modify SOUL.md several times, verify git history + rollback capability |

## Sources

**Memory System Research:**
- [How We Solved Memory Conflicts in Hindsight](https://hindsight.vectorize.io/blog/2026/02/09/resolving-memory-conflicts) - Memory contradiction handling
- [Graph Memory for AI Agents](https://mem0.ai/blog/graph-memory-solutions-ai-agents) - Vector vs. graph memory, relationship preservation
- [Why Most Chatbots Fail at Memory](https://deeflect.medium.com/why-most-chatbots-fail-at-memory-and-how-to-fix-it-cdc40d219fee) - Memory layer sync issues, contextually wrong retrieval
- [Clawdbot's Memory Architecture & Pre-Compaction Flush](https://medium.com/aimonks/clawdbots-memory-architecture-pre-compaction-flush-the-engineering-reality-behind-never-c8ff84a4a11a) - Pre-compaction flush implementation
- [Memory for AI Agents: A New Paradigm](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/) - Ephemeral vs. durable state distinction

**Identity & Security:**
- [OpenClaw or Open Door? Prompt Injection Creates AI Backdoors](https://www.esecurityplanet.com/threats/openclaw-or-open-door-prompt-injection-creates-ai-backdoors/) - SOUL.md prompt injection vulnerability
- [Agentic AI and Non-Human Identities](https://blog.gitguardian.com/nhicon-2026/) - Identity drift in agentic systems
- [How OpenClaw Implements Agent Identity](https://www.mmntm.net/articles/openclaw-identity-architecture) - Soul, persona, identity separation

**Context & Performance:**
- [Context Window Overflow in 2026](https://redis.io/blog/context-window-overflow/) - Context budget allocation challenges
- [Context Window Management](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) - Dynamic allocation strategies
- [Memory Blocks: The Key to Agentic Context Management](https://www.letta.com/blog/memory-blocks) - Persona block editing, stability vs. drift

**Embedding & Vector Search:**
- [OpenAI Embeddings API Pricing Calculator](https://costgoat.com/pricing/openai-embeddings) - Cost optimization strategies
- [Large-Scale AI Batch Inference: 9x Faster Embedding](https://blog.skypilot.co/large-scale-embedding/) - Batch processing benefits
- [Embeddings in Production: Costs to Embed](https://medium.com/barnacle-labs/embeddings-in-production-or-how-nothing-scales-like-youd-expect-it-to-part-1-costs-to-embed-a82482765215) - Production scaling issues
- [Recovering Data From A Corrupt SQLite Database](https://sqlite.org/recovery.html) - SQLite corruption recovery
- [Rebuilding Chroma DB](https://cookbook.chromadb.dev/strategies/rebuilding/) - ChromaDB index corruption recovery

**Tool API & Concurrency:**
- [Tool Calling Explained: The Core of AI Agents](https://composio.dev/blog/ai-agent-tool-calling-guide) - Tool API authentication best practices
- [Race Conditions in REST APIs](https://medium.com/@mgaurang123/race-conditions-in-rest-apis-a-developers-guide-to-building-reliable-systems-42d4f8eabc1e) - HTTP API race conditions
- [Refresh Token Race Condition](https://developers.apideck.com/guides/refresh-token-race-condition) - OAuth concurrent refresh issues
- [Node.js File System in Practice: Production-Grade Guide](https://thelinuxcode.com/nodejs-file-system-in-practice-a-production-grade-guide-for-2026/) - Atomic write patterns
- [write-file-atomic npm package](https://www.npmjs.com/package/write-file-atomic) - Atomic file operations

**Hybrid Search:**
- [A Comprehensive Hybrid Search Guide](https://www.elastic.co/what-is/hybrid-search) - BM25 + vector fusion challenges
- [Hybrid Search Revamped - Qdrant Query API](https://qdrant.tech/articles/hybrid-search/) - Reciprocal Rank Fusion (RRF) best practices
- [Hybrid Search: Combining BM25 and Semantic Search](https://medium.com/etoai/hybrid-search-combining-bm25-and-semantic-search-for-better-results-with-lan-1358038fe7e6) - Score normalization pitfalls

**Claude Code SDK:**
- [Modifying system prompts - Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/modifying-system-prompts) - Custom instruction injection mechanisms
- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts) - System prompt structure and overhead
- [ClaudeLog - How to Update System Prompt](https://claudelog.com/faqs/how-to-update-system-prompt/) - Append vs. custom prompt patterns

**Migration & Compatibility:**
- [Critical Bug: Session history lost after auto-update](https://github.com/anthropics/claude-code/issues/12114) - JSONL migration breaking changes
- [JSON Schema Compatibility Checker](https://github.com/json-schema-org/community/issues/984) - Backward compatibility detection

---
*Pitfalls research for: jarvis v2.0 Agent Architecture*
*Researched: 2026-02-12*
*Confidence: MEDIUM-HIGH (strong web search + official docs, verified with multiple sources)*
