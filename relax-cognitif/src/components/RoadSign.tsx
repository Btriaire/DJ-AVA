import type { SignType } from "../lib/route";

type Props = { label: string; type: SignType };

const RED = "#c1121f";
const GREEN = "#1f7a4d";

// Panneau d'autoroute français : fond rouge, numéro blanc.
function Autoroute({ label }: { label: string }) {
  return (
    <>
      <rect x={70} y={28} width={100} height={64} rx={10} fill={RED} stroke="#fff" strokeWidth={4} />
      <text x={120} y={72} textAnchor="middle" fontSize={34} fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">
        {label}
      </text>
    </>
  );
}

// Panneau de route nationale : écusson vert, numéro blanc.
function Nationale({ label }: { label: string }) {
  return (
    <>
      <path d="M120 24 L168 40 Q176 70 120 96 Q64 70 72 40 Z" fill={GREEN} stroke="#fff" strokeWidth={4} />
      <text x={120} y={68} textAnchor="middle" fontSize={26} fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">
        {label}
      </text>
    </>
  );
}

// Emblème décoratif : une route qui serpente vers l'horizon.
function Emblem() {
  return (
    <>
      <rect x={20} y={20} width={200} height={80} rx={12} fill="#cfe3f7" />
      <path d="M20 100 L98 30 L142 30 L220 100 Z" fill="#6b7280" />
      <path
        d="M120 100 L120 84 M120 74 L120 62 M119 54 L119 46 M118 40 L118 34"
        stroke="#fff"
        strokeWidth={4}
        strokeDasharray="8 7"
      />
      <circle cx={170} cy={40} r={12} fill="#ffd23f" />
    </>
  );
}

/** Panneau routier illustrant une question « routes & autoroutes ». */
export default function RoadSign({ label, type }: Props) {
  return (
    <svg className="road-sign" viewBox="0 0 240 120" role="img" aria-label="Panneau routier">
      {type === "autoroute" && <Autoroute label={label} />}
      {type === "nationale" && <Nationale label={label} />}
      {type === "emblem" && <Emblem />}
    </svg>
  );
}
