export const FREE_MEMORY_EVENT = "djsynth:free-memory";
export function requestFreeMemory(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FREE_MEMORY_EVENT));
  }
}
