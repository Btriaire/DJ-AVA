// Type pour les événements DJ
export type DjEvent = { kind: "drop" } | { kind: "fade"; strength: number } | { kind: "loop" } | { kind: "talk"; on: boolean };

// Ensemble pour stocker les écouteurs
const listeners = new Set<(e: DjEvent) => void>();

// Émet un événement à tous les écouteurs
export function emitDj(e: DjEvent): void {
    listeners.forEach(listener => {
        try {
            listener(e);
        } catch (error) {
            console.error("Erreur dans l'écouteur DJ:", error);
        }
    });
}

// Enregistre un écouteur et renvoie une fonction pour le désinscrire
export function onDj(cb: (e: DjEvent) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}
