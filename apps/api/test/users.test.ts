import { describe, expect, test } from "bun:test";
import type { DatabaseState } from "../src/db/client";
import { UserService } from "../src/modules/users/service";

const alice = {
  email: "alice@example.com",
  provider: "better-auth",
  subject: "sub-alice",
};

/**
 * The auth plugin calls `resolve` on every authenticated request, so the part
 * worth pinning down is when it does *not* reach the database. The upsert
 * itself is stubbed; it was exercised against a real Postgres when landed.
 */
function makeService() {
  let clock = 0;
  const upserts: string[] = [];
  const service = new UserService(
    { db: {} } as unknown as DatabaseState,
    () => clock,
  );
  // biome-ignore lint/suspicious/noExplicitAny: stubbing a private method
  (service as any).upsert = async (_db: unknown, identity: typeof alice) => {
    upserts.push(identity.email);
    await Bun.sleep(1);
    return 7;
  };
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    service,
    upserts,
  };
}

describe("UserService.resolve", () => {
  test("leaves the caller unattributed when there is no database", async () => {
    const service = new UserService({ db: null } as unknown as DatabaseState);
    expect(await service.resolve(alice)).toBeNull();
  });

  test("a burst of parallel requests shares one lookup", async () => {
    const { service, upserts } = makeService();

    const ids = await Promise.all([
      service.resolve(alice),
      service.resolve(alice),
      service.resolve(alice),
    ]);

    expect(ids).toEqual([7, 7, 7]);
    expect(upserts).toHaveLength(1);
  });

  test("serves from cache until the refresh window passes", async () => {
    const { advance, service, upserts } = makeService();

    await service.resolve(alice);
    advance(9 * 60_000);
    await service.resolve(alice);
    expect(upserts).toHaveLength(1);

    advance(2 * 60_000);
    await service.resolve(alice);
    expect(upserts).toHaveLength(2);
  });

  test("an email change reaches the database right away", async () => {
    const { service, upserts } = makeService();

    await service.resolve(alice);
    await service.resolve({ ...alice, email: "alice@new.example" });

    expect(upserts).toEqual(["alice@example.com", "alice@new.example"]);
  });
});
