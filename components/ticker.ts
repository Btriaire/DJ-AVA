import { useEffect, useRef } from "react";

// one timer for every VU meter and activity light on the page, stopped when nobody listens and paused while the window is hidden
let timer: number | null = null;
let subs: (() => void)[] = [];

export function useTick(onTick: () => void) {
  const ref = useRef(onTick);
  useEffect(() => { ref.current = onTick; });
  useEffect(() => {
    const cb = () => ref.current();
    subs.push(cb);
    if (timer === null) timer = window.setInterval(() => { if (!document.hidden) subs.forEach((f) => f()); }, 60);
    return () => {
      subs = subs.filter((f) => f !== cb);
      if (!subs.length && timer !== null) { window.clearInterval(timer); timer = null; }
    };
  }, []);
}
