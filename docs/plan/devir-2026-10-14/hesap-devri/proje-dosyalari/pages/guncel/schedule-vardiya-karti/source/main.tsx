import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel } from "./harness";
import { installPdfWorker } from "./pdf-worker";
import { mountStatus } from "./status";
import "./vk/vk.css";

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
  kind: "half",
  heading: "Vardiya kartı ve sürükleme: madde 3 ve 4 karara bağlandı, madde 10 (hayalet vardiya) seçim bekliyor. Düzenleme kipi: New Schedule → Edit live schedule.",
  decided: [
    "<b>Madde 3 · Yayın işareti → 6.</b> Yayındaki vardiyanın kartında işaret yok; yayınlanmamış yeni vardiyada sağ altta küçük yeşil “NEW”. Mert, 2026-10-09 08:21Z (KARARLAR §1.5). Henüz koda girmedi.",
    "<b>Madde 4 · Sürüklerken → B.</b> Vardiyanın kendi lokasyonunda o vardiyayı alamayanlar sürükleme boyunca gizlenir, bırakınca geri gelir. Mert, 2026-10-09 08:21Z (KARARLAR §1.5). Henüz koda girmedi.",
    "Reddedilenler sayfadan kaldırıldı: madde 3'te Original ve 1–5, madde 4'te Original ve A.",
  ],
  pending: [
    "<b>Madde 10 · Hayalet vardiya</b> (kişinin başka lokasyondaki vardiyasının gri kartı): bugünkü 11b mi kalsın, yoksa 1–20 ya da 5a–5e'den biri mi? Sağ alttaki “Test page” menüsünden denenir. Seçim 2026-09-26 kararını (11b) değiştirir.",
  ],
});
void installPdfWorker();
