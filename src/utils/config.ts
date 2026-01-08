import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import type { Config } from "../backends/index.js";

const CONFIG_DIR = path.join(homedir(), ".claude-sync");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export async function saveConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
