import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["dist/**", "node_modules/**", "convex/_generated/**"]
  },
  ...tseslint.configs.recommended,
  ...convexPlugin.configs.recommended
]);
