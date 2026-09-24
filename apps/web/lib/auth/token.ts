// The Better Auth session token, sent to the API as `Authorization: Bearer`.
// Kept apart from the auth client so the tRPC client can read it without
// pulling the auth client (which itself needs the tRPC client's API origin).

const TOKEN_KEY = "nabit:auth:token";

/** Never throws: storage can be unavailable (private mode, auth disabled). */
export function getAccessToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the session lasts only as long as this page.
  }
}

export function clearAccessToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
