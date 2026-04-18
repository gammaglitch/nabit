export type AuthProvider =
  | "anonymous"
  | "apple"
  | "discord"
  | "email"
  | "github"
  | "google"
  | "phone"
  | "unknown";

export type AuthIdentityLike = {
  provider?: string | null;
};

export type AuthUserLike = {
  app_metadata?: {
    provider?: string | null;
    providers?: string[] | null;
  } | null;
  email?: string | null;
  id: string;
  identities?: AuthIdentityLike[] | null;
  is_anonymous?: boolean | null;
  user_metadata?: {
    avatar_url?: string | null;
    full_name?: string | null;
    name?: string | null;
    picture?: string | null;
    user_name?: string | null;
  } | null;
};

export type AuthSessionLike = {
  access_token: string;
  expires_at?: number | null;
  refresh_token?: string | null;
  user: AuthUserLike;
};

export type AuthSessionSummary = {
  email: string | null;
  expiresAt: number | null;
  isAnonymous: boolean;
  providers: AuthProvider[];
  userId: string;
};

const knownProviders: readonly AuthProvider[] = [
  "anonymous",
  "apple",
  "discord",
  "email",
  "github",
  "google",
  "phone",
] as const;

export function getAuthProviders(user: AuthUserLike): AuthProvider[] {
  const providers = new Set<AuthProvider>();

  for (const provider of user.app_metadata?.providers ?? []) {
    providers.add(toAuthProvider(provider));
  }

  if (user.app_metadata?.provider) {
    providers.add(toAuthProvider(user.app_metadata.provider));
  }

  for (const identity of user.identities ?? []) {
    if (identity.provider) {
      providers.add(toAuthProvider(identity.provider));
    }
  }

  if (user.is_anonymous) {
    providers.add("anonymous");
  }

  if (providers.size === 0 && user.email) {
    providers.add("email");
  }

  return [...providers];
}

export function getUserDisplayName(user: AuthUserLike) {
  const metadata = user.user_metadata;

  return (
    metadata?.full_name?.trim() ||
    metadata?.name?.trim() ||
    metadata?.user_name?.trim() ||
    user.email?.trim() ||
    user.id
  );
}

export function getUserAvatarUrl(user: AuthUserLike) {
  const metadata = user.user_metadata;

  return metadata?.avatar_url?.trim() || metadata?.picture?.trim() || null;
}

export function toAuthSessionSummary(
  session: AuthSessionLike,
): AuthSessionSummary {
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    expiresAt: session.expires_at ?? null,
    isAnonymous: session.user.is_anonymous ?? false,
    providers: getAuthProviders(session.user),
  };
}

function toAuthProvider(provider: string): AuthProvider {
  if ((knownProviders as readonly string[]).includes(provider)) {
    return provider as AuthProvider;
  }

  return "unknown";
}
