"use client";
import { useEffect, useState } from "react";
import type { RamGroup } from "@/lib/ramOptimizer";

const HEADERS = { "Content-Type": "application/json", "x-djsynth-ram": "1" };
const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} Go` : `${mb} Mo`);

interface Result {
  closed: string[];
  left: string[];
  freedMB: number;
}

// "Optimisation de RAM avancée": closes the programs of the Mac that DJSynth does not need, after a warning and a
// confirmation. The list, the locks (DJSynth, system, Claude) and the closing are decided by the server (/api/system/ram).
export function RamOptimizer() {
  // only on the Mac that runs DJSynth (the server refuses anything else anyway)
  const [local, setLocal] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address once the page is shown
    setLocal(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname));
  }, []);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<RamGroup[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/system/ram", { headers: HEADERS, cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`);
      const { groups: gs } = (await res.json()) as { groups: RamGroup[] };
      setGroups(gs);
      setPicked(new Set(gs.filter((g) => !g.locked).map((g) => g.id))); // everything closable is ticked: that is the point of the tool
    } catch (e) {
      setError((e as Error).message);
      setGroups([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the panel opens
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const closable = (groups ?? []).filter((g) => !g.locked);
  const chosen = closable.filter((g) => picked.has(g.id));
  const chosenMB = chosen.reduce((s, g) => s + g.rssMB, 0);

  const close = async (mode: "quit" | "force") => {
    if (busy || !chosen.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/system/ram", { method: "POST", headers: HEADERS, body: JSON.stringify({ ids: chosen.map((g) => g.id), mode }) });
      const data = (await res.json()) as Result & { groups?: RamGroup[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setResult({ closed: data.closed, left: data.left, freedMB: data.freedMB });
      setGroups(data.groups ?? []);
      setPicked(new Set((data.groups ?? []).filter((g) => !g.locked && data.left.includes(g.name)).map((g) => g.id)));
      setSure(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!local) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null);
          setSure(false);
          setOpen(true);
        }}
        className="hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold"
        style={{ ["--led" as string]: "#f59e0b", color: "#f59e0b" }}
        title="Optimisation de RAM avancée : ferme les programmes dont DJSynth n'a pas besoin, pour lui laisser toute la capacité du Mac (avec avertissement)."
      >
        RAM+
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Optimisation de RAM avancée" onClick={() => !busy && setOpen(false)}>
          <div className="prep-card flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-hidden p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-neutral-100">Optimisation de RAM avancée</h2>
                <p className="text-[12px] text-neutral-400">Ferme les programmes dont DJSynth n&apos;a pas besoin, pour lui laisser toute la mémoire du Mac.</p>
              </div>
              <button type="button" className="prep-btn-ghost px-2 py-1 text-[11px]" onClick={() => setOpen(false)} disabled={busy} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-100" role="alert">
              <p className="font-bold text-amber-300">Attention</p>
              <p>
                Les programmes cochés vont se fermer. <strong>Les documents non enregistrés peuvent être perdus</strong> : enregistre ton travail avant. DJSynth, ses outils, le Finder, le système et la session Claude ne sont jamais fermés. Les applications sont d&apos;abord invitées à quitter proprement (elles peuvent te demander d&apos;enregistrer).
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--prep-line)]">
              {groups === null ? (
                <p className="p-4 text-[12px] text-neutral-400">Lecture des programmes ouverts…</p>
              ) : groups.length === 0 ? (
                <p className="p-4 text-[12px] text-neutral-400">{error ? "Impossible de lire la liste." : "Rien d'autre n'est ouvert."}</p>
              ) : (
                <ul className="divide-y divide-[var(--prep-line)]">
                  {groups.map((g) => (
                    <li key={g.id} className={`flex items-center gap-2.5 px-3 py-2 text-[12px] ${g.locked ? "opacity-50" : ""}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--prep-accent)]" disabled={!!g.locked || busy} checked={!g.locked && picked.has(g.id)} onChange={() => toggle(g.id)} aria-label={`Fermer ${g.name}`} />
                      <span className="min-w-0 flex-1 truncate font-medium text-neutral-100" title={g.name}>
                        {g.name}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-neutral-500">{g.kind === "app" ? "appli" : "outil"}</span>
                      </span>
                      {g.locked ? <span className="text-[10px] text-neutral-500">protégé : {g.locked}</span> : null}
                      <span className="w-16 text-right font-mono text-[11px] text-neutral-300">{fmtMB(g.rssMB)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {closable.length > 0 && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                <span>{`${chosen.length} sur ${closable.length} cochés · environ ${fmtMB(chosenMB)} à libérer`}</span>
                <span className="flex gap-2">
                  <button type="button" className="underline hover:text-white" onClick={() => setPicked(new Set(closable.map((g) => g.id)))} disabled={busy}>
                    Tout cocher
                  </button>
                  <button type="button" className="underline hover:text-white" onClick={() => setPicked(new Set())} disabled={busy}>
                    Tout décocher
                  </button>
                </span>
              </div>
            )}

            {error && <p className="text-[12px] text-red-400">{error}</p>}
            {result && (
              <div className="rounded-lg border border-[var(--prep-line)] p-3 text-[12px] text-neutral-200">
                <p>{result.closed.length ? `Fermés : ${result.closed.join(", ")}.` : "Rien n'a été fermé."}</p>
                <p className="text-neutral-400">{`Environ ${fmtMB(result.freedMB)} libérés.`}</p>
                {result.left.length > 0 && (
                  <p className="mt-1 text-amber-300">{`Encore ouverts : ${result.left.join(", ")} (une application attend peut-être une réponse de ta part, par exemple enregistrer).`}</p>
                )}
              </div>
            )}

            <label className="flex items-start gap-2 text-[12px] text-neutral-300">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--prep-accent)]" checked={sure} onChange={(e) => setSure(e.target.checked)} disabled={busy} />
              <span>Je comprends que ces programmes vont se fermer et que je peux perdre ce qui n&apos;est pas enregistré.</span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {result && result.left.length > 0 && (
                <button
                  type="button"
                  className="rounded-lg border border-red-500/70 px-3 py-2 text-[12px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  disabled={busy || !sure || !chosen.length}
                  onClick={() => window.confirm("Forcer la fermeture : les programmes restants s'arrêtent tout de suite, sans proposer d'enregistrer. Continuer ?") && void close("force")}
                  title="Dernier recours : arrêt immédiat, sans proposition d'enregistrer"
                >
                  Forcer la fermeture
                </button>
              )}
              <button type="button" className="prep-btn-ghost px-3 py-2 text-[12px]" onClick={() => void load()} disabled={busy}>
                Actualiser
              </button>
              <button type="button" className="prep-btn-accent px-4 py-2 text-[12px] font-black disabled:opacity-40" disabled={busy || !sure || !chosen.length} onClick={() => void close("quit")}>
                {busy ? "Fermeture…" : `Fermer proprement (${chosen.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
