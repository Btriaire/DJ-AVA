// Filigrane d'arrière-plan : un cerveau dessiné au trait (circonvolutions),
// très transparent, fixé derrière le contenu. Purement décoratif.
export default function BrainBg() {
  return (
    <svg
      className="brain-bg"
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Contour général du cerveau (deux hémisphères) */}
        <path d="M100 28
          C84 20 64 24 54 38
          C40 38 30 50 34 64
          C24 72 24 88 36 96
          C30 110 38 126 54 128
          C58 144 78 152 100 148
          C122 152 142 144 146 128
          C162 126 170 110 164 96
          C176 88 176 72 166 64
          C170 50 160 38 146 38
          C136 24 116 20 100 28 Z" />

        {/* Sillon central séparant les deux hémisphères */}
        <path d="M100 28 C98 56 104 88 100 116 C97 132 100 142 100 148" />

        {/* Circonvolutions hémisphère gauche */}
        <path d="M86 44 C70 46 64 58 74 66 C58 68 56 82 70 86" />
        <path d="M52 52 C44 60 48 70 58 70" />
        <path d="M44 80 C54 78 60 86 54 96 C66 98 70 110 60 116" />
        <path d="M74 100 C66 106 70 118 82 116" />
        <path d="M62 124 C72 122 82 128 80 138" />
        <path d="M86 70 C78 78 82 90 92 88" />

        {/* Circonvolutions hémisphère droit */}
        <path d="M114 44 C130 46 136 58 126 66 C142 68 144 82 130 86" />
        <path d="M148 52 C156 60 152 70 142 70" />
        <path d="M156 80 C146 78 140 86 146 96 C134 98 130 110 140 116" />
        <path d="M126 100 C134 106 130 118 118 116" />
        <path d="M138 124 C128 122 118 128 120 138" />
        <path d="M114 70 C122 78 118 90 108 88" />

        {/* Tronc cérébral, esquissé */}
        <path d="M100 148 C98 158 96 166 100 176 C104 166 102 158 100 148" />
      </g>
    </svg>
  );
}
