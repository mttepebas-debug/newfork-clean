# EKRAN-02 tek tablo — Requests tür sekmeleriyle tek liste

- **Karar:** Requests tek liste: sekmeler tür (All · Time off · Swap · Cover · Open shift, her birinde açık sayısı), süzgeç satırı Location · arama, açıklar üstte Decide by'a göre, kapanmışlar altta en yeni karar üstte (KARARLAR Ek 2026-10-07, KK-190).
- **İzin:** push yok; koordinatörün "gönder"ini bekliyor (Mert'in bakışından sonra).
- **Risk:** 🟠 R2 — yalnız web; ortak sözleşme değişmedi, ama kapanmış izin geçici olarak imleçle bütün okunuyor (B3 gelene kadar), çok kapanmış talebi olan workspace'te ilk açılış ve her arama harfi bütün kapanmış listeyi okur.
- **Soru:** yok (A4 (c) "sahibi görür" Mert sorusu EKRAN.md §3'te).
- **Sonraki:** koordinatör + Mert önce/sonra görüntülerine bakar → "gönder"; sonra §5 sırası (C2: H2 takas penceresi).

## Nerede duruyor
`task/ekran-02` @`9891727d` (worktree `newfork-wt/ekran-02`), c3 → b1a → c1 cherry-pick'lerinin üstünde. Push yok.

## Ne yapıldı (etkisi)
| Commit | Ne |
|---|---|
| `4823ffa5` | EKRAN.md: #78/#79 kesin H2 ve uyarı kutularına göre; S3 cevaplandı; A4 (c) Mert sorusu; KK-190 cevapları |
| `730786fb` | Tek liste: tür sekmeleri ve açık sayıları, Location · arama, Status sütunu Needs review / In progress / kapanmış durumu; Decide by iki satır (saat, altında bölge adı); "Try again" |
| `4aab5693` | Decide by sütunu 16 % → 18 %: telefondaki 780 px tabloda "Dec 24, 12:00 AM" kesilmez; bütün satırlar 51 px |
| `1373c61e` | `/code-review` düzeltmeleri (aşağıda) |
| `9891727d` | lint: kullanılmayan tip |

- **Kapanmış takaslar sessizce düşmüyor (P09):** kapanmış swap / cover / open shift, bugünkü Shift changes History'si ile aynı yönetici takas okumasından (aynı tarih penceresi) geliyor; kapanmış izin kuyruğu imleçle bütün okunuyor, B3/A4'ün sunucu sayfalaması bunun yerini alacak.
- Okuyabildiği tek tür olan kişide (yalnız izin ya da yalnız takas okuyan) sekme satırı yok; okuyamadığı liste hiç istenmiyor (vitest).
- Eski `?tab=closed` bağlantıları tek listeye düşüyor; bildirim bağlantıları (`?tab=time-off&request=`, `?tab=shift-changes&case=`) aynen çalışıyor.

## İnceleme (`/code-review`, yüksek, 10 bulgu)
- Düzeltildi: (1) Shift Hub'ın Renew'i `?case=`'i `?offer=` ile değiştirince sayfa tabloya dönüyor, teklif formu hiç açılmıyordu → Shift Hub `?offer=`'de de açık; (2) Cover / takas satırını açmak geçmişi değiştiriyordu, tarayıcının Geri'si Requests'ten çıkarıyordu → artık geçmişe ekleniyor; (3) Decide by ve karar saatleri metin olarak karşılaştırılıyordu (farklı ofsetle yanlış sıra) → anlık zaman olarak; (4) çift no-access kontrolü ve gereksiz tip adı silindi; (5) kapanmış takası tek listede tutan sayfa testi eklendi. Her biri önce kırmızı test.
- Atlandı, gerekçeli: arama her harfte kapanmış kuyruğu baştan okuyor (B3 kaldırır; geçici yol koordinatör kararı); iki listeden birinin 403'ü bütün sayfayı "erişim yok" yapıyor (ekran yetkiyi yansıtıyor, çekirdek ve `can()` tutarlıyken oluşmaz); takas aramasında not aranmıyor (takasın aranacak notu C2 ile birlikte ele alınmalı).
- Geri çevrildi: "bir liste düşünce bütün tablo hata gösteriyor" — kısmi liste göstermek veriyi sessizce düşürür (P09); hata hâli doğru.

## Kanıt
- Odaklı: `requests-list.test.ts` 14/14, `requests-data.test.ts` 4/4, `ScheduleRequestsPage.test.tsx` 41/41.
- Tam kapı (`heavy.lock` altında, 2026-10-07): `pnpm lint` 0 hata (17 uyarı, hiçbiri bu dalın dokunduğu dosyalarda), `typecheck`, `test` (web 2246, api 1014, shared 210, ui 9 geçti), `build` — çıkış 0. Log: `newfork-wt/ekran-02-tek-tablo-gate.log`.
- e2e (`db.lock` + `heavy.lock`, `gh run list` boş): `time-off-approval` (4), `shift-hub-swap`, `shift-hub-time-off`, `schedule-publish-approved-exchange` — 7/7 geçti (1,6 dk). `time-off-approval`'daki `?tab=closed` adresi tek listeye çevrildi.
- Görüntüler `newfork-wt/ekran-02/artifacts/ekran-02/tek-tablo/` (git dışı): ÖNCE = `origin/main` @`6b24dbb1` (geçici worktree `newfork-wt/ekran-02-main`), SONRA = dal. Kişiler: admin Zeynep (dünyanın owner'ının parolası yok; tüm lokasyon görünümü aynı) ve Kadıköy müdürü Ayşe; 1440 ve 390.
  - ÖNCE: `<kişi>-timeoff-*`, `-closed-*`, `-shift-*-before.png` (iki sekme, Needs review / Closed düğmeleri).
  - SONRA: `<kişi>-all-*`, `-time_off-*`, `-swap-*-after.png`. All'da bekleyen ve kapanmış satırlar aynı listede; Ali'nin izni ve Ali ⇄ Deniz takası birlikte.
  - Ölçüm (`report-after.json`): yatay sayfa kayması yok (1440, 390); Decide by hiçbir satırda kesik değil; bütün satırlar 51 px.

## Açık kalan
- #58: Cover / takas satırı hâlâ Shift Hub'ın yönetici görünümünü açıyor (ikinci liste arkada) — C2 (H2 penceresi).
- #67: telefonda tablo kendi içinde yatay kayıyor (paylaşılan liste davranışı, 780 px); başlık-sütun eşleşmesi ve 44 px sayfa düğmeleri ayrıca ölçülecek.
- #74: yükleme iskeleti ölçülmedi.
- Geçici worktree `newfork-wt/ekran-02-main` (detached `origin/main`, değişiklik yok) iş bitince silinecek; `newfork-wt/ekran-02-ba` silme izni koordinatörde.
