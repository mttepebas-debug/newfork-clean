# EKRAN-01 DB-3 — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-3 — şablon Replace, mola, "Live" etiketi, not, kapalı gün | `nf-db` / veri hattı | R3 | ONAY @28dc6113 (`nf-guvenlik`, 2. tur; 1. tur DEĞİŞİKLİK); 2. turun tek Düşük bulgusu inceleyenin önerdiği satırla kapandı (`9b93169d`) | 2026-10-06 |

## Sonrası için
- Tuzak: taslaktan açılan düzenlemede yayın kopyasının satırı yayının `source_shift_id`'siyle aynı kimliği taşır ama `source_published_shift_id` boştur (işareti yalnız yayından açılan oturumda tetikleyici koyar). "Bu satır yayının kopyası mı?" sorusu kimlikle sorulur: `coalesce(published.source_shift_id, published.id) = <satır>.id`, güncel yayında.
- Tuzak: hata fırlatan doğrulayıcı bir sorgunun içinde (alt sorgu / CTE) duruyorsa, sorgunun öbür tarafı boşken hiç çalışmaz. Önizleme gibi yollarda doğrulama ayrı `perform` ile çağrılır ve boş bir durumla test edilir.
- Kalıp: toplu silen yolda (Replace) lokasyon × departman **çift** olarak eşlenir; ayrı kümeler çaprazı da siler.
- Kalıp: başlamış vardiya `lower(app_private.shift_time_range(date, start, end, coalesce(time_timezone, location.timezone))) <= now()`.
- Kalıp (araç): bash heredoc içinde `$$`/`$q$` ve tek tırnak karışınca Git Bash "unexpected EOF" veriyor; betiği Write ile dosyaya yazıp çalıştır.

## Rapor
**Karar:** DB-3 bitti, `nf-guvenlik` ONAY @28dc6113 (2 tur: DEĞİŞİKLİK → ONAY); 2. turun Düşük bulgusu da kapandı.
**İzin:** R3 — main'e gönderim ve canlı migration için izin istiyorum (migration veri siliyor: Replace yalnız-taslak vardiyayı siler).
**Risk:** 🟠 Replace'in sildiği küme daraldı ve testle kilitli; web'in yeni önizleme ucunu ve "Replace" iki tıkını W-3 kuracak — o gelene kadar ekran bugünkü tek tıkla Overwrite'ı çağırır, ama artık yalnız şablonun lokasyon+departman çiftlerini ve başlamamış vardiyaları temizler.
**Soru:** koordinatöre — Replace'in "lokasyon (ve departman)" okumasını **çift** olarak uyguladım (Kadıköy Kitchen + Beşiktaş Bar şablonu, Kadıköy Bar'ı ve Beşiktaş Kitchen'ı silmez). Dayanak: ILKELER P09 (veri sessizce düşmez) + inceleme önerisi. KARARLAR "Şablonda Overwrite…" satırının metni bu okumaya göre düzeltilmeli (koordinatörün dosyası).
**Sonraki:** EKRAN-02 A1 (takas uygunluk motoru) — tazelik ölçümü başladı.

### EKRAN-01 DB-3 — şablon ve yayındaki haftanın verisi (nf-db/veri)

Delegasyon: R3 (veri silme yolu); `nf-guvenlik` zorunlu inceleme yapıldı (2 tur); görsel QA yok (ekran kodu değişmedi).
**Ultrareview:** önerilmez — iki tur bağımsız inceleme bir Yüksek hatayı buldu ve kapattı, her bulgu testle kilitli; Mert "iki inceleme yeter" dedi (ILKELER P06).

**Senin yerine verdiğim kararlar**
- Replace çift eşleme (yukarıda, P09).
- Önizleme ayrı servis (`preview_schedule_template_apply_service`), uygulamanın modu değil: okuma ile yazma ayrı kalır, ikisi aynı kural fonksiyonunu çağırır (P19).
- Replace yayın kopyasını silmez, "Delete" gibi "silinecek" işaretler; müsaitlik onaylarını toplu silmeyle aynı biçimde iptal eder.
- BL-545'te açık düzenlemenin revizyonu artar (düzenleyenin bir sonraki kaydı bir kez "session revision stale" alır, ekran yeniden yükler) — `shift_exchange_rebase_drafts` ile aynı desen.

### 1. Nerede duruyor
Bitti, dalda; "gönder" iznini bekliyor.
- Dal `task/ekran-01-db-3`, worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-db-3`; `origin/main` `380ee05e` üstüne rebase edildi (çatışma yok). Commit'ler `511aed11`, `3304a858` (ONAY verilen `28dc6113` ile aynı içerik), `9b93169d` (Düşük bulgu) + bu arşivin commit'i.

### 2. Ne yapıldı (etkisi)
| Konu | Öncesi | Sonrası |
|---|---|---|
| Replace (S3, D-O4, B-4) | Schedule → Templates → şablon → Overwrite haftanın **bütün** lokasyonlarındaki ve departmanlarındaki vardiyaları, başlamış olanlar dahil siliyordu; yayındaki haftada yayın kopyasını da doğrudan siliyordu. | Yalnız şablonun yazdığı (lokasyon, departman) çiftlerindeki, **başlamamış** vardiyalar gider. Ör. Zeynep yalnız Kadıköy Kitchen şablonuyla Replace eder: Beşiktaş ve Kadıköy Bar kalır; Salı sabah başlamış 9–17 vardiyası durur. Yayındaki haftada yayın kopyası "Staged for removal" olur. |
| Replace'in ilk tık yazısı | Sunucuda sayı yoktu. | Yeni uç önceden kaç vardiyanın gideceğini söyler ("24 shifts will be removed." için sayı); hiçbir şey yazmaz; yetki ve hatalar uygulamayla aynı. |
| Mola (D-O2) | 30 dk molalı vardiyalar şablona kaydedilip uygulanınca mola 0 oluyordu; haftalık saat şişiyordu. | Şablon molayı saklar, uygular ve okuma ucunda döndürür. |
| "Live" etiketi (D-O1) | Yayındaki haftaya eklenen yeni vardiya hemen "Live - published to employees" yazıyor, menüde "Unpublish shift" çıkıyordu. | Yalnız güncel yayının gerçek kopyası "Live" sayılır; yeni vardiya, şablon ve yapıştırma taslak olarak görünür. |
| Not (BL-292) | Notu göndermeyen bir kayıt yolu notu sessizce siliyordu. | Yükte `note` yoksa not korunur; silmek için boş metin gönderilir. |
| Kapalı gün (BL-545) | Açık düzenlemedeki kaydedilmemiş vardiya kapalı güne düşünce Ali'de kalıyordu; kaydedince Ali kapalı güne geri yazılıyordu. | K16 açık düzenlemeye de uygulanır: vardiya open'a düşer, "draft shifts drop" sayısına girer; ekran yeniden yükler. Yayının kopyası (müdür "keep" dediyse) dokunulmaz. |

### 3. Açık kalanlar
- **Web (W-3, `nf-arayuz`) ve shared tip (`nf-backend`):** Replace iki tık + ilk tık yazısı yeni uçtan; şablon vardiya tipine `unpaid_break_minutes`. Sözleşme aşağıda.
- **Yolda bulunan (backlog önerisi, inceleme notu):** `mutate_schedule_edit_shift_service`'te yükte `unpaid_break_minutes` ya da `hide_time_on_badge` yoksa değer 0 / false'a dönüyor (BL-292'nin kardeşi; bu dal getirmedi) `(leave: low / do: safe)`. Kapalı gün kaydı ile düzenleme ters sırada kilitliyor; seyrek bir deadlock'ta biri hata alır, veri bozulmaz `(leave: low / do: moderate)`.

### Sözleşme — `nf-backend` / W-3 için
- `public.preview_schedule_template_apply_service(actor_user_id, target_workspace_id, target_session_id, target_template_id, department_keys text[] default null)` → `{"removed_shift_count": <int>}`. Yazmaz. Hatalar uygulamayla aynı: yetki 42501 + `authz.*`; başkasının / bilinmeyen oturumu `P0002 'edit session not found'`; bilinmeyen şablon `P0002`; kapsam dışı şablon lokasyonu `23503`; bozuk ya da boş departman listesi `22023`; bilinmeyen/arşivli departman `P0002`. Yalnız `service_role` çalıştırır; `authorization_coverage`'da `schedule.templates`.
- `apply_schedule_template_service` cevabına `removed_shift_count` eklendi (imza aynı).
- `get_schedule_template_service` vardiya başına `unpaid_break_minutes` döndürür (0/15/30/45/60).

### 4. Ekranda ne değişti
Görünürde bir şey değişmedi; ekran hâlâ tek tıkla Overwrite çağırıyor (iki tık W-3'te). Davranış farkı: Overwrite artık başka lokasyon / departmanı ve başlamış vardiyayı silmiyor; yayındaki haftaya eklenen yeni vardiya "Live" yazmıyor; şablondan gelen vardiyanın molası korunuyor.

### 5. Sırada ne var
1. "Gönder" izni → `main.lock`, rebase, tam kapı + `test:db`, push; main CI yeşil → canlı migration (yedek + doğrulama).
2. EKRAN-02 A1 (bu oturum).

### Kanıt
- Kırmızı → yeşil (ortak yerel DB, tek transaction + rollback): `template_replace_stays_in_its_lane` (yeni) geçici kolon + boş fonksiyonla 10/14 düşüyordu → 26/26; inceleme hücreleri eski migration'da kırmızı (bulgu 1: `closed_days_reach_the_shifts` 39, 41, 42; Düşük bulgu: hücre 21). `shift_note_survives_every_path` migration'sız hücre 5 kırmızı → 17/17. `closed_days_reach_the_shifts` migration'sız 34, 35, 36, 38 kırmızı → 56/56. `authorization_coverage` 5/5, `schedule_asks_the_core` 90/90.
- Komşu 30 dosya (template, edit_session, important_date, closed, note, publish, draft, authz, retired, browser_privileges…) migration ile yeşil.
- Dokunulan dosyalar: `supabase/migrations/20261007090000_templates_and_published_weeks_keep_their_data.sql` (canlı tanımlardan "tam bir kez eşleşmeli" betikle türetildi), `supabase/tests/template_replace_stays_in_its_lane.test.sql`, `closed_days_reach_the_shifts.test.sql`, `shift_note_survives_every_path.test.sql`, `authorization_coverage.test.sql`, `ci-green.txt`, `.claude/agent-memory/nf-guvenlik/` (inceleme notu).
- Ortak yerel DB'ye kalıcı uygulama yok (son sürüm `20261007080000`); tam `test:db` gönderim penceresinde.

## İnceleme

### Tur 1 (`2bb043ff`) — `nf-guvenlik`: KARAR: DEĞİŞİKLİK İSTE
- **1. Yüksek — kapalı günde "keep" seçimi taslakta ve açık düzenlemede eziliyor.** Oturum dalı yalnız `source_published_shift_id is null` diye süzüyordu; taslaktan açılan düzenlemede yayın kopyası işaretsiz olduğundan "taslak vardiyası" sayıldı, `id = any(drafts)` taslak satırını da etkiledi. Ölçüldü: Ali Kadıköy Çarşamba 9–17 yayında; owner haftayı "Changes" diye kaydedip açar; Ayşe Çarşamba'yı kapatıp Ali'yi keep yapar → yayında Ali kalır, taslakta ve düzenlemede open olur; önizleme "1 draft shift will drop" der. Beklenen: oturum dalı taslak dalındaki kimlik süzgecini kullansın; senaryo hücre olsun. **Düzeltildi** (`3304a858`).
- **2. Orta — Replace lokasyon ile departmanı ayrı kümeler olarak eşliyor.** Kadıköy Kitchen + Beşiktaş Bar şablonu 4 vardiyayı siliyordu (Kadıköy Bar, Beşiktaş Kitchen dahil); Kitchen-only şablonla "Bar" seçimi Kadıköy Bar'ı siliyordu. Soru: çift mi ayrı mı? Önerilen çift (P09). **Çift uygulandı.**
- **3. Düşük — önizleme ile uygulama farklı doğruluyor** ('nope' önizlemede 22P02 / uygulamada 22023; '{}' önizlemede 0; arşivli departman önizlemede kontrol edilmiyor). **Tek doğrulayıcıya taşındı.**
- **4. Düşük — başlamış vardiya kanıtı zayıf** (dünkü, hafta dışı satır). **Aynı haftada süren vardiya hücresi eklendi.**
- **5. Düşük — önizlemenin "hayır" hücreleri eksik.** **Başka workspace 42501, başkasının oturumu P0002, kapsam dışı şablon 23503 eklendi.**
- Temiz bulunanlar: workspace ayrımı (`w` ile süzme; P0002/42501 uygulamayla aynı), kapsam (şablon lokasyonları kişinin kapsamında, 23503), grant'ler (anon/authenticated kapalı, yardımcıya service_role bile erişemiyor), silme yolu (yalnız taslak satır silinir, yayın kopyası işaretlenir), tetikleyici (D-O1; kurtarma yolu işareti açıkça koyuyor, iki benzersiz indeksten geçiyor), BL-292 (create yolu boş not), D-O2, BL-545'te revizyon artışı (tek seferlik stale, döngü yok).
- Öneriler (engel değil): mola / saat gizleme varsayılanı; kilit sırası (yukarıda backlog önerisi).
- Kanıt: probe 1 (çift eşleme), probe 2 (keep senaryosu, migration ile 2/3 kırmızı, migration'sız 3/3 yeşil), grant'ler, `diff -w` ile canlı tanım karşılaştırması; `db.lock` alındı ve bırakıldı; deneme sonrası iz yok.

### Tur 2 (`28dc6113`) — `nf-guvenlik`: KARAR: ONAY @28dc6113
- Tur 1'in beş bulgusu: 1, 2, 4, 5 kapandı (probe 2 yeniden 3/3; yeni hücreler 1. tur migration'ıyla kırmızı, düzeltmeyle 56/56); 3 büyük ölçüde kapandı.
- **Yeni Düşük — boş düzenlemede önizleme bozuk departman seçimini reddetmiyor:** doğrulayıcı sorgunun içinde, satır yokken çalışmıyor; 'nope' / '{}' "0 shifts" diyor, uygulama 22023 ile reddediyor. Düzeltme: önizlemenin başında ayrı `perform`; boş düzenleme hücresi. **Kapandı** (`9b93169d`; hücre 21 eski hâlde kırmızı, şimdi 26/26).
- Temiz: kopya süzgeci taslak dalıyla birebir; yeni doğrulayıcı anon/authenticated'a kapalı; `null` departman listesi eskisi gibi; kapsam kayması yok.
- Kanıt: `template_replace_stays_in_its_lane` 25/25, `closed_days_reach_the_shifts` 56/56, `shift_note_survives_every_path` 17/17, `authorization_coverage` 5/5 (@28dc6113); `db.lock` alındı/bırakıldı.
- Hafıza notu: `.claude/agent-memory/nf-guvenlik/checklist-copy-rule-by-id.md` (bu dalda commit'li).
