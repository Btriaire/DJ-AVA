"use client";
import { useState } from "react";
import { DjFxPanel } from "./DjFxPanel";
import { RetouchPanel } from "./RetouchPanel";
import { FXRack } from "@/lib/audio/FXRack";
import { Retouch } from "@/lib/audio/Retouch";

interface Props {
  rack: FXRack;
  retouch: Retouch;
  color: string;
}

export function FxSection({ rack, retouch, color }: Props) {
  const [activeTab, setActiveTab] = useState<"djfx" | "retouch">("djfx");

  return (
    <div className="flex flex-col gap-2">
      {/* Tab bar */}
      <div className="flex gap-1">
        <button
          className={`hw-btn px-3 py-1.5 text-xs font-bold ${activeTab === "djfx" ? "" : "opacity-70"}`}
          style={activeTab === "djfx" ? { backgroundColor: color, color: "white" } : undefined}
          onClick={() => setActiveTab("djfx")}
        >
          DJ FX
        </button>
        <button
          className={`hw-btn px-3 py-1.5 text-xs font-bold relative ${activeTab === "retouch" ? "" : "opacity-70"}`}
          style={activeTab === "retouch" ? { backgroundColor: color, color: "white" } : undefined}
          onClick={() => setActiveTab("retouch")}
        >
          RETOUCHE
          {!retouch.isNeutral() && (
            <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "djfx" && <DjFxPanel rack={rack} color={color} />}
      {activeTab === "retouch" && <RetouchPanel retouch={retouch} color={color} />}
    </div>
  );
}
