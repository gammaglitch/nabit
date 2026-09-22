import { describe, expect, test } from "vitest";
import {
  collectPassages,
  rangeForQuote,
} from "@/features/reader/utils/find-passages";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("collectPassages", () => {
  test("takes the innermost blocks, in reading order", () => {
    const root = mount(`
      <h2>Title</h2>
      <blockquote><p>First quoted.</p><p>Second quoted.</p></blockquote>
      <ul><li>One</li><li>Two</li></ul>
      <div data-find-passage>Original   post
        text</div>
      <div>Chrome that is not a passage</div>
      <p>   </p>
    `);

    expect(collectPassages(root).map((passage) => passage.text)).toEqual([
      "Title",
      "First quoted.",
      "Second quoted.",
      "One",
      "Two",
      "Original post text",
    ]);
  });
});

describe("rangeForQuote", () => {
  test("matches across inline elements, ignoring case and whitespace", () => {
    const root = mount(
      "<p>Here is a paragraph with <strong>bold</strong>\n  text and a <a>link</a>.</p>",
    );
    const paragraph = root.querySelector("p") as HTMLElement;

    expect(rangeForQuote(paragraph, "WITH BOLD text")?.toString()).toBe(
      "with bold\n  text",
    );
    expect(rangeForQuote(paragraph, "a link.")?.toString()).toBe("a link.");
  });

  test("returns null for text that is not in the passage", () => {
    const root = mount("<p>Nothing to see.</p>");
    const paragraph = root.querySelector("p") as HTMLElement;

    expect(rangeForQuote(paragraph, "something else")).toBeNull();
    expect(rangeForQuote(paragraph, "   ")).toBeNull();
  });
});
