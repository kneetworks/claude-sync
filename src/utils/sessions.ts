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
 * A folder of projects kept somewhere else on this machine than on the others, as
 * project folder name prefixes: remote "@home-Workspace" is local "D--Projects"
 */
export interface FolderMapping {
  remote: string;
  local: string;
}

/** "~/Workspace" -> "<home>/Workspace" */
export function expandHome(folder: string, home = homedir()): string {
  return folder === "~" || /^~[\\/]/.test(folder) ? home + folder.slice(1) : folder;
}

/**
 * Encode the config's folders ("~/Workspace" elsewhere is "D:\Projects" here)
 */
export function toFolderMappings(
  folders: Record<string, string> = {},
  home = homedir()
): FolderMapping[] {
  return Object.entries(folders).map(([other, here]) => ({
    remote: toPortableProject(encodeProjectDir(expandHome(other, home)), home),
    local: encodeProjectDir(here),
  }));
}

/**
 * Replace the `from` prefix of a project folder name with `to`, or null if the
 * project isn't that folder or inside it
 */
function replacePrefix(name: string, from: string, to: string): string | null {
  const rest = name.slice(from.length);
  const inside =
    name.toLowerCase().startsWith(from.toLowerCase()) && (rest === "" || rest.startsWith("-"));
  return inside ? to + rest : null;
}

/**
 * Replace the home-directory part of a project folder name with a token, so a project
 * kept at the same place relative to home maps to the same remote path on every
 * machine, whatever the username or OS. Projects in a mapped folder are stored as if
 * they were where the other machines keep them.
 */
export function toPortableProject(
  projectDir: string,
  home = homedir(),
  folders: FolderMapping[] = []
): string {
  for (const { remote, local } of folders) {
    const mapped = replacePrefix(projectDir, local, remote);
    if (mapped !== null) return mapped;
  }
  return replacePrefix(projectDir, encodeProjectDir(home), HOME_TOKEN) ?? projectDir;
}

/**
 * Inverse of toPortableProject() for this machine's home directory and folders
 */
export function toLocalProject(
  portable: string,
  home = homedir(),
  folders: FolderMapping[] = []
): string {
  for (const { remote, local } of folders) {
    const mapped = replacePrefix(portable, remote, local);
    if (mapped !== null) return mapped;
  }
  return replacePrefix(portable, HOME_TOKEN, encodeProjectDir(home)) ?? portable;
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

export function toRemotePath(
  relPath: string,
  home = homedir(),
  folders: FolderMapping[] = []
): string {
  const [project, ...rest] = relPath.split("/");
  return [toPortableProject(project, home, folders), ...rest].join("/");
}

export function toLocalPath(
  remotePath: string,
  home = homedir(),
  folders: FolderMapping[] = []
): string {
  const [project, ...rest] = remotePath.split("/");
  return path.join(projectsDir(home), toLocalProject(project, home, folders), ...rest);
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
export async function findLocalFiles(
  home = homedir(),
  folders: FolderMapping[] = []
): Promise<LocalFile[]> {
  const dir = projectsDir(home);
  const files = await glob("*/**/*", {
    cwd: dir,
    nodir: true,
    dot: true,
    posix: true,
    ignore: "**/*.claude-sync-tmp",
  });

  return files.sort().map((relPath) => ({
    remotePath: toRemotePath(relPath, home, folders),
    absPath: path.join(dir, ...relPath.split("/")),
  }));
}
