---
description: Resolve review findings from todos/ directory with code edits
---

Run `/compound-engineering:resolve_todo_parallel`

Context: `/review` creates todo files in `todos/` with findings from agents:
- P1 (critical) - security, data issues
- P2 (important) - performance, architecture
- P3 (nice-to-have) - cleanup, enhancements

This command fixes all pending/ready todos by:
1. Reading each todo file's Problem Statement and Proposed Solutions
2. Implementing the recommended fix
3. Updating todo status: pending → ready → complete
4. Committing fixes with conventional messages
