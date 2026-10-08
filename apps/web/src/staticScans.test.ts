/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = ["apps/web/src", "src"].find((p) => existsSync(`${p}/scene`)) ?? "";
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );
const all = src ? walk(src) : [];
const code = all.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const imports = (raw: string): string[] => {
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return Array.from(
    text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g),
    (m) => m[1] ?? "",
  );
};

describe("module boundaries (acceptance 20)", () => {
  it("finds the sources", () => {
    expect(code.length).toBeGreaterThan(20);
    expect(code.some((f) => f.endsWith("scene/AgencyScene3D.ts"))).toBe(true);
  });

  it("no file imports pixi.js and the old 2D scene is gone", () => {
    expect(code.filter((f) => imports(read(f)).some((i) => i.startsWith("pixi")))).toEqual([]);
    expect(code.filter((f) => /pixi/i.test(read(f)))).toEqual([]);
    expect(all.some((f) => f.endsWith("scene/AgencyScene.ts"))).toBe(false);
  });

  it("only scene/AgencyScene3D.ts imports three", () => {
    const users = code.filter((f) => imports(read(f)).some((i) => /^three(\/|$)/.test(i)));
    expect(users.map((f) => f.replace(/^.*src\//, ""))).toEqual(["scene/AgencyScene3D.ts"]);
  });

  it("AgencyScene3D is only ever loaded with a dynamic import or as a type", () => {
    const eager = code.filter(
      (f) =>
        !f.endsWith("scene/AgencyScene3D.ts") &&
        /import\s+(?!type\b)[^;]*?from\s+["'][^"']*AgencyScene3D[^"']*["']/.test(read(f)),
    );
    expect(eager).toEqual([]);
    const dynamic = code.filter((f) => /import\(\s*["'][^"']*AgencyScene3D/.test(read(f)));
    expect(dynamic.map((f) => f.replace(/^.*src\//, ""))).toEqual(["components/AgencyView.tsx"]);
  });

  it("pure scene modules import neither three nor the DOM scene", () => {
    for (const name of ["layout", "iso", "camera", "carMotion", "assets", "palette"]) {
      const f = code.find((x) => x.endsWith(`scene/${name}.ts`)) ?? "";
      expect(f, name).not.toBe("");
      expect(
        imports(read(f)).filter((i) => /three|AgencyScene3D|react/.test(i)),
        name,
      ).toEqual([]);
    }
  });
});

describe("no raw hex colour outside tokens.css and palette.ts", () => {
  it("no style sheet other than tokens.css holds a hex colour", () => {
    const sheets = all.filter((f) => f.endsWith(".css") && !f.endsWith("tokens.css"));
    expect(sheets.length).toBeGreaterThan(0);
    const offenders = sheets.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no .ts / .tsx outside palette.ts holds a hex literal (0xRRGGBB or '#rrggbb')", () => {
    const offenders = code.filter(
      (f) =>
        !f.endsWith("scene/palette.ts") &&
        /(?:0x[0-9a-fA-F]{6}\b|["'`]#[0-9a-fA-F]{3,8}["'`])/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });
});
