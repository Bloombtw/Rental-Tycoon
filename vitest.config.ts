import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "tests/harness"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-types/**"],
  },
});
