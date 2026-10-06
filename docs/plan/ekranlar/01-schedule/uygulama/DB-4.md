# EKRAN-01 DB-4 — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-4 — yayın ve zaman kuralları (BL-371, BL-510, BL-174, B-7 DB yarısı, BL-326 kilit, BL-191 ölçüm, BL-759 kırmızı TODO) | `nf-db` / veri hattı | R3 | ONAY @38641cdf (`nf-guvenlik`, 1. tur; 3 Düşük not) | 2026-10-06 |

## Sonrası için
- Tuzak: bir tetikleyicide "atla" dalı kaldırılınca o tabloya yazan her yol hem yerel DB'deki fonksiyonlardan (`pg_proc.prosrc ~* 'insert into public.<tablo>'`) hem daldaki migration'lardan listelenir. `schedule_published_shifts`'e yazan altı yol: yayın, önemli tarih kapatma, lokasyondan çıkarma, işten çıkarma, izin serbest bırakma, takas komutu. Takas izni yazımdan önce kısalttığı için yeni kontrolden geçer.
- Tuzak: veri değiştiren CTE (`with … insert … returning`) skaler alt sorgunun içinde çalışmaz; test önce `tests.remember(…, gen_random_uuid())`, sonra düz `insert`.
- Tuzak: owner'ın taslağı workspace'in bütün lokasyonlarını kapsar (`location_ids` = oturumun lokasyonları). "Taslak X'i kapsamaz" testi tek lokasyonlu müdürün taslağıyla kurulur.
- Kalıp: yıllık tekrar SQL'de `starts_on + make_interval(years => k)`; 29 Şubat artık yılda 28 Şubat'a düşer (TS `inYear` ile aynı).
- Açık (nf-backend): okuma modeli `important_dates`'i artık kendisi veriyor; API sorgusu ve `importantDateTouchesRange` silinecek. İki uç fark: yalnız `location_id` dolu tarih DB'de o lokasyonundur (API "herkesin" sayıyordu); yıllık tekrar bugünden en çok 2 yıl ileri (TS'deki `today + 2` sınırının aynısı, API süzgeci bu sınırı uygulamıyordu). Kapanan günler zaten okuma modelinde; API'nin `end_date` / `shift_type_ids` alanları ölü.

## Rapor
**Karar:** ONAY @38641cdf, R3 · **İzin:** R3, gönderim ve kalıcı migration sabah koordinatörün "gönder" izniyle (A hattından sonra: A1A2 → A3 → A4 → DB-4) · **Risk:** 🟢 tam ci-green'de yeni kırmızı yok · **Soru:** BL-238 ve BL-759 sabah soruları (S24) · **Sonraki:** EKRAN-03 A1.

### 1. Nerede duruyor
DB yarısı bitti, dalda. Dal `task/ekran-01-db4`, worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`. Commit'ler `28f2e513` (BL-371, BL-510), `38641cdf` (BL-174, B-7, testler) + bu arşiv. Migration `20261007180000_publish_rules_name_and_override.sql` (henüz hiçbir DB'ye kalıcı uygulanmadı).

### 2. Ne yapıldı (etkisi)
| Madde | Öncesi | Sonrası |
|---|---|---|
| BL-371 | Schedule → taslak menüsü "Published by Unknown" diyordu. | "Published by Local Owner"; ad boşsa "Team member". |
| BL-510 | Kimsenin geçemeyeceği bir bulguya karar yazılırsa yayın geçebilirdi (bugün oluşmuyor). | Yayın durur: "This schedule conflict cannot be overridden". |
| BL-174 | Ali'nin Salı vardiyası önceki yayında varsa, sonradan onaylanan Salı izni yayın tablosuna doğrudan yazan bir yolda hiç sorulmuyordu (yalnız önizleme yakalıyordu). | Tetikleyici de reddeder (23514), önizlemeyle aynı kural. Kabul edilmiş müsaitlik / dinlenme uyarısı korunur. Taslak ve Edit açılışı etkilenmez. |
| B-7 (BL-701) | Önemli tarihlerin lokasyon ve hafta süzgeci API'de (TypeScript) yapılıyordu. | Okuma modeli (`get_schedule_read_model_service`) `important_dates`'i kendisi veriyor: yayınlanmış, arşivsiz, Schedule'ı etkileyen, haftaya değen; erişilen her lokasyon için bir satır; lokasyonsuz tarih herkese; yıllık tekrar. API'deki süzgeç `nf-backend` ile silinecek. |
| BL-326 | Kural zaten vardı (39855536), test yoktu. | Kilitlendi: Ayşe'nin yalnız Kadıköy'ü kapsayan taslağı Beşiktaş'ı yayınlayamaz (önizleme ve yayın 22023). |
| BL-191 | Ölçülmemişti. | Ölçüldü ve testle kilitlendi (hüküm aşağıda). |
| BL-759 | Kırmızı test yoktu. | `availability_always_warns` son hücresi TODO olarak kırmızı (tam 23505); kök çözüm sabah kararıyla. |

**Ölçüm hükümleri (Done when 5):**
- **BL-191 — değişmiş.** Kural hiç çiğnenmiyor. Çakışmada şablon ikinci vardiyayı açık vardiyaya çeviriyor, otomatik doldurma ikinci atamayı reddediyor. Dinlenmede ise ikisi de kontrol etmiyor. Yazma tetikleyicisi yakaladığı için işlemin tamamı ham 23514 hatasıyla duruyor ve haftaya hiçbir şey yazılmıyor. Otomatik doldurma bu çifti öneriyor bile. Örnek: dinlenme kuralı 10 saat; Deniz'e Pazartesi 16–23 ve Salı 05–10 veren şablon "A current conflict acceptance is required" hatası verir. Takip işi (ürün kararı): toplu yol dinlenme çakışmasını ne yapsın (açık vardiyaya çevir / sor / atla). Test: `schedule_bulk_paths_keep_rest`.
- **BL-315 — değişmiş, DB-4 dışı:** web'de sıralama, ~1 ms. Kapatılabilir ya da küçük bir web işi.
- **BL-537 — bayat:** planlayıcı workspace süzgecini ileri itiyor (0,078 ms, 650 lokasyon).
- **BL-544 — geçerli:** iki serbest bırakma fonksiyonu aynı kuyruğu tekrarlıyor; ortak yardımcı mümkün (ayrı iş).
- BL-619 bayat (kapalı, kilit `availability_always_warns`); BL-326 bayat (yalnız kilit eklendi).

**Kanıt:**
- Kırmızı → yeşil (dosya başına geri alınan transaction): `published_shift_rechecks_time_off` 1. hücre, `schedule_read_model_important_dates` 3 hücre, `schedule_publication_status_names_source_draft` 5. hücre, `time_off_pending_publish_note` 11. hücre; migration'la hepsi yeşil (inceleme ayrıca doğruladı).
- Tam ci-green 17:54–17:59Z (koordinatör izniyle): 179 dosya, 3 kırmızı (`bl052_document_lifecycle`, `bl052_document_notifications`, `document_types_rls`). Üçü dalın hiçbir migration'ı olmadan da aynı hatayla düşüyor; bilinen taban. Workspace 467 → 467.
- Izgara bütçesi (`schedule_grid_read_budget` kurulumu + 60 önemli tarih; en hızlı sıcak okuma, iki tur sırayla): owner 23,5 / 23,3 ms (B-7'siz) → 23,1 / 22,5 ms (B-7'li); tek lokasyon müdürü 15,6 / 16,1 → 14,8 / 15,6 ms. Sınır 50 ms.

### 3. Açık kalanlar
- BL-238 ("bu hafta" UTC) ve BL-759'un kodu: Mert'in sabah kararı (S24 ve öteki soru).
- `nf-backend`: API'deki önemli tarih / kapalı gün sorgusu ve TS süzgecinin silinmesi (Done when 3, grep boş).
- İnceleme Düşük-1: yayınlayan adı hesap adından (`user_profiles.display_name`) okunuyor. Izgara ise workspace kaydındaki adı kullanıyor. Tutarlılık için ayrı küçük iş; backlog'a önerilir.
- İnceleme Düşük-2: BL-191'in backlog satırı bu hükümle güncellenmeli (koordinatörün dosyası).

### 4. Ekranda ne değişti
Bu dalda görünürde bir şey değişmedi. API hâlâ kendi listesini basıyor. Taslak menüsündeki "Published by …" adı ve geçilemez bulgunun mesajı, migration main'e girince görünür.

### 5. Sırada ne var
1. Sabah: "gönder" izni, kalıcı migration (A hattından sonra), main'e gönderim.
2. `nf-backend` B-7 API yarısı.
3. BL-191 takip işi (toplu yolda dinlenme çakışması) için ürün sorusu.
4. EKRAN-03 A1.
