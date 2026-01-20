# Research Guide (Exa Integration)

This file is only loaded when needed (progressive disclosure).

## When to Research

Research when you encounter:
- Unknown APIs or libraries
- Best practices questions
- Version-specific behavior
- Security considerations

## Using Exa MCP Tools

### Quick Answers (get_code_context_exa)

For straightforward questions with code context:

```
Tool: mcp__exa__get_code_context_exa
Query: "bcrypt password hashing node.js example"
```

**Tips:**
- Try 3 query variations before escalating
- Include language/framework in query
- Look for official documentation first

### Deep Research (deep_researcher)

For complex questions requiring synthesis:

```
# Start research
Tool: mcp__exa__deep_researcher_start
Query: "JWT refresh token rotation best practices 2024"

# Poll for completion
Tool: mcp__exa__deep_researcher_check
```

**Use sparingly** - this is expensive. Only for:
- Architectural decisions
- Security-critical implementations
- Novel problems without clear answers

## Caching Answers

Always cache research in `research.yaml`:

```yaml
- text: "Your research question"
  mode: answer
  answer: |
    The answer you found, formatted clearly.
    Include key points and code examples.
  citations:
    - url: https://source.com/article
      title: Article Title
```

This prevents re-researching the same questions.

## Escalation Path

1. **Try code search** (3 variations)
2. **Try deep research** (1 attempt)
3. **Document as blocked** if still stuck

```yaml
- name: The task
  status: blocked
  blockedReason: |
    Could not find documentation for X.
    Searched: "query 1", "query 2", "query 3"
    Deep research returned no relevant results.
    Need human input on approach.
```
