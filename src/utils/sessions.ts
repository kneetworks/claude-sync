import path from "path";
import { homedir } from "os";
import { glob } from "glob";

/** Stands in for the home directory in remote paths */
const HOME_TOKEN = "@home";

export interface LocalFile {
  /** Portable path used as the remote key, e.g. "@home-Workspace-app/<session>.jsonl" */
  remotePath: string;
  absPath: string;
}

function projectsDir(home: string): string {
  return path.join(home, ".claude", "projects");
}

/**
 * Claude Code names each project folder after the project's absolute path, with every
 * non-alphanumeric character replaced by "-" (C:\Users\me\app -> C--Users-me-app).
 */
export function encodeProjectDir(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Replace the home-directory part of a project folder name with a token, so a project
 * kept at the same place relative to home maps to the same remote path on every
 * machine, whatever the username or OS.
 */
export function toPortableProject(projectDir: string, home = homedir()): string {
  const encodedHome = encodeProjectDir(home);
  const rest = projectDir.slice(encodedHome.length);
  const underHome =
    projectDir.toLowerCase().startsWith(encodedHome.toLowerCase()) &&
    (rest === "" || rest.startsWith("-"));
  return underHome ? HOME_TOKEN + rest : projectDir;
}

/**
 * Inverse of toPortableProject() for this machine's home directory
 */
export function toLocalProject(portable: string, home = homedir()): string {
  if (portable === HOME_TOKEN || portable.startsWith(`${HOME_TOKEN}-`)) {
    return encodeProjectDir(home) + portable.slice(HOME_TOKEN.length);
  }
  return portable;
}

/**
 * Remote paths come from storage, so refuse anything that could escape the projects folder
 */
export function isSafeRemotePath(remotePath: string): boolean {
  const segments = remotePath.split("/");
  return (
    segments.length >= 2 &&
    segments.every(
      (s) => s !== "" && s !== "." && s !== ".." && !/[\\:\0]/.test(s)
    )
  );
}

export function toRemotePath(relPath: string, home = homedir()): string {
  const [project, ...rest] = relPath.split("/");
  return [toPortableProject(project, home), ...rest].join("/");
}

export function toLocalPath(remotePath: string, home = homedir()): string {
  const [project, ...rest] = remotePath.split("/");
  return path.join(projectsDir(home), toLocalProject(project, home), ...rest);
}

/**
 * True if the remote path belongs to the given session: its transcript or the
 * folder holding its subagents and tool results
 */
export function belongsToSession(remotePath: string, sessionId: string): boolean {
  const entry = remotePath.split("/")[1];
  return entry === sessionId || entry === `${sessionId}.jsonl`;
}

/**
 * Find every file Claude Code keeps per project: transcripts, subagent
 * transcripts, tool results and memory
 */
export async function findLocalFiles(home = homedir()): Promise<LocalFile[]> {
  const dir = projectsDir(home);
  const files = await glob("*/**/*", {
    cwd: dir,
    nodir: true,
    dot: true,
    posix: true,
    ignore: "**/*.claude-sync-tmp",
  });

  return files.sort().map((relPath) => ({
    remotePath: toRemotePath(relPath, home),
    absPath: path.join(dir, ...relPath.split("/")),
  }));
}
