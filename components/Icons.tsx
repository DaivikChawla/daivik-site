// Inline SVG glyphs. Neither brand font ships → or ↗, so arrows are drawn, not typed.

type IconProps = { className?: string };

export function ArrowUpRight({ className = "ico" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function ArrowDown({ className = "ico" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function ArrowRight({ className = "ico" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function Star({ className = "star" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.4l2.95 6.3 6.85.8-5.1 4.7 1.4 6.8L12 17.6 5.9 21l1.4-6.8-5.1-4.7 6.85-.8z" fill="currentColor" />
    </svg>
  );
}

/** A small isometric block: the site's one recurring mark. */
export function Block({ className = "blk", tone = "hand" }: IconProps & { tone?: "hand" | "auto" }) {
  const f = tone === "hand" ? ["#FF8A4C", "#E2560F", "#C2470B"] : ["#FFFFFF", "#D9D8E6", "#B9BAD3"];
  return (
    <svg className={className} viewBox="0 0 40 44" aria-hidden="true" focusable="false">
      <path d="M20 2 38 12 20 22 2 12Z" fill={f[0]} />
      <path d="M2 12 20 22V42L2 32Z" fill={f[1]} />
      <path d="M38 12 20 22V42L38 32Z" fill={f[2]} />
    </svg>
  );
}
