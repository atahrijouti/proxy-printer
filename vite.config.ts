import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import solidDevTools from "solid-devtools/vite"

export default defineConfig({
  plugins: [solidDevTools(), solid()],
  resolve: {
    alias: [{ find: /^~\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  server: {
    port: 8778,
  },
})
