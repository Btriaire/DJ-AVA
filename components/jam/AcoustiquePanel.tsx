"use client"
import { useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { sessionModule } from "@/lib/audio/session";
import { classiqueModule } from "@/lib/audio/classique";
import { chordHarmony } from "@/lib/audio/chordHarmony";
import { lyricChoir } from "@/lib/audio/lyricChoir";
import { JamHelp } from "./JamHelp";
import { ViolinMark } from "./ViolinMark";
import { AcoustiqueAmbiances } from "./AcoustiqueAmbiances";
import { AcoustiqueMinuteur } from "./AcoustiqueMinuteur";
import { ClassiqueSalle } from "./ClassiqueSalle";
import { ClassiqueDynamique } from "./ClassiqueDynamique";
import { ClassiqueEnchainement } from "./ClassiqueEnchainement";
import { AcoustiqueSection } from "./AcoustiqueSection";
import { AcoustiqueHarmonie } from "./AcoustiqueHarmonie";
import { AcoustiqueChoeur } from "./AcoustiqueChoeur";

const C = "oklch(0.82 0.08 80)";

export function AcoustiquePanel({ engine }: { engine: DJEngine }) {
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const m = sessionModule(engine);
  const c = classiqueModule(engine);
  const h = chordHarmony(engine);
  const ch = lyricChoir(engine);

  return (
    <section className="hw-panel hw-screwed relative isolate flex flex-col gap-3 overflow-hidden p-3" aria-label="Acoustique">
      <ViolinMark color={C} className="pointer-events-none absolute -right-4 bottom-2 -z-10 h-[75%] w-auto opacity-[0.10]" />
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: C }} />
      <header className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: C }} />
        <h3 className="text-[13px] font-black uppercase tracking-[0.22em] text-neutral-100">Acoustique</h3>
        <span className="text-[10px] text-[var(--jam-text-3)]">piano, guitare, handpan, zen, classique</span>
        <button
          className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-black tracking-[0.15em] text-[var(--jam-text-3)] hover:bg-white/5 hover:text-[var(--jam-text)]"
          type="button"
          onClick={() => { m.reset(); c.reset(); h.reset(); ch.reset(); bump(); }}
        >
          RÀZ
        </button>
      </header>
      <JamHelp>
        Pour les musiques acoustiques, du piano au handpan et du zen au classique. Pas de grille ni de tempo : choisis un instrument pour régler d&apos;un coup ambiances, tonalité et salle, affine ensuite à la main. Un minuteur termine la séance en fondu, une jauge montre si la dynamique est préservée, et un fondu long enchaîne deux morceaux. L&apos;harmonie joue l&apos;accord le plus fort de chaque mesure du morceau, au piano, aux cordes, en nappe sombre ou à la guitare flamenco. Le chœur sur paroles récupère les paroles minutées du morceau et joue nappe, cordes et chœur sur chaque phrase chantée, dans l&apos;accord du moment.
      </JamHelp>
      <div className="grid gap-3 @3xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <AcoustiqueSection title="Instrument et ambiances" hint="un clic règle tout" color={C}>
            <AcoustiqueAmbiances m={m} c={c} bump={bump} color={C} />
          </AcoustiqueSection>
          <AcoustiqueSection title="Harmonie" hint="l'accord le plus fort de chaque mesure" color={C}>
            <AcoustiqueHarmonie m={h} bump={bump} color={C} />
          </AcoustiqueSection>
          <AcoustiqueSection title="Chœur sur paroles" hint="nappe, cordes et chœur sur chaque phrase" color={C}>
            <AcoustiqueChoeur m={ch} bump={bump} color={C} />
          </AcoustiqueSection>
          <AcoustiqueSection title="Salle" hint="réverbération de concert" color={C}>
            <ClassiqueSalle m={c} bump={bump} color={C} />
          </AcoustiqueSection>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <AcoustiqueSection title="Séance" hint="minuteur et arc des ambiances" color={C}>
            <AcoustiqueMinuteur m={m} bump={bump} color={C} />
          </AcoustiqueSection>
          <AcoustiqueSection title="Enchaînement de mouvements" hint="fondu entre deux platines" color={C}>
            <ClassiqueEnchainement m={c} bump={bump} color={C} />
          </AcoustiqueSection>
          <AcoustiqueSection title="Dynamique" hint="mesure en direct" color={C}>
            <ClassiqueDynamique m={c} bump={bump} color={C} />
          </AcoustiqueSection>
        </div>
      </div>
    </section>
  );
}
