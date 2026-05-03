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
    name: "Yomitomo",
    description: "Yomitomo reader mode with persistent highlights and threaded annotations.",
    version: "0.0.1",
    permissions: ["activeTab", "storage", "tabs"],
    host_permissions: ["<all_urls>", "ws://127.0.0.1/*"],
    action: {
      default_title: "Yomitomo",
      default_popup: "popup.html"
    }
  }
});
