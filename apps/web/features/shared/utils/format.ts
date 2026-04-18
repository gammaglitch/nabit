export const mono =
  "font-[family-name:var(--font-space-mono)] text-[11px] uppercase tracking-[0.08em]";

export function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) {
    return `${Math.max(minutes, 0)}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatStatus(status: string | null) {
  if (!status) {
    return "UNKNOWN";
  }

  return status.replaceAll("_", " ").toUpperCase();
}

export function statusColor(status: string | null) {
  if (status === "failed") return "text-[#D71921]";
  if (status === "partial") return "text-[#D4A843]";
  return "text-[#4A9E5C]";
}

export function formatSourceLabel(sourceType: string) {
  return sourceType.replaceAll("_", " ").toUpperCase();
}
