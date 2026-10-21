import { useState, useEffect, useRef } from "react";
import { enhanceOptions, type Enhancement } from "@/lib/atelier/stemEnhance";

export function StemEnhanceMenu({
  stemName,
  color,
  disabled = false,
  onPick,
}: {
  stemName: string;
  color: string;
  disabled?: boolean;
  onPick: (o: Enhancement) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = enhanceOptions(stemName);

  const families = [
    { key: "clean", title: "Nettoyer", icon: "clean" },
    { key: "dynamic", title: "Dynamique", icon: "dynamic" },
    { key: "balance", title: "Équilibrer", icon: "balance" },
    { key: "color", title: "Couleur et espace", icon: "color" },
  ]
    .map((f) => ({ ...f, options: options.filter((o) => o.family === f.key) }))
    .filter((f) => f.options.length > 0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const getIcon = (key: string) => {
    switch (key) {
      case "normalize": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M12 2v20M8 6l4-4 4 4" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "dc": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12c4-4 8-4 12 0M2 12l2 0M22 12l-2 0" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "declick": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 0M12 8v8M12 8l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "denoise": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 0M2 20l20 0M2 4l20 0" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "punch": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 0M2 12l4-8 4 8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "dcomp": case "bcomp": case "vcomp": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 22l10-20 10 20" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "vgate": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 0M12 2v10" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "warm": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M4 20v-4M12 20v-8M20 20v-12" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "presence": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M4 20v-8M12 20v-12M20 20v-4" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "bright": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M4 20v-12M12 20v-4M20 20v-8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "air": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 10" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "sat": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12l20 0M2 12l4-8 4 8M18 4l4 8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "width": return <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M2 12h20M6 12l-4-4 4-4M18 12l4-4-4-4" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      default: return <svg viewBox="0 0 24 24" className="w-5 h-5"><circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" strokeWidth="1.8"/></svg>;
    }
  };

  const getFamilyIcon = (key: string) => {
    switch (key) {
      case "clean": return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M2 22l20-20M2 12l20 0" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "dynamic": return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M2 22l10-20 10 20" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "balance": return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M4 20v-12M12 20v-4M20 20v-8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      case "color": return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M2 12l20 0M2 12l4-8 4 8M18 4l4 8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>;
      default: return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" strokeWidth="1.8"/></svg>;
    }
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        className={`hw-btn px-2 py-1 text-[11px] font-bold ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        style={{ ["--led" as string]: color, color } as React.CSSProperties}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        AMÉLIORER
        <svg viewBox="0 0 24 24" className="w-3 h-3 ml-1 inline-block">
          <path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="hw-panel absolute left-0 top-full z-30 mt-1 w-[min(340px,90vw)] max-h-[55vh] overflow-y-auto p-3 flex flex-col gap-3"
        >
          {families.map(family => (
            <div key={family.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                {getFamilyIcon(family.key)}
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                  {family.title}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {family.options.map(option => (
                  <button
                    key={option.key}
                    className="hw-well flex items-start gap-2 p-2 text-left hover:brightness-125"
                    onClick={() => {
                      onPick(option);
                      setIsOpen(false);
                    }}
                    title={option.hint}
                  >
                    {getIcon(option.key)}
                    <div>
                      <div className="text-[11px] font-bold text-neutral-100">{option.label}</div>
                      <div className="text-[10px] text-neutral-400 leading-snug">{option.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
