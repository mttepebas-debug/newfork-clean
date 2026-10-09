# EMP-001 B — e2e: yönetici bir kişiyi kendi lokasyonundan çıkarır

nf-test, 2026-09-30. Dal `task/emp-001-b-e2e` (worktree `.claude/worktrees/elastic-mirzakhani-85c7aa`),
taban `origin/main` `d411d7a8`. Push edilmedi.

| Commit | İçerik |
|---|---|
| `ae6e6ee1` | `test(e2e): a manager takes somebody off her own location (EMP-001)` — yeni `e2e/flows/remove-from-location.spec.ts`; `tokenOf` yardımcısı `invite.spec.ts`'ten `e2e/fixtures/world.ts`'e taşındı |
| `8b55c518` | `test(e2e): the ghost card's "no Besiktas" check reads what the card shows (G14)` — `schedule-multi-location.spec.ts` tek satır, `{ useInnerText: true }` |
| `94443d84` | `docs(agent-memory): …` — nf-test hafıza notu (ayrı commit; istersen alma) |

## 1. Nerede duruyor
Bitti. `apps/**`, `packages/**`, `supabase/**` dokunulmadı; `builder.sql`'e gerek kalmadı (kişi var olan
`tests.person` ile kuruluyor).

## 2. Ne yapıldı (etkisi)
**Yeni senaryo** (`remove-from-location.spec.ts`, tek test). Test, Kadikoy ve Besiktas'ta çalışan bir kişi
kurar (Ali ve Deniz'e dokunmaz; onlar öteki spec'lerin vardiyalarını taşıyor). Sonra:
1. **Ret hücresi.** Kadikoy yöneticisi Ayse, bu kişinin *Besiktas* atamasını kaldırmak için API'ye doğrudan
   istek gönderir → **403**, gövdede `reason: "authz.out_of_scope"`; kişi hâlâ iki lokasyonda.
2. **Ekranda.** Ayse Employees → kişinin adı → çekmecede "Employment" bölümü. "Remove from Kadikoy" düğmesi
   var, "Remove from Besiktas" düğmesi yok. İlk tık düğmeyi kurar ("Confirm remove from Kadikoy"), ikinci
   tık çıkarır.
3. **Sonuç.** Kişi Ayse'nin listesinden düşer (liste yüklü: Emre hâlâ orada). Veritabanında tek açık
   ataması Besiktas. Besiktas yöneticisi Mehmet'in listesinde kişi duruyor, lokasyonu "Besiktas".

**Kırmızı görüldü** (istenen): ret hücresi önce yanlış beklentiyle (`toBe(200)`) koşturuldu →
`Expected: 200 / Received: 403` ile düştü (`remove-from-location.spec.ts:53`); sonra `403`'e çevrildi.

**`schedule-multi-location.spec.ts`** satır 75 (şimdi 77): hayalet kartta "Besiktas yazmıyor" kontrolü
artık yalnız görünen metne bakıyor. main'de bugün yeşil.

**`sign-in-lands.spec.ts:19` daraltılmadı, gerek yok.** Neden: o satır Ayse'nin `/app/schedule`
sayfasında (içinde bulunulan hafta) tam metni "Besiktas" olan öğe sayıyor. G14 dilim b dalında
(`task/g14-b`) Tooltip iki yerde kullanılıyor: hayalet kartın konum iğnesi (`ShiftCard.tsx:422`, içeriği
lokasyon adı) ve Publish düğmesi (`SchedulePage.tsx:2443`, içeriği bir cümle). Yani gizli "Besiktas"
ancak o haftada bir hayalet kart varsa oluşur. e2e dünyasında içinde bulunulan haftaya Besiktas vardiyası
yayınlayan spec yok: hepsi `tests.week(n)` (yaklaşık 700 gün ileri) kullanıyor, yalnız
`schedule-shift-note` gelecek haftaya ve Kadikoy'a yazıyor. Lokasyon başlığında (`schedule-loc-…`, satır
63) Tooltip yok, o da güvende. Risk ancak biri içinde bulunulan haftaya iki lokasyonlu bir kişinin
Besiktas vardiyasını yayınlayan bir spec eklerse doğar.

### Kanıt (2026-09-30, bu worktree, CI boştayken, `db.lock` ile)
| Komut | Sonuç |
|---|---|
| `pnpm.cmd e2e flows/remove-from-location.spec.ts flows/schedule-multi-location.spec.ts flows/invite.spec.ts` | **4 passed (49.3s)** — tur 1 |
| `pnpm.cmd e2e flows/remove-from-location.spec.ts` | **1 passed (27.1s)** — tur 2 |
| `pnpm.cmd e2e flows/remove-from-location.spec.ts` | **1 passed (26.1s)** — tur 3 |
| `pnpm.cmd --filter @newfork/e2e lint` / `typecheck` | temiz |

Done when: yeni senaryo 3 kez üst üste yeşil ✔ (ayrı üç koşu, her biri kendi dünyasıyla);
`schedule-multi-location.spec.ts` yeşil ✔; lint temiz ✔; kırmızı görüldü ✔. `invite.spec.ts` de koşturuldu
(yardımcısı taşındığı için): 2/2 yeşil. Kilit bırakıldı.

## 3. Açık kalan ve nedeni
- **Tam e2e takımı bu dalda koşmadı** (istenmedi); koşanlar: yeni spec, `schedule-multi-location`, `invite`.
  `world.ts`'e yalnız yeni bir dışa aktarım eklendi, var olanlar değişmedi. Dal CI'ı tamamını koşar.
- **`useInnerText` satırı G14 dilim b koduna karşı koşturulmadı** (o dal başka worktree'de). Dayanak kod
  okuması: gizli açıklama `<span hidden>`, `innerText` gizli öğeyi saymaz.
- **K4 "müdür lokasyonsuz kalamaz" hücresi** yazılmadı (talimat: söküm dalı gelince ayrı).

## 4. Ekranda ne değişti
Hiçbir şey; yalnız test dosyaları.

## 5. Sırada ne var / yolda bulunanlar
1. **Çıkarma başarılı olunca çekmece "erişim yok" ekranında kalıyor** (leave: medium / do: safe; `nf-arayuz`
   + `nf-backend`). Ayse "Confirm remove"a bastıktan sonra çekmece kapanmıyor: sağda "You don't have access
   to this employee" kilidi çıkıyor, solda kişinin adı, kodu ve "Active" etiketi, altta "Terminate employee"
   ve "Save changes" duruyor. İşlem başarılı ama ekran hata gibi okunuyor; "çıkarıldı" diyen bir şey yok.
   Ekran görüntüsü: `artifacts/nf-test/emp-001-b-e2e/after-remove.png`. Test bunu beklenti olarak yazmıyor
   (yalnız listeyi ve veritabanını ölçüyor), yani çekmece kapanacak ya da bildirim gösterecek şekilde
   düzeltilirse test değişmez. Backlog'a yazmadım (`docs/plan` benim alanım değil).
2. **`account-password-change.spec.ts:72` yük altında bir kez düştü** (senin notun: dal CI'ı 36711048508,
   ilk test 50 sn sürdü, yeniden koşuda geçti). Düzeltme yazılmadı. Bu dosya koşuda ilk sırada (alfabetik)
   ve ilk testi tarayıcıyı, Vite'ın ilk derlemesini ve tembel rotaların ilk yüklemesini üstleniyor; boşta
   15 sn sürüyor (2026-09-30 tam koşum). Aynı kalıp `schedule-shift-note` için BL-321'de yazılı
   (süre sınırı o spec'te 120 sn'ye çıkarılmıştı).
3. **Ortak dünyaya bir kişi daha ekleniyor:** her koşu Besiktas'ta bir çalışan bırakır (Kadikoy ataması
   bitmiş). Spec alfabetik olarak `schedule-*`'dan önce koşar; tur 1'de `schedule-multi-location` onunla
   birlikte yeşildi.
4. **Söküm (EMP-001 B) için not:** test Employment bölümüne soldaki "Employee sections" gezintisindeki
   "Employment" düğmesiyle giriyor ve düğme adlarına ("Remove from Kadikoy" / "Confirm remove from Kadikoy")
   dayanıyor; "Manages without working there" bölümüne dokunmuyor. Bölüm adı ya da düğme adı değişirse iki
   satır güncellenir.

Skills: `superpowers:test-driven-development` (kırmızı önce görüldü) ve
`superpowers:verification-before-completion` (rapordaki her sonuç bu oturumda koşturuldu) kullanıldı.
