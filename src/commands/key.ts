import chalk from "chalk";
import { exportKey, importKey } from "../crypto/keys.js";

export async function keyExport(): Promise<void> {
  console.log(await exportKey());
}

export async function keyImport(base64Key: string): Promise<void> {
  await importKey(base64Key.trim());
  console.log(chalk.green("✅ Encryption key imported"));
}
