import { requestFreeMemory } from "@/lib/memory";

// Memory governor. DJSynth runs on machines with little RAM (8 GB shared with everything else), so the
// limits follow the memory of the machine and the app reacts by itself instead of waiting for a click:
//   warn     : free what can be freed (Atelier undo, inactive stems, HTTP cache), at most every 45 s
//   critical : same, and heavy background work (stem separation, radio analysis) slows down or pauses
// The native side (Electron) reports the memory of the window AND of the local server with its children.

export type MemLevel = "ok" | "warn" | "critical";

export interface NativeMemory {
  appMB: number;
  serverMB: number;
  totalMB?: number; // RAM of the machine
}

declare global {
  interface Window {
    djsynthNative?: {
      memory: () => Promise<NativeMemory>;
      trim: () => Promise<boolean>;
    };
  }
}

export interface MemSnap {
  appMB: number;
  serverMB: number;
  usedMB: number;
  totalMB: number;
  warnMB: number;
  criticalMB: number;
  level: MemLevel;
  autoFrees: number; // times the governor freed memory by itself
  profile: MemProfile;
}

// How much of the machine DJSynth may use before it slows its background work. macOS gives memory on demand:
// these are DJSynth's own limits, chosen by the user (Économe leaves room for other apps, Maximum takes almost all).
export type MemProfile = "eco" | "normal" | "max";
export const MEM_PROFILE_LABEL: Record<MemProfile, string> = { eco: "Économe", normal: "Normal", max: "Maximum" };
const SHARE: Record<MemProfile, [number, number]> = { eco: [0.22, 0.36], normal: [0.4, 0.6], max: [0.55, 0.8] };
const PROFILE_KEY = "djsynth.memprofile";

export function getMemProfile(): MemProfile {
  try {
    const v = localStorage.getItem(PROFILE_KEY);
    return v === "eco" || v === "max" || v === "normal" ? v : "normal";
  } catch {
    return "normal";
  }
}
export function setMemProfile(p: MemProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, p);
  } catch {
    // storage blocked: the choice lasts for this session only
  }
  void sample();
}

export function memoryLimits(totalMB: number, profile: MemProfile = "normal"): { warnMB: number; criticalMB: number } {
  const [w, c] = SHARE[profile];
  return { warnMB: Math.max(1500, Math.round(totalMB * w)), criticalMB: Math.max(2400, Math.round(totalMB * c)) };
}

export function levelFor(usedMB: number, totalMB: number, profile: MemProfile = "normal"): MemLevel {
  const { warnMB, criticalMB } = memoryLimits(totalMB, profile);
  return usedMB >= criticalMB ? "critical" : usedMB >= warnMB ? "warn" : "ok";
}

export const MEMORY_LEVEL_EVENT = "djsynth:memory-level";
const FREE_EVERY_MS = 45_000;

let snap: MemSnap | null = null;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastFree = 0;
let autoFrees = 0;

export const getMemSnap = () => snap;
export const subscribeMem = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
// read by the background workers: critical = do not start more heavy work
export const getMemLevel = (): MemLevel => snap?.level ?? "ok";

async function sample() {
  const native = typeof window !== "undefined" ? window.djsynthNative : undefined;
  if (!native) return; // web build: nothing to measure
  try {
    const m = await native.memory();
    const totalMB = m.totalMB ?? 8192;
    const usedMB = m.appMB + m.serverMB;
    const profile = getMemProfile();
    const level = levelFor(usedMB, totalMB, profile);
    const prev = snap?.level ?? "ok";
    const now = Date.now();
    if (level !== "ok" && now - lastFree > FREE_EVERY_MS) {
      lastFree = now;
      autoFrees++;
      requestFreeMemory();
      void native.trim();
    }
    snap = { appMB: m.appMB, serverMB: m.serverMB, usedMB, totalMB, ...memoryLimits(totalMB, profile), level, autoFrees, profile };
    listeners.forEach((l) => l());
    if (level !== prev) window.dispatchEvent(new CustomEvent(MEMORY_LEVEL_EVENT, { detail: level }));
  } catch {
    // the native bridge is gone (window closing): the next tick tries again
  }
}

function loop() {
  void sample().finally(() => {
    if (users > 0) timer = setTimeout(loop, snap && snap.level !== "ok" ? 2000 : 4000);
  });
}

// ref-counted: every mounted gauge starts it, the last one to leave stops it
export function startMemoryGovernor(): () => void {
  users++;
  if (users === 1) loop();
  return () => {
    users--;
    if (users === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// frees memory right now (the gauge click)
export async function freeMemoryNow(): Promise<void> {
  requestFreeMemory();
  await window.djsynthNative?.trim();
  lastFree = Date.now();
  await sample();
}
