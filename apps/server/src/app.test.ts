import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("server", () => {
  it("answers health", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("returns a clean 404 for unknown routes", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/../../etc/passwd" });
    expect(res.statusCode).toBe(404);
  });
});
