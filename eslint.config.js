import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-types/**", "**/coverage/**", "**/*.d.ts", "**/data/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: "error",
    },
  },
  {
    files: ["packages/sim/**/*.ts"],
    rules: {
      // The simulation must stay pure and deterministic.
      "no-restricted-globals": ["error", "window", "document", "localStorage", "fetch"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG from rng.ts." },
        { object: "Date", property: "now", message: "Time comes from the simulation clock." },
      ],
    },
  },
  {
    files: ["apps/web/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [".claude/hooks/**/*.{js,mjs}", "scripts/**/*.{js,mjs}", "*.config.{js,ts}"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", setTimeout: "readonly" },
    },
    rules: { "no-console": "off" },
  },
  prettier,
);
