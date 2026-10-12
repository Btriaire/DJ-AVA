export interface EqPreset {
  id: string;
  name: string;
  title: string;
  pts: [number, number][];
}

export const EQ_PRESETS: EqPreset[] = [
  { id: "plat", name: "Plat", title: "Toutes les bandes à 0 dB", pts: [] },
  { id: "club", name: "Club", title: "Basses profondes et un peu d'air, pour les grandes salles", pts: [[25,6],[60,7],[120,4],[250,0],[8000,1]] },
  { id: "loudness", name: "Loudness", title: "Courbe en sourire : graves et aigus renforcés à faible volume", pts: [[25,5],[63,5],[200,0],[1000,-2],[2500,0],[6000,3],[16000,5]] },
  { id: "sub", name: "Sous-graves", title: "Concentre l'énergie dans les très basses fréquences", pts: [[25,7],[40,8],[63,5],[100,0],[200,-3]] },
  { id: "boue", name: "Sans boue", title: "Dégage le bas-médium trouble entre 200 et 500 Hz", pts: [[200,-2],[300,-5],[450,-3],[800,0]] },
  { id: "rumble", name: "Anti-rumble", title: "Coupe les infra-graves inutiles", pts: [[25,-18],[40,-12],[63,-4],[100,0]] },
  { id: "voix", name: "Voix claire", title: "Fait ressortir les voix et la présence", pts: [[100,-4],[250,-2],[1000,2],[2500,4],[5000,3],[12000,1]] },
  { id: "doux", name: "Doux", title: "Adoucit les aigus agressifs entre 2 et 8 kHz", pts: [[2000,-2],[3500,-5],[5000,-4],[8000,-1]] },
  { id: "brillant", name: "Brillant", title: "Ouvre le haut du spectre", pts: [[25,-3],[1000,0],[4000,3],[8000,6],[16000,7]] },
  { id: "chaud", name: "Chaud", title: "Son rond et chaleureux, aigus adoucis", pts: [[40,3],[160,3],[500,1],[2500,-1],[6300,-4],[12000,-6]] },
  { id: "techno", name: "Techno", title: "Punch dans le grave, médium creusé, scintillement en haut", pts: [[25,3],[63,6],[160,-3],[630,-2],[2500,2],[8000,4],[16000,3]] },
  { id: "radio", name: "Radio", title: "Bande étroite façon poste de radio", pts: [[63,-12],[160,-4],[400,2],[1000,4],[2500,3],[6300,-4],[16000,-12]] },
  { id: "telephone", name: "Téléphone", title: "Voix de téléphone, très étroite", pts: [[25,-18],[250,-14],[500,2],[1000,6],[2500,5],[4000,-4],[8000,-18]] },
];

export function presetGains(pts: [number, number][], freqs: number[]): number[] {
  if (pts.length === 0) return new Array(freqs.length).fill(0);

  const points = [...pts];
  if (pts[0][0] > 25) points.unshift([pts[0][0] / 2, 0]);
  if (pts[pts.length - 1][0] < 16000) points.push([pts[pts.length - 1][0] * 2, 0]);

  return freqs.map(f => {
    if (f <= points[0][0]) return Math.round(points[0][1] * 2) / 2;

    for (let i = 0; i < points.length - 1; i++) {
      const [f0, v0] = points[i];
      const [f1, v1] = points[i + 1];

      if (f >= f0 && f <= f1) {
        const t = (Math.log2(f) - Math.log2(f0)) / (Math.log2(f1) - Math.log2(f0));
        const v = v0 + t * (v1 - v0);
        return Math.max(-18, Math.min(18, Math.round(v * 2) / 2));
      }
    }

    return Math.round(points[points.length - 1][1] * 2) / 2;
  });
}
