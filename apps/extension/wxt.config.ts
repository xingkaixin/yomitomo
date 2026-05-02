import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    optimizeDeps: {
      entries: ["entrypoints/**/*.{ts,tsx,html}", "!dist/**"]
    }
  }),
  webExt: {
    disabled: true
  },
  manifest: {
    name: "Reader Agent",
    description: "Reader mode with persistent highlights and threaded annotations.",
    version: "0.0.1",
    permissions: ["activeTab", "storage", "tabs"],
    host_permissions: ["<all_urls>", "ws://127.0.0.1/*"],
    action: {
      default_title: "Reader Agent",
      default_popup: "popup.html"
    }
  }
});
