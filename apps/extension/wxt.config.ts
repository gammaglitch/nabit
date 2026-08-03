import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: import.meta.dirname,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Nabit",
    description: "Send tabs and bookmarks to your archival API.",
    permissions: ["tabs", "bookmarks", "storage"],
    // Only the dev default is granted up front. Any other API host is
    // requested at runtime when it's saved in the popup's config panel.
    host_permissions: ["http://localhost:3001/*"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
  },
});
