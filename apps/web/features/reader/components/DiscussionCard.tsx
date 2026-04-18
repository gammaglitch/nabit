import {
  formatRelativeTime,
  formatSourceLabel,
  mono,
} from "@/features/shared/utils/format";
import type { CommentNode } from "./CommentTree";
import { CommentTree } from "./CommentTree";

export type DiscussionNode = {
  author: string | null;
  comments: CommentNode[];
  commentCount: number;
  id: number;
  ingestedAt: string;
  metadata: Record<string, unknown>;
  sourceType: string;
  sourceUrl: string | null;
  title: string | null;
};

function getDiscussionScore(
  metadata: Record<string, unknown>,
  sourceType: string,
) {
  if (
    sourceType === "hacker_news_post" &&
    typeof metadata.points === "number"
  ) {
    return `${metadata.points} points`;
  }
  if (sourceType === "reddit_post" && typeof metadata.score === "number") {
    return `${metadata.score} points`;
  }
  return null;
}

function getDiscussionSubreddit(metadata: Record<string, unknown>) {
  return typeof metadata.subreddit === "string"
    ? `r/${metadata.subreddit}`
    : null;
}

export function DiscussionCard({ discussion }: { discussion: DiscussionNode }) {
  const score = getDiscussionScore(discussion.metadata, discussion.sourceType);
  const subreddit = getDiscussionSubreddit(discussion.metadata);

  return (
    <details
      open
      className="group rounded-[12px] border border-[#1A1A1A] bg-[#111111]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-[#141414]">
        <span className={`${mono} text-[#E8E8E8]`}>
          {formatSourceLabel(discussion.sourceType)}
        </span>
        {subreddit && (
          <span className={`${mono} text-[#999999]`}>{subreddit}</span>
        )}
        {score && <span className={`${mono} text-[#999999]`}>{score}</span>}
        <span className={`${mono} text-[#666666]`}>
          {discussion.commentCount} COMMENTS
        </span>
        <span className={`${mono} hidden text-[#666666] sm:inline`}>
          {formatRelativeTime(discussion.ingestedAt)}
        </span>
        {discussion.sourceUrl && (
          <a
            href={discussion.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className={`${mono} ml-auto text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]`}
          >
            OPEN ↗
          </a>
        )}
      </summary>
      <div className="border-t border-[#1A1A1A] px-5 py-5">
        <CommentTree comments={discussion.comments} />
      </div>
    </details>
  );
}
