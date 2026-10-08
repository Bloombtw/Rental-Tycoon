import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GameState } from "@rt/sim";
import { previewClock } from "../game/clock.js";
import {
  clampCamera,
  fitCamera,
  panBy,
  wheelZoomFactor,
  zoomAt,
  type Camera,
  type ScreenRect,
} from "../scene/camera.js";
import { carIndexAt } from "../scene/carMotion.js";
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
import type { AgencyScene3D } from "../scene/AgencyScene3D.js";
import { CarTooltip } from "./CarTooltip.js";

type AgencyScene = AgencyScene3D;

interface AgencyViewProps {
  /** Committed game state. Changes (buy, price, commit) trigger a redraw while paused. */
  readonly game: GameState;
  readonly paused: boolean;
  /** Fractional minutes not yet committed, for interpolation. */
  readonly pendingRef: { readonly current: number };
}

type ViewStatus = "loading" | "ready" | "fallback";

interface TooltipState {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

export function AgencyFallback() {
  return (
    <div className="agency-fallback" data-testid="agency-fallback" role="note">
      Vue de l'agence indisponible sur cet appareil. Utilisez le panneau « Gérer l'agence ».
    </div>
  );
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
}

export function AgencyView({ game, paused, pendingRef }: AgencyViewProps) {
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

  useEffect(() => {
    gameRef.current = game;
    pausedRef.current = paused;
    tooltipRef.current = tooltip;
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

    const teardown = (): void => {
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
        let cam = cameraRef.current;
        cam =
          !userMovedRef.current || cam === null
            ? fitCamera(layout.bounds, view)
            : clampCamera(cam, layout.bounds, view);
        cameraRef.current = cam;
        scene.update(preview.game, preview.timeOfDay, layout);
        scene.setCamera(cam, view);
        scene.render();
        host.dataset["carSprites"] = String(scene.posesNow().length);
      } catch {
        fail();
      }
    };

    const loop = (): void => {
      raf = null;
      draw();
      if (scene && !pausedRef.current) raf = requestAnimationFrame(loop);
    };

    const syncLoop = (): void => {
      if (!scene) return;
      if (pausedRef.current) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
        draw();
      } else if (raf === null) {
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
      cameraRef.current = clampCamera(zoomAt(cam, view, factor, anchor), layout.bounds, view);
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
          cameraRef.current = clampCamera(panBy(cam, effect.dx, effect.dy), layout.bounds, view);
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

    if (!detectWebGL()) return undefined;

    const initial = measure();
    setSize(initial);
    import("../scene/AgencyScene3D.js")
      .then(({ AgencyScene3D: Scene }) =>
        Scene.create(host, {
          palette: readPalette((name) =>
            getComputedStyle(document.documentElement).getPropertyValue(name),
          ),
          reducedMotion: motion?.matches === true,
          size: { width: Math.max(1, initial.width), height: Math.max(1, initial.height) },
          baseUrl: import.meta.env.BASE_URL,
          isCancelled: () => cancelled,
        }),
      )
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        sceneRef.current = created;
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

  // Redraw / restart the loop whenever the game or the pause state changes.
  useEffect(() => {
    drawRef.current?.();
  }, [game, paused, status]);

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
          Chargement de la ville…
        </div>
      )}
      {status === "fallback" && <AgencyFallback />}
      {status === "ready" && (
        <button
          type="button"
          className="btn camera-reset"
          data-testid="camera-reset"
          aria-label="Recentrer la vue"
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
        >
          ⌖
        </button>
      )}
      {status === "ready" && tooltip !== null && content !== null && (
        <CarTooltip content={content} x={tooltip.x} y={tooltip.y} bounds={size} />
      )}
    </div>
  );
}
