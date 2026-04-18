import { TypedEmitter } from "tiny-typed-emitter";

export interface AppEventMap {
  helloPublished: (payload: {
    message: string;
    requestId: string;
    servedAt: string;
    source: "trpc" | "rest" | "websocket";
  }) => void;
}

export type AppEventBus = TypedEmitter<AppEventMap>;

export function createEventBus() {
  return new TypedEmitter<AppEventMap>();
}
