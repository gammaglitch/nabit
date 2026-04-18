import { mono } from "@/features/shared/utils/format";
import type { CommentNode } from "./CommentTree";
import { CommentTree } from "./CommentTree";
import type { DiscussionNode } from "./DiscussionCard";
import { DiscussionCard } from "./DiscussionCard";

export function DiscussionPane({
  discussions,
  comments,
}: {
  discussions: DiscussionNode[];
  comments: CommentNode[];
}) {
  const hasDiscussions = discussions.length > 0;
  const hasComments = comments.length > 0;

  if (!hasDiscussions && !hasComments) {
    return (
      <div className="flex h-full items-center justify-center px-5">
        <p className={`${mono} text-[#666666]`}>NO DISCUSSIONS</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-10">
      {hasDiscussions ? (
        <>
          <p className={`mb-4 ${mono} text-[#666666]`}>DISCUSSED ON</p>
          <div className="space-y-4">
            {discussions.map((discussion) => (
              <DiscussionCard key={discussion.id} discussion={discussion} />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={`mb-4 ${mono} text-[#666666]`}>
            COMMENTS · {comments.length}
          </p>
          <div className="rounded-[12px] border border-[#1A1A1A] bg-[#111111] px-5 py-5">
            <CommentTree comments={comments} />
          </div>
        </>
      )}
    </div>
  );
}
