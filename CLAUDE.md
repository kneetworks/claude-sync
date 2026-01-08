# Claude Code Setup for claude-sync

## Harness Engineering Framework

This codebase uses a **Research → Plan → Implement → Validate** workflow to maximize context efficiency and code quality.

| Skill | When to Use |
|-------|-------------|
| `/research` | Before any multi-file change - understand the system first |
| `/plan` | After research - create reviewable implementation plan |
| `/implement` | Execute plan phase by phase with verification |
| `/validate` | Final quality gate before commit |

## Quick Reference

```bash
# Development
pnpm install        # Install dependencies
pnpm build          # Build TypeScript
pnpm dev            # Watch mode

# Testing
pnpm test           # Run tests

# Local testing
pnpm start init     # Test init command
pnpm start status   # Test status command
```

## Project Overview

**claude-sync** is a CLI tool to sync Claude Code conversations across machines with E2E encryption.

| Component | Purpose | Location |
|-----------|---------|----------|
| CLI | Command-line interface | `src/cli.ts` |
| Commands | init, push, pull, install, status | `src/commands/` |
| Backends | Git, S3 (future) | `src/backends/` |
| Crypto | AES-256-GCM encryption | `src/crypto/` |
| Utils | Config, session management | `src/utils/` |

## Architecture

```
~/.claude-sync/
├── config.json     # Backend config
├── key             # Encryption key (256-bit)
└── repo/           # Git backend local clone
    └── sessions/   # Encrypted session files
```

## Critical Patterns

### Always encrypt before storage
```typescript
import { encrypt } from "./crypto/encrypt.js";
const encrypted = await encrypt(sessionData);
await backend.push(sessionId, encrypted);
```

### Use async/await consistently
```typescript
// Good
const config = await loadConfig();

// Bad - don't use callbacks
loadConfig().then(config => ...)
```

### Handle missing config gracefully
```typescript
const config = await loadConfig();
if (!config?.initialized) {
  console.log("Run `claude-sync init` first");
  process.exit(1);
}
```

## File Patterns

- `*.ts` - TypeScript source
- `*.enc` - Encrypted session files (in git backend)
- `*.jsonl` - Claude Code session transcripts (local)

## Security Considerations

1. **Encryption key** - Never commit, stored at `~/.claude-sync/key`
2. **Session data** - May contain sensitive code, always encrypt
3. **Git backend** - Use private repos only
4. **File permissions** - Key file should be 0600

## Adding a New Backend

1. Create `src/backends/mybackend.ts`
2. Implement the `Backend` interface
3. Add to `getBackend()` in `src/backends/index.ts`
4. Update `init.ts` to support the new backend

## Testing Locally

```bash
# Build first
pnpm build

# Test commands
node dist/cli.js init --git https://github.com/user/private-repo
node dist/cli.js status
node dist/cli.js push --all
node dist/cli.js install --global
```
