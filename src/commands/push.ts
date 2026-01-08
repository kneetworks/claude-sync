import ora from "ora";
import chalk from "chalk";
import { findSessions, readSession } from "../utils/sessions.js";
import { encrypt } from "../crypto/encrypt.js";
import { getBackend } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";

const ENCRYPT_BATCH_SIZE = 20; // Parallel encryption batch size

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

  // For single session, use simple push
  if (sessions.length === 1) {
    const spinner = ora("Pushing session...").start();
    try {
      const data = await readSession(sessions[0].path);
      const encrypted = await encrypt(data);
      await backend.push(sessions[0].id, encrypted);
      spinner.succeed("Pushed 1 session");
    } catch (error) {
      spinner.fail(`Failed to push session: ${error}`);
    }
    return;
  }

  // For multiple sessions, use batch mode
  const spinner = ora(`Encrypting ${sessions.length} sessions...`).start();

  // Step 1: Read and encrypt all sessions in parallel batches
  const encryptedSessions: Array<{ id: string; data: Buffer }> = [];
  let encryptFailed = 0;

  for (let i = 0; i < sessions.length; i += ENCRYPT_BATCH_SIZE) {
    const batch = sessions.slice(i, i + ENCRYPT_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (session) => {
        const data = await readSession(session.path);
        const encrypted = await encrypt(data);
        return { id: session.id, data: encrypted };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        encryptedSessions.push(result.value);
      } else {
        encryptFailed++;
      }
    }

    spinner.text = `Encrypting... ${encryptedSessions.length + encryptFailed}/${sessions.length}`;
  }

  if (encryptFailed > 0) {
    spinner.text = `Encrypted ${encryptedSessions.length} sessions (${encryptFailed} failed)`;
  }

  // Step 2: Push all encrypted sessions in batch (single commit + push)
  spinner.text = `Writing ${encryptedSessions.length} sessions...`;

  const { pushed, failed } = await backend.pushBatch(
    encryptedSessions,
    (done, total) => {
      spinner.text = `Writing... ${done}/${total}`;
    }
  );

  const totalFailed = failed + encryptFailed;

  if (totalFailed > 0) {
    spinner.warn(`Pushed ${pushed} sessions, ${totalFailed} failed`);
  } else {
    spinner.succeed(`Pushed ${pushed} session(s)`);
  }
}
