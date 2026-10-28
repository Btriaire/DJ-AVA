import { useEffect, useRef, type RefObject } from "react";

// One requestAnimationFrame for every canvas meter of the app, each at its own rate (30 per second by default),
// skipped while its element is off screen and while the window is hidden (MaRuche/Falken)

type DrawFn = (now: number) => void;

interface Subscriber {
  target: RefObject<Element | null>;
  fps: number;
  lastCall: number;
  drawRef: RefObject<DrawFn>;
  visible: boolean;
  observer: IntersectionObserver;
}

const subscribers = new Set<Subscriber>();
let rafId: number | null = null;

function loop(timestamp: number) {
  if (document.hidden) {
    schedule();
    return;
  }

  for (const sub of subscribers) {
    if (!sub.visible) continue;
    const interval = 1000 / sub.fps;
    if (timestamp - sub.lastCall >= interval) {
      sub.lastCall = timestamp;
      sub.drawRef.current(timestamp);
    }
  }

  schedule();
}

function schedule() {
  if (subscribers.size === 0) {
    rafId = null;
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function addSubscriber(sub: Subscriber) {
  subscribers.add(sub);
  if (subscribers.size === 1) schedule();
}

function removeSubscriber(sub: Subscriber) {
  subscribers.delete(sub);
  if (subscribers.size === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function useFrameLoop(
  target: RefObject<Element | null>,
  draw: DrawFn,
  fps = 30
): void {
  const drawRef = useRef<DrawFn>(draw);
  // keep the latest draw without re‑subscribing
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    const element = target.current;
    if (!element) return;

    const subscriber: Subscriber = {
      target,
      fps,
      lastCall: 0,
      drawRef,
      visible: true,
      observer: new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            subscriber.visible = entry.isIntersecting;
          }
        },
        { rootMargin: "100px" }
      ),
    };

    subscriber.observer.observe(element);
    addSubscriber(subscriber);

    return () => {
      subscriber.observer.disconnect();
      removeSubscriber(subscriber);
    };
  }, [target, fps]); // target ref is stable, fps is primitive
}
