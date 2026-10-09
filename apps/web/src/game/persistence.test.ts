import { describe, expect, it } from "vitest";
import { GAME_STATE_VERSION, advanceMinutes, buyCar, createGame } from "@rt/sim";
import { browserSaveStorage } from "./saveStorage.js";
import { memoryStorage, quotaStorage, throwingStorage } from "./fakeStorage.js";
import { loadInitialState, writeSave } from "./persistence.js";
import {
  MAX_SAVE_CHARS,
  REJECTED_SAVE_KEY,
  SAVE_KEY,
  SAVE_FORMAT_VERSION,
  decodeSave,
  encodeSave,
} from "./saveFormat.js";
import { newSeed } from "./seed.js";

const seed = (): number => 4242;
const played = advanceMinutes(advanceMinutes(buyCar(createGame(7), "compact"), 700), 300);

describe("newSeed", () => {
  it("returns exactly the drawn value", () => {
    const random = {
      getRandomValues: (a: Uint32Array<ArrayBuffer>) => {
        a[0] = 4_294_967_295;
        return a;
      },
    };
    expect(newSeed(random)).toBe(4_294_967_295);
  });
  it("falls back when crypto throws or is unusable", () => {
    const bad = {
      getRandomValues: (): never => {
        throw new Error("no");
      },
    };
    for (const r of [bad, undefined]) {
      const s = newSeed(r);
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
    }
  });
});

describe("browserSaveStorage", () => {
  it("never throws and returns a working storage in jsdom", () => {
    const s = browserSaveStorage();
    expect(s).not.toBeNull();
    s?.setItem("rental-tycoon/x", "1");
    expect(s?.getItem("rental-tycoon/x")).toBe("1");
    s?.removeItem("rental-tycoon/x");
    expect(s?.getItem("rental-tycoon/x")).toBeNull();
  });
});

describe("saveFormat", () => {
  it("round-trips game, speed and savedAt", () => {
    const r = decodeSave(encodeSave(played, 4, 1_700_000_000_000));
    expect(r).toEqual({
      kind: "ok",
      game: played,
      speed: 4,
      savedAt: 1_700_000_000_000,
      tutorial: "done",
      tutorialReplay: false,
    });
  });
  it("is empty for null", () => {
    expect(decodeSave(null)).toEqual({ kind: "empty" });
  });
  it("tolerates invalid speed and savedAt", () => {
    const env = JSON.parse(encodeSave(played, 1, 5)) as Record<string, unknown>;
    env["speed"] = 3;
    env["savedAt"] = "yesterday";
    const r = decodeSave(JSON.stringify(env));
    expect(r.kind === "ok" && r.speed === 1 && r.savedAt === null).toBe(true);
  });
  it("rejects bad kind / version / garbage / oversize without throwing", () => {
    const env = JSON.parse(encodeSave(played, 1, 5)) as Record<string, unknown>;
    const bad = [
      "",
      "{",
      "null",
      "[]",
      "42",
      JSON.stringify({ ...env, kind: "other" }),
      JSON.stringify({ ...env, version: SAVE_FORMAT_VERSION + 1 }),
      JSON.stringify({ ...env, game: { ...played, cash: Number.NaN } }),
      JSON.stringify({ ...env, game: null }),
      "x".repeat(MAX_SAVE_CHARS + 1),
    ];
    for (const raw of bad) expect(decodeSave(raw)).toEqual({ kind: "rejected", reason: "corrupt" });
  });
  it("flags a newer state version", () => {
    const env = JSON.parse(encodeSave(played, 1, 5)) as Record<string, unknown>;
    env["stateVersion"] = GAME_STATE_VERSION + 1;
    expect(decodeSave(JSON.stringify(env))).toEqual({ kind: "rejected", reason: "newer" });
    env["stateVersion"] = 0;
    expect(decodeSave(JSON.stringify(env))).toEqual({ kind: "rejected", reason: "corrupt" });
  });
});

describe("loadInitialState", () => {
  it("starts a new game when there is no save", () => {
    const r = loadInitialState({ storage: memoryStorage(), newSeed: seed });
    expect(r.status).toBe("ok");
    expect(r.ui.game).toEqual(createGame(4242, 0)); // empty till: René brings the money
    expect(r.ui.paused).toBe(true);
    expect(r.ui.notice).toBeNull();
  });
  it("resumes a valid save paused with notice and speed", () => {
    const storage = memoryStorage({ [SAVE_KEY]: encodeSave(played, 10, 1) });
    const r = loadInitialState({ storage, newSeed: seed, now: 1 }); // no time away
    expect(r.ui.game).toEqual(played);
    expect(r.ui.offline).toBeNull();
    expect(r.ui.speed).toBe(10);
    expect(r.ui.paused).toBe(true);
    expect(r.ui.hasRun).toBe(false);
    expect(r.ui.notice).toMatch(/^Partie reprise : Jour 2 · \d\d:\d\d\. Touchez Reprendre/);
  });
  it("keeps a rejected save in the backup slot and starts over", () => {
    const storage = memoryStorage({ [SAVE_KEY]: "{broken" });
    const r = loadInitialState({ storage, newSeed: seed });
    expect(storage.data.get(REJECTED_SAVE_KEY)).toBe("{broken");
    expect(r.ui.error).toBe("Sauvegarde illisible : une nouvelle partie a commencé.");
    expect(r.ui.game).toEqual(createGame(4242, 0)); // empty till: René brings the money
  });
  it("explains a newer save", () => {
    const env = JSON.parse(encodeSave(played, 1, 5)) as Record<string, unknown>;
    env["stateVersion"] = GAME_STATE_VERSION + 1;
    const raw = JSON.stringify(env);
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    const r = loadInitialState({ storage, newSeed: seed });
    expect(r.ui.error).toContain("version plus récente");
    expect(storage.data.get(REJECTED_SAVE_KEY)).toBe(raw);
  });
  it("is unavailable with null or throwing storage", () => {
    expect(loadInitialState({ storage: null, newSeed: seed }).status).toBe("unavailable");
    const r = loadInitialState({ storage: throwingStorage(), newSeed: seed });
    expect(r.status).toBe("unavailable");
    expect(r.ui.game).toEqual(createGame(4242, 0)); // empty till: René brings the money
  });
  it("initialGame short-circuits the read", () => {
    const storage = memoryStorage({ [SAVE_KEY]: encodeSave(played, 1, 1) });
    const r = loadInitialState({ storage, newSeed: seed, initialGame: createGame(1) });
    expect(r.ui.game).toEqual(createGame(1));
    expect(r.ui.notice).toBeNull();
  });
});

describe("writeSave", () => {
  it("reports ok, failed and unavailable without throwing", () => {
    const m = memoryStorage();
    expect(writeSave(m, played, 1, 9)).toBe("ok");
    expect(m.data.has(SAVE_KEY)).toBe(true);
    expect(writeSave(quotaStorage(), played, 1, 9)).toBe("failed");
    expect(writeSave(throwingStorage(), played, 1, 9)).toBe("failed");
    expect(writeSave(null, played, 1, 9)).toBe("unavailable");
  });
});
