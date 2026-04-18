import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mb-4 mt-8 break-words text-[34px] font-bold leading-[1.2] text-white"
      {...props}
    />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="mb-3 mt-8 break-words text-[26px] font-bold leading-[1.25] text-white"
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3
      className="mb-3 mt-6 break-words text-[20px] font-semibold leading-[1.3] text-white"
      {...props}
    />
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4
      className="mb-2 mt-6 break-words text-[18px] font-semibold leading-[1.3] text-white"
      {...props}
    />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p
      className="mb-5 break-words text-[17px] leading-[1.7] text-[#E8E8E8]"
      {...props}
    />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a
      className="text-[#5B9BF6] underline decoration-[#5B9BF6]/40 underline-offset-2 transition-colors duration-200 hover:text-[#E8E8E8] hover:decoration-[#E8E8E8]"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="mb-5 list-disc space-y-2 pl-6 text-[17px] leading-[1.7] text-[#E8E8E8]"
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="mb-5 list-decimal space-y-2 pl-6 text-[17px] leading-[1.7] text-[#E8E8E8]"
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-[1.6]" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-5 border-l-2 border-[#333333] pl-4 italic text-[#999999]"
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-8 border-[#1A1A1A]" {...props} />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="my-5 overflow-x-auto rounded-[8px] border border-[#1A1A1A] bg-[#0A0A0A] p-4 text-[14px] leading-[1.6] text-[#E8E8E8]"
      {...props}
    />
  ),
  code: ({
    className,
    children,
    ...props
  }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className={`font-[family-name:var(--font-space-mono)] ${className ?? ""}`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-[4px] border border-[#1A1A1A] bg-[#0A0A0A] px-1.5 py-0.5 font-[family-name:var(--font-space-mono)] text-[14px] text-[#E8E8E8]"
        {...props}
      >
        {children}
      </code>
    );
  },
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-white" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="italic" {...props} />
  ),
  img: ({ alt, ...props }: ComponentPropsWithoutRef<"img">) => (
    // biome-ignore lint/performance/noImgElement: markdown image, not part of next/image flow
    <img
      alt={alt ?? ""}
      className="my-5 max-w-full rounded-[8px] border border-[#1A1A1A]"
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-5 overflow-x-auto">
      <table
        className="w-full border-collapse text-[15px] text-[#E8E8E8]"
        {...props}
      />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="border border-[#1A1A1A] bg-[#111111] px-3 py-2 text-left font-semibold"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border border-[#1A1A1A] px-3 py-2" {...props} />
  ),
};

export function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {markdown}
    </ReactMarkdown>
  );
}
