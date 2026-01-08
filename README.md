# claude-sync

Sync Claude Code conversations across machines. E2E encrypted, privacy-first.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## The Problem

Claude Code stores conversations locally. When you switch machines, your conversation history doesn't follow you.

## The Solution

`claude-sync` automatically syncs your Claude Code sessions to your own private Git repository (or S3 bucket), encrypted with a key only you control.

- **End-to-end encrypted** - Your data is encrypted before it leaves your machine
- **Your storage** - Use your own private Git repo or S3 bucket
- **Zero trust** - We never see your conversations or encryption keys
- **Automatic** - Hooks into Claude Code's session lifecycle

## Quick Start

```bash
# Install
npm install -g claude-sync

# Initialize with your private Git repo
claude-sync init --git https://github.com/yourusername/claude-sessions-private

# Install Claude Code hooks
claude-sync install --global

# Done! Sessions will sync automatically
```

## How It Works

```
┌─────────────────┐         ┌─────────────────┐
│  Machine A      │         │  Machine B      │
│                 │         │                 │
│  Claude Code    │         │  Claude Code    │
│       ↓         │         │       ↑         │
│  Session ends   │         │  Session starts │
│       ↓         │         │       ↑         │
│  Encrypt        │         │  Decrypt        │
│       ↓         │         │       ↑         │
└───────┬─────────┘         └───────┴─────────┘
        │                           │
        ↓                           ↑
┌─────────────────────────────────────────────┐
│           Your Private Git Repo              │
│         (encrypted blobs only)               │
└─────────────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `claude-sync init` | Set up storage backend and generate encryption key |
| `claude-sync install` | Add hooks to Claude Code for automatic sync |
| `claude-sync push` | Manually push sessions to remote |
| `claude-sync pull` | Manually pull sessions from remote |
| `claude-sync status` | Show configuration and sync status |

## Storage Backends

### Git (Recommended)

Use any private Git repository. GitHub, GitLab, Bitbucket, or self-hosted.

```bash
claude-sync init --git https://github.com/yourusername/claude-sessions-private
```

### S3 (Coming Soon)

Use any S3-compatible storage: AWS S3, Cloudflare R2, MinIO, etc.

```bash
claude-sync init --s3 my-claude-sessions-bucket
```

## Security

### Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: 256-bit randomly generated, stored locally at `~/.claude-sync/key`
- **What's encrypted**: Session transcripts (JSONL files)

### Your Responsibilities

1. **Back up your key** - Without it, you cannot decrypt your sessions
2. **Use a private repo** - The encrypted data is safe, but why expose it?
3. **Protect your machines** - Anyone with access to `~/.claude-sync/key` can decrypt

### Key Backup

```bash
# Export your key (store this somewhere safe!)
cat ~/.claude-sync/key | base64

# Import on another machine
echo "YOUR_BASE64_KEY" | base64 -d > ~/.claude-sync/key
chmod 600 ~/.claude-sync/key
```

## How Claude Code Hooks Work

`claude-sync install` adds these hooks to your Claude Code settings:

```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "claude-sync push --session $CLAUDE_SESSION_ID"
      }]
    }],
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "claude-sync pull"
      }]
    }]
  }
}
```

- **SessionEnd**: When you finish a conversation, it's encrypted and pushed
- **SessionStart**: When you start Claude Code, new sessions are pulled

## Development

```bash
# Clone
git clone https://github.com/kneetworks/claude-sync
cd claude-sync

# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/cli.js status
```

## Roadmap

- [ ] S3 backend support
- [ ] Selective sync (by project)
- [ ] Session search across machines
- [ ] Team sharing (shared encryption keys)
- [ ] Conflict resolution for concurrent edits

## Contributing

Contributions welcome! Please read the contributing guidelines first.

## License

MIT
