import Link from "next/link";
import {
  formatRelativeTime,
  formatSourceLabel,
  mono,
} from "@/features/shared/utils/format";
import { MarkdownArticle } from "./MarkdownArticle";

type ArticleItem = {
  author: string | null;
  contentMarkdown: string | null;
  contentText: string | null;
  sourceCreatedAt: string | null;
  sourceType: string;
  sourceUrl: string | null;
  tags: Array<{ id: number; name: string }>;
  title: string | null;
};

export function ArticlePane({ item }: { item: ArticleItem }) {
  const markdown = item.contentMarkdown ?? item.contentText ?? "";
  const hasContent = markdown.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        {/* Top bar */}
        <div className="mb-10 flex flex-wrap items-center gap-4">
          <Link
            href="/items"
            className={`${mono} text-[#999999] transition-colors duration-200 hover:text-[#E8E8E8]`}
          >
            ← BACK
          </Link>
          <span className={`${mono} text-[#666666]`}>
            {formatSourceLabel(item.sourceType)}
          </span>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={`${mono} ml-auto truncate text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]`}
            >
              {new URL(item.sourceUrl).hostname} ↗
            </a>
          )}
        </div>

        <article>
          <header className="mb-10">
            <h1 className="break-words text-[44px] font-bold leading-[1.1] tracking-[-0.01em] text-white">
              {item.title ?? item.sourceUrl ?? "Untitled"}
            </h1>
            {(item.author || item.sourceCreatedAt) && (
              <p className="mt-4 text-[15px] text-[#999999]">
                {item.author && <>by {item.author}</>}
                {item.author && item.sourceCreatedAt && <> · </>}
                {item.sourceCreatedAt && (
                  <>{formatRelativeTime(item.sourceCreatedAt)}</>
                )}
              </p>
            )}
            {item.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className={`${mono} rounded-[999px] border border-[#333333] px-2.5 py-0.5 text-[#999999]`}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </header>

          {hasContent ? (
            <MarkdownArticle markdown={markdown} />
          ) : (
            <p className={`${mono} text-[#666666]`}>
              [NO ARTICLE CONTENT EXTRACTED]
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
