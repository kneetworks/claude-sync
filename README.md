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
- **Fast** - Parallel encryption and batch uploads

## Quick Start

```bash
# Install
npm install -g claude-sync

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

## Commands

| Command | Description |
|---------|-------------|
| `claude-sync init` | Set up storage backend and generate encryption key |
| `claude-sync install` | Add hooks to Claude Code for automatic sync |
| `claude-sync push` | Manually push sessions to remote |
| `claude-sync pull` | Manually pull sessions from remote |
| `claude-sync status` | Show configuration and sync status |

## Storage Backends

### Git

Use any private Git repository. GitHub, GitLab, Bitbucket, or self-hosted.

```bash
claude-sync init --git https://github.com/yourusername/claude-sessions-private
```

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

## Setting Up on a New Machine

1. Install claude-sync: `npm install -g claude-sync`
2. Initialize with the same backend: `claude-sync init --git <same-repo>`
3. Copy your encryption key from your other machine:
   ```bash
   # On old machine
   cat ~/.claude-sync/key | base64

   # On new machine
   echo "BASE64_KEY" | base64 -d > ~/.claude-sync/key
   chmod 600 ~/.claude-sync/key
   ```
4. Pull existing sessions: `claude-sync pull --all`
5. Install hooks: `claude-sync install --global`

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

- [x] Git backend
- [x] S3/GCS/R2 backend support
- [x] Parallel encryption and batch uploads
- [x] Encryption validation (prevent plaintext leaks)
- [ ] Selective sync (by project)
- [ ] Session search across machines
- [ ] Team sharing (shared encryption keys)
- [ ] Conflict resolution for concurrent edits

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT
