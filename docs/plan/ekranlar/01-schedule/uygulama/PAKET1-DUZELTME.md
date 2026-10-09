# EKRAN-01 · Paket 1 inceleme düzeltmeleri (KK-224) — oturum raporu

- **Karar:** KK-224'teki paket içi maddelerin hepsi yapıldı. İncelemenin ek bulgusu O1 (Save yolu) ve önerisi D1 de bu pakette kapandı.
- **İzin:** canlıya gönderim için koordinatörün "gönder"i bekleniyor (R3, canlı DDL).
- **Risk:** 🟠 yetki (dışa aktarma kuralı) ve canlı göç. ONAY @3716a791 alındı, tam kapı yeşil (aşağıda).
- **Soru:** yok. D3 bir ürün ayrıntısı; aşağıda bilgi olarak yazıldı.
- **Sonraki:** "gönder" gelince canlı yedek → 4 göç sırayla → md5 → advisors → push → yerel DB.

## Nerede duruyor

- Dal: `task/ekran-01-40001-v2` @`7336c08c`, main'in `be7a389a` (BL-965) commit'inin üstünde. Paket 1 (#9, #11, #18, #20), ACIL-40001'in Schedule payı ve bu düzeltmeler tek dalda. Main'e koordinatörün treniyle gider (OPS-08).
- Taşıma öncesi yedekler: `backup/ekran-01-40001-pre-rebase-kk224`, `backup/ekran-01-40001-pre-rebase-bl965`.
  - BL-965 üstüne taşımada yalnız `schema.sql` başlığı çakıştı (göç sayısı, son göç, parmak izi). Her commit'te bu üç satır o commit'in göç klasöründen hesaplandı.
  - Son ağaçta boş veritabanından üretilen `schema.sql` elle çözülenle birebir aynı. Taşıma, BL-965'in dosyalarından başka hiçbir şeyi değiştirmedi.
- Commit'ler (BL-965 üstüne taşımadan sonra): `be434287` düzeltmeler · `9b6a9e9e` yalnız test (B14, B17) · `19bf890a` O1 + D1 · `7336c08c` göç adları canlı sürümlerle.
- Göçler canlıdaki sürümleriyle yeniden adlandırıldı (`20261008052513`…`052645`; eski adlar `002000`…`002300`). İçerik aynı; yalnız 052645'in yorumundaki dosya adı güncellendi. BL-965'in göçünün (dalında `010000`, canlıda `022536`) arkasındalar (KK-220).

## Ne yapıldı

| # | Neydi | Ne oldu | Nerede |
|---|---|---|---|
| B1-A, B9, B12 | Kuralın lokasyonlarına ulaşan her müdür, başkasının haftalık e-posta kuralının alıcılarını ve adını değiştirebiliyordu. Kuralı kendi hazır ayarına bağlayabiliyordu. Ad çakışmasından başkasının kural adlarını deneyerek bulabiliyordu. | Alıcıları ve adı yalnız kuralı kuran, owner ya da admin değiştirir. Müdür gün, saat, aç/kapa ve lokasyonları düzenler. Hazır ayarı yalnız kuran kişi kendi hazır ayarına değiştirir. Owner izindeki Ayşe'nin adresini hâlâ düzeltebilir. | `20261008002200` (yetki çekirdeğine workspace geneli soru) |
| B2 | Vardiya düzenleme göçü 40001 taşıyordu; düzeltmesi sonraki göçe kalmıştı. | Gövde 409 + ipucunu kendisi taşıyor; göç sırası önemsiz. | `20261008002000` |
| B3 | Ayşe aynı haftayı ikinci sekmede açınca birinci sekme "kurtarmak" için düzenlemeyi yeniden açıyor, ikinci sekmedekini kapatıyordu. | Başka yerde kapanan düzenleme ayrı bir kodla geliyor (`edit_session_closed`). Ekran onu yeniden açmıyor, düzenlemeyi bitirip "Your edit ended while you were away…" diyor. Süresi dolmuş kilit eskisi gibi kurtarılıyor. | DB (heartbeat dahil 9 fonksiyon), API eşlemesi, `useScheduleEditSession`, `SchedulePage` Save |
| B4 (ipucu) | Yapıştırma ve varsayılan saat incelemesi kapalı, süresi dolmuş ve değişmiş düzenleme için tek cümle diyordu. | Üçü ayrı kodla geliyor. | `20261008002300` |
| B6 (başlık) | Göç başlığı "API yolu da molayı korur" diyordu; yanlıştı. | Başlık düzeltildi. Şema düzeltmesi backlog'da. | `20261008002000` |
| B7 | Etiket alanı gönderilmeyen bir düzenleme vardiyanın etiketlerini siliyordu. | Etiketler korunuyor; boş liste bilerek gönderilirse siliniyor. | `20261008002000` |
| B8 | Hiç kimseye ulaşmayan haftalık e-posta, gönderim saati boyunca 5 dakikada bir yeniden deneniyordu. | 15 dakika bekliyor; diğer işletmelerin gönderimini tutmuyor. | `20261008002100` |
| B11 | 40001 göçü 15 fonksiyonun gövdesini kopyalıyordu (1602 satır). Araya bir göç girerse onu sessizce geri alabilirdi. | Fonksiyonlar veritabanındaki hâlleri üzerinde yerinde değiştiriliyor (123 satır). Sonda üç kontrol var. Eski ve yeni sonucun şema farkı yalnız amaçlanan değişiklikler. | `20261008002300` |
| B22 | Göç yorumunda Türkçe ifade. | İngilizce. | `20261008002200` |
| B10, B14, B15, B17 | Test boşlukları. | Kapatıldı. | pgTAP |
| O1 (inceleme) | Save kapanmış düzenlemede ham "edit session closed" gösteriyordu. B3'ün yan etkisiydi; benim hatam. | Save de düzenlemeyi bitirip aynı cümleyi gösteriyor. | `SchedulePage.tsx`, `App.test.tsx` |
| D1 (inceleme) | Göçün son kontrolleri iki yazılışı kaçırıyordu. | Kontroller sıkılaştırıldı. | `20261008002300` |

## Kanıt

- **Kırmızı → yeşil:** her düzeltme önce kırmızı test aldı.
  - Web ve API: 4 test kırmızı, sonra yeşil. O1 için App testi kırmızı, sonra yeşil.
  - DB: nf-guvenlik eski göçlerle yeni testleri ayrı ve geri alınan oturumlarda koştu. Her düzeltme hücresi kırmızıydı (B1-A, B3, B4, B7, B8, B9, B12, B15); yeni göçlerle hepsi yeşil.
- **B11 eşdeğerliği:** `pnpm.cmd db:schema` boş veritabanında 444 göçü hatasız koştu. Yeni `schema.sql` ile kopya tabanlı eski hâli arasındaki fark yalnız ayrım, ipuçları, etiket kuralı, dışa aktarma kuralları ve `errcode = ` boşluğu.
- **İnceleme:** nf-guvenlik `ONAY @81300428`, ardından O1/D1 için `ONAY @3716a791`. Taşıma kodu değiştirmedi; `git diff backup..HEAD -- apps packages supabase scripts e2e` boş.
- **Tam kapı:**
  Tarih: 2026-10-08, ~01:35–01:55Z, @4be75808, db + heavy kilidi bendeydi.
  
  - **lint:** 0 hata. **typecheck:** hatasız.
  - **test:** shared 228, ui 9, api 1034, web 2338 (+1 atlanan); hepsi yeşil. **build:** yeşil.
  - **test:db:** dalın 4 göçü her testin işleminde (geri alınıyor). 172 dosya, 15586 test.
    - 169 dosya yeşil.
    - Düşen 3 dosya main'de de aynı düşüyor (dal göçleri olmadan koşuldu): `bl052_document_notifications` (notification_key null), `scheduling_settings_shift_types_rls` (12, 13, 23) ve `weekly_exchange_changed_terms` (`location_id` kolonu yok). Bunlar yerel DB sapması; dalla ilgisi yok.
  - **Schedule e2e:** 11 dosya, 16/16 yeşil (yerel DB'de dal göçleri yok; göçler yerel DB'ye main.lock penceresinde gidecek, ardından e2e tekrar koşulacak).
  - **Canlı yedek hazırlığı:** değişecek 19 fonksiyonun main hâli ve md5'leri `artifacts/EKRAN-01/before-live-kk224-20261008T0134Z.sql` dosyasında. Canlıdaki md5'ler bunlarla karşılaştırılacak; eşitse yedek bu dosyadır.
- **Canlı:**
  2026-10-08 ~05:25 (sunucu saati), koordinatörün "gönder"i (KK-224, G10) ile:
    - Yedek: 19 fonksiyonun canlı md5'i `artifacts/EKRAN-01/before-live-kk224-20261008T0134Z.sql` dosyasındaki main hâliyle aynıydı; tablo sütunları da aynıydı.
    - `apply_migration` sırayla uygulandı:
      - `20261008052513` shift_edit_keeps_break_and_hidden_time
      - `052534` a_failed_send_hour_counts_once
      - `052609` export_rule_is_changed_by_who_reaches_it
      - `052645` schedule_conflicts_refuse_without_retry
    - Dosyalar bu sürümlerle yeniden adlandırıldı. BL-965'in canlı `022536` sürümünün arkasındalar.
    - md5: her adımda yerelde geri alınan işlemle hesaplanan beklenen değerle karşılaştırıldı; 19/19 aynı. mutate `a42b6b88…`, yerelle aynı.
    - `get_advisors` security: yeni bulgu yok.
    - Bağımsız SELECT: Schedule'da yakalanmamış 40001 yok. "Kapalı" kodu 9 fonksiyonda. Aday listesi 15 dk bekliyor. Alıcı kontrolü yerinde. authenticated çalıştıramıyor.

## Açık kalanlar

- **Backlog'a (KK-224):** B4-web, B5, B6-şema, B16, B18–B21, B23, B24.
- **D3 (ürün ayrıntısı):**
  - Durum: Ayşe'nin kilidi uykudayken düştü ve Can aynı taslağı açtı.
  - Önceki davranış: Ayşe'nin ekranı yeniden açmayı denerdi. Can düzenlemede olduğu için "Can düzenliyor" çakışma penceresini gösterirdi.
  - Şimdiki davranış: Ayşe'nin ekranı yalnız "Your edit ended while you were away…" der.
  - Neden: kapanmış oturumu yeniden açmak, aynı kişinin öteki sekmesindeki düzenlemeyi kapatıyordu (B3).
  - Çözüm önerisi: istenirse ret, kimin aldığını detail alanında taşıyabilir; küçük bir iş.

## Ekranda ne değişti

- **Schedule → düzenleme:** başka sekmede ya da başka yerde kapanan düzenleme artık sessizce yeniden açılmıyor. Düzenleme biter ve "Your edit ended while you were away. Open the schedule again to keep editing." yazar. Bu Save'de, heartbeat'te ve vardiya değişikliğinde aynıdır.
- Haftalık e-posta kuralı ekranında mevcut kurallar için yalnız aç/kapa ve sil var. Yetki daralması ekranı değiştirmedi.
