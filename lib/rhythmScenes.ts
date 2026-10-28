// Named sets of the links of one deck: saved, then recalled on either deck (the links get new ids)
import type { RhythmRoute } from "./audio/rhythmBus";

const KEY = "djsynth.rhythm.scenes.v1";

export function listScenes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(KEY);
    return data ? Object.keys(JSON.parse(data)) : [];
  } catch {
    return [];
  }
}

export function getScene(name: string, newId: () => string): RhythmRoute[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const data = localStorage.getItem(KEY);
    if (!data) return undefined;
    const scenes = JSON.parse(data);
    return scenes[name]?.map((r: RhythmRoute) => ({ ...r, id: newId() }));
  } catch {
    return undefined;
  }
}

export function saveScene(name: string, routes: RhythmRoute[]): void {
  if (typeof window === "undefined") return;
  try {
    const data = localStorage.getItem(KEY);
    const scenes = data ? JSON.parse(data) : {};
    scenes[name] = routes;
    localStorage.setItem(KEY, JSON.stringify(scenes));
  } catch { /* private window */ }
}

export function deleteScene(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const data = localStorage.getItem(KEY);
    if (!data) return;
    const scenes = JSON.parse(data);
    delete scenes[name];
    localStorage.setItem(KEY, JSON.stringify(scenes));
  } catch { /* private window */ }
}
