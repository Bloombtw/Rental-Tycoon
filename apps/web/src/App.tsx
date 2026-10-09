import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  canClaimDailyReward,
  activeEvent,
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
import { PanelSheet } from "./components/PanelSheet.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { StatsPanel } from "./components/StatsPanel.js";
import { SideRail, type PanelId } from "./components/SideRail.js";
import { MissionsPanel } from "./components/MissionsPanel.js";
import { UpgradesPanel } from "./components/UpgradesPanel.js";
import { AgencyFallback, AgencyView } from "./components/AgencyView.js";
import { BuyCarPanel } from "./components/BuyCarPanel.js";
import { DailyRewardDialog } from "./components/DailyRewardDialog.js";
import { DemoCheckout } from "./components/DemoCheckout.js";
import { ShopDialog } from "./components/ShopDialog.js";
import {
  fetchLiveReceipt,
  paymentsConfig,
  PENDING_ORDER_KEY,
  startLiveCheckout,
  testReceipt,
} from "./game/payments.js";
import { calendarDay } from "./game/calendar.js";
import { useGameAudio } from "./game/useGameAudio.js";
import { DayBanner } from "./components/DayBanner.js";
import { EventBanner } from "./components/EventBanner.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { TutorialOverlay } from "./components/tutorial/TutorialOverlay.js";
import { FleetPanel } from "./components/FleetPanel.js";
import { Hud } from "./components/Hud.js";
import { ManageDrawer } from "./components/ManageDrawer.js";
import { MessageBanner } from "./components/MessageBanner.js";
import type { Speed } from "./game/clock.js";
import { NewGameDialog } from "./components/NewGameDialog.js";
import { OfflineDialog } from "./components/OfflineDialog.js";
import { SaveWarning } from "./components/SaveWarning.js";
import { gameReducer } from "./game/gameReducer.js";
import { tutorialScript, type TutorialStep } from "./game/tutorial.js";
import { loadInitialState } from "./game/persistence.js";
import { newSeed } from "./game/seed.js";
import { browserSaveStorage, type SaveStorage } from "./game/saveStorage.js";
import { deviceHints } from "./game/deviceHints.js";
import { useAutosave } from "./game/useAutosave.js";
import { useObscuredInsets } from "./game/useObscuredInsets.js";
import { initialTier, type QualityTier } from "./scene/quality.js";
import { browserClockDriver, useGameClock, type ClockDriver } from "./game/useGameClock.js";

type ReneMode = "hidden" | "idle" | "cheer" | "leave";
/** How long René cheers after a step, and how long his walk away lasts (ms). */
const CHEER_MS = 1600;
const LEAVE_MS = 5000;

/** During the tutorial only the menu René asks for may be opened. */
function menuAllowed(step: TutorialStep, id: PanelId): boolean {
  if (step === "done") return true;
  return (step === "openCars" && id === "cars") || (step === "openUpgrades" && id === "upgrades");
}

export function App(props: {
  initialGame?: GameState;
  clockDriver?: ClockDriver;
  storage?: SaveStorage | null;
  newSeed?: () => number;
  /** Offer the daily login reward (tests turn it off). Defaults to true. */
  dailyReward?: boolean;
  /** Run the tutorial on a brand-new game (tests turn it off). Defaults to true. */
  tutorial?: boolean;
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
      ...(props.tutorial === false ? { tutorial: false } : {}),
      ...(props.initialGame ? { initialGame: props.initialGame } : {}),
    }),
  );
  const [ui, dispatch] = useReducer(gameReducer, loaded.ui);
  const tutorialStep = ui.tutorial;
  // The fleet drawer starts collapsed: the city and the side menus come first.
  const [drawerOpen, setDrawerOpen] = useState(() => tutorialStep === "setPrice");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Quality tier of the scene: it decides how much of the glass is blurred (see app.css).
  const [quality, setQuality] = useState<QualityTier>(() => initialTier(deviceHints()));
  const appRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const insets = useObscuredInsets({ hud: topRef, drawer: drawerRef });
  const { game } = ui;
  const sound = useGameAudio(game, storage);
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
    tutorial: ui.tutorial,
    tutorialReplay: ui.tutorialReplay,
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

  // Side menus (side-menu.md). During the tutorial René decides what opens (tutorial.md).
  const [panel, setPanel] = useState<PanelId | null>(() =>
    tutorialStep === "buyUsed" ? "cars" : tutorialStep === "buyUpgrade" ? "upgrades" : null,
  );
  const onOpenPanel = useCallback(
    (id: PanelId) => {
      if (!menuAllowed(tutorialStep, id)) return;
      setPanel((p) => (p === id ? null : id));
    },
    [tutorialStep],
  );
  const onClosePanel = useCallback(() => {
    if (tutorialStep === "done") setPanel(null);
  }, [tutorialStep]);
  const onSetDrawerOpen = useCallback(
    (open: boolean) => {
      if (tutorialStep === "done" || (tutorialStep === "openFleet" && open)) setDrawerOpen(open);
    },
    [tutorialStep],
  );
  // Adjusted while rendering when the step changes (no effect, no cascading render): René opens
  // the menu that holds the target, or closes what hides it, so no step is ever without an exit.
  const [seenStep, setSeenStep] = useState(tutorialStep);
  const [rene, setRene] = useState<ReneMode>(tutorialStep === "done" ? "hidden" : "idle");
  if (seenStep !== tutorialStep) {
    setSeenStep(tutorialStep);
    switch (tutorialStep) {
      case "welcome":
      case "openCars":
        setPanel(null);
        setDrawerOpen(false);
        break;
      case "buyUsed":
        setPanel("cars");
        break;
      case "setPrice":
        setPanel(null);
        setDrawerOpen(true);
        break;
      case "startTime":
      case "speedUp":
      case "watchCar":
        setPanel(null);
        setDrawerOpen(false);
        break;
      case "buyUpgrade":
        setPanel("upgrades");
        break;
      case "openFleet":
      case "openUpgrades":
      case "missions":
      case "dayEnd":
      case "goodbye":
        setPanel(null);
        break;
      case "done":
        break;
    }
    // René cheers after every step, and walks away after the last one.
    if (tutorialStep === "done") setRene(seenStep === "goodbye" ? "leave" : "hidden");
    else if (seenStep === "done") setRene("idle");
    else setRene("cheer");
  }
  useEffect(() => {
    if (rene === "idle" || rene === "hidden") return undefined;
    const timer = setTimeout(
      () => {
        setRene(rene === "cheer" ? "idle" : "hidden");
      },
      rene === "cheer" ? CHEER_MS : LEAVE_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [rene]);
  // The tutorial listens to what the player opens (the reducer ignores what it does not expect).
  useEffect(() => {
    if (panel !== null && tutorialStep !== "done") {
      dispatch({ type: "tutorialEvent", event: { type: "panelOpened", panel } });
    }
  }, [panel, tutorialStep]);
  useEffect(() => {
    if (drawerOpen && tutorialStep === "openFleet") {
      dispatch({ type: "tutorialEvent", event: { type: "drawerOpened" } });
    }
  }, [drawerOpen, tutorialStep]);

  const script =
    tutorialStep === "done"
      ? null
      : tutorialScript(tutorialStep, { lastGain: ui.tutorialGain, report: game.lastDay });
  const blocksTime = script?.blocksTime === true;
  // The clock stays paused while the step needs the player's full attention.
  useEffect(() => {
    if (blocksTime && !ui.paused) dispatch({ type: "pause" });
  }, [blocksTime, ui.paused]);
  // Steps where time must run start it (e.g. after a reload, which always comes back paused).
  useEffect(() => {
    if (tutorialStep === "speedUp" || tutorialStep === "watchCar" || tutorialStep === "dayEnd") {
      dispatch({ type: "resume" });
    }
  }, [tutorialStep]);
  const [carTarget, setCarTarget] = useState<{ x: number; y: number } | null>(null);
  const onDepartingCar = useCallback((p: { x: number; y: number } | null) => {
    setCarTarget((prev) => {
      if (p === null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      return prev !== null && prev.x === x && prev.y === y ? prev : { x, y };
    });
  }, []);
  const onTutorialTap = useCallback(() => {
    dispatch({ type: "tutorialEvent", event: { type: "tap" } });
  }, []);
  const onSkipTutorial = useCallback(() => {
    dispatch({ type: "skipTutorial" });
  }, []);
  const onReplayTutorial = useCallback(() => {
    dispatch({ type: "replayTutorial" });
  }, []);

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
    if (tutorialStep === "done") setShopOpen(true);
  }, [tutorialStep]);
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
  const onRepairCar = useCallback((carId: CarId) => {
    dispatch({ type: "repairCar", carId });
  }, []);
  const onServiceCar = useCallback((carId: CarId) => {
    dispatch({ type: "serviceCar", carId });
  }, []);
  const onSellCar = useCallback((carId: CarId) => {
    dispatch({ type: "sellCar", carId });
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
  const onDismissEventBanner = useCallback(() => {
    dispatch({ type: "dismissEventBanner" });
  }, []);
  const onEventInfo = useCallback(() => {
    dispatch({ type: "eventInfo" });
  }, []);

  return (
    <main
      ref={appRef}
      className="app"
      data-drawer={drawerOpen ? "open" : "peek"}
      data-tutorial-step={tutorialStep}
      data-quality={quality}
      style={{ "--inset-top": `${String(insets.top)}px` } as CSSProperties}
    >
      {/* The scene fills the screen; everything else floats above it. */}
      <div className="top-layer" ref={topRef}>
        <Hud
          ref={hudRef}
          game={game}
          muted={sound.muted}
          onToggleMute={sound.toggleMute}
          speed={ui.speed}
          paused={ui.paused}
          hasRun={ui.hasRun}
          onSetSpeed={onSetSpeed}
          onTogglePause={onTogglePause}
          onEventInfo={onEventInfo}
        />
        <SaveWarning
          status={autosave.status}
          visible={autosave.warningVisible}
          onDismiss={autosave.dismissWarning}
        />
        <MessageBanner error={ui.error} notice={ui.notice} onDismiss={onDismissMessage} />
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
            rene={rene}
            onDepartingCar={onDepartingCar}
          />
        </ErrorBoundary>
        <div className="banner-stack">
          {ui.dayBanner !== null && (
            <DayBanner text={ui.dayBanner} speed={ui.speed} onDismiss={onDismissBanner} />
          )}
          {ui.eventBanner !== null && tutorialStep === "done" && (
            <EventBanner
              text={ui.eventBanner}
              kind={activeEvent(game)?.kind ?? null}
              speed={ui.speed}
              onDismiss={onDismissEventBanner}
            />
          )}
        </div>
      </div>
      <ManageDrawer
        ref={drawerRef}
        open={drawerOpen}
        fleetSize={game.fleet.length}
        capacity={capacity}
        onSetOpen={onSetDrawerOpen}
      >
        <FleetPanel
          game={game}
          onSetPrice={onSetPrice}
          onRepair={onRepairCar}
          onService={onServiceCar}
          onSell={onSellCar}
        />
      </ManageDrawer>
      <SideRail
        active={panel}
        missionsBadge={claimableMissions(game)}
        gems={game.shop.gems}
        boosted={revenueMultiplier(game) > 1}
        onOpen={onOpenPanel}
        onOpenShop={onOpenShop}
        top={insets.top}
      />
      <PanelSheet
        open={panel === "missions"}
        title="Missions"
        icon="check-circle"
        testId="panel-missions"
        onClose={onClosePanel}
      >
        <MissionsPanel game={game} onClaim={onClaimMission} />
      </PanelSheet>
      <PanelSheet
        open={panel === "cars"}
        title="Voitures"
        icon="car"
        testId="panel-cars"
        onClose={onClosePanel}
      >
        <BuyCarPanel
          cash={game.cash}
          fleetSize={game.fleet.length}
          capacity={capacity}
          xp={game.xp}
          highlight={game.fleet.length === 0}
          onBuy={onBuy}
        />
      </PanelSheet>
      <PanelSheet
        open={panel === "upgrades"}
        title="Améliorations"
        icon="wrench"
        testId="panel-upgrades"
        onClose={onClosePanel}
      >
        <UpgradesPanel cash={game.cash} upgrades={game.upgrades} onBuy={onBuyUpgrade} />
      </PanelSheet>
      <PanelSheet
        open={panel === "staff"}
        title="Employés"
        icon="key"
        testId="panel-staff"
        onClose={onClosePanel}
      >
        <ManagersPanel
          cash={game.cash}
          xp={game.xp}
          managers={game.managers}
          onHire={onHireManager}
          onFire={onFireManager}
        />
      </PanelSheet>
      <PanelSheet
        open={panel === "stats"}
        title="Statistiques"
        icon="chart"
        testId="panel-stats"
        onClose={onClosePanel}
      >
        <StatsPanel history={game.history} modelStats={game.modelStats} />
      </PanelSheet>
      <PanelSheet
        open={panel === "settings"}
        title="Réglages"
        icon="settings"
        testId="panel-settings"
        onClose={onClosePanel}
      >
        <SettingsPanel
          muted={sound.muted}
          volumes={sound.volumes}
          onToggleMute={sound.toggleMute}
          onVolume={sound.setVolume}
          onNewGame={onAskNewGame}
          onReplayTutorial={onReplayTutorial}
        />
      </PanelSheet>
      {confirmOpen && (
        <NewGameDialog game={game} onCancel={onCancelNewGame} onConfirm={onConfirmNewGame} />
      )}
      {ui.offline !== null && tutorialStep === "done" && !confirmOpen && (
        <OfflineDialog report={ui.offline} onClaim={onClaimOffline} />
      )}
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
      {tutorialStep !== "done" && script !== null && (
        <TutorialOverlay
          step={tutorialStep}
          script={script}
          carTarget={carTarget}
          canSkip={ui.tutorialReplay}
          onTap={onTutorialTap}
          onSkip={onSkipTutorial}
        />
      )}
    </main>
  );
}
