"use client";
import { useState } from "react";
import { Icon } from "../prep/parts";

export interface TopicBoxProps {
  mode: "artists" | "style" | "collection" | "zen" | "calm";
  chosen: string[]; // names already in the radio
  locked: boolean;
  onAdd: (topic: string) => void;
}

const SUGGESTIONS: Record<TopicBoxProps["mode"], string[]> = {
  zen: ["musique zen", "ambient relaxant", "méditation", "musique pour dormir", "sons de la nature et piano"],
  calm: ["piano relaxant", "piano calme", "piano de film", "piano et pluie", "piano jazz doux"],
  style: ["jazz", "bossa nova", "rock années 80", "reggae", "lofi chill", "pop française", "électro chill", "hip-hop classique"],
  collection: ["tubes de l'été", "chansons d'amour", "rock années 70", "soul", "musique de film", "chanson française"],
  artists: ["jazz", "bossa nova", "rock années 80", "zen", "piano relaxant", "pop française", "électro chill", "reggae"],
};

// No artist in mind? A style, a mood or a time is enough: the radio looks for the songs most watched for it.
export function TopicBox({ mode, chosen, locked, onAdd }: TopicBoxProps) {
  const [draft, setDraft] = useState("");
  const have = new Set(chosen.map((n) => n.toLowerCase()));
  const add = (t: string) => {
    const clean = t.replace(/\s+/g, " ").trim();
    if (!clean || locked) return;
    onAdd(clean);
    setDraft("");
  };
  return (
    <section className="prep-card flex flex-col gap-2.5 p-4">
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Sans connaître d&apos;artiste</h3>
        <p className="text-[12px] text-neutral-400">
          Tape un style, une ambiance ou une époque (« zen », « bossa nova », « rock années 80 »...). La radio prend les titres les plus écoutés pour cette recherche, de plusieurs artistes différents.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className="prep-input min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder="Un style ou une ambiance : musique zen, jazz, piano relaxant…"
          aria-label="Ajouter un style ou une ambiance"
          value={draft}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(draft);
          }}
        />
        <button type="button" className="prep-btn-accent flex items-center gap-1.5 px-3 py-2 text-sm" disabled={!draft.trim() || locked} onClick={() => add(draft)}>
          <Icon name="plus" size={16} />
          Ajouter
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS[mode].map((t) => (
          <button
            key={t}
            type="button"
            disabled={locked || have.has(t.toLowerCase())}
            onClick={() => add(t)}
            className="rounded-full border border-dashed border-[var(--prep-line)] px-2.5 py-1 text-[11px] text-neutral-300 hover:border-[var(--prep-accent)] hover:text-white disabled:opacity-40"
          >
            {have.has(t.toLowerCase()) ? t : `+ ${t}`}
          </button>
        ))}
      </div>
    </section>
  );
}
