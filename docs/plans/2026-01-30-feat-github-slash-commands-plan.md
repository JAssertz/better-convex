---
title: GitHub Slash Commands for Claude Code Action
type: feat
date: 2026-01-30
---

# GitHub Slash Commands for Claude Code Action

## Overview

Create 4 new `.claude/commands/*.md` files that enable stepwise PR/issue workflows via GitHub comments: `/brainstorm`, `/plan`, `/work`, `/review`. These complement the existing `/lfg` command.

**Source:** [brainstorm](../brainstorms/2026-01-30-github-slash-commands-brainstorm.md)

## Commands Summary

| Command | Purpose | Auto-commit | Allowed Tools |
|---------|---------|-------------|---------------|
| `/brainstorm` | Explore requirements via Q&A | No | Read, Grep, Glob, WebFetch |
| `/plan` | Create implementation plan | No | Read, Grep, Glob, Write (docs/) |
| `/work` | Implement changes | Yes | All standard + Bash(bun:*), Bash(gh:*) |
| `/review` | Review code, update PR | Yes | Read, Bash(gh pr:*) |

## Files to Create

```
.claude/commands/
├── brainstorm.md   # NEW
├── plan.md         # NEW
├── work.md         # NEW
├── review.md       # NEW
└── lfg.md          # EXISTS - no changes needed
```

## Implementation

### 1. brainstorm.md

```markdown
---
description: Explore requirements through Q&A before planning
allowed-tools: Read,Grep,Glob,WebFetch,WebSearch
---

You are helping explore and refine requirements for a feature or fix.

## Context Detection

1. Read the issue/PR description and previous comments
2. Check if a brainstorm doc exists in `docs/brainstorms/`
3. If continuing previous brainstorm, resume from last state

## Workflow

1. **Understand** - Ask clarifying questions one at a time
2. **Explore approaches** - Propose 2-3 options with pros/cons
3. **Capture** - Write decision to `docs/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`
4. **Handoff** - Summarize and suggest next command (`/plan`)

## Guidelines

- Ask ONE question at a time
- Prefer multiple choice when options are clear
- Apply YAGNI - prefer simpler approaches
- Post summary as PR/issue comment when done
- DO NOT commit or push - this is exploratory only
```

### 2. plan.md

```markdown
---
description: Create implementation plan from requirements
allowed-tools: Read,Grep,Glob,Write,Task
---

You are creating an implementation plan for a feature or fix.

## Context Detection

1. Read the issue/PR description and previous comments
2. Check for relevant brainstorm in `docs/brainstorms/`
3. Review codebase patterns for similar features

## Workflow

1. **Research** - Analyze codebase for patterns and conventions
2. **Plan** - Create step-by-step implementation plan
3. **Write** - Save to `docs/plans/YYYY-MM-DD-<type>-<topic>-plan.md`
4. **Handoff** - Post summary as comment, suggest `/work`

## Plan Structure

- Overview (1-2 sentences)
- Files to modify/create
- Step-by-step tasks with acceptance criteria
- Testing approach

## Guidelines

- Reference existing patterns in codebase
- Keep plans actionable and specific
- Include file paths and line numbers where relevant
- DO NOT commit or push - planning only
```

### 3. work.md

```markdown
---
description: Implement changes based on plan or requirements
allowed-tools: Read,Grep,Glob,Write,Edit,MultiEdit,Bash(bun:*),Bash(gh:*),Bash(npm:*),Task
---

You are implementing changes for a feature or fix.

## Context Detection

1. Read the issue/PR description and previous comments
2. Check for relevant plan in `docs/plans/`
3. Check for relevant brainstorm in `docs/brainstorms/`

## Workflow

1. **Understand** - Read plan/requirements, identify scope
2. **Implement** - Make changes following plan or requirements
3. **Verify** - Run typecheck (`bun typecheck`), lint (`bun lint:fix`)
4. **Commit** - Stage, commit with descriptive message, push to branch
5. **Report** - Post summary as comment with PR link if new branch

## Guidelines

- Follow existing codebase patterns
- Run verification before committing
- Commit message format: `<type>: <description>`
- If on issue (not PR): create branch, push, provide PR creation link
- If on PR: push directly to PR branch
```

### 4. review.md

```markdown
---
description: Review code and update PR with feedback
allowed-tools: Read,Grep,Glob,Bash(gh pr:*),Bash(gh api:*)
---

You are reviewing code changes in this PR.

## Workflow

1. **Analyze** - Read PR diff and changed files
2. **Review** - Check for:
   - Code quality and patterns
   - Potential bugs or edge cases
   - Test coverage
   - Documentation accuracy
   - Security concerns
3. **Comment** - Use inline comments for specific issues
4. **Update PR** - Update PR description with summary if needed

## Guidelines

- Be constructive and specific
- Only flag genuinely noteworthy issues
- Use inline comments for code-specific feedback
- Use top-level comment for general observations
- Keep feedback concise
```

## Acceptance Criteria

- [x] `/brainstorm` - Wrapper created, invokes `/workflows:brainstorm`
- [x] `/plan` - Wrapper created, invokes `/workflows:plan`
- [x] `/work` - Wrapper created, invokes `/workflows:work`
- [x] `/review` - Wrapper created, invokes `/workflows:review`
- [x] Plugin marketplace configured in claude.yml
- [ ] Commands work on both issues and PRs (requires merge + testing)
- [x] Lint passes

## Testing Approach

1. Merge PR #63 (adds claude.yml workflow)
2. Create test issue, comment `/brainstorm add feature X`
3. Verify brainstorm doc created, Q&A in comments
4. Continue with `/plan`, `/work`, `/review`
5. Verify full workflow completes

## References

- claude-code-action docs: `/tmp/cc-repos/claude-code-action/docs/`
- Example commands: `/tmp/cc-repos/claude-code-action/.claude/commands/`
- Local lfg.md: `.claude/commands/lfg.md`
