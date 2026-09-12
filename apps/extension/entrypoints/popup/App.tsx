import { useEffect, useState } from "react";
import type { Browser } from "wxt/browser";
import { bookmarksToItems, tabsToItems } from "@/lib/api";
import {
  getApiToken,
  getApiUrl,
  parseApiUrl,
  requestHostPermission,
  setApiToken,
  setApiUrl,
} from "@/lib/config";
import { sendIngestMessage } from "@/lib/messages";

type Tab = Browser.tabs.Tab;
type Bookmark = Browser.bookmarks.BookmarkTreeNode;
type View = "tabs" | "bookmarks";
type Status = { message: string; error: boolean } | null;

/**
 * The API only ingests http(s), so this also drops the internal pages each
 * browser names differently — chrome://, about:, moz-extension://.
 */
function isIngestableUrl(url: string | undefined): boolean {
  return url !== undefined && /^https?:\/\//.test(url);
}

export default function App() {
  const [view, setView] = useState<View>("tabs");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>(null);
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    if (view === "tabs") {
      browser.tabs.query({}).then((result) => {
        setTabs(result.filter((t) => isIngestableUrl(t.url)));
      });
    } else {
      browser.bookmarks.getRecent(50).then((result) => {
        setBookmarks(result.filter((b) => isIngestableUrl(b.url)));
      });
    }
    setSelected(new Set());
    setStatus(null);
  }, [view]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const ids =
      view === "tabs"
        ? tabs.map((t) => String(t.id))
        : bookmarks.map((b) => b.id);
    setSelected(selected.size === ids.length ? new Set() : new Set(ids));
  }

  async function send() {
    if (selected.size === 0) return;
    setSending(true);
    setStatus(null);

    const items =
      view === "tabs"
        ? tabsToItems(tabs.filter((t) => selected.has(String(t.id))))
        : bookmarksToItems(bookmarks.filter((b) => selected.has(b.id)));

    try {
      const reply = await sendIngestMessage(items);

      if (!reply.ok) {
        setStatus({ message: reply.error, error: true });
        return;
      }

      const queued = reply.result.results.filter((r) => !r.reused).length;
      setStatus({
        message: `${queued} queued, ${reply.result.results.length - queued} already in flight`,
        error: false,
      });
      setSelected(new Set());
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Unknown error",
        error: true,
      });
    } finally {
      setSending(false);
    }
  }

  const items = view === "tabs" ? tabs : bookmarks;
  const getId = (item: Tab | Bookmark) =>
    view === "tabs" ? String((item as Tab).id) : (item as Bookmark).id;
  const getTitle = (item: Tab | Bookmark) => item.title ?? item.url ?? "—";
  const getUrl = (item: Tab | Bookmark) =>
    view === "tabs"
      ? ((item as Tab).url ?? "")
      : ((item as Bookmark).url ?? "");

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>NABIT</span>
        <div style={styles.headerRight}>
          <span style={styles.count}>
            {selected.size}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => setConfigOpen((open) => !open)}
            style={styles.configToggle}
          >
            {configOpen ? "CLOSE" : "CONFIG"}
          </button>
        </div>
      </div>

      {configOpen && <ConfigPanel />}

      {/* View toggle */}
      <div style={styles.segmented}>
        {(["tabs", "bookmarks"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            style={
              view === option ? styles.segmentActive : styles.segmentInactive
            }
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={styles.list}>
        {items.map((item) => {
          const id = getId(item);
          const checked = selected.has(id);
          return (
            <label key={id} style={styles.row}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(id)}
                style={styles.checkbox}
              />
              <div style={styles.rowText}>
                <div style={styles.rowTitle}>{getTitle(item)}</div>
                <div style={styles.rowUrl}>{getUrl(item)}</div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Status */}
      {status && (
        <div
          style={{
            ...styles.status,
            color: status.error ? "#D71921" : "#4A9E5C",
          }}
        >
          [{status.error ? "ERROR" : "OK"}] {status.message}
        </div>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        <button type="button" onClick={selectAll} style={styles.btnGhost}>
          {selected.size === items.length ? "DESELECT ALL" : "SELECT ALL"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={selected.size === 0 || sending}
          style={{
            ...styles.btnPrimary,
            opacity: selected.size === 0 || sending ? 0.4 : 1,
          }}
        >
          {sending ? "SENDING..." : `SEND ${selected.size}`}
        </button>
      </div>
    </div>
  );
}

function ConfigPanel() {
  const [apiUrl, setUrlField] = useState("");
  const [token, setTokenField] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getApiUrl(), getApiToken()]).then(([url, savedToken]) => {
      setUrlField(url);
      setTokenField(savedToken);
    });
  }, []);

  async function save() {
    const parsed = parseApiUrl(apiUrl);

    if (!parsed) {
      setStatus({ message: "Not a valid http(s) URL", error: true });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      // First await in the handler, so the click still counts as the user
      // gesture Chrome requires. No-ops when the origin is already granted.
      const granted = await requestHostPermission(parsed);

      if (!granted) {
        setStatus({
          message: `Host permission denied for ${parsed.origin}`,
          error: true,
        });
        return;
      }

      await setApiUrl(apiUrl);
      await setApiToken(token);
      setStatus({ message: "Saved", error: false });
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Unknown error",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.panel}>
      <label style={styles.field}>
        <span style={styles.fieldLabel}>API URL</span>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setUrlField(e.target.value)}
          placeholder="https://api.example.com"
          style={styles.input}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>API TOKEN</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setTokenField(e.target.value)}
          placeholder="API_TOKEN from the server"
          style={styles.input}
        />
      </label>

      {status && (
        <div
          style={{
            ...styles.status,
            padding: "4px 0",
            color: status.error ? "#D71921" : "#4A9E5C",
          }}
        >
          [{status.error ? "ERROR" : "OK"}] {status.message}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{ ...styles.btnPrimary, opacity: saving ? 0.4 : 1 }}
      >
        {saving ? "SAVING..." : "SAVE"}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 360,
    maxHeight: 520,
    display: "flex",
    flexDirection: "column",
    background: "#000",
    color: "#E8E8E8",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    fontSize: 14,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
  },
  title: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.08em",
    color: "#999",
  },
  count: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.04em",
    color: "#666",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  configToggle: {
    background: "transparent",
    border: "1px solid #333",
    borderRadius: 999,
    color: "#999",
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.06em",
    cursor: "pointer",
    padding: "4px 10px",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "8px 16px 12px",
    borderBottom: "1px solid #222",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fieldLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "#666",
  },
  input: {
    background: "#111",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#E8E8E8",
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    padding: "8px 10px",
    outline: "none",
  },
  segmented: {
    display: "flex",
    margin: "0 16px 8px",
    border: "1px solid #333",
    borderRadius: 8,
    overflow: "hidden",
  },
  segmentActive: {
    flex: 1,
    padding: "8px 0",
    background: "#FFF",
    color: "#000",
    border: "none",
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
  },
  segmentInactive: {
    flex: 1,
    padding: "8px 0",
    background: "transparent",
    color: "#999",
    border: "none",
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "0 16px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 0",
    borderBottom: "1px solid #222",
    cursor: "pointer",
  },
  checkbox: {
    marginTop: 3,
    accentColor: "#FFF",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 1.4,
    color: "#E8E8E8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  rowUrl: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    color: "#666",
    letterSpacing: "0.02em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  status: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.04em",
    padding: "8px 16px",
  },
  actions: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
  },
  btnGhost: {
    background: "transparent",
    border: "none",
    color: "#999",
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    padding: "8px 12px",
  },
  btnPrimary: {
    flex: 1,
    background: "#FFF",
    color: "#000",
    border: "none",
    borderRadius: 999,
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    padding: "10px 24px",
  },
};
