import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  canClaimDailyReward,
  claimableMissions,
  revenueMultiplier,
  type BoosterId,
  type ProductId,
  fleetCapacity,
  nextStreak,
  type CarId,
  type CarModelId,
  type Cents,
  type GameState,
  type ManagerId,
  type UpgradeId,
} from "@rt/sim";
import { ManagersPanel } from "./components/ManagersPanel.js";
import { MissionsPanel } from "./components/MissionsPanel.js";
import { UpgradesPanel } from "./components/UpgradesPanel.js";
import { AgencyFallback, AgencyView } from "./components/AgencyView.js";
import { BuyCarPanel } from "./components/BuyCarPanel.js";
import { CoachCard } from "./components/CoachCard.js";
import { DailyRewardDialog } from "./components/DailyRewardDialog.js";
import { DemoCheckout } from "./components/DemoCheckout.js";
import { ShopDialog } from "./components/ShopDialog.js";
import { gemsText } from "./game/messages.js";
import {
  fetchLiveReceipt,
  paymentsConfig,
  PENDING_ORDER_KEY,
  startLiveCheckout,
  testReceipt,
} from "./game/payments.js";
import { Icon } from "./ui/icons.js";
import { calendarDay } from "./game/calendar.js";
import { DayBanner } from "./components/DayBanner.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { FleetPanel } from "./components/FleetPanel.js";
import { Hud } from "./components/Hud.js";
import { ManageDrawer } from "./components/ManageDrawer.js";
import { MessageBanner } from "./components/MessageBanner.js";
import type { Speed } from "./game/clock.js";
import { NewGameButton } from "./components/NewGameButton.js";
import { NewGameDialog } from "./components/NewGameDialog.js";
import { OfflineDialog } from "./components/OfflineDialog.js";
import { SaveWarning } from "./components/SaveWarning.js";
import { gameReducer } from "./game/gameReducer.js";
import { loadInitialState } from "./game/persistence.js";
import { newSeed } from "./game/seed.js";
import { browserSaveStorage, type SaveStorage } from "./game/saveStorage.js";
import { deviceHints } from "./game/deviceHints.js";
import { useAutosave } from "./game/useAutosave.js";
import { useObscuredInsets } from "./game/useObscuredInsets.js";
import { initialTier, type QualityTier } from "./scene/quality.js";
import { browserClockDriver, useGameClock, type ClockDriver } from "./game/useGameClock.js";

export function App(props: {
  initialGame?: GameState;
  clockDriver?: ClockDriver;
  storage?: SaveStorage | null;
  newSeed?: () => number;
  /** Offer the daily login reward (tests turn it off). Defaults to true. */
  dailyReward?: boolean;
}) {
  // Storage and the saved game are read once, synchronously, before the first render.
  const [storage] = useState<SaveStorage | null>(() =>
    props.storage !== undefined ? props.storage : browserSaveStorage(),
  );
  // StrictMode runs this initializer twice in development and keeps one result. That is safe:
  // the read is idempotent (the first run copies a rejected save to the backup slot and removes
  // it, the second then sees no save and would start a new game, but its result is discarded
  // in favour of the first). Only the kept result reaches the reducer and the autosave.
  const [loaded] = useState(() =>
    loadInitialState({
      storage,
      newSeed: props.newSeed ?? newSeed,
      ...(props.initialGame ? { initialGame: props.initialGame } : {}),
    }),
  );
  const [ui, dispatch] = useReducer(gameReducer, loaded.ui);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Quality tier of the scene: it decides how much of the glass is blurred (see app.css).
  const [quality, setQuality] = useState<QualityTier>(() => initialTier(deviceHints()));
  const appRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const insets = useObscuredInsets({ hud: topRef, drawer: drawerRef });
  const { game } = ui;
  const capacity = fleetCapacity(game.upgrades);

  // The side panel (wide screens) starts under the HUD, whatever toasts are showing below it.
  useEffect(() => {
    const hud = hudRef.current;
    const app = appRef.current;
    if (!hud || !app) return undefined;
    const apply = (): void => {
      const bottom = hud.getBoundingClientRect().bottom;
      if (Number.isFinite(bottom) && bottom > 0) {
        app.style.setProperty("--hud-bottom", `${String(Math.round(bottom))}px`);
      }
    };
    apply();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(hud);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const autosave = useAutosave({
    storage,
    game,
    speed: ui.speed,
    paused: ui.paused,
    initialStatus: loaded.status,
    pendingBackup: loaded.pendingBackup,
  });
  const { flush } = autosave;

  // Whole minutes are committed in batches (at most 10 per second). flushSync keeps the
  // committed state and the pending fraction consistent for the scene's next frame.
  const onCommit = useCallback((minutes: number) => {
    flushSync(() => {
      dispatch({ type: "advanceTime", minutes });
    });
  }, []);
  const { pendingRef } = useGameClock({
    speed: ui.speed,
    paused: ui.paused,
    driver: props.clockDriver ?? browserClockDriver,
    onCommit,
  });

  // Local calendar day, refreshed on return from background (daily-reward.md).
  const [today, setToday] = useState(() => calendarDay(Date.now()));
  // Hidden page -> pause, and stay paused on return. The time away earns offline days.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const pause = (): void => {
      dispatch({ type: "pause" });
      flush();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= Date.now();
        pause();
      } else if (hiddenAt !== null) {
        const elapsedMs = Date.now() - hiddenAt;
        hiddenAt = null;
        dispatch({ type: "returnAfter", elapsedMs });
        setToday(calendarDay(Date.now()));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
    };
  }, [flush]);

  const onTutorialNext = useCallback(() => {
    dispatch({ type: "tutorialNext" });
  }, []);
  const onSkipTutorial = useCallback(() => {
    dispatch({ type: "skipTutorial" });
  }, []);
  // The first two tutorial steps happen in the drawer: open it; the next ones need the city.
  const tutorialStep = ui.tutorial;
  // Buy and price happen in the drawer: the coach sits at its top, next to the controls.
  const coachInDrawer = tutorialStep === "buy" || tutorialStep === "price";
  // Adjusted while rendering when the step changes (no effect, no cascading render).
  const [seenStep, setSeenStep] = useState(tutorialStep);
  if (seenStep !== tutorialStep) {
    setSeenStep(tutorialStep);
    if (coachInDrawer) setDrawerOpen(true);
    else if (tutorialStep === "run") setDrawerOpen(false);
  }

  const onClaimMission = useCallback((slot: number) => {
    dispatch({ type: "claimMission", slot });
  }, []);
  const onClaimOffline = useCallback(() => {
    dispatch({ type: "claimOffline" });
  }, []);

  // Daily login reward (daily-reward.md): once the tutorial and any offline report are done.
  const onClaimDailyReward = useCallback(() => {
    dispatch({ type: "claimDailyReward", today });
  }, [today]);
  // Shop (shop.md): test mode unless a payments endpoint is configured.
  const [payments] = useState(() => paymentsConfig());
  const [shopOpen, setShopOpen] = useState(false);
  const [checkout, setCheckout] = useState<ProductId | null>(null);
  const [liveBusy, setLiveBusy] = useState<ProductId | null>(null);
  const onOpenShop = useCallback(() => {
    setShopOpen(true);
  }, []);
  const onCloseShop = useCallback(() => {
    setShopOpen(false);
  }, []);
  const onBoost = useCallback((booster: BoosterId) => {
    dispatch({ type: "activateBooster", booster });
  }, []);
  const onBuyProduct = useCallback(
    (productId: ProductId) => {
      if (payments.mode === "test") {
        setCheckout(productId);
        return;
      }
      setLiveBusy(productId);
      startLiveCheckout(payments, productId).then(
        ({ orderId, invoiceUrl }) => {
          try {
            localStorage.setItem(PENDING_ORDER_KEY, orderId);
          } catch {
            // the ?order= return parameter still resumes it
          }
          window.location.assign(invoiceUrl);
        },
        () => {
          setLiveBusy(null);
          dispatch({ type: "purchaseFailed" });
        },
      );
    },
    [payments],
  );
  const onDemoPaid = useCallback(() => {
    if (checkout === null) return;
    dispatch({ type: "grantPurchase", receipt: testReceipt(checkout, crypto.randomUUID()) });
    setCheckout(null);
  }, [checkout]);
  const onDemoCancel = useCallback(() => {
    setCheckout(null);
  }, []);
  // Live mode: back from the crypto payment page, wait for the signed receipt.
  useEffect(() => {
    if (payments.mode !== "live") return undefined;
    let stored: string | null;
    try {
      stored = localStorage.getItem(PENDING_ORDER_KEY);
    } catch {
      stored = null; // storage blocked: the ?order= return parameter still works
    }
    const fromUrl = new URLSearchParams(window.location.search).get("order");
    const orderId = fromUrl ?? stored;
    if (!orderId) return undefined;
    let stopped = false;
    let tries = 0;
    const poll = (): void => {
      if (stopped) return;
      tries += 1;
      void fetchLiveReceipt(payments, orderId).then((receipt) => {
        if (stopped) return;
        if (receipt) {
          dispatch({ type: "grantPurchase", receipt });
          try {
            localStorage.removeItem(PENDING_ORDER_KEY);
          } catch {
            // harmless: the grant is idempotent
          }
          window.history.replaceState(null, "", window.location.pathname);
        } else if (tries < 40) {
          setTimeout(poll, 3000);
        }
      });
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [payments]);

  const showDailyReward =
    props.dailyReward !== false &&
    ui.tutorial === "done" &&
    ui.offline === null &&
    !confirmOpen &&
    !shopOpen &&
    canClaimDailyReward(game, today);

  const makeSeed = props.newSeed ?? newSeed;
  const onAskNewGame = useCallback(() => {
    dispatch({ type: "pause" });
    setConfirmOpen(true);
  }, []);
  const onCancelNewGame = useCallback(() => {
    setConfirmOpen(false);
  }, []);
  const onConfirmNewGame = useCallback(() => {
    dispatch({ type: "newGame", seed: makeSeed() });
    setConfirmOpen(false);
  }, [makeSeed]);

  const onSetSpeed = useCallback((speed: Speed) => {
    dispatch({ type: "setSpeed", speed });
  }, []);
  const onTogglePause = useCallback(() => {
    dispatch({ type: "togglePause" });
  }, []);
  const onSetPrice = useCallback((carId: CarId, dailyPrice: Cents) => {
    dispatch({ type: "setCarPrice", carId, dailyPrice });
  }, []);
  const onBuy = useCallback((model: CarModelId) => {
    dispatch({ type: "buyCar", model });
  }, []);
  const onHireManager = useCallback((manager: ManagerId) => {
    dispatch({ type: "hireManager", manager });
  }, []);
  const onFireManager = useCallback((manager: ManagerId) => {
    dispatch({ type: "fireManager", manager });
  }, []);
  const onBuyUpgrade = useCallback((upgrade: UpgradeId) => {
    dispatch({ type: "buyUpgrade", upgrade });
  }, []);
  const onDismissMessage = useCallback(() => {
    dispatch({ type: "dismissMessage" });
  }, []);
  const onDismissBanner = useCallback(() => {
    dispatch({ type: "dismissDayBanner" });
  }, []);

  return (
    <main
      ref={appRef}
      className="app"
      data-drawer={drawerOpen ? "open" : "peek"}
      data-tutorial={ui.tutorial}
      data-quality={quality}
      style={{ "--inset-top": `${String(insets.top)}px` } as CSSProperties}
    >
      {/* The scene fills the screen; everything else floats above it. */}
      <div className="top-layer" ref={topRef}>
        <Hud
          ref={hudRef}
          game={game}
          speed={ui.speed}
          paused={ui.paused}
          hasRun={ui.hasRun}
          onSetSpeed={onSetSpeed}
          onTogglePause={onTogglePause}
        />
        <SaveWarning
          status={autosave.status}
          visible={autosave.warningVisible}
          onDismiss={autosave.dismissWarning}
        />
        <MessageBanner error={ui.error} notice={ui.notice} onDismiss={onDismissMessage} />
        {!coachInDrawer && (
          <CoachCard step={ui.tutorial} onNext={onTutorialNext} onSkip={onSkipTutorial} />
        )}
      </div>
      <div className="stage">
        <ErrorBoundary fallback={<AgencyFallback />}>
          <AgencyView
            game={game}
            paused={ui.paused}
            speed={ui.speed}
            pendingRef={pendingRef}
            insets={insets}
            onQualityChange={setQuality}
          />
        </ErrorBoundary>
        {ui.dayBanner !== null && (
          <DayBanner text={ui.dayBanner} speed={ui.speed} onDismiss={onDismissBanner} />
        )}
      </div>
      <ManageDrawer
        ref={drawerRef}
        open={drawerOpen}
        fleetSize={game.fleet.length}
        capacity={capacity}
        badge={claimableMissions(game)}
        onSetOpen={setDrawerOpen}
      >
        {coachInDrawer && (
          <CoachCard step={ui.tutorial} onNext={onTutorialNext} onSkip={onSkipTutorial} />
        )}
        {ui.tutorial === "done" && <MissionsPanel game={game} onClaim={onClaimMission} />}
        <FleetPanel fleet={game.fleet} onSetPrice={onSetPrice} />
        <BuyCarPanel
          cash={game.cash}
          fleetSize={game.fleet.length}
          capacity={capacity}
          xp={game.xp}
          highlight={game.fleet.length === 0}
          onBuy={onBuy}
        />
        <UpgradesPanel cash={game.cash} upgrades={game.upgrades} onBuy={onBuyUpgrade} />
        <ManagersPanel
          cash={game.cash}
          xp={game.xp}
          managers={game.managers}
          onHire={onHireManager}
          onFire={onFireManager}
        />
        <NewGameButton onClick={onAskNewGame} />
      </ManageDrawer>
      {confirmOpen && (
        <NewGameDialog game={game} onCancel={onCancelNewGame} onConfirm={onConfirmNewGame} />
      )}
      {ui.offline !== null && !confirmOpen && (
        <OfflineDialog report={ui.offline} onClaim={onClaimOffline} />
      )}
      <button
        type="button"
        className="shop-fab"
        data-testid="shop-open"
        style={{ bottom: `calc(${String(insets.bottom)}px + var(--space-4))` }}
        aria-label={`Boutique, ${gemsText(game.shop.gems)}`}
        onClick={onOpenShop}
      >
        <Icon name="shop" size={24} />
        <span className="shop-fab-label">Boutique</span>
        <span className="shop-fab-gems">
          <Icon name="gem" size={16} />
          {game.shop.gems}
        </span>
        {revenueMultiplier(game) > 1 && <span className="shop-fab-boost">×2</span>}
      </button>
      {shopOpen && checkout === null && (
        <ShopDialog
          game={game}
          mode={payments.mode}
          busy={liveBusy}
          onBuy={onBuyProduct}
          onBoost={onBoost}
          onClose={onCloseShop}
        />
      )}
      {checkout !== null && (
        <DemoCheckout productId={checkout} onPaid={onDemoPaid} onCancel={onDemoCancel} />
      )}
      {showDailyReward && (
        <DailyRewardDialog
          streak={nextStreak(game.dailyReward, today)}
          onClaim={onClaimDailyReward}
        />
      )}
    </main>
  );
}
