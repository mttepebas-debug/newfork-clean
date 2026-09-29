# G13 — test ve CI kararlılığı: işçinin kararları

İşçi oturumu "İşçi: G13 (nf-test)", dal `task/g13-test-stability` (taban `e11d3d3a`), 2026-09-29.
Koordinatör: `local_243f826b…`. Kullanıcı yokken alınan, geri alınması kolay kararlar; her biri
gerekçesiyle. Ürün kararı yok.

1. **BL-120 — testi bölmek ve tembel sayfa beklemesine süre vermek.** "protects workspace routes…"
   iki teste ayrıldı (giriş + Schedule kabuğu / kenar çubuğundan Employees, Settings, Account).
   Tembel yüklenen sayfanın başlığı için 15 sn (`lazyRoute`), test sınırı 60 sn. Neden: hata
   dosya genelindeki 5 sn'lik beklemeden geliyordu (tazelik satırı); ilk ziyarette modül derlemesi
   yük altında 5 sn'yi geçiyor. Yalnız bölmek bu beklemeyi kısaltmıyordu.
2. **BL-175 — ikinci kayıt bilerek 300 ms geç dönüyor.** Yarış her koşuda üretiliyor (önce
   kırmızı görüldü), sonra pencerenin kapanması `waitFor` ile bekleniyor. 300 ms kalıcı: testin
   yavaş cevaba dayanıklı olduğunu kilitliyor.
3. **BL-322 — kök neden testte değil çekmecenin ilk karesinde; düzeltme testte.** Çekmece
   yüklenen çalışanı forma bir effect'le kopyalıyor; o kareden önce yapılan tıklama boş formu
   düzenliyor, effect düzenlemeyi koruyor, kişinin işleri kayboluyor. Aynı kalıp dosyada 6 yerde
   vardı; hepsi `employeeLoaded()` ile formun dolmasını bekliyor. Ürün tarafı (çok hızlı bir
   kullanıcı aynı kareye denk gelirse) yolda bulunan olarak rapora yazıldı; ürün koduna
   dokunulmadı. Bozmayla kanıtlanamadı (kare yarışı elle üretilemiyor); kanıt CI'daki hata metniyle
   birebir uyum ("Unable to find a label with the text of: Primary").
4. **BL-195 — `NoAccessState` başlık kimliği `useId`.** Sunum dosyası ama program G13'e yazmış,
   değişiklik tek satır; önce kırmızı test (iki kart aynı sayfada). Erişim-yok e2e senaryosu
   ayrı karar (rapor).
5. **BL-202 — yalnız metin test edildi.** Satırda renk sınıfı yok (tazelik: değişmiş); sınıf
   eklemek sunum kararı, yapılmadı. İki testin gerçekten yakaladığı iki metin yer değiştirilerek
   kanıtlandı (ikisi kırmızı), sonra geri alındı.
6. **U16 — cihazın saat dilimi testte sabitlendi (`America/Chicago`).** CI'daki
   `TZ: America/Los_Angeles` satırı yerinde kaldı: başka web testlerinin ona dayanıp dayanmadığı
   ölçülmedi (BL-282'deki "web testleri makinenin saat dilimine bağlı" kalemi).
7. **U19 — `apps/api/vitest.config.ts` (20 sn) ve iki web dosyasında 5 sn `asyncUtilTimeout`.**
   api'de config yoktu, varsayılan 5 sn. Web'de bütün dosyalar için tek ayar (`setupFiles`)
   daha doğru olurdu ama `apps/web/vite.config.ts` nf-test'in dosyası değil; öneri olarak rapora.
   Config'in okunduğu 6 sn'lik geçici testle kanıtlandı (config'le geçti, config'siz 5 sn'de düştü).
8. **BL-281 (1) — tabana bağlı olmayan bekçi.** `scripts/ci-green-guard.sh`: her pgTAP dosyası
   ya `ci-green.txt`'te ya da nedeniyle `ci-not-green.txt`'te; o liste yalnız küçülür. Dal
   gönderimi main'den ayrıldığı noktayla karşılaştırılıyor (önceki gönderimle değil). Main'e
   doğrudan gönderimde taban hâlâ `before`: iptal edilmiş bir main koşusunun commit'i dalda CI
   görmemişse o commit'teki silme kaçabilir (kural gereği main'e yalnız dal üzerinden gelindiği
   için dar). Silinen dosya + silinen satır serbest (CLAUDE.md §9: eski test silinir).
9. **BL-281 (2) ve (4) — bu işte değil.** (2) `supabase/tests/time_off_*` G9'un dosyası
   (dokunma listesi). (4) ikinci admin FB-6.2.1'de (G7, KK-12, nf-db).
10. **BL-328 — bütün metin adlarına `exact: true`; regex adlar kaldı.** Başı `^` ile bağlı regex'ler
    zaten tam; bağsız iki regex (`/shows as unavailable for this shift/`, `/On call/`) uzun rozet
    adlarının içinden seçiyor, bilerek kısmi. `owner-legal-name-setup.spec.ts` dokunma listesinde.
11. **BL-203 — spec'lerin yazdığı taslak adlarına rastgele ek (`draftName`).**
12. **U18 — denendi, geri alındı.** Dal CI'ı 36570931085 (`38a6e086`, 12:54–12:57 UTC) test adımı
    `--concurrency=2` ile 2 dk 26 sn; main'de `--concurrency=1` ile 1 dk 44 sn – 1 dk 54 sn (koşular
    36541702828, 36542728375, 36545445726; 08:17–08:55 UTC). check, db ve e2e aynı PC'de koştuğu
    için ikinci paket kazanç getirmiyor; adım 1'de kaldı (`e62e4dbd`). Maddedeki "~7 dk" bayat.
13. **BL-350 — bekliyor.** G22 main'de değil; testler (`Tooltip*`, `ShiftNoteCorner*`) dokunma
    listesinde.
