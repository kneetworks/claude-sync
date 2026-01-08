import fs from "fs/promises";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import { homedir } from "os";

interface InstallOptions {
  global?: boolean;
  project?: boolean;
}

const HOOKS_CONFIG = {
  hooks: {
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: "claude-sync push --session $CLAUDE_SESSION_ID --file $CLAUDE_TRANSCRIPT_PATH",
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: "claude-sync pull",
          },
        ],
      },
    ],
  },
};

export async function install(options: InstallOptions): Promise<void> {
  // Default to global if neither specified
  const isGlobal = options.global || !options.project;

  const settingsPath = isGlobal
    ? path.join(homedir(), ".claude", "settings.json")
    : path.join(process.cwd(), ".claude", "settings.json");

  const spinner = ora(
    `Installing hooks to ${isGlobal ? "global" : "project"} settings...`
  ).start();

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });

    // Read existing settings or create new
    let settings: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existing);
    } catch {
      // File doesn't exist, start fresh
    }

    // Merge hooks (don't overwrite existing hooks)
    const existingHooks = (settings.hooks as Record<string, unknown[]>) || {};

    for (const [event, hookConfigs] of Object.entries(HOOKS_CONFIG.hooks)) {
      if (existingHooks[event]) {
        // Check if our hook already exists
        const alreadyInstalled = existingHooks[event].some((h: unknown) => {
          const hook = h as { hooks?: Array<{ command?: string }> };
          return hook.hooks?.some((hh) =>
            hh.command?.includes("claude-sync")
          );
        });

        if (!alreadyInstalled) {
          existingHooks[event] = [...existingHooks[event], ...hookConfigs];
        }
      } else {
        existingHooks[event] = hookConfigs;
      }
    }

    settings.hooks = existingHooks;

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    spinner.succeed(
      `Hooks installed to ${isGlobal ? "~/.claude/settings.json" : ".claude/settings.json"}`
    );

    console.log(chalk.green("\n✅ Claude Code will now sync sessions automatically!\n"));
    console.log(chalk.dim("Hooks installed:"));
    console.log(chalk.dim("  • SessionEnd → push current session"));
    console.log(chalk.dim("  • SessionStart → pull new sessions\n"));
  } catch (error) {
    spinner.fail(`Failed to install hooks: ${error}`);
    process.exit(1);
  }
}
