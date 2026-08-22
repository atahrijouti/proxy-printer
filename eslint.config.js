import js from "@eslint/js"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import solid from "eslint-plugin-solid/configs/typescript"
import { defineConfig, globalIgnores } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    ...solid,
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
])
