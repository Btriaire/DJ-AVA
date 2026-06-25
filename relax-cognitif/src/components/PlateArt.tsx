type Props = { dep: string; plate: string };

const BLUE = "#0a3aa8";
const YELLOW = "#ffcc00";

// Petites étoiles de l'Union européenne sur la bande de gauche.
function euStars() {
  const cx = 27;
  const cy = 28;
  const r = 13;
  const stars = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    stars.push(
      <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={1.5} fill={YELLOW} />
    );
  }
  return <g>{stars}</g>;
}

/**
 * Fausse plaque d'immatriculation française (format SIV).
 * La bande bleue de droite porte le numéro de département à deviner.
 */
export default function PlateArt({ dep, plate }: Props) {
  return (
    <svg className="plate-art" viewBox="0 0 440 96" role="img" aria-label={`Plaque d'immatriculation, département ${dep}`}>
      {/* corps de la plaque */}
      <rect x={2} y={2} width={436} height={92} rx={12} fill="#fff" stroke="#111" strokeWidth={3} />

      {/* bande bleue gauche : drapeau européen + F */}
      <path d="M2 14 Q2 2 14 2 L54 2 L54 94 L14 94 Q2 94 2 82 Z" fill={BLUE} />
      {euStars()}
      <text x={28} y={66} textAnchor="middle" fontSize={22} fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">F</text>

      {/* numéro de plaque (factice) */}
      <text
        x={232}
        y={64}
        textAnchor="middle"
        fontSize={46}
        fontWeight="800"
        fill="#111"
        fontFamily="'Arial Narrow', Arial, sans-serif"
        letterSpacing="2"
      >
        {plate}
      </text>

      {/* bande bleue droite : numéro de département */}
      <path d="M386 2 L426 2 Q438 2 438 14 L438 82 Q438 94 426 94 L386 94 Z" fill={BLUE} />
      <text x={412} y={52} textAnchor="middle" fontSize={26} fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">{dep}</text>
      <text x={412} y={74} textAnchor="middle" fontSize={11} fontWeight="600" fill={YELLOW} fontFamily="Arial, sans-serif">FRANCE</text>
    </svg>
  );
}
