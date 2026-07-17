// Client-side mirror of lib/stems.ts's hashBytes() (sha1, first 16 hex chars).
// Computing this in the browser lets the UI know a separation job's cache key
// immediately, so it can start polling /api/stems/progress before the actual
// separate/prefetch request even resolves.
export async function sha1Hex16(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
