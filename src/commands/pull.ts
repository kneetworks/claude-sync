import ora from "ora";
import chalk from "chalk";
import { decrypt } from "../crypto/encrypt.js";
import { getBackend } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";
import { writeSession, getSessionPath } from "../utils/sessions.js";

interface PullOptions {
  session?: string;
  all?: boolean;
}

export async function pull(options: PullOptions): Promise<void> {
  const config = await loadConfig();

  if (!config?.initialized) {
    console.log(
      chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first.")
    );
    process.exit(1);
  }

  const backend = await getBackend(config);

  const spinner = ora("Fetching sessions from remote...").start();

  try {
    // Get list of remote sessions
    const remoteSessions = await backend.list();

    if (options.session) {
      // Pull specific session
      const session = remoteSessions.find((s) => s.id === options.session);
      if (!session) {
        spinner.fail(`Session ${options.session} not found on remote`);
        return;
      }

      const encrypted = await backend.pull(session.id);
      const decrypted = await decrypt(encrypted);
      const localPath = await getSessionPath(session.id, session.project);
      await writeSession(localPath, decrypted);

      spinner.succeed(`Pulled session ${session.id}`);
    } else {
      // Pull all or only new sessions
      const toPull = options.all
        ? remoteSessions
        : remoteSessions.filter((s) => !s.existsLocally);

      if (toPull.length === 0) {
        spinner.succeed("All sessions are up to date");
        return;
      }

      spinner.text = `Pulling ${toPull.length} session(s)...`;

      let pulled = 0;
      for (const session of toPull) {
        const encrypted = await backend.pull(session.id);
        const decrypted = await decrypt(encrypted);
        const localPath = await getSessionPath(session.id, session.project);
        await writeSession(localPath, decrypted);

        pulled++;
        spinner.text = `Pulled ${pulled}/${toPull.length} sessions...`;
      }

      spinner.succeed(`Pulled ${pulled} session(s)`);
    }
  } catch (error) {
    spinner.fail(`Failed to pull sessions: ${error}`);
    process.exit(1);
  }
}
