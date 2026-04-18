// Whether the web UI should enforce a sign-in gate.
// Mirror of the API's AUTH_REQUIRED env var — set both to the same value.
//
// `NEXT_PUBLIC_AUTH_REQUIRED` is inlined into the client bundle at build time.
// Default: true. Set to "false" to disable the login redirect (single-user
// / self-hosted mode that gates the network path instead of the user).
export function authRequired(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_REQUIRED !== "false";
}
