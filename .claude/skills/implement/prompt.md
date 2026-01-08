# /implement - Execute Implementation Plan

Execute an implementation plan phase by phase. Use AFTER /plan to make the actual code changes.

## What This Skill Does

1. Reads the plan from `thoughts/plans/`
2. Creates todos for each phase
3. Implements each phase with verification
4. Updates progress as it goes

## When to Use

- After a plan has been reviewed and approved
- When ready to write code

## Workflow

1. Read the plan file
2. Create todo items for each phase
3. For each phase:
   - Mark as in_progress
   - Make the code changes
   - Verify the changes work (build, tests)
   - Mark as completed
4. Run final verification

## Verification Steps

After each phase:
```bash
pnpm build          # Must compile
pnpm test           # Tests must pass
```

## If Something Fails

- Don't mark the phase as completed
- Fix the issue
- Re-run verification
- Then proceed
