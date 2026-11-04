#!/usr/bin/env node

import { Command } from "commander";
import { init } from "./commands/init.js";
import { sync, pull } from "./commands/sync.js";
import { install } from "./commands/install.js";
import { status } from "./commands/status.js";
import { keyExport, keyImport } from "./commands/key.js";
import { folderAdd, folderRemove } from "./commands/folder.js";
import { dashboard } from "./commands/dashboard.js";
import { tray } from "./commands/tray.js";

const program = new Command();

program
  .name("claude-sync")
  .description(
    "Sync Claude Code conversations across machines. E2E encrypted, privacy-first."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Initialize claude-sync with your storage backend")
  .option("--git <url>", "Use a Git repository for storage")
  .option("--s3 <bucket>", "Use AWS S3 bucket")
  .option("--gcs <bucket>", "Use Google Cloud Storage bucket")
  .option("--r2 <bucket>", "Use Cloudflare R2 bucket")
  .option("--region <region>", "AWS/S3 region")
  .option("--endpoint <url>", "Custom S3 endpoint URL")
  .option("--key <base64>", "Use the encryption key from your other machine")
  .action(init);

program
  .command("sync")
  .description("Pull remote changes, then push local changes")
  .option("--hook", "Run from a Claude Code hook (quiet, never fails the session)")
  .action(sync);

// Earlier versions' options stay accepted, so their hooks and scripts keep working:
// every changed file is synced either way
program
  .command("push")
  .description("Same as sync: remote changes are always pulled first")
  .option("--session <id>", "Accepted for compatibility: everything changed is synced")
  .option("--file <path>", "Accepted for compatibility: everything changed is synced")
  .option("--all", "Accepted for compatibility: everything changed is synced")
  .action(() => sync({}));

program
  .command("pull")
  .description("Pull remote changes without pushing")
  .option("--all", "Also restore files deleted locally after they were synced")
  .option("--session <id>", "Accepted for compatibility: everything changed is pulled")
  .action(({ all }) => pull({ all }));

program
  .command("install")
  .description("Install Claude Code hooks for automatic sync")
  .option("--global", "Install hooks globally (~/.claude/settings.json)")
  .option("--project", "Install hooks for current project only")
  .option("--tray", "Also show the notification area icon, and start it at login")
  .action(install);

program
  .command("status")
  .description("Show sync status and configuration")
  .action(status);

program
  .command("dashboard")
  .description("Choose which conversations sync on this machine, in your browser")
  .option("--port <port>", "Port to listen on (default: any free port)")
  .option("--no-open", "Print the link instead of opening the browser")
  .action(dashboard);

program
  .command("tray")
  .description("Show claude-sync in the notification area (menu bar on macOS)")
  .option("--startup", "Also start it automatically when you log in")
  .option("--no-startup", "Stop starting it automatically when you log in")
  .option("--foreground", "Run in this terminal instead of in the background")
  .action(tray);

const key = program.command("key").description("Back up or restore the encryption key");

key
  .command("export")
  .description("Print the key as base64 (keep it secret)")
  .action(keyExport);

key
  .command("import <base64>")
  .description("Use the key from your other machine")
  .action(keyImport);

const folder = program
  .command("folder")
  .description("Keep projects in a different folder on this machine than on the others");

folder
  .command("add <other> <here>")
  .description("Sync projects from <other> on your other machines (e.g. ~/Workspace) to <here>")
  .action(folderAdd);

folder
  .command("remove <other>")
  .description("Sync projects from <other> to the same place as on your other machines")
  .action(folderRemove);

program.parseAsync().then(() => {
  // Hooks must exit promptly rather than wait on open handles
  if (process.argv.includes("--hook")) process.exit(0);
});
