import { createHelloMessage } from "@repo/shared";
import type { TrpcServices } from "@repo/trpc";
import type { AppEventBus } from "../../lib/event-bus";

type HelloServiceContract = TrpcServices["hello"];

export class HelloService implements HelloServiceContract {
  constructor(private readonly bus: AppEventBus) {}

  sayHello(
    input: {
      name: string;
    },
    options: {
      requestId: string;
      source: "rest" | "trpc" | "websocket";
      user: {
        id: string;
      } | null;
    },
  ) {
    const servedAt = new Date().toISOString();
    const message = createHelloMessage(input.name);

    this.bus.emit("helloPublished", {
      message,
      requestId: options.requestId,
      servedAt,
      source: options.source,
    });

    return {
      message,
      requestId: options.requestId,
      servedAt,
    };
  }

  sayHelloToAuthenticatedUser(options: {
    requestId: string;
    user: {
      id: string;
      role: "admin" | "user";
    };
  }) {
    const servedAt = new Date().toISOString();
    const message = createHelloMessage(options.user.id);

    this.bus.emit("helloPublished", {
      message,
      requestId: options.requestId,
      servedAt,
      source: "trpc",
    });

    return {
      message,
      role: options.user.role,
      servedAt,
      userId: options.user.id,
    };
  }
}
