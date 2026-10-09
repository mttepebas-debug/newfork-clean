# G8a / BL-132 — güvenlik ve kod incelemesi (R3)

**KARAR: DEĞİŞİKLİK İSTENDİ** (`origin/task/g8a` @ `3a538338`, taban `origin/main` `bd164bfb`)

Rol: nf-guvenlik (salt okunur). 2026-09-30. Fark: 5 dosya, +748 / −7 (migration `20261003000000_an_archived_location_counts_nowhere.sql` + 4 test dosyası).
Yetki çekirdeğinin değişikliği doğru ve fail-closed; güvenlik açığı yok. Ama çekirdek arşivli lokasyonu "hiçbir yerde" sayınca, arşivli bir lokasyonda ataması süren herkesin Employees kaydı — owner'ın kendi kaydı dahil — hiçbir yoldan kaydedilemez hâle geliyor. Bir Yüksek bulgu; düzeltme `nf-db`'de, küçük.

## 1. Bulgular

### Yüksek

**Y1. Arşivli lokasyonda ataması olan kişinin kaydı kimse tarafından kaydedilemiyor (owner'ın kendi kaydı dahil).**
Yer: `save_employee_service` (son tanım `supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql:146-166`). Bu dal onu değiştirmiyor, ama kullandığı `scope_set` artık arşivliyi içermiyor.
Neden: kayıt iki şey soruyor: (1) gönderilen her lokasyon canlı olmalı (`archived_at is null`); (2) bırakılan her atama okuyanın kapsamında (`reachable = scope_set(...)`) olmalı. Lokasyon arşivlenince atama bitmiyor (tasarım: geri alınınca geri gelsin). Dal öncesi owner/admin arşivli lokasyonu bırakabiliyordu (kapsamdaydı); dal sonrası arşivli lokasyon kimsenin kapsamında değil. Sonuç: arşivli lokasyonu göndermek de, bırakmak da ret.
Örnek: Mert Beşiktaş'ı arşivler. Emre Kadıköy + Beşiktaş'ta çalışıyor. Mert, Emre'nin çekmecesinde başlangıç tarihini düzeltir, Save → "Not allowed". Beşiktaş'ı bırakmak da ret; üstelik dal sonrası çekmecenin lokasyon seçicisi arşivliyi listelemiyor (`employee_references_ask_the_core` beklentisi), bırakacak satır da yok. "Remove from location" da ret. Mert kendi kaydını da kaydedemez: owner her lokasyonda kayıtlı, arşivli dahil.
Ölçüm (geri alınan işlem, `db.lock` ile; test dünyası, Beşiktaş arşivli):

| Senaryo | main (migration'sız) | dal (migration'lı) |
|---|---|---|
| A. owner, Emre'yi Beşiktaş'ı bırakarak kaydeder | allowed | **42501 authz.out_of_scope** |
| B. owner, Emre'yi okunduğu gibi (K, B) kaydeder | 42501 | 42501 |
| C. owner, Emre'yi Beşiktaş'tan "Remove" eder | 42501 | 42501 |
| D. owner kendi kaydını Beşiktaş'ı bırakarak kaydeder | allowed | **42501** |
| E. owner kendi kaydını okunduğu gibi kaydeder | 42501 | 42501 |
| F. Kadıköy müdürü Kaan, Emre'yi Beşiktaş'ı bırakarak kaydeder | allowed | **42501** |
| G. Kaan, Emre'yi okunduğu gibi kaydeder | 42501 | 42501 |

Dalda yedi yolun yedisi kapalı: kayıt, lokasyon arşivden çıkana kadar donuyor (ad, iş, not, Remote — hiçbir alan değişmez). Arşivleme sık bir işlem ve atamaları bitirmiyor; etkilenen kişi "o lokasyonda çalışan herkes + owner".
Öneri (`nf-db`): kayıt, canlı olmayan (arşivli ya da silinmiş) bir lokasyondaki var olan atamaya dokunmasın — gönderilse de gönderilmese de olduğu gibi kalsın; kapsam ve "canlı mı" sorusu yalnız yeni eklenen ve bırakılan CANLI lokasyonlara sorulsun. Bu KK-13'le uyumlu (arşivli hiçbir yerde sayılmaz, geri alınınca atama geri gelir) ve ürün kararı gerektirmiyor. Birincil lokasyon arşivliyse ne olacağına `nf-db` baksın (dokunulmadan kalabilir ya da ilk canlı lokasyona geçer — ikincisi ürün sorusuysa koordinatöre). Hücreler: A, B, D, E, F, G allowed (arşivli atama yerinde kalır); arşivli lokasyonu YENİ ekleme hâlâ ret; geri alınınca atama duruyor.
Aynı düzeltme main'deki bir hatayı da kapatır (E1).

### Ek (main'de, bu dalın değil — EMP-001 C ikinci turunda benim kaçırdığım)

**E1. Main'de bugün: bir lokasyon arşivliyse owner kendi çekmecesini kaydedemiyor.** EMP-001 C3 owner'ın lokasyonlarını "okunduğu gibi" kilitledi (`apps/web/src/employees/EmployeeDrawer.tsx`, `fixedReason`); çekmece arşivli lokasyonu da gönderiyor (`toDraft`: `location_ids: detail.locations.map(...)`), veritabanı reddediyor (tablo, satır E, main sütunu). Owner olmayan kişide main'de bir çıkış var (arşivli satırın işaretini kaldırmak, satır A); owner'da yok. Veritabanı tarafı ölçüldü; web tarafı kod okumasıyla, ekranda denenmedi. Benim hatam: C3 ikinci turunda arşivli lokasyonu denemedim. Y1'in veritabanı düzeltmesi bunu da kapatır; G8a birleşmezse ayrı backlog maddesi olmalı (leave: high / do: moderate).

### Not

- **N1. Aynı ailenin başka üyesi olabilir (doğrulanmadı).** Bir kaydın birden çok lokasyon taşıdığı öteki yerlerde arşivli lokasyon, kaydı herkes için düzenlenemez yapabilir. Aday: Settings → Important Dates — web, tarihin her lokasyonu kapsamdaysa düzenlemeye izin veriyor (`apps/web/src/settings/ImportantDatesSettingsPage.tsx:89`); arşivli lokasyonu da taşıyan bir tarih dal sonrası owner için bile kilitlenebilir. Şablonlar ve dışa aktarma planları `live_location_ids` ile arşivliyi düşürdüğü için etkilenmez. `nf-db` Y1'i düzeltirken aynı soruyu çok lokasyonlu kayıt taşıyan servislere de sorsun.

## 2. Sorulan yedi başlık

| # | Soru | Cevap |
|---|---|---|
| 1 | Fail-closed; "bilinmeyen = kapsam dışı"; owner/admin `org` | Evet. Hedef lokasyon arşivliyse cevap bilinmeyenle aynı (`authz_check`, `out_of_scope`). Kişi hedefinde owner/admin `org` erişimi `cardinality(places) = 0` sorusundan önce dönüyor; bozulmadı. Yeni muafiyet yok. |
| 2 | Pre-mortem 1 (owner arşivliyi görür, geri alır) | Kanıtlı: hücreler tarayıcı olarak koşuyor (`tests.as_browser`, tablo politikaları): owner ve admin okur, owner geri alır. |
| 3 | Web'de arşivli lokasyonu hâlâ bekleyen yer | Çekmecenin kendisi (Y1, E1). Kapsam listesini okuyan `AuthContext` → `can.ts` ve `ImportantDatesSettingsPage` arşivliyi kaybediyor (N1). Başka ekran kırığı bulmadım (arama: `locationScope.locationIds`, `location_ids`). |
| 4 | CHECK yerine `guard_catalog_deletion_state` | Yeterli: tetikleyici `before insert or update`, lokasyon + departman + işte; `revoke` edilmiş. İkinci kopya ikiz kural olurdu. |
| 5 | Önizlemeden silinen satır içi red | Cevap aynı (42501 + `authz.out_of_scope`); çekirdek fonksiyonun başında lokasyon başına soruyor, sıra değişmedi. `refusals_say_why` hücresi aynı cevabı kilitliyor (yazarın ölçümü). |
| 6 | Test yeterliliği, `ci-green`, `deleted_location_counts_nowhere` | Yeni dosya migration'sız 13 hücre kırmızı, `ci-green.txt` +1, bekçi 0 (yazarın ölçümü; fark +1 satırı ben de gördüm). `deleted_location_counts_nowhere`: arşivli Moda hücresi kuralla birlikte ters çevrildi, gevşetme değil. Eksik: arşivli lokasyonda çalışan kişinin KAYDI hiç sınanmamış — Y1 bu boşluktan geçti. |
| 7 | Sıra (OPS-03) | Alan eklemiyor, silmiyor; yalnız kural. Eski kod yeni kurala takılmaz, canlı site bu repodan yayın almıyor (BL-426). Main önce girebilir, canlı gönderim kullanıcıyla sonra — ama Y1 düzeltilmeden hiçbiri değil. |

## 3. Doğrulananlar (sorun yok)
- Altı gövde `origin/main`'deki son tanımla `diff -w`: yalnız `deleted_at is null` → `app_private.location_is_live(location)` değişimi, iki yere `join public.locations` (actor `works`, `authz_check` kişi `places`) ve önizlemenin satır içi reddinin silinmesi. Araya başka satır girmemiş.
- `location_is_live`: SQL, `immutable`, `search_path ''`, `revoke all … from public`. Onu çağıran `live_location_ids` SECURITY DEFINER değil, ama `anon`, `authenticated`, `service_role`'dan zaten `revoke` edilmiş; yalnız SECURITY DEFINER servislerden çağrılıyor — izin hatası çıkmaz.
- Grant, politika, yeni eylem yok; imzalar aynı.
- Bilinçli yan etki: bir kişinin öteki lokasyonu arşivliyse, kalan lokasyonunun müdürü "hepsi kapsamda olmalı" (`all`) kuralıyla da o kişiye dokunabilir (kişi `places` artık arşivliyi saymıyor). KK-13'ün ve Q-C'nin sonucu; geri alınınca eski hâline döner. Hücresi yok (öneri: Y1 ile aynı turda bir hücre).

## 4. Kanıt (2026-09-30, bu oturumda)
| Komut | Sonuç |
|---|---|
| Altı fonksiyon: main son tanımı ↔ dal, `diff -w` | yalnız istenen satırlar |
| Test dünyası + Beşiktaş arşivli, yedi senaryo; migration'sız ve migration'lı, her biri tek işlemde `rollback`, `db.lock` ile | tablo (Y1) |
| Kalıcı iz | yok: son migration `20261002000000`, `location_is_live` yok, 315 workspace |
| Kaynak | `optimistic-dewdney-c78421` worktree `3a538338`'de, `supabase/` temiz; migration dosyası arşivle `cmp` aynı |

Koşturmadıklarım: tam `test:db` (yazar 145 dosya koşmuş), yetki matrisi, `schedule_grid_read_budget`; dal CI koşuyor. Alt ajan açılmadı.
Deneme dosyaları: scratchpad `g8/p_none.sql`, `g8/p_mig.sql`, `g8/probe_body.sql`.

## 5. Sonraki adım
`nf-db`: Y1 (kayıt, canlı olmayan lokasyondaki atamaya dokunmaz) + hücreler + `all` erişimi hücresi; N1 için çok lokasyonlu kayıt taşıyan servislere aynı soru. Sonra bana kısa bir tur (yalnız fark).

---

# İkinci tur — yalnız fark (`3a538338..8c654abf`)

**KARAR: DEĞİŞİKLİK İSTENDİ @8c654abf**

Y1 düzeltmesi doğru ve yeni bir açık açmıyor. Ama ilk turda benim de "kanıtlı" dediğim pre-mortem 1 yanlış yoldan kanıtlanmış: **owner arşivli lokasyonu Settings → Locations'ta göremiyor, dolayısıyla geri alamıyor** (Y2, Yüksek).

## 1. Bulgular

### Yüksek

**Y2. Settings → Locations arşivli lokasyonu owner'a ve admine artık listelemiyor; "Restore" yapılamaz.**
Yer: ekranın listesi `apps/web/src/settings/organization-data.ts:234` `listLocations` → `readSettings(…, "locations")` → API `apps/api/src/settings/settings-reads-service.ts:11` → `public.list_settings_locations_service` (`supabase/migrations/20260927100000_settings_reads_ask_the_core.sql:47-58`). Servis listeyi `app_private.scope_set(…, 'settings.locations.read')` ile süzüyor; G8a'dan sonra `scope_set` arşivliyi içermiyor.
Örnek: Mert Beşiktaş'ı arşivler. Settings → Locations'ı açar: listede yalnız Kadıköy var; Beşiktaş'ı geri alacağı satır yok. Arşiv bu ekrandan geri alınamaz hâle gelir — KK-13'ün "geri alınınca kapsam kendiliğinden döner" vaadi ekranda çalışmaz.
Neden kaçtı: hücreler (ilk turdaki 17–19) tabloyu tarayıcı olarak doğrudan okuyor (`tests.as_browser`, tablo politikaları). Ekran tabloyu okumuyor, servisi okuyor. Benim hatam da: ilk turda hücrelerin ekranın yolunu sınadığını kontrol etmedim.
Kanıt: yazarın worktree'sinde (`optimistic-dewdney-c78421`, commit'lenmemiş, 40 hücrelik yeni sürüm) tam bu hücreler kırmızı: "Settings > Locations lists the archived Besiktas to the owner, to restore it" → `have: {KDK}`, "and to the admin" → aynı. Yazar muhtemelen bunu zaten yakaladı ve düzeltiyor; bu kararın konusu `8c654abf`.
Öneri (`nf-db`): Settings → Locations'ın okuması arşivli satırları owner/admine (bugün tabloyu kimin gördüğüyle aynı kural) göstermeye devam etsin — ör. bu servis `scope_set` yerine ayarlar kataloğunun kendi kuralıyla okusun ya da arşivli satırları ayrıca eklesin; hücre ekranın yolundan (servis) sınansın. Aynı soruyu arşivli lokasyonu bilerek göstermesi gereken öteki ayar okumalarına da sorsun (yeni bir tane görmedim; arama `scope_set(` çağıran `list_settings_*`).

## 2. Sorulan dört başlık

| # | Soru | Cevap |
|---|---|---|
| 1 | Düzeltme yeni fail-open açıyor mu | Hayır. `kept` yalnız hedef kişinin KENDİ, süren, canlı olmayan atamaları; `authorize(...)`'dan sonra hesaplanıyor (`save_employee_service`, dal sürümü satır 25–35). Kapsam dışı kişi: `authorize` önce reddeder (kişinin canlı lokasyonu yoksa `org` olmayan herkese `out_of_scope`). Başka workspace'in lokasyon id'si: `kept`'e giremez (kişinin ataması değil), gönderilirse canlılık/workspace denetiminde ret. Arşivli lokasyonu kişiye YENİ eklemek: ret (ölçüldü, H). Silinmiş lokasyon: silme arşivi de basar, `kept` onu da korur; süren atama zaten beklenmez. |
| 2 | Birincil lokasyon arşivliyse | Gönderilen `primary_location_id` izleniyor; arşivli birincil okunduğu gibi gönderilirse yerinde kalır, başka canlı lokasyon seçilirse oraya geçer. Arşivli lokasyonu (kişinin zaten tuttuğu) birincil seçmek de mümkün; zararsız, geri alınınca anlamlı. Not düzeyi. |
| 3 | Arşivlide "Remove" ret — çıkışsız mı | Çıkışsız değil: owner lokasyonu geri alır (Y2 düzelince), kişiyi çıkarır, yeniden arşivler; ya da kişiyi arşivler/sonlandırır. Silinmiş lokasyonla aynı davranış. Engel değil; ekranda neden kapalı olduğu yazmıyorsa küçük bir UX notu (backlog, leave: low / do: safe). |
| 4 | N1'in önemi | Düşük. Yazarın ölçümü: Important Dates veritabanında etkilenmez (yazma kuralı `can_manage_important_date` → `membership_location_scopes`, arşivliyi hâlâ sayıyor). Etki yalnız web'de ve yalnız manager'da: arşivli lokasyonu da kapsayan bir tarihi ekranda düzenleyemeyebilir (web daha sıkı). Asıl önemli yan: çekirdeğe sormayan ikiz kural (`can_access_location` / `membership_location_scopes`, `save_announcement_audience_service`'in satır içi süzgeci) arşivliyi farklı sayıyor — BL-423'e yazılsın (leave: medium / do: moderate). |

## 3. Kanıt (2026-09-30, bu oturumda, `db.lock` ile, hepsi `rollback`)
| Komut | Sonuç |
|---|---|
| `save_employee_service` main son tanımı ↔ dal, `diff -w` | yalnız `kept` ve onu kullanan dört koşul + bitirme satırı |
| Yedi senaryo + iki ek, dal migration'ı (`8c654abf`, commit'lenmiş dosyayla `cmp` aynı) | A, B, D, E, F, G allowed; C (Remove) 42501; H (arşivli lokasyonu yeni kişiye eklemek) 42501; Emre'nin atamaları kayıtlardan sonra `Besiktas,Kadikoy*` (arşivli atama yerinde) |
| Yazarın worktree'sindeki (commit'lenmemiş) test dosyası | 40 hücreden 18 ok, 2 kırmızı (Y2 hücreleri), 1 hata (`settings.locations.read` reddi) — commit'lenmiş 36 hücrelik sürümü ayrıca koşmadım |
| Kalıcı iz | yok: son migration `20261002000000`, `location_is_live` yok, 315 workspace |

Koşturmadıklarım: tam `test:db`, matris (yazar tam paketi koşmuş: kırmızı küme tabanla aynı). Dal CI koşuyor.

## 4. Sonraki adım
`nf-db`: Y2 (Settings → Locations okuması arşivliyi owner/admine göstersin; hücre servis yolundan). Sonra bana yine yalnız fark.

## 5. Sıra cevabı düzeltmesi (ilk turun 7. sorusu; koordinatörün düzeltmesiyle, 2026-09-30)
(Aşağıdaki "Üçüncü tur" bu bölümden sonra gelir.)
İlk turdaki "canlı bu repodan yayın almıyor (BL-426)" dayanağı yanlıştı: main canlıya yayın alıyor (`newfork-clean-api`; koordinatörün ölçümü — benim Vercel yoklamam izin verilmediği için koşmadı). G8a web ve API kodunu değiştirmiyor, yalnız veritabanı kuralını; bu yüzden hangi sırayla giderse gitsin canlıda 500 türü bir kırılma olmaz. Yine de OPS-03 sırası uygulanır (önce canlı migration, sonra main) ve canlıya giden migration Y2'si düzeltilmiş sürüm olmalı: kural migration'la birlikte canlıya iner, Y2 düzelmeden giderse owner canlıda arşivli lokasyonu geri alamaz.

---

# Üçüncü tur — yalnız fark (`8c654abf..53c70344`)

**KARAR: ONAY @53c70344**

Y2 ve ultrareview'ün iki bulgusu kapandı; istisnalar dar, yeni boşluk bulmadım. Bulgu yok; bir not.

## 1. Y2 — Settings → Locations (`list_settings_locations_service`, migration'ın sonu)
- **İstisna dar mı:** evet, üç yönden.
  - Yalnız bu okuma: çekirdek (`scope_set`, `authz_check`) değişmedi; ek satırlar yalnız bu servisin dönüşüne giriyor.
  - Yalnız yazma yetkilisi: önce okuma yetkisi soruluyor (`settings.locations.read`), sonra `settings.locations.write` (kapsam sınıfı `org`, izni `settings.locations.manage`). Manager ve employee okumayı hiç geçemiyor (hücre 21).
  - Yalnız aynı workspace, yalnız silinmemiş: `location.workspace_id = target_workspace_id and location.deleted_at is null`; `settings_locations` da workspace ve `deleted_at` ile süzüyor. Başka workspace'in arşivlisi listelenmiyor (hücre 22).
- **Yeni görünürlük yok:** `settings.locations.read` izni olan zaten tablodan bütün lokasyon satırlarını (arşivli dahil) okuyabiliyor (`locations_select_scoped_member` politikası); geri alma da tablo politikasıyla (`settings.locations.manage`). Liste, kişinin zaten yapabildiğini gösteriyor.
- Hücreler bu kez ekranın yolundan: 19–22 doğrudan `list_settings_locations_service`'i çağırıyor; 23 admin geri alır.

## 2. Ultrareview 1 — dışa aktarma kuralı (`update_schedule_export_schedule_service`)
- Main'deki son tanımla `diff -w`: tek fark yetki sorusunun listesi. Önce: süzülmüş liste soruluyor, süzülmemiş liste yazılıyordu (G8a'dan sonra arşivli ve yönetilmeyen lokasyon sorulmadan yazılabilirdi). Şimdi: kurala eklenen her lokasyon soruluyor; yalnız kuralda zaten duran ve canlı olmayan sorulmuyor (Y1 ilkesi).
- **Yeni boşluk yok:**
  - Arşivli lokasyonu yeni eklemek: sorulur, çekirdek reddeder (hücre 24).
  - Bilinmeyen ya da başka workspace'in id'si: `live_location_ids` bilinmeyeni düşürmez, zaten kuralda da değil → sorulur → ret.
  - Silinmiş lokasyon kuralda duruyorsa: sorulmaz, yazılır; ama canlı olmadığı için dışa aktarmaya girmez (`live_location_ids` gönderim adaylarında süzüyor). Yetki genişlemesi yok.
  - Oluşturma servisi zaten bütün listeyi soruyor (değişmedi).
- **Ultrareview'ün öteki bulgusu** (2 numara) Y2'nin kendisi; kapandı. Başka bulgu yok (yazarın notu: iki bulgu).

## 3. Not
- **N2. Tek lokasyonu arşivlenen dışa aktarma kuralını manager düzenleyemez.** Kuraldaki bütün lokasyonlar arşivliyse sorulacak liste boş kalır; manager'da boş hedef `out_of_scope`. Yani kuralı kapatamaz ya da adını değiştiremez; owner/admin (`org`) değiştirebilir. Kural bu arada hiçbir şey göndermez (arşivli lokasyon adaylardan düşüyor). Zarar yok; lokasyon geri alınınca manager yine düzenler. Backlog'a (leave: low / do: safe) ya da bırakılabilir.

## 4. Kanıt (2026-09-30, bu oturumda)
| Komut | Sonuç |
|---|---|
| `git diff 8c654abf 53c70344 -- supabase/migrations` + dışa aktarma servisinin main son tanımıyla `diff -w` | yalnız yukarıdaki iki değişiklik |
| Commit'lenmiş `archived_location_counts_nowhere` (`53c70344` arşivinden), commit'lenmiş migration + kurucu, tek işlem `rollback`, `db.lock` ile | 42 / 42; hücre 19–24 yeşil |
| Kalıcı iz | yok: son migration `20261002000000`, `location_is_live` yok |

Koşturmadıklarım: tam `test:db` (yazar 145 dosya; kırmızı küme tabanla aynı, iki bl052 dosyası zamana bağlı), dal CI (koşuyor).

## 5. Sıra
Koordinatörün yazdığı gibi: yerel migration → canlı gönderim (kullanıcı; OPS-03) → main. G8a web/API kodunu değiştirmiyor; canlı gönderim ile main arasında kırılma beklenmez, ama sıra yine OPS-03.
