# nf-guvenlik — FB-6.2 `.7b-db` incelemesi (R3)

## Yeniden bakış (2026-09-30): KARAR: ONAY @62a611b6
Fark `02162f94..62a611b6` okundu:
- **D1 kapandı.** Düzen servisi artık `workspace.todos` olarak sınıflı.
- **D2 kapandı.** Sayaç `<= 175`, ölçüm satırıyla birlikte; CI'da `authz_catalog` ok.
- **D4 kapandı.** Tek yardımcı `app_private.manages_without_working(w, member)`: çekirdeğin
  `actor().class = 'manager'` cevabı, hesap yoksa `false`, `security definer`, `search_path = ''`,
  `public`, `anon` ve `authenticated`'a kapalı. Çekmece ve komut ikisi de bunu soruyor
  (pgTAP `pg_get_functiondef` hücresi).
- **D5 kapandı.** Eylem satırı yoksa detay ve liste `22023` ile reddediyor (iki pgTAP hücresi).
  `set_employee_managed_locations_service` yeniden yazıldı; gövdesi eskisiyle aynı, yalnız
  yönetici kontrolü yardımcıya geçti.
- Yeni bulgu yok. Kanıt: CI `36623860474` (`62a611b6`): check, db ve e2e success;
  `Files=142, Tests=11695, Result: PASS`.
- **Entegrasyon notu:** `.7b` bu migration'ın eski hâlini (`90d91cf7`) taşıyor. Main'e ve ortak
  DB'ye yalnız bu hâl gitmeli (bkz. `fb62-7b/RAPOR.md` B1).

## İlk inceleme (@02162f94)

**KARAR: ONAY @02162f94**. Kritik, Yüksek ya da Orta bulgu yok. Beş Düşük bulgu var; D1 ve D2 yalnız
test dosyası, main'e girmeden aynı dala eklenmeleri önerilir (yalnız test farkına bakılır, tam
inceleme gerekmez).

İncelenen: `task/fb62-7b-db` @`02162f94` (taban `2a8d8215`), `git diff origin/main...origin/task/fb62-7b-db`:
migration `20260930180000_the_drawer_reads_what_the_core_allows.sql`, test
`employee_drawer_reads.test.sql`, `ci-green.txt` +1 satır. Kararlar: KK-29, KK-33…KK-36, DATA-08.
Tarih 2026-09-30.

## Kontrol edilenler (sorun yok)

**1. Çekmece ve liste okuması (`get_employee_detail_service`, `list_employees_service`)**
- **Başka workspace sızmıyor.** `me` hedef workspace için kuruluyor (`app_private.actor(actor, target_workspace_id)`).
  `membership_managed_locations`'ta üyelik ve lokasyon için iki yabancı anahtar (FK), ikisi de workspace
  alanını içeriyor; başka workspace'in satırı bu tabloya giremiyor. Detay çağrısı önce
  `authorize('employee.read')` yapıyor. Test: başka workspace'in owner'ı 42501 alıyor ve listesinde
  yönetilen lokasyon adı çıkmıyor.
- **Okuyanın ulaşmadığı lokasyonun adı gitmiyor.** `managed_locations` ve `managed_location_names`
  `managed.location_id = any (me.manages)` ile süzülüyor. `me.manages` owner/admin için silinmemiş
  bütün lokasyonlar, yönetici için çalıştığı ve yalnız yönettiği yerler, çalışan için boş.
  Çalışan hiçbir ad görmüyor (fail-closed). Örnek (testli): Ayşe yalnız Beşiktaş'ı yönetiyor;
  Selin'in yönettiği Cihangir'i görmüyor.
- **`removable` komutla aynı soruyu soruyor.** `authz_check(me, employee.remove_from_location,
  array[lokasyon], kişi, null)`, `remove_employee_from_location_service`'in `authorize` çağrısıyla aynı
  argümanlar. Satır yalnız kişinin gerçekten atandığı lokasyonlar için üretiliyor; komutun "orada
  çalışmıyor" reddiyle çelişmiyor.
- **`allowed` anahtarları komutlarla aynı cevabı veriyor.** `set_managed_locations` (hedef yönetici
  değilse `false`, komutun 22023'üyle aynı), `invite` ve `onboarding_review` komutların
  `authorize(…, target_person)` çağrısıyla aynı. Farklar D3'te.
- **Editör, okuyanın görmediği lokasyonu sildirmiyor** (KK-35'in gerekçesi). `set_managed_locations`
  hedefi yönetici olmasını istiyor ve rütbe kuralı var (`rank_below`); bu yüzden `true` yalnız
  owner ya da admin'e çıkıyor. Onların `manages` listesi silinmemiş bütün lokasyonlar, editör tam
  listeyle açılıyor. Silinmiş lokasyon listeye gelmiyor. Kaydedilince tablodan düşüyor; bu zararsız.
- **Rolü yöneticiden düşen kişide "Manages" kalmıyor.** `managed_locations_follow_role` tetikleyicisi
  satırları siliyor (`20260930130000`).
- **Grant'lar doğru.** Liste fonksiyonu drop + create yapıldı. Hemen ardından `public`, `anon` ve
  `authenticated` yetkisi geri alınıyor, yalnız `service_role`'e veriliyor; bu eski
  `20260908132000` ile aynı ve Supabase'in yeni fonksiyona verdiği varsayılan izinleri de kapatıyor.
  Fonksiyonda `comment on function` yoktu, kaybolan bir şey yok. Detay fonksiyonu
  `create or replace`; yetkiler korunuyor. Hepsi `security definer` + `search_path = ''`.
- **Canlıya önce migration gitmesi güvenli** (OPS-03). API cevabı `employeeSummarySchema` ve
  `employeeDetailSchema` ile okuyor. İkisi de strict olmayan `z.object`; fazla anahtarı atar.
  Eski kod yeni alanlarla kırılmaz.

**2. Workspace ana sayfası düzen kaydı (KK-36)**
- `save_workspace_layout_service` artık `authorize('workspace.todos')` kullanıyor (eskisi ipuçsuz 42501
  veren `communication_actor_has_capability_service`).
- Çalışan `42501 authz.missing_permission`, başka workspace `authz.not_member` alıyor (testli).
  Kapalı workspace ve kısıtlı ya da belge engelli üye çekirdeğin ortak kapısında reddediliyor
  (KK-34, `workspace.todos` `restricted_ok = false`).
- Kapı, doğrulamadan önce çalışıyor. Veri yalnız aktörün kendi satırına yazılıyor
  (`user_id = actor_user_id`).

**3. Katalog ve sayaçlar**
- Yeni `*_service` yok. Liste aynı imzayla yeniden kuruldu; `authorization_coverage` sınıflaması
  (`employee.list`) geçerli.
- Hiçbir sayaç artmadı. İpuçsuz 42501 sayısı bir azaldı (bkz. D2).

## Bulgular

**D1 — Düşük: düzen servisinin sınıflaması eskidi.** `supabase/tests/authorization_coverage.test.sql:229`
`('save_workspace_layout_service', 'account.self')` diyor, servis artık `workspace.todos`'a soruyor.
Test kapıyı açmıyor ama sınıflama yanlış eylemi gösteriyor. Bir sonraki okuyan düzen kaydını
"kendi hesabı" sanar. Beklenen: `'workspace.todos'`. Yan bulgu (bu dalın değil, main'de var):
aynı dosyanın 110. satırı `get_workspace_dashboard_service`'i `workspace.read` diye sınıflıyor, oysa
fonksiyon `workspace.todos`'a soruyor (T5b-4). Backlog'a önerilir; bu dalla birlikte düzeltmek de
küçük.

**D2 — Düşük: ipuçsuz ret sayacı sıkılaşmadı.** `supabase/tests/authz_catalog.test.sql:93` `<= 176`.
Bu dal bir ipuçsuz 42501'i kaldırdı (eski düzen kapısı). Sayaç ölçülüp düşürülmeli (beklenen 175)
ve yorumdaki ölçüm satırına eklenmeli. Dosyanın kuralı: "yalnız azalır, ölçülen değere çekilir".
Ölçümü ben yapmadım: migration'ı ortak DB'de denemek `db.lock` isterdi, bu karar için değmedi.

**D3 — Düşük: iki `allowed` bayrağı komuttan daha iyimser.** Bunlar ekran ipucu; kapı değiller.
Komut yine reddediyor, yani erişim açılmıyor.
- `onboarding_review` (KK-33, bilinen): yalnız yönettiği lokasyondaki kişi için `true`, ama servis
  FB-6.6'ya kadar `P0002` dönüyor. Yönetici butonu görür, tıklayınca "bulunamadı" alır.
- `invite`: çekirdek sorusu yalnız kişi ve kapsam. Komut ayrıca hesabı bağlı olmayan, arşivsiz kayıt
  ve verilebilecek rol istiyor (`P0002` / `authz.rank`). Hesabı zaten bağlı kişide `invite = true`
  görünür. `.7b` butonu `display_status`'la birlikte gösterirse sorun olmaz. `.7b`
  incelemesinde bakacağım.

**D4 — Düşük: "yalnız yönetici yönetir" kuralı iki yerde yazılı.** Detayda
`role.access_class is not distinct from 'manager'` var, komutta
`(app_private.actor(...)).class <> 'manager'`. Bugün ikisi aynı cevabı veriyor. Ama iki kopya
zamanla ayrışır (CLAUDE.md §9, ikiz sistem). `authz_catalog`'un "kendi rütbe mantığı" sayacı bu
yazımı yakalamıyor: kalıp `access_class\s*(=|in)`, `is not distinct from`'u görmüyor. Kural yalnız
daraltıyor (yeni izin açmıyor). Öneri: hedef türü kontrolü tek bir yardımcıya ya da çekirdeğe
taşınsın. Sayacın kalıbı da `is not distinct from` ve `.class`'ı yakalayacak şekilde genişlesin
(backlog).

**D5 — Düşük: eylem satırı yoksa `removable` açık kalır (teorik).** Migration satır 38:
`select * into removal from app_private.authz_actions … 'employee.remove_from_location'`, `found`
kontrolü yok. Satır bir gün silinirse `removal` boş kalır. `authz_check` owner/admin için
`reach = 'org'` ile `null` döner, yani `removable = true` (fail-open). Satır bugün var ve
`authorization_coverage` onu arıyor, pratikte olmaz. Aynı kalıp liste fonksiyonunda main'de de
var (`employee.list`). Öneri: `if not found then raise … 22023` ya da `strict`.

## Öneri (zevk / ürün sorusu, bulgu değil)
- İşçinin de not ettiği gibi `locations[]`, `primary_location_name` ve listedeki
  `primary_location_name` okuyanın ulaşmadığı lokasyonun adını gösteriyor (T5a'dan kalan davranış).
  Yeni alanlar süzülüyor. M2 "kişi ortak" (yönetici kişiyi bütün olarak görür) buna izin veriyor
  sayılabilir. Ama aynı çekmecede biri süzülüp öteki süzülmeyince tutarsız. Lokasyon adının
  workspace içinde gizli olup olmadığı bir ürün kararı; koordinatöre soru olarak.
- `managed_locations` öğelerinde `archived` bayrağı yok (`locations[]`'ta var). Arşivli ama
  silinmemiş bir lokasyon editörde işaretsiz görünür. Ekran işi.

## Kanıt
- `git fetch origin`; `git diff --stat origin/main...origin/task/fb62-7b-db` → 3 dosya, +546.
- Eski ve yeni fonksiyon gövdelerinin farkı (`20260930121000` ile `20260930180000`): yalnız yukarıdaki
  eklemeler var; süzgeç, sıralama ve yetki satırları değişmedi.
- Çekirdek okundu: `app_private.actor` / `authz_check` (`20260930120000`), `authorize`
  (`20260924123013`), komutlar `set_employee_managed_locations_service` (`20260930130000`), davet
  (`20260930140000`), onboarding (`20260930170000`), `workspace.todos` satırı (`20260930172000`).
- Dalın CI koşusu `36621602233` (`headSha 02162f94`): check, db ve e2e **success**. db işinde
  `employee_drawer_reads`, `authorization_coverage`, `authz_catalog` ve `communication_operations`
  ok. `Files=142, Tests=11691, Result: PASS`.
- İşçi raporu (`nostalgic-mestorf-5b3bba/artifacts/nf-db/7b-db/RAPOR.md`): yeni test önce kırmızı,
  migration'la 26/26. Bu dalın getirdiği kırmızı test yok. CI bunu bağımsız doğruladı.
- Yerelde test koşturmadım; CI yeşili aynı commit'te, ikinci kanıt gerekmedi.

## Sırada
- D1 ve D2'nin dala eklenmesi (`nf-db`, yalnız test). Ardından tek satırlık yeniden bakış.
- `.7b` (`nf-backend`, `task/fb62-core-b-7b`) incelemesi. D3'teki `invite` ipucunun ekranda
  nasıl kullanıldığına bakılacak.
- Backlog adayları: D4 (sayaç kalıbı ve tek yardımcı), D5, dashboard sınıflaması (D1 yan bulgu),
  lokasyon adı görünürlüğü (ürün sorusu).
