"use client";
import { useState } from "react";
import { Icon } from "../prep/parts";
import type { RadioPrefs } from "@/lib/radio";
import { speak, canSpeak } from "@/lib/djVoice";

export interface AdvancedPanelProps {
  prefs: RadioPrefs;
  busy: boolean; // the radio is running: everything is disabled
  onChange: (patch: Partial<RadioPrefs>) => void;
}

function Switch({
  on,
  label,
  hint,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  hint: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex items-start gap-3 text-left"
    >
      <div className="relative h-5 w-9 rounded-full bg-[var(--prep-line)]" style={{ backgroundColor: on ? "var(--prep-accent)" : undefined }}>
        <div className="absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : undefined }} />
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-semibold text-neutral-100">{label}</div>
        <div className="text-[11px] text-neutral-500">{hint}</div>
      </div>
    </button>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  onPick,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onPick: (value: T) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="prep-seg">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          aria-pressed={opt.value === value}
          disabled={disabled}
          onClick={() => onPick(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AdvancedPanel({ prefs, busy, onChange }: AdvancedPanelProps) {
  const [open, setOpen] = useState(false);

  const summary = `${prefs.version === "original" ? "Originaux" : prefs.version === "remix" ? "Remixes" : "Les deux"} · ${prefs.harmony === "strict" ? "Strictes" : prefs.harmony === "balanced" ? "Équilibrées" : "Libres"} · tempo ±${prefs.tempoSpread} % · DJ ${prefs.dj.auto ? "intelligent" : "simple"}`;

  return (
    <section className="prep-card flex flex-col gap-3 p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left"
      >
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Réglages avancés</div>
        <div className="flex-1 truncate text-[11px] text-neutral-500">{summary}</div>
        <Icon name="chevron" className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <>
          <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--prep-line)] p-3">
            <legend className="px-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500">Titres</legend>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Versions</div>
              <Seg
                value={prefs.version}
                options={[
                  { value: "original", label: "Originaux" },
                  { value: "remix", label: "Remixes" },
                  { value: "any", label: "Les deux" },
                ]}
                onPick={(version) => onChange({ version })}
                disabled={busy}
                label="Versions"
              />
              <div className="text-[11px] text-neutral-500">Originaux : écarte les remixes. Remixes : ne garde que remixes, edits et versions club.</div>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Durée maximale d&apos;un titre</div>
              <Seg
                value={prefs.maxTrackMin}
                options={[
                  { value: 5, label: "5 min" },
                  { value: 8, label: "8 min" },
                  { value: 12, label: "12 min" },
                ]}
                onPick={(maxTrackMin) => onChange({ maxTrackMin })}
                disabled={busy}
                label="Durée maximale d&apos;un titre"
              />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Plage de tempo</div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">de</label>
                  <input
                    type="number"
                    min={0}
                    max={250}
                    step={1}
                    value={prefs.tempoMin || ""}
                    onChange={(e) => onChange({ tempoMin: Math.min(250, Math.max(0, Number(e.target.value) || 0)) })}
                    placeholder="libre"
                    disabled={busy}
                    className="prep-input w-20 px-2 py-1 text-xs"
                  />
                  <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">BPM</div>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">à</label>
                  <input
                    type="number"
                    min={0}
                    max={250}
                    step={1}
                    value={prefs.tempoMax || ""}
                    onChange={(e) => onChange({ tempoMax: Math.min(250, Math.max(0, Number(e.target.value) || 0)) })}
                    placeholder="libre"
                    disabled={busy}
                    className="prep-input w-20 px-2 py-1 text-xs"
                  />
                  <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">BPM</div>
                </div>
              </div>
              <div className="text-[11px] text-neutral-500">Les titres hors de la plage ne sont pas utilisés.</div>
            </div>
            <Switch
              on={prefs.avoidUsed}
              label="Éviter les titres déjà dans mes sets"
              hint="Pour une émission faite de morceaux que tu n'as pas encore rangés."
              disabled={busy}
              onToggle={() => onChange({ avoidUsed: !prefs.avoidUsed })}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--prep-line)] p-3">
            <legend className="px-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500">Enchaînement</legend>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Écart de tempo dans un set</div>
              <Seg
                value={prefs.tempoSpread}
                options={[
                  { value: 4, label: "Serré · ±4 %" },
                  { value: 8, label: "Normal · ±8 %" },
                  { value: 15, label: "Large · ±15 %" },
                ]}
                onPick={(tempoSpread) => onChange({ tempoSpread })}
                disabled={busy}
                label="Écart de tempo dans un set"
              />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Tonalités</div>
              <Seg
                value={prefs.harmony}
                options={[
                  { value: "strict", label: "Strictes" },
                  { value: "balanced", label: "Équilibrées" },
                  { value: "free", label: "Libres" },
                ]}
                onPick={(harmony) => onChange({ harmony })}
                disabled={busy}
                label="Tonalités"
              />
              <div className="text-[11px] text-neutral-500">Strictes : seulement des tonalités compatibles (plus de titres écartés). Libres : le tempo décide.</div>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Artistes</div>
              <Seg
                value={prefs.mixArtists}
                options={[
                  { value: "alternate", label: "Alternés" },
                  { value: "free", label: "Libres" },
                  { value: "blocks", label: "Par blocs" },
                ]}
                onPick={(mixArtists) => onChange({ mixArtists })}
                disabled={busy}
                label="Artistes"
              />
              <div className="text-[11px] text-neutral-500">Alternés : jamais deux fois le même artiste de suite.</div>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Nombre de sets</div>
              <Seg
                value={prefs.maxShows}
                options={[
                  { value: 1, label: "1" },
                  { value: 2, label: "2" },
                  { value: 3, label: "3" },
                ]}
                onPick={(maxShows) => onChange({ maxShows })}
                disabled={busy}
                label="Nombre de sets"
              />
              <div className="text-[11px] text-neutral-500">Un set par zone de tempo : la radio ne mélange pas du lent et du rapide.</div>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--prep-line)] p-3">
            <legend className="px-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500">DJ intelligent</legend>
            <div className="text-[12px] text-neutral-300">Pour chaque enchaînement, la radio choisit le style, la durée et le calage, et le prépare à l&apos;avance. Tu peux le modifier titre par titre dans le set.</div>
            <Switch
              on={prefs.dj.auto}
              label="Plan de mix intelligent"
              hint="Désactivé : un seul style de transition pour tout le set."
              disabled={busy}
              onToggle={() => onChange({ dj: { ...prefs.dj, auto: !prefs.dj.auto } })}
            />
            <Switch
              on={prefs.dj.sync}
              label="Caler les tempos et partir sur le temps"
              hint="Le titre qui arrive prend le tempo de celui qui sort, et démarre exactement sur un temps."
              disabled={busy || !prefs.dj.auto}
              onToggle={() => onChange({ dj: { ...prefs.dj, sync: !prefs.dj.sync } })}
            />
            <Switch
              on={prefs.dj.bassSwap}
              label="Échanger les basses"
              hint="Les graves du nouveau titre arrivent au milieu du fondu, ceux de l'ancien partent : pas de bouillie dans le bas du spectre."
              disabled={busy || !prefs.dj.auto}
              onToggle={() => onChange({ dj: { ...prefs.dj, bassSwap: !prefs.dj.bassSwap } })}
            />
            <div>
              <div className="text-[12px] font-semibold text-neutral-100">Voix de la radio</div>
              <div className="flex items-center gap-2">
                <Seg
                  value={prefs.dj.voice}
                  options={[
                    { value: "off", label: "Aucune" },
                    { value: "discret", label: "Discrète" },
                    { value: "radio", label: "Radio" },
                  ]}
                  onPick={(voice) => onChange({ dj: { ...prefs.dj, voice } })}
                  disabled={busy}
                  label="Voix de la radio"
                />
                <button
                  type="button"
                  disabled={busy || !canSpeak() || prefs.dj.voice === "off"}
                  onClick={() => speak(prefs.dj.voice === "radio" ? "Sur Radio A V A : Genesis, de Justice." : "Genesis, de Justice")}
                  className="prep-btn-ghost px-2 py-1 text-[11px]"
                >
                  <Icon name="play" size={12} />
                  <span className="ml-1">Tester la voix</span>
                </button>
              </div>
              <div className="text-[11px] text-neutral-500">Annonce chaque titre pendant le fondu ; la musique baisse le temps de la phrase.</div>
            </div>
            <Switch
              on={prefs.prepStems}
              label="Préparer les stems des deux premiers titres"
              hint="Lourd : à activer si tu veux jouer avec les stems dès le début de l'émission."
              disabled={busy}
              onToggle={() => onChange({ prepStems: !prefs.prepStems })}
            />
          </fieldset>
        </>
      )}
    </section>
  );
}
