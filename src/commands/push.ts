import ora from "ora";
import chalk from "chalk";
import { findSessions, readSession } from "../utils/sessions.js";
import { encrypt } from "../crypto/encrypt.js";
import { getBackend } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";

interface PushOptions {
  session?: string;
  file?: string;
  all?: boolean;
}

export async function push(options: PushOptions): Promise<void> {
  const config = await loadConfig();

  if (!config?.initialized) {
    console.log(
      chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first.")
    );
    process.exit(1);
  }

  const backend = await getBackend(config);
  let sessions: Array<{ id: string; path: string }>;

  if (options.file) {
    // Push specific file (used by hooks)
    sessions = [{ id: options.session || "unknown", path: options.file }];
  } else if (options.session) {
    // Push specific session by ID
    const allSessions = await findSessions();
    const session = allSessions.find((s) => s.id === options.session);
    if (!session) {
      console.log(chalk.red(`Session ${options.session} not found`));
      process.exit(1);
    }
    sessions = [session];
  } else if (options.all) {
    // Push all sessions
    sessions = await findSessions();
  } else {
    // Default: push sessions modified since last sync
    sessions = await findSessions({ modifiedSinceLastSync: true });
  }

  if (sessions.length === 0) {
    console.log(chalk.dim("No sessions to push"));
    return;
  }

  const spinner = ora(`Pushing ${sessions.length} session(s)...`).start();

  let pushed = 0;
  let failed = 0;

  for (const session of sessions) {
    try {
      // Read session data
      const data = await readSession(session.path);

      // Encrypt
      const encrypted = await encrypt(data);

      // Push to backend
      await backend.push(session.id, encrypted);

      pushed++;
      spinner.text = `Pushed ${pushed}/${sessions.length} sessions...`;
    } catch (error) {
      failed++;
      console.error(
        chalk.red(`\nFailed to push session ${session.id}: ${error}`)
      );
    }
  }

  if (failed > 0) {
    spinner.warn(`Pushed ${pushed} sessions, ${failed} failed`);
  } else {
    spinner.succeed(`Pushed ${pushed} session(s)`);
  }
}
