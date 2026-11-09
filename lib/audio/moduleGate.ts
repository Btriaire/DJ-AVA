// The modules closed in the picker: their engines listen here and generate nothing while closed
const closed = new Set<string>();
const listeners = new Map<string, Set<(open: boolean) => void>>();

export function moduleOpen(key: string): boolean {
  return !closed.has(key);
}

export function setModulesOpen(modules: Record<string, boolean>): void {
  for (const [key, open] of Object.entries(modules)) {
    const wasClosed = closed.has(key);
    if (open && wasClosed) {
      closed.delete(key);
      listeners.get(key)?.forEach((fn) => fn(true));
    } else if (!open && !wasClosed) {
      closed.add(key);
      listeners.get(key)?.forEach((fn) => fn(false));
    }
  }
}

export function onModuleGate(key: string, fn: (open: boolean) => void): () => void {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key)?.add(fn);
  if (closed.has(key)) {
    fn(false);
  }
  return () => {
    listeners.get(key)?.delete(fn);
  };
}
