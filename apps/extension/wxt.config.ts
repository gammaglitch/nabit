import { defineConfig } from "wxt";

const LOCAL_API_HOST = "http://localhost:3001/*";

/**
 * `WXT_API_URL` in `.env` names the API a given build targets. WXT loads the
 * env files before it invokes the manifest function below, so `process.env` is
 * already populated. Granting that origin up front saves the popup a runtime
 * `permissions.request()` on the very first save.
 */
function envApiHostPermission(): string | null {
  const raw = process.env.WXT_API_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

export default defineConfig({
  srcDir: import.meta.dirname,
  modules: ["@wxt-dev/module-react"],
  // WXT defaults Firefox to MV2, which has no optional_host_permissions — the
  // runtime host grant would be silently dropped. Pin both targets to MV3.
  manifestVersion: 3,
  manifest: ({ browser }) => {
    const envHost = envApiHostPermission();

    return {
      name: "Nabit",
      description: "Send tabs and bookmarks to your archival API.",
      permissions: ["tabs", "bookmarks", "storage"],
      // The dev default plus whatever `.env` targets. Any other API host is
      // requested at runtime when it's saved in the popup's config panel.
      host_permissions: [
        LOCAL_API_HOST,
        ...(envHost && envHost !== LOCAL_API_HOST ? [envHost] : []),
      ],
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
    };
  },
});
