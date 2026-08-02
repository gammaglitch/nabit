import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import cors from "@fastify/cors";
import type { UIMessage } from "ai";
import Fastify, { type FastifyReply } from "fastify";
import { getAppEnv } from "./lib/config/env";
import { makeServices } from "./lib/services";
import {
  ArticleNotFoundError,
  ChatNotConfiguredError,
} from "./modules/chat/dto";
import {
  renderArticleDocument,
  rewriteAssetUrls,
} from "./modules/export/markdown";
import { registerHelloHandlers } from "./modules/hello/handler";
import authPlugin from "./plugins/auth";
import busPlugin from "./plugins/bus";
import dbPlugin from "./plugins/db";
import trpcPlugin from "./plugins/trpc";
import websocketPlugin from "./plugins/websocket";
import "./types/fastify";

type HelloQuerystring = {
  name?: string;
};

type IngestBody = {
  url: string;
  payload?: unknown;
  ingestor?: "tweet" | "reddit" | "hacker_news" | "generic" | null;
};

type ExportListQuerystring = {
  since?: string;
  limit?: string;
  cursor?: string;
  sourceType?: string;
  order?: string;
};

type ExportArticleQuerystring = {
  comments?: string;
  maxComments?: string;
  format?: string;
};

type ExportBatchQuerystring = {
  ids?: string;
  comments?: string;
};

type ChatBody = {
  itemId?: unknown;
  messages?: unknown;
};

const EXPORT_BATCH_MAX_IDS = 50;

// Streaming responses bypass `reply.send()`, which is also what flushes the
// headers @fastify/cors set on the reply. Hand them to the stream writer
// explicitly, or the browser drops the whole response as a CORS failure.
function pendingReplyHeaders(reply: FastifyReply): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (typeof value === "string") {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    } else if (typeof value === "number") {
      headers[key] = String(value);
    }
  }
  return headers;
}

function assetBaseUrl(req: { protocol: string; host: string }): string {
  return `${req.protocol}://${req.host}`;
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.decorate("env", getAppEnv());

  await app.register(cors, { origin: true });

  await app.register(dbPlugin);
  await app.register(busPlugin);

  app.decorate(
    "services",
    makeServices({
      bus: app.bus,
      database: app.database,
      env: app.env,
    }),
  );

  registerHelloHandlers({
    bus: app.bus,
    logger: app.log,
  });

  await app.register(authPlugin);
  await app.register(websocketPlugin);
  await app.register(trpcPlugin);

  app.get<{ Params: { sha256: string } }>(
    "/assets/:sha256",
    async (req, reply) => {
      const sha256 = req.params.sha256;
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        return reply.status(400).send({ error: "Invalid asset id" });
      }

      const asset = await app.services.assets.getBySha256(sha256);
      if (!asset) {
        return reply.status(404).send({ error: "Asset not found" });
      }

      try {
        await stat(asset.absolutePath);
      } catch {
        return reply.status(404).send({ error: "Asset bytes missing" });
      }

      reply.header("Content-Type", asset.contentType);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(createReadStream(asset.absolutePath));
    },
  );

  app.get("/healthz", async (req, reply) => {
    const result = await app.services.health.check({
      requestId: req.id,
    });
    return reply.status(result.ok ? 200 : 503).send(result);
  });

  app.get<{ Querystring: HelloQuerystring }>("/hello", async (req) => {
    return app.services.hello.sayHello(
      {
        name: req.query.name?.trim() || "REST",
      },
      {
        requestId: req.id,
        source: "rest",
        user: req.user,
      },
    );
  });

  app.post<{ Body: IngestBody }>("/ingest", async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const body = req.body;

    if (!body?.url) {
      return reply.status(400).send({
        error: "url is required",
      });
    }

    const result = await app.services.ingest.enqueue({
      ingestor: body.ingestor ?? null,
      payload: body.payload,
      url: body.url,
    });

    return reply.status(202).send(result);
  });

  app.post<{ Body: { items: IngestBody[] } }>(
    "/ingest/batch",
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const items = req.body?.items;

      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ error: "items array is required" });
      }

      const results = [];
      for (const item of items) {
        const result = await app.services.ingest.enqueue({
          ingestor: item.ingestor ?? null,
          payload: item.payload,
          url: item.url,
        });
        results.push(result);
      }

      return reply.status(202).send({ results });
    },
  );

  // Streaming chat about a single archived article, consumed by the reader's
  // `useChat` panel. Returns an AI SDK UI message stream (SSE).
  app.post<{ Body: ChatBody }>("/chat", async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const itemId = Number(req.body?.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return reply.status(400).send({ error: "itemId is required" });
    }

    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({ error: "messages is required" });
    }

    // A client that navigates away or hits stop closes the socket. Without
    // this the model call keeps running and we pay for tokens nobody reads.
    //
    // This has to hang off the *response*, not the request: since Node 16 an
    // IncomingMessage emits "close" once its body has been read, which for a
    // POST is a few milliseconds in — listening there aborted every call
    // before it streamed a single token. On the response, "close" precedes
    // "finish" only when the client really did go away.
    const abortController = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableFinished) {
        abortController.abort();
      }
    });

    let result: Awaited<ReturnType<typeof app.services.chat.streamArticleChat>>;
    try {
      result = await app.services.chat.streamArticleChat({
        abortSignal: abortController.signal,
        itemId,
        messages: messages as UIMessage[],
      });
    } catch (error) {
      if (error instanceof ChatNotConfiguredError) {
        return reply.status(503).send({ error: error.message });
      }
      if (error instanceof ArticleNotFoundError) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }

    // Past this point the response is ours to write; Fastify must not also
    // try to send one.
    const headers = pendingReplyHeaders(reply);
    reply.hijack();
    await result.pipeUIMessageStreamToResponse(reply.raw, {
      headers,
      // The stream defaults to a generic "An error occurred." Upstream
      // failures here are things the operator needs to see (bad key, no
      // credits, unknown model), and the route is already authenticated.
      onError: (error) => {
        req.log.error(error, "chat stream failed");
        return error instanceof Error ? error.message : "Chat request failed.";
      },
    });
    return reply;
  });

  // Read-only export surface for external apps (e.g. an Obsidian plugin)
  // polling article data as Markdown. See docs and the export module.
  app.get<{ Querystring: ExportListQuerystring }>(
    "/export/articles",
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const result = await app.services.export.listArticles({
        since: req.query.since,
        limit:
          req.query.limit !== undefined ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor,
        sourceType: req.query.sourceType,
        order: req.query.order === "desc" ? "desc" : "asc",
      });

      return reply.send(result);
    },
  );

  app.get<{ Querystring: ExportBatchQuerystring }>(
    "/export/articles/batch",
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const ids = (req.query.ids ?? "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);

      if (ids.length === 0) {
        return reply.status(400).send({ error: "ids is required" });
      }
      if (ids.length > EXPORT_BATCH_MAX_IDS) {
        return reply
          .status(400)
          .send({ error: `Too many ids (max ${EXPORT_BATCH_MAX_IDS})` });
      }

      const includeComments = req.query.comments !== "false";
      const base = assetBaseUrl(req);
      const articles = await app.services.export.getArticlesBatch({ ids });

      return reply.send({
        articles: articles.map((article) => ({
          id: article.frontmatter.nabitId,
          contentHash: article.frontmatter.contentHash,
          markdown: renderArticleDocument(article, {
            assetBaseUrl: base,
            comments: includeComments,
          }),
        })),
      });
    },
  );

  app.get<{ Params: { id: string }; Querystring: ExportArticleQuerystring }>(
    "/export/articles/:id",
    async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(400).send({ error: "Invalid article id" });
      }

      const article = await app.services.export.getArticle({ id });
      if (!article) {
        return reply.status(404).send({ error: "Article not found" });
      }

      const includeComments = req.query.comments !== "false";
      const maxComments =
        req.query.maxComments !== undefined
          ? Number(req.query.maxComments)
          : undefined;
      const base = assetBaseUrl(req);
      const markdown = renderArticleDocument(article, {
        assetBaseUrl: base,
        comments: includeComments,
        maxComments,
      });

      if (req.query.format === "json") {
        return reply.send({
          frontmatter: article.frontmatter,
          body: rewriteAssetUrls(
            article.contentMarkdown ?? article.contentText ?? "",
            base,
          ),
          markdown,
          contentHash: article.frontmatter.contentHash,
          comments: includeComments ? article.comments : [],
        });
      }

      reply.header("Content-Type", "text/markdown; charset=utf-8");
      return reply.send(markdown);
    },
  );

  return app;
}
