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
