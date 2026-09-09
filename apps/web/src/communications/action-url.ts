const appActionUrlPattern = /^\/app(?:[/?#]|$)/;

export function safeAppActionUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!appActionUrlPattern.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (parsed.pathname !== "/app" && !parsed.pathname.startsWith("/app/")) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
