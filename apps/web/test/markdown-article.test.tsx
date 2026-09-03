import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MarkdownArticle } from "@/features/reader/components/MarkdownArticle";

describe("in-page anchors", () => {
  test("a table-of-contents link reaches the heading it names", () => {
    // Shaped like the archived rentry page that turned up the bug: the ToC
    // entry is a bare fragment, and the heading carries the permalink anchor
    // that is the only record of its id.
    const { container } = render(
      <MarkdownArticle
        markdown={[
          "1. [🐐 Internet Archive](#internet-archive)",
          "",
          '### 🐐 Internet Archive[](#internet-archive "Permanent link")',
        ].join("\n")}
      />,
    );

    const link = container.querySelector('a[href="#internet-archive"]');
    expect(link).not.toBeNull();
    // The target has to exist, or the click does nothing.
    expect(container.querySelector("#internet-archive")?.tagName).toBe("H3");
  });

  test("a same-document link does not open a new tab", () => {
    // It did, which reloaded the app at a URL differing only by its hash.
    const { container } = render(
      <MarkdownArticle markdown="[Contents](#contents)" />,
    );

    const link = container.querySelector('a[href="#contents"]');
    expect(link?.getAttribute("target")).toBeNull();
    expect(link?.getAttribute("rel")).toBeNull();
  });

  test("an outbound link still opens in a new tab", () => {
    const { container } = render(
      <MarkdownArticle markdown="[Elsewhere](https://example.com/post)" />,
    );

    const link = container.querySelector('a[href="https://example.com/post"]');
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
  });

  test("a heading with no permalink gets no id", () => {
    const { container } = render(
      <MarkdownArticle markdown="## Plain heading" />,
    );

    expect(container.querySelector("h2")?.id).toBe("");
  });

  test("a heading does not adopt a real link as its own id", () => {
    // "See the appendix" is a link the author wrote, not a permalink; taking
    // its target would make the heading answer to the wrong anchor.
    const { container } = render(
      <MarkdownArticle markdown="## See [the appendix](#appendix)" />,
    );

    expect(container.querySelector("h2")?.id).toBe("");
  });

  test("a glyph permalink counts, since some renderers use ¶", () => {
    const { container } = render(
      <MarkdownArticle markdown="## Setup[¶](#setup)" />,
    );

    expect(container.querySelector("h2")?.id).toBe("setup");
  });
});
