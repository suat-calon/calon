/**
 * CalonLogoMark — SVG brand icon (the hexagonal C with circuit lines)
 *
 * Usage:
 *   <CalonLogoMark size={36} />          → 36 × 34 px mark
 *   <CalonLogoMark size={48} wordmark />  → 48 × 64 px mark + "CALON" wordmark
 *
 * • Server-component safe (no hooks, no 'use client')
 * • Dark-mode aware via Tailwind fill classes
 * • Gradient IDs are stable strings → safe for SSR
 */

interface Props {
  /** Width in px; height is auto-proportional */
  size?: number;
  /** Show "CALON" wordmark below the icon */
  wordmark?: boolean;
  className?: string;
}

export function CalonLogoMark({ size = 36, wordmark = false, className = '' }: Props) {
  /* Icon viewBox: 0 0 230 218. With wordmark: 0 0 230 300. */
  const vbH  = wordmark ? 300 : 218;
  const h    = Math.round(size * (vbH / 230));

  return (
    <svg
      width={size}
      height={h}
      viewBox={`0 0 230 ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Calon"
      overflow="visible"
      className={className}
    >
      <defs>
        {/*
          Circuit gradient: deep indigo → violet → purple → hot pink
          Direction: bottom-left → top-right (matches the arc of the lines)
        */}
        <linearGradient
          id="cln-g"
          x1="28"  y1="180"
          x2="228" y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="#083344" />
          <stop offset="25%"  stopColor="#0E7490" />
          <stop offset="55%"  stopColor="#0891B2" />
          <stop offset="80%"  stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>

      {/* ── C BODY ─────────────────────────────────────────────────────────
          Single closed path:
          Outer edge (clockwise) → inner C-opening concave arc → close.
          The path fills the entire C body (both arms + left spine + the
          inner-left rectangular space between the arms).
          The right-side opening is excluded by the path geometry.
      ─────────────────────────────────────────────────────────────────── */}
      <path
        className="fill-[#083344] dark:fill-[#ECFEFF]"
        d="
          M  44  8
          L 162  8
          L 202 44
          L 202 84
          L 174 90
          Q 153 96 147 110
          Q 147 124 174 130
          L 202 136
          L 202 174
          L 162 210
          L  44 210
          L   8 174
          L   8  44
          Z
        "
      />

      {/* ── CIRCUIT LINES ─────────────────────────────────────────────────
          Three parallel arcs flowing bottom-left → top-right through
          the C body, exiting the top-arm opening.
      ─────────────────────────────────────────────────────────────────── */}

      {/* Outermost arc */}
      <path
        d="M 28 164 C 54 142 90 112 124 88 C 154 68 184 54 222 40"
        stroke="url(#cln-g)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      {/* Middle arc */}
      <path
        d="M 28 174 C 56 150 92 120 126 96 C 156 75 188 61 224 48"
        stroke="url(#cln-g)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      {/* Innermost arc (shorter — hugs the inner C curve) */}
      <path
        d="M 20 169 C 46 148 80 119 112 96 C 140 78 168 66 200 57"
        stroke="url(#cln-g)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* ── ENDPOINT CIRCLES ──────────────────────────────────────────────
          • 1 at bottom-left  (entry point)
          • 3 at upper-right  (exit points, one per arc)
          Fill matches C body so they appear as ring nodes.
      ─────────────────────────────────────────────────────────────────── */}

      {/* Bottom-left */}
      <circle
        cx="28" cy="169" r="8.5"
        className="fill-[#083344] dark:fill-[#0C2030]"
        stroke="url(#cln-g)" strokeWidth="5"
      />
      {/* Upper-right — outermost arc end */}
      <circle
        cx="222" cy="40" r="11"
        className="fill-[#083344] dark:fill-[#0C2030]"
        stroke="url(#cln-g)" strokeWidth="5"
      />
      {/* Upper-right — middle arc end */}
      <circle
        cx="224" cy="53" r="11"
        className="fill-[#083344] dark:fill-[#0C2030]"
        stroke="url(#cln-g)" strokeWidth="5"
      />
      {/* Upper-right — inner arc end */}
      <circle
        cx="200" cy="57" r="9"
        className="fill-[#083344] dark:fill-[#0C2030]"
        stroke="url(#cln-g)" strokeWidth="4.5"
      />

      {/* ── WORDMARK (optional) ────────────────────────────────────────── */}
      {wordmark && (
        <text
          x="115"
          y="280"
          fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
          fontSize="52"
          fontWeight="900"
          className="fill-[#083344] dark:fill-[#ECFEFF]"
          textAnchor="middle"
          letterSpacing="6"
        >
          CALON
        </text>
      )}
    </svg>
  );
}
