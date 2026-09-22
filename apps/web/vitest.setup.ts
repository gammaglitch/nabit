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

// Node 25+ defines its own `localStorage`/`sessionStorage` getters on
// globalThis, which return undefined unless Node was started with
// --localstorage-file. They shadow jsdom's, so on those Node versions every
// component that touches storage throws. An in-memory Storage stands in,
// only when the global is unusable, so older Node keeps jsdom's own.
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  clear() {
    this.entries.clear();
  }
  getItem(key: string) {
    return this.entries.get(String(key)) ?? null;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.entries.delete(String(key));
  }
  setItem(key: string, value: string) {
    this.entries.set(String(key), String(value));
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (!globalThis[name]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: new MemoryStorage(),
    });
  }
}

afterEach(() => {
  cleanup();
});
