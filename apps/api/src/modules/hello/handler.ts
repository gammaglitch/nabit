import type { FastifyBaseLogger } from "fastify";
import type { AppEventBus } from "../../lib/event-bus";

type RegisterHelloHandlersOptions = {
  bus: AppEventBus;
  logger: FastifyBaseLogger;
};

export function registerHelloHandlers(options: RegisterHelloHandlersOptions) {
  options.bus.on("helloPublished", (payload) => {
    options.logger.info(payload, "helloPublished event observed");
  });
}
