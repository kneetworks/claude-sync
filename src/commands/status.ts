import chalk from "chalk";
import { loadConfig } from "../utils/config.js";
import { findSessions } from "../utils/sessions.js";
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

  // Session counts
  console.log(chalk.bold("Sessions:"));
  try {
    const allSessions = await findSessions();
    const pendingSessions = await findSessions({ modifiedSinceLastSync: true });

    console.log(`  Local sessions: ${allSessions.length}`);
    console.log(`  Pending sync: ${pendingSessions.length}`);
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
