import fp from "fastify-plugin";
import { createEventBus } from "../lib/event-bus";

export default fp(async (app) => {
  app.decorate("bus", createEventBus());
});
