"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabaseAccessToken } from "@/lib/supabase/client";
import { getApiOrigin } from "@/lib/trpc/client";
import { CompactMarkdown } from "./CompactMarkdown";

const SUGGESTIONS = [
  "Summarise this in five bullets",
  "What's the main argument?",
  "What does this assume without arguing for it?",
];

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function ArticleChat({ itemId }: { itemId: number }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${getApiOrigin()}/chat`,
        // Resolved per request rather than once at mount, so a token that
        // refreshes mid-session doesn't strand the panel on a stale one.
        prepareSendMessagesRequest: async ({ messages }) => {
          const accessToken = await getBrowserSupabaseAccessToken();
          const headers: Record<string, string> = {};
          if (accessToken) {
            headers.authorization = `Bearer ${accessToken}`;
          }
          return { body: { itemId, messages }, headers };
        },
      }),
    [itemId],
  );

  // Keying the chat by item throws away the conversation when the reader
  // navigates to a different article — answers about the old one would be
  // misleading next to new content.
  const { messages, sendMessage, status, error, stop } = useChat({
    id: `article-${itemId}`,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  // Grows with every token that streams in, which is what keeps the newest
  // text in view without needing an effect on the whole message array.
  const transcriptLength = messages.reduce(
    (total, message) => total + messageText(message).length,
    0,
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || transcriptLength === 0) return;
    node.scrollTop = node.scrollHeight;
  }, [transcriptLength]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    void sendMessage({ text: trimmed });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "1fr auto",
        height: "100%",
        minHeight: 0,
        background: "var(--bg-alt)",
      }}
    >
      <div ref={scrollRef} style={{ overflow: "auto", padding: "16px 20px" }}>
        {messages.length === 0 && (
          <div style={{ paddingTop: 4 }}>
            <p
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--ink-3)",
                margin: "0 0 16px",
              }}
            >
              Ask about this article. The model reads the archived copy — and
              its comments, when there are any.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  style={{
                    fontFamily: "var(--mono-font)",
                    fontSize: 11,
                    textAlign: "left",
                    color: "var(--ink-2)",
                    border: "1px solid var(--rule-soft)",
                    background: "transparent",
                    padding: "7px 10px",
                    cursor: "pointer",
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {status === "submitted" && (
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            [THINKING…]
          </div>
        )}

        {error && (
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--accent)",
              border: "1px solid var(--accent)",
              padding: "8px 10px",
              marginTop: 8,
              overflowWrap: "anywhere",
            }}
          >
            [ERROR: {error.message}]
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        style={{
          borderTop: "1px solid var(--rule)",
          padding: "12px 16px",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: "var(--bg-alt)",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
            // First Escape just leaves the input; a second one reaches the
            // page handler and exits the reader.
            if (e.key === "Escape") {
              e.currentTarget.blur();
            }
            // Typing must not reach the reader's window-level shortcuts.
            e.stopPropagation();
          }}
          rows={2}
          placeholder="Ask a question…"
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "var(--mono-font)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--ink)",
            background: "var(--bg)",
            border: "1px solid var(--rule-soft)",
            padding: "8px 10px",
            outline: "none",
          }}
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? () => stop() : undefined}
          disabled={!busy && input.trim().length === 0}
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: busy ? "var(--accent)" : "var(--ink-2)",
            border: "1px solid var(--rule)",
            background: "transparent",
            padding: "8px 12px",
            cursor: "pointer",
            opacity: !busy && input.trim().length === 0 ? 0.4 : 1,
          }}
        >
          {busy ? "Stop" : "Ask"}
        </button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = messageText(message);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isUser ? "var(--ink-3)" : "var(--accent)",
          marginBottom: 6,
        }}
      >
        {isUser ? "You" : "Nabit"}
      </div>
      <div
        style={{
          fontFamily: "var(--read-font)",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-2)",
          borderLeft: isUser ? "2px solid var(--rule-soft)" : "none",
          paddingLeft: isUser ? 10 : 0,
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
        ) : text.length > 0 ? (
          <CompactMarkdown markdown={text} />
        ) : null}
      </div>
    </div>
  );
}
