"use client";
import { useRef } from "react";
import { useTick } from "../ticker";

export function ChordStrip({ data, color }: { data: () => ChordView | null; color: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useTick(() => {
    if (!rootRef.current) return;
    const d = data();
    const root = rootRef.current;
    if (!root) return;
    const nowEl = root.querySelector<HTMLElement>('[data-role="now"]');
    const nextEls = root.querySelectorAll<HTMLElement>('[data-role^="next"]');
    const keyEls = root.querySelectorAll<HTMLElement>('[data-role="key"]');

    if (!d) {
      if (nowEl) nowEl.textContent = "—";
      nextEls.forEach(el => el.textContent = "");
      keyEls.forEach(el => {
        const isBlack = el.dataset.black === "1";
        el.style.background = isBlack ? "#1a1a1d" : "#e8e6e0";
        el.style.boxShadow = "none";
      });
      return;
    }

    if (nowEl) nowEl.textContent = d.now;
    nextEls.forEach((el, i) => el.textContent = d.next[i] || "");
    keyEls.forEach(el => {
      const pc = Number(el.dataset.pc);
      const isActive = d.pcs.includes(pc);
      const isBlack = el.dataset.black === "1";
      el.style.background = isActive ? (isBlack ? color : "white") : (isBlack ? "#1a1a1d" : "#e8e6e0");
      el.style.boxShadow = isActive ? `0 0 8px ${color}` : "none";
    });
    const keyTextEl = root.querySelector<HTMLElement>('[data-role="key-text"]');
    if (keyTextEl) keyTextEl.textContent = d.key;
  });

  return (
    <div ref={rootRef} className="flex items-center gap-4 rounded-lg bg-black/30 px-3 py-2">
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">ACCORD</div>
        <div data-role="now" className="text-3xl font-black text-white min-w-[4.5rem]">—</div>
      </div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">ENSUITE</div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} data-role={`next${i}`} className={`text-sm font-bold ${i === 0 ? "text-neutral-100" : "text-neutral-300"}`} />
          ))}
        </div>
      </div>
      <div className="relative h-12 w-[140px]">
        {[
          { pc: 0, x: 0, black: false },
          { pc: 2, x: 20, black: false },
          { pc: 4, x: 40, black: false },
          { pc: 5, x: 60, black: false },
          { pc: 7, x: 80, black: false },
          { pc: 9, x: 100, black: false },
          { pc: 11, x: 120, black: false },
          { pc: 1, x: 14, black: true },
          { pc: 3, x: 34, black: true },
          { pc: 6, x: 74, black: true },
          { pc: 8, x: 94, black: true },
          { pc: 10, x: 114, black: true }
        ].map(({ pc, x, black }) => (
          <div
            key={pc}
            data-role="key"
            data-pc={pc}
            data-black={black ? "1" : undefined}
            className="absolute h-full w-[20px] bg-[#e8e6e0]"
            style={{
              left: `${x}px`,
              width: black ? "12px" : "20px",
              height: black ? "30px" : "48px",
              zIndex: black ? 10 : 0
            }}
          />
        ))}
      </div>
      <div data-role="key-text" className="ml-auto text-[11px] text-neutral-300" />
    </div>
  );
}

export interface ChordView {
  now: string;
  next: string[];
  pcs: number[];
  key: string;
}
