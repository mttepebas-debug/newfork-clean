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
  heading: "Vardiya ekleme ve düzenleme pencereleri (madde 11–14): henüz seçim yok. Her grupta ilk seçenek Original (bugünkü main); varyantlar sol alttaki “Test page” menüsünde.",
  decided: [
    "Start ve End alanları kişinin kendi 12/24 saat seçimine uyar (BL-055, main <code>3e2be180</code>).",
    "Onaylı izinle 1 dakika bile çakışan vardiya kaydedilemez (Mert, 2026-10-09 05:57Z, KARARLAR §1.1, BL-995). Pencere bu durumda kaydetmeyi reddeder.",
    "Şablon penceresinin A, B, C varyantlarını Mert reddetti (2026-10-09 08:05Z); bu sayfadan kaldırıldı. Templates düğmesi bugünkü pencereyi açar.",
  ],
  pending: [
    "<b>Madde 11 · Açık pencerenin hücre işareti:</b> Original, A yumuşak nabız, B spot ışığı ya da C hareketli çerçeve?",
    "<b>Madde 12 · Edit shift penceresi:</b> Original ya da 1–5 (1 kompakt kart, 2 yan panel, 3 önce klavye, 4 gün çizelgesi, 5 hücreden büyüyen)?",
    "<b>Madde 13 · Add shift penceresi:</b> aynı beş aileden biri mi, Original mı?",
    "<b>Madde 14 · Add shift (Unassigned) penceresi ve saat yazma:</b> pencere için aynı soru; saat için Original, A tek kutu (<code>9-5</code>) ya da B iki kutu + liste?",
  ],
});
void installPdfWorker();
