import fp from "fastify-plugin";
import { createDatabaseState } from "../db/client";

export default fp(async (app) => {
  app.decorate("database", createDatabaseState());
});
