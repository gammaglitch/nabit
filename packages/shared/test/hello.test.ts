import { describe, expect, test } from "bun:test";
import {
  createHelloMessage,
  getHelloRuntimeLabel,
  monorepoHelloStack,
} from "../src";

describe("@repo/shared hello helpers", () => {
  test("formats hello messages", () => {
    expect(createHelloMessage("Codex")).toBe("Hello, Codex!");
  });

  test("exposes runtime labels and stack metadata", () => {
    expect(getHelloRuntimeLabel("web")).toBe("Next.js web");
    expect(getHelloRuntimeLabel("desktop")).toBe("Tauri desktop");
    expect(monorepoHelloStack).toContain("Shared TypeScript package");
  });
});
