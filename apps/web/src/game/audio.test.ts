import { describe, expect, it } from "vitest";
import {
  CASH_MIN_GAP_MS,
  GameAudio,
  MUTED_KEY,
  cashAllowed,
  readMuted,
  writeMuted,
} from "./audio.js";
import { memoryStorage, throwingStorage } from "./fakeStorage.js";

describe("cash throttle (sounds.md)", () => {
  it("at most one cash sound per 120 ms", () => {
    expect(CASH_MIN_GAP_MS).toBe(120);
    expect(cashAllowed(null, 0)).toBe(true);
    expect(cashAllowed(1_000, 1_119)).toBe(false);
    expect(cashAllowed(1_000, 1_120)).toBe(true);
    // A clock that went backwards (new page load) never blocks.
    expect(cashAllowed(5_000, 10)).toBe(true);
    expect(cashAllowed(1_000, Number.NaN)).toBe(false);
  });

  it("a burst at x10 plays a handful of sounds, not one per rental", () => {
    let last: number | null = null;
    let played = 0;
    for (let t = 0; t < 1_000; t += 5) {
      if (cashAllowed(last, t)) {
        last = t;
        played += 1;
      }
    }
    expect(played).toBe(9);
  });
});

describe("mute preference", () => {
  it("sound is on by default; the choice is remembered", () => {
    const s = memoryStorage();
    expect(readMuted(s)).toBe(false);
    writeMuted(s, true);
    expect(s.getItem(MUTED_KEY)).toBe("1");
    expect(readMuted(s)).toBe(true);
    writeMuted(s, false);
    expect(readMuted(s)).toBe(false);
  });

  it("storage that throws or is missing: sound on, nothing thrown", () => {
    const t = throwingStorage();
    expect(readMuted(t)).toBe(false);
    expect(() => {
      writeMuted(t, true);
    }).not.toThrow();
    expect(readMuted(null)).toBe(false);
  });
});

describe("GameAudio without Web Audio (jsdom)", () => {
  it("every call is a silent no-op", () => {
    const a = new GameAudio("/", false);
    expect(() => {
      a.unlock();
      a.playCash(0);
      a.setMuted(true);
      a.setHidden(true);
      a.setHidden(false);
      a.dispose();
    }).not.toThrow();
    expect(a.isMuted()).toBe(true);
  });
});
