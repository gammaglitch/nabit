import { z } from "zod";

export const HelloWorldInput = z.object({
  name: z.string().min(1),
});

export const HelloWorldOutput = z.object({
  message: z.string(),
  requestId: z.string(),
  servedAt: z.string(),
});

export const PrivateHelloOutput = z.object({
  message: z.string(),
  role: z.enum(["admin", "user"]),
  servedAt: z.string(),
  userId: z.string(),
});

export type HelloWorldInputDTO = z.infer<typeof HelloWorldInput>;
export type HelloWorldOutputDTO = z.infer<typeof HelloWorldOutput>;
export type PrivateHelloOutputDTO = z.infer<typeof PrivateHelloOutput>;
