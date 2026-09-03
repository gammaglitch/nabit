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
  crawl: {
    start(
      input: StartCrawlInputDTO,
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
    ingest(input: IngestInputDTO): IngestOutputDTO | Promise<IngestOutputDTO>;
    ingestBatch(
      input: IngestBatchInputDTO,
    ): IngestBatchOutputDTO | Promise<IngestBatchOutputDTO>;
    enqueue(
      input: EnqueueIngestInputDTO,
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
