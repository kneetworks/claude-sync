import fs from "fs/promises";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { generateKey, importKey, keyExists, saveKey } from "../crypto/keys.js";
import { decryptWithKey } from "../crypto/encrypt.js";
import { initGitBackend } from "../backends/git.js";
import { getBackend, type Backend, type RemoteFile } from "../backends/index.js";
import { saveConfig } from "../utils/config.js";
import { expandHome } from "../utils/sessions.js";
import { folderAdd } from "./folder.js";

interface InitOptions {
  git?: string;
  s3?: string;
  gcs?: string;
  r2?: string;
  region?: string;
  endpoint?: string;
  key?: string;
}

// Common S3-compatible endpoints
const S3_ENDPOINTS = {
  gcs: "https://storage.googleapis.com",
  r2: "https://{account_id}.r2.cloudflarestorage.com", // User needs to replace {account_id}
};

/**
 * True if a pasted key can decrypt a sample from the storage, else what's wrong with it
 */
export function checkKey(input: string, sample: Buffer): true | string {
  const key = Buffer.from(input.trim(), "base64");
  if (key.length !== 32) return "That isn't a 256-bit key in base64";
  try {
    decryptWithKey(sample, key);
    return true;
  } catch {
    return "That key can't read the sessions in this storage";
  }
}

/**
 * Ask for the key the storage's sessions were encrypted with. It's checked against
 * the smallest of them, so a wrong key is caught now rather than at the first sync.
 */
async function promptForKey(remote: Backend, files: RemoteFile[]): Promise<void> {
  console.log(chalk.yellow("\nThis storage already has synced sessions, so this machine needs their key."));
  console.log(
    chalk.dim("Get it on a machine that's set up with ") +
      chalk.cyan("claude-sync key export") +
      chalk.dim(", or from wherever you keep it.\n")
  );

  const smallest = files.reduce((a, b) => ((b.size ?? Infinity) < (a.size ?? Infinity) ? b : a));
  const sample = await remote.get(smallest.path);
  const { key } = await inquirer.prompt([
    {
      type: "password",
      name: "key",
      mask: "*",
      message: "Encryption key (base64):",
      validate: (input: string) => checkKey(input, sample),
    },
  ]);

  await importKey(key.trim());
  console.log(chalk.green("✔ Encryption key imported"));
}

/**
 * A machine joining existing storage may keep its projects somewhere else than the
 * others, which has to be known before its first sync
 */
async function askAboutFolders(): Promise<void> {
  const { same } = await inquirer.prompt([
    {
      type: "confirm",
      name: "same",
      default: true,
      message: "Are your projects in the same folder (relative to your home folder) as on your other machines?",
    },
  ]);
  if (same) return;

  const isFolder = (input: string) =>
    fs.stat(expandHome(input.trim())).then((stat) => stat.isDirectory(), () => false);
  const { other, here } = await inquirer.prompt([
    {
      type: "input",
      name: "other",
      message: "Projects folder on your other machines (e.g. ~/Workspace):",
      validate: (input: string) => input.trim().length > 0 || "Enter a folder",
    },
    {
      type: "input",
      name: "here",
      message: `The same folder on this machine (e.g. ${process.platform === "win32" ? "D:\\Projects" : "~/Projects"}):`,
      validate: async (input: string) => (await isFolder(input)) || "That isn't a folder on this machine",
    },
  ]);
  await folderAdd(other.trim(), expandHome(here.trim()));
}

export async function init(options: InitOptions): Promise<void> {
  console.log(chalk.bold("\n🔄 Claude Sync Setup\n"));

  // Determine backend
  let backend: "git" | "s3";
  let backendConfig: Record<string, string>;

  if (options.git) {
    backend = "git";
    backendConfig = { url: options.git };
  } else if (options.s3) {
    backend = "s3";
    backendConfig = {
      bucket: options.s3,
      ...(options.region && { region: options.region }),
      ...(options.endpoint && { endpoint: options.endpoint }),
    };
  } else if (options.gcs) {
    backend = "s3";
    backendConfig = {
      bucket: options.gcs,
      endpoint: S3_ENDPOINTS.gcs,
      region: "auto",
    };
  } else if (options.r2) {
    backend = "s3";
    backendConfig = {
      bucket: options.r2,
      endpoint: options.endpoint || S3_ENDPOINTS.r2,
      region: "auto",
    };
  } else {
    // Interactive setup
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "backend",
        message: "Where do you want to store your synced sessions?",
        choices: [
          { name: "Git repository (GitHub, GitLab, etc.)", value: "git" },
          { name: "AWS S3", value: "s3" },
          { name: "Google Cloud Storage", value: "gcs" },
          { name: "Cloudflare R2", value: "r2" },
          { name: "Other S3-compatible (MinIO, etc.)", value: "s3-custom" },
        ],
      },
    ]);

    const choice = answers.backend;

    if (choice === "git") {
      backend = "git";
      const gitAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "url",
          message: "Git repository URL (use a private repo!):",
          validate: (input: string) =>
            input.length > 0 ? true : "Please enter a Git URL",
        },
      ]);
      backendConfig = { url: gitAnswers.url };
    } else {
      backend = "s3";

      if (choice === "s3") {
        // AWS S3
        const s3Answers = await inquirer.prompt([
          {
            type: "input",
            name: "bucket",
            message: "S3 bucket name:",
            validate: (input: string) => input.length > 0 || "Bucket name required",
          },
          {
            type: "input",
            name: "region",
            message: "AWS region:",
            default: "us-east-1",
          },
        ]);
        backendConfig = s3Answers;
      } else if (choice === "gcs") {
        // Google Cloud Storage
        const gcsAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "bucket",
            message: "GCS bucket name:",
            validate: (input: string) => input.length > 0 || "Bucket name required",
          },
        ]);
        backendConfig = {
          bucket: gcsAnswers.bucket,
          endpoint: S3_ENDPOINTS.gcs,
          region: "auto",
        };
        console.log(
          chalk.dim("\nNote: Set GOOGLE_APPLICATION_CREDENTIALS or use gcloud auth\n")
        );
      } else if (choice === "r2") {
        // Cloudflare R2
        const r2Answers = await inquirer.prompt([
          {
            type: "input",
            name: "bucket",
            message: "R2 bucket name:",
            validate: (input: string) => input.length > 0 || "Bucket name required",
          },
          {
            type: "input",
            name: "accountId",
            message: "Cloudflare account ID:",
            validate: (input: string) => input.length > 0 || "Account ID required",
          },
        ]);
        backendConfig = {
          bucket: r2Answers.bucket,
          endpoint: `https://${r2Answers.accountId}.r2.cloudflarestorage.com`,
          region: "auto",
        };
        console.log(
          chalk.dim("\nNote: Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY with R2 API tokens\n")
        );
      } else {
        // Custom S3-compatible
        const customAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "bucket",
            message: "Bucket name:",
            validate: (input: string) => input.length > 0 || "Bucket name required",
          },
          {
            type: "input",
            name: "endpoint",
            message: "S3 endpoint URL:",
            validate: (input: string) =>
              input.startsWith("http") || "Endpoint must be a URL",
          },
          {
            type: "input",
            name: "region",
            message: "Region (if required):",
            default: "us-east-1",
          },
        ]);
        backendConfig = customAnswers;
      }
    }
  }

  // Initialize backend
  const backendSpinner = ora(`Setting up ${backend} backend...`).start();

  try {
    if (backend === "git") {
      await initGitBackend(backendConfig.url);
    }
    // S3 backends don't need initialization - just config

    backendSpinner.succeed(`${backend} backend configured`);
  } catch (error) {
    backendSpinner.fail(`Failed to set up ${backend} backend`);
    throw error;
  }

  // Set up the encryption key. Never replace an existing one: everything already
  // pushed with it would become unreadable.
  const spinner = ora("Setting up encryption key...").start();
  let joined = false;

  try {
    if (options.key) {
      await importKey(options.key.trim());
      spinner.succeed("Encryption key imported");
    } else if (await keyExists()) {
      spinner.succeed("Using existing encryption key");
    } else {
      // A fresh key can't read what another machine already pushed
      const remote = await getBackend({ backend, backendConfig, initialized: true, createdAt: "" });
      const files = await remote.list();
      if (files.length > 0 && process.stdin.isTTY) {
        spinner.stop();
        await promptForKey(remote, files);
        joined = true;
      } else if (files.length > 0) {
        spinner.fail("This storage already has synced sessions");
        console.log(
          chalk.dim("Run init again with ") +
            chalk.cyan("--key <base64>") +
            chalk.dim(", using the key from your other machine (") +
            chalk.cyan("claude-sync key export") +
            chalk.dim(")\n")
        );
        process.exit(1);
      } else {
        const key = await generateKey();
        await saveKey(key);
        spinner.succeed("Encryption key generated and saved");
      }
    }
  } catch (error) {
    spinner.fail("Failed to set up encryption key");
    throw error;
  }

  // Save configuration
  await saveConfig({
    backend,
    backendConfig,
    initialized: true,
    createdAt: new Date().toISOString(),
  });

  if (joined) await askAboutFolders();

  console.log(chalk.green("\n✅ Claude Sync initialized successfully!\n"));
  console.log("Next steps:");
  console.log(
    chalk.dim("  1. Run ") +
      chalk.cyan("claude-sync sync") +
      chalk.dim(" for the first sync (it can take a while)")
  );
  console.log(
    chalk.dim("  2. Run ") +
      chalk.cyan("claude-sync install") +
      chalk.dim(" to sync automatically and add the notification area icon\n")
  );

  // Security reminder
  console.log(chalk.yellow("⚠️  Important:"));
  console.log(
    chalk.dim(
      "   Your encryption key is stored at ~/.claude-sync/key"
    )
  );
  console.log(
    chalk.dim("   Back it up with ") +
      chalk.cyan("claude-sync key export") +
      chalk.dim(" - without it, you cannot decrypt your sessions\n")
  );
}
