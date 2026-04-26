import cors from "@fastify/cors";
import Fastify from "fastify";
import { getAppEnv } from "./lib/config/env";
import { makeServices } from "./lib/services";
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

  return app;
}
