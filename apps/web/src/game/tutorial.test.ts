import { describe, expect, it } from "vitest";
import { advance, buyCar, buyUpgrade, createGame, upgradeCost } from "@rt/sim";
import { gameReducer, initUiState, settleUi, type UiState } from "./gameReducer.js";
import { decodeSave, encodeSave } from "./saveFormat.js";
import {
  TUTORIAL_FAREWELL_FUNDS,
  TUTORIAL_ORDER,
  TUTORIAL_START_FUNDS,
  initialTutorial,
  nextTutorialStep,
  settleTutorial,
  tutorialScript,
  type TutorialEvent,
  type TutorialStep,
} from "./tutorial.js";

const CTX = { lastGain: null, report: null } as const;

const ALL_EVENTS: readonly TutorialEvent[] = [
  { type: "tap" },
  { type: "panelOpened", panel: "cars" },
  { type: "panelOpened", panel: "upgrades" },
  { type: "panelOpened", panel: "missions" },
  { type: "drawerOpened" },
  { type: "carBought" },
  { type: "priceSet" },
  { type: "timeStarted" },
  { type: "speedSet", speed: 1 },
  { type: "speedSet", speed: 2 },
  { type: "carDeparted", amount: 90_00 },
  { type: "upgradeBought" },
  { type: "dayClosed" },
];

/** step -> [event that advances it, resulting step]. */
const ADVANCES: Readonly<Record<Exclude<TutorialStep, "done">, [TutorialEvent, TutorialStep]>> = {
  welcome: [{ type: "tap" }, "openCars"],
  openCars: [{ type: "panelOpened", panel: "cars" }, "buyUsed"],
  buyUsed: [{ type: "carBought" }, "openFleet"],
  openFleet: [{ type: "drawerOpened" }, "setPrice"],
  setPrice: [{ type: "priceSet" }, "startTime"],
  startTime: [{ type: "timeStarted" }, "speedUp"],
  speedUp: [{ type: "speedSet", speed: 2 }, "watchCar"],
  watchCar: [{ type: "tap" }, "openUpgrades"],
  openUpgrades: [{ type: "panelOpened", panel: "upgrades" }, "buyUpgrade"],
  buyUpgrade: [{ type: "upgradeBought" }, "missions"],
  missions: [{ type: "tap" }, "dayEnd"],
  dayEnd: [{ type: "dayClosed" }, "goodbye"],
  goodbye: [{ type: "tap" }, "done"],
};

describe("nextTutorialStep (pure)", () => {
  it.each(Object.entries(ADVANCES))("%s advances on its own event", (step, [event, next]) => {
    expect(nextTutorialStep(step as TutorialStep, event)).toBe(next);
  });

  it("every other event is ignored by every step", () => {
    for (const [step, [good]] of Object.entries(ADVANCES)) {
      for (const event of ALL_EVENTS) {
        if (JSON.stringify(event) === JSON.stringify(good)) continue;
        // speedUp accepts any speed >= 2
        if (step === "speedUp" && event.type === "speedSet" && event.speed >= 2) continue;
        expect(nextTutorialStep(step as TutorialStep, event), `${step} / ${event.type}`).toBe(step);
      }
    }
  });

  it("speedUp needs a speed of x2 or more; garbage speeds are ignored", () => {
    expect(nextTutorialStep("speedUp", { type: "speedSet", speed: 1 })).toBe("speedUp");
    expect(nextTutorialStep("speedUp", { type: "speedSet", speed: 10 })).toBe("watchCar");
    expect(nextTutorialStep("speedUp", { type: "speedSet", speed: Number.NaN })).toBe("speedUp");
  });

  it("a wrong menu does not open the right step", () => {
    expect(nextTutorialStep("openCars", { type: "panelOpened", panel: "upgrades" })).toBe(
      "openCars",
    );
    expect(nextTutorialStep("openUpgrades", { type: "panelOpened", panel: "cars" })).toBe(
      "openUpgrades",
    );
  });

  it("done never moves", () => {
    for (const event of ALL_EVENTS) expect(nextTutorialStep("done", event)).toBe("done");
  });

  it("the happy path walks through every step in order", () => {
    let step: TutorialStep = "welcome";
    const seen: TutorialStep[] = [step];
    while (step !== "done") {
      const entry = ADVANCES[step];
      step = nextTutorialStep(step, entry[0]);
      seen.push(step);
    }
    expect(seen).toEqual([...TUTORIAL_ORDER]);
  });
});

describe("tutorialScript", () => {
  const contexts = [
    CTX,
    { lastGain: 90_00, report: { revenue: 180_00, costs: 60_00 } },
    { lastGain: Number.NaN, report: { revenue: Number.NaN, costs: Number.POSITIVE_INFINITY } },
    { lastGain: 0, report: { revenue: 0, costs: 500_00 } },
  ];

  it("every step has lines, no undefined/NaN in the text, and a coherent target", () => {
    for (const step of TUTORIAL_ORDER) {
      for (const ctx of contexts) {
        const script = tutorialScript(step, ctx);
        if (step !== "done") expect(script.lines.length).toBeGreaterThan(0);
        for (const line of script.lines) {
          expect(line.trim().length).toBeGreaterThan(0);
          expect(line).not.toMatch(/undefined|NaN|null|Infinity/);
        }
        if (script.target.kind === "dom") expect(script.target.id).toMatch(/^[a-z-]+$/);
      }
    }
  });

  it("targets follow the spec table", () => {
    const dom = (step: TutorialStep): string | null => {
      const t = tutorialScript(step, CTX).target;
      return t.kind === "dom" ? t.id : null;
    };
    expect(dom("openCars")).toBe("rail-cars");
    expect(dom("buyUsed")).toBe("buy-used");
    expect(dom("openFleet")).toBe("drawer-handle");
    expect(dom("setPrice")).toBe("price-editor");
    expect(dom("startTime")).toBe("speed-pause");
    expect(dom("speedUp")).toBe("speed-fast");
    expect(dom("openUpgrades")).toBe("rail-upgrades");
    expect(dom("buyUpgrade")).toBe("upgrade-buy-ads");
    expect(dom("missions")).toBe("rail-missions");
    expect(dom("goodbye")).toBe("hud-report");
    expect(tutorialScript("welcome", CTX).target.kind).toBe("none");
    expect(tutorialScript("dayEnd", CTX).target.kind).toBe("none");
    expect(tutorialScript("watchCar", CTX).target.kind).toBe("car");
  });

  it("welcome has 3 bubbles and waits for a tap; missions has 2", () => {
    expect(tutorialScript("welcome", CTX).lines).toHaveLength(3);
    expect(tutorialScript("welcome", CTX).waitsFor).toBe("tap");
    expect(tutorialScript("missions", CTX).lines).toHaveLength(2);
  });

  it("time runs only where the spec lets it", () => {
    const runs = TUTORIAL_ORDER.filter((s) => !tutorialScript(s, CTX).blocksTime);
    expect(runs).toEqual(["speedUp", "watchCar", "dayEnd", "done"]);
    // once René comments on the gain, time is held again
    expect(tutorialScript("watchCar", { lastGain: 90_00, report: null }).blocksTime).toBe(true);
  });

  it("watchCar comments the real gain after the departure", () => {
    const before = tutorialScript("watchCar", CTX);
    expect(before.waitsFor).toBe("action");
    const after = tutorialScript("watchCar", { lastGain: 90_00, report: null });
    expect(after.waitsFor).toBe("tap");
    expect(after.lines.join(" ")).toMatch(/\+90,00\s€/);
  });

  it("goodbye uses the real report numbers", () => {
    const text = tutorialScript("goodbye", {
      lastGain: null,
      report: { revenue: 180_00, costs: 60_00 },
    }).lines.join(" ");
    expect(text).toMatch(/180,00\s€/);
    expect(text).toMatch(/60,00\s€/);
    expect(text).toMatch(/120,00\s€/);
  });
});

describe("initial step and settling", () => {
  it("only a brand-new agency starts the tutorial", () => {
    expect(initialTutorial(createGame(1))).toBe("welcome");
    expect(initialTutorial(buyCar(createGame(1), "used"))).toBe("done");
    expect(initialTutorial(advance(createGame(1), 1))).toBe("done");
  });

  it("an action step whose action is already done moves on (reload)", () => {
    const withCar = buyCar(createGame(1), "used");
    expect(settleTutorial("buyUsed", withCar, false)).toBe("openFleet");
    expect(settleTutorial("buyUsed", createGame(1), false)).toBe("buyUsed");
    // a step that needs a car, without one, goes back to the garage
    expect(settleTutorial("setPrice", createGame(1), false)).toBe("openCars");
    // the first day is already closed: straight to the bilan
    expect(settleTutorial("dayEnd", advance(withCar, 24 * 60), false)).toBe("goodbye");
  });

  it("a replay skips what cannot be done again", () => {
    const rich = { ...buyCar(createGame(1), "used"), cash: 1_000_000_00 };
    expect(settleTutorial("buyUsed", rich, true)).toBe("buyUsed");
    expect(settleTutorial("buyUsed", { ...rich, cash: 0 }, true)).toBe("openFleet");
    expect(settleTutorial("buyUpgrade", { ...rich, cash: 0 }, true)).toBe("missions");
    expect(
      settleTutorial("buyUpgrade", { ...rich, upgrades: { ...rich.upgrades, ads: 5 } }, true),
    ).toBe("missions");
  });
});

function run(ui: UiState, ...actions: Parameters<typeof gameReducer>[1][]): UiState {
  return actions.reduce(gameReducer, ui);
}

describe("tutorial flow through the reducer", () => {
  it("plays the whole tutorial with real actions", () => {
    let s: UiState = initUiState(createGame(1));
    expect(s.tutorial).toBe("welcome");
    s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    expect(s.tutorial).toBe("openCars");
    s = run(s, { type: "tutorialEvent", event: { type: "panelOpened", panel: "cars" } });
    expect(s.tutorial).toBe("buyUsed");
    s = run(s, { type: "buyCar", model: "used" });
    expect(s.tutorial).toBe("openFleet");
    s = run(s, { type: "tutorialEvent", event: { type: "drawerOpened" } });
    expect(s.tutorial).toBe("setPrice");
    s = run(s, { type: "setCarPrice", carId: 1, dailyPrice: 90_00 });
    expect(s.tutorial).toBe("startTime");
    s = run(s, { type: "togglePause" });
    expect(s.tutorial).toBe("speedUp");
    s = run(s, { type: "setSpeed", speed: 2 });
    expect(s.tutorial).toBe("watchCar");
    expect(s.tutorialGain).toBeNull();
    // a tap before René has seen a car leave does nothing
    expect(run(s, { type: "tutorialEvent", event: { type: "tap" } }).tutorial).toBe("watchCar");

    // let the day run until a car leaves (the first one gives the gain), the day may close first
    for (let i = 0; i < 24 * 60 && s.tutorialGain === null && s.tutorial === "watchCar"; i++) {
      s = run(s, { type: "advanceTime", minutes: 1 });
    }
    if (s.tutorial === "watchCar") {
      expect(s.tutorialGain).toBeGreaterThan(0);
      s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    }
    expect(s.tutorial).toBe("openUpgrades");
    s = run(s, { type: "pause" });
    s = run(s, { type: "tutorialEvent", event: { type: "panelOpened", panel: "upgrades" } });
    expect(s.tutorial).toBe("buyUpgrade");
    // the welcome gift covers the first upgrade (once)
    expect(s.game.cash).toBeGreaterThanOrEqual(upgradeCost("ads", s.game.upgrades.ads));
    s = run(s, { type: "buyUpgrade", upgrade: "ads" });
    expect(s.tutorial).toBe("missions");
    s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    expect(s.tutorial).toBe("dayEnd");
    s = run(s, { type: "resume" });
    for (let i = 0; i < 3 * 24 * 60 && s.tutorial === "dayEnd"; i++) {
      s = run(s, { type: "advanceTime", minutes: 30 });
    }
    expect(s.tutorial).toBe("goodbye");
    s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    expect(s.tutorial).toBe("done");
    expect(s.tutorialReplay).toBe(false);
  });

  it("a refused action does not advance", () => {
    let s: UiState = initUiState(createGame(1, 0));
    s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    s = run(s, { type: "tutorialEvent", event: { type: "panelOpened", panel: "cars" } });
    // René tops the till up to 5 000 €: still not enough for a hybrid (16 000 €).
    s = run(s, { type: "buyCar", model: "hybrid" });
    expect(s.tutorial).toBe("buyUsed");
    expect(s.error).not.toBeNull();
  });

  it("a refused price does not advance; an unchanged price does", () => {
    let s: UiState = initUiState(createGame(1));
    s = run(
      s,
      { type: "tutorialEvent", event: { type: "tap" } },
      { type: "tutorialEvent", event: { type: "panelOpened", panel: "cars" } },
      { type: "buyCar", model: "used" },
      { type: "tutorialEvent", event: { type: "drawerOpened" } },
    );
    expect(s.tutorial).toBe("setPrice");
    s = run(s, { type: "setCarPrice", carId: 1, dailyPrice: -1 });
    expect(s.tutorial).toBe("setPrice");
    s = run(s, { type: "setCarPrice", carId: 1, dailyPrice: s.game.fleet[0]?.dailyPrice ?? 0 });
    expect(s.tutorial).toBe("startTime");
  });

  it("forged tutorial events cannot skip steps", () => {
    const s = initUiState(createGame(1));
    for (const event of [
      { type: "carBought" },
      { type: "dayClosed" },
      { type: "upgradeBought" },
      { type: "nope" },
      null,
      42,
      { type: "panelOpened" },
    ]) {
      const next = gameReducer(s, { type: "tutorialEvent", event } as never);
      expect(next.tutorial).toBe("welcome");
    }
    expect(gameReducer(s, { type: "tutorialEvent" } as never).tutorial).toBe("welcome");
  });

  it("the first run cannot be skipped; a replay can", () => {
    let s = gameReducer(initUiState(createGame(1)), { type: "skipTutorial" });
    expect(s.tutorial).toBe("welcome");
    const advanced = { ...initUiState(buyCar(createGame(1), "used")), tutorial: "done" } as const;
    expect(gameReducer(advanced, { type: "skipTutorial" })).toBe(advanced);
    s = gameReducer(advanced, { type: "replayTutorial" });
    expect(s.tutorial).toBe("welcome");
    expect(s.tutorialReplay).toBe(true);
    s = gameReducer(s, { type: "skipTutorial" });
    expect(s.tutorial).toBe("done");
    expect(s.tutorialReplay).toBe(false);
  });

  it("replay does not re-trigger the welcome gift, and cannot start mid-tutorial", () => {
    const base = initUiState(buyCar(createGame(1), "used"));
    let s = gameReducer({ ...base, tutorial: "done" }, { type: "replayTutorial" });
    const cash = s.game.cash;
    s = { ...s, tutorial: "openUpgrades" };
    s = gameReducer(s, {
      type: "tutorialEvent",
      event: { type: "panelOpened", panel: "upgrades" },
    });
    expect(s.game.cash).toBe(cash);
    const fresh = initUiState(createGame(1));
    expect(gameReducer(fresh, { type: "replayTutorial" })).toBe(fresh);
  });

  it("a new game restarts the tutorial", () => {
    const advanced = { ...initUiState(buyCar(createGame(1), "used")), tutorial: "done" } as const;
    const s = gameReducer(advanced, { type: "newGame", seed: 9 });
    expect(s.tutorial).toBe("welcome");
    expect(s.tutorialReplay).toBe(false);
  });

  it("no offline earnings while the tutorial runs", () => {
    const s = initUiState(createGame(1));
    expect(gameReducer(s, { type: "returnAfter", elapsedMs: 10 * 3_600_000 })).toBe(s);
  });

  it("the gift is only given when the cash is short", () => {
    const rich = { ...buyCar(createGame(1), "used"), cash: 50_000_00 };
    const s = settleUi({ ...initUiState(rich), tutorial: "buyUpgrade" });
    expect(s.game.cash).toBe(50_000_00);
    const poor = settleUi({ ...initUiState({ ...rich, cash: 0 }), tutorial: "buyUpgrade" });
    expect(poor.game.cash).toBe(upgradeCost("ads", 0));
    expect(poor.notice).toMatch(/René/);
    // buying works with the gifted cash
    expect(buyUpgrade(poor.game, "ads").upgrades.ads).toBe(1);
  });
});

describe("tutorial in the save envelope", () => {
  const game = createGame(1);

  it("round-trips the step and the replay flag", () => {
    const r = decodeSave(encodeSave(game, 1, 5, "setPrice", true));
    expect(r).toMatchObject({ kind: "ok", tutorial: "setPrice", tutorialReplay: true });
    const done = decodeSave(encodeSave(game, 1, 5, "done", true));
    expect(done).toMatchObject({ tutorial: "done", tutorialReplay: false });
  });

  it("a save without the field (old save) counts as done", () => {
    const env = JSON.parse(encodeSave(game, 1, 5)) as Record<string, unknown>;
    delete env["tutorial"];
    expect(decodeSave(JSON.stringify(env))).toMatchObject({ kind: "ok", tutorial: "done" });
  });

  it("an unknown value counts as done", () => {
    for (const bad of ["nope", 3, null, {}, ["welcome"]]) {
      const env = JSON.parse(encodeSave(game, 1, 5)) as Record<string, unknown>;
      env["tutorial"] = bad;
      expect(decodeSave(JSON.stringify(env))).toMatchObject({ kind: "ok", tutorial: "done" });
    }
  });
});

describe("René's money (tutorial.md)", () => {
  it("a new game starts at 0 €; René gives the start money once, and the farewell gift at the end", () => {
    let s: UiState = gameReducer(initUiState(createGame(1)), { type: "newGame", seed: 5 });
    expect(s.game.cash).toBe(0);
    s = run(s, { type: "tutorialEvent", event: { type: "tap" } });
    expect(s.tutorial).toBe("openCars");
    expect(s.game.cash).toBe(TUTORIAL_START_FUNDS);
    // Settling again does not pay twice.
    s = run(s, { type: "tutorialEvent", event: { type: "panelOpened", panel: "missions" } });
    expect(s.game.cash).toBe(TUTORIAL_START_FUNDS);
    const atGoodbye: UiState = { ...s, tutorial: "goodbye" };
    const done = run(atGoodbye, { type: "tutorialEvent", event: { type: "tap" } });
    expect(done.tutorial).toBe("done");
    expect(done.game.cash).toBe(atGoodbye.game.cash + TUTORIAL_FAREWELL_FUNDS);
    expect(done.notice).toContain("René");
  });

  it("a replay gives no money", () => {
    const s: UiState = {
      ...initUiState(createGame(1, 0)),
      tutorial: "goodbye",
      tutorialReplay: true,
    };
    expect(run(s, { type: "tutorialEvent", event: { type: "tap" } }).game.cash).toBe(0);
  });
});
