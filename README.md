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
- **Like a desktop sync app** - An icon in the notification area shows when it's syncing, and a dashboard lets you choose what syncs on each machine

## Getting Started

You need [Node.js](https://nodejs.org) 18 or later, and [Git](https://git-scm.com) if your storage is a Git repository.

### With the installer

Download this repository (**Code → Download ZIP**, then unzip it) or clone it, then open the installer for your system:

| System | Installer |
|--------|-----------|
| Windows | Double-click `install-windows.cmd` |
| macOS | Double-click `install-macos.command` |
| Linux | Run `./install-linux.sh`, or double-click it and choose **Run in Terminal** |

It builds claude-sync and makes `claude-sync` a command. Then it asks where to keep your sessions (and, on another machine, for your encryption key and where your projects are), runs the first sync, and puts claude-sync in the notification area, where it starts every time you log in. To update claude-sync, get the new version of the folder and run the installer again.

The first time, your system may warn about running a script from the internet: on Windows, choose **More info → Run anyway**; on macOS, allow it in **System Settings → Privacy & Security**.

### From the command line

The commands are the same in PowerShell, Command Prompt, Git Bash, and macOS and Linux terminals.

**1. Install claude-sync**

```bash
npm install -g @chronicideas/claude-sync
```

**2. Connect your storage**, a private repository here (or a bucket: see [Storage Backends](#storage-backends)). On your first machine this also creates the encryption key:

```bash
claude-sync init --git https://github.com/yourusername/claude-sessions-private
```

Every other machine needs that same key, or it couldn't read anything already synced. `init` asks for it (get it with `claude-sync key export` on a machine that's set up), or you can pass it:

```bash
claude-sync init --git <same-repo> --key <base64-key>
```

Keep the key somewhere safe, such as a password manager: it's the only way to read your synced conversations.

**3. Sync, and keep syncing automatically**

```bash
claude-sync sync
claude-sync install
```

The first sync uploads or downloads everything, so it can take a while. `install` makes Claude Code sync whenever a session starts and ends, and puts claude-sync in the notification area (the menu bar on macOS), where it starts again every time you log in. From then on you rarely need the terminal.

When it asks for the key, `init` also asks whether this machine keeps its projects in a different folder from your other machines (say `D:\Projects` instead of `~/Workspace`). With `--key`, set that up yourself before the first sync: see [Restoring into the right project](#restoring-into-the-right-project).

## Using claude-sync

### The icon

The cloud icon works like a desktop sync app's:

| Icon | Meaning |
|------|---------|
| Cloud | Up to date |
| Cloud with a blue badge | Syncing, whether Claude Code or you started it |
| Cloud with a red badge | The last sync failed or skipped something, such as a transcript too large for the storage. Open the dashboard to see why. |

Click it to open the dashboard. Its menu (right-click on Windows) shows the status, **Sync now** and **Quit**. On Windows 11, a new icon starts in the hidden overflow (^): drag it onto the taskbar to keep it in sight.

### Continuing a conversation on another machine

Keep each project in the same place relative to your home folder on every machine (for example `~/Workspace/app`). Close the session where you were working, since Claude Code syncs when a session ends. Then start Claude Code in the same project on the other machine, which syncs as the session starts, and run `/resume`.

### Choosing what syncs

Long sessions can grow to tens of megabytes, and each change uploads the whole encrypted file again. To keep some of them off a machine, click the icon (or run `claude-sync dashboard`).

The dashboard looks like the "choose folders" panel of a desktop sync app: every project and conversation on this machine or in your storage, with its size, last change and sync state, and a checkbox to sync it here or not.

- Unchecked conversations aren't downloaded to this machine or uploaded from it. Your other machines keep syncing them, and the local copy stays where it is.
- New conversations sync unless you uncheck their whole project. Checking a single conversation inside an unchecked project syncs just that one.
- The choice is stored in this machine's `~/.claude-sync/config.json`, and takes effect at the next sync (or press **Sync now**).

The page is served on `127.0.0.1` only and needs a one-time link, so other websites and other users can't reach it. It opens in a window of its own when Chrome, Edge, Chromium or Brave is installed, otherwise in your default browser.

### About the icon

The icon only uses what each OS already has: PowerShell on Windows, `osascript` on macOS (11 or later for the cloud symbols), and `python3` with GTK and Ayatana AppIndicator on Linux (`sudo apt install gir1.2-ayatanaappindicator3-0.1` on Debian and Ubuntu; GNOME also needs the AppIndicator extension). Problems are logged to `~/.claude-sync/tray/tray.log`.

Over SSH, or on a Linux machine without a desktop, `install` skips the icon and only adds the hooks; `claude-sync status` shows how things stand. To manage the icon yourself, `claude-sync tray` starts it, `claude-sync tray --no-startup` stops it starting at login, and `claude-sync install --no-tray` leaves it out.

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
- If both copies of a conversation moved on since they last matched, the one with the most recent message wins. This is what happens when you switch machines while Claude Code still has the conversation open on the first one, since it keeps writing a few bookkeeping lines to it. If the other copy has messages of its own (the conversation really did go on in both places), it's saved to `~/.claude-sync/conflicts/`.
- For any other file both sides changed, the local copy is kept and the other copy is saved to `~/.claude-sync/conflicts/`.
- A project's memory index (`memory/MEMORY.md`) is merged line by line instead, so memories added on both machines are all listed.

The session that is currently open is never overwritten by a hook, nor uploaded by one over a copy with a more recent message; it is reconciled on the next sync after it closes. Deletions are not synced, so Claude Code's cleanup of old transcripts on one machine doesn't remove them anywhere else.

## Commands

| Command | Description |
|---------|-------------|
| `claude-sync init` | Set up storage backend and encryption key (`--key <base64>` to reuse your other machine's) |
| `claude-sync sync` | Pull remote changes, then push local changes |
| `claude-sync push` | Same as `sync` |
| `claude-sync pull` | Pull only (`--all` also restores files deleted locally) |
| `claude-sync install` | Sync automatically: add Claude Code hooks and the notification area icon (`--no-tray` to leave the icon out) |
| `claude-sync status` | Show configuration and sync status |
| `claude-sync dashboard` | Choose which conversations sync on this machine, in your browser (`--port`, `--no-open`) |
| `claude-sync tray` | Show claude-sync in the notification area (`--startup` to also start it at login, `--no-startup` to stop that) |
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

`node dist/cli.js` only works from this folder. To use your build as `claude-sync` in every shell, run the [installer](#with-the-installer), or install it the way a release is installed and point the hooks and the icon at that copy:

```bash
npm pack                                            # prints the file name, e.g. chronicideas-claude-sync-0.1.0.tgz
npm install -g ./chronicideas-claude-sync-0.1.0.tgz
claude-sync install
```

Repeat these after each build.

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
