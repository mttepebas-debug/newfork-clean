# EKRAN-01 DB-2 — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-2 — canlı kanal yetki çekirdeğine ve lokasyona (B-2), yalnız DB kısmı | `nf-db` / veri hattı | R3 | ONAY @bcfbb0a5 (`nf-guvenlik`, tek tur; rebase sonrası uç `d271cd09`, içerik aynı) | 2026-10-06 |

## Sonrası için
- Tuzak: Realtime konusu (topic) DB'de değişince API yayını ve web aboneliği **aynı gönderimde** değişmeli. `e2e/` canlı kanalı ve presence'ı sınamıyor; DB tek başına girerse CI yeşil kalır, canlı yenileme sessizce durur.
- Kalıp: `realtime.messages` politikaları yalnız `app_private.rls_can(...)` sorar; `schedule_realtime_channels` testinin son hücresi bunu sayar (0 kalmalı). Lokasyonlu konu: `rls_can(ws, '<izin>', array[<lokasyon>])`.
- Tuzak: rollback'li denemede `echo begin` değil `echo 'begin;'` — noktalı virgülsüz `begin` bir sonraki satırla birleşir, migration hiç çalışmaz, kırmızı yanlış okunur.
- Tuzak (inceleme notu): kilit `take` ile değişken atamasını `&&` / `;` ile aynı satıra zincirleme; kilit düşerse değişken boş kalır, "migration ile" koşusu sessizce "migration olmadan" koşusuna döner.

## Rapor
**Karar:** DB-2'nin DB kısmı bitti, `nf-guvenlik` ONAY @bcfbb0a5 (tek tur, Kritik/Yüksek bulgu yok).
**İzin:** R3 — gönderim iznini bekliyor, **koşullu**: bu migration `nf-backend` parçası (API yayını) ve W-1b'nin kanal adı değişikliğiyle aynı pencerede main'e ve canlıya girmeli; tek başına girerse açık Schedule ekranları canlı yenilenmez.
**Risk:** 🟠 güvenlik tarafı temiz; sıra yanlış olursa canlı yenileme sessizce durur, hiçbir test yakalamaz.
**Soru:** koordinatöre — (a) **(Önerilen)** DB-2 migration'ı API + web parçası hazır olana kadar dalda bekler, üçü tek pencerede girer; (b) DB-2 şimdi girer, aradaki süre boyunca canlı yenileme yok kabul edilir ve kayda yazılır. Dayanak: görev dosyası DB-2 "nf-db → nf-backend" tek dilim + inceleme bulgusu 1.
**Sonraki:** DB-3 (şablon Overwrite, mola, Live etiketi, not, kapalı gün) — ayrı worktree'de başladı.

### EKRAN-01 DB-2 — Schedule canlı kanalı yetki çekirdeğine ve lokasyona (nf-db/veri)

Delegasyon: R3 (RLS); `nf-guvenlik` zorunlu inceleme yapıldı (tek tur, ONAY); görsel QA yok (ekran kodu değişmedi).
**Ultrareview:** önerilmez — diff iki dosya, 121 satır; çekirdeğin her "hayır" sebebi testle kilitli; Mert benzer işlerde "iki inceleme yeter" dedi (ILKELER P06).

### 1. Nerede duruyor
DB kısmı bitti, dalda; gönderim izni ve sıra kararı bekliyor.
- Dal `task/ekran-01-db-2`, worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`; `origin/main` `0843bf73` üstüne rebase edildi (çatışma yok). Kod commit'i `d271cd09` (ONAY verilen `bcfbb0a5` ile aynı içerik) + bu arşivin commit'i.

### 2. Ne yapıldı (etkisi)
- **Öncesi:** Schedule ekranına "yenile" duyurusu bütün workspace için tek kanaldan gidiyordu (`schedule:invalidation:<workspace>`). Kanalı eski yardımcı (`workspace_has_permission`) koruyordu; çalışanlara da "evet" diyordu. Beşiktaş müdürü Can, Kadıköy müdürü Ayşe'nin her kaydını duyabiliyordu. "Kim bakıyor" kanalına (presence) Kadıköy'de çalışan Ali katılıp kimin baktığını görebiliyordu.
- **Sonrası:** duyuru kanalı lokasyon başına: `schedule:invalidation:<workspace>:<lokasyon>`. İki kanala da yalnız yetki çekirdeğinin o lokasyonun Schedule'ını okuyabilir dediği kişi girer (`rls_can(ws, 'schedule.read', array[lokasyon])`): Kadıköy müdürü Kadıköy'ü, owner/admin hepsini duyar; Can Kadıköy'ü duyamaz; çalışanlar hiçbir Schedule kanalına giremez, presence'ta görünemez. Workspace genelindeki eski kanal hiçbir politikaya uymuyor; kimse giremiyor.
- Koruma: `realtime.messages` üzerindeki her politikanın çekirdeğe sorduğunu sayan test hücresi (eski yardımcıya dönüş kırmızı olur).

### 3. Açık kalanlar
- **API yayını (`nf-backend`, DB-2'nin ikinci yarısı):** yayın lokasyon kanalına gitmeli, yükten taslak ve kullanıcı kimliği çıkmalı. Sözleşme aşağıda. Bu parça olmadan migration girmemeli (bkz. Karar/İzin).
- **Web aboneliği (W-1b):** `useScheduleRealtime.ts:48` görünen her lokasyon için ayrı kanala katılmalı.
- **Presence içeriği (Düşük, yeni değil):** aynı lokasyondaki iki müdür birbirini "düzenliyor" gösterebilir; `user_id` tarayıcıdan geliyor. Yalnız görüntü, kilit DB'de. Backlog önerisi `(leave: low / do: moderate)`.

### Sözleşme — `nf-backend` (API) ve W-1b (web) için
| | Konu (topic) | Kim katılır | Kim yazar |
|---|---|---|---|
| Duyuru | `schedule:invalidation:<workspace_id>:<location_id>` (ikisi de küçük harf UUID; başka hiçbir biçim kabul edilmez) | o lokasyonda `schedule.read` olan: lokasyon müdürü, admin, owner | yalnız sunucu (service role); tarayıcı yazamaz |
| Presence | `schedule:presence:<workspace_id>:<location_id>:<week_start>` (değişmedi) | aynı | aynı kitle, yalnız `presence` uzantısı |
| Eski `schedule:invalidation:<workspace_id>` | — | kimse | — |

- **API:** her yayın, ilgili lokasyonların her biri için ayrı kanala gider. Lokasyonu olmayan yayınlar (`schedule-service.ts` ~690 taslak listesi, ~721, ~800 bekleyen değişiklik) lokasyonu taslaktan / sonuçtan bulmalı; bulunamıyorsa göndermemeli (HTTP yeniden çekme sürer). Her kanaldaki yükte `location_ids` yalnız o lokasyon olmalı; `draft_id` ve `actor_user_id` çıkar (kaynak bulgu B-2'nin ikinci yarısı; inceleme notu 3: Kadıköy+Beşiktaş taslağında Kadıköy kanalına Beşiktaş kimliği gitmez).
- **Web:** görünen her lokasyon için `schedule:invalidation:${workspaceId}:${locationId}` kanalına `private: true` ile katılır; "All locations" görünümünde hepsine. Yükte `draft_id` olmayacağından taslak yenileme hedefi (`draftTargetMatches`) başka yolla karar vermeli (ör. `draft_shifts` hedefi geldiğinde açık taslağın sorgusunu yenile).

### 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız veritabanı kuralı). API ve web parçası girene kadar bu migration main'e alınmamalı; alınırsa Schedule ekranı başka müdürün kaydında kendiliğinden yenilenmez.

### 5. Sırada ne var
1. Koordinatörün sıra kararı (yukarıdaki soru) ve `nf-backend` parçası.
2. DB-3 (bu oturum, ayrı worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-db-3`, dal `task/ekran-01-db-3`).
3. Yolda bulunan: presence `user_id` tarayıcıdan geliyor (yukarıda, Düşük).

### Kanıt
- Kırmızı (migration'sız): `docker exec … psql < supabase/tests/schedule_realtime_channels.test.sql` → 18 testten 5'i düşüyor (1 müdür kendi lokasyonunu alamıyor, 2 owner alamıyor, 6 eski workspace kanalı açık, 15 Kadıköy çalışanı presence'a katılabiliyor, 18 çekirdeğe sormayan politika var). Üç koşuda aynı.
- Yeşil: `{ echo 'begin;'; cat <migration>; sed … <test>; echo 'rollback;'; } | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At` → 18/18, iki koşuda aynı. Aynı yolla `authz_catalog` (11), `retired_objects_stay_gone` (19), `public_roles_reach_no_table_directly` (4) yeşil.
- Ortak yerel DB'ye kalıcı uygulama yok (son sürüm `20261007070000`); tam `test:db` gönderim penceresinde, izinle.
- Dokunulan dosyalar: `supabase/migrations/20261007080000_schedule_channels_are_per_location.sql`, `supabase/tests/schedule_realtime_channels.test.sql`.

## İnceleme

### Tur 1 (`bcfbb0a5`) — `nf-guvenlik`: KARAR: ONAY @bcfbb0a5

**Koordinatör için 5 satır**
- **Karar:** ONAY @bcfbb0a5 (R3, `nf-guvenlik`). Kritik ya da Yüksek bulgu yok. Bir Orta bulgu var; o da güvenlik açığı değil, değişikliğin hangi sırayla yayına gideceğiyle ilgili.
- **İzin:** R3. Gönderim için koordinatörün açık "gönder" izni gerekiyor. Bu migration main'e ya da canlıya tek başına girmemeli; aşağıdaki 1. bulguya bakın.
- **Risk:** 🟠 Güvenlik tarafı temiz. Bu migration API ve web değişikliğinden önce girerse Schedule ekranındaki canlı yenileme sessizce durur ve bunu hiçbir test yakalamaz.
- **Soru:** Yok. Sıra kararı koordinatörün: DB-2'nin API ve web parçası aynı pencerede mi girecek, yoksa bu migration o parçayı mı bekleyecek?
- **Sonraki:** DB-2'nin `nf-backend` parçası (görev tablosunda "nf-db → nf-backend" diye yazıyor). Dilim o parça girince kapanır.

**Bulgular**
1. **Orta (güvenlik değil): DB tek başına girerse canlı yenileme sessizce durur.** Migration `…08000…sql:22-40`; API hâlâ eski kanala gönderiyor (`apps/api/src/schedule/schedule-service.ts:1261-1263`); web hâlâ eski kanalı dinliyor (`apps/web/src/schedule/hooks/useScheduleRealtime.ts:48`). `e2e/` altında canlı kanal / presence senaryosu yok; main CI yeşil kalır. Örnek: Ayşe ile owner aynı Kadıköy haftasını açmış; Ayşe kaydeder, owner'ın ekranı yenilenmez. Kilit DB'de olduğu için veri bozulmaz. Beklenen: migration, API yayını ve web aboneliğinin yeni konuya geçişiyle aynı main gönderiminde; canlıda OPS-03 sırası bunları ayırmamalı ya da koordinatör bilerek kabul edip kayda yazmalı.
2. **Düşük (yeni değil): aynı lokasyondaki müdür presence içeriğini sahteleyebilir.** `apps/web/src/schedule/hooks/useScheduleViewerPresence.ts:96-100` — `user_id` tarayıcıdan. Bu değişiklikle yazabilenler yalnız o lokasyonu okuyan müdür/admin/owner; çalışan girişi kapandı. Onay engeli değil; backlog'a yazılabilir.
3. **Düşük: W-1b'de yayın içeriği için dikkat.** API lokasyon başına gönderime geçerken her kanala yalnız o lokasyonun bilgisi gitmeli; Kadıköy+Beşiktaş taslağında Kadıköy kanalındaki yükte Beşiktaş kimliği ve `draft_id` olmamalı.

**Kontrol edilenler (temiz):** başka workspace'e geçiş (çekirdek `out_of_scope`; P1, P2, test 7); `rls_can` imzası, `security definer`, `search_path=''`, fail-open yok (`place` sınıfı tam bir lokasyon ister, null ya da çoklu → `out_of_scope`); arşivli lokasyon (owner ve müdür reddediliyor, P8, P9); desen kaçakları (sona ek P3, büyük harf P4 reddediliyor; presence'ta 3. ve 4. parça desenin sabitlediği kimlikler); uzantı türleri (P6, P7 reddediliyor, tarayıcı duyuru gönderemiyor); katılımda broadcast okuma (test 11-12); öteki politikalar kendi öneklerine sabitli, test 18 sayıyor; eski yardımcılar 20 politikada sürüyor, silinmeleri bu dilimin işi değil; migration güvenliği (`if exists` yok, zaman damgası sonda, seed'e dokunmuyor); kapsam kayması yok; test yeterliliği (rütbe, kapsam, workspace her "hayır" sebebi için hücre var).

**Kanıt (inceleme):** migration ile 18/18; migration olmadan 1, 2, 6, 15, 18 düşüyor; ek yoklama P1–P9 (P5 admin Beşiktaş `t`, öteki hepsi `f`); denemeden sonra `schema_migrations`'ta `20261007080000` yok; `gh run list --limit 3` son üç main koşusu success.

**Hafıza notu (inceleme):** kilit kimliği "rol/oturum" biçiminde olmalı; kilit + değişken atamasını tek satırda zincirleme (kilit düşerse boş değişkenle yanlış kırmızı). Konu değişen canlı kanalda API ve web aynı gönderimde mi, bak; `e2e/` canlı kanalı sınamıyor.
