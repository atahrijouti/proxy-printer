// @ts-check

import js from "@eslint/js"
import solid from "eslint-plugin-solid/configs/typescript"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.{ts,tsx}"], ...solid },
]
