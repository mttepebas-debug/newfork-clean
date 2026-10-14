import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel } from "./harness";
import { installPdfWorker } from "./pdf-worker";
import { mountStatus } from "./status";

installFetch();
guardNavigation();

const { StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
await import("../../src/employees/employee-history-guard");
const { App } = await import("../../src/App");
const { installEscapeFocus } = await import("../../src/lib/escape-focus");

installEscapeFocus(window, document);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
mountPanel();
mountStatus({
  kind: "open",
  heading: "Schedule üst çubuk ve pencereleri (madde 2, 5, 7, 8, 9): yeni varyantların hiçbiri seçilmedi. Her grupta ilk seçenek Original (bugünkü main); varyantlar sağ alttaki “Test page” menüsünde.",
  decided: [
    "Üst çubuk düğmeleri (Export, Templates, New Schedule, Publish) siyah kalır; yayın durumu renkleri üstüne gelir (Mert, 2026-10-04). Bütün varyantlar buna uyuyor.",
    "Sağ üst pencereler “stil B”: sade liste, 13 px, tek yeşil aksiyon (2026-09-28). Original bu; madde 2 ve 8'in yeni varyantlarını Mert 2026-10-09'da kendisi istedi.",
    "Publish penceresindeki sayım cümlesi: B (2026-10-06, BL-441). Export: D yan paneli (2026-09-16), Original bu.",
    "Bu sayfada Mert'in reddettiği bir varyant bulunmadı; hiçbir seçenek kaldırılmadı.",
  ],
  pending: [
    "<b>Madde 2 · New Schedule penceresi:</b> Original ya da 1–5?",
    "<b>Madde 5 · Export menüsü:</b> Original (D) ya da 1–5?",
    "<b>Madde 7 · Uzun adlarla üst çubuk (dar pencere, #86):</b> Original ya da A–D? 2026-10-06'da Mert “başka bir fikrim var” demişti; o fikir kayıtta yok.",
    "<b>Madde 8 · Unpublish penceresi:</b> Original ya da 1–5?",
    "<b>Madde 9 · Review default hours:</b> Original ya da 1–3? Ne işe yaradığı menüdeki “Ne işe yarar?” düğmesinde.",
  ],
});
void installPdfWorker();
