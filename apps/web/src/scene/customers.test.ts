import { describe, expect, it } from "vitest";
import type { Car } from "@rt/sim";
import {
  ARRIVE_MINUTES,
  LEAVE_MINUTES,
  MAX_CUSTOMERS_SHOWN,
  REFUSE_MINUTES,
  WAIT_MINUTES,
  customerAnchors,
  customerPosesAt,
} from "./customers.js";
import { computeLayout } from "./layout.js";

const view = { x: 0, y: 0, width: 390, height: 844 };
const car = (id: number, over: Partial<Car> = {}): Car => ({
  id,
  dailyPrice: 90_00,
  dailyCost: 10_00,
  rented: false,
  ...over,
});
// Slot of index i: minute 2i.
const fleet = Array.from({ length: 30 }, (_, i) => car(i + 1));
const layout = computeLayout(fleet.length, view);
const one = [car(1)]; // slot 0
const layoutOne = computeLayout(1, view);

describe("customerPosesAt", () => {
  it("walks from the sidewalk to the counter, waits, then walks to the car", () => {
    const { spawn, counter } = customerAnchors(layout);
    // Car 20 departs at minute 40.
    const at = (t: number) => customerPosesAt(layout, fleet, 0, 0, t, false);
    const dep = 40;
    const first = at(dep - ARRIVE_MINUTES);
    expect(first.some((p) => p.walking && p.x === spawn.x)).toBe(true);
    const waiting = at(dep - WAIT_MINUTES + 1);
    expect(waiting.some((p) => !p.walking && p.x === counter.x && p.z === counter.z)).toBe(true);
  });

  it("a refused customer shakes the head, then walks away sad; a renter is gone", () => {
    const refused = [car(1, { outcome: "tooExpensive" })];
    const shaking = customerPosesAt(layoutOne, refused, 30, 0, 1, false);
    expect(shaking).toHaveLength(1);
    expect(shaking[0]?.sad && !shaking[0].walking).toBe(true);
    const leaving = customerPosesAt(layoutOne, refused, 30, 0, REFUSE_MINUTES + 2, false);
    expect(leaving[0]?.sad && leaving[0].walking).toBe(true);
    expect(customerPosesAt(layoutOne, refused, 30, 0, LEAVE_MINUTES + 1, false)).toEqual([]);
    const rented = [car(1, { rented: true, outcome: "rented" })];
    expect(customerPosesAt(layoutOne, rented, 30, 0, 1, false)).toEqual([]);
  });

  it("upcoming slots get a customer only while customers are left", () => {
    // Committed at minute 30: slots 15.. are upcoming.
    const t = 31;
    expect(customerPosesAt(layout, fleet, 30, 0, t, false)).toEqual([]);
    expect(customerPosesAt(layout, fleet, 30, 2, t, false).length).toBeLessThanOrEqual(2);
  });

  it("no customer when nobody came, with reduced motion, or for a bad time", () => {
    const empty = one.map((c) => ({ ...c, outcome: "noCustomer" as const }));
    expect(customerPosesAt(layoutOne, empty, 30, 0, 1, false)).toEqual([]);
    expect(customerPosesAt(layout, fleet, 0, 0, 30, true)).toEqual([]);
    expect(customerPosesAt(layout, fleet, 0, 0, Number.NaN, false)).toEqual([]);
  });

  it("never more than MAX_CUSTOMERS_SHOWN, every pose finite", () => {
    const big = Array.from({ length: 50 }, (_, i) => car(i + 1));
    const bigLayout = computeLayout(50, view);
    for (let t = 0; t < 140; t += 0.7) {
      const poses = customerPosesAt(bigLayout, big, 0, 0, t, false);
      expect(poses.length).toBeLessThanOrEqual(MAX_CUSTOMERS_SHOWN);
      for (const p of poses) {
        for (const v of [p.x, p.z, p.heading, p.stride]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
