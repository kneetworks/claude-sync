import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import { glob } from "glob";

const CLAUDE_DIR = path.join(homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

interface Session {
  id: string;
  path: string;
  project: string;
  modifiedAt: Date;
}

interface FindOptions {
  modifiedSinceLastSync?: boolean;
}

/**
 * Find all Claude Code sessions on this machine
 */
export async function findSessions(options?: FindOptions): Promise<Session[]> {
  const pattern = path.join(PROJECTS_DIR, "**", "*.jsonl");
  const files = await glob(pattern);

  const sessions: Session[] = [];

  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    const id = path.basename(filePath, ".jsonl");

    // Extract project from path
    const relativePath = path.relative(PROJECTS_DIR, filePath);
    const project = path.dirname(relativePath);

    sessions.push({
      id,
      path: filePath,
      project,
      modifiedAt: stat.mtime,
    });
  }

  if (options?.modifiedSinceLastSync) {
    // TODO: Compare with last sync timestamp
    // For now, return all
    return sessions;
  }

  return sessions;
}

/**
 * Read a session transcript file
 */
export async function readSession(sessionPath: string): Promise<string> {
  return fs.readFile(sessionPath, "utf-8");
}

/**
 * Write a session transcript file
 */
export async function writeSession(
  sessionPath: string,
  content: string
): Promise<void> {
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, content, "utf-8");
}

/**
 * Get the local path where a session should be stored
 */
export async function getSessionPath(
  sessionId: string,
  project: string
): Promise<string> {
  const projectDir = path.join(PROJECTS_DIR, project);
  await fs.mkdir(projectDir, { recursive: true });
  return path.join(projectDir, `${sessionId}.jsonl`);
}
