"use client";
import { COMPOSERS, ERA_LABEL, INSTRUMENT_LABEL, MOOD_LABEL, type Era, type Instrument, type Mood } from "@/lib/classical";
import { Icon } from "../prep/parts";

export interface ClassicalPanelProps {
  chosen: string[];
  eras: Era[];
  instrument: Instrument | "all";
  mood: Mood | "all";
  locked: boolean;
  onToggleComposer: (name: string) => void;
  onEras: (eras: Era[]) => void;
  onInstrument: (i: Instrument | "all") => void;
  onMood: (m: Mood | "all") => void;
}

export function ClassicalPanel(props: ClassicalPanelProps) {
  const { chosen, eras, instrument, mood, locked, onToggleComposer, onEras, onInstrument, onMood } = props;

  const filteredComposers = eras.length === 0
    ? COMPOSERS
    : COMPOSERS.filter(c => eras.includes(c.era));

  return (
    <section className="prep-card flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Musique classique</h3>
        <p className="text-[12px] text-neutral-400">Choisis des compositeurs : la radio cherche leurs pièces les plus connues, avec des enchaînements longs et doux. « Régénérer » en propose d&apos;autres.</p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Époque</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(ERA_LABEL).map(era => (
            <button
              key={era}
              type="button"
              aria-pressed={eras.includes(era as Era)}
              onClick={() => onEras(eras.includes(era as Era) ? eras.filter(e => e !== era) : [...eras, era as Era])}
              className="rounded-full border px-3 py-1 text-[11px] font-semibold"
              style={{
                borderColor: eras.includes(era as Era) ? "var(--prep-accent)" : "var(--prep-line)",
                backgroundColor: eras.includes(era as Era) ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent"
              }}
            >
              {ERA_LABEL[era as Era]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={eras.length === 0}
            onClick={() => onEras([])}
            className="rounded-full border px-3 py-1 text-[11px] font-semibold"
            style={{
              borderColor: eras.length === 0 ? "var(--prep-accent)" : "var(--prep-line)",
              backgroundColor: eras.length === 0 ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent"
            }}
          >
            Toutes
          </button>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Compositeurs</p>
        <div className="flex flex-wrap gap-2">
          {filteredComposers.map(composer => {
            const isChosen = chosen.some(c => c.toLowerCase() === composer.name.toLowerCase());
            return (
              <button
                key={composer.name}
                type="button"
                aria-pressed={isChosen}
                disabled={locked}
                onClick={() => onToggleComposer(composer.name)}
                className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold"
                style={{
                  borderColor: isChosen ? "var(--prep-accent)" : "var(--prep-line)",
                  backgroundColor: isChosen ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent"
                }}
                title={`${composer.name} : ${composer.works.length} pièces${isChosen ? " (déjà dans ta radio)" : ""}`}
              >
                {isChosen && <Icon name="check" size={12} />}
                {composer.name}
                <span className="text-[10px] font-mono">{composer.works.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Instrument</p>
        <div className="prep-seg" role="group" aria-label="Instrument">
          <button
            type="button"
            aria-pressed={instrument === "all"}
            onClick={() => onInstrument("all")}
          >
            Tous
          </button>
          {Object.keys(INSTRUMENT_LABEL).map(i => (
            <button
              key={i}
              type="button"
              aria-pressed={instrument === i}
              onClick={() => onInstrument(i as Instrument)}
            >
              {INSTRUMENT_LABEL[i as Instrument]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Ambiance</p>
        <div className="prep-seg" role="group" aria-label="Ambiance">
          <button
            type="button"
            aria-pressed={mood === "all"}
            onClick={() => onMood("all")}
          >
            Toutes
          </button>
          {Object.keys(MOOD_LABEL).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={mood === m}
              onClick={() => onMood(m as Mood)}
            >
              {MOOD_LABEL[m as Mood]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-500">L&apos;instrument et l&apos;ambiance passent en premier ; s&apos;il n&apos;y a pas assez de pièces, la radio complète avec d&apos;autres.</p>
      </div>
    </section>
  );
}
