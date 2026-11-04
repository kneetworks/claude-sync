import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ora from "ora";
import chalk from "chalk";
import { homedir } from "os";
import { loadConfig } from "../utils/config.js";
import { hasDesktop, setUpTray, TRAY_AREA } from "./tray.js";

interface InstallOptions {
  global?: boolean;
  project?: boolean;
  /** With --tray: also the notification area icon, started at login */
  tray?: boolean;
}

interface HookGroup {
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

const CLI = fileURLToPath(new URL("../cli.js", import.meta.url));
const GLOBAL_SETTINGS = path.join(homedir(), ".claude", "settings.json");
const EVENTS = ["SessionStart", "SessionEnd"];

/**
 * Absolute node + CLI paths, so hooks work whatever the PATH is when Claude Code runs them.
 * Forward slashes keep the command valid in both cmd and Git Bash on Windows.
 */
function hookCommand(): string {
  const quote = (p: string) => `"${p.replace(/\\/g, "/")}"`;
  return `${quote(process.execPath)} ${quote(CLI)} sync --hook`;
}

const isOurCommand = (command = "") => command.includes("claude-sync") || command.includes("sync --hook");

async function readSettings(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    // Doesn't exist yet
    return {};
  }
}

/**
 * Add claude-sync's hooks to a Claude Code settings file, replacing earlier
 * claude-sync hooks and keeping every other one
 */
export async function installHooks(settingsPath = GLOBAL_SETTINGS): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const settings = await readSettings(settingsPath);
  const command = hookCommand();
  const hooks = (settings.hooks as Record<string, HookGroup[]>) || {};

  // Sync when a session starts (pick up the other machine's work) and ends (share
  // this one's)
  for (const event of EVENTS) {
    hooks[event] = [
      ...(hooks[event] || []).filter((group) => !group.hooks?.some((h) => isOurCommand(h.command))),
      { hooks: [{ type: "command", command, timeout: 120 }] },
    ];
  }

  settings.hooks = hooks;
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

export interface HooksStatus {
  state: "ok" | "missing" | "broken";
  /** When broken: the program the hooks run, which no longer exists */
  missing?: string;
  /** The hooks run another copy of claude-sync than this one */
  otherCopy?: boolean;
}

/**
 * The quoted paths in a hook command: node and claude-sync
 */
export function commandPaths(command: string): string[] {
  return [...command.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

/**
 * Whether Claude Code's global settings run claude-sync when a session starts and
 * ends, with a node and a claude-sync that still exist
 */
export async function hooksStatus(): Promise<HooksStatus> {
  const hooks = ((await readSettings(GLOBAL_SETTINGS)).hooks ?? {}) as Record<string, HookGroup[]>;
  const commands = EVENTS.map((event) =>
    (hooks[event] ?? []).flatMap((group) => group.hooks ?? []).find((h) => isOurCommand(h.command))?.command
  );
  if (commands.some((command) => !command)) return { state: "missing" };

  for (const command of commands as string[]) {
    for (const file of commandPaths(command)) {
      const exists = await fs.access(file).then(() => true, () => false);
      if (!exists) return { state: "broken", missing: file };
    }
  }

  const same = (a: string, b: string) => {
    const normal = (p: string) => path.resolve(p).toLowerCase();
    return process.platform === "win32" || process.platform === "darwin" ? normal(a) === normal(b) : path.resolve(a) === path.resolve(b);
  };
  const cli = commandPaths(commands[0]!)[1];
  return { state: "ok", otherCopy: !!cli && !same(cli, CLI) };
}

export async function install(options: InstallOptions): Promise<void> {
  // Default to global if neither specified
  const isGlobal = options.global || !options.project;

  const settingsPath = isGlobal
    ? GLOBAL_SETTINGS
    : path.join(process.cwd(), ".claude", "settings.json");

  const spinner = ora(
    `Installing hooks to ${isGlobal ? "global" : "project"} settings...`
  ).start();

  try {
    await installHooks(settingsPath);

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

  if (!options.tray) return;
  if (!hasDesktop()) {
    console.log(chalk.dim(`No desktop session here, so no ${TRAY_AREA} icon.\n`));
    return;
  }
  try {
    await setUpTray();
    console.log(chalk.green(`✅ claude-sync is in the ${TRAY_AREA} and starts when you log in.`));
    console.log(chalk.dim((await loadConfig())?.initialized
      ? "   Click its icon to see what's syncing and choose what syncs on this computer.\n"
      : "   Click its icon to connect your storage.\n"));
  } catch (error) {
    console.log(chalk.yellow(`⚠ Couldn't add the ${TRAY_AREA} icon: ${(error as Error).message}`));
    console.log(chalk.dim("  Sync still runs from the hooks. Try again with `claude-sync tray --startup`.\n"));
  }
}
