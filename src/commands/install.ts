import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ora from "ora";
import chalk from "chalk";
import { homedir } from "os";

interface InstallOptions {
  global?: boolean;
  project?: boolean;
}

interface HookGroup {
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

/**
 * Absolute node + CLI paths, so hooks work whatever the PATH is when Claude Code runs them.
 * Forward slashes keep the command valid in both cmd and Git Bash on Windows.
 */
function hookCommand(): string {
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  const quote = (p: string) => `"${p.replace(/\\/g, "/")}"`;
  return `${quote(process.execPath)} ${quote(cli)} sync --hook`;
}

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

    const command = hookCommand();
    const hooks = (settings.hooks as Record<string, HookGroup[]>) || {};
    const isOurs = (group: HookGroup) =>
      !!group.hooks?.some(
        (h) => h.command?.includes("claude-sync") || h.command === command
      );

    // Sync when a session starts (pick up the other machine's work) and ends (share
    // this one's). Replace any earlier claude-sync hook, keep everything else.
    for (const event of ["SessionStart", "SessionEnd"]) {
      hooks[event] = [
        ...(hooks[event] || []).filter((group) => !isOurs(group)),
        { hooks: [{ type: "command", command, timeout: 120 }] },
      ];
    }

    settings.hooks = hooks;

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    spinner.succeed(
      `Hooks installed to ${isGlobal ? "~/.claude/settings.json" : ".claude/settings.json"}`
    );

    console.log(chalk.green("\n✅ Claude Code will now sync sessions automatically!\n"));
    console.log(chalk.dim("Hooks installed:"));
    console.log(chalk.dim("  • SessionStart → sync (pull, then push)"));
    console.log(chalk.dim("  • SessionEnd → sync (pull, then push)\n"));
  } catch (error) {
    spinner.fail(`Failed to install hooks: ${error}`);
    process.exit(1);
  }
}
