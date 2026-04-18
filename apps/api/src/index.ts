import { buildApp } from "./server";

const app = await buildApp();

try {
  await app.listen({
    host: app.env.host,
    port: app.env.port,
  });
  app.log.info(
    {
      host: app.env.host,
      port: app.env.port,
      supabaseAuthEnabled: app.env.supabase.authEnabled,
      websocketsEnabled: app.env.websocketsEnabled,
    },
    "api server listening",
  );
} catch (error) {
  app.log.error(error, "failed to start api server");
  process.exit(1);
}
