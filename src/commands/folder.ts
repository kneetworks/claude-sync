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

/**
 * Keep projects from `other` on the other machines in `here` on this one; throws if
 * `here` isn't a folder. Returns the mapping as saved.
 */
export async function addFolderMapping(
  config: Config,
  other: string,
  here: string
): Promise<{ other: string; here: string }> {
  const key = normalizeOther(other);
  const local = path.resolve(expandHome(here));

  const isDir = await fs.stat(local).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`${local} is not a folder on this machine.`);

  config.folders = { ...config.folders, [key]: local };
  await saveConfig(config);
  return { other: key, here: local };
}

/**
 * Undo addFolderMapping(); false if `other` wasn't mapped
 */
export async function removeFolderMapping(config: Config, other: string): Promise<boolean> {
  const key = normalizeOther(other);
  if (!config.folders?.[key]) return false;

  delete config.folders[key];
  await saveConfig(config);
  return true;
}

export async function folderAdd(other: string, here: string): Promise<void> {
  try {
    const mapping = await addFolderMapping(await requireConfig(), other, here);
    console.log(chalk.green(`✅ Projects in ${mapping.other} on your other machines sync to ${mapping.here} here`));
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

export async function folderRemove(other: string): Promise<void> {
  const key = normalizeOther(other);
  if (await removeFolderMapping(await requireConfig(), other)) {
    console.log(chalk.green(`✅ Projects in ${key} sync to the same place as on your other machines`));
  } else {
    console.log(chalk.yellow(`${key} isn't mapped to a folder here.`));
  }
}
