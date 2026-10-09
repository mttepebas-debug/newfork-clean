type HistoryGuard = (event: PopStateEvent) => void;
const activeGuards = new Set<HistoryGuard>();

// Install before BrowserRouter so a pop cannot unmount a dirty drawer first.
window.addEventListener("popstate", (event) => {
  for (const guard of [...activeGuards].reverse()) {
    guard(event);
    if (event.cancelBubble) break;
  }
}, true);

export function registerEmployeeHistoryGuard(guard: HistoryGuard) {
  activeGuards.add(guard);
  return () => { activeGuards.delete(guard); };
}
