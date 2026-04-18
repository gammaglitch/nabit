import websocket from "@fastify/websocket";
import fp from "fastify-plugin";

export default fp(async (app) => {
  if (!app.env.websocketsEnabled) {
    return;
  }

  await app.register(websocket);

  app.get(
    "/ws/hello",
    {
      websocket: true,
    },
    (socket, req) => {
      socket.send(
        JSON.stringify({
          type: "hello",
          message: "WebSocket hello from @repo/api",
          requestId: req.id,
          timestamp: new Date().toISOString(),
        }),
      );

      const onHelloPublished = (payload: {
        message: string;
        requestId: string;
        servedAt: string;
        source: "trpc" | "rest" | "websocket";
      }) => {
        if (socket.readyState === 1) {
          socket.send(
            JSON.stringify({
              type: "helloPublished",
              payload,
            }),
          );
        }
      };

      app.bus.on("helloPublished", onHelloPublished);

      socket.on("message", (message) => {
        if (socket.readyState !== 1) {
          return;
        }

        const text = message.toString();
        const response = app.services.hello.sayHello(
          {
            name: text || "WebSocket",
          },
          {
            requestId: req.id,
            source: "websocket",
            user: req.user,
          },
        );

        void Promise.resolve(response).then((value) => {
          socket.send(
            JSON.stringify({
              type: "helloResponse",
              payload: value,
            }),
          );
        });
      });

      socket.on("close", () => {
        app.bus.off("helloPublished", onHelloPublished);
      });
    },
  );
});
