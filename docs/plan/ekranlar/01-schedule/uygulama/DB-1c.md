# EKRAN-01 DB-1c — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-1c — Undo sunucuda, son adımı tek transaction'da geri alır (S2, KK-171) | `nf-db` / veri hattı | R3 | ONAY @86cfd059 (`nf-guvenlik`, üç tur) | 2026-10-06 |

## Sonrası için
- **Kalıp:** Açık düzenlemenin vardiyasına yazan her fonksiyon ya Undo adımıdır ya da kendini geçmişten siler (`app_private.schedule_edit_undo_barrier()` / acquire'daki silme); `schedule_edit_session_undo` testinin 10. bölümü listeyi sabitler, yeni yazan fonksiyon orada sınıflanmadan yeşile dönmez.
- **Kalıp:** "Fazla düzgün" yeşili sınamak için servisin boş sahte sürümünü (yalnız revision+1) migration'la aynı transaction'da koyup testi koş; bu dilimde 54 hücreden 23'ü kırmızıya döndü.
- **Tuzak:** Adım kimliği `(statement_timestamp(), pg_current_xact_id())`; pgTAP'ta `select f(x) from generate_series(...)` tek komut = tek adım olur, her adımı ayrı komut olarak yaz.
- **Tuzak:** `jsonb_populate_record(..., step -> 'before')` JSON `null` üzerinde "cannot call populate_composite on a scalar" verir (WHERE lateral çağrıdan sonra süzer); `nullif(..., 'null'::jsonb)`.
- **Karar adayı:** Yayın, çalışanın arşiv durumunu ve iş atamasını yeniden kontrol etsin (Tur 1 Düşük 2; Undo'dan bağımsız, önceden de açık).

## Rapor
**Karar:** DB-1c hazır; `nf-guvenlik` KARAR: ONAY @86cfd059 (R3, üç tur; son turda Kritik/Yüksek/Orta bulgu yok, 3 Düşük not).
**İzin:** R3 — "gönder" izni bekliyor; canlı migration için de izin isteniyor (tek migration `20261007120000`).
**Risk:** 🟢 Undo yalnız sahibinin kendi açık düzenlemesine dokunuyor; yetki ve workspace sınırı testle kilitli. 🟠 Tam `test:db` henüz koşmadı (db.lock web hattındaydı); gönderimden önce koşacak.
**Soru:** Üç Düşük notu (aşağıda 2–4) şimdi mi düzelteyim, backlog'a mı? Öneri: backlog; hiçbiri yanlış veri yazmıyor, her biri yeni bir inceleme turu ister.
**Sonraki:** "gönder" gelince: `main.lock` + `db.lock` → rebase → yerel migration → tam `test:db` → push → main CI → canlı migration (izinle). Sonra EKRAN-02 A1.

### Ne yapıldı (etkisi)
- **Öncesi:** Schedule → Edit modunda Undo yalnız ekrandaki kopyayı geri koyuyordu; sunucu değişmiyordu. Ayşe şablonla 24 vardiya ekleyip Undo'ya basınca ekran 24 ayrı silme göndermek zorundaydı; biri düşerse ekran ve kayıt ayrışırdı.
- **Sonrası:** Sunucu her yazma çağrısını bir adım olarak tutar (en çok 25). Undo son adımın dokunduğu her vardiyayı tek transaction'da adımdan önceki hâline döndürür. Örnek: Ayşe Ali'nin Salı vardiyasını Çarşamba'ya sürükleyip Undo'ya basar; vardiya ekranda da kayıtta da Salı'da. Yayındaki vardiyada "bekleyen değişiklik" işareti de kalkar.
- Bir kural reddederse (kişi o gün onaylı izinde, zorunlu belgesi eksik) hiçbir vardiya geri gelmez, hiçbir şey değişmez.
- Save draft / Discard / Auto-save geçmişi siler (KARARLAR: Undo kaydedilmiş adımı geri almaz). Takas ya da kapalı gün açık düzenlemeyi değiştirirse o düzenlemenin geçmişi silinir. Sayfa yenileme ya da lokasyon ekleme geçmişi korur; yüklenen vardiyalar adım sayılmaz.
- Tasarım (P19, benim kararım): web hattının sözleşme önerisini benimsedim (adım sunucuda, `undo_depth`). İlk tasarım (ekran hedef revizyonu gönderir) ONAY almıştı (@5c65dc2b); öneri gelince değiştirdim: ekran revizyon tutmuyor, düğme sayfa yenilenince de doğru kalıyor.
- Ekranda görünür bir şey değişmedi; web hattı Undo düğmesini bu uca bağlayınca değişecek.

### Sözleşme (web hattına)
| | |
|---|---|
| Servis | `public.undo_schedule_edit_session_step_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer) returns jsonb` — yalnız `service_role` |
| Girdi | `expected_session_revision` = ekranın elindeki oturum revizyonu (bugünkü yazma uçları gibi) |
| Çıktı | `get_schedule_edit_session_service` cevabı (yeni `revision`, vardiyalar) + `undo_depth` |
| `undo_depth` | Her oturum cevabında (mutate, batch, bulk delete'in `session`'ı, template / Auto-fill `session`'ı, heartbeat, get, acquire): kalan adım sayısı 0–25; 0'da düğme soluk |
| Adım | Bir yazma çağrısı: mutate (create/update/delete/restore), batch create, bulk delete, template, Auto-fill, default hours, bekleyen değişiklik ekle/kaldır, takas sonrası düzeltme |
| Vardiya revizyonu | Geri gelen vardiyanın içeriği ve `pending_op_type` / `locked` adımdan öncekiyle aynı; `revision` ileri gider (eski numarayı tutan bayat istek geçmesin) — öneriden tek ayrılık |

| Hata | SQLSTATE + ipucu / mesaj | Ne zaman | Ekran |
|---|---|---|---|
| Adım yok | `PT409` + `schedule.nothing_to_undo` | yığın boş | düğmeyi soldur |
| Oturum yok / sahibi değil / başka workspace | `P0002` `edit session not found` | — | bugünkü gibi |
| Yetki | `42501` + `authz.out_of_scope` | müdür düzenlemenin lokasyonlarından birini kaybetti | bugünkü gibi |
| Kira bitti / kaydedildi | `40001` `edit lease expired` | — | `edit_lease_expired` |
| Ekran geride | `40001` `session revision stale` | — | `edit_session_stale`, yeniden yükle |
| Kural reddetti | `23514` (`Resolve shift hours or approved time off…`, `employee document hard conflict`) | geri gelen vardiya bugün izin / belge kuralına takılıyor | hiçbir şey değişmedi; mesajı göster |

### Kanıt
- Dal `task/ekran-01-db-1c`, worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`; kod `86cfd059` (öncesi `bb60fa5a`, `5c65dc2b`), origin/main `88f5e7a1` üstünde.
- Migration `supabase/migrations/20261007120000_schedule_undo_goes_back_on_the_server.sql`: yeni tablo `app_private.schedule_edit_undo_steps`, iki trigger, `app_private.schedule_edit_undo_barrier()`, yeni servis; `get_schedule_edit_session_service` (+`undo_depth`), `acquire_schedule_edit_session_service`, `shift_exchange_rebase_drafts`, `app_private.important_date_close_shifts` canlı tanımdan tek eşlemeyle yamalandı (inceleme `pg_get_functiondef` ile doğruladı).
- Test `supabase/tests/schedule_edit_session_undo.test.sql` (ci-green'e eklendi): 54/54; Undo'nun boş sahte sürümüyle 23 hücre kırmızı (2026-10-06, yerel DB, migration + test tek transaction'da geri alındı). Komşu 14 dosya aynı yolla yeşil. `authorization_coverage` 5/5 (`schedule.edit`).
- Tam `test:db`: henüz yok — gönderimden önce.

### Yolda bulunan (backlog önerisi, koordinatöre)
1. Yayın, çalışanın arşiv durumunu ve iş atamasını yeniden kontrol etsin (`nf-guvenlik` Tur 1 Düşük 2; Undo'dan önce de açıktı). leave: medium / do: moderate.
2. Undo adım sırası saat yerine kayıt sırasıyla (identity) tutulsun; iki sekmeden aynı anda toplu silme + sürükleme ara hâl bırakabilir (Tur 3 Düşük 1). leave: low / do: safe.
3. 25 adım doluyken lokasyon eklemek en eski adımı düşürüyor (derinlik 24) (Tur 3 Düşük 2). leave: low / do: safe.
4. Kapalı gün sınırına davranış testi (Tur 3 Düşük 3). leave: low / do: safe.

Skills: supabase-postgres-best-practices, test-driven-development (kırmızı önce), receiving-code-review (bulgular tek tek doğrulandı), verification-before-completion.

## İnceleme

### Tur 1 (`cc7a5e8b`, ilk tasarım: ekran hedef revizyonu gönderir) — `nf-guvenlik`

KARAR: DEĞİŞİKLİK İSTE (`cc7a5e8b`, R3)

**Koordinatör için 5 satır**
- **Karar:** Değişiklik isteniyor (R3). Kritik ya da Yüksek bulgu yok. Tek istenen şey eksik yetki kanıtı: iki pgTAP hücresi.
- **İzin:** Gönderilmez. İki hücre eklenip tekrar incelendikten sonra koordinatörün "gönder" izni gerekir.
- **Risk:** 🟠 Kod doğru görünüyor. Ama "yetkisi daralan müdür Undo yapamaz" kuralını hiçbir test kilitlemiyor.
- **Soru:** Yok.
- **Sonraki:** `nf-db` iki hücreyi ekler. Ben yalnız o farka yeniden bakarım. Ardından `db.lock` ile tam `test:db` koşar.

---

## Bulgular

### Orta 1: Undo'daki yetki satırını hiçbir test korumuyor
- **Nerede:** `supabase/migrations/20261007120000_schedule_undo_goes_back_on_the_server.sql:99` (`app_private.authorize(..., 'schedule.edit', target_locations => edit.location_ids)`), test dosyası `supabase/tests/schedule_edit_session_undo.test.sql` bölüm 6.
- **Ne görüldü:** Testteki her ret hücresi (Zeynep, Ali) daha önceki "oturumun sahibi mi" kontrolünde düşüyor (`:95`, P0002). Oturumun sahibi olduğu hâlde bir lokasyonun yetkisini kaybetmiş müdür için hücre yok. Test dünyası tek workspace'li olduğu için başka workspace'in oturumu da hiç denenmiyor. Yani `:99` silinse ya da `:93`'teki `session.workspace_id = target_workspace_id` süzgeci kalksa 38 hücrenin hepsi yine yeşil kalır.
- **Ne beklenirdi:** İki hücre:
  1. Can K ve B'de oturum açar, B'ye bir vardiya ekler. Owner Can'in B yetkisini kaldırır. Can Undo'ya basar. Beklenen: `42501` + `authz.out_of_scope`, oturumun revision'ı, vardiyaları ve Undo geçmişi değişmez.
  2. İkinci bir workspace'in oturum kimliği birinci workspace ile gönderilir. Beklenen: `P0002`.
- **Kişi için etkisi:** Bugün kod doğru. Ama yetki satırı ileride biri tarafından sessizce silinirse, Beşiktaş'tan çıkarılmış Can Beşiktaş'taki eski bir adımını hâlâ geri alabilir ve bunu hiçbir test yakalamaz. CLAUDE.md §9'a göre yeni davranış yeni test ister. Yetki yüzeyinde kanıt yoksa onay verilmez.

### Düşük 1: "Onaylı izin Undo'yu tümden reddeder" iddiası yalnız boş oturumda doğru
- **Nerede:** `:141` (yeniden ekleme) ve `:127` (güncelleme). Kontrolü yapan, tablodaki mevcut `zz_availability_assignment` tetikleyicisi: vardiyaya kişi yazılırken onaylı izni kontrol eden veritabanı kuralı.
- **Ne görüldü:** Bu kural iki durumda kontrolü atlıyor:
  - Satır yeniden eklenirken aynı kimlikli bir taslak satırı duruyorsa kontrol hiç koşmaz.
  - Güncellemede kişi, saat ya da iş değişmiyorsa kural erken döner. Bekleyen silmenin geri alınması böyle bir güncellemedir.
- **Örnek:** Ayşe "Week 3 plan" taslağını açar, Ali'nin Salı vardiyasını siler. Ali'nin Salı izni onaylanır. Ayşe Undo'ya basar ve Ali Salı'ya geri döner, ret gelmez. Test 5 bunu göremez çünkü yalnız boş kaynaklı oturumda koşuyor.
- **Neden düşük:** Ortaya çıkan hâl, oturumda zaten bulunmuş bir hâl. Taslağı yeniden açmak ve mevcut "Restore" düğmesi de aynı sonucu veriyor. Asıl sınır yayın: yayın sırasında kontrol koşuyor ve 23514 ile reddediyor (`schedule_availability_prior_publication` yalnız en son yayına bakıyor; izin onayı o satırı boşaltmış oluyor).
- **Öneri:** Migration yorumunu ve görev kaydını "izin yayında engeller" diye daraltın, ya da taslak kaynaklı bir hücre ekleyin.

### Düşük 2: Undo, kişinin işi ya da lokasyonu bitmiş olsa da eski atamayı geri getirir (görevde "kasıtlı yapılmadı" diye sorulan madde)
- **Ne görüldü:** Normal düzenleme (`mutate_schedule_edit_shift_service`) arşivlenmiş çalışanı ve bitmiş iş atamasını 23503 ile reddediyor. Undo bu kontrolü yapmıyor. Yayın (`publish_schedule_draft_service`) da iş atamasını yeniden kontrol etmiyor. İşten çıkarma (`terminate_employee_service`) yalnız yayınlanmış vardiyaları temizliyor, taslaklara ve açık düzenlemelere dokunmuyor.
- **Değerlendirmem:** Kabul edilebilir. Workspace sınırı aşılmıyor: lokasyon, oturumun lokasyonlarıyla sınırlı (`keep_session_shift_in_session_locations`) ve geri gelen her değer zaten bu oturumda bir kez bulunmuştu. Undo yalnız "o adım hiç atılmamış olsaydı" hâlini geri getiriyor. Eksik olan yayındaki uygunluk kontrolü, ve bu açık Undo'dan önce de vardı.
- **Öneri:** Backlog'a yazılsın: "yayın, çalışanın arşiv durumunu ve iş atamasını yeniden kontrol etsin". Leave: medium / do: moderate.

### Düşük 3: Revision karşılaştırması boş değerde kontrolü atlıyor
- **Nerede:** `:95` ve `:103`.
- **Ne görüldü:** `expected_session_revision` boş (NULL) gelirse "ekran eski mi" kontrolü atlanıyor. `actor_user_id` boş gelirse sahiplik kontrolü atlanıyor; ama hemen sonraki `authorize` boş kişiyi reddediyor. Bunu kendim denedim: `Not allowed`. Aynı kalıp mevcut düzenleme fonksiyonunda da var.
- **Öneri:** `<>` yerine `is distinct from`. Yetki açığı değil, yalnız eşzamanlılık kontrolü.

## Temiz çıkanlar
- **Tenant izolasyonu:** Oturum kimlik ve workspace ile birlikte kilitleniyor. Bütün silme, güncelleme ve ekleme `session_id = edit.id` ile sınırlı. Geçmiş tablosunun yabancı anahtarı `(session_id, workspace_id)`. Başka oturuma ya da başka lokasyonun planına yazan bir yol yok. Test 6 Can'in oturumunun değişmediğini kanıtlıyor.
- **İzinler:** `undo_schedule_edit_session_service` yalnız `service_role`'e açık, geçmiş tablosu `service_role` dahil herkese kapalı ve RLS açık. Tetikleyici fonksiyonları kimseye açık değil. Arama yolu boş. `authorization_coverage`'da `schedule.edit` olarak sınıflanmış.
- **Tetikleyici yetkisi:** Kayıt tetikleyicisinin ayrıcalıklı (SECURITY DEFINER) olmaması doğru. Tabloya `service_role` yazamıyor (yalnız SELECT/TRUNCATE/REFERENCES/TRIGGER var, hepsi eskiden kalma). Ayrıcalıksız `shift_exchange_rebase_drafts` ve `important_date_close_shifts` dışarıdan çağrılamıyor, yalnız `postgres` çalıştırabiliyor.
- **Yeniden tanımlanan üç fonksiyon:** Yerel DB'deki (main ucu, son migration `20261007110000`) tanımla boşluk farkı yok sayılarak karşılaştırdım. Değişen yalnız şunlar: acquire'a eklenen sınır satırları, takas ve kapalı gün fonksiyonlarına eklenen `undo_floor_revision = revision + 1`. Başka hiçbir şey değişmemiş. `CREATE OR REPLACE` mevcut izinleri koruyor.
- **Revision mantığı:** Oturum vardiyasına yazan bütün fonksiyonlar (düzenleme, toplu silme, şablon, Auto-fill, bekleyen değişiklik ekleme/kaldırma, takas sonrası düzeltme) önce yazıyor, sonra revision'ı artırıyor; adım doğru numarayla kaydediliyor. Oturumu yeniden almak revision'ı artırmadığı için oradaki geçmiş silme şart, ve var. Takas ve kapalı gün sınırı yeni revision'a çekiyor; eski adımlara ulaşılamıyor.
- **Bütünlük:** Hepsi tek transaction içinde, workspace kilidi ve oturum satırı kilidiyle. Belge ya da izin reddi bütün Undo'yu geri çeviriyor. Bu da test 5'te kanıtlı.
- **Silmede veri kaybı yok:** Oturum ve vardiya bağlantıları ON DELETE CASCADE; çalışan, iş ve lokasyon bağlantıları RESTRICT. Bu yüzden zincirleme silme sırasında hayalet bir geçmiş kaydı oluşmuyor. Kapanan oturumun geçmişini durum değişikliği tetikleyicisi siliyor.
- **Geri yazılan alanlar:** Tablonun bütün kolonları geri yazılıyor. Tek eksik `crosses_midnight`, o da hesaplanan bir kolon.

## Kanıt
- `git rev-parse HEAD` → `cc7a5e8b`. Diff tek commit. `origin/main` şu an `88f5e7a1`: arada yalnız web ve docs commit'leri var, DB çakışması yok.
- `pg_constraint` / `pg_trigger` / `role_table_grants` sorguları (yerel DB): yukarıdaki yabancı anahtar, tetikleyici ve izin tespitleri.
- `pg_get_functiondef` ile canlı tanımla migration karşılaştırması: yalnız beklenen satırlar değişmiş.
- `app_private.authorize(null, ...)` → `ERROR: Not allowed` (deneme geri alındı).
- **Testleri ben koşmadım:** `db.lock` başka oturumdaydı (`nf-backend/web`) ve main CI koşuyordu (`37449526408`). Kırmızı→yeşil ve 38/38 iddiası işi yapan oturumun ölçümü, bağımsız doğrulanmadı. "Gönder" öncesinde `db.lock` ile tam `test:db` şart.

## Öneri (zevk notu)
- Test 9'daki yazan fonksiyon taraması `delete from` kelimeleri arasında satır sonu olan bir yazımı kaçırır; `delete\s+from` daha sağlam olur.
- Yeni hafıza kaydı: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83\.claude\agent-memory\nf-guvenlik\checklist-availability-guard-hydration-skip.md`

### Tur 2 (`5c65dc2b`, Tur 1 düzeltmeleri) — `nf-guvenlik`

KARAR: ONAY @5c65dc2b (R3)

**Koordinatör için 5 satır**
- **Karar:** Onay, `5c65dc2b` için. Açık bulgu yok.
- **İzin:** R3. Koordinatörün "gönder" izni gerekiyor.
- **Risk:** 🟢 Yetki satırını ve workspace sınırını artık birer test kilitliyor; ikisinden biri silinirse test düşer.
- **Soru:** Yok.
- **Sonraki:** Gönderimden önce `db.lock` ile tam `test:db` koşmalı. Testleri ben koşturamadım: kilit `nf-backend/web`'deydi, main CI de koşuyordu.

## Bulgular nasıl kapandı

| Bulgu | Durum | Kanıt |
|---|---|---|
| Orta 1: Undo'daki yetki satırını hiçbir test korumuyordu | 🟢 Kapandı | Test, bölüm 7'nin sonu: Can hafta 5 düzenlemesini K ve B'de açar, B'ye bir vardiya ekler, sonra B'den çıkarılır. Undo `42501 authz.out_of_scope` ile reddedilir; vardiya, revision ve Undo geçmişi değişmez. |
| Orta 1: workspace sınırı da test edilmiyordu | 🟢 Kapandı | 'ux' workspace'inin owner'ı kendi oturumunu 'ud' workspace'i adıyla gönderir ve `P0002` alır. |
| Düşük 1: "onaylı izin Undo'yu reddeder" iddiası fazla genişti | 🟢 Kapandı | Migration'ın baş yorumu daraltıldı: taslak kopyasının gizlediği izin yayında reddedilir. |
| Düşük 2: Undo, işi ya da lokasyonu bitmiş kişinin eski atamasını geri getirir | Kabul edildi | Backlog önerisi koordinatörün raporunda. |
| Düşük 3: revision ve sahiplik karşılaştırması boş değerde kontrolü atlıyordu | 🟢 Kapandı | Migration'da iki satırda (:97 ve :105) `is distinct from` kullanılıyor. |
| Zevk notu: test 9'daki tarama satır sonunu kaçırıyordu | 🟢 Kapandı | Tarama `insert\s+into` ve `delete\s+from` ile yapılıyor. |

İki yeni test boşa geçmiyor; ilgili satır silinirse ikisi de düşer:
- Migration'daki `authorize` satırı silinirse Can'in Undo'su geçer. Test "reddedildi" beklediği için kırmızıya döner.
- Workspace süzgeci (`session.workspace_id = target_workspace_id`) kaldırılırsa oturum bulunur. Bu kez 'ux' owner'ı 'ud' üyesi olmadığı için yetki kontrolü `42501` döner. Test `P0002` beklediği için yine kırmızıya döner.

## Kanıt
- `git merge-base --is-ancestor origin/main 5c65dc2b`: doğru, dal `88f5e7a1`'in üstünde. Bu sırada `git fetch` yaptım, bu bir okuma.
- `git diff cc7a5e8b bb60fa5a -- supabase/`: 0 satır. Rebase, daha önce incelediğim veritabanı içeriğini değiştirmemiş.
- `git diff origin/main 5c65dc2b --stat`: yalnız 4 `supabase/` dosyası değişmiş. Düzeltme farkını (`bb60fa5a..5c65dc2b`) satır satır okudum.
- `9571a526` (rol hafızası): main'den bakınca yalnız benim hafıza kaydım ve dizindeki bir satır.
- 43/43 ve 5/5 sonuçları koordinatörün ölçümü, ben bağımsız olarak koşmadım. Test sayısı tutarlı: önceki 38 hücreye 4 kapsam hücresi ve 1 workspace hücresi eklenince 43 ediyor.

### Tur 3 (`86cfd059`, web hattının sözleşmesiyle yeniden kurulan tasarım) — `nf-guvenlik`

KARAR: ONAY @86cfd059 (R3)

**Koordinatör için 5 satır**
- **Karar:** Onay, `86cfd059` için. Kritik, Yüksek ya da Orta bulgu yok. Üç Düşük not var; hiçbiri göndermeyi durdurmuyor.
- **İzin:** R3. Koordinatörün "gönder" izni gerekiyor.
- **Risk:** 🟢 Workspace sınırı ve yetki kontrolü önceki onaylı sürümle aynı. Yeni yığın yalnız sahibinin kendi düzenlemesine dokunuyor.
- **Soru:** Yok.
- **Sonraki:** Gönderimden önce `db.lock` ile tam `test:db`. 54/54 senin ölçümün; ben koşturmadım, çünkü kilit `nf-backend/web`'deydi.

## Bakmamı istediğin beş nokta

| Konu | Hüküm | Gerekçe |
|---|---|---|
| Adım kimliği: istek saati + transaction | 🟢 Sağlam | Bir fonksiyon çalışırken istek saati değişmez. Üretimde her istek kendi transaction'ı. İki farklı yazma aynı anahtarı alamaz. Toplu yapıştırma tek komut olduğu için tek adım sayılıyor, istenen de bu. Bilinen tek sınır: bir istek mesajında birden çok komut gönderilirse (yalnız elle psql kullanımında olur) hepsi aynı saati alır. Bu sadece test çalıştırma biçimini etkiler. |
| 25 adımlık sınırın kırpma sorgusu | 🟢 Doğru | 25'ten az adım varken alt sorgu boş döner ve hiçbir şey silinmez. 25 adım varken yeni adım gelince en eski gider; 26 adımda derinlik 25, test 8'de kanıtlı. Undo önce kendi adımını yığından çıkardığı için kendi yazdıkları eski bir adımı itmiyor. |
| Takas ve kapalı gün için Undo sınırı | 🟢 Doğru | Bu komutun kendi yazdığı kayıtlardan dokunduğu oturumları buluyor; başka oturuma ulaşamıyor. Takas için test var (e7): geçmiş sıfırlanıyor ve "nothing to undo" dönüyor. Kapalı gün yalnız fonksiyon metninde sınırın çağrıldığı kontrol edilerek kilitli (Düşük 3). |
| `get_session`'a eklenen Undo derinliği sorgusu | 🟢 Ucuz | Yeni indeks üzerinde en çok 25 adımın satırlarını sayıyor. Schedule ızgarasının 50 ms bütçeli okuma yolu bu değil. Canlı tanımla farkı yalnız `undo_depth` satırı; boşluk farkı yok sayılarak karşılaştırıldı. |
| `xid8` karşılaştırması | 🟢 Doğru | 64 bitlik transaction kimliği taşmaz ve sıralanabilir. Burada yalnız aynı mikro saniyedeki iki adımı ayırmak için kullanılıyor. |
| Vardiya revision'ının geri dönmeyip ileri gitmesi | 🟢 Doğru seçim | Eski numarayı tutan bir ekran sessizce yazamaz, "stale" cevabı alıp yeniden yükler. Web'in "önceki hâliyle" isteği vardiyanın içeriği için; Undo içeriği aynen geri getiriyor. |

Değişmeyenler:
- Oturumun sahibi kontrolü, yetki kontrolü, başka workspace hücresi ve yetkisi daralan müdür hücresi yeni test dosyasında duruyor.
- İzinler: yeni Undo fonksiyonu yalnız `service_role`'e açık, sınır fonksiyonu tarayıcıya kapalı. Kapsam tablosundaki ad güncellenmiş.
- Yeniden tanımlanan `acquire`, takas ve kapalı gün fonksiyonları canlı tanımdan yalnız DB-1c satırlarıyla ayrılıyor.

## Düşük notlar (göndermeyi durdurmaz)
1. **Adım sırası istek saatine dayanıyor, uygulama sırasına değil.** Tabloda `step_at` ve `step_xact`; seçim Undo fonksiyonunda `order by step_at desc, step_xact desc`.
   - **Örnek:** Ayşe iki sekmede aynı haftayı açık tutuyor. Bir sekmede toplu silme yapıyor (`bulk_delete_schedule_edit_shifts_service`, oturum revision'ını kontrol etmez), aynı anda öbür sekmede bir kart sürüklüyor. Önce gelen istek kilidi sonra alabiliyor; saat geri atlarsa da sıra bozulur. İkisi aynı vardiyaya dokunduysa, iki Undo'dan sonra ortada bir ara hâl kalır.
   - **Etki:** Yalnız sahibinin kendi düzenlemesi; workspace sınırı aşılmıyor.
   - **Öneri:** Kayıt anında alınan bir sıra numarası (identity kolonu) ile sıralamak.
2. **25 adım doluyken lokasyon eklemek en eski adımı düşürüyor.** `acquire` kendi kayıtlarını sonradan siliyor, ama tetikleyici o sırada "yeni adım geldi" sayıp en eskiyi kırpmış oluyor. Derinlik 25 yerine 24'e iniyor. Tetikleyici `acquire`'ın kaydını hiç yazmazsa ya da `acquire` silmeden önce kırpmaya bakarsa düzelir.
3. **Kapalı gün sınırının davranış testi yok.** Yalnız fonksiyon metninde sınır çağrısının bulunduğu kontrol ediliyor. Takastaki gibi bir hücre eklemek ucuz olur.

## Kanıt
- `git diff 5c65dc2b 86cfd059 -- supabase/` satır satır okundu. Değişen dosyalar: migration, Undo testi, `authorization_coverage` (tek satır: ad değişikliği).
- `pg_get_functiondef` ile canlı tanımla karşılaştırma (yerel DB'deki son migration `20261007110000`): `get_schedule_edit_session_service` yalnız `undo_depth`; `acquire` yalnız kendi kayıtlarını silen 4 satır; takas ve kapalı gün yalnız sınır çağrısı ekliyor.
- Test hücreleri tarandı: boş yığında `PT409` (`schedule.nothing_to_undo`), yapıştırma tek adım, 26 adımda derinlik 25, takas geçmişi sıfırlıyor, yetkisi daralan müdür `42501`, başka workspace `P0002`.
- Bu turdaki iki hafıza kaydı yalnız diske yazıldı, commit'lenmedi:
  - `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83\.claude\agent-memory\nf-guvenlik\checklist-step-order-by-clock.md`
  - `MEMORY.md`'ye bir satır
