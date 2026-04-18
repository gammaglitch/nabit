const runtimeLabels = {
  api: "Fastify API",
  desktop: "Tauri desktop",
  mobile: "Expo mobile",
  web: "Next.js web",
} as const;

export type HelloRuntime = keyof typeof runtimeLabels;

export const monorepoHelloStack = [
  "Bun workspaces",
  "Turborepo pipeline",
  "Biome",
  "Shared TypeScript package",
] as const;

export function createHelloMessage(name: string) {
  return `Hello, ${name}!`;
}

export function getHelloRuntimeLabel(runtime: HelloRuntime) {
  return runtimeLabels[runtime];
}
