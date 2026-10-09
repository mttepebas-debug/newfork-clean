# FEEDBACK-001 Bildirim, yükleme, hata ve bağlantı durumlarının yenilenmesi
Status: paused — Aşama 1 bitti, Aşama 2 bekliyor (BL-117)
Session: tekil (kullanıcı)   Branch: - (Aşama 1 main'de, 2d8ba8a)   Worktree: -   DB: -

Goal: Uygulamadaki toast, yükleme, hata, boş ekran, banner ve bağlantı durumlarını metin, görünüm ve hareket olarak tek, profesyonel bir dile getirmek; hepsini tetiklemeden izlenebilen bir DEV vitrini sunmak.
In scope: `/dev/feedback` vitrini; toast / inline / banner / sayfa hiyerarşisi (kullanıcıyla istişare); toast, yükleme, hata ekranı ve bağlantı varyantları (kullanıcı seçer); çökme, 404 ve erişim yok ekranları; ortak `userMessage(err)`; realtime ve çevrimdışı durumu; ekranlara yayma.
Out of scope: API hata sınıfı göçü (BACKLOG tipli hata maddesi).
Done when:
- Aşama 1: `/dev/feedback` 39 toast'u gerçek metinle tetikliyor, bugünkü durumları gösteriyor; katalog testi yeşil; `dist` içinde vitrin yok.
- Aşama 2: hiyerarşi kuralı `docs/design-canvas.md` ve KARARLAR UI-10'da yazılı.
- Aşama 3: kullanıcı varyantları seçti, kaybedenler silindi.
- Aşama 4: ortak bileşenler main'de, eski ad hoc sınıflar silinmiş, tam kapı yeşil.
Touches: `apps/web/src/dev/**`, `App.tsx`; sonraki aşamalarda `packages/ui`, `apps/web/src/shell`, `apps/web/src/lib/request-error.ts`, realtime hook'ları, sayfa CSS'leri.
Test plan: katalog senkron testi; `use-toast.test.ts`; ErrorBoundary / NotFound / NoAccess route testleri; `userMessage` birim testi; etkilenen e2e.
Risk: Toast'ları DOM'da arayan `App.test.tsx` testleri; ekran bazlı yayma geniş dokunuş.
Reviewer: kullanıcı (görsel kararlar)

## Notes / Result
- 2026-09-24 Aşama 1: vitrin yazıldı. Canlı sahne, `/dev/feedback?frame=1` iframe'i ve postMessage ile çalışıyor; masaüstü / 768 / 375 genişlik ve 1× / 0.5× / 0.25× hız seçenekleri var. 3 inceleme ajanından yüksek güvenli hata çıkmadı. İki eksik kart (Schedule operasyon hatasının kapatma düğmesi, hesap uyarısının düğmeleri) düzeltildi.
- 2026-09-24: Diğer üç DEV sayfası (`EmployeeOnboardingPreview`, `ScheduleShiftDesignPage`, `ScheduleShiftBadgeLabPage`) üretim derlemesine chunk olarak sızıyordu; kullanıcı isteğiyle bu işte kapatıldı. Artık importları da `import.meta.env.DEV`'e bağlı, `dist` içinde hiçbiri yok.
- 2026-09-24: Kullanıcı işi durdurdu, BL-117 olarak backlog'da. Devam ederken önce vitrin açılır, sonra kullanıcıyla birlikte gezilir.
