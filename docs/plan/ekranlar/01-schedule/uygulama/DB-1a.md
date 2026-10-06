# EKRAN-01 DB-1a — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-1a — düzenleme oturumunun yetkisi | `nf-db` / veri hattı | R3 | ONAY @ca91bf74 (`nf-guvenlik`; düşük bulgu 3 `a756d8f3`'te uygulandı) | 2026-10-06 |

## Sonrası için
- Tuzak: reddeden (raise eden) bir fonksiyon aynı işlemde durum değiştiremez; "reddet ve kapat" gereken yerde kapanış bir sonraki yazan çağrıya (açılış) bırakılır.
- Kalıp: oturuma yazan uçların çoğu dönüşte `get_schedule_edit_session_service`'i çağırır; `get`'e konan kapı onları dolaylı korur, çağırmayanlar (bekleyen değişiklik uçları, discard) ayrıca okunmalı.
- Kalıp: dokuz fonksiyonu yeniden tanımlarken canlı tanımı `pg_get_functiondef` ile alıp her değişikliği "tam bir kez eşleşmeli" betikle uygulamak, elle kopyalamadan güvenli.
- Ölçüm: bütün `ci-green` listesini migration'la, dosya başına rollback'le koşmak ~25 dk; yerel DB'de `bl052_document_lifecycle`, `bl052_document_notifications`, `announcements_and_dates_edge_cases` migration'sız da kırmızı.
- Karar adayı: "past schedule week is closed" gibi yetki olmayan kural retleri 42501 değil P0001 + `<alan>.<neden>` anahtarıyla döner.

## Rapor

KARAR satırı (inceleme): ONAY @ca91bf74 (`nf-guvenlik`, alt ajan). Düşük bulgu 3 (iki zayıf test hücresi) `a756d8f3`'te uygulandı (yalnız test). Bulgu 1 ve 2 DB-1b'ye, 4 backlog önerisi, 5 bilgi.
Delegasyon: R3 (yetki çekirdeği, kapsam); `nf-guvenlik` zorunlu inceleme yapıldı; görsel QA yok (ekran kodu değişmedi).
**Ultrareview:** önerilmez. `nf-guvenlik` ONAY verdi ve kendi başına 43 dosyalık geri alınan deneme koştu; değişiklik yeni bir yetki yolu açmıyor, var olanları daraltıyor; Mert benzer iki işte "iki inceleme yeter" dedi (ILKELER P06 kanıtları). Hak durumunu bilmiyorum.

### 1. Nerede duruyor
Bitti, dalda; "gönder" iznini bekliyor.
- Dal `task/ekran-01-db-1a`, worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`, uç `a756d8f3` + bu raporun arşiv commit'i. Taban `origin/main` `31649359` (A0 main'e girdi: `952017a4`; rebase gönderimde).

### 2. Ne yapıldı (etkisi)
Schedule → New Schedule ▾ → bir taslağı Edit / Save draft yolunda:
- **Başka lokasyonun taslağına kayıt kapandı (B-1).** Beşiktaş müdürü Can, Kadıköy müdürü Ayşe'nin yalnız Kadıköy'ü kapsayan "Plan A" taslağına kendi düzenlemesini kaydedebiliyordu: taslağın adı "Taken" oluyor, taslağa Beşiktaş ekleniyor, Ayşe'nin kaydı "stale" hatası alıyordu (testte ölçüldü: "Plan A r1 1" → "Taken r2 2"). Artık reddediliyor, taslak değişmiyor. Kayıt yalnız düzenlemenin açıldığı taslağa, yeni bir taslağa ya da kişinin taslağın bütün lokasyonlarında yazabildiği taslağa gider.
- **Var olmayan ve erişilemeyen taslak aynı cevabı alıyor (B-9, BL-412).** Can, Kadıköy taslağının kimliğiyle düzenleme açınca "Ayşe düzenliyor" bilgisini alıyordu; taslak kimliğiyle haftayı okuyunca taslağın var olup olmadığını ayırt edebiliyordu. Artık ikisi de bilinmeyen taslakla aynı cevabı alıyor: "Not allowed" (42501 + `authz.out_of_scope`). Kadıköy müdürü Zeynep için hiçbir şey değişmedi ("Ayşe düzenliyor" görmeye devam ediyor).
- **Kapsamı daralan müdürün açık düzenlemesi duruyor (B-3).** Ayşe Kadıköy'den çıkarılınca açık sekmesindeki Kadıköy düzenlemesi kalp atışı, okuma ve kaydetmede reddediliyor. Zeynep "Plan A"yı hemen açabiliyor (eskiden Ayşe'nin kirası bitene kadar bekliyordu). Ayşe haftayı yeniden açınca yalnız Beşiktaş'ı düzenliyor; eski düzenlemesindeki kaydedilmemiş Kadıköy vardiyası silinmiyor, kurtarma taslağına geçiyor.
- **Retler nedenini söylüyor (B-9, BL-159).** Düzenlemenin tutmadığı lokasyona vardiya ekleme ve başkasının düzenlemesine toplu ekleme artık `authz.out_of_scope` diyor. "Past schedule week is closed" bir yetki reddi değil haftanın kuralı olduğu için 403 yerine 400 (`P0001` + `schedule.past_week_closed`). Nedensiz yetki reddi sayısı 104 → 100; sayaç tavanı 111 → 100.
- Paylaşılan yeni parça: `app_private.close_schedule_edit_session` (düzenlemeyi kapatır, kaydedilmemiş işi kurtarma taslağına koyar). Eskiden aynı kod açılış fonksiyonunun içindeydi; DB-1b'nin "auto-save"i bunu kullanacak (ikiz yok).

### 3. Açık kalanlar
- **Web / API sözleşmesi (web hattına, `nf-backend`):**
  - Taslak açma (`acquire`) ve taslağın haftasını okuma (`list_schedule_weekly_shifts_service`): bilinmeyen ya da erişilemeyen taslak eskiden P0002 "draft not found" (HTTP 404), şimdi 42501 + `authz.out_of_scope` (HTTP 403). Örnek: URL'de silinmiş bir taslağın kimliği kalmış Ayşe Schedule'ı açınca ekran artık "erişim yok" durumuna düşebilir (`SchedulePage.tsx:1865` `isNoAccess`). Web bu kimliği "taslak yok" gibi temizlemeli (W-1a, D-Y4 ile aynı yer).
  - Save draft: bilinmeyen hedef taslak eskiden 40001 (409), şimdi 403 `authz.out_of_scope`. Web yalnız açık ya da yeni taslağa kaydettiği için bugünkü akış etkilenmiyor (`nf-guvenlik`: `SaveDraftMenu.tsx:194`, `:200`).
  - Kalp atışı / okuma / kayıt / toplu ekleme: kapsamı düşen kişiye 403 + `authz.*`. Web bunu "bu lokasyonu artık düzenleyemezsin, düzenleme kapandı" olarak göstermeli (W-1b).
  - Yayın / yayından kaldırma yarışında geçmiş hafta: 403 → 400, sebep anahtarı `schedule.past_week_closed` (önizleme zaten `past_week_closed` diyor; bu yalnız yarış anı).
  - Auto-fill rotası (`apps/api/src/schedule/schedule-routes.ts:1496`) bilinmeyen taslağa hâlâ kendi 404'ünü veriyor; sızıntı yok, sözleşme tek olsun → BE-1.
- **DB-1b'ye devredilen (inceleme bulgu 1 ve 2):** bekleyen değişiklik ekleme / kaldırma / güncelleme ve "discard" uçları oturumun lokasyonlarını yeniden sormuyor (yazdıkları her vardiyayı ayrıca soruyorlar, sızıntı yok); `add_schedule_pending_op_service` kirayı 4 dk uzattığı için kapsamı düşmüş oturum "aktif" görünmeye devam edebilir. Ayşe'nin kendi eski düzenlemesi kapanınca cevap `acquired` diyor, kurtarma taslağını söylemiyor (D-O9 / "ayırt edilebilir durum" maddesi).
- **Yerel DB'ye ve canlıya uygulama:** gönderim penceresinde. Canlı migration için izin istiyorum (main CI yeşil olunca; önce yedek: dokuz fonksiyonun `pg_get_functiondef`'i). Silen migration değil; yeni bir yardımcı fonksiyon ekliyor, dokuz fonksiyonun gövdesini değiştiriyor.

### 4. Ekranda ne değişti
Görünür bir şey değişmedi (ekran kodu yok). Davranış: başka lokasyonun taslağına kayıt ve onu açma reddediliyor; kapsamı düşen müdürün açık düzenlemesi duruyor. Bu retlerin ekrandaki metni web hattının işi (yukarıdaki sözleşme).

### 5. Sırada ne var
1. "gönder" izni gelirse DB-1a'yı main'e alırım (rebase A0'ın üstüne, tam kapı, migration ortak DB'ye, parçalı `test:db`, push, main CI, canlı).
2. Sonra DB-1b (oturum yaşam döngüsü, auto-save); inceleme bulgu 1 ve 2 onun içinde.
- **Yolda bulunan (backlog önerisi):** Schedule düzenleme yolunda hâlâ nedensiz yetki reddi veren üç fonksiyon: `shift_exchange_schedule_recovery_service` (3), `assess_weekly_schedule_assignment_service` (2), `preview_schedule_default_hours_service` (1). DB-1a'nın listesinde değildi; ilk ikisi takas ve müsaitlik tarafı (EKRAN-02 A2 ya da DB-4 adayı). `(leave: low / do: safe)`.
- **Yolda bulunan (bilgi, inceleme bulgu 5):** taslak menüsü owner / admin'e bütün taslakları gösteriyor; taslak açma ve okuma taslağın en az bir canlı lokasyona dokunmasını istiyor. Bütün lokasyonları arşivlenmiş bir taslak owner'ın menüsünde görünür ama açılmaz. Uç durum `(leave: low / do: safe)`.
- **Yolda bulunan (bilgi):** B-9'daki "taslak ve şablon adları workspace genelinde benzersiz, ad çakışmasından başka lokasyonun adları yoklanabiliyor" kalemi DB-1a'nın "In" listesinde yoktu; dokunmadım, açık.
- **BL-159 tazelik hükmü: değişmiş.** Tazelik 2026-10-06 (`31649359`): "açık düzenleme tutmadığı lokasyona vardiya ekleyebiliyor" kısmı zaten kapalıydı — tetikleyici `app_private.keep_session_shift_in_session_locations` (`supabase/migrations/20260923123347_schedule_edits_lock_one_location_week.sql`) her eklemede oturumun lokasyonuna bakıyor (BL-159'un 2026-09-27 tazeliği bunu görmemiş). Kalan nedensiz ret bu dilimde kapandı (test hücresi 12). Madde kapatılabilir.

### Kanıt
- Kırmızı (eski kod, yerel DB): `schedule_edit_session_scope.test.sql` 23 hücreden 19'u `not ok` (ör. "Can (Beşiktaş) cannot save his edit into the Kadıköy draft": have `allowed`, want `42501 authz.out_of_scope`).
- Yeşil: migration + test tek transaction, rollback → 23/23 `ok`.
- Bütün `ci-green` listesi (165 dosya) + yeni dosya, her biri migration'la ve rollback'le (`db.lock` altında, ~25 dk): kırmızı 4 dosya; üçü migration olmadan da aynı (`bl052_document_lifecycle`, `bl052_document_notifications` ERROR; `announcements_and_dates_edge_cases` hücre 56 — yerel ortak DB'ye özgü, main CI'da yeşil), dördüncüsü `schedule_grid_read_budget` makine yük altındayken; boşta yeniden koşunca migration'la da 17/17 yeşil (≤50 ms bütçesi tutuyor).
- `authorization_matrix`: 26 `not ok`, hepsi bilinen `# TODO`, taban ile aynı.
- Nedensiz 42501 sayımı (aynı sorgu, `authz_catalog`): yerel DB 104, migration'la 100.
- `nf-guvenlik` ayrıca 43 dosyayı aynı yolla koştu: 43/43 yeşil; yerel DB'ye sızıntı yok.
- `ci-green.txt` +1 satır (yalnız büyüdü).
- Commit'ler: `ca91bf74` (migration + test + sayaç), `a756d8f3` (test eki).

Senin yerine verdiğim kararlar (teknik, P19):
- "Oturum kapanır" tembel yoldan: reddeden fonksiyon aynı anda kapatamaz (hata işlemi geri alır), bu yüzden kapsamı düşmüş oturum, taslağı biri açınca ya da sahibi haftayı yeniden açınca kapanıyor; o ana kadar hiçbir işe yaramıyor (bütün çağrıları reddediliyor).
- Taslak açma / okuma için "erişilebilir taslak" kuralı taslak menüsünün kuralıyla aynı: taslağın lokasyonları kişinin lokasyonlarıyla kesişmeli. Kayıt için daha sıkı kural (bütün lokasyonlarda yazma) yalnız açılmadığı bir taslağa yazarken.
- Geçmiş hafta reddi yetki reddi sayılmadı: 42501 yerine P0001 + `schedule.past_week_closed` (HTTP 400).

## İnceleme
KARAR: ONAY @ca91bf74

Not: `/security-review` komutunun kendiliğinden eklediği fark bu inceleme oturumunun dalından geldi (`task/ekran-02-a0`, Requests → Time off sayfalama). O iş zaten main'de (`fcbb8e24`). Görev DB-1a olduğu için inceledğim commit `ca91bf74`. A0 farkına da kısaca baktım: yeni bir güvenlik yüzeyi açmıyor, yetki süzgeçleri olduğu gibi duruyor.

# Güvenlik bulguları (yüksek güvenle)

Kritik, Yüksek ya da Orta bulgu yok. Hiçbir aday 8/10 güven eşiğini geçmedi.

- **Başka lokasyonun taslağı:** Can (Beşiktaş) Kadıköy taslağını kaydedemiyor, açamıyor, haftasını da okuyamıyor.
- **Bilinmeyen taslak:** var olmayan bir taslak kimliği de aynı cevabı alıyor: 42501 + `authz.out_of_scope`.
- **Kapsamı daralan müdür:** Ayşe Kadıköy'den çıkınca açık oturumunun kalp atışı, okuması ve kaydı reddediliyor. Oturum, taslak açılınca ya da Ayşe haftayı yeniden açınca kapanıyor. Kaydedilmemiş iş kurtarma taslağına geçiyor.

# Düşük bulgular

1. **Bazı yazma uçları oturumun lokasyonlarını yeniden sormuyor** (`add_` / `remove_` / `update_schedule_pending_op_service`, `discard_schedule_edit_session_service`; canlı tanım, bu farkta yok).
   - Ne görüldü: kalp atışı, okuma, kaydetme ve toplu ekleme oturumun lokasyonlarını yeniden soruyor. Bu dört uç sormuyor.
   - Neden sızıntı yok: bekleyen değişiklik uçları her vardiyanın kendi lokasyonunu çekirdeğe soruyor. Ayşe Kadıköy'e yazamıyor, yalnız hâlâ yönettiği Beşiktaş'a yazabiliyor. Oturumu da kaydedemiyor.
   - Beklenen: bütün oturum uçlarında tek kural.
   - Kişi için etkisi: `add_schedule_pending_op_service` kirayı (lease) 4 dakika uzatıyor. Ayşe'nin kapsamı düşmüş oturumu bu yüzden "aktif" görünmeye devam edebiliyor.
   - Öneri: DB-1b'de aynı tek satırlık `authorize(..., session.location_ids)` eklensin. Diğer yazma uçları (mutate, şablon, Auto-fill, varsayılan saat, toplu silme) dönüşte `get_schedule_edit_session_service`'i çağırdığı için yeni kapıdan dolaylı olarak korunuyor.

2. **Ayşe'nin kendi oturumu sessizce kapanıyor** (`20261007050000_…sql:125-129`).
   - Ne görüldü: Ayşe haftayı yeniden açınca eski oturumu kurtarma taslağına geçiyor. Ama cevap `acquired` diyor ve `recovered_draft_id` boş.
   - Kişi için etkisi: Ayşe kaydedilmemiş işinin bir kurtarma taslağına taşındığını öğrenmiyor.
   - Öneri: bu, DB-1b'nin "cevapta ayırt edilebilir durum" ve D-O9 maddesine düşüyor; orada kapatılsın.

3. **İki test hücresi kendi başına zayıf** (`schedule_edit_session_scope.test.sql:124`, `:126`).
   - Ne görüldü: testi migration'sız koşturdum. Bu iki hücre eski kodda da geçiyor, çünkü eski kodda bir önceki kayıt başarılı oluyor ve oturum `saved` durumuna düşüyor.
   - Yeni kodda gerçekten koruyorlar: Ayşe'nin kapsamı düşmüş oturumu artık taslağı tutmuyor.
   - Öneri: hücre :126 `isnt 'active'` yerine `is 'expired'` desin, :124 de `'acquired'` desin.

4. **Schedule düzenleme yolunda gerekçesiz 42501 (`authz.*` ipucusuz ret) kaldı.** Sayım yerel DB'de, DB-1a migration'ı olmadan:
   - `shift_exchange_schedule_recovery_service`: 3
   - `assess_weekly_schedule_assignment_service`: 2
   - `preview_schedule_default_hours_service`: 1

   Bu üç fonksiyon dilimin listesinde değil. Öneri: backlog'a yazılsın.

5. **Owner ve admin için ayrışan iki kural.**
   - Ne görüldü: taslak menüsü owner'a ve admin'e bütün taslakları gösteriyor (`org_wide`). Taslak açma ve okuma ise taslağın en az bir canlı lokasyona dokunmasını istiyor.
   - Kişi için etkisi: bütün lokasyonları arşivlenmiş bir taslak owner'ın menüsünde görünür ama tıklayınca "Not allowed" verir. Uç bir durum.

# Öneri (zevk ve sözleşme)

- **Auto-fill rotası 404 veriyor.** `apps/api/src/schedule/schedule-routes.ts:1496` bilinmeyen ve erişilemeyen taslağa aynı 404'ü veriyor; sızıntı yok. Ama DB artık 403 + `out_of_scope` diyor. Sözleşme tek olsun; bu iş BE-1'e düşüyor.

# Temiz bulunanlar

- **Fonksiyon gövdeleri:** dokuz fonksiyonun yeni tanımını yerel DB'deki canlı tanımla satır satır karşılaştırdım. Yalnız amaçlanan değişiklikler var, geri giden bir şey yok. SECURITY DEFINER, `search_path ''` ve STABLE işaretleri korunmuş.
- **Yeni kapatma fonksiyonu:** `close_schedule_edit_session` için yetki ayarı (grant) yalnız `postgres=X`; diğer `app_private` fonksiyonlarıyla aynı. SECURITY DEFINER olmaması doğru: yalnız postgres'e ait SECURITY DEFINER fonksiyonlardan çağrılıyor. Kurtarma taslağı mantığının ikinci bir kopyası kalmamış.
- **"Bilgi eksikse izin ver" yok:** null, boş dizi ve arşivli lokasyon çekirdekte `out_of_scope` dönüyor. Tenant süzgeci (`workspace_id`) bütün yeni sorgularda var.
- **Yarış durumu:** oturum satırı kilitleniyor (`FOR UPDATE`), workspace kilidi alınıyor ve aynı taslakta iki aktif oturumu bir tekil indeks engelliyor.
- **Ekrana etkisi:** web yalnız açık taslağa ya da yeni taslağa kaydediyor (`SaveDraftMenu.tsx:194`, `:200`). Yeni kaydetme kuralı bugünkü kullanıcı akışını kırmıyor. API, P0001 + `schedule.past_week_closed` cevabını 400'e çeviriyor.
- **Done when 1–4 kanıtlı:**
  - Done when 1–3 yeni pgTAP dosyasında kanıtlı.
  - Done when 4: `ci-green.txt` +1 satır. İpucusuz 42501 tavanı 100 (önce 104 ölçülmüş).

# Kanıt

- **Gövde farkı:** `pg_get_functiondef` ile yerel DB'den canlı tanımlar alındı, migration'daki yeni tanımlarla `diff -w` yapıldı. Sonuç 106 satır, yalnız amaçlanan değişiklikler.
- **Geri alınan deneme (yeşil):**
  - Kapsam: dokuz fonksiyona ya da test yardımcısı `tests.add_shift`'e dokunan 42 test dosyası ve `authz_catalog`, toplam 43 dosya.
  - Yöntem: `db.lock` alındı (`nf-guvenlik/db-1a-inceleme`). Her dosya ayrı psql oturumunda `begin` + migration + test + `rollback` olarak koştu.
  - Sonuç: 43/43 yeşil, ERROR 0. `authorization_matrix`'te 26 `not ok` var; 26'sı da `# TODO known` işaretli bilinen boşluk, yeni kırmızı değil.
  - Sızıntı kontrolü: denemeden sonra yerel DB'de `close_schedule_edit_session` sayısı 0. Kilit bırakıldı.
- **Kırmızı kontrol:** yeni test migration'sız koşturuldu. 23 hücreden 17'si kırmızı. Yeşil kalanlar 1, 8, 11, 19, 20; 19 ve 20 zayıf hücre olarak Düşük bulgu 3'te.
- **Main ile ilişki:** EKRAN-02 A0 main'de (`20261007040000`, yalnız `get_schedule_requests_service`). DB-1a ile aynı fonksiyona dokunmuyor, anlam çakışması yok.

# Hafıza notu (dosyaya yazılmadı)

- **Dolaylı koruma:** Schedule oturumuna yazan uçlar dönüşte `get_schedule_edit_session_service`'i çağırıyor. Bu yüzden `get`'e konan yetki kapısı onları dolaylı koruyor. Çağırmayan uçlar (bekleyen değişiklik ekleme/kaldırma/güncelleme, discard, recovery önizleme) ayrıca okunmalı.
- **Deneme ölçümü:** `psql` `-At` bayrağı olmadan TAP satırları boşlukla başlıyor ve `'^ok'` sayımı 0 veriyor. `'^\s*(not )?ok'` ile say.
- **Kilit kimliği:** `lock.mjs` kimliği `rol/oturum` biçiminde ister (`nf-guvenlik/<iş>`). Tek başına `nf-guvenlik` reddediliyor ve bekleme döngüsü sessizce takılıyor.

(Düşük bulgu 3 `a756d8f3`'te uygulandı: hücreler artık `acquired` ve `expired` bekliyor; eski kodda hücre 20 kırmızı.)
