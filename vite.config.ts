import { fileURLToPath } from "node:url"

import solidDevTools from "solid-devtools/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solidDevTools(), solid()],
  resolve: {
    alias: [{ find: /^~\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  server: {
    port: 8778,
  },
})
