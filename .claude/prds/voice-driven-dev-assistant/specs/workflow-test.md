# Full Workflow Test

## Objective

Test the complete voice → Claude Code → voice summary workflow end-to-end.

Expected outcome:
- All components connected
- Full flow works manually tested
- Key scenarios documented

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: All other tasks
- **Dependents**: None

## Acceptance Criteria

- [ ] Voice input triggers Claude Code investigation
- [ ] Progress displays during execution
- [ ] Voice summary speaks on completion
- [ ] Text input fallback works
- [ ] Cancel operation works

## Test Scenarios

1. **Basic investigation**: "What does the main function do?"
2. **Planning**: "Plan how to add a dark mode feature"
3. **Execution**: "Add a comment to the README"
4. **Interruption**: Start task, then say "cancel"
5. **Text fallback**: Type a request instead of speaking

## Out of Scope

- Automated E2E tests
- Performance benchmarks
