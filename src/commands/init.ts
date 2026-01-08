import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { generateKey, saveKey } from "../crypto/keys.js";
import { initGitBackend } from "../backends/git.js";
import { saveConfig } from "../utils/config.js";

interface InitOptions {
  git?: string;
  s3?: string;
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
    backendConfig = { bucket: options.s3 };
  } else {
    // Interactive setup
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "backend",
        message: "Where do you want to store your synced sessions?",
        choices: [
          { name: "Git repository (GitHub, GitLab, etc.)", value: "git" },
          { name: "S3-compatible storage (AWS, R2, MinIO)", value: "s3" },
        ],
      },
    ]);

    backend = answers.backend;

    if (backend === "git") {
      const gitAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "url",
          message: "Git repository URL (use a private repo!):",
          validate: (input: string) =>
            input.includes("github.com") || input.includes("gitlab.com")
              ? true
              : "Please enter a valid Git URL",
        },
      ]);
      backendConfig = { url: gitAnswers.url };
    } else {
      const s3Answers = await inquirer.prompt([
        {
          type: "input",
          name: "bucket",
          message: "S3 bucket name:",
        },
        {
          type: "input",
          name: "endpoint",
          message: "S3 endpoint (leave blank for AWS):",
          default: "",
        },
      ]);
      backendConfig = s3Answers;
    }
  }

  // Generate encryption key
  const spinner = ora("Generating encryption key...").start();

  try {
    const key = await generateKey();
    await saveKey(key);
    spinner.succeed("Encryption key generated and saved");
  } catch (error) {
    spinner.fail("Failed to generate encryption key");
    throw error;
  }

  // Initialize backend
  const backendSpinner = ora(`Setting up ${backend} backend...`).start();

  try {
    if (backend === "git") {
      await initGitBackend(backendConfig.url);
    }
    // TODO: S3 backend initialization

    backendSpinner.succeed(`${backend} backend configured`);
  } catch (error) {
    backendSpinner.fail(`Failed to set up ${backend} backend`);
    throw error;
  }

  // Save configuration
  await saveConfig({
    backend,
    backendConfig,
    initialized: true,
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green("\n✅ Claude Sync initialized successfully!\n"));
  console.log("Next steps:");
  console.log(
    chalk.dim("  1. Run ") +
      chalk.cyan("claude-sync install") +
      chalk.dim(" to add hooks to Claude Code")
  );
  console.log(
    chalk.dim("  2. Your sessions will now sync automatically\n")
  );

  // Security reminder
  console.log(chalk.yellow("⚠️  Important:"));
  console.log(
    chalk.dim(
      "   Your encryption key is stored at ~/.claude-sync/key"
    )
  );
  console.log(
    chalk.dim("   Back it up safely - without it, you cannot decrypt your sessions\n")
  );
}
