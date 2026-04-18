import { formatRelativeTime, mono } from "@/features/shared/utils/format";

const MAX_COMMENT_DEPTH = 8;

function commentDepth(path: string) {
  return path.split(".").length - 1;
}

export type CommentNode = {
  author: string | null;
  contentText: string;
  externalId: string | null;
  id: number;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: string | null;
};

export function CommentTree({ comments }: { comments: CommentNode[] }) {
  if (comments.length === 0) {
    return (
      <p className={`${mono} text-[#666666]`}>
        No comments archived for this discussion.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => {
        const depth = Math.min(commentDepth(comment.path), MAX_COMMENT_DEPTH);
        const points =
          typeof comment.metadata.points === "number"
            ? comment.metadata.points
            : null;
        return (
          <div key={comment.id} style={{ paddingLeft: `${depth * 16}px` }}>
            <div className="border-l border-[#1A1A1A] pl-3">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {comment.author && (
                  <span className={`${mono} text-[#999999]`}>
                    @{comment.author}
                  </span>
                )}
                {points !== null && (
                  <span className={`${mono} text-[#666666]`}>{points} pts</span>
                )}
                {comment.sourceCreatedAt && (
                  <span className={`${mono} text-[#666666]`}>
                    {formatRelativeTime(comment.sourceCreatedAt)}
                  </span>
                )}
              </div>
              <p className="break-words text-[14px] leading-[1.6] text-[#E8E8E8] whitespace-pre-line">
                {comment.contentText}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
