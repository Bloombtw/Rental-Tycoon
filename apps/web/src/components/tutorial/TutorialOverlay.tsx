import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import type { TutorialScript, TutorialStep, TutorialTarget } from "../../game/tutorial.js";
import { useRenePortrait } from "../../ui/reneStore.js";
import { useReducedMotion } from "../../ui/useReducedMotion.js";
import { ReneAvatar } from "./ReneAvatar.js";

interface TutorialOverlayProps {
  readonly step: Exclude<TutorialStep, "done">;
  readonly script: TutorialScript;
  /** Screen position (viewport px) of the departing car, for `target.kind === "car"`. */
  readonly carTarget: { x: number; y: number } | null;
  readonly canSkip: boolean;
  /** The last bubble was read and tapped (sends { type: "tap" }). */
  readonly onTap: () => void;
  readonly onSkip: () => void;
}

/** Typewriter pace (ms per character). */
const TYPE_MS = 28;
/** Space kept around the highlighted element (px). */
const HOLE_PAD = 6;
/** Radius of the spotlight around a departing car (px). */
const CAR_RADIUS = 46;
/** Pixels of movement below which a measurement is ignored (no re-render). */
const MEASURE_EPSILON = 0.5;
/** Estimated height of René's bar, to choose the side that does not cover the target (px). */
const BAR_HEIGHT = 190;
/** Elements the player must not touch while a step only waits for time to pass. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MENU_SELECTORS: readonly string[] = ['[data-testid="side-rail"]', '[data-testid="drawer"]'];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Measure {
  readonly vw: number;
  readonly vh: number;
  /** The target, padded; null when there is nothing to highlight (yet). */
  readonly hole: (Box & { readonly r: number }) | null;
  /** Boxes of the menus to keep blocked. */
  readonly menus: readonly (Box & { readonly id: string })[];
}

function fin(n: number): boolean {
  return Number.isFinite(n);
}

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < MEASURE_EPSILON &&
    Math.abs(a.y - b.y) < MEASURE_EPSILON &&
    Math.abs(a.w - b.w) < MEASURE_EPSILON &&
    Math.abs(a.h - b.h) < MEASURE_EPSILON
  );
}

function sameMeasure(a: Measure, b: Measure): boolean {
  if (a.vw !== b.vw || a.vh !== b.vh) return false;
  if ((a.hole === null) !== (b.hole === null)) return false;
  if (a.hole && b.hole && (!sameBox(a.hole, b.hole) || a.hole.r !== b.hole.r)) return false;
  if (a.menus.length !== b.menus.length) return false;
  return a.menus.every((m, i) => {
    const o = b.menus[i];
    return o !== undefined && sameBox(m, o);
  });
}

function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (![r.left, r.top, r.width, r.height].every(fin)) return null;
  if (!(r.width > 0) || !(r.height > 0)) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function measure(target: TutorialTarget, car: { x: number; y: number } | null): Measure {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let hole: Measure["hole"] = null;
  if (target.kind === "dom") {
    // Ids are plain kebab-case words: anything else cannot match and is ignored.
    const el = SAFE_ID.test(target.id)
      ? document.querySelector(`[data-tutorial="${target.id}"]`)
      : null;
    const b = el ? boxOf(el) : null;
    if (b) {
      hole = {
        x: b.x - HOLE_PAD,
        y: b.y - HOLE_PAD,
        w: b.w + 2 * HOLE_PAD,
        h: b.h + 2 * HOLE_PAD,
        r: Math.min(20, (Math.min(b.w, b.h) + 2 * HOLE_PAD) / 2),
      };
    }
  } else if (target.kind === "car" && car && fin(car.x) && fin(car.y)) {
    hole = {
      x: car.x - CAR_RADIUS,
      y: car.y - CAR_RADIUS,
      w: 2 * CAR_RADIUS,
      h: 2 * CAR_RADIUS,
      r: CAR_RADIUS,
    };
  }
  const menus: (Box & { id: string })[] = [];
  for (const sel of MENU_SELECTORS) {
    const el = document.querySelector(sel);
    const b = el ? boxOf(el) : null;
    if (b) menus.push({ ...b, id: sel });
  }
  return { vw, vh, hole, menus };
}

/** Measures the target on every animation frame: it can move, scroll, resize or appear late. */
function useMeasure(target: TutorialTarget, car: { x: number; y: number } | null): Measure {
  const [value, setValue] = useState<Measure>(() => measure(target, car));
  const latest = useRef({ target, car });
  useEffect(() => {
    latest.current = { target, car };
  });
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const next = measure(latest.current.target, latest.current.car);
      setValue((prev) => (sameMeasure(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);
  return value;
}

type ArrowSide = "above" | "below" | "left";

/** Where the arrow sits relative to the hole, and the angle (deg, 0 = pointing down) it needs. */
function arrowPlacement(
  hole: Box,
  vw: number,
  vh: number,
): { side: ArrowSide; x: number; y: number; angle: number } {
  const cx = hole.x + hole.w / 2;
  const cy = hole.y + hole.h / 2;
  const size = 64;
  const gap = 4;
  let side: ArrowSide = cy > vh * 0.5 ? "above" : "below";
  if (cx > vw * 0.8) side = "left";
  if (side === "above" && hole.y < size + gap + 8) side = "below";
  if (side === "below" && hole.y + hole.h + size + gap > vh - 8) side = "above";
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  if (side === "left") {
    return {
      side,
      x: clamp(hole.x - size - gap, 4, vw - size - 4),
      y: clamp(cy - size / 2, 4, vh - size - 4),
      angle: -90,
    };
  }
  if (side === "above") {
    return {
      side,
      x: clamp(cx - size / 2, 4, vw - size - 4),
      y: clamp(hole.y - size - gap, 4, vh - size - 4),
      angle: 0,
    };
  }
  return {
    side,
    x: clamp(cx - size / 2, 4, vw - size - 4),
    y: clamp(hole.y + hole.h + gap, 4, vh - size - 4),
    angle: 180,
  };
}

/** The big arrow: a fat rounded SVG arrow pointing down; rotated by `angle`. */
function Arrow({ placement }: { readonly placement: ReturnType<typeof arrowPlacement> }) {
  return (
    <div
      className="tut-arrow"
      data-testid="tutorial-arrow"
      data-side={placement.side}
      aria-hidden="true"
      style={
        {
          left: `${String(placement.x)}px`,
          top: `${String(placement.y)}px`,
          "--tut-angle": `${String(placement.angle)}deg`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 64 64" className="tut-arrow-svg">
        <path
          d="M24 4H40Q44 4 44 8V30H54Q60 30 56 36L36 58Q32 62 28 58L8 36Q4 30 10 30H20V8Q20 4 24 4Z"
          className="tut-arrow-shape"
        />
      </svg>
    </div>
  );
}

function Portrait({ talking }: { readonly talking: boolean }) {
  const { src } = useRenePortrait();
  // A picture that fails to decode is remembered, so the SVG stays instead of a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src !== null && failed !== src;
  return (
    <span
      className="tut-portrait"
      data-talking={String(talking)}
      data-state={showImage ? "3d" : "svg"}
    >
      <span className="tut-portrait-body">
        {showImage ? (
          <img
            className="tut-portrait-img"
            src={src}
            alt="René, l'ancien gérant"
            draggable={false}
            onError={() => {
              setFailed(src);
            }}
          />
        ) : (
          <ReneAvatar className="tut-portrait-svg" />
        )}
      </span>
    </span>
  );
}

export function TutorialOverlay(props: TutorialOverlayProps): JSX.Element {
  // Re-keyed per step: the spotlight and the bar animate in again, the typing restarts.
  return <OverlayInner key={props.step} {...props} />;
}

function OverlayInner({
  step,
  script,
  carTarget,
  canSkip,
  onTap,
  onSkip,
}: TutorialOverlayProps): JSX.Element {
  const reduced = useReducedMotion();
  const measured = useMeasure(script.target, carTarget);

  const linesKey = script.lines.join("\u0001");
  const lines = script.lines.length > 0 ? script.lines : [""];
  const [seenKey, setSeenKey] = useState(linesKey);
  const [lineIndex, setLineIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [nudge, setNudge] = useState(0);
  // The text of the step changed under us (e.g. the gain became known): start over.
  if (seenKey !== linesKey) {
    setSeenKey(linesKey);
    setLineIndex(0);
    setChars(0);
  }

  const lastIndex = lines.length - 1;
  const index = Math.min(lineIndex, lastIndex);
  const glyphs = Array.from(lines[index] ?? "");
  const shown = reduced ? glyphs.length : Math.min(chars, glyphs.length);
  const typing = shown < glyphs.length;
  const onLast = index === lastIndex;

  useEffect(() => {
    if (reduced || !typing) return undefined;
    const id = window.setInterval(() => {
      setChars((c) => c + 1);
    }, TYPE_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [reduced, typing, index, linesKey]);

  function advance(): void {
    if (typing) {
      setChars(glyphs.length);
      return;
    }
    if (!onLast) {
      setLineIndex(index + 1);
      setChars(0);
      return;
    }
    if (script.waitsFor === "tap") {
      onTap();
      return;
    }
    // The player has to do the action: remind them where.
    setNudge((n) => n + 1);
  }

  const { hole, menus, vw, vh } = measured;
  // While René talks (or the step ends on a tap) the whole game is blocked and any tap advances.
  const catchAll = script.waitsFor === "tap" || !onLast;
  const passThrough = !catchAll && hole !== null;
  const lightMode = !catchAll && hole === null;
  const barAtTop = hole !== null && hole.y + hole.h / 2 > vh * 0.5 && hole.y > BAR_HEIGHT * 0.5;
  const arrow = hole !== null && onLast ? arrowPlacement(hole, vw, vh) : null;
  const typed = glyphs.slice(0, shown).join("");
  const rest = glyphs.slice(shown).join("");
  const more = !typing && (!onLast || script.waitsFor === "tap");

  return (
    <div
      className="tut-root"
      data-testid="tutorial-overlay"
      data-step={step}
      data-mode={catchAll ? "catch" : passThrough ? "spot" : "light"}
    >
      {catchAll && (
        <div
          className="tut-block tut-dim"
          data-testid="tutorial-block"
          data-dim={String(hole === null)}
          style={hole === null ? undefined : { background: "transparent" }}
          onClick={advance}
        />
      )}
      {passThrough && hole !== null && (
        <>
          {/* Four blockers around the hole: the hole itself lets taps through to the control. */}
          <div
            className="tut-block"
            data-testid="tutorial-block-top"
            style={{ left: 0, right: 0, top: 0, height: `${String(Math.max(0, hole.y))}px` }}
            onClick={advance}
          />
          <div
            className="tut-block"
            data-testid="tutorial-block-bottom"
            style={{ left: 0, right: 0, bottom: 0, top: `${String(hole.y + hole.h)}px` }}
            onClick={advance}
          />
          <div
            className="tut-block"
            data-testid="tutorial-block-left"
            style={{
              left: 0,
              top: `${String(hole.y)}px`,
              height: `${String(hole.h)}px`,
              width: `${String(Math.max(0, hole.x))}px`,
            }}
            onClick={advance}
          />
          <div
            className="tut-block"
            data-testid="tutorial-block-right"
            style={{
              right: 0,
              top: `${String(hole.y)}px`,
              height: `${String(hole.h)}px`,
              left: `${String(hole.x + hole.w)}px`,
            }}
            onClick={advance}
          />
        </>
      )}
      {lightMode &&
        menus.map((m) => (
          <div
            key={m.id}
            className="tut-block"
            data-testid="tutorial-menu-block"
            style={{
              left: `${String(m.x)}px`,
              top: `${String(m.y)}px`,
              width: `${String(m.w)}px`,
              height: `${String(m.h)}px`,
            }}
            onClick={advance}
          />
        ))}
      {hole !== null && (
        <div
          className="tut-hole"
          data-testid="tutorial-hole"
          aria-hidden="true"
          style={{
            left: `${String(hole.x)}px`,
            top: `${String(hole.y)}px`,
            width: `${String(hole.w)}px`,
            height: `${String(hole.h)}px`,
            borderRadius: `${String(hole.r)}px`,
          }}
        />
      )}
      {arrow !== null && <Arrow key={nudge} placement={arrow} />}
      <div className="tut-bar" data-testid="tutorial-bar" data-side={barAtTop ? "top" : "bottom"}>
        <button
          type="button"
          className="tut-speaker"
          data-testid="tutorial-bubble"
          data-typing={String(typing)}
          data-more={String(more)}
          onClick={advance}
        >
          <Portrait talking={typing} />
          <span className="tut-bubble">
            <span className="tut-name">René</span>
            <span className="sr-only" data-testid="tutorial-line-full">
              {glyphs.join("")}
            </span>
            <span className="tut-text" aria-hidden="true" data-testid="tutorial-line">
              <span>{typed}</span>
              <span className="tut-text-rest">{rest}</span>
            </span>
            {more && (
              <span className="tut-more" aria-hidden="true" data-testid="tutorial-more"></span>
            )}
          </span>
        </button>
        {canSkip && (
          <button type="button" className="tut-skip" data-testid="tutorial-skip" onClick={onSkip}>
            Passer le tutoriel
          </button>
        )}
      </div>
    </div>
  );
}
