/** Calls that actually happened must have a Fathom recording on file. */
export const NEEDS_RECORDING = ["closed", "follow_up", "lost"] as const;

export function needsRecording(outcome: string): boolean {
  return (NEEDS_RECORDING as readonly string[]).includes(outcome);
}

/** Returns the cleaned link, or null if it isn't a valid Fathom link. */
export function cleanFathomUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    if (!u.hostname.toLowerCase().includes("fathom")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const RECORDING_HELP = "Paste the Fathom link for this call (e.g. https://fathom.video/share/…).";
