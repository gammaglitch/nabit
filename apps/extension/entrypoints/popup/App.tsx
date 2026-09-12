import { useEffect, useMemo, useState } from "react";
import type { Browser } from "wxt/browser";
import { bookmarksToItems, hnFavoritesToItems, tabsToItems } from "@/lib/api";
import {
  getApiToken,
  getApiUrl,
  getHnFavoritesCache,
  getHnUsername,
  getImportTag,
  parseApiUrl,
  parseImportTags,
  requestHackerNewsPermission,
  requestHostPermission,
  setApiToken,
  setApiUrl,
  setHnUsername,
  setImportTag,
} from "@/lib/config";
import type { HnFavorite, HnFavoriteKind } from "@/lib/hn-favorites";
import { sendHnFavoritesMessage, sendIngestMessage } from "@/lib/messages";

type Tab = Browser.tabs.Tab;
type Bookmark = Browser.bookmarks.BookmarkTreeNode;
type View = "tabs" | "bookmarks" | "hn";
type Status = { message: string; error: boolean } | null;

/** One selectable line, whichever view produced it. */
interface Row {
  id: string;
  title: string;
  subtitle: string;
}

/**
 * The API only ingests http(s), so this also drops the internal pages each
 * browser names differently — chrome://, about:, moz-extension://.
 */
function isIngestableUrl(url: string | undefined): boolean {
  return url !== undefined && /^https?:\/\//.test(url);
}

function describeAge(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function App() {
  const [view, setView] = useState<View>("tabs");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [favorites, setFavorites] = useState<HnFavorite[]>([]);
  const [hnUsername, setUsernameField] = useState("");
  const [hnKind, setHnKind] = useState<HnFavoriteKind>("submission");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagField, setTagField] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    getImportTag().then(setTagField);
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setStatus(null);

    if (view === "tabs") {
      browser.tabs.query({}).then((result) => {
        setTabs(result.filter((t) => isIngestableUrl(t.url)));
      });
      return;
    }

    if (view === "bookmarks") {
      browser.bookmarks.getRecent(50).then((result) => {
        setBookmarks(result.filter((b) => isIngestableUrl(b.url)));
      });
      return;
    }

    // Restore whatever the last walk produced, so reopening the popup after it
    // closed mid-fetch finds the list rather than an empty pane. The cache
    // carries the kind it was fetched for, so the toggle follows it back.
    let cancelled = false;
    Promise.all([getHnUsername(), getHnFavoritesCache()]).then(
      ([saved, cache]) => {
        if (cancelled) return;
        setUsernameField((current) => current || saved);
        if (cache && cache.username === saved) {
          setHnKind(cache.kind);
          setFavorites(cache.favorites);
          setSelected(new Set(cache.favorites.map((f) => f.id)));
          setFetchedAt(cache.fetchedAt);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [view]);

  const rows: Row[] = useMemo(() => {
    if (view === "tabs") {
      return tabs.map((tab) => ({
        id: String(tab.id),
        subtitle: tab.url ?? "",
        title: tab.title ?? tab.url ?? "—",
      }));
    }

    if (view === "bookmarks") {
      return bookmarks.map((bookmark) => ({
        id: bookmark.id,
        subtitle: bookmark.url ?? "",
        title: bookmark.title ?? bookmark.url ?? "—",
      }));
    }

    return favorites.map((favorite) => ({
      id: favorite.id,
      // The outbound article, or the story a favorited comment sits under —
      // more use than repeating the item URL on every line.
      subtitle: favorite.context ?? favorite.url,
      title: favorite.title,
    }));
  }, [view, tabs, bookmarks, favorites]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const ids = rows.map((row) => row.id);
    setSelected(selected.size === ids.length ? new Set() : new Set(ids));
  }

  function changeKind(kind: HnFavoriteKind) {
    if (kind === hnKind) return;
    setHnKind(kind);
    setFavorites([]);
    setSelected(new Set());
    setFetchedAt(null);
    setStatus(null);
  }

  async function fetchFavorites() {
    const username = hnUsername.trim();

    if (!username) {
      setStatus({ message: "Enter your Hacker News username", error: true });
      return;
    }

    setFetching(true);
    setStatus(null);

    try {
      // First await in the handler, so the click still counts as the user
      // gesture Chrome requires. No-ops once the origin has been granted.
      const granted = await requestHackerNewsPermission();

      if (!granted) {
        setStatus({
          message: "Permission denied for news.ycombinator.com",
          error: true,
        });
        return;
      }

      await setHnUsername(username);
      const reply = await sendHnFavoritesMessage(username, hnKind);

      if (!reply.ok) {
        setStatus({ message: reply.error, error: true });
        return;
      }

      setFavorites(reply.favorites);
      // Bulk import is the point — start with everything ticked and let the
      // user cull. Re-importing is harmless anyway: the API dedupes.
      setSelected(new Set(reply.favorites.map((f) => f.id)));
      setFetchedAt(Date.now());
      setStatus({
        message: reply.favorites.length
          ? `Found ${reply.favorites.length}`
          : `No favorite ${hnKind === "comment" ? "comments" : "submissions"} for ${username}`,
        error: false,
      });
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Unknown error",
        error: true,
      });
    } finally {
      setFetching(false);
    }
  }

  async function send() {
    if (selected.size === 0) return;
    setSending(true);
    setStatus(null);

    let items: ReturnType<typeof tabsToItems>;
    if (view === "tabs") {
      items = tabsToItems(tabs.filter((t) => selected.has(String(t.id))));
    } else if (view === "bookmarks") {
      items = bookmarksToItems(bookmarks.filter((b) => selected.has(b.id)));
    } else {
      items = hnFavoritesToItems(
        favorites.filter((f) => selected.has(f.id)),
        hnUsername.trim(),
      );
    }

    const tags = parseImportTags(tagField);

    try {
      // Remembered so the next bulk import defaults to the same tag rather
      // than silently sending untagged.
      await setImportTag(tagField);
      const reply = await sendIngestMessage(items, tags);

      if (!reply.ok) {
        setStatus({ message: reply.error, error: true });
        return;
      }

      const queued = reply.result.results.filter((r) => !r.reused).length;
      const tagged = tags.length > 0 ? ` as ${tags.join(", ")}` : "";
      setStatus({
        message: `${queued} queued${tagged}, ${reply.result.results.length - queued} already in flight`,
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

  const busy = sending || fetching;

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>NABIT</span>
        <div style={styles.headerRight}>
          <span style={styles.count}>
            {selected.size}/{rows.length}
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
        {(["tabs", "bookmarks", "hn"] as const).map((option) => (
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

      {view === "hn" && (
        <div style={styles.panel}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>HN USERNAME</span>
            <input
              type="text"
              value={hnUsername}
              onChange={(e) => setUsernameField(e.target.value)}
              placeholder="your hacker news handle"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={styles.input}
            />
          </label>

          <div style={styles.segmentedInline}>
            {(
              [
                ["submission", "SUBMISSIONS"],
                ["comment", "COMMENTS"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => changeKind(kind)}
                style={
                  hnKind === kind
                    ? styles.segmentActive
                    : styles.segmentInactive
                }
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchFavorites}
            disabled={busy}
            style={{ ...styles.btnPrimary, opacity: busy ? 0.4 : 1 }}
          >
            {fetching ? "FETCHING..." : "FETCH FAVORITES"}
          </button>

          {fetchedAt !== null && (
            <span style={styles.hint}>
              {rows.length} fetched {describeAge(fetchedAt)}
            </span>
          )}
        </div>
      )}

      {/* List */}
      <div style={styles.list}>
        {rows.map((row) => {
          const checked = selected.has(row.id);
          return (
            <label key={row.id} style={styles.row}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(row.id)}
                style={styles.checkbox}
              />
              <div style={styles.rowText}>
                <div style={styles.rowTitle}>{row.title}</div>
                <div style={styles.rowUrl}>{row.subtitle}</div>
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

      {/* Tag applied to whatever this send queues, in every view */}
      <label style={styles.tagRow}>
        <span style={styles.fieldLabel}>TAG</span>
        <input
          type="text"
          value={tagField}
          onChange={(e) => setTagField(e.target.value)}
          placeholder="optional, comma-separated"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{ ...styles.input, flex: 1, minWidth: 0 }}
        />
      </label>

      {/* Actions */}
      <div style={styles.actions}>
        <button type="button" onClick={selectAll} style={styles.btnGhost}>
          {selected.size === rows.length && rows.length > 0
            ? "DESELECT ALL"
            : "SELECT ALL"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={selected.size === 0 || busy}
          style={{
            ...styles.btnPrimary,
            opacity: selected.size === 0 || busy ? 0.4 : 1,
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
  hint: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.04em",
    color: "#666",
    textAlign: "center",
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
  segmentedInline: {
    display: "flex",
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
  tagRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px 0",
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
