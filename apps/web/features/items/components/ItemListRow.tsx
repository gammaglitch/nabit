import {
  formatRelativeTime,
  formatSourceLabel,
  formatStatus,
  mono,
  statusColor,
} from "@/features/shared/utils/format";
import type { GroupedItem } from "../hooks/useGroupedItems";

function getDiscussionBadge(item: GroupedItem["discussions"][number]): string {
  const parts: string[] = [formatSourceLabel(item.sourceType)];

  const meta = item.metadata;
  if (
    item.sourceType === "hacker_news_post" &&
    typeof meta.points === "number"
  ) {
    parts.push(`${meta.points}pts`);
  }
  if (item.sourceType === "reddit_post") {
    if (typeof meta.subreddit === "string") {
      parts[0] = `r/${meta.subreddit}`;
    }
    if (typeof meta.score === "number") {
      parts.push(`${meta.score}pts`);
    }
  }

  if (item.commentCount > 0) {
    parts.push(`${item.commentCount} comments`);
  }

  return parts.join(" · ");
}

export function ItemListRow({
  group,
  selected,
  onClick,
}: {
  group: GroupedItem;
  selected: boolean;
  onClick: () => void;
}) {
  const { primary, discussions } = group;
  const allDiscussions =
    primary.subjectItemId !== null ? [primary, ...discussions] : discussions;

  const totalComments =
    primary.commentCount +
    discussions.reduce((sum, d) => sum + d.commentCount, 0);

  const allTags = new Map<number, { id: number; name: string }>();
  for (const tag of primary.tags) allTags.set(tag.id, tag);
  for (const d of discussions) {
    for (const tag of d.tags) allTags.set(tag.id, tag);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full border-b border-[#1A1A1A] px-5 py-4 text-left transition-colors duration-200 ${
        selected
          ? "border-l-2 border-l-[#D71921] bg-[#1A1A1A]"
          : "border-l-2 border-l-transparent hover:bg-[#141414]"
      }`}
    >
      <div className="mb-2 flex items-center gap-3">
        <span className={`${mono} text-[#666666]`}>
          {formatSourceLabel(primary.sourceType)}
        </span>
        <span
          className={`${mono} ${statusColor(primary.latestExtractionStatus)}`}
        >
          {formatStatus(primary.latestExtractionStatus)}
        </span>
        <span className={`${mono} ml-auto text-[#666666]`}>
          {formatRelativeTime(primary.sourceCreatedAt ?? primary.ingestedAt)}
        </span>
      </div>

      <p className="line-clamp-2 text-[16px] leading-[1.5] text-[#E8E8E8]">
        {primary.title ??
          primary.contentText ??
          primary.sourceUrl ??
          "Untitled"}
      </p>

      {/* Discussion badges */}
      {allDiscussions.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {allDiscussions.map((d) => (
            <span key={d.id} className={`${mono} text-[#999999]`}>
              {getDiscussionBadge(d)}
            </span>
          ))}
        </div>
      )}

      {allTags.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...allTags.values()].map((tag) => (
            <span
              key={tag.id}
              className={`${mono} rounded-[999px] border border-[#333333] px-2.5 py-0.5 text-[#999999]`}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {allDiscussions.length === 0 && totalComments > 0 && (
        <div className="mt-2">
          <span className={`${mono} text-[#666666]`}>
            {totalComments} COMMENTS
          </span>
        </div>
      )}
    </button>
  );
}
