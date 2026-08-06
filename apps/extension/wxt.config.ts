import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: import.meta.dirname,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Nabit",
    description: "Send tabs and bookmarks to your archival API.",
    permissions: ["tabs", "bookmarks", "storage"],
    // reddit.com is needed so the background worker can fetch a thread's `.json`
    // from the user's own machine instead of the API's egress IP.
    // `*.reddit.com` also matches the bare `reddit.com` apex.
    host_permissions: ["http://localhost:3001/*", "*://*.reddit.com/*"],
  },
});
