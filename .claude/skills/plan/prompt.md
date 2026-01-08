# /plan - Implementation Planning

Create detailed implementation plans with exact file changes and code snippets. Use AFTER /research to compress intent into actionable steps.

## What This Skill Does

Creates a structured plan document with:
- Overview of the change
- Files to modify/create
- Exact code changes with snippets
- Testing strategy
- Potential risks

## When to Use

- After completing research
- Before any multi-file change
- When the approach needs review before coding

## Output

Plans are saved to `thoughts/plans/` for review before implementation.

## Plan Structure

```markdown
# Plan: [Feature Name]

## Overview
Brief description of what we're implementing.

## Files to Modify
- `src/path/file.ts` - What changes

## Implementation Steps

### Phase 1: [Name]
1. Step details
2. Code snippet:
\`\`\`typescript
// exact code to add/change
\`\`\`

### Phase 2: [Name]
...

## Testing
- How to verify the changes work

## Risks
- Potential issues to watch for
```
