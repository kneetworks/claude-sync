import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../utils/config.js";
import { expandHome } from "../utils/sessions.js";
import type { Config } from "../backends/index.js";

async function requireConfig(): Promise<Config> {
  const config = await loadConfig();
  if (!config?.initialized) {
    console.log(chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first."));
    process.exit(1);
  }
  return config;
}

/**
 * Write a folder on the other machines as "~/..." when it's under home, so the same
 * folder is recognised whichever home it was typed with (shells may expand "~")
 */
function normalizeOther(other: string): string {
  const home = homedir();
  const absolute = path.resolve(expandHome(other, home));
  const relative = path.relative(home, absolute);
  if (relative === "") return "~";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return absolute;
  return `~/${relative.split(path.sep).join("/")}`;
}

export async function folderAdd(other: string, here: string): Promise<void> {
  const config = await requireConfig();
  const key = normalizeOther(other);
  const local = path.resolve(here);

  const isDir = await fs.stat(local).then((s) => s.isDirectory(), () => false);
  if (!isDir) {
    console.log(chalk.red(`Error: ${local} is not a folder on this machine.`));
    process.exit(1);
  }

  config.folders = { ...config.folders, [key]: local };
  await saveConfig(config);
  console.log(chalk.green(`✅ Projects in ${key} on your other machines sync to ${local} here`));
}

export async function folderRemove(other: string): Promise<void> {
  const config = await requireConfig();
  const key = normalizeOther(other);

  if (!config.folders?.[key]) {
    console.log(chalk.yellow(`${key} isn't mapped to a folder here.`));
    return;
  }

  delete config.folders[key];
  await saveConfig(config);
  console.log(chalk.green(`✅ Projects in ${key} sync to the same place as on your other machines`));
}
