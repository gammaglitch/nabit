import type { AuthUser, TrpcServices } from "@repo/trpc";

export type HelloWorldInput = Parameters<TrpcServices["hello"]["sayHello"]>[0];
export type HelloWorldOptions = Parameters<
  TrpcServices["hello"]["sayHello"]
>[1];
export type HelloWorldResult = Awaited<
  ReturnType<TrpcServices["hello"]["sayHello"]>
>;
export type PrivateHelloOptions = Parameters<
  TrpcServices["hello"]["sayHelloToAuthenticatedUser"]
>[0];
export type PrivateHelloResult = Awaited<
  ReturnType<TrpcServices["hello"]["sayHelloToAuthenticatedUser"]>
>;
export type HelloAuthUser = AuthUser;
