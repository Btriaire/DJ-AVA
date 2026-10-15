export type TemplateView = "console" | "studio" | "platine" | "playlist";

export interface DisplayTemplate {
  id: string;
  name: string;
  createdAt: number;
  modules: Record<string, boolean>;
  view: TemplateView;
  deckClosed: { A: boolean; B: boolean };
}

export function loadTemplates(): DisplayTemplate[] {
  try {
    const data = localStorage.getItem("djsynth.templates.v1");
    if (!data) return [];
    const parsed = JSON.parse(data) as unknown[];
    return parsed
      .map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "name" in item &&
          typeof item.name === "string" &&
          "modules" in item &&
          typeof item.modules === "object" &&
          item.modules !== null &&
          "view" in item &&
          ["console", "studio", "platine", "playlist"].includes(item.view as string) &&
          "deckClosed" in item &&
          typeof item.deckClosed === "object" &&
          item.deckClosed !== null
        ) {
          const modules = Object.fromEntries(
            Object.entries(item.modules).filter(([, v]) => typeof v === "boolean")
          );
          const dc = item.deckClosed as { A?: unknown; B?: unknown };
          const deckClosed = { A: dc.A === true, B: dc.B === true };
          return {
            id: "id" in item && typeof item.id === "string" ? item.id : "",
            name: item.name,
            createdAt: "createdAt" in item && typeof item.createdAt === "number" ? item.createdAt : 0,
            modules,
            view: item.view as TemplateView,
            deckClosed,
          };
        }
        return null;
      })
      .filter((item): item is DisplayTemplate => item !== null);
  } catch {
    return [];
  }
}

export function saveTemplates(list: DisplayTemplate[]): boolean {
  try {
    localStorage.setItem("djsynth.templates.v1", JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newTemplate(
  name: string,
  modules: Record<string, boolean>,
  view: TemplateView,
  deckClosed: { A: boolean; B: boolean }
): DisplayTemplate {
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: Date.now(),
    modules,
    view,
    deckClosed,
  };
}
