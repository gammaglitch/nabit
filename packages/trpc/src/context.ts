import type {
  CancelCrawlInputDTO,
  DeleteCrawlInputDTO,
  DeleteCrawlOutputDTO,
  GetCrawlInputDTO,
  GetCrawlOutputDTO,
  ListCrawlsInputDTO,
  ListCrawlsOutputDTO,
  StartCrawlInputDTO,
  StartCrawlOutputDTO,
} from "./modules/crawl/dto";
import type {
  GetDigestInputDTO,
  GetDigestOutputDTO,
  ListDigestsInputDTO,
  ListDigestsOutputDTO,
  TriggerDigestInputDTO,
  TriggerDigestOutputDTO,
} from "./modules/digest/dto";
import type { HealthCheckOutputDTO } from "./modules/health/dto";
import type {
  HelloWorldInputDTO,
  HelloWorldOutputDTO,
  PrivateHelloOutputDTO,
} from "./modules/hello/dto";
import type {
  DeleteInputDTO,
  DeleteManyInputDTO,
  DeleteManyOutputDTO,
  DeleteOutputDTO,
  EnqueueIngestInputDTO,
  EnqueueIngestOutputDTO,
  GetIngestJobInputDTO,
  GetItemInputDTO,
  IngestBatchInputDTO,
  IngestBatchOutputDTO,
  IngestInputDTO,
  IngestJobOutputDTO,
  IngestOutputDTO,
  ItemDetailOutputDTO,
  ItemListInputDTO,
  ItemListOutputDTO,
  ListIngestJobsInputDTO,
  ListIngestJobsOutputDTO,
  ReextractInputDTO,
  ReextractOutputDTO,
  SetDigestOptInInputDTO,
  SetDigestOptInOutputDTO,
} from "./modules/ingest/dto";
import type {
  ChatSettingsOutputDTO,
  UpdateChatSettingsInputDTO,
  UpdateChatSettingsOutputDTO,
} from "./modules/settings/dto";
import type {
  AddTagToItemInputDTO,
  AddTagToItemOutputDTO,
  AddTagToItemsInputDTO,
  AddTagToItemsOutputDTO,
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
  // The auth provider's subject (Supabase `sub`), or a fixed id for the API
  // token and auth-disabled callers. Not stable across providers — record
  // `userId` instead.
  id: string;
  role: AuthUserRole;
  tokenKind: "api-token" | "local" | "supabase";
  // nabit's own user id (users.id). Null for callers that are not a person:
  // the shared API token and the synthetic AUTH_REQUIRED=false user.
  userId: number | null;
}

// Who is acting on a request, as services record it. Kept apart from AuthUser
// so internal callers (a crawl queueing its pages) can attribute work without
// having to fake a whole authenticated user.
export interface RequestActor {
  userId: number | null;
}

export interface TrpcServices {
  crawl: {
    start(
      input: StartCrawlInputDTO,
      actor: RequestActor,
    ): StartCrawlOutputDTO | Promise<StartCrawlOutputDTO>;
    list(
      input: ListCrawlsInputDTO,
    ): ListCrawlsOutputDTO | Promise<ListCrawlsOutputDTO>;
    get(
      input: GetCrawlInputDTO,
    ): GetCrawlOutputDTO | Promise<GetCrawlOutputDTO>;
    cancel(
      input: CancelCrawlInputDTO,
    ): GetCrawlOutputDTO | Promise<GetCrawlOutputDTO>;
    delete(
      input: DeleteCrawlInputDTO,
    ): DeleteCrawlOutputDTO | Promise<DeleteCrawlOutputDTO>;
  };
  digest: {
    list(
      input: ListDigestsInputDTO,
    ): ListDigestsOutputDTO | Promise<ListDigestsOutputDTO>;
    get(
      input: GetDigestInputDTO,
    ): GetDigestOutputDTO | Promise<GetDigestOutputDTO>;
    trigger(
      input: TriggerDigestInputDTO,
    ): TriggerDigestOutputDTO | Promise<TriggerDigestOutputDTO>;
  };
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
    ingest(
      input: IngestInputDTO,
      actor: RequestActor,
    ): IngestOutputDTO | Promise<IngestOutputDTO>;
    ingestBatch(
      input: IngestBatchInputDTO,
      actor: RequestActor,
    ): IngestBatchOutputDTO | Promise<IngestBatchOutputDTO>;
    enqueue(
      input: EnqueueIngestInputDTO,
      actor: RequestActor,
    ): EnqueueIngestOutputDTO | Promise<EnqueueIngestOutputDTO>;
    getJob(
      input: GetIngestJobInputDTO,
    ): IngestJobOutputDTO | Promise<IngestJobOutputDTO>;
    listJobs(
      input: ListIngestJobsInputDTO,
    ): ListIngestJobsOutputDTO | Promise<ListIngestJobsOutputDTO>;
    list(
      input: ItemListInputDTO,
    ): ItemListOutputDTO | Promise<ItemListOutputDTO>;
    get(
      input: GetItemInputDTO,
    ): ItemDetailOutputDTO | Promise<ItemDetailOutputDTO>;
    reextract(
      input: ReextractInputDTO,
    ): ReextractOutputDTO | Promise<ReextractOutputDTO>;
    delete(input: DeleteInputDTO): DeleteOutputDTO | Promise<DeleteOutputDTO>;
    deleteMany(
      input: DeleteManyInputDTO,
    ): DeleteManyOutputDTO | Promise<DeleteManyOutputDTO>;
    setDigestOptIn(
      input: SetDigestOptInInputDTO,
    ): SetDigestOptInOutputDTO | Promise<SetDigestOptInOutputDTO>;
  };
  settings: {
    get(): ChatSettingsOutputDTO | Promise<ChatSettingsOutputDTO>;
    update(
      input: UpdateChatSettingsInputDTO,
    ): UpdateChatSettingsOutputDTO | Promise<UpdateChatSettingsOutputDTO>;
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
    addToItems(
      input: AddTagToItemsInputDTO,
    ): AddTagToItemsOutputDTO | Promise<AddTagToItemsOutputDTO>;
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
