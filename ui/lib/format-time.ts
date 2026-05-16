/** Human-readable relative time for scrape timestamps. */
export function formatFreshness(iso: string | null | undefined): string {
  if (!iso) return "unknown";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 14) return `${diffDay}d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
