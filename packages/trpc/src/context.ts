import type { HealthCheckOutputDTO } from "./modules/health/dto";
import type {
  HelloWorldInputDTO,
  HelloWorldOutputDTO,
  PrivateHelloOutputDTO,
} from "./modules/hello/dto";
import type {
  DeleteInputDTO,
  DeleteOutputDTO,
  GetItemInputDTO,
  IngestBatchInputDTO,
  IngestBatchOutputDTO,
  IngestInputDTO,
  IngestOutputDTO,
  ItemDetailOutputDTO,
  ItemListInputDTO,
  ItemListOutputDTO,
} from "./modules/ingest/dto";
import type {
  AddTagToItemInputDTO,
  AddTagToItemOutputDTO,
  CreateTagInputDTO,
  CreateTagOutputDTO,
  DeleteTagInputDTO,
  DeleteTagOutputDTO,
  RemoveTagFromItemInputDTO,
  RemoveTagFromItemOutputDTO,
  TagListOutputDTO,
} from "./modules/tags/dto";

export type AuthUserRole = "admin" | "user";

export interface AuthUser {
  email: string | null;
  id: string;
  role: AuthUserRole;
  tokenKind: "supabase";
}

export interface TrpcServices {
  health: {
    check(input: {
      requestId: string;
    }): HealthCheckOutputDTO | Promise<HealthCheckOutputDTO>;
  };
  hello: {
    sayHello(
      input: HelloWorldInputDTO,
      options: {
        requestId: string;
        source: "rest" | "trpc" | "websocket";
        user: AuthUser | null;
      },
    ): HelloWorldOutputDTO | Promise<HelloWorldOutputDTO>;
    sayHelloToAuthenticatedUser(options: {
      requestId: string;
      user: AuthUser;
    }): PrivateHelloOutputDTO | Promise<PrivateHelloOutputDTO>;
  };
  ingest: {
    ingest(input: IngestInputDTO): IngestOutputDTO | Promise<IngestOutputDTO>;
    ingestBatch(
      input: IngestBatchInputDTO,
    ): IngestBatchOutputDTO | Promise<IngestBatchOutputDTO>;
    list(
      input: ItemListInputDTO,
    ): ItemListOutputDTO | Promise<ItemListOutputDTO>;
    get(
      input: GetItemInputDTO,
    ): ItemDetailOutputDTO | Promise<ItemDetailOutputDTO>;
    delete(input: DeleteInputDTO): DeleteOutputDTO | Promise<DeleteOutputDTO>;
  };
  tags: {
    list(): TagListOutputDTO | Promise<TagListOutputDTO>;
    create(
      input: CreateTagInputDTO,
    ): CreateTagOutputDTO | Promise<CreateTagOutputDTO>;
    delete(
      input: DeleteTagInputDTO,
    ): DeleteTagOutputDTO | Promise<DeleteTagOutputDTO>;
    addToItem(
      input: AddTagToItemInputDTO,
    ): AddTagToItemOutputDTO | Promise<AddTagToItemOutputDTO>;
    removeFromItem(
      input: RemoveTagFromItemInputDTO,
    ): RemoveTagFromItemOutputDTO | Promise<RemoveTagFromItemOutputDTO>;
  };
}

export interface TrpcContext {
  allowedEmails: string[] | null;
  requestId: string;
  services: TrpcServices;
  user: AuthUser | null;
}
