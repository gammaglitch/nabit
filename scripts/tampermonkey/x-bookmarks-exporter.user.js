// ==UserScript==
// @name         X Bookmarks → Nabit
// @namespace    x-bookmarks-export
// @version      0.5
// @description  Intercept X bookmark API responses and forward them to the ingest API
// @match        https://twitter.com/*
// @match        https://x.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      *
// @inject-into  page
// ==/UserScript==

(function () {
  "use strict";

  // === CONFIGURE BEFORE USE ===
  // Your deployed API base URL (no trailing slash). For local dev: "http://localhost:3001"
  const API_HOST = "https://api.your-domain.example.com";
  // Static API_TOKEN env var from the server
  const API_TOKEN = "CHANGE_ME";
  // ============================

  const API_ENDPOINT = `${API_HOST}/ingest/batch`;

  /**
   * Sends extracted items to the batch ingest endpoint.
   */
  function sendToApi(items) {
    if (!Array.isArray(items) || items.length === 0) return;

    GM_xmlhttpRequest({
      method: "POST",
      url: API_ENDPOINT,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      data: JSON.stringify({ items }),
      onload: (res) => {
        console.log(
          "[Nabit] Sent",
          items.length,
          "items → status:",
          res.status,
          res.responseText
        );
      },
      onerror: (err) => {
        console.error("[Nabit] Failed to send items", err);
      },
    });
  }

  /**
   * Build a source URL from screen name and tweet ID.
   */
  function tweetUrl(screenName, tweetId) {
    if (!screenName || !tweetId) return null;
    return `https://x.com/${screenName}/status/${tweetId}`;
  }

  /**
   * Extracts tweets from an X GraphQL bookmark response and maps
   * them to the URL-first ingest batch item shape.
   */
  function extractItemsFromResponse(responseText) {
    let json;
    try {
      json = JSON.parse(responseText);
    } catch (e) {
      console.error("[Nabit] JSON parse error:", e);
      return [];
    }

    const instructions =
      json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];

    const addEntries = instructions.find(
      (i) => i?.type === "TimelineAddEntries"
    );

    const entries = addEntries?.entries ?? [];
    const output = [];

    for (const entry of entries) {
      const tweetResult =
        entry?.content?.itemContent?.tweet_results?.result;
      if (!tweetResult) continue;

      const legacy = tweetResult.legacy ?? {};
      const user = tweetResult?.core?.user_results?.result ?? null;
      if (!user) continue;

      const userLegacy = user.legacy ?? {};
      const userCore = user.core ?? {};

      const tweetId = tweetResult?.rest_id ?? legacy?.id_str ?? null;
      if (!tweetId) continue;

      const screenName =
        userCore?.screen_name ?? userLegacy?.screen_name ?? null;

      output.push({
        ingestor: "tweet",
        payload: tweetResult,
        url: tweetUrl(screenName, tweetId),
      });
    }

    return output;
  }

  /**
   * Monkey-patch XHR to capture bookmark GraphQL responses.
   */
  function installInterceptor() {
    const origOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url) {
      const requestUrl = url;

      this.addEventListener("load", function () {
        try {
          if (!/\/graphql\/.+\/Bookmarks/.test(requestUrl)) return;

          const items = extractItemsFromResponse(this.responseText);

          if (items.length > 0) {
            console.log("[Nabit] Extracted", items.length, "tweets");
            sendToApi(items);
          }
        } catch (err) {
          console.error("[Nabit] Interceptor error:", err);
        }
      });

      return origOpen.apply(this, arguments);
    };

    console.log("[Nabit] XHR interception enabled");
  }

  installInterceptor();
})();
