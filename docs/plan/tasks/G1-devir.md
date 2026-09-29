# G1 — devir notu (2026-09-29 akşam)

Schedule taslak ve yayın pencereleri, 13 madde. Yazan işçi oturumu bağlamı
%60'a yaklaştığı için iş sınırında durdu. Dal `task/g1-schedule-dialogs`
(worktree `.claude/worktrees/practical-kilby-82fd79`), taban origin/main
`4490f8e3`; **push edilmedi** (koordinatör: bitince tek push). Rol nf-arayuz, R1.

## Bitti (her biri önce kırmızı test, sonra düzeltme)

| Madde | Commit | Ne değişti |
|---|---|---|
| BL-300 | `c5bdabba` | New Schedule ▾: satırın kendi düğmesinde (Edit/Delete/Unpublish) Enter o düğmeye gider, önizleme açılmaz. `DraftDropdownMenu.tsx`, üç satır işleyicisi. |
| BL-310 | `128c28f5` | Publish/Save draft: ikinci basış menüyü kapatır, yazılan adı sıfırlamaz; tetikleyiciye `aria-expanded`. |
| BL-181 | `128c28f5` | Save menüsü açıkken ekrandan kalkarsa "kapalı" bildirir; kayıttan sonra Published ▾ kendiliğinden açık gelmez. |
| BL-299 | `4a0d47a1` | Publish: taslak değişince eski kontrol atılır (`forgetCheck`, lokasyon değişimiyle aynı); yeni taslağın kontrolü hata verirse Next yeniden kontrol eder, eskiyi yayınlamaz. |
| BL-108 | `4a0d47a1` | Publish: yayında ama vardiyasız lokasyon "Not published yet" değil "Published now". |
| BL-301 (Publish) | `6d2f68fc` | Yayın gönderilirken Escape, X, arka plan ve Cancel pencereyi kapatmaz; hata görünür. "cancels a pending automatic continuation…" testi silindi: gönderim sırasında Cancel artık yok, tarif ettiği akış kalmadı (ebeveyn kalkınca yeniden denememe ayrı testte duruyor). |

Kontrol (son commit sonrası): odaklı vitest — DraftDropdownMenu 17/17, SaveDraftMenu 10/10, PublishScheduleDialog 36/36; `typecheck` temiz; dalın 7 dosyasında eslint 0 hata (9 uyarı, hepsi eski).

## Kalan (tazelik 2026-09-29, `4490f8e3`; hükümler ve satırlar)

1. **BL-301 (Unpublish + Escape)** — geçerli. Unpublish penceresinde Cancel işlem sürerken kapalı ama X ve arka plan açık (`UnpublishScheduleDialog.tsx:73`, `:86`); Schedule'ın Escape'i `isUnpublishing`'e bakmıyor (`SchedulePage.tsx:2016-2023`). Test: `UnpublishScheduleDialog.test.tsx:102` yanına.
2. **BL-329** — geçerli. Odak bir alandayken Escape Templates/Unpublish penceresini kapatmıyor: `SchedulePage.tsx:1648` alanlarda Escape'i atlıyor (kural `scheduleInteractionTargets.ts:5-10`). Çare: pencerelere Publish'teki gibi kendi Escape'i (`PublishScheduleDialog.tsx` `Dialog`) ya da alan bir pencerenin içindeyse atlamamak. 1 ile aynı işleyici.
3. **BL-306** — geçerli. Unpublish tek tık; uyarı yeşil onay simgesiyle (`UnpublishScheduleDialog.tsx:180-185`, `:152-162`). Çare: `ConfirmButton` "Confirm unpublish" + uyarı simgesi. Görsel stil G14'e (BL-318) kalır (S3).
4. **BL-313** — geçerli. Taslak listesi iki kopya: sayfa değişkeni (`SchedulePage.tsx:281`) ve önbellek (`:1036`); kayıtta ayrışıyor (`draftSaveFlow.ts:29` başa, `:1256-1259` sona). Çift yazma `:895`, `:923`, `:947`, `:983`. Çare: tek kaynak `draftsQuery.data`. Test `draftSaveFlow.test.ts`.
5. **BL-303** — değişmiş. Kalan: Unpublish başarılı, ama sonraki `refreshDrafts()`/`previewDraftFromMenu` hatası kapanmış pencerenin `catch`'ine düşüyor (`SchedulePage.tsx:3179-3181`, `UnpublishScheduleDialog.tsx:60`). Çare: başarı sonrası adımlar ayrı `try`, hata bildirimle. **S2'ye bağlı.**
6. **BL-302** — geçerli. İzinsiz müdür Unpublish simgesini görüyor (`SchedulePage.tsx:2292-2298`; Published ▾ `:1961` izne bakıyor). Çare: `canPublishSchedule && hasPublishedSchedule`. **S2'ye bağlı** (test yeri).
7. **BL-323** — geçerli. Discard sonrası atılan oturum geri gelebiliyor: "sonuç hâlâ geçerli mi" kontrolü yalnız `throwOnError` yolunda (`SchedulePage.tsx:1422`, `:1427`). **S2'ye bağlı.**
8. **BL-309** — ana iddia bayat (`73483adf` kaynak taslağı API'ye ekledi; rozet ve silme engeli çalışıyor, testli). **S1'e bağlı.** Önerilen kalan: ölü "Saved by" dalı (`DraftDropdownMenu.tsx:474-486`, `SaveDraftMenu.tsx:79-88`) + ikiz yardımcılar (`publishedTitle`/`publishedMeta`/`updatedByLabel`, `SaveDraftMenu.tsx:70 shortDate`).

Gruplar: 1+2 aynı Escape işleyicisi; 1+3+5 aynı pencere; 4+5 aynı `refreshDrafts` akışı.

## Koordinatöre sorulan, cevap bekleyen (2026-09-29, send_message)
- **S1** BL-309 yeniden kapsam: (a) ölü "Saved by" dalı + ikizleri topla (önerilen) / (b) bayat kapat, ikizler backlog. Ek ürün sorusu: taslak sayacı (`DraftDropdownMenu.tsx:112`) yayın satırını sayıyor mu, saymalı mı.
- **S2** BL-302/303/323 test yeri: (a) mantığı `schedule/lib/` altına küçük saf fonksiyonlara çıkar + test (liste dışı 2-3 dosya, önerilen) / (b) sayfada düzelt, kanıt e2e.
- **S3** BL-306 yalnız davranış (ConfirmButton + simge), stil G14.

## Kalan kanıt
Ekran görüntüsü alınmadı (masaüstü + telefon, `artifacts/nf-arayuz/g1/`, 5630/5631). Taslak ya da yayın akışı veri yazmadan gösterilemiyorsa `/dev/schedule-shift-design` yetmez; yerel Meyhouse'ta bu hafta taslak yok, taslak açmak veri yazmak demek — koordinatöre sorulmalı.
