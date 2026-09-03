"use client";

import { Icon } from "@/features/shared/components/Icon";
import {
  type CrawlPage,
  isReadable,
  pageLabel,
  type SiteTreeNode,
} from "../utils/tree";

type SiteTreeProps = {
  nodes: SiteTreeNode[];
  selectedId: number | null;
  onSelect: (page: CrawlPage) => void;
  isExpanded: (id: number) => boolean;
  onToggle: (id: number) => void;
};

// Colour carries the page's state at a glance, so a half-finished crawl reads
// as "still working" rather than "broken".
function statusColor(page: CrawlPage) {
  if (page.status === "failed") return "var(--accent)";
  if (page.status === "skipped") return "var(--ink-4)";
  if (page.status === "done") return "var(--ink-3)";
  return "var(--ink-4)";
}

function statusHint(page: CrawlPage) {
  if (page.status === "failed") return page.errorMessage ?? "Failed";
  if (page.status === "skipped") return page.errorMessage ?? "Skipped";
  if (page.status === "done") return page.url;
  return "Waiting to be archived";
}

export function SiteTree(props: SiteTreeProps) {
  return (
    <div style={{ padding: "8px 0" }}>
      {props.nodes.map((node) => (
        <TreeRow key={node.id} node={node} level={0} {...props} />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  level,
  ...props
}: SiteTreeProps & { node: SiteTreeNode; level: number }) {
  const hasChildren = node.children.length > 0;
  const isOpen = props.isExpanded(node.id);
  const isSelected = props.selectedId === node.id;
  const readable = isReadable(node);

  return (
    <>
      <div
        style={{
          alignItems: "center",
          background: isSelected ? "var(--bg-alt)" : "transparent",
          borderLeft: isSelected
            ? "2px solid var(--accent)"
            : "2px solid transparent",
          display: "flex",
          gap: 4,
          paddingLeft: 8 + level * 14,
          paddingRight: 8,
        }}
      >
        <button
          aria-label={isOpen ? "Collapse" : "Expand"}
          onClick={() => props.onToggle(node.id)}
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            cursor: hasChildren ? "pointer" : "default",
            display: "flex",
            padding: 2,
            visibility: hasChildren ? "visible" : "hidden",
          }}
          type="button"
        >
          <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={12} />
        </button>

        <button
          disabled={!readable}
          onClick={() => props.onSelect(node)}
          title={statusHint(node)}
          style={{
            background: "none",
            border: "none",
            color: readable ? "var(--ink)" : statusColor(node),
            cursor: readable ? "pointer" : "default",
            flex: 1,
            fontFamily: "var(--ui-font)",
            fontSize: 13,
            fontWeight: isSelected ? 600 : 400,
            overflow: "hidden",
            padding: "5px 0",
            textAlign: "left",
            textDecoration: node.status === "skipped" ? "line-through" : "none",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          type="button"
        >
          {pageLabel(node)}
        </button>

        {node.isExternal && (
          // Worth flagging: an external page is one hop off the site and was
          // never expanded, so its own links are absent by design.
          <span
            title="Linked from outside this site — archived, not crawled further"
            style={{ color: "var(--ink-4)", display: "flex" }}
          >
            <Icon name="external" size={11} />
          </span>
        )}
      </div>

      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <TreeRow key={child.id} node={child} level={level + 1} {...props} />
        ))}
    </>
  );
}
