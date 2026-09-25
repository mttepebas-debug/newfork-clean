# FB-6.1 — dış değerlendirme ve yeni ürün kuralları

Kime: `nf-strateji` lead'i (planlama + inceleme'ye dağıtmak için)
Kimden: kullanıcının açtığı tekil oturum (takım dışı), kullanıcının isteğiyle
Tarih: 2026-09-25
Kaynaklar: `origin/main` `97661f1` (`docs/plan/tasks/FB-6.1.md`, `REUSE.md`), `nf-muhendislik/artifacts/strateji/FB-6.1/2a-niyet-listesi.md`, yerel DB `supabase_db_newfork-clean` (yalnız `SELECT`). Hiçbir dosya, branch ya da DB satırı değiştirilmedi.

Bu rapor iki bölüm: (A) Strateji lead'inin kullanıcıya verdiği durum özetinin ve FB-6.1 planının doğrulaması, (B) kullanıcının bu turda verdiği **yeni ürün kararları** ve bir **backlog adayı**. B bölümündeki 1–4 numaralı kurallar kullanıcı kararıdır; tahmin değildir, REUSE "Ürün kuralları"na yazılmalıdır.

---

## A. Doğrulama

### A1 — `.2`'nin gerçek yüzeyi 30 değil, 58 fonksiyon (ENGEL, özetteki "iş küçüldü" yanlış)

Ölçüm (yerel DB, `pg_proc.prosrc`, çağrı argümanları iç içe parantezi sayan bir ayrıştırıcıyla; `create_schedule_shifts_batch_service` elle teyit edildi):

| Küme (üç `schedule_actor_*` yardımcısı) | Fonksiyon (ad) | Çağrı |
|---|---|---|
| Yardımcıyı çağıran toplam | **58** (60 oid, 2 overload çifti) | **101** (25 + 8 + 68) |
| En az bir `null`/argümansız çağrı | 30 (17 yalnız-null + 13 karışık) | 34 |
| **Yalnız gerçek lokasyon geçen** | **28** | 67 |

`kesif`in 30 / 17 / 13 sayıları doğru. Ama `.2` "üç yardımcıyı sil" diyor ve Done when 4 onların DB'de olmamasını istiyor. Yardımcı silindiği anda **yalnız gerçek lokasyon geçen 28 fonksiyon da** `undefined function` ile kırılır. Planda bu 28'in ne adı ne sahibi var; `.2`'nin metni yalnız `null` geçenleri anlatıyor. Bunların bir kısmı `.4`'te katlanacak `_base` zincirlerinde, ama `.4` `.2`'den **sonra** geliyor — sıra bu hâliyle uygulanamaz.

Gereken düzeltme (biri seçilmeli):
- (a) `.2` 58 fonksiyonun hepsini `authorize()`/`scope_set()`'e taşır (null olanlar 2a listesine göre, gerçek lokasyonlular düz taşıma), ya da
- (b) `.2` yardımcıları silmez, yalnız 30'u taşır; silme 28'in de taşındığı son adıma (`.4` sonrası) kayar ve K3'ün "tek commit" üçlüsü oraya gider.

Özetteki "iş sanılandan küçük" ve "artık tamamının sahibi belli" cümleleri düzeltilmeli. Karşılaştırma birimi de karışmış: plan "43 **çağrı** / 38 **fonksiyon**" diyordu; "43 → 30" çağrıyı fonksiyonla kıyaslıyor. Doğrusu: dört yardımcı 43 çağrı / 38 fonksiyon → üç Schedule yardımcısı 34 çağrı / 30 fonksiyon. Plandaki "üç Schedule yardımcısına **112** çağrı / 63 fonksiyon" da yanlış etiketli: 112 = 101 + 11, yani **dört** yardımcı.

### A2 — Export sorusu kullanıcıya gereksiz gitti

`REUSE.md` "Ürün kuralları" → M2: *"Vardiya işlemleri (yazma, yayın, devir onayı, dışa aktarma) yalnız vardiyanın lokasyonunda."* (kullanıcı kararı, 2026-09-23). 2a listesinin Q3'ü de bu satıra dayanıyor. Q3 (a) — `location_ids ⊆ scope_set(actor,'schedule.export')`, değilse `authz.out_of_scope` — REUSE'un doğrudan sonucudur, soru olarak açık tutulmamalı. `scheduled_schedule_exports.location_ids` kolonu var, kontrol doğrudan uygulanabilir.

### A3 — K7 ve 2a/Q1–Q4 REUSE'la çelişiyordu (kullanıcı şimdi karar verdi, bkz. B)

2a/Q1 önerisi (a) "manager herhangi bir taslağı yönetebilir" Q3'teki "hayır" ile tutarsız: Beşiktaş'ın planını indiremeyen Kadıköy müdürü aynı haftanın taslağını silebiliyordu. REUSE M2'nin son cümlesi ("Başka lokasyonu etkileyen karar o lokasyonun onayını ya da admin/owner'ı ister") (b)'yi gösteriyordu. K7'nin "kendi yetki alanı kadarını görür" ifadesi kısıtlayıcı okunuyor ama taslağa `scope_set(actor)` uygulamak pratikte "en az bir lokasyonu olan her manager" demek.

**2a'nın Q1 öncülü de yanlış:** "taslak workspace+hafta nesnesi, satırda lokasyon yok" deniyor, oysa `public.schedule_drafts.location_ids uuid[]` ve `public.schedule_edit_sessions.location_ids uuid[]` var. Yani "taslağın lokasyonları ⊆ actor'ın kapsamı" kontrolü bugünkü şemayla yazılabilir. `schedule_templates`'te lokasyon kolonu yok (lokasyon template'in shift'lerinde).

### A4 — Bulgu bulgu

| # | Hüküm | Not |
|---|---|---|
| B1 | Kısmen | Eski plan 38'in hepsini `.2`'ye vermişti; asıl boşluk A1'deki 28. |
| B2 | Sayı doğru, kıyas yanlış | A1. |
| B3 | Doğru | Aynı `[^()]` sınırı bağımsız ölçümde de görüldü. |
| B4 | Doğru | Done when 2'deki üç "… çıkmış sayı" hedefsiz. |
| B5 | Eksik | `origin/main`'de yok: `e2e/flows/schedule-publish.spec.ts`, `e2e/flows/schedule-multi-location.spec.ts`, **`apps/web/src/auth/can.ts`**, **`apps/web/src/views/SchedulePage.test.tsx`**. Web'de `can()` ve `isNoAccess()` hiç tanımlı değil; `.9` bunlara dayanıyor (FB-6.0-can önkoşul olmalı, bağımlılık plana yazılmalı). |
| B6 | Doğru, kritik | T5 kriteri `rg "approved_time_off" apps/web → 0`. `apps/web/src/schedule/schedule-conflicts.ts:20` `time_off → approved_time_off` eşlemesi; silinirse Schedule'da onaylı izin çakışması uyarısı kaybolur. Kriter `ConflictHandlingSettingsPage.tsx` ile sınırlanmalı. |
| B7 | Doğrulanmadı | — |
| B8, B9 | Makul | — |
| B10 | Doğru | `97661f1` main'de, `Status: draft`. |
| K3, K4, K5 | Doğru | K4 zaten Done when 4'te. |
| K6 | Dikkat | `schedule_grid_read_budget` zaten `ci-green.txt`'te ve `< 50` ile geçiyor. ">40 ms ise hedef 'kötüleşme yok' olur" kuralı CLAUDE.md §9'daki ≤50 ms çıtasını gevşetebilir; gevşetme kullanıcı onayı ister. |
| K8 | Doğru ama yeni değil | REUSE "Teknik sözleşmeler"de zaten yazılı. |

---

## B. Kullanıcının yeni ürün kararları (2026-09-25)

REUSE "Ürün kuralları" → "Roller ve kapsam" altına yazılmalı; `authorization_matrix`'te hücre karşılıkları olmalı. Örnekler: Ayşe = yalnız Kadıköy müdürü, Ali = Kadıköy + Beşiktaş'ta çalışan kişi, taslak T = Kadıköy + Beşiktaş.

**B1 — Taslakta manager yalnız kendi lokasyonlarını görür ve düzenler.** Ayşe T'yi açınca yalnız Kadıköy ızgarasını görür. Ali'nin Beşiktaş vardiyası, Ayşe'nin ızgarasında Ali'nin satırında yalnız **ghost** (lokasyon adı + saat, salt okunur) olarak görünür. Beşiktaş ızgarası hiç gelmez.

**B2 — Kaydet ve yayınla lokasyon bazlıdır.** Ayşe T'yi kaydederse ya da yayınlarsa yalnız Kadıköy kaydedilir/yayınlanır. T'nin Beşiktaş kısmı dokunulmadan **taslak olarak otomatik kaydedilmiş** kalır. (Not: `publish_schedule_draft_service` zaten `target_location_ids` alıyor; kaydetme tarafı — `save_schedule_edit_session_service` — lokasyon parametresi almıyor, orası tasarım ister.)

**B3 — Çok lokasyonlu taslağı silmek tüm lokasyonlara sahip olmayı ister.** T'nin lokasyonlarından biri bile Ayşe'nin kapsamında değilse Ayşe T'yi **kısmen bile** silemez. Kontrol: `T.location_ids ⊆ scope_set(actor, w, 'schedule.manage')`, değilse 42501 + `authz.out_of_scope`. Admin/owner siler. Bu, 2a/Q1'i (b) yönünde kapatır ve K7'yi taslak silme için geçersiz kılar.

**B4 — Boş yeni taslakta "yayınlanmışları ghost göster" anahtarı.** Kadıköy'ün o hafta yayınlanmış planı varken Beşiktaş için yeni boş taslak açılırsa, ızgarada bir aç/kapa anahtarı olur. Açıkken yayınlanmış vardiyalar ghost olarak görünür. Kullanıcı düzenlemeden çıkmadan açıp kapatabilir. **Bu ghost'lar çakışma üretmez** (taslak boş bir sayfa; uyarı/engel hesaplamasına girmez). Bu, T3'teki "manager yazarken ghost vardiyayla çakışma uyarısı alır" kuralından farklı bir moddur: fark "yayınlanmış plan önizlemesi" ile "canlı başka lokasyon vardiyası" arasındadır. Plan ikisini ayrı tanımlamalı.

**B2'ye bağlı açık soru (kullanıcıya zincirle sorulabilir):** Ayşe kaydederken Beşiktaş kısmında o sırada başka bir yöneticinin açık düzenleme oturumu varsa ne olur? Bugünkü edit-lock/lease modeli (`schedule_edit_locks`) tek oturum varsayıyor olabilir; bu, B2'nin uygulanabilirliğini etkiler, ölçülmeli.

**Q2 ve Q4 için bu kararların sonucu (planlama doğrulamalı):**
- Q2 (publish/önizleme lokasyon dizisi): B2 ile uyumlu olan öneri (a) — dizi ∩ `scope_set`, taşan lokasyon `authz.out_of_scope`.
- Q4 (template rename/delete): kullanıcı template'i açıkça söylemedi. B3'ün mantığıyla tutarlı olan, template'in shift lokasyonlarının hepsi kapsamda değilse silme/rename'in admin/owner'a kalmasıdır. **Bu çıkarım; kullanıcıya teyit için sorulmalı**, tahminle uygulanmamalı.

### B'nin FB-6.1'e etkisi
B1–B3 dilimi **büyütür**: T3 (ghost) zaten içerideydi. Ama lokasyon bazlı kaydetme (B2) ve lokasyon filtreli taslak okuması (B1) okuma modelini ve kaydetme zincirini değiştirir, yani `.4` ve `.5` ile iç içe geçer. B4 (anahtar) web + okuma modeli işi. Planlama, bunların FB-6.1'e mi girdiğine yoksa FB-6.1'in hemen arkasına ayrı bir dilim olarak mı açıldığına kapsam kararı versin; ızgara bütçesi (≤50 ms) ikisinde de geçerli.

---

## C. Backlog adayı — taslak üzerinde lokasyonlar arası ortak çalışma

Kullanıcının fikri, **şimdi yapılması zorunlu değil**: "kolaysa şimdi, değilse sonra".

Ayşe T'yi açıp Beşiktaş müdürü Mehmet'e **ortak çalışma daveti** gönderir. Mehmet kabul ederse, **yalnız o taslağı düzenlerken** ve davet süresince Kadıköy ızgarasını da görür ve düzenler. Aynısı tersine de geçerli olabilir. Davet bitince yetki biter.

Neden büyük: M2'ye taslak bazlı, süreli bir **yetki istisnası** ekler. `authz_scope_rules`'a yeni bir kaynak (davet) girer ve `scope_set()` taslak bağlamına duyarlı hâle gelir. RLS, `authorization_matrix` hücreleri, realtime kanal yetkisi (BL-115 ile ilişkili), bildirim ve eşzamanlı düzenleme (edit lock) hepsi etkilenir.

Öneri: BACKLOG'a ayrı madde olarak yazılsın. İşaret önerisi `(leave: low / do: risky)`: bugün kimse bundan mahrum kalıp zarar görmüyor, ama yetki çekirdeğine dokunuyor. FB-6.1'e **eklenmesin**. Kullanıcı "kolaysa" dedi ve bu kolay değil.

---

## D. Strateji'den beklenen
1. A1'i planın `.2` / `.4` sırasına işlemek ((a) ya da (b)).
2. Export sorusunu REUSE'a dayanarak kapatmak (A2).
3. B1–B4'ü REUSE'a yazmak. Q4 teyidini ve B2 açık sorusunu kullanıcıya zincirle götürmek.
4. B5 / B6 / K6 düzeltmelerini düzeltme listesine eklemek (mevcut 10 maddeye).
5. C'yi BACKLOG'a yazmak.
