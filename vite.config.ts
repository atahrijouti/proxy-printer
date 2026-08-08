import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import solidDevTools from "solid-devtools/vite"

export default defineConfig({
  plugins: [solidDevTools(), solid()],
  server: {
    port: 8778,
  },
})
