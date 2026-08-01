/**
 * Dev seed for trying the /export sync feature without running the full ingest
 * pipeline. Inserts a handful of items (across source types) with tags and
 * threaded comments straight into Postgres.
 *
 * Usage (from apps/api, with DATABASE_URL set in .env or the environment):
 *
 *   bun run seed:export          # wipe previous seed rows and insert fresh ones
 *   bun run seed:export bump      # bump content_updated_at=now() on seed rows
 *                                 # (simulates a change for incremental "Poll changes")
 *
 * All rows use externalId values prefixed with "seed-" so re-seeding only
 * touches demo data, never real captures.
 */

import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  commentsTable,
  itemsTable,
  itemTagsTable,
  tagsTable,
} from "../src/db/schema";

const SEED_PREFIX = "seed-";

// A well-formed (but fake) sha256 so the asset-URL rewrite in the export has
// something to rewrite. The bytes don't need to exist for the markdown demo.
const FAKE_SHA = "a".repeat(64);

type SeedComment = {
  externalId: string;
  path: string;
  author: string;
  contentMarkdown: string;
  parentExternalId?: string;
  minutesAgo: number;
};

type SeedItem = {
  sourceType: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  author: string;
  contentMarkdown: string;
  tags: string[];
  sourceCreatedDaysAgo: number;
  comments: SeedComment[];
};

const SEED_ITEMS: SeedItem[] = [
  {
    sourceType: "hacker_news",
    externalId: `${SEED_PREFIX}hn-1`,
    sourceUrl: "https://news.ycombinator.com/item?id=40000001",
    title: "Show HN: A tiny static site generator written in Bun",
    author: "pg",
    contentMarkdown:
      "I built a **static site generator** that compiles a folder of Markdown into HTML in a single pass.\n\n" +
      "Here's the build pipeline:\n\n" +
      `![pipeline diagram](/assets/${FAKE_SHA})\n\n` +
      "It precompiles templates ahead of time, so incremental rebuilds are near-instant.",
    tags: ["show-hn", "programming"],
    sourceCreatedDaysAgo: 2,
    comments: [
      {
        externalId: `${SEED_PREFIX}hn-1-c1`,
        path: "1",
        author: "alice",
        contentMarkdown: "Great work! How does it handle **nested** templates?",
        minutesAgo: 90,
      },
      {
        externalId: `${SEED_PREFIX}hn-1-c2`,
        path: "1.1",
        author: "pg",
        parentExternalId: `${SEED_PREFIX}hn-1-c1`,
        contentMarkdown: "They're precompiled at build time, then inlined.",
        minutesAgo: 80,
      },
      {
        externalId: `${SEED_PREFIX}hn-1-c3`,
        path: "1.1.1",
        author: "alice",
        parentExternalId: `${SEED_PREFIX}hn-1-c2`,
        contentMarkdown: "Nice — that explains the speed.",
        minutesAgo: 70,
      },
      {
        externalId: `${SEED_PREFIX}hn-1-c4`,
        path: "2",
        author: "bob",
        contentMarkdown: "Does it support RSS feeds out of the box?",
        minutesAgo: 60,
      },
    ],
  },
  {
    sourceType: "reddit",
    externalId: `${SEED_PREFIX}reddit-1`,
    sourceUrl: "https://www.reddit.com/r/programming/comments/abc123/",
    title: "TIL Postgres ltree makes comment trees trivial",
    author: "u/db_nerd",
    contentMarkdown:
      "Instead of recursive CTEs, you store a materialized path per comment " +
      "(`1.2.3`) in an `ltree` column and sort by it. Threading falls out for free.",
    tags: ["postgres", "databases"],
    sourceCreatedDaysAgo: 1,
    comments: [
      {
        externalId: `${SEED_PREFIX}reddit-1-c1`,
        path: "1",
        author: "u/sql_fan",
        contentMarkdown: "GiST index on the path and ancestor queries fly.",
        minutesAgo: 45,
      },
      {
        externalId: `${SEED_PREFIX}reddit-1-c2`,
        path: "2",
        author: "u/skeptic",
        contentMarkdown: "Rebalancing paths on deep edits is the catch though.",
        minutesAgo: 30,
      },
    ],
  },
  {
    sourceType: "generic",
    externalId: `${SEED_PREFIX}generic-1`,
    sourceUrl: "https://example.com/blog/yaml-frontmatter",
    title: "Understanding YAML Frontmatter",
    author: "Jane Doe",
    contentMarkdown:
      "YAML frontmatter is a block delimited by `---` at the top of a Markdown " +
      "file. Tools like Obsidian and static site generators parse it as metadata.",
    tags: ["writing"],
    sourceCreatedDaysAgo: 5,
    comments: [],
  },
  {
    sourceType: "tweet",
    externalId: `${SEED_PREFIX}tweet-1`,
    sourceUrl: "https://x.com/example/status/1700000000000000000",
    title: "A thought about archiving",
    author: "@example",
    contentMarkdown:
      "the best read-it-later app is the one that lets you get your data back out",
    tags: [],
    sourceCreatedDaysAgo: 3,
    comments: [],
  },
];

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Set it in apps/api/.env or the environment.",
    );
    process.exit(1);
  }
  const client = postgres(url, { prepare: false });
  return { client, db: drizzle({ client }) };
}

async function bump() {
  const { client, db } = getDb();
  try {
    const updated = await db
      .update(itemsTable)
      .set({ contentUpdatedAt: new Date() })
      .where(like(itemsTable.externalId, `${SEED_PREFIX}%`))
      .returning({ id: itemsTable.id });
    console.log(
      `Bumped content_updated_at on ${updated.length} seed item(s). ` +
        `Use "Poll changes" in /debug/sync to pull them.`,
    );
  } finally {
    await client.end();
  }
}

async function reseed() {
  const { client, db } = getDb();
  try {
    // Cascades to comments + item_tags via FK on delete.
    await db
      .delete(itemsTable)
      .where(like(itemsTable.externalId, `${SEED_PREFIX}%`));

    const now = Date.now();
    const summary: { id: number; title: string; comments: number }[] = [];

    // Stagger content_updated_at so list ordering and cursoring are visible.
    let staggerMinutes = SEED_ITEMS.length * 5;

    for (const item of SEED_ITEMS) {
      const contentUpdatedAt = new Date(now - staggerMinutes * 60_000);
      staggerMinutes -= 5;

      const [row] = await db
        .insert(itemsTable)
        .values({
          sourceType: item.sourceType,
          externalId: item.externalId,
          sourceUrl: item.sourceUrl,
          title: item.title,
          author: item.author,
          contentText: item.contentMarkdown,
          contentMarkdown: item.contentMarkdown,
          sourceCreatedAt: new Date(
            now - item.sourceCreatedDaysAgo * 86_400_000,
          ),
          contentUpdatedAt,
          metadata: { seeded: true },
        })
        .returning({ id: itemsTable.id });

      const itemId = row.id;

      for (const name of item.tags) {
        await db.insert(tagsTable).values({ name }).onConflictDoNothing();
        const [tag] = await db
          .select({ id: tagsTable.id })
          .from(tagsTable)
          .where(eq(tagsTable.name, name));
        if (tag) {
          await db
            .insert(itemTagsTable)
            .values({ itemId, tagId: tag.id })
            .onConflictDoNothing();
        }
      }

      if (item.comments.length > 0) {
        await db.insert(commentsTable).values(
          item.comments.map((c) => ({
            itemId,
            externalId: c.externalId,
            parentExternalId: c.parentExternalId ?? null,
            path: c.path,
            author: c.author,
            contentText: c.contentMarkdown,
            contentMarkdown: c.contentMarkdown,
            sourceCreatedAt: new Date(now - c.minutesAgo * 60_000),
          })),
        );
      }

      summary.push({
        id: itemId,
        title: item.title,
        comments: item.comments.length,
      });
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(itemsTable)
      .where(like(itemsTable.externalId, `${SEED_PREFIX}%`));

    console.log(`Seeded ${summary.length} item(s):`);
    for (const s of summary) {
      console.log(`  #${s.id}  ${s.title}  (${s.comments} comment(s))`);
    }
    console.log(
      `\nTotal seed items in DB: ${Number(count)}. ` +
        `Open /debug/sync and hit "Full resync".`,
    );
  } finally {
    await client.end();
  }
}

const mode = process.argv[2];
if (mode === "bump") {
  await bump();
} else {
  await reseed();
}
