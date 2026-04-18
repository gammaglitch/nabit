export const authCallbackPath = "auth/callback";

export type AuthCallbackParams = {
  accessToken: string | null;
  code: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  refreshToken: string | null;
};

export function getAuthCallbackUrl(origin: string) {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;

  return `${normalizedOrigin}/${authCallbackPath}`;
}

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const parsedUrl = new URL(url);
  const searchParams = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));

  return {
    accessToken: getFirstParam(searchParams, hashParams, "access_token"),
    code: getFirstParam(searchParams, hashParams, "code"),
    errorCode: getFirstParam(searchParams, hashParams, "error_code"),
    errorDescription: getFirstParam(
      searchParams,
      hashParams,
      "error_description",
    ),
    refreshToken: getFirstParam(searchParams, hashParams, "refresh_token"),
  };
}

function getFirstParam(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
  key: string,
) {
  return searchParams.get(key) ?? hashParams.get(key);
}
