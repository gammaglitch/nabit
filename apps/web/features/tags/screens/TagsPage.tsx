"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/react";

type Tag = {
  description: string | null;
  id: number;
  itemCount: number;
  name: string;
};

const monoStyle: CSSProperties = {
  color: "var(--ink-2)",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
};

const fieldStyle: CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--rule)",
  color: "var(--ink)",
  fontFamily: "var(--mono-font)",
  fontSize: 12,
  outline: "none",
  padding: "6px 8px",
  width: "100%",
};

const buttonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--ink-2)",
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.08em",
  lineHeight: 1,
  padding: "7px 12px",
  textTransform: "uppercase",
};

/**
 * The one place tags exist as things rather than as labels on an item.
 *
 * Descriptions matter beyond bookkeeping: they are what Jev judges an article
 * against when suggesting or bulk-applying a tag, so "rust" can say whether it
 * means the language or the corrosion.
 */
export default function TagsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const tagsQuery = trpc.tags.list.useQuery();

  const invalidate = () => {
    void utils.tags.list.invalidate();
    // Item rows carry their tags, so a rename shows there too.
    void utils.ingest.list.invalidate();
    void utils.ingest.get.invalidate();
  };

  const createTag = trpc.tags.create.useMutation({ onSuccess: invalidate });
  const updateTag = trpc.tags.update.useMutation({ onSuccess: invalidate });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const tags = tagsQuery.data?.tags ?? [];
  const error = createTag.error?.message ?? updateTag.error?.message ?? null;

  return (
    <div
      style={{
        background: "var(--bg)",
        height: "100%",
        overflow: "auto",
      }}
    >
      <div
        style={{ margin: "0 auto", maxWidth: 760, padding: "40px 32px 80px" }}
      >
        <button
          type="button"
          onClick={() => router.push("/items")}
          style={{ ...buttonStyle, marginBottom: 24 }}
        >
          ← Hoard
        </button>

        <h1
          style={{
            color: "var(--ink)",
            fontFamily: "var(--read-font)",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Tags
        </h1>
        <p style={{ ...monoStyle, color: "var(--ink-3)", marginBottom: 28 }}>
          A description says what belongs under a tag. Suggested and
          auto-applied tags are judged against it, so it is worth a line.
          Editing one only changes what happens next — items keep the tags they
          already carry.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            createTag.mutate({
              description: description.trim() || null,
              name: trimmed,
            });
            setName("");
            setDescription("");
          }}
          style={{
            border: "1px solid var(--rule)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 32,
            padding: 16,
          }}
        >
          <div style={{ ...monoStyle, color: "var(--ink-3)" }}>New tag</div>
          <input
            aria-label="Tag name"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="name"
            style={fieldStyle}
            value={name}
          />
          <input
            aria-label="Tag description"
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="what goes under this tag"
            style={fieldStyle}
            value={description}
          />
          <div>
            <button
              disabled={name.trim().length === 0 || createTag.isPending}
              style={{
                ...buttonStyle,
                opacity: name.trim().length === 0 ? 0.4 : 1,
              }}
              type="submit"
            >
              {createTag.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>

        {error && (
          <div
            style={{ ...monoStyle, color: "var(--accent)", marginBottom: 16 }}
          >
            {error}
          </div>
        )}

        {tagsQuery.isLoading && <div style={monoStyle}>[LOADING…]</div>}
        {!tagsQuery.isLoading && tags.length === 0 && (
          <div style={{ ...monoStyle, color: "var(--ink-3)" }}>
            No tags yet. The first one goes above.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              onSave={(changes) => updateTag.mutate({ id: tag.id, ...changes })}
              pending={
                updateTag.isPending && updateTag.variables?.id === tag.id
              }
              tag={tag}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TagRow({
  onSave,
  pending,
  tag,
}: {
  onSave: (changes: { description?: string | null; name?: string }) => void;
  pending: boolean;
  tag: Tag;
}) {
  const [name, setName] = useState(tag.name);
  const [description, setDescription] = useState(tag.description ?? "");

  // Re-seed once the server answers, so a rejected rename snaps back to what
  // the tag is actually called rather than leaving the typed name on screen.
  useEffect(() => {
    setName(tag.name);
    setDescription(tag.description ?? "");
  }, [tag.name, tag.description]);

  const dirty =
    name.trim() !== tag.name || description.trim() !== (tag.description ?? "");

  return (
    <div
      style={{
        borderTop: "1px solid var(--rule-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 0",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
        <span style={{ ...monoStyle, color: "var(--ink-4)" }}>#</span>
        <input
          aria-label={`Name of #${tag.name}`}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          style={{ ...fieldStyle, flex: 1 }}
          value={name}
        />
        <span
          style={{ ...monoStyle, color: "var(--ink-3)", whiteSpace: "nowrap" }}
        >
          {tag.itemCount} item{tag.itemCount === 1 ? "" : "s"}
        </span>
      </div>
      <input
        aria-label={`Description of #${tag.name}`}
        maxLength={500}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="what goes under this tag"
        style={fieldStyle}
        value={description}
      />
      {dirty && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={pending}
            onClick={() =>
              onSave({
                description: description.trim() || null,
                name: name.trim(),
              })
            }
            style={buttonStyle}
            type="button"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setName(tag.name);
              setDescription(tag.description ?? "");
            }}
            style={{ ...buttonStyle, border: "1px solid transparent" }}
            type="button"
          >
            Revert
          </button>
        </div>
      )}
    </div>
  );
}
