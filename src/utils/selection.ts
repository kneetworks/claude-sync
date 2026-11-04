/**
 * Which projects and conversations this machine syncs. Everything syncs unless it is
 * unchecked here, so new conversations sync too unless their project is unchecked.
 * Kept in this machine's config: the other machines still sync what this one skips.
 */
export interface Selection {
  /** Portable project name -> false to stop syncing the project */
  projects?: Record<string, boolean>;
  /** "<project>/<session id>" -> whether to sync it, overriding its project */
  conversations?: Record<string, boolean>;
}

/**
 * The conversation a remote path belongs to: "<project>/<session>.jsonl" and
 * "<project>/<session>/subagents/..." are both "<project>/<session>"
 */
export function conversationKey(remotePath: string): string {
  const [project, entry = ""] = remotePath.split("/");
  return `${project}/${entry.replace(/\.jsonl$/, "")}`;
}

export function isSelected(remotePath: string, selection: Selection = {}): boolean {
  const project = remotePath.split("/")[0];
  return (
    selection.conversations?.[conversationKey(remotePath)] ??
    selection.projects?.[project] ??
    true
  );
}

/**
 * Sync or skip a whole project, including conversations started in it later
 */
export function selectProject(selection: Selection, project: string, sync: boolean): Selection {
  const projects = { ...selection.projects };
  if (sync) delete projects[project];
  else projects[project] = false;

  // Like a folder in a selective sync dialog: (un)checking it applies to everything inside
  const conversations = Object.fromEntries(
    Object.entries(selection.conversations ?? {}).filter(([key]) => !key.startsWith(`${project}/`))
  );
  return { projects, conversations };
}

export function selectConversation(selection: Selection, key: string, sync: boolean): Selection {
  const project = key.split("/")[0];
  const conversations = { ...selection.conversations };
  if (sync === (selection.projects?.[project] ?? true)) delete conversations[key];
  else conversations[key] = sync;
  return { ...selection, conversations };
}
