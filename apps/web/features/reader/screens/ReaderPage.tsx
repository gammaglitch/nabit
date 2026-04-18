"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { mono } from "@/features/shared/utils/format";
import { trpc } from "@/lib/trpc/react";
import { ArticlePane } from "../components/ArticlePane";
import { DiscussionPane } from "../components/DiscussionPane";

export default function ReaderPage({ id }: { id: number }) {
  const router = useRouter();

  const detailQuery = trpc.ingest.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );

  // Redirect discussion items to their subject article
  const subjectItemId = detailQuery.data?.item.subjectItemId ?? null;
  useEffect(() => {
    if (subjectItemId !== null) {
      router.replace(`/read/${subjectItemId}`);
    }
  }, [subjectItemId, router]);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6">
        <p className={`${mono} text-[#D71921]`}>[INVALID ITEM ID]</p>
      </main>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6">
        <p className={`${mono} text-[#666666]`}>[LOADING ARTICLE...]</p>
      </main>
    );
  }

  if (detailQuery.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6">
        <p className={`${mono} text-[#D71921]`}>
          [ERROR: {detailQuery.error.message}]
        </p>
      </main>
    );
  }

  if (!detailQuery.data) {
    return null;
  }

  // If redirecting to subject article, show loading
  if (subjectItemId !== null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6">
        <p className={`${mono} text-[#666666]`}>[LOADING ARTICLE...]</p>
      </main>
    );
  }

  const item = detailQuery.data.item;
  const discussions = item.discussions;
  const comments = item.comments;
  const hasDiscussions = discussions.length > 0 || comments.length > 0;

  return (
    <main className="h-screen bg-[#000000]">
      {hasDiscussions ? (
        <div className="grid h-full grid-rows-[1fr_1fr] lg:grid-cols-[1fr_minmax(320px,0.7fr)] lg:grid-rows-none">
          <div className="min-h-0 overflow-y-auto border-b border-[#1A1A1A] lg:border-b-0 lg:border-r">
            <ArticlePane item={item} />
          </div>
          <div className="min-h-0 overflow-y-auto">
            <DiscussionPane discussions={discussions} comments={comments} />
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <ArticlePane item={item} />
        </div>
      )}
    </main>
  );
}
