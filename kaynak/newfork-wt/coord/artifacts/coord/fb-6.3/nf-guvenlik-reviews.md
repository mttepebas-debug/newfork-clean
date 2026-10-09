# FB-6.3 — nf-guvenlik incelemeleri (alt ajan, koordinatör local_2464b099 çağırdı; metin koordinatörün kaydı)

## 1. FB-6.3.2 — 2026-10-01 ~08:30Z
KARAR: ONAY @d26807ed
- Kritik/yüksek yok. Yeni iki tablo RLS açık, revoke all (public, anon, authenticated, service_role) migration :28, :48; bileşik FK'ler workspace'i zorunlu kılıyor (:20–23, :44–45); realtime yayınına düşmüyor.
- Eski kod: `location_id` nullable — eski yazıcılar null üretmiyor; `actor_user_id` nullable — sekiz olay yazıcısı çekirdekten geçiyor. Kilitler ms; backfill yok.
- Sayaçlar değişmiyor. Geri alma ileri migration ile (031000/032000 öncesi veri kaybı yok).
- Düşük: `time_off_votes.voter_user_id` yalnız auth.users'a bağlı (oy servisi üyeliği çekirdekle sormalı); `notify_schedule_request_event_service` `employee.user_id <> new.actor_user_id` → `expired`'de kimseye gitmez (`is distinct from`).
- Öneri: service_role yeni tabloları okuyamaz → API yalnız SECURITY DEFINER.

## 2. FB-6.3.1/.3/.4 — 2026-10-01 ~09:20Z
KARAR: DEĞİŞİKLİK İSTENİYOR @459ce5e2 (kritik/sızıntı yok)
- Y1 (yüksek): `packages/shared/src/authorization.test.ts:88-96` hash 8108a499… ≠ cb478ec7… → matris özeti yeniden üretilmeli (nf-backend 429f6d00 ile kapandı).
- O1 (orta): `…032000…sql:250-255` sweep görüntüden seçip kilidi sonra alıyor + `…031000…sql:478-493` finalize kilitten sonra pending kontrolü yok → geri çekme/son onay ile yarış.
- O2 (orta, fail-open): `app_private.time_off_reason` `…031000…sql:150` bilinmeyen eylemde 'Unknown action' raise yok.
- O3 (orta): remaining=0 + fallback=false iken talep kesinleşmiyor, süre dolunca reddediliyor.
- D1 (düşük): `time_off_notify_shifts_opened` `…031000…sql:394` `actor().class='manager'` rol okuması.
- D2 (düşük): owner muafiyeti `get_schedule_requests_service`'e uzanmıyor.
- D3 (düşük): sweep 500 sınırı + tur boyu workspace kilitleri.
- Görünür değişiklik (karar 2): eski servislerde lokasyonda manager varsa admin/owner "New time-off request" almıyor; kapanınca manager'lara `requests.time_off.decided`.
- Testler gevşemedi (karar 3, 4). 33 fonksiyonda search_path=''. Ultrareview kullanıcıya önerildi: "Hayır, nf-guvenlik yeter".
- Canlı sonrası md5 listesi: public 13 + app_private 19 fonksiyon (raporun "Canlıya gönderimden sonra" bölümü; koordinatörde).

## 4. FB-6.3 D1/D2 (`20261003033000`) — 2026-10-01 ~11:15Z (alt ajan, koordinatör local_199f5c39)
KARAR: ONAY @a54d9ee9. Kritik/yüksek/orta yok; workspace sızıntısı yok.
- Satır satır karşılaştırma (032000:241-332): yalnız satır 65 (D2 metin) ve 80-83 (D1 unattended>0 → alone_deciders) farklı; red, kesinleştirme, fallback bir kez, alt-transaction, security definer, search_path, revoke/sahip korunuyor.
- Bağımsız kanıt (rollback, builder.sql işlem içinde): migration'la time_off_voting 89/89, time_off_deadlines 31/31; migration'sız yalnız 86-87 kırmızı. DB değişmedi (md5 34f6cbb4…, tests.leave yok).
- Düşük: `time_off_voting.test.sql:464-486` karışık durumu (bir lokasyonda manager var, ötekinde kimse yok → hem manager hem admin/owner) sınamıyor; sonraki FB-6.3 işinde tek `is(...)`.
- Öneri (ürün): aynı 5 dk turunda admin iki bildirim alabiliyor ("waits for an admin" + "waits for your decision"); önceden de vardı. Bilinçliyse KARARLAR "İzin"e yazılsın → kullanıcıya soru.

## 5. FB-6.3.5 (API + shared + web veri, BL-496 kod) — 2026-10-01 ~11:35Z (alt ajan, koordinatör local_199f5c39)
KARAR: ONAY @c1f9ea87. Kritik/yüksek yok.
- D1: shared'dan departman/iş `sort_order` çıktı → yayın anında açık eski sekme ilk okumada hata, yenileyince düzelir. Canlı kullanıcı yok; kod değişikliği yok.
- D2: `app_private.time_off_progress` `locations`/onaylayan adları oy veremeyen okuyucuya da gidiyor (talebi okuyabilen; kapsam dışına sızma yok, `impact` yalnız karar verene). Öneri: nf-db, `locations` yalnız can_vote/can_decide_alone okuyucuya.
- D3: `time-off-voting-service.ts:48-50` 23514 → hep 409; ileride iki ret cümlesine daralt.
- D4: `requests-data.ts:160` `useScheduleRequests` kullanılmıyor; `.6`'da sayfa bu hook'a geçsin, eski sorgu silinsin.
- Kanıt: API 38/38, shared 80/80, web 6/6; yerel DB salt okuma 15 üye × 2 sıra, 20 cevap şemayla parse (gerçek `impact.shifts` dahil).
- Hafıza önerisi: API cevabı shared şemadan geçerken alan silmek eski açık sekmeleri kırar.

## 6. FB-6.3 yayın notu (`20261003034000`) — 2026-10-01 ~11:45Z (alt ajan, koordinatör local_199f5c39)
KARAR: ONAY @edafa6ec, KOŞULLU (canlı sırası). Kritik/yüksek yok.
- 0 (canlı gönderim koşulu): canlı API `time_off_pending`'i tanımalı → shared `51579826` (main `13b7c8cd`) Vercel'de yayında olmadan migration canlıya GİTMEZ (yoksa Publish penceresi 500). Kontrol: `vercel ls newfork-clean-api --scope mert-2a14 --prod`. Canlı md5 = yerel: preflight `ddd1b0f7…`, decisions `ed23a481…`.
- D1: `…034000…sql:122` overrideable=false her soft bulguyu atlıyor → `tier='note'` ile daralt (nf-db'ye verildi).
- D2 (ürün sorusu): yayın izni olup izin taleplerini görme izni olmayan özel rol bekleyen iznin varlığını notta görür; onaylı izinde bugün de aynı.
- D3: `starts > now()` testsiz (yazar söyledi).
- Kanıt: migration'sız 6/12 kırmızı, migration'la 12/12; bozma denemesi çöküşü gösterdi; acceptance 41/41, availability 51/51; DB izsiz.

## 7. FB-6.3 hub alanları (`035000`) + tier düzeltmesi (`034000:122`) — 2026-10-01 ~12:05Z (alt ajan, koordinatör local_199f5c39)
KARAR: ONAY @56c1910e. Kritik/yüksek/orta yok.
- Submit ve hub yeniden tanımları birebir (tek fark yardımcı çağrısı / iki alan); yardımcı `app_private.time_off_timezone` herkese kapalı; arşivli birincil → sonraki canlı lokasyon (Chicago→Denver), eski satır içi sorguyla aynı. Hub yalnız okuyanın kendi kaydı.
- D1: `034000:131` not seviyesinin üstünde "geçilemez" soft bulgu ileride eklenirse istemcinin kararı override olarak yazılır → o gün reddedilmeli (backlog).
- D2: `employee_hub_time_off_form.test.sql` arşivli birincil + yanlış dilimde 40001 durumlarını kapsamıyor (elle kanıtlandı) → nf-db'ye.
- Kanıt: hub 4/4, yayın notu 13/13, düzeltme öncesi test 10 kırmızı; DB izsiz.
- Hafıza önerisi: API DB'nin alt nesnesini (settings) bütünüyle ezerse yeni anahtar sessizce düşer.

## 8. FB-6.3.7 DB (`f84e3667`, migration `20261003040000`) + kod (`8e50894d`) — 2026-10-01 ~14:40Z (alt ajan opus, koordinatör local_353d5a30)
KARAR: DEĞİŞİKLİK İSTENDİ. Güvenlik engeli yok (fail-open yok, silinen fonksiyona canlı çağrı yok, üç yetki listesi tutarlı ve yalnız aşağı, beklentiler gevşetilmemiş, ikiz sistem yok, kapsam kayması yok).
1. Yüksek (ENGEL, koordinatör doğruladı): `supabase/seed.sql:171,178,286,290` silinen `departments/jobs.sort_order`'a yazıyor → CI db+e2e kırmızı. Rolled-back denemede seed çalışmadığı için görülmedi.
2. Orta: migration 35–45 `notification_inbox_items` + `notification_delivery_attempts` RESTRICT bağlarını atlıyor → canlıda gelen kutusu satırı varsa canlı gönderim FK ile düşer.
3. Düşük: Workspace home Time off sayacı olumsuz durum testi yok.
4. Düşük: `time_off_assignment_releases` korumalarının testi silinen dosyayla gitti → `time_off_opens_shifts`'e taşınacak.
5. Düşük: iki "hayır" testi ipucunu kilitlemiyor.
Düzeltmeler (1–5) nf-db `local_055397b2`'ye verildi (aynı dal). e2e `2036d930` incelemenin önkoşulu olarak anıldı (üç parça aynı push). Backlog önerileri: dönem şeması zorunlu alanlar (=BL-518), `time_off_event_released_assignments` eski yetki yardımcısı, yerel fixture eski kolon riski, weekly_* (=BL-519).
Ders (rol hafızasına): kolon düşüren migration'da seed.sql taranır; satır silen migration'da RESTRICT zinciri çıkarılır.
- **Yeniden inceleme ~14:45Z: KARAR: ONAY @8c925ebc+8e50894d+2036d930.** Beş bulgu kapandı (RESTRICT zinciri eksiksiz tarandı; olumsuz test boşa çıkmıyor; gevşetme yok, plan 12→15). Şart: üç parça tek push, rebase'de `ci-green.txt` çatışması çözülünce testler yeniden. Not (backlog, BL-368): CI dışı iki dosya silinen kolonlara yazıyor — `weekly_exchange_changed_terms.test.sql:112`, `notification_preference_resolver_and_producers.test.sql:140-141`.

## 9. FB-6.3.8b (`56c03295`) ve FB-6.3.8c (`11619991`) — 2026-10-01 ~18:15Z / ~19:00Z (alt ajan opus, koordinatör local_353d5a30)
- **8b: KARAR: ONAY @56c03295** (R2 tek bağımsız). Yalnız `time_off_sweep` gövdesi; düşük: KARARLAR satırı "(henüz kodda değil)" — kayıt düzeltti.
- **8c: KARAR: ONAY @11619991** (R3). `requests.read` rank_below+no_self; tüketiciler yalnız `get_schedule_requests_service` + `get_workspace_dashboard_service`; takaslar `exchange.read` ile etkilenmiyor; fail-open yok; her karar veren görür. Düşük 1: okuma bugünkü lokasyon, oy sabit lokasyon (Mert: görsün, oy vermesin — kilit testi eklenecek). Düşük 2: owner'ın kendi izni Requests'te kimseye görünmez (kurala uygun; kilit testi).
