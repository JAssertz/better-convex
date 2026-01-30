---
name: lfg
description: Full autonomous engineering workflow
argument-hint: "[feature description]"
---

Run these slash commands in order. Do not do anything else.

1. `/ralph-wiggum:ralph-loop "finish all slash commands" --completion-promise "DONE"`
2. `/workflows:plan $ARGUMENTS`
3. `/compound-engineering:deepen-plan`
4. `/workflows:work`
5. `/changeset`
6. Output `<promise>DONE</promise>` when video is in PR

## Overrides (apply to ALL commands above)

**plan:**

- Final checklist/acceptance criteria: include test-browser if any browser-based features

**deepen-plan:**

- Context7: only query when not covered by skills

**work:**

- Task loop: For UI tasks, run test-browser BEFORE marking complete (don't guess - verify visually)
- Never mark UI task complete without browser verification

Start with step 1 now.
