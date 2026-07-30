// Fond décoratif zen pastel, en SVG (aucune image → net sur iPhone, poids nul,
// zéro souci de droits). Couche fixe très légère derrière tout le contenu, sur
// le même principe que BrainBg. Pour changer d'ambiance, il suffit de modifier
// FOND ci-dessous (et OPACITE pour l'intensité « très light »).

type FondId = "bambou" | "enso" | "vagues" | "petales" | "montagnes" | "galets";

const FOND: FondId = "bambou";
const OPACITE = 0.1;

const FONDS: Record<FondId, string> = {
  bambou:
    '<circle cx="150" cy="70" r="80" fill="#e6efdc"/>' +
    '<rect x="35" y="-10" width="13" height="320" rx="6" fill="#cfe3c4"/>' +
    '<rect x="34" y="60" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="34" y="130" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="34" y="200" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="34" y="260" width="15" height="5" rx="2" fill="#b7d3a6"/>' +
    '<rect x="92" y="-10" width="13" height="320" rx="6" fill="#c6dcb8"/>' +
    '<rect x="91" y="60" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="91" y="130" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="91" y="200" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="91" y="260" width="15" height="5" rx="2" fill="#b7d3a6"/>' +
    '<rect x="150" y="-10" width="13" height="320" rx="6" fill="#d5e6cb"/>' +
    '<rect x="149" y="60" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="149" y="130" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="149" y="200" width="15" height="5" rx="2" fill="#b7d3a6"/><rect x="149" y="260" width="15" height="5" rx="2" fill="#b7d3a6"/>' +
    '<path d="M48 90 Q95 70 120 40 Q80 78 48 96 Z" fill="#c2dbae"/>' +
    '<path d="M105 165 Q150 150 178 120 Q140 158 105 172 Z" fill="#cbe0ba"/>' +
    '<path d="M163 235 Q120 222 92 196 Q132 236 163 242 Z" fill="#c2dbae"/>',
  enso:
    '<circle cx="55" cy="70" r="72" fill="#dcebe0"/>' +
    '<circle cx="155" cy="185" r="92" fill="#e3edd8"/>' +
    '<circle cx="120" cy="120" r="52" fill="#d2e6dd"/>' +
    '<path d="M144 113 A58 58 0 1 1 80 95" fill="none" stroke="#b7d6c5" stroke-width="15" stroke-linecap="round"/>',
  vagues:
    '<path d="M0 110 C50 94 150 126 200 110 L200 300 L0 300 Z" fill="#d9ebe4"/>' +
    '<path d="M0 150 C50 134 150 166 200 150 L200 300 L0 300 Z" fill="#cbe4e6"/>' +
    '<path d="M0 192 C50 176 150 208 200 192 L200 300 L0 300 Z" fill="#dcefe3"/>' +
    '<path d="M0 234 C50 218 150 250 200 234 L200 300 L0 300 Z" fill="#cfe6dd"/>' +
    '<circle cx="150" cy="66" r="34" fill="#f1e3c4"/>',
  petales:
    '<circle cx="60" cy="80" r="70" fill="#f3e7ec"/>' +
    '<circle cx="160" cy="210" r="86" fill="#eef0e2"/>' +
    '<g transform="translate(55 60) rotate(20)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>' +
    '<g transform="translate(150 90) rotate(-30)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>' +
    '<g transform="translate(95 150) rotate(15)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>' +
    '<g transform="translate(160 200) rotate(40)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>' +
    '<g transform="translate(45 210) rotate(-20)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>' +
    '<g transform="translate(120 255) rotate(-10)"><ellipse rx="26" ry="12" fill="#f0d9e2"/><ellipse rx="12" ry="5" fill="#e7c6d3"/></g>',
  montagnes:
    '<circle cx="132" cy="78" r="42" fill="#f2ddac"/>' +
    '<path d="M0 210 L58 150 L110 210 Z" fill="#d6e0d3"/>' +
    '<path d="M70 220 L140 140 L210 220 Z" fill="#c6d6cb"/>' +
    '<path d="M0 245 L70 185 L150 245 Z" fill="#bad0c4"/>' +
    '<rect x="0" y="238" width="200" height="70" fill="#c3d6c9"/>',
  galets:
    '<circle cx="100" cy="252" r="104" fill="none" stroke="#cdd8cd" stroke-width="3"/>' +
    '<circle cx="100" cy="252" r="80" fill="none" stroke="#cdd8cd" stroke-width="3"/>' +
    '<circle cx="100" cy="252" r="56" fill="none" stroke="#cdd8cd" stroke-width="3"/>' +
    '<circle cx="100" cy="252" r="32" fill="none" stroke="#cdd8cd" stroke-width="3"/>' +
    '<ellipse cx="100" cy="250" rx="38" ry="16" fill="#d4dacf"/>' +
    '<ellipse cx="100" cy="228" rx="30" ry="13" fill="#c9d0c3"/>' +
    '<ellipse cx="100" cy="209" rx="22" ry="10" fill="#bec6b8"/>',
};

export default function ZenBg() {
  return (
    <svg
      className="zen-bg"
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ opacity: OPACITE }}
    >
      <g dangerouslySetInnerHTML={{ __html: FONDS[FOND] }} />
    </svg>
  );
}
