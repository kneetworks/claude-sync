# /research - Codebase Research

Deep codebase research before implementing features. Use this BEFORE planning any non-trivial change.

## What This Skill Does

Spawns parallel sub-agents to:
- Find relevant files by patterns
- Search code for keywords
- Analyze existing patterns and architecture
- Understand how similar features are implemented

## When to Use

- Before adding a new command
- Before adding a new backend
- Before refactoring existing code
- When you need to understand how something works

## Output

Research findings are saved to `thoughts/research/` for reference during implementation.

## Instructions

1. Identify the research questions
2. Use Glob to find relevant files
3. Use Grep to search for patterns
4. Read key files to understand implementation
5. Document findings in a research file

Focus areas for claude-sync:
- `src/commands/` - How commands are structured
- `src/backends/` - How backends implement the interface
- `src/crypto/` - How encryption works
- `src/utils/` - Shared utilities
