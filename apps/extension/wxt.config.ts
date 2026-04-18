import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: import.meta.dirname,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Nabit",
    description: "Send tabs and bookmarks to your archival API.",
    permissions: ["tabs", "bookmarks", "storage"],
    host_permissions: ["http://localhost:3001/*"],
  },
});
