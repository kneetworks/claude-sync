import { createHash } from "crypto";

export type Resolution = "same" | "take-remote" | "keep-local" | "conflict";

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return (
    data.length >= prefix.length &&
    data.subarray(0, prefix.length).equals(prefix)
  );
}

/**
 * Decide between the local file and a remote copy. Transcripts are append-only, so
 * when one copy extends the other the longer one wins. Otherwise the remote copy is
 * taken only if the local file hasn't changed since it was last synced.
 */
export function resolve(
  local: Buffer | null,
  remote: Buffer,
  lastSyncedHash?: string
): Resolution {
  if (!local) return "take-remote";
  if (local.equals(remote)) return "same";
  if (startsWith(remote, local)) return "take-remote";
  if (startsWith(local, remote)) return "keep-local";
  if (lastSyncedHash && sha256(local) === lastSyncedHash) return "take-remote";
  return "conflict";
}

/**
 * A project's memory index, which every machine adds one line per memory to
 */
export function isLineMerged(remotePath: string): boolean {
  return /^[^/]+\/memory\/MEMORY\.md$/.test(remotePath);
}

/**
 * A conversation's transcript, or one of its subagents': JSON lines, appended to
 */
export function isTranscript(remotePath: string): boolean {
  return remotePath.endsWith(".jsonl");
}

/**
 * When the latest user or assistant message in a transcript was written (ms since
 * the epoch), or 0 without one. Claude Code also appends bookkeeping records, such as
 * costs and titles, which don't count.
 */
export function latestMessageTime(transcript: Buffer): number {
  const text = transcript.toString("utf-8");
  let end = text.length;

  while (end > 0) {
    const start = text.lastIndexOf("\n", end - 1) + 1;
    const line = text.slice(start, end).trim();
    end = start - 1;
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if ((record.type === "user" || record.type === "assistant") && typeof record.timestamp === "string") {
        const time = Date.parse(record.timestamp);
        if (!Number.isNaN(time)) return time;
      }
    } catch {
      // A line cut short while it was being written
    }
  }
  return 0;
}

/**
 * The lines of `copy` from the first one that differs from `other`
 */
function divergedTail(copy: Buffer, other: Buffer): Buffer {
  const length = Math.min(copy.length, other.length);
  let i = 0;
  while (i < length && copy[i] === other[i]) i++;
  const lineStart = i === 0 ? 0 : copy.lastIndexOf(0x0a, i - 1) + 1;
  return copy.subarray(lineStart);
}

/**
 * Choose between two copies of a conversation that both moved on since they last
 * matched. Usually the conversation continued on another machine while Claude Code
 * here, still holding it open, wrote a few bookkeeping records to it. The copy with
 * the most recent message wins; the other only needs keeping if it has messages of
 * its own, which happens when the conversation really did go on in both places.
 */
export function pickTranscript(
  local: Buffer,
  remote: Buffer
): { take: "local" | "remote"; keepOther: boolean } {
  const takeRemote = latestMessageTime(remote) > latestMessageTime(local);
  const [winner, other] = takeRemote ? [remote, local] : [local, remote];
  return {
    take: takeRemote ? "remote" : "local",
    keepOther: latestMessageTime(divergedTail(other, winner)) > 0,
  };
}

/**
 * Combine two copies that both changed: every local line, plus each line only the
 * remote copy has, placed after the line it follows there. A line removed on one
 * side comes back, as with any file, since deletions aren't synced.
 */
export function mergeLines(local: Buffer, remote: Buffer): Buffer {
  const merged = local.toString("utf-8").split("\n");
  let next = 0;

  for (const line of remote.toString("utf-8").split("\n")) {
    const at = merged.indexOf(line, next);
    if (at !== -1) {
      next = at + 1;
    } else if (!merged.includes(line)) {
      merged.splice(next++, 0, line);
    }
  }

  return Buffer.from(merged.join("\n"), "utf-8");
}
