# claude-sync

Sync Claude Code conversations across machines. E2E encrypted, privacy-first.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
[![CI](https://github.com/chronicideas/claude-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/chronicideas/claude-sync/actions/workflows/ci.yml)

> **Disclaimer:** This is an independent, community-built tool. It is **not affiliated with, endorsed by, or supported by Anthropic**. Use of Claude Code is subject to [Anthropic's Terms of Service](https://www.anthropic.com/policies/consumer-terms). This tool syncs conversation data that may contain sensitive information—ensure compliance with your organization's data policies before use.

## The Problem

Claude Code stores conversations locally. When you switch machines, your conversation history doesn't follow you.

## The Solution

`claude-sync` automatically syncs your Claude Code sessions to your own storage (Git, S3, GCS, R2), encrypted with a key only you control.

- **End-to-end encrypted** - AES-256-GCM encryption before data leaves your machine
- **Your storage** - Use your own private Git repo, AWS S3, Google Cloud Storage, Cloudflare R2, or any S3-compatible service
- **Zero trust** - We never see your conversations or encryption keys
- **Automatic** - Hooks into Claude Code's session lifecycle
- **Incremental** - Only files changed since the last sync are uploaded, in one commit per sync

## Quick Start

```bash
# Install
npm install -g @chronicideas/claude-sync

# Initialize with your storage backend
claude-sync init --git https://github.com/yourusername/claude-sessions-private
# or
claude-sync init --s3 my-bucket --region us-west-2
# or
claude-sync init --gcs my-gcs-bucket
# or
claude-sync init --r2 my-r2-bucket

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
│  Encrypt (AES)  │         │  Decrypt        │
│       ↓         │         │       ↑         │
└───────┬─────────┘         └───────┴─────────┘
        │                           │
        ↓                           ↑
┌─────────────────────────────────────────────┐
│         Your Private Storage                 │
│   (Git / S3 / GCS / R2 - encrypted only)    │
└─────────────────────────────────────────────┘
```

### What gets synced

Everything Claude Code keeps per project under `~/.claude/projects/<project>/`: session transcripts, subagent transcripts, tool results and the project's memory folder. Each file is encrypted separately, and only files that changed since the last sync are uploaded.

### Restoring into the right project

Claude Code names each project folder after the project's absolute path (`C:\Users\me\code\app` → `C--Users-me-code-app`), and `/resume` only lists sessions from the folder that matches your current directory. claude-sync stores the home-directory part as `@home` (`@home-code-app`) and expands it with the local home directory when pulling, so a project kept at the same place relative to your home directory lands in the right folder on every machine, even with a different username or OS.

If one machine keeps its projects somewhere else, map the folder on that machine:

```bash
claude-sync folder add ~/Workspace D:\Projects
```

Projects in `D:\Projects` are then stored as if they were in `~/Workspace`, so `D:\Projects\app` on this machine and `~/Workspace/app` on the others share their sessions. Add the mapping before the first sync: sessions already synced from the old location aren't moved.

### Conflicts

Every sync pulls before it pushes, so a push never silently overwrites another machine's work:

- If one copy of a transcript extends the other (the normal case), the longer one wins.
- If only one side changed a file since the last sync, that side wins.
- If both sides changed it (for example, the same session continued on two machines between syncs), the local copy is kept and the other copy is saved to `~/.claude-sync/conflicts/`.
- A project's memory index (`memory/MEMORY.md`) is merged line by line instead, so memories added on both machines are all listed.

The session that is currently open is never overwritten by a hook; it is reconciled on the next sync after it closes. Deletions are not synced, so Claude Code's cleanup of old transcripts on one machine doesn't remove them anywhere else.

### Choosing what syncs

Long sessions can grow to tens of megabytes, and each change uploads the whole encrypted file again. To keep some of them off a machine, run:

```bash
claude-sync dashboard
```

This opens a page in your browser, much like the "choose folders" panel of a desktop sync app: every project and conversation on this machine or in your storage, with its size, last change and sync state, and a checkbox to sync it here or not.

- Unchecked conversations aren't downloaded to this machine or uploaded from it. Your other machines keep syncing them, and the local copy stays where it is.
- New conversations sync unless you uncheck their whole project. Checking a single conversation inside an unchecked project syncs just that one.
- The choice is stored in this machine's `~/.claude-sync/config.json`, and takes effect at the next sync (or press **Sync now**).

The page is served on `127.0.0.1` only and needs the one-time link printed in the terminal, so other websites and other users can't reach it. Press Ctrl+C to stop it.

## Commands

| Command | Description |
|---------|-------------|
| `claude-sync init` | Set up storage backend and encryption key (`--key <base64>` to reuse your other machine's) |
| `claude-sync sync` | Pull remote changes, then push local changes |
| `claude-sync push` | Same as `sync` |
| `claude-sync pull` | Pull only (`--all` also restores files deleted locally) |
| `claude-sync install` | Add hooks to Claude Code for automatic sync |
| `claude-sync status` | Show configuration and sync status |
| `claude-sync dashboard` | Choose which conversations sync on this machine, in your browser (`--port`, `--no-open`) |
| `claude-sync folder add <other> <here>` | Keep projects from `<other>` on your other machines (e.g. `~/Workspace`) in `<here>` on this one |
| `claude-sync folder remove <other>` | Undo `folder add` |
| `claude-sync key export` | Print the encryption key as base64 |
| `claude-sync key import <base64>` | Use an existing encryption key |

## Storage Backends

### Git

Use any private Git repository. GitHub, GitLab, Bitbucket, or self-hosted.

```bash
claude-sync init --git https://github.com/yourusername/claude-sessions-private
```

GitHub refuses files over 100 MB, so a transcript that big (usually one with many images) is skipped with a warning and stays on the machine it was written on. Use S3 or R2 if you need those synced too.

### AWS S3

```bash
claude-sync init --s3 my-bucket --region us-west-2

# Uses AWS credentials from environment or ~/.aws/credentials
```

### Google Cloud Storage

```bash
claude-sync init --gcs my-gcs-bucket

# Uses GOOGLE_APPLICATION_CREDENTIALS or gcloud auth
```

### Cloudflare R2

```bash
claude-sync init --r2 my-bucket --endpoint https://ACCOUNT_ID.r2.cloudflarestorage.com

# Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY with R2 API tokens
```

### Other S3-Compatible (MinIO, etc.)

```bash
claude-sync init --s3 my-bucket --endpoint https://minio.example.com --region us-east-1
```

### Interactive Setup

Just run `claude-sync init` without flags for an interactive wizard that guides you through setup.

## Security

### Threat Model

**What claude-sync protects against:**

- **Storage provider reading your data** - Sessions are encrypted before leaving your machine. Your Git host, S3 provider, etc. cannot read the content.
- **Network interception** - Even if TLS were compromised, the payload is already encrypted.
- **Accidental plaintext exposure** - Every push validates data is encrypted before upload.

**What claude-sync does NOT protect against:**

- **Compromised local machine** - If an attacker has access to your machine, they can read `~/.claude-sync/key` and decrypt everything.
- **Key theft** - Anyone with your encryption key can decrypt all your sessions.
- **Metadata exposure** - Session IDs, file sizes, and sync timestamps are visible to your storage provider.
- **Memory attacks** - Decrypted data exists in memory during processing.
- **Weak storage credentials** - If your Git/S3/GCS credentials are compromised, attackers get encrypted blobs (safe) but could delete your data.

**Trust assumptions:**

- You trust your local machine's security
- You trust Node.js `crypto.randomBytes()` for key and IV generation
- You trust AES-256-GCM as implemented in Node.js/OpenSSL

### Cryptographic Details

| Component | Implementation |
|-----------|----------------|
| **Algorithm** | AES-256-GCM (authenticated encryption with associated data) |
| **Key** | 256-bit, generated via `crypto.randomBytes(32)` |
| **IV/Nonce** | 96-bit (12 bytes), unique per encryption via `crypto.randomBytes(12)` |
| **Auth Tag** | 128-bit (16 bytes), provides integrity and authenticity |
| **Format** | `IV (12 bytes) || AuthTag (16 bytes) || Ciphertext` |
| **Key Storage** | `~/.claude-sync/key` with mode `0600` (owner read/write only) |
| **Config Dir** | `~/.claude-sync/` with mode `0700` (owner only) |

**Security properties:**

- **Confidentiality** - AES-256 encryption prevents reading without the key
- **Integrity** - GCM auth tag detects any tampering with ciphertext
- **Authenticity** - Only someone with the key could have produced valid ciphertext
- **No nonce reuse** - Fresh random IV for every encryption operation

**Not implemented (potential future work):**

- Key rotation mechanism
- Key derivation from password (currently raw key only)
- Forward secrecy
- Audit logging

### Your Responsibilities

1. **Back up your key** - Without it, you cannot decrypt your sessions
2. **Use private storage** - The encrypted data is safe, but why expose it?
3. **Protect your machines** - Anyone with access to `~/.claude-sync/key` can decrypt
4. **Check your company policy** - Claude Code sessions may contain proprietary code, incident context, or customer info

### Key Backup

```bash
# Export your key (store this somewhere safe, e.g. a password manager)
claude-sync key export

# Import on another machine
claude-sync key import YOUR_BASE64_KEY
```

`claude-sync init` never replaces an existing key, since everything already pushed with it would become unreadable.

## How Claude Code Hooks Work

`claude-sync install` adds these hooks to your Claude Code settings, using absolute paths to `node` and the CLI so they work whatever `PATH` Claude Code runs them with:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "\"/path/to/node\" \"/path/to/claude-sync/dist/cli.js\" sync --hook",
        "timeout": 120
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "\"/path/to/node\" \"/path/to/claude-sync/dist/cli.js\" sync --hook",
        "timeout": 120
      }]
    }]
  }
}
```

- **SessionStart**: Picks up work from your other machines (and pushes anything a previous session left behind)
- **SessionEnd**: Pushes the conversation you just finished

With `--hook`, claude-sync reads the session ID Claude Code passes on stdin, prints nothing to stdout (SessionStart output would be added to Claude's context), and never fails the session: errors go to stderr. Re-running `claude-sync install` replaces earlier claude-sync hooks and keeps your other hooks.

## Setting Up on a New Machine

1. Clone your project to the same place relative to your home directory (e.g. `~/Workspace/app`)
2. Install claude-sync: `npm install -g @chronicideas/claude-sync`
3. Initialize with the same backend and your existing key:
   ```bash
   # On your existing machine
   claude-sync key export

   # On the new machine
   claude-sync init --git <same-repo> --key <base64-key>
   ```
4. Pull existing sessions: `claude-sync sync`
5. Install hooks: `claude-sync install --global`

Then open Claude Code in the project and run `/resume`. Sync runs when a session starts and ends, so close a session on one machine before continuing it on another.

## Development

```bash
# Clone
git clone https://github.com/kneetworks/claude-sync
cd claude-sync

# Install dependencies (npx runs pnpm without installing it globally)
npx pnpm@9.15.0 install --frozen-lockfile

# Build
npx pnpm@9.15.0 build

# Test
npx pnpm@9.15.0 test

# Run locally
node dist/cli.js status
```

## Roadmap

- [x] Git backend
- [x] S3/GCS/R2 backend support
- [x] Parallel encryption and batch uploads
- [x] Encryption validation (prevent plaintext leaks)
- [x] Selective sync (by project or conversation)
- [ ] Session search across machines
- [ ] Team sharing (shared encryption keys)
- [ ] Conflict resolution for concurrent edits

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT
