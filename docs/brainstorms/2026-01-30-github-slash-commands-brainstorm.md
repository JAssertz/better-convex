---
date: 2026-01-30
topic: github-slash-commands
---

# GitHub Slash Commands for Claude Code Action

## What We're Building

GitHub Actions-based slash commands that allow commenting `/lfg`, `/brainstorm`, `/plan`, `/work`, `/review` on PRs/issues to trigger Claude workflows.

**Commands:**

| Command | Purpose | Auto-commit? | Output |
|---------|---------|--------------|--------|
| `/lfg` | Full autonomous workflow | Yes | Branch + PR link |
| `/brainstorm` | Explore requirements | No | Questions/answers in comments |
| `/plan` | Create implementation plan | No | Plan in comment |
| `/work` | Implement changes | Yes | Branch + PR link |
| `/review` | Review code, update PR | Yes | Review comments, PR updates |

## Why This Approach

**Considered:**
- A: Separate commands (5 files) - **chosen**
- B: Single command with args - less discoverable
- C: Workflow + helpers - unclear separation

**Chose A because:**
- Each command has distinct purpose/permissions
- Easy to iterate on individually
- Matches mental model of stepwise workflow

## Key Decisions

1. **Flexible ordering**: Any command works anytime. Auto-detects context from previous comments
2. **Auto-commit for code-producing commands**: `/lfg`, `/work`, `/review` auto-commit. `/brainstorm`, `/plan` don't
3. **PR creation**: Default Claude behavior - pushes branch, provides pre-filled PR link. User clicks to create
4. **Context detection**: Claude reads previous comments in thread to understand state

## Implementation Details

### Files to Create

```
.claude/commands/
├── brainstorm.md    # /brainstorm - explore requirements
├── plan.md          # /plan - create implementation plan
├── work.md          # /work - implement changes
└── review.md        # /review - code review + PR update
```

Note: `/lfg` already exists in `.claude/commands/lfg.md`

### Workflow File Updates

Existing `.github/workflows/claude.yml` handles `@claude` mentions.
Slash commands are detected automatically from `.claude/commands/` directory.

### Command Template Structure

```markdown
---
description: Brief description
allowed-tools: Bash(gh:*),Bash(bun:*),Edit,Read,Write
---

[Instructions for Claude]
```

## Open Questions

- None remaining - ready for planning

## Next Steps

→ `/workflows:plan` for implementation details
