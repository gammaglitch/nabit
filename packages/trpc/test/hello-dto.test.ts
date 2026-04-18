import { describe, expect, test } from "bun:test";
import { HelloWorldInput, PrivateHelloOutput } from "../src/modules/hello/dto";

describe("@repo/trpc hello DTOs", () => {
  test("validates hello world input", () => {
    expect(HelloWorldInput.parse({ name: "Boilerplate" })).toEqual({
      name: "Boilerplate",
    });
  });

  test("rejects invalid authenticated hello output", () => {
    const result = PrivateHelloOutput.safeParse({
      message: "Hello, Alice!",
      role: "owner",
      servedAt: "2026-04-04T00:00:00.000Z",
      userId: "alice",
    });

    expect(result.success).toBe(false);
  });
});
