"use client";
import { renderThumbA } from "./thumbs/ThumbsA";
import { renderThumbB } from "./thumbs/ThumbsB";
import type { ThumbKind } from "@/lib/moduleThumbs";

export function ModuleThumb({ kind, color, className }: { kind: ThumbKind; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 96 56" aria-hidden="true" focusable="false" className={className}>
      {renderThumbA(kind, color) ?? renderThumbB(kind, color)}
    </svg>
  );
}