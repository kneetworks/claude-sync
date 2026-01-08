#!/usr/bin/env node

import { Command } from "commander";
import { init } from "./commands/init.js";
import { push } from "./commands/push.js";
import { pull } from "./commands/pull.js";
import { install } from "./commands/install.js";
import { status } from "./commands/status.js";

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
  .option("--s3 <bucket>", "Use S3-compatible storage")
  .action(init);

program
  .command("push")
  .description("Push local sessions to cloud storage")
  .option("--session <id>", "Push a specific session")
  .option("--file <path>", "Push a specific transcript file")
  .option("--all", "Push all sessions")
  .action(push);

program
  .command("pull")
  .description("Pull sessions from cloud storage")
  .option("--session <id>", "Pull a specific session")
  .option("--all", "Pull all sessions")
  .action(pull);

program
  .command("install")
  .description("Install Claude Code hooks for automatic sync")
  .option("--global", "Install hooks globally (~/.claude/settings.json)")
  .option("--project", "Install hooks for current project only")
  .action(install);

program
  .command("status")
  .description("Show sync status and configuration")
  .action(status);

program.parse();
