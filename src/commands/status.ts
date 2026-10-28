import fs from "fs/promises";
import chalk from "chalk";
import { loadConfig } from "../utils/config.js";
import { loadManifest } from "../utils/manifest.js";
import { homedir } from "os";
import { findLocalFiles, toFolderMappings } from "../utils/sessions.js";
import { keyExists } from "../crypto/keys.js";

export async function status(): Promise<void> {
  console.log(chalk.bold("\n🔄 Claude Sync Status\n"));

  // Check initialization
  const config = await loadConfig();

  if (!config?.initialized) {
    console.log(chalk.red("Status: Not initialized"));
    console.log(chalk.dim("Run `claude-sync init` to get started\n"));
    return;
  }

  console.log(chalk.green("Status: Initialized"));
  console.log();

  // Backend info
  console.log(chalk.bold("Backend:"));
  console.log(`  Type: ${config.backend}`);
  if (config.backend === "git") {
    console.log(`  URL: ${config.backendConfig.url}`);
  } else if (config.backend === "s3") {
    console.log(`  Bucket: ${config.backendConfig.bucket}`);
    if (config.backendConfig.endpoint) {
      console.log(`  Endpoint: ${config.backendConfig.endpoint}`);
    }
  }
  console.log();

  // Encryption
  console.log(chalk.bold("Encryption:"));
  const hasKey = await keyExists();
  if (hasKey) {
    console.log(chalk.green("  ✓ Key configured"));
  } else {
    console.log(chalk.red("  ✗ No key found"));
  }
  console.log();

  const folders = Object.entries(config.folders ?? {});
  if (folders.length > 0) {
    console.log(chalk.bold("Folders:"));
    for (const [other, here] of folders) {
      console.log(`  ${other} on other machines → ${here}`);
    }
    console.log();
  }

  // Local files
  console.log(chalk.bold("Local files:"));
  try {
    const files = await findLocalFiles(homedir(), toFolderMappings(config.folders));
    const manifest = await loadManifest();

    let changed = 0;
    for (const file of files) {
      const entry = manifest[file.remotePath];
      const stat = await fs.stat(file.absPath);
      if (!entry || entry.size !== stat.size || entry.mtime !== stat.mtimeMs) changed++;
    }

    // Top-level transcripts only; subagent transcripts live in per-session folders
    const sessions = files.filter((f) => /^[^/]+\/[^/]+\.jsonl$/.test(f.remotePath));
    const projects = new Set(files.map((f) => f.remotePath.split("/")[0]));

    console.log(`  Projects: ${projects.size}`);
    console.log(`  Sessions: ${sessions.length}`);
    console.log(`  Files: ${files.length}`);
    console.log(`  Changed since last sync: ${changed}`);
  } catch {
    console.log(chalk.dim("  Unable to read sessions"));
  }
  console.log();

  // Created date
  if (config.createdAt) {
    console.log(
      chalk.dim(`Initialized: ${new Date(config.createdAt).toLocaleDateString()}`)
    );
  }
  console.log();
}
