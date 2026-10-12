"use client";
import { useLayoutEffect } from "react";

export function useAutoFit(enabled: boolean, layoutKey: string): void {
  useLayoutEffect(() => {
    if (!enabled || !("zoom" in document.documentElement.style)) {
      document.documentElement.style.zoom = "";
      return;
    }

    const root = document.documentElement;
    let rafId: number | null = null;

    const fit = () => {
      root.style.zoom = "1";
      const need = root.scrollWidth;
      const avail = root.clientWidth;
      const z = need > avail ? Math.max(0.6, Math.floor((avail / need) * 100) / 100) : 1;
      root.style.zoom = z < 1 ? String(z) : "";
    };

    fit();

    const handleResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      root.style.zoom = "";
    };
  }, [enabled, layoutKey]); // No ResizeObserver to avoid infinite loops with zoom
}
