import { defineWebExtConfig } from "wxt";

/**
 * `wxt dev` launches the browser through web-ext, which only looks for Chrome
 * on PATH. Point `CHROME_PATH` at the binary in `.env` when it lives somewhere
 * else, and `CHROME_PROFILE` at a profile directory to keep the saved API
 * token and any logins between runs.
 *
 * WXT loads the env files before it resolves this config, so `process.env` is
 * already populated here.
 */
const chromePath = process.env.CHROME_PATH?.trim();
const chromeProfile = process.env.CHROME_PROFILE?.trim();

export default defineWebExtConfig({
  ...(chromePath ? { binaries: { chrome: chromePath } } : {}),
  ...(chromeProfile
    ? { chromiumProfile: chromeProfile, keepProfileChanges: true }
    : {}),
});
