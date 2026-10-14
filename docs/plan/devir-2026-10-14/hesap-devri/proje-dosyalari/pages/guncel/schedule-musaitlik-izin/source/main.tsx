import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel } from "./harness";
import { installPdfWorker } from "./pdf-worker";
import { mountStatus } from "./status";
import "./variants/variants.css";

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
  kind: "done",
  heading: "Müsaitlik ve izin hücreleri: dört maddenin görünüşü seçildi; yalnız tam gün izin hücresine tıklama sorusu açık. Müsaitlik “!” işaretleri düzenleme kipinde görünür: New Schedule → Edit live schedule.",
  decided: [
    "<b>Madde 1 · Ad yanındaki “!” → A.</b> Pencere açıkken o kişinin müsait olmadığı günlerin hücreleri açık turuncu dolar; saat yazısı ve çubuk yok. Henüz koda girmedi.",
    "<b>Madde 6 · İzin hücresinin görünüşü → Original.</b> Düz kırmızı zemin, “TIME OFF”. Main'de var (değişiklik yok).",
    "<b>Madde 15 · “!” penceresi kaydırınca → B.</b> En küçük kaydırmada kapanır. Henüz koda girmedi.",
    "<b>Madde 16 · İzin hücresinde üzerine gelme ve sürükleme → A “sakin”.</b> Üzerine gelince ince koyu kenar; sürüklerken kırmızı çerçeve ve “Can't place a shift here”. Henüz koda girmedi.",
    "Kaynak: Mert, 2026-10-09 08:13Z (KARARLAR §1.5). Reddedilen A, B, C ve Original seçenekleri sayfadan kaldırıldı. Kural: onaylı izinle 1 dakika bile çakışan vardiya yazılamaz (KARARLAR §1.1, BL-995).",
  ],
  pending: [
    "<b>Madde 6 · Tam gün izin hücresine tıklayınca ne olsun?</b> Original: Add shift penceresi açılır, kayıt reddedilir (bugünkü main; Mert 08:05Z “time off rule orjinal iyi şuan için”). Locked: Add shift yok, tıklayınca “neden eklenemez” kartı çıkar, imleç “not-allowed”. İkisi “Test page” menüsünde denenir.",
  ],
});
void installPdfWorker();
