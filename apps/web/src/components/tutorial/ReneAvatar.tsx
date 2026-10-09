import type { JSX } from "react";

/**
 * René drawn in flat SVG: the portrait used when the 3D one is not available (no WebGL, render
 * failure, tests). A kindly old manager in a flat cap, with white eyebrows, glasses and a big
 * moustache. Colours come from the `.rene-*` classes in app.css (design tokens only).
 */
export function ReneAvatar({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      className={className ? `rene-avatar ${className}` : "rene-avatar"}
      viewBox="0 0 120 140"
      role="img"
      aria-label="René, l'ancien gérant"
      data-testid="rene-avatar"
    >
      {/* Cardigan and shirt */}
      <path className="rene-coat" d="M6 140C8 118 24 108 46 104H74C96 108 112 118 114 140Z" />
      <path className="rene-shirt" d="M46 104L60 130L74 104Z" />
      <path className="rene-coat-shade" d="M46 104L60 130L52 106Z M74 104L60 130L68 106Z" />
      <circle className="rene-button" cx="60" cy="134" r="2.6" />
      {/* Neck and ears */}
      <rect className="rene-skin-shade" x="49" y="90" width="22" height="18" rx="8" />
      <circle className="rene-skin" cx="27" cy="68" r="8" />
      <circle className="rene-skin" cx="93" cy="68" r="8" />
      {/* Head */}
      <ellipse className="rene-skin" cx="60" cy="66" rx="33" ry="36" />
      {/* Cheeks */}
      <circle className="rene-cheek" cx="39" cy="78" r="6" />
      <circle className="rene-cheek" cx="81" cy="78" r="6" />
      {/* Sideburns */}
      <path className="rene-hair" d="M27 58C22 62 22 76 27 82C31 76 31 64 31 58Z" />
      <path className="rene-hair" d="M93 58C98 62 98 76 93 82C89 76 89 64 89 58Z" />
      {/* Flat cap */}
      <path
        className="rene-cap"
        d="M26 54C26 30 44 18 62 18C82 18 96 32 94 54C80 48 42 46 26 54Z"
      />
      <path className="rene-cap-shade" d="M62 18C82 18 96 32 94 54C86 51 74 49 62 48Z" />
      <path className="rene-cap-brim" d="M22 56C40 46 82 46 100 56C98 62 24 62 22 56Z" />
      {/* Eyebrows */}
      <rect className="rene-brow" x="37" y="55" width="21" height="7" rx="3.5" />
      <rect className="rene-brow" x="62" y="55" width="21" height="7" rx="3.5" />
      {/* Eyes and glasses */}
      <circle className="rene-eye" cx="47.5" cy="68" r="3.2" />
      <circle className="rene-eye" cx="72.5" cy="68" r="3.2" />
      <circle className="rene-eye-shine" cx="48.6" cy="66.8" r="1" />
      <circle className="rene-eye-shine" cx="73.6" cy="66.8" r="1" />
      <circle className="rene-glass" cx="47.5" cy="68" r="10.5" />
      <circle className="rene-glass" cx="72.5" cy="68" r="10.5" />
      <path className="rene-glass-bridge" d="M58 67C59.5 65.5 60.5 65.5 62 67" />
      {/* Nose */}
      <ellipse className="rene-nose" cx="60" cy="79" rx="6" ry="5.5" />
      {/* Moustache and smile */}
      <path
        className="rene-moustache"
        d="M60 82C56 78 46 79 43 85C42 90 48 92 54 90C57 89 59 88 60 88C61 88 63 89 66 90C72 92 78 90 77 85C74 79 64 78 60 82Z"
      />
      <path className="rene-smile" d="M52 96C56 100 64 100 68 96" />
    </svg>
  );
}
