// AUTH-UX-001 phase 1 only: DEV fixtures for states local data cannot produce.
// Deleted before merge; `grep -r uxMock apps/web/src` must be empty.
export function uxMock(): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(window.location.search).get("uxMock");
}

export function uxVariantB(): boolean {
  return (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("variant") === "b"
  );
}
