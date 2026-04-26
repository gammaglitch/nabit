"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import { useStarred } from "@/features/shared/hooks/useStarred";
import { trpc } from "@/lib/trpc/react";
import { CaptureModal } from "../components/CaptureModal";
import { CompactRow } from "../components/CompactRow";
import { LibrarySidebar } from "../components/LibrarySidebar";
import { ListRow } from "../components/ListRow";
import { PreviewPane } from "../components/PreviewPane";
import { QueueStatus } from "../components/QueueStatus";
import { SettingsMenu } from "../components/SettingsMenu";
import { SplitRow } from "../components/SplitRow";
import { TagPicker, type TagPickerAnchor } from "../components/TagPicker";
import { useTagOperations } from "../hooks/useTagOperations";
import {
  type DisplayItem,
  highlight,
  toDisplayItem,
} from "../utils/item-helpers";

type Layout = "list" | "split" | "compact";
type SortMode = "recent" | "oldest" | "title";

export default function ItemsPage() {
  const router = useRouter();
  const { isStarred, toggleStarred } = useStarred();
  const { addTag, removeTag } = useTagOperations();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<"all" | "starred">("all");
  const [activeSource, setActiveSource] = useState<
    "all" | "article" | "hn" | "reddit" | "x"
  >("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [layout, setLayout] = useState<Layout>("list");
  const [collapsed, setCollapsed] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [tagPicker, setTagPicker] = useState<{
    itemId: number;
    anchor: TagPickerAnchor;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("nabit.layout");
    if (raw === "list" || raw === "split" || raw === "compact") {
      setLayout(raw);
    }
    setCollapsed(window.localStorage.getItem("nabit.sidebarCollapsed") === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("nabit.layout", layout);
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(
      "nabit.sidebarCollapsed",
      collapsed ? "1" : "0",
    );
  }, [collapsed]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCaptureOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "\\" || e.key === ".")) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const listQuery = trpc.ingest.list.useQuery({
    sourceType: undefined,
    tagIds: undefined,
    search: debouncedQuery || undefined,
  });
  const tagsQuery = trpc.tags.list.useQuery();

  const rawItems = listQuery.data?.items ?? [];

  // Hide auto-fetched child items (articles attached to an HN/Reddit thread).
  // The primary thread item is what the user explicitly archived; the child
  // article is rendered inside that thread's reader view.
  const primaryItems = useMemo(
    () => rawItems.filter((i) => i.subjectItemId === null),
    [rawItems],
  );

  const allTagsObjects = tagsQuery.data?.tags ?? [];

  const displayItems = useMemo(
    () => primaryItems.map(toDisplayItem),
    [primaryItems],
  );

  const filtered = useMemo(() => {
    let out = displayItems;
    if (activeFolder === "starred") out = out.filter((i) => isStarred(i.id));
    if (activeSource !== "all")
      out = out.filter((i) => i.source === activeSource);
    if (activeTag)
      out = out.filter((i) => i.tags.some((t) => t.name === activeTag));
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      out = out.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.excerpt.toLowerCase().includes(q) ||
          (i.author?.toLowerCase().includes(q) ?? false) ||
          i.domain.toLowerCase().includes(q) ||
          i.tags.some((t) => t.name.toLowerCase().includes(q)),
      );
    }
    if (sort === "recent") out = [...out].sort((a, b) => b.savedAt - a.savedAt);
    if (sort === "oldest") out = [...out].sort((a, b) => a.savedAt - b.savedAt);
    if (sort === "title")
      out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }, [
    displayItems,
    activeFolder,
    activeSource,
    activeTag,
    debouncedQuery,
    sort,
    isStarred,
  ]);

  const counts = useMemo(
    () => ({
      all: displayItems.length,
      starred: displayItems.filter((i) => isStarred(i.id)).length,
      article: displayItems.filter((i) => i.source === "article").length,
      hn: displayItems.filter((i) => i.source === "hn").length,
      reddit: displayItems.filter((i) => i.source === "reddit").length,
      x: displayItems.filter((i) => i.source === "x").length,
    }),
    [displayItems, isStarred],
  );

  const sidebarTagList = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of displayItems) {
      for (const t of i.tags) {
        map.set(t.name, (map.get(t.name) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [displayItems]);

  const selectedPreviewItem: DisplayItem | null = useMemo(() => {
    if (layout !== "split") return null;
    return filtered.find((i) => i.id === previewId) ?? filtered[0] ?? null;
  }, [layout, filtered, previewId]);

  const previewDetailQuery = trpc.ingest.get.useQuery(
    { id: selectedPreviewItem?.id ?? 0 },
    { enabled: selectedPreviewItem !== null && layout === "split" },
  );

  // Arrow-key navigation in split mode
  useEffect(() => {
    if (layout !== "split") return;
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter")
        return;
      const currentId = selectedPreviewItem?.id ?? null;
      const current = filtered.findIndex((i) => i.id === currentId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next =
          current < 0 ? 0 : Math.min(current + 1, filtered.length - 1);
        setPreviewId(filtered[next]?.id ?? null);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = current <= 0 ? 0 : current - 1;
        setPreviewId(filtered[prev]?.id ?? null);
      }
      if (e.key === "Enter" && currentId !== null) {
        e.preventDefault();
        router.push(`/read/${currentId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, filtered, selectedPreviewItem, router]);

  const onOpen = useCallback(
    (item: DisplayItem) => router.push(`/read/${item.id}`),
    [router],
  );

  const onAddTagToItem = useCallback(
    (itemId: number, name: string) => {
      void addTag(itemId, name, allTagsObjects);
    },
    [addTag, allTagsObjects],
  );

  const onRemoveTagFromItem = useCallback(
    (itemId: number, tagId: number) => {
      void removeTag(itemId, tagId);
    },
    [removeTag],
  );

  const renderTitle = useCallback(
    (title: string) => highlight(title, debouncedQuery),
    [debouncedQuery],
  );

  const tagPickerItem = tagPicker
    ? displayItems.find((i) => i.id === tagPicker.itemId)
    : null;

  return (
    <div
      style={{
        display: "grid",
        height: "100%",
        background: "var(--bg)",
        gridTemplateColumns: collapsed ? "44px 1fr" : "220px 1fr",
        transition: "grid-template-columns 180ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <LibrarySidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        counts={counts}
        activeFolder={activeFolder}
        setActiveFolder={setActiveFolder}
        activeSource={activeSource}
        setActiveSource={(s) => {
          setActiveSource(s);
          // reset incompatible source filters
          if (s !== "all" && activeTag) {
            // keep tag — compatible
          }
        }}
        activeTag={activeTag}
        setActiveTag={setActiveTag}
        allTags={sidebarTagList}
      />

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid var(--rule)",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "var(--bg)",
          }}
        >
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your hoard — title, author, tag, domain…"
            style={{
              flex: 1,
              fontFamily: "var(--ui-font)",
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
              border: 0,
              background: "transparent",
              outline: "none",
            }}
          />
          <span
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              padding: "2px 6px",
              border: "1px solid var(--rule)",
              color: "var(--ink-3)",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            ⌘ K nab
          </span>
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            style={{
              padding: "8px 14px",
              border: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--bg)",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="plus" size={12} stroke={2.5} /> Nab
          </button>
          <SettingsMenu />
        </div>

        <div
          style={{
            borderBottom: "1px solid var(--rule)",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 12,
            fontFamily: "var(--mono-font)",
            color: "var(--ink-3)",
            background: "var(--bg-alt)",
          }}
        >
          <div
            style={{ display: "flex", gap: 16, alignItems: "center", flex: 1 }}
          >
            <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>
              {filtered.length.toString().padStart(3, "0")}
            </span>
            <span>
              {filtered.length === 1 ? "shiny thing" : "shiny things"}
              {activeFolder !== "all" && ` in ${activeFolder}`}
              {activeSource !== "all" && ` from ${activeSource}`}
              {activeTag && (
                <>
                  {" "}
                  tagged{" "}
                  <span
                    style={{
                      background: "var(--ink)",
                      color: "var(--bg)",
                      padding: "1px 5px",
                    }}
                  >
                    #{activeTag}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTag(null)}
                    style={{
                      marginLeft: 6,
                      color: "var(--ink-3)",
                      fontSize: 11,
                      background: "transparent",
                      border: 0,
                    }}
                  >
                    [clear]
                  </button>
                </>
              )}
              {debouncedQuery && (
                <>
                  {" "}
                  matching &quot;
                  <span style={{ color: "var(--ink)" }}>{debouncedQuery}</span>
                  &quot;
                </>
              )}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 0,
              border: "1px solid var(--rule)",
            }}
          >
            {(
              [
                { id: "list", label: "LIST", title: "Default list" },
                { id: "split", label: "SPLIT", title: "List + preview" },
                { id: "compact", label: "DENSE", title: "One-line rows" },
              ] as const
            ).map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => {
                  setLayout(opt.id);
                  if (opt.id === "split" && !previewId && filtered[0])
                    setPreviewId(filtered[0].id);
                }}
                title={opt.title}
                style={{
                  padding: "4px 10px",
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  background: layout === opt.id ? "var(--ink)" : "transparent",
                  color: layout === opt.id ? "var(--bg)" : "var(--ink-2)",
                  lineHeight: 1,
                  borderRight: "1px solid var(--rule)",
                  border: 0,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["recent", "oldest", "title"] as const).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSort(s)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  border: "1px solid var(--rule)",
                  fontSize: 11,
                  background: sort === s ? "var(--ink)" : "var(--bg)",
                  color: sort === s ? "var(--bg)" : "var(--ink-2)",
                  lineHeight: 1,
                  fontFamily: "var(--mono-font)",
                  borderColor: sort === s ? "var(--ink)" : "var(--rule)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {listQuery.isLoading && (
          <div
            style={{
              padding: "80px 24px",
              textAlign: "center",
              color: "var(--ink-3)",
              fontFamily: "var(--mono-font)",
              fontSize: 13,
            }}
          >
            Loading your hoard…
          </div>
        )}

        {listQuery.error && (
          <div
            style={{
              padding: "80px 24px",
              textAlign: "center",
              color: "var(--accent)",
              fontFamily: "var(--mono-font)",
              fontSize: 13,
            }}
          >
            [ERROR: {listQuery.error.message}]
          </div>
        )}

        {listQuery.data && layout === "list" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "36px 52px 1fr 200px 90px",
                padding: "10px 24px",
                borderBottom: "1px solid var(--rule)",
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                background: "var(--bg)",
              }}
            >
              <div />
              <div>Src</div>
              <div>Title</div>
              <div>Tags</div>
              <div style={{ textAlign: "right" }}>Nabbed</div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {filtered.length === 0 && <EmptyState />}
              {filtered.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  starred={isStarred(item.id)}
                  onOpen={() => onOpen(item)}
                  onToggleStar={() => toggleStarred(item.id)}
                  onOpenTagPicker={(anchor) =>
                    setTagPicker({ itemId: item.id, anchor })
                  }
                  onRemoveTag={(tagId) => onRemoveTagFromItem(item.id, tagId)}
                  renderTitle={renderTitle}
                />
              ))}
            </div>
          </>
        )}

        {listQuery.data && layout === "compact" && (
          <div style={{ flex: 1, overflow: "auto" }}>
            {filtered.length === 0 && <EmptyState />}
            {filtered.map((item) => (
              <CompactRow
                key={item.id}
                item={item}
                starred={isStarred(item.id)}
                onOpen={() => onOpen(item)}
                onToggleStar={() => toggleStarred(item.id)}
                onRemoveTag={(tagId) => onRemoveTagFromItem(item.id, tagId)}
                renderTitle={renderTitle}
              />
            ))}
          </div>
        )}

        {listQuery.data && layout === "split" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 440px) 1fr",
              flex: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                overflow: "auto",
                borderRight: "1px solid var(--rule)",
              }}
            >
              {filtered.length === 0 && <EmptyState />}
              {filtered.map((item) => (
                <SplitRow
                  key={item.id}
                  item={item}
                  selected={selectedPreviewItem?.id === item.id}
                  starred={isStarred(item.id)}
                  onSelect={() => setPreviewId(item.id)}
                  onOpen={() => onOpen(item)}
                  onToggleStar={() => toggleStarred(item.id)}
                  onOpenTagPicker={(anchor) =>
                    setTagPicker({ itemId: item.id, anchor })
                  }
                  onRemoveTag={(tagId) => onRemoveTagFromItem(item.id, tagId)}
                  renderTitle={renderTitle}
                />
              ))}
            </div>
            <PreviewPane
              item={selectedPreviewItem}
              detail={previewDetailQuery.data?.item ?? null}
              starred={
                selectedPreviewItem ? isStarred(selectedPreviewItem.id) : false
              }
              onOpen={() => selectedPreviewItem && onOpen(selectedPreviewItem)}
              onToggleStar={() =>
                selectedPreviewItem && toggleStarred(selectedPreviewItem.id)
              }
              onOpenTagPicker={(anchor) =>
                selectedPreviewItem &&
                setTagPicker({ itemId: selectedPreviewItem.id, anchor })
              }
              onRemoveTag={(tagId) =>
                selectedPreviewItem &&
                onRemoveTagFromItem(selectedPreviewItem.id, tagId)
              }
            />
          </div>
        )}
      </main>

      {tagPicker && tagPickerItem && (
        <TagPicker
          item={tagPickerItem}
          allTags={allTagsObjects}
          onAddTag={(id, name) => onAddTagToItem(id, name)}
          onRemoveTag={(id, tagId) => onRemoveTagFromItem(id, tagId)}
          onClose={() => setTagPicker(null)}
          anchor={tagPicker.anchor}
        />
      )}

      <CaptureModal open={captureOpen} onOpenChange={setCaptureOpen} />

      <QueueStatus
        hidden={captureOpen}
        onOpenCapture={() => setCaptureOpen(true)}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "80px 24px",
        textAlign: "center",
        color: "var(--ink-3)",
        fontFamily: "var(--mono-font)",
        fontSize: 13,
      }}
    >
      ∅ Nothing in your hoard matches that.
      <br />
      <br />
      <span style={{ color: "var(--ink-4)" }}>
        Magpies wait. Try different words.
      </span>
    </div>
  );
}
