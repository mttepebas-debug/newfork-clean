# nf-guvenlik — ACIL-40001 (EKRAN-01, BL-958 Schedule payı), 2026-10-07

İki tur, alt ajanın kendi metni (değiştirilmeden).

## Tur 1

RET (DEĞİŞİKLİK İSTE). Kod doğru. İstenen tek şey mekanik: schema.sql yeniden üretilmeli ve test:db kanıtı eklenmeli. Bunlar gelince yeni sha'ya ONAY verilir.

İncelenen: `task/ekran-01...task/ekran-01-40001` @6f4a6758 (b64bd0f0 testler, 6f4a6758 düzeltme).

## Bulgular

**Kritik / Yüksek: yok.** security-review ölçütüyle de yüksek güvenle sömürülebilir bir açık yok. Tenant sınırı, yetki ve grant tarafında hiçbir şey değişmedi.

**Orta 1. `supabase/schema.sql` yeniden üretilmemiş.**
- Ne görüldü: diff'te yalnız migration var. `git show 6f4a6758:supabase/schema.sql` ile `task/ekran-01`'deki dosyanın md5'i aynı (`cd3edfba…`). 15 fonksiyon schema.sql'de hâlâ `errcode='40001'` gösteriyor.
- Kural: `supabase/CLAUDE.md:5`, migration ekleyen oturum `pnpm.cmd db:schema` koşar ve dosyayı migration ile aynı commit'e koyar.
- Etkisi: bu işin kendi yöntemi "gövdeyi schema.sql'den kopyala". Sonraki oturum bu 15 fonksiyondan birini oradan kopyalarsa 40001 geri gelir. Koruma testi yalnız adında `schedule` geçenleri yakalar. Ayrıca paralel `task/acil-40001` schema.sql'i yeniden üretmiş; main'e ikinci giren dal dosyayı yeniden üretmeli.

**Orta 2. pgTAP kanıtı yok.**
- 6 pgTAP dosyası ve 3 yeni beklenti için test:db çıktısı istekte yok. Ben koşturamadım: `db.lock` ve `heavy.lock` `oturum/ekran-08`'deydi (40 dk). Statik okumada testler doğru görünüyor (aşağıda). Yine de R3 için `pnpm.cmd test:db` (en az bu 6 dosya) çıktısı rapora girmeli.

**Düşük 1. Koruma testi yalnız Schedule adlı fonksiyonları tarıyor** (`schedule_edit_sessions.test.sql:273-281`, `p.proname ~ 'schedule'`).
- Schedule'a yazan ama adı `schedule` içermeyen fonksiyonlar kapsam dışı kalıyor. Örnek: `app_private.time_off_release_shifts`, `important_date_close_shifts`.
- Bugün bunlar ACIL-40001 dalında (24 fonksiyonluk kendi korumasıyla) kapanıyor. İki dal birleşince bütün `pg_proc` için tek koruma kurulmalı; BACKLOG BL-958 notu "kalıcı koruma, EKRAN-02 sonrası" diyor.

**Düşük 2. Sarmalayıcı muafiyeti fonksiyonun tamamına uygulanıyor.**
- İçinde `exception when serialization_failure … PT409` geçen fonksiyondaki her 40001, hangi blokta olursa olsun muaf sayılıyor.
- Bugünkü üç sarmalayıcı en dış blokta, yani gerçek bir açık yok.
- Ayrıca `raise serialization_failure` ya da `errcode = 'serialization_failure'` biçimi yakalanmıyor; schema'da böyle bir kullanım yok.

## Özellikle sorulanlar

1. **Gövdeler birebir mi?** Evet. 15 fonksiyonu migration'dan ve `task/ekran-01:supabase/schema.sql`'den satır satır karşılaştırdım:
   - Toplam 33 satır değişmiş, imzası farklı ya da beklenmedik satır yok. Her fonksiyonda schema'daki 40001 sayısı migration'daki PT409 sayısına eşit. Örnek: mutate 7, save 5, create_batch 3.
   - Fark yalnız `'40001'→'PT409'` ve iki ipucu.
   - `SECURITY DEFINER`, `SET search_path TO ''`, `authorize` / `scope_set` çağrıları ve imzalar aynı. `CREATE OR REPLACE` aynı imzada olduğu için ACL ve owner korunuyor; migration'da grant/revoke yok. İkiz fonksiyon oluşmuyor.

2. **Başka 40001 kaldı mı?** schema.sql'deki bütün 40001 ve `serialization_failure` satırlarını taradım:
   - Schedule tarafında yalnız `publish_schedule_draft_service` (17077/17113/17135) ve `unpublish_schedule_service` (25748/25757) kaldı; ikisi de en dış blokta PT409'a sarılı.
   - Diğer 24 fonksiyon `task/acil-40001` migration'ında birebir kapsanıyor. İkisi birleşince açıkta 40001 kalmıyor.
   - 15 gövdenin çağırdığı fonksiyonların (get_schedule_edit_session_service, assess_weekly_shift_availability, normalize, employee_has_hard_document_… vb.) hiçbiri 40001 atmıyor.
   - `normalize_schedule_time_source`, `check_schedule_time_source` tetikleyicisi üzerinden `schedule_published_shifts` yazımlarında da çalışıyor; artık PT409 veriyor. API'de 40001 ve PT409 ikisi de 409'a gidiyor (`http-error.ts:61-63`), yani dışarıdan görünen durum aynı.
   - Postgres'in kendi serialization failure'ı READ COMMITTED altında oluşmaz (PostgREST'in varsayılanı). Genel bir dönüştürme gerekmiyor; 40P01 deadlock da 40001 değil.

3. **API eşlemesi ve web:**
   - Eskiden kod alan dört cümlenin ('edit lease expired', 'session/shift/draft revision stale') schema'daki bütün geçişleri artık ipucu taşıyor. İpucusuz kalan bir geçiş yok, dolayısıyla kod kaybeden bir akış yok.
   - `schedule-data.ts:95-120` `body.code` okuyor, sözleşme aynı.
   - `isNothingToUndo` (`reason`) zaten PT409 + `schedule.nothing_to_undo` ile çalışıyordu; değişmedi.
   - `schedule-service.ts:893` yayın için 40001 ve PT409'u birlikte tanıyor, etkilenmedi.
   - Öneri: `create_schedule_shifts_batch_service` ("Schedule editing expired/changed") ve `preview_schedule_default_hours_service` ("Schedule editing changed") retleri kod taşımıyor. Bu yeni bir durum değil; isterseniz aynı ipuçlarıyla yapıştırma akışı da aynı kurtarmayı alabilir.

4. **Yetki tek biçimi:** 42501 satırlarına dokunulmamış. 404 ve 403 cevapları değişmedi.
   - Var olan, bu dalın getirmediği bir sapma: `preview_schedule_default_hours_service` "Edit session not found" için 42501'i `authz.*` ipucu olmadan atıyor (migration:1096). Backlog'a yazılmaya değer.

5. **Regex doğru mu?** Evet.
   - `'errcode\s*=\s*''40001'''` hem `errcode = '40001'` hem `errcode='40001'` biçimini yakalıyor.
   - Muafiyet desenine `~*` ile `exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409'` uyuyor.
   - Sıfır satırda `array_agg` NULL döner, `is(NULL, NULL)` geçer.
   - Migration'dan önce 15 fonksiyon listelenir, test kırmızı olur. Yani kırmızı-yeşil anlamlı.
   - İki ipucu testinin kurgusu da doğru: kapatılmış oturumda save → lease expired; `revision-1` ile mutate → oturum revizyon kontrolü, shift aranmadan önce.

## Kanıt
- Gövde karşılaştırması (scratchpad'de node betiği; `tr -d '\r'` sonrası satır satır): `total 33 functions 15`, `UNEXPECTED` / `SIGNATURE MISMATCH` / `LINECOUNT` satırı yok.
- `pnpm.cmd --filter @newfork/api exec vitest run src/app.test.ts src/schedule/schedule-batch-routes.test.ts src/schedule/schedule-default-hours-routes.test.ts` @6f4a6758 → 3 dosya, 78 test geçti.
- `git show 6f4a6758:supabase/schema.sql | md5sum` = `task/ekran-01` md5 (`cd3edfba972195d40c327bbf762f5daf`).
- `node scripts/lock.mjs status` → `db.lock` ve `heavy.lock` `oturum/ekran-08`'de; pgTAP koşturulmadı.

## İstenen
1. `pnpm.cmd db:schema` koşturup schema.sql'i yeni commit'e eklemek.
2. Bu 6 pgTAP dosyasının `test:db` yeşil çıktısını rapora koymak.

## Hafıza önerisi
- Gövde kopyalayan (yalnız kod değiştiren) migration incelemesinde iki kontrol: (a) schema.sql aynı commit'te yeniden üretilmiş mi (md5 tabana eşitse hayır); (b) migration ve taban schema.sql CRLF temizlenip satır satır karşılaştırılır, sayılar 40001 adediyle eşleşir. 40001 → PT409 işinde API 40001'i de PT409'u da 409'a çevirir; dışarıdan görünen fark yalnız ipucu üzerinden `code` ya da `reason` eşlemesidir.

## Tur 2

ONAY @55b8b30d

İkinci tur (ACIL-40001, BL-958 Schedule payı). İlk turdaki iki isteğin ikisi de karşılandı. Rebase'den sonra kod içeriği ilk turla aynı ve yeni tabanla da tutarlı. Kritik, Yüksek ya da Orta bulgu yok.

## Doğruladıklarım
- **Göç ve kod değişmedi.** `git range-diff`: test commit'i ilk turla birebir aynı (b64bd0f0 = 6185f1d2). Düzeltme commit'ine yalnız `supabase/schema.sql` eklenmiş. Göç dosyası, `schedule-routes.ts` ve 6 pgTAP dosyası 6f4a6758 ile 55b8b30d arasında aynı.
- **Gövdeler yeni tabana göre de doğru.** 15 fonksiyonu yeni tabanın (`task/ekran-01` @f2d8bf6d) schema.sql'iyle satır satır yeniden karşılaştırdım. Sonuç `total 33 functions 15`; beklenmedik satır, imza ya da satır sayısı farkı 0. Rebase'in getirdiği paket 1 commit'leri bu 15 fonksiyonu değiştirmemiş; eski gövdeyi geri yazma riski yok.
- **schema.sql farkı beklendiği gibi.** `task/ekran-01`'e göre yalnız `'40001'` → `'PT409'` satırları (ipuçları aynı satırda) ve başlık (442 göç, yeni parmak izi) değişmiş.
- **Sonraki göç bunu ezmiyor.** Dalın göçü (220000) tabandaki 20261007230000'den önce çalışıyor; 230000 hiç fonksiyon tanımlamadığı için 15 fonksiyondan birini eski hâline döndüremez.
- **Test kayıtları anlatılanla uyuşuyor:**
  - Kırmızı kayıt: 6 dosya, 251 test, `Result: FAIL`; görünen başarısızlıklar beyan edilen numaralarla aynı (templates 13/24/29, time_source 5/17/19, batch 20-21).
  - Yeşil kayıt: aynı 6 dosya, 251 test, `Result: PASS`.
  - Tam test:db: 172 dosya, 15.548 test. Düşen 3 dosya (bl052_document_notifications, scheduling_settings_shift_types_rls 12-13/23, weekly_exchange_changed_terms) dalın göçleri olmadan koşulan taban kaydında da birebir aynı düşüyor. Bu iş getirmemiş; ortak yerel veritabanının hâlinden geliyor.
  - API testleri bu sha için ilk turda koşturduğum 78/78 sonucuyla örtüşüyor; bu turda o dosyalar değişmedi.

## Açık kalan (onayı etkilemiyor)
İlk turdaki iki Düşük bulgu ve öneri, rapora ayrı iş olarak yazıldığı gibi kalsın:
- Koruma testi yalnız adında "schedule" geçen fonksiyonlara bakıyor. İki ACIL dalı main'e girince bütün fonksiyonları tarayan tek koruma kurulmalı.
- Testte, sarmalayıcıyı içeren fonksiyonun tamamı muaf sayılıyor.
- Yapıştırma ve varsayılan saatler incelemesindeki "Schedule editing expired/changed" retleri kod taşımıyor; aynı ipuçları verilebilir.

Main CI'daki veritabanı işinin yeşil olduğunu ben ölçmedim; gönderimden sonra koordinatörün kontrolü geçerli.

## Kanıt
- `git range-diff 6f4a6758~2..6f4a6758 task/ekran-01..task/ekran-01-40001` → `1: b64bd0f0 = 1: 6185f1d2`; ikinci commit'te fark yalnız `supabase/schema.sql`.
- `git diff 6f4a6758 55b8b30d --stat -- <göç> apps supabase/tests` → bu dalın dosyalarından hiçbiri listede yok (çıkan dosyalar tabanın değişiklikleri).
- Satır satır karşılaştırma betiği (yeni tabana karşı) → beklenmedik fark 0.
- `git diff task/ekran-01 55b8b30d -- supabase/schema.sql` → 40001/PT409 satırları dışında yalnız iki başlık satırı.
- `../ekran-01-40001-{red,green,testdb,testdb-base}.log` okundu.

## Hafıza önerisi
Rebase'den sonra yeniden onay isterken iki kontrol: (a) `git range-diff` ile dalın kendi commit'leri değişmiş mi; (b) gövde kopyalayan göç, yeni tabanın schema.sql'iyle yeniden karşılaştırılır. Taban aynı fonksiyonu değiştirdiyse eski gövde onu geri yazar; bu da daha sonraki tarihli bir göçün aynı fonksiyonu yeniden tanımlayıp tanımlamadığı kontrolüyle birlikte yapılır.
