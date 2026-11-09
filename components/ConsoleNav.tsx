"use client";
import { useEffect, useRef, useState } from "react";

export function ConsoleNav({ watch }: { watch: string }) {
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scan = () => {
      const elements = Array.from(document.querySelectorAll('[id^="mod-"]'));
      const newItems = elements.map((el) => {
        const text = el.querySelector("h2, h3")?.textContent?.trim() ?? "";
        const label = text.length > 22 ? `${text.slice(0, 22)}…` : text;
        return { id: el.id, label };
      }).filter((item) => item.label);

      setItems(newItems);
    };

    scan();
    timer.current = setTimeout(scan, 600);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [watch]);

  useEffect(() => {
    if (items.length < 3) return;

    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.current?.observe(element);
    });

    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, [items]);

  if (items.length < 3) return null;

  return (
    <nav
      aria-label="Aller à un module"
      className="sticky top-0 z-30 bg-[oklch(0.19_0.012_260/0.92)] backdrop-blur border-b border-[oklch(0.32_0.015_260)]"
    >
      <div className="flex items-center overflow-x-auto whitespace-nowrap scrollbar-thin">
        <span className="text-[11px] px-2.5 py-1 text-[oklch(0.92_0.01_260)]">ALLER À</span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              const element = document.getElementById(item.id);
              if (element) {
                element.scrollIntoView({
                  behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                  block: "start",
                });
              }
            }}
            aria-current={activeId === item.id ? "true" : undefined}
            className={`text-[11px] px-2.5 py-1 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[oklch(0.83_0.10_215)] ${
              activeId === item.id
                ? "bg-[oklch(0.83_0.10_215)] text-[oklch(0.19_0.012_260)]"
                : "text-[oklch(0.78_0.01_260)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
