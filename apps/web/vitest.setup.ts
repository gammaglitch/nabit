import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom ships no ResizeObserver, and cmdk constructs one on mount — without
// this, rendering anything built on <Command> (the capture modal) throws.
// A no-op is enough: the tests assert on behaviour, not measured layout.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
