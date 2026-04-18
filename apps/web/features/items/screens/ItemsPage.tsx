"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarkdownArticle } from "@/features/reader/components/MarkdownArticle";
import {
  formatRelativeTime,
  formatSourceLabel,
  formatStatus,
  mono,
  statusColor,
} from "@/features/shared/utils/format";
import { trpc } from "@/lib/trpc/react";
import { ItemListRow } from "../components/ItemListRow";
import { StatRow } from "../components/StatRow";
import { TagAdder } from "../components/TagAdder";
import { useGroupedItems } from "../hooks/useGroupedItems";

type SortBy = "published" | "ingested";

export default function ItemsPage() {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("published");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(
    null,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, error, isLoading } = trpc.ingest.list.useQuery({
    sourceType: selectedSourceType ?? undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    search: debouncedSearch || undefined,
  });

  const tagsQuery = trpc.tags.list.useQuery();

  const sorted = data?.items
    ? [...data.items].sort((left, right) => {
        const leftDate =
          sortBy === "published"
            ? (left.sourceCreatedAt ?? left.ingestedAt)
            : left.ingestedAt;
        const rightDate =
          sortBy === "published"
            ? (right.sourceCreatedAt ?? right.ingestedAt)
            : right.ingestedAt;

        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      })
    : [];

  const grouped = useGroupedItems(sorted);

  const sourceTypes = data?.items
    ? [...new Set(data.items.map((item) => item.sourceType))].sort()
    : [];

  // Resolve selection: find the group that contains selectedId, or fall back to first group
  const selectedGroup =
    selectedId !== null
      ? grouped.find(
          (g) =>
            g.primary.id === selectedId ||
            g.discussions.some((d) => d.id === selectedId),
        )
      : undefined;
  const currentGroup = selectedGroup ?? grouped[0] ?? null;
  const currentSelectedId = currentGroup?.primary.id ?? null;

  const detailQuery = trpc.ingest.get.useQuery(
    { id: currentSelectedId ?? 0 },
    { enabled: currentSelectedId !== null },
  );

  const deleteMutation = trpc.ingest.delete.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.ingest.get.invalidate(),
      ]);
      if (currentSelectedId === variables.id) {
        setSelectedId(null);
      }
    },
  });

  const removeTagMutation = trpc.tags.removeFromItem.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.ingest.get.invalidate(),
      ]);
    },
  });

  const ingestMutation = trpc.ingest.ingest.useMutation({
    onSuccess: async (result) => {
      setIngestUrl("");
      setIngestStatus(result.created ? "[ARCHIVED]" : "[EXISTS]");
      setTimeout(() => setIngestStatus(null), 3000);
      await utils.ingest.list.invalidate();
    },
  });

  function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    const url = ingestUrl.trim();
    if (!url) return;
    setIngestStatus(null);
    ingestMutation.mutate({ url });
  }

  function toggleTagFilter(tagId: number) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#000000] px-6 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden pt-8">
        {/* Top bar: header + ingest */}
        <div className="mb-6 flex shrink-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`mb-2 ${mono} text-[#999999]`}>ARCHIVE</p>
            {isLoading ? (
              <p className={`${mono} text-[#666666]`}>[LOADING...]</p>
            ) : (
              <h1 className="font-[family-name:var(--font-doto)] text-[72px] leading-none tracking-[-0.03em] text-white">
                {data?.total ?? 0}
              </h1>
            )}
          </div>

          <form className="flex items-center gap-3" onSubmit={handleIngest}>
            <input
              className={`${mono} h-[40px] w-[280px] border-b border-[#333333] bg-transparent px-0 text-[#E8E8E8] outline-none transition-colors duration-200 placeholder:text-[#666666] focus:border-[#E8E8E8] lg:w-[360px]`}
              placeholder="PASTE URL TO INGEST..."
              type="url"
              value={ingestUrl}
              onChange={(e) => setIngestUrl(e.target.value)}
            />
            <button
              className={`${mono} h-[40px] shrink-0 rounded-[999px] px-5 transition-colors duration-200 ${
                ingestMutation.isPending || !ingestUrl.trim()
                  ? "border border-[#222222] text-[#666666]"
                  : "bg-white text-black hover:bg-[#E8E8E8]"
              }`}
              disabled={ingestMutation.isPending || !ingestUrl.trim()}
              type="submit"
            >
              {ingestMutation.isPending ? "ARCHIVING..." : "ARCHIVE"}
            </button>
            {ingestStatus && (
              <span className={`${mono} text-[#4A9E5C]`}>{ingestStatus}</span>
            )}
            {ingestMutation.error && (
              <span className={`${mono} text-[#D71921]`}>[ERROR]</span>
            )}
          </form>
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <input
              className={`${mono} h-[36px] w-[240px] border-b border-[#333333] bg-transparent px-0 text-[#E8E8E8] outline-none transition-colors duration-200 placeholder:text-[#666666] focus:border-[#E8E8E8]`}
              placeholder="SEARCH..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />

            {/* Source type pills */}
            <div className="flex overflow-hidden rounded-[8px] border border-[#333333]">
              <button
                type="button"
                onClick={() => setSelectedSourceType(null)}
                className={`${mono} px-4 py-2 transition-colors duration-200 ${
                  selectedSourceType === null
                    ? "bg-white text-black"
                    : "text-[#999999] hover:text-[#E8E8E8]"
                }`}
              >
                ALL
              </button>
              {sourceTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedSourceType(type)}
                  className={`${mono} px-4 py-2 transition-colors duration-200 ${
                    selectedSourceType === type
                      ? "bg-white text-black"
                      : "text-[#999999] hover:text-[#E8E8E8]"
                  }`}
                >
                  {type.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Sort toggle */}
            <div className="ml-auto flex overflow-hidden rounded-[8px] border border-[#333333]">
              {(["published", "ingested"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSortBy(option)}
                  className={`${mono} px-4 py-2 transition-colors duration-200 ${
                    sortBy === option
                      ? "bg-white text-black"
                      : "text-[#999999] hover:text-[#E8E8E8]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter pills */}
          {tagsQuery.data && tagsQuery.data.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {tagsQuery.data.tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTagFilter(tag.id)}
                    className={`${mono} rounded-[999px] border px-3 py-1 transition-colors duration-200 ${
                      active
                        ? "border-[#E8E8E8] text-[#E8E8E8]"
                        : "border-[#333333] text-[#666666] hover:border-[#666666] hover:text-[#999999]"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {selectedTagIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  className={`${mono} text-[#666666] transition-colors duration-200 hover:text-[#999999]`}
                >
                  CLEAR
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className={`${mono} mb-4 shrink-0 text-[#D71921]`}>
            [ERROR: {error.message}]
          </p>
        )}

        {data && data.items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-[18px] text-[#999999]">
                Nothing archived yet.
              </p>
              <p className={`mt-3 ${mono} text-[#666666]`}>
                Items will appear here once ingested.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[1fr_1fr] gap-6 pb-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] lg:grid-rows-none">
            {/* Items list */}
            <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#1A1A1A] bg-[#111111]">
              <div className="shrink-0 border-b border-[#1A1A1A] px-5 py-3">
                <p className={`${mono} text-[#666666]`}>
                  ITEMS <span className="text-[#999999]">{grouped.length}</span>
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {grouped.map((group) => (
                  <ItemListRow
                    key={group.primary.id}
                    group={group}
                    selected={group.primary.id === currentSelectedId}
                    onClick={() => setSelectedId(group.primary.id)}
                  />
                ))}
              </div>
            </section>

            {/* Detail panel */}
            <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#1A1A1A] bg-[#111111]">
              <div className="shrink-0 border-b border-[#1A1A1A] px-5 py-3">
                <p className={`${mono} text-[#666666]`}>DETAIL</p>
              </div>

              {!currentSelectedId ? (
                <div className={`px-5 py-8 ${mono} text-[#666666]`}>
                  Select an archived item.
                </div>
              ) : detailQuery.isLoading ? (
                <div className={`px-5 py-8 ${mono} text-[#666666]`}>
                  [LOADING ITEM...]
                </div>
              ) : detailQuery.error ? (
                <div className={`px-5 py-8 ${mono} text-[#D71921]`}>
                  [ERROR: {detailQuery.error.message}]
                </div>
              ) : detailQuery.data ? (
                <div className="flex-1 space-y-10 overflow-y-auto px-5 py-6">
                  {/* Title + actions */}
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className={`${mono} mb-3 text-[#666666]`}>
                        {formatSourceLabel(detailQuery.data.item.sourceType)}
                      </p>
                      <h2 className="break-words text-[28px] leading-[1.15] tracking-[-0.01em] text-white">
                        {detailQuery.data.item.title ??
                          detailQuery.data.item.sourceUrl ??
                          "Untitled"}
                      </h2>
                      {detailQuery.data.item.author && (
                        <p className="mt-3 text-[15px] text-[#999999]">
                          by {detailQuery.data.item.author}
                        </p>
                      )}
                      {detailQuery.data.item.subjectItemId !== null && (
                        <Link
                          href={`/read/${detailQuery.data.item.subjectItemId}`}
                          className={`${mono} mt-4 inline-block text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]`}
                        >
                          READ LINKED ARTICLE →
                        </Link>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {(
                        detailQuery.data.item.contentMarkdown ??
                        detailQuery.data.item.contentText ??
                        ""
                      ).trim().length > 0 && (
                        <Link
                          href={`/read/${currentSelectedId}`}
                          className={`${mono} rounded-[999px] border border-[#E8E8E8] bg-white px-4 py-2 text-black transition-colors duration-200 hover:bg-[#E8E8E8]`}
                        >
                          READ →
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          deleteMutation.mutate({ id: currentSelectedId })
                        }
                        disabled={deleteMutation.isPending}
                        className={`${mono} rounded-[999px] border border-[#D71921] px-4 py-2 text-[#D71921] transition-colors duration-200 hover:bg-[#D71921] hover:text-white`}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <p className={`mb-3 ${mono} text-[#666666]`}>TAGS</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {detailQuery.data.item.tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            removeTagMutation.mutate({
                              itemId: currentSelectedId,
                              tagId: tag.id,
                            })
                          }
                          className={`${mono} flex items-center gap-1.5 rounded-[999px] border border-[#333333] px-3 py-1 text-[#E8E8E8] transition-colors duration-200 hover:border-[#D71921] hover:text-[#D71921]`}
                        >
                          {tag.name}
                          <span className="text-[9px]">x</span>
                        </button>
                      ))}
                    </div>
                    <TagAdder
                      allTags={tagsQuery.data?.tags ?? []}
                      itemTags={detailQuery.data.item.tags}
                      itemId={currentSelectedId}
                    />
                  </div>

                  {/* Content preview (rendered markdown) */}
                  {(detailQuery.data.item.contentMarkdown ??
                    detailQuery.data.item.contentText) && (
                    <div>
                      <p className={`mb-4 ${mono} text-[#666666]`}>CONTENT</p>
                      <div className="relative max-h-[400px] overflow-hidden">
                        <MarkdownArticle
                          markdown={
                            detailQuery.data.item.contentMarkdown ??
                            detailQuery.data.item.contentText ??
                            ""
                          }
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#111111] to-transparent" />
                      </div>
                      <Link
                        href={`/read/${currentSelectedId}`}
                        className={`${mono} mt-3 inline-block text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]`}
                      >
                        READ FULL ARTICLE →
                      </Link>
                    </div>
                  )}

                  {/* Discussion summary */}
                  {detailQuery.data.item.discussions.length > 0 && (
                    <div>
                      <p className={`mb-3 ${mono} text-[#666666]`}>
                        DISCUSSIONS
                      </p>
                      <div className="space-y-2">
                        {detailQuery.data.item.discussions.map((discussion) => {
                          const score =
                            discussion.sourceType === "hacker_news_post" &&
                            typeof discussion.metadata.points === "number"
                              ? `${discussion.metadata.points}pts`
                              : discussion.sourceType === "reddit_post" &&
                                  typeof discussion.metadata.score === "number"
                                ? `${discussion.metadata.score}pts`
                                : null;
                          const subreddit =
                            typeof discussion.metadata.subreddit === "string"
                              ? `r/${discussion.metadata.subreddit}`
                              : null;

                          return (
                            <div
                              key={discussion.id}
                              className="flex items-center gap-3 rounded-[8px] border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-3"
                            >
                              <span className={`${mono} text-[#E8E8E8]`}>
                                {formatSourceLabel(discussion.sourceType)}
                              </span>
                              {subreddit && (
                                <span className={`${mono} text-[#999999]`}>
                                  {subreddit}
                                </span>
                              )}
                              {score && (
                                <span className={`${mono} text-[#999999]`}>
                                  {score}
                                </span>
                              )}
                              <span className={`${mono} text-[#666666]`}>
                                {discussion.commentCount} COMMENTS
                              </span>
                              <Link
                                href={`/read/${currentSelectedId}`}
                                className={`${mono} ml-auto text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]`}
                              >
                                READ →
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Debug section (collapsed) */}
                  <details className="rounded-[12px] border border-[#1A1A1A] bg-[#0A0A0A]">
                    <summary
                      className={`${mono} cursor-pointer px-5 py-3 text-[#666666] transition-colors duration-200 hover:text-[#999999]`}
                    >
                      DEBUG
                    </summary>
                    <div className="space-y-10 border-t border-[#1A1A1A] px-5 py-6">
                      {/* Facts + metadata */}
                      <div className="grid gap-10 xl:grid-cols-2">
                        <div>
                          <p className={`mb-2 ${mono} text-[#666666]`}>FACTS</p>
                          <div>
                            <StatRow
                              label="EXTERNAL ID"
                              value={detailQuery.data.item.externalId ?? "N/A"}
                              valueClass="text-[#999999]"
                            />
                            <StatRow
                              label="EXTRACTION"
                              value={formatStatus(
                                detailQuery.data.item.latestExtractionStatus,
                              )}
                              valueClass={statusColor(
                                detailQuery.data.item.latestExtractionStatus,
                              )}
                            />
                            <StatRow
                              label="SNAPSHOTS"
                              value={String(
                                detailQuery.data.item.snapshotCount,
                              )}
                            />
                            <StatRow
                              label="COMMENTS"
                              value={String(detailQuery.data.item.commentCount)}
                            />
                            <StatRow
                              label="INGESTED"
                              value={formatRelativeTime(
                                detailQuery.data.item.ingestedAt,
                              )}
                            />
                            {detailQuery.data.item.sourceCreatedAt && (
                              <StatRow
                                label="PUBLISHED"
                                value={formatRelativeTime(
                                  detailQuery.data.item.sourceCreatedAt,
                                )}
                              />
                            )}
                            {detailQuery.data.item.sourceUrl && (
                              <StatRow
                                label="SOURCE"
                                value={detailQuery.data.item.sourceUrl}
                                href={detailQuery.data.item.sourceUrl}
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <p className={`mb-2 ${mono} text-[#666666]`}>
                            METADATA
                          </p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[4px] border border-[#1A1A1A] bg-[#050505] p-4 font-[family-name:var(--font-space-mono)] text-[12px] leading-[1.6] text-[#999999]">
                            {JSON.stringify(
                              detailQuery.data.item.metadata,
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      </div>

                      {/* Extractions */}
                      <div>
                        <p className={`mb-4 ${mono} text-[#666666]`}>
                          EXTRACTIONS
                        </p>
                        <div className="space-y-3">
                          {detailQuery.data.item.extractions.map(
                            (extraction) => (
                              <div
                                key={extraction.id}
                                className="rounded-[8px] border border-[#1A1A1A] bg-[#050505] px-4 py-3"
                              >
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className={`${mono} text-[#999999]`}>
                                    {extraction.extractor}
                                  </span>
                                  <span
                                    className={`${mono} ${statusColor(extraction.status)}`}
                                  >
                                    {formatStatus(extraction.status)}
                                  </span>
                                  <span
                                    className={`${mono} ml-auto text-[#666666]`}
                                  >
                                    SNAPSHOT {extraction.snapshotId}
                                  </span>
                                </div>
                                {extraction.errorMessage && (
                                  <p className="mt-2 break-words text-[14px] text-[#D71921]">
                                    {extraction.errorMessage}
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>

                      {/* Snapshots */}
                      <div>
                        <p className={`mb-4 ${mono} text-[#666666]`}>
                          SNAPSHOTS
                        </p>
                        <div className="space-y-3">
                          {detailQuery.data.item.snapshots.map((snapshot) => (
                            <details
                              key={snapshot.id}
                              className="rounded-[8px] border border-[#1A1A1A] bg-[#050505] px-4 py-3"
                            >
                              <summary className="cursor-pointer list-none">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className={`${mono} text-[#999999]`}>
                                    {snapshot.contentType}
                                  </span>
                                  <span className={`${mono} text-[#666666]`}>
                                    {formatRelativeTime(snapshot.capturedAt)}
                                  </span>
                                  <span className={`${mono} text-[#666666]`}>
                                    {snapshot.body.length.toLocaleString()}{" "}
                                    CHARS
                                  </span>
                                </div>
                              </summary>
                              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[4px] border border-[#1A1A1A] bg-[#000000] p-4 font-[family-name:var(--font-space-mono)] text-[12px] leading-[1.6] text-[#999999]">
                                {snapshot.body}
                              </pre>
                            </details>
                          ))}
                        </div>
                      </div>

                      {/* Comments */}
                      <div>
                        <p className={`mb-4 ${mono} text-[#666666]`}>
                          COMMENTS
                        </p>
                        {detailQuery.data.item.comments.length === 0 ? (
                          <p className={`${mono} text-[#666666]`}>
                            No extracted comments for this item.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {detailQuery.data.item.comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="rounded-[8px] border border-[#1A1A1A] bg-[#050505] px-4 py-3"
                              >
                                <div className="mb-2 flex flex-wrap gap-3">
                                  {comment.author && (
                                    <span className={`${mono} text-[#999999]`}>
                                      @{comment.author}
                                    </span>
                                  )}
                                  <span className={`${mono} text-[#666666]`}>
                                    {comment.path}
                                  </span>
                                </div>
                                <p className="text-[15px] leading-[1.6] text-[#E8E8E8]">
                                  {comment.contentText}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
