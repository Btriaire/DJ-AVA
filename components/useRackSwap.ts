"use client"
import { useState, useRef, useCallback, useEffect } from "react";

export type Owner = Record<string, string>;

export function swapOwners(owner: Owner, a: string, b: string): Owner {
  if (a === b) return owner;
  const sa = Object.keys(owner).find(s => owner[s] === a);
  const sb = Object.keys(owner).find(s => owner[s] === b);
  if (!sa || !sb) return owner;
  return { ...owner, [sa]: b, [sb]: a };
}

export function validOwner(raw: unknown, slotIds: string[]): Owner {
  if (typeof raw !== "object" || raw === null) return Object.fromEntries(slotIds.map(s => [s, s]));
  const owner = raw as Owner;
  const keys = Object.keys(owner);
  if (keys.length !== slotIds.length || !keys.every(k => slotIds.includes(k))) return Object.fromEntries(slotIds.map(s => [s, s]));
  const values = Object.values(owner);
  if (values.length !== slotIds.length || !values.every(v => slotIds.includes(v))) return Object.fromEntries(slotIds.map(s => [s, s]));
  return owner;
}

export function rackSelfCheck(): string[] {
  const errors: string[] = [];
  const owner1 = { a: "a", b: "b", c: "c" };
  const swapped1 = swapOwners(owner1, "a", "b");
  if (swapped1.a !== "b" || swapped1.b !== "a") errors.push("swapOwners a-b failed");
  const swapped2 = swapOwners(swapped1, "a", "c");
  if (swapped2.a !== "b" || swapped2.b !== "c" || swapped2.c !== "a") errors.push("swapOwners a-c after a-b failed");
  const owner2 = swapOwners(owner1, "a", "a");
  if (owner2 !== owner1) errors.push("swapOwners a-a failed");
  const owner3 = swapOwners(owner1, "a", "d");
  if (owner3 !== owner1) errors.push("swapOwners a-d failed");
  const owner4 = validOwner({ a: "a", b: "b", c: "c" }, ["a", "b", "c"]);
  if (JSON.stringify(owner4) !== JSON.stringify({ a: "a", b: "b", c: "c" })) errors.push("validOwner valid failed");
  const owner5 = validOwner({ a: "a", b: "b", c: "d" }, ["a", "b", "c"]);
  if (JSON.stringify(owner5) !== JSON.stringify({ a: "a", b: "b", c: "c" })) errors.push("validOwner invalid failed");
  const owner6 = validOwner(null, ["a", "b", "c"]);
  if (JSON.stringify(owner6) !== JSON.stringify({ a: "a", b: "b", c: "c" })) errors.push("validOwner null failed");
  return errors;
}

export function useRackSwap(slotIds: string[]) {
  const [owner, setOwner] = useState<Owner>(() => {
    try {
      const raw = localStorage.getItem("djsynth.rackswap.v1");
      return validOwner(raw ? JSON.parse(raw) : null, slotIds);
    } catch {
      return Object.fromEntries(slotIds.map(s => [s, s]));
    }
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("djsynth.rackswap.v1", JSON.stringify(owner));
    } catch {}
  }, [owner]);

  const grip = useCallback((moduleId: string) => {
    const onPointerDown = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragId(moduleId);
      setOverId(null);
      dragIdRef.current = moduleId;
      overIdRef.current = null;
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (dragIdRef.current === null) return;
      const element = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-rackmod]");
      const newOverId = element?.dataset.rackmod ?? null;
      setOverId(newOverId !== dragIdRef.current ? newOverId : null);
      overIdRef.current = newOverId !== dragIdRef.current ? newOverId : null;
      if (e.clientY < 80) window.scrollBy(0, -18);
      if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 18);
    };

    const onPointerUp = (e: React.PointerEvent) => {
      if (dragIdRef.current && overIdRef.current) {
        const currentDragId = dragIdRef.current;
        const currentOverId = overIdRef.current;
        setOwner(prev => swapOwners(prev, currentDragId, currentOverId));
      }
      setDragId(null);
      setOverId(null);
      dragIdRef.current = null;
      overIdRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    };

    const onPointerCancel = () => {
      setDragId(null);
      setOverId(null);
      dragIdRef.current = null;
      overIdRef.current = null;
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: {
        touchAction: "none",
        cursor: dragId === moduleId ? "grabbing" : "grab",
      } as React.CSSProperties,
    };
  }, [dragId]);

  const ownerOf = useCallback((slot: string) => owner[slot], [owner]);

  const reset = useCallback(() => {
    setOwner(Object.fromEntries(slotIds.map(s => [s, s])));
  }, [slotIds]);

  return { ownerOf, dragId, overId, grip, reset };
}
