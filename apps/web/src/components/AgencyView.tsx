import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GameState } from "@rt/sim";
import { previewClock } from "../game/clock.js";
import { deviceHints } from "../game/deviceHints.js";
import {
  NO_INSETS,
  clampCamera,
  clampInsets,
  fitCameraInRect,
  panBy,
  planeToScreen,
  wheelZoomFactor,
  zoomAt,
  type Camera,
  type ObscuredInsets,
  type ScreenRect,
} from "../scene/camera.js";
import { MODEL_ASSET_KEYS } from "../scene/assets.js";
import { carIndexAt } from "../scene/carMotion.js";
import { departuresBetween, MAX_GAIN_FLOATS } from "../scene/gains.js";
import { toViewPlane } from "../scene/iso.js";
import { formatCents } from "../format.js";
import {
  INITIAL_GESTURE,
  reduceGesture,
  type GestureEffect,
  type GestureState,
  type PointerInput,
} from "../scene/gestures.js";
import { computeLayout, type AgencyLayout } from "../scene/layout.js";
import { carTooltip } from "../scene/tooltip.js";
import { detectWebGL } from "../scene/webgl.js";
import { readPalette } from "../scene/palette.js";
import {
  INITIAL_MONITOR,
  initialTier,
  observeFrame,
  type FrameMonitor,
  type QualityTier,
} from "../scene/quality.js";
import { advanceAmbient } from "../scene/traffic.js";
import type { AgencyScene3D } from "../scene/AgencyScene3D.js";
import { Button } from "../ui/Button.js";
import { CarIllustration, Icon } from "../ui/icons.js";
import { ProgressBar } from "../ui/ProgressBar.js";
import { failThumbnails, getThumbnailState, publishThumbnails } from "../ui/thumbnailStore.js";
import { CarTooltip } from "./CarTooltip.js";

type AgencyScene = AgencyScene3D;

interface AgencyViewProps {
  /** Committed game state. Changes (buy, price, commit) trigger a redraw while paused. */
  readonly game: GameState;
  readonly paused: boolean;
  /** Game speed (1, 2, 4 or 10): drives the pace of the background traffic. */
  readonly speed: number;
  /** Fractional minutes not yet committed, for interpolation. */
  readonly pendingRef: { readonly current: number };
  /**
   * Parts of the view hidden under the floating HUD and sheet: the overview frames the agency in
   * the free rectangle. Panning, pinching and taps stay computed on the whole canvas.
   * Defaults to no insets.
   */
  readonly insets?: ObscuredInsets;
  /** Called with the tier in use once the scene exists and whenever it drops. */
  readonly onQualityChange?: (tier: QualityTier) => void;
}

/** Size of the thumbnails rendered by the scene (shown at 160 x 120 CSS px at most, x2). */
const THUMBNAIL_SIZE = { width: 320, height: 240 } as const;
const THUMBNAIL_KEYS = MODEL_ASSET_KEYS;
/** Longest wait for an idle moment before rendering the thumbnails. */
const THUMBNAIL_IDLE_TIMEOUT_MS = 2000;
const THUMBNAIL_FALLBACK_DELAY_MS = 500;

type ViewStatus = "loading" | "ready" | "fallback";

interface TooltipState {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

export function AgencyFallback() {
  return (
    <div className="agency-fallback" data-testid="agency-fallback" role="note">
      <CarIllustration tint="compact" className="agency-fallback-illu" />
      <p>Vue de l'agence indisponible sur cet appareil. Utilisez le panneau « Gérer l'agence ».</p>
    </div>
  );
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
}

/** Writes a data attribute only when it changes: an attribute write invalidates style every frame. */
function setData(el: HTMLElement, key: string, value: string): void {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

/** A "+X €" bubble: host-relative position, and the offset to the HUD cash for its coin. */
interface GainFloat {
  readonly key: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly text: string;
}

/** Height above the ground (world units) where a gain bubble starts: just over the car roof. */
const GAIN_HEIGHT = 2.2;

/** Diagnostic attributes are refreshed at most this often. */
const DIAGNOSTIC_INTERVAL_MS = 500;

function loadingPercent(progress: { loaded: number; total: number }): number {
  if (!Number.isFinite(progress.loaded) || !Number.isFinite(progress.total)) return 0;
  if (!(progress.total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100)));
}

function loadingText(progress: { loaded: number; total: number }): string {
  if (!Number.isFinite(progress.loaded) || !Number.isFinite(progress.total))
    return "Chargement de la ville…";
  if (!(progress.total > 0)) return "Chargement de la ville…";
  const pct = Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100)));
  return `Chargement de la ville… ${String(pct)} %`;
}

export function AgencyView({
  game,
  paused,
  speed,
  pendingRef,
  insets = NO_INSETS,
  onQualityChange,
}: AgencyViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<ViewStatus>(() => (detectWebGL() ? "loading" : "fallback"));
  const resetRef = useRef<(() => void) | null>(null);
  const applyEffectRef = useRef<((effect: GestureEffect) => void) | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const gameRef = useRef(game);
  const pausedRef = useRef(paused);
  const sceneRef = useRef<AgencyScene | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const userMovedRef = useRef(false);
  const gestureRef = useRef<GestureState>(INITIAL_GESTURE);
  const sizeRef = useRef(size);
  const layoutRef = useRef<{ key: string; layout: AgencyLayout } | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const tooltipRef = useRef<TooltipState | null>(null);
  const speedRef = useRef(speed);
  const ambientRef = useRef(0);
  const insetsRef = useRef(insets);
  const qualityCbRef = useRef(onQualityChange);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [gains, setGains] = useState<readonly GainFloat[]>([]);
  const lastGainGameRef = useRef<GameState | null>(null);
  const gainKeyRef = useRef(0);

  useEffect(() => {
    gameRef.current = game;
    pausedRef.current = paused;
    speedRef.current = speed;
    tooltipRef.current = tooltip;
    insetsRef.current = insets;
    qualityCbRef.current = onQualityChange;
  });

  // Scene lifetime: detect WebGL, load Three.js lazily, build the scene, clean up completely.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let scene: AgencyScene | null = null;
    let observer: ResizeObserver | null = null;
    const motion = reducedMotionQuery();
    let raf: number | null = null;
    let tier: QualityTier = initialTier(deviceHints());
    let monitor: FrameMonitor = INITIAL_MONITOR;
    let lastFrame: number | null = null;
    let lastDiagnostics = Number.NEGATIVE_INFINITY;
    let thumbnailTimer: { kind: "idle" | "timeout"; id: number } | null = null;

    const cancelThumbnails = (): void => {
      if (thumbnailTimer === null) return;
      if (thumbnailTimer.kind === "idle") {
        if (typeof cancelIdleCallback === "function") cancelIdleCallback(thumbnailTimer.id);
      } else {
        clearTimeout(thumbnailTimer.id);
      }
      thumbnailTimer = null;
    };

    /** Renders the car thumbnails once, when the browser is idle and nobody is dragging. */
    const scheduleThumbnails = (): void => {
      if (cancelled || getThumbnailState().status === "ready") return;
      const run = (): void => {
        thumbnailTimer = null;
        const s = scene;
        if (cancelled || s === null) return;
        if (gestureRef.current.mode !== "idle") {
          thumbnailTimer = {
            kind: "timeout",
            id: window.setTimeout(run, THUMBNAIL_FALLBACK_DELAY_MS),
          };
          return;
        }
        try {
          s.renderThumbnails(THUMBNAIL_KEYS, THUMBNAIL_SIZE).then(
            publishThumbnails,
            failThumbnails,
          );
        } catch {
          failThumbnails();
        }
      };
      if (typeof requestIdleCallback === "function") {
        thumbnailTimer = {
          kind: "idle",
          id: requestIdleCallback(run, { timeout: THUMBNAIL_IDLE_TIMEOUT_MS }),
        };
      } else {
        thumbnailTimer = {
          kind: "timeout",
          id: window.setTimeout(run, THUMBNAIL_FALLBACK_DELAY_MS),
        };
      }
    };

    const teardown = (): void => {
      cancelThumbnails();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      observer?.disconnect();
      observer = null;
      drawRef.current = null;
      sceneRef.current = null;
      scene?.destroy();
      scene = null;
    };

    const measure = (): { width: number; height: number } => {
      const r = host.getBoundingClientRect();
      const next = {
        width: Number.isFinite(r.width) ? Math.max(0, r.width) : 0,
        height: Number.isFinite(r.height) ? Math.max(0, r.height) : 0,
      };
      sizeRef.current = next;
      return next;
    };

    const fail = (): void => {
      teardown();
      if (!cancelled) setStatus("fallback");
    };

    const draw = (): void => {
      if (!scene) return;
      try {
        const view: ScreenRect = {
          x: 0,
          y: 0,
          width: Math.max(1, sizeRef.current.width),
          height: Math.max(1, sizeRef.current.height),
        };
        const preview = previewClock(gameRef.current, pendingRef.current);
        const cached = layoutRef.current;
        const count = preview.game.fleet.length;
        const key = `${count}:${view.width}:${view.height}`;
        const layout = cached?.key === key ? cached.layout : computeLayout(count, view);
        if (cached?.key !== key) layoutRef.current = { key, layout };
        const free = insetsRef.current;
        let cam = cameraRef.current;
        cam =
          !userMovedRef.current || cam === null
            ? fitCameraInRect(layout.bounds, view, free)
            : clampCamera(cam, layout.bounds, view, free);
        cameraRef.current = cam;
        scene.update(preview.game, preview.timeOfDay, layout, ambientRef.current);
        scene.setCamera(cam, view);
        scene.render();
        // "+X €" above the cars that just left on a rental (gain feedback).
        const committed = gameRef.current;
        const lastGain = lastGainGameRef.current;
        if (lastGain !== committed) {
          lastGainGameRef.current = committed;
          const departed = lastGain === null ? [] : departuresBetween(lastGain, committed);
          if (departed.length > 0) {
            const poses = scene.posesNow();
            const hostBox = host.getBoundingClientRect();
            const cashBox = document
              .querySelector('[data-testid="hud-cash-display"]')
              ?.getBoundingClientRect();
            const born: GainFloat[] = [];
            for (const d of departed.slice(0, MAX_GAIN_FLOATS)) {
              const pose = poses[d.index];
              if (!pose) continue;
              const s = planeToScreen(
                cam,
                view,
                toViewPlane({ x: pose.x, y: GAIN_HEIGHT, z: pose.z }),
              );
              if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
              const tx = cashBox ? cashBox.left + cashBox.width / 2 - hostBox.left : s.x;
              const ty = cashBox ? cashBox.top + cashBox.height / 2 - hostBox.top : s.y;
              gainKeyRef.current += 1;
              born.push({
                key: gainKeyRef.current,
                x: s.x,
                y: s.y,
                dx: tx - s.x,
                dy: ty - s.y,
                text: `+${formatCents(d.amount)}`,
              });
            }
            if (born.length > 0) {
              setGains((prev) => [...prev, ...born].slice(-MAX_GAIN_FLOATS));
            }
          }
        }
        setData(host, "carSprites", String(scene.posesNow().length));
        setData(host, "quality", tier);
        const now = performance.now();
        if (now - lastDiagnostics >= DIAGNOSTIC_INTERVAL_MS) {
          lastDiagnostics = now;
          const stats = scene.stats();
          setData(host, "traffic", String(stats.traffic));
          setData(host, "drawCalls", String(stats.calls));
          setData(host, "triangles", String(stats.triangles));
        }
      } catch {
        fail();
      }
    };

    const loop = (now: number): void => {
      raf = null;
      if (scene && !pausedRef.current) {
        // Time advances: move the ambient clock and watch the frame time.
        const dt = lastFrame === null ? 0 : now - lastFrame;
        lastFrame = now;
        ambientRef.current = advanceAmbient(ambientRef.current, dt, speedRef.current, false);
        if (dt > 0) {
          const next = observeFrame(monitor, tier, dt, now);
          monitor = next.monitor;
          if (next.tier !== tier) {
            tier = next.tier;
            try {
              scene.setQuality(tier);
            } catch {
              fail();
              return;
            }
            qualityCbRef.current?.(tier);
          }
        }
      }
      draw();
      if (scene && !pausedRef.current) raf = requestAnimationFrame(loop);
    };

    const syncLoop = (): void => {
      if (!scene) return;
      if (pausedRef.current) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
        lastFrame = null;
        draw();
      } else if (raf === null) {
        lastFrame = null;
        raf = requestAnimationFrame(loop);
      }
    };

    const onWheel = (event: WheelEvent): void => {
      const cam = cameraRef.current;
      if (!scene || !cam) return;
      event.preventDefault();
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
      if (factor === 1) return;
      const rect = host.getBoundingClientRect();
      const view: ScreenRect = { x: 0, y: 0, width: rect.width, height: rect.height };
      const layout = layoutRef.current?.layout;
      if (!layout) return;
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      cameraRef.current = clampCamera(
        zoomAt(cam, view, factor, anchor),
        layout.bounds,
        view,
        insetsRef.current,
      );
      userMovedRef.current = true;
      setTooltip(null);
      draw();
    };

    const onMotionChange = (): void => {
      scene?.setReducedMotion(motion?.matches === true);
      draw();
    };

    const onResize = (): void => {
      const next = measure();
      setSize(next);
      draw();
    };

    drawRef.current = () => {
      syncLoop();
    };
    // Expose camera helpers through refs for handlers below.
    resetRef.current = () => {
      userMovedRef.current = false;
      draw();
    };
    applyEffectRef.current = (effect: GestureEffect): void => {
      const cam = cameraRef.current;
      const layout = layoutRef.current?.layout;
      if (!scene || !cam || !layout) return;
      const rect = host.getBoundingClientRect();
      const view: ScreenRect = { x: 0, y: 0, width: rect.width, height: rect.height };
      switch (effect.type) {
        case "pan":
          cameraRef.current = clampCamera(
            panBy(cam, effect.dx, effect.dy),
            layout.bounds,
            view,
            insetsRef.current,
          );
          userMovedRef.current = true;
          setTooltip(null);
          draw();
          break;
        case "pinch": {
          const moved = panBy(cam, effect.dx, effect.dy);
          cameraRef.current = clampCamera(
            zoomAt(moved, view, effect.factor, effect.anchor),
            layout.bounds,
            view,
            insetsRef.current,
          );
          userMovedRef.current = true;
          setTooltip(null);
          draw();
          break;
        }
        case "tap": {
          const index = carIndexAt(cam, view, scene.posesNow(), { x: effect.x, y: effect.y });
          const current = tooltipRef.current;
          setTooltip(
            index === null || index === current?.index ? null : { index, x: effect.x, y: effect.y },
          );
          break;
        }
        case "hover": {
          const index = carIndexAt(cam, view, scene.posesNow(), { x: effect.x, y: effect.y });
          setTooltip(index === null ? null : { index, x: effect.x, y: effect.y });
          break;
        }
        default:
          break;
      }
    };

    if (!detectWebGL()) {
      failThumbnails();
      return undefined;
    }

    const initial = measure();
    setSize(initial);
    import("../scene/AgencyScene3D.js")
      .then(({ AgencyScene3D: Scene }) => {
        // The effect may have been cleaned up while the module was loading: build nothing.
        if (cancelled) return null;
        return Scene.create(host, {
          tier,
          onProgress: (loaded, total) => {
            if (!cancelled) setProgress({ loaded, total });
          },
          palette: readPalette((name) =>
            getComputedStyle(document.documentElement).getPropertyValue(name),
          ),
          reducedMotion: motion?.matches === true,
          size: { width: Math.max(1, initial.width), height: Math.max(1, initial.height) },
          baseUrl: import.meta.env.BASE_URL,
          isCancelled: () => cancelled,
        });
      })
      .then((created) => {
        if (created === null) return;
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        sceneRef.current = created;
        // The scene may have lowered the tier (small GPU textures): start from the real one.
        tier = created.quality();
        qualityCbRef.current?.(tier);
        created.onFailure(fail);
        host.addEventListener("wheel", onWheel, { passive: false });
        motion?.addEventListener("change", onMotionChange);
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(onResize);
          observer.observe(host);
        }
        setStatus("ready");
        draw();
        syncLoop();
        scheduleThumbnails();
      })
      .catch(() => {
        if (!cancelled) fail();
      });

    return () => {
      cancelled = true;
      host.removeEventListener("wheel", onWheel);
      motion?.removeEventListener("change", onMotionChange);
      resetRef.current = null;
      applyEffectRef.current = null;
      teardown();
    };
  }, [pendingRef]);

  // Redraw / restart the loop whenever the game, the pause state or the free area changes.
  useEffect(() => {
    drawRef.current?.();
  }, [game, paused, status, insets]);

  const freeInsets = clampInsets(insets, size);

  useEffect(() => {
    sceneRef.current?.setHighlight(tooltip?.index ?? null);
    if (pausedRef.current) drawRef.current?.();
  }, [tooltip]);

  const onPointer = useCallback(
    (kind: PointerInput["kind"], e: ReactPointerEvent<HTMLDivElement>) => {
      const host = hostRef.current;
      if (!host || !applyEffectRef.current) return;
      if (kind === "down") {
        try {
          host.setPointerCapture(e.pointerId);
        } catch {
          // capture is best effort
        }
      }
      const rect = host.getBoundingClientRect();
      const input: PointerInput = {
        kind,
        id: e.pointerId,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        t: e.timeStamp,
        pointerType: e.pointerType,
        buttons: e.buttons,
      };
      const result = reduceGesture(gestureRef.current, input);
      gestureRef.current = result.state;
      if (result.effect.type !== "none") applyEffectRef.current(result.effect);
    },
    [],
  );

  const car = tooltip !== null ? game.fleet[tooltip.index] : undefined;
  const content =
    tooltip !== null && car !== undefined ? carTooltip(car, tooltip.index, game.minute) : null;

  return (
    <div
      ref={hostRef}
      className="agency-view"
      data-testid="agency-view"
      data-state={status}
      data-car-sprites={Math.min(game.fleet.length, 50)}
      onPointerDown={(e) => {
        onPointer("down", e);
      }}
      onPointerMove={(e) => {
        onPointer("move", e);
      }}
      onPointerUp={(e) => {
        onPointer("up", e);
      }}
      onPointerCancel={(e) => {
        onPointer("cancel", e);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && tooltipRef.current !== null && e.buttons === 0)
          setTooltip(null);
      }}
    >
      {status === "loading" && (
        <div className="agency-loading" data-testid="agency-loading" role="status">
          <Icon name="car" size={32} className="loading-car" />
          <span className="loading-text">{loadingText(progress)}</span>
          <ProgressBar
            value={loadingPercent(progress)}
            max={100}
            label="Chargement de la ville"
            tone="primary"
          />
        </div>
      )}
      {status === "fallback" && <AgencyFallback />}
      {status === "ready" && (
        <Button
          variant="glass"
          size="icon"
          icon="recenter"
          className="camera-reset"
          data-testid="camera-reset"
          aria-label="Recentrer la vue"
          style={{ bottom: `calc(${String(freeInsets.bottom)}px + var(--space-4))` }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
          onClick={() => {
            resetRef.current?.();
            setTooltip(null);
          }}
        />
      )}
      {status === "ready" && gains.length > 0 && (
        <div className="gain-layer" aria-hidden="true">
          {gains.map((g) => (
            <span
              key={g.key}
              className="gain-float"
              data-testid="gain-float"
              style={
                {
                  left: `${String(g.x)}px`,
                  top: `${String(g.y)}px`,
                  "--coin-dx": `${String(g.dx)}px`,
                  "--coin-dy": `${String(g.dy)}px`,
                } as CSSProperties
              }
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                setGains((prev) => prev.filter((x) => x.key !== g.key));
              }}
            >
              <span className="gain-text">{g.text}</span>
              <span className="gain-coin">
                <Icon name="coin" size={20} />
              </span>
            </span>
          ))}
        </div>
      )}
      {status === "ready" && tooltip !== null && content !== null && (
        <CarTooltip
          content={content}
          x={tooltip.x}
          y={tooltip.y}
          bounds={size}
          insets={freeInsets}
          model={car?.model}
        />
      )}
    </div>
  );
}
