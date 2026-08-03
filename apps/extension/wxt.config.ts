import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: import.meta.dirname,
  modules: ["@wxt-dev/module-react"],
  // WXT defaults Firefox to MV2, which has no optional_host_permissions — the
  // runtime host grant would be silently dropped. Pin both targets to MV3.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Nabit",
    description: "Send tabs and bookmarks to your archival API.",
    permissions: ["tabs", "bookmarks", "storage"],
    // Only the dev default is granted up front. Any other API host is
    // requested at runtime when it's saved in the popup's config panel.
    host_permissions: ["http://localhost:3001/*"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "nabit@bitflipp.de",
              // optional_host_permissions landed in Firefox 128.
              strict_min_version: "128.0",
            },
          },
        }
      : {}),
  }),
});
