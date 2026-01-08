# Contributing to claude-sync

Thanks for your interest in contributing! This project aims to be a simple, privacy-first tool for syncing Claude Code sessions across machines.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/kneetworks/claude-sync
cd claude-sync

# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/cli.js status
```

## Development Workflow

### Making Changes

1. Create a branch for your feature/fix
2. Make your changes
3. Build and test locally
4. Submit a PR

### Testing Locally

```bash
# Build
pnpm build

# Test commands
node dist/cli.js status
node dist/cli.js init --git <your-test-repo>
node dist/cli.js push --all
node dist/cli.js pull
```

### Code Style

- TypeScript with strict mode
- ES modules (`import`/`export`)
- Async/await over callbacks
- Handle errors gracefully

## Project Structure

```
src/
├── cli.ts              # CLI entry point (commander)
├── commands/           # CLI commands
│   ├── init.ts         # Setup wizard
│   ├── push.ts         # Push sessions to remote
│   ├── pull.ts         # Pull sessions from remote
│   ├── install.ts      # Install Claude Code hooks
│   └── status.ts       # Show sync status
├── backends/           # Storage backends
│   ├── index.ts        # Backend interface
│   └── git.ts          # Git backend implementation
├── crypto/             # Encryption
│   ├── keys.ts         # Key generation/management
│   └── encrypt.ts      # AES-256-GCM encryption
└── utils/              # Shared utilities
    ├── config.ts       # Config file management
    └── sessions.ts     # Claude session discovery
```

## Adding a New Backend

1. Create `src/backends/mybackend.ts`
2. Implement the `Backend` interface:

```typescript
export interface Backend {
  push(sessionId: string, encryptedData: Buffer): Promise<void>;
  pushBatch(
    sessions: Array<{ id: string; data: Buffer }>,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ pushed: number; failed: number }>;
  pull(sessionId: string): Promise<Buffer>;
  list(): Promise<RemoteSession[]>;
  delete(sessionId: string): Promise<void>;
}
```

3. Add to `getBackend()` in `src/backends/index.ts`
4. Update `init.ts` to support the new backend option

### Backend Ideas

- **S3** - AWS S3, Cloudflare R2, MinIO
- **WebDAV** - Nextcloud, ownCloud
- **Dropbox** - Dropbox API
- **Google Drive** - Google Drive API

## Adding a New Command

1. Create `src/commands/mycommand.ts`
2. Export an async function that handles the command
3. Add to `src/cli.ts`:

```typescript
import { mycommand } from "./commands/mycommand.js";

program
  .command("mycommand")
  .description("What it does")
  .option("--flag", "Description")
  .action(mycommand);
```

## Security Guidelines

This is a security-sensitive project. Please follow these guidelines:

### Must Do

- **Always encrypt** session data before sending to any backend
- **Never log** encryption keys or session content
- **Use secure defaults** (e.g., restrictive file permissions)
- **Validate inputs** from config files and CLI args

### Never Do

- Store unencrypted session data remotely
- Send keys or session content to analytics/telemetry
- Use weak encryption or roll your own crypto
- Commit test keys or credentials

## Pull Request Guidelines

### Before Submitting

- [ ] Code builds without errors (`pnpm build`)
- [ ] Tested locally with real Claude Code sessions
- [ ] No secrets or credentials in the diff
- [ ] Updated README if adding user-facing features

### PR Description

Include:
- What the change does
- Why it's needed
- How to test it

## Questions?

Open an issue for:
- Bug reports
- Feature requests
- Questions about the codebase

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
