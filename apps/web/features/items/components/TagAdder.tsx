"use client";

import { useEffect, useRef, useState } from "react";
import { mono } from "@/features/shared/utils/format";
import { trpc } from "@/lib/trpc/react";

export function TagAdder({
  allTags,
  itemTags,
  itemId,
}: {
  allTags: Array<{ id: number; name: string }>;
  itemTags: Array<{ id: number; name: string }>;
  itemId: number;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const addTagMutation = trpc.tags.addToItem.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.ingest.get.invalidate(),
      ]);
    },
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: async (created) => {
      await utils.tags.list.invalidate();
      addTagMutation.mutate({ itemId, tagId: created.id });
    },
  });

  const itemTagIds = new Set(itemTags.map((t) => t.id));
  const available = allTags.filter((t) => !itemTagIds.has(t.id));
  const filtered = text.trim()
    ? available.filter((t) => t.name.includes(text.trim().toLowerCase()))
    : available;
  const exactMatch = allTags.some((t) => t.name === text.trim().toLowerCase());
  const showCreate = text.trim().length > 0 && !exactMatch;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        className={`${mono} h-[36px] w-full border-b border-[#333333] bg-transparent px-0 text-[#E8E8E8] outline-none transition-colors duration-200 placeholder:text-[#666666] focus:border-[#E8E8E8]`}
        placeholder="ADD TAG..."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            e.preventDefault();
            if (showCreate) {
              createTagMutation.mutate({ name: text.trim() });
            } else if (filtered.length > 0) {
              addTagMutation.mutate({ itemId, tagId: filtered[0].id });
            }
            setText("");
            setOpen(false);
          }
        }}
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-[200px] w-full overflow-y-auto rounded-[8px] border border-[#1A1A1A] bg-[#111111]">
          {filtered.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`${mono} block w-full px-3 py-2 text-left text-[#999999] transition-colors duration-200 hover:bg-[#1A1A1A] hover:text-[#E8E8E8]`}
              onClick={() => {
                addTagMutation.mutate({ itemId, tagId: tag.id });
                setText("");
                setOpen(false);
              }}
            >
              {tag.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              className={`${mono} block w-full px-3 py-2 text-left text-[#5B9BF6] transition-colors duration-200 hover:bg-[#1A1A1A]`}
              onClick={() => {
                createTagMutation.mutate({ name: text.trim() });
                setText("");
                setOpen(false);
              }}
            >
              CREATE &ldquo;{text.trim().toLowerCase()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
