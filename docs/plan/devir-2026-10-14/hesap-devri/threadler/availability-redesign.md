# Devir raporu · Availability yeniden kurgu (Important Dates thread'i)

> **PAGES emekli (Mert, 15 Ekim 2026):** ekran ekran belge sayfaları (PAGES) artık kurulmaz, güncellenmez, yayınlanmaz; eski PAGES Artifact'leri yeni hesapta yeniden kurulmaz. Bu rapordaki PAGES adımları çıkarıldı; kalan PAGES sözleri yalnız geçmiş bilgisidir. `PAGES/_kaynak` yalnız varyant sayfalarındaki "Original" görüntüsünü demo veriyle çekmek için araç olarak kalır.

Yazan: Important Dates thread'inin Claude'u, 2026-10-14 ~16:55 UTC (09:55 AM Kaliforniya).
Thread: Project → "Important Dates" thread'i. Kök mesaj: `cmsg_013zBzr8GJv9vVEM4zDoaKrVF9qY395yPWmWkPPzNfPD9w`.

## 0. Üç satırda
- **Kodda yarım iş yok.** Dalda push'lanmamış ya da commit'lenmemiş hiçbir şey yok. Dalın bütün işi main'de.
- **Bekleyen tek iş:** Availability'nin yeni tasarımı ("4 · Day by day") kodlanacak. Bu iş Mert'in **"kodla"** demesini bekliyor.
- **Devir güvenli.** Plan, mockup, kaynak ve araçların hepsi `/mnt/project-files` altında.

## 1. Thread'in amacı
Thread iki iş yaptı:
1. **Important Dates + Announcements (2026-10-10 → 13).** Duyuru ve önemli tarih tek kayıt ve tek çekmece oldu. Önemli tarih lokasyon başına açık, kısa saat ya da kapalı gün tanımlar ve vardiyalara etkisini sorar. Çekmece dört sekmeli: Details · Audience · Shifts · History. Liste sütunları ve telefon görünümü de bu işin içinde. **Bitti, main'de.** Mert 2026-10-13 03:30 UTC'de "bu thread kapatılabilir mi" diye sordu ve "evet" dedi.
2. **Availability'nin baştan sona yeniden kurgusu (2026-10-13 →).** Mert aynı thread'de başlattı (09:50 UTC, "Seninle yine bir UI geliştirmesi yapacağız"). Sıra şuydu: keşif → spec → plan → mockup → kod. Tasarım seçildi. **Kod başlamadı.**

## 2. Bitenler

### 2a. Important Dates + Announcements (hepsi main'de)
| Ne | main'deki commit |
|---|---|
| Tek kayıt: DB + API + web + e2e (17 commit'in squash'ı, nf-guvenlik ONAY @b29e22b7) | `f2b806ad` |
| Çekmece dört sekme, Important Date referansına göre | `a6d07b49` |
| Saat kutuları ortada | `e9ad4ae3` |
| 12/24 saat, iki uçta AM/PM | `4a01e10c` |
| Requests ve duyuru metinlerinde AM/PM | `37e39002` |
| Yayın saati kutusu | `b9538297` |
| Hatalı yayın saati | `80132f5d` |
| Audience tek liste + "+ Add people" (Mert C'yi seçti) | `ca3fa17d` |
| Telefon listeleri | `d5b042a6`, `c1fef82e`, `df4b02ee`, `6b26900e`, `db5069f3` |
| Employees telefon listesi | `94d7aad1` |
| Diğer sayfalarda 16 px kenar | `93569a41` |
| Sütunlar: Important Dates başlığı | `5460c114` |
| Sütunlar: Important Dates | `8a254585` |
| Sütunlar: Announcements | `dd0302a6` |

PAGES 6.0 (Important Dates) ve 8.0 (Announcements) sayfaları `28aeb82b`'den yeniden kuruldu; sütun değişikliği bunun içinde.

### 2b. Availability (tasarım bitti, kod yok)
- **Keşif.** Bugün nerede ne olduğu: `/mnt/project-files/notes/availability/1-kesif.md`.
- **Spec ve plan.** Mert onayladı: `/mnt/project-files/notes/availability/2-spec-plan.md`. Seçilen tasarım ve üç parçalı kod sırası dosyanın sonundaki "Seçilen tasarım" bölümünde.
- **Mert'in kuralları (2026-10-13):**
  - Availability yalnız çalışanın tercihidir. Çalışan iki yerde girer: onboarding'de (atlanabilir) ve Employee Hub → My Availability'de.
  - Employees çekmecesinde müdür yalnız görür ve kendi notunu yazar. Bu, karar kartında "Yalnız görsün" seçimiydi.
  - Schedule'da hücrede yalnız işaret görünür; çakışma (conflict) yoktur. Her atamada kısa bir uyarı (toast) çıkar, onay istenmez. Mert'in sözü: "sadece ! işareti ile warning verir cell, conflict oluşturmaz. shift atanırsa her seferinde kısa bi uyarı çıkar ama onay bile gerektirmez."
- **Mockup'lar.**
  - İlk 5 mockup reddedildi. Mert: "hepsi çok amatör ve berbat olmuş. tamamen sil bunu yeni 5 tane sıfırdan yap." Hepsi silindi.
  - Gerçek uygulama kabuğu üstünde sıfırdan 5 tasarım ve bir Original yapıldı: `/mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html`.
- **Mert'in seçimi:** **"4"**, yani **Day by day** (2026-10-13 14:43 UTC).
- **İşaret.** "Müsait değil" işaretinin görünümünü Vardiya kartı thread'i belirledi: **5 · Nokta**, küçük turuncu nokta (Mert 2026-10-13 22:41 UTC). İşaretin kartta ve hücrede çizimi o thread'in işi. Kodu `70f3004a` commit'inde hazır ve Mert'in "şimdi mi, Availability ile mi" cevabını bekliyor (bkz. `vardiya-karti.md` §4).

## 3. Yarım kalan iş ve sonraki adım
Kod hiç başlamadı; dal, worktree ya da taslak kod yok. Mert "kodla" deyince iş üç parçada yapılır. Her parça ayrı trene gider.

**Parça 1 · Schedule: onaysız uyarı**
- Her atama yolunda "Schedule this shift anyway?" kutusu yerine kısa uyarı ve Undo gelir. Atama yolları: pencereyle ekleme/düzenleme, sürükle-bırak, kopyala-yapıştır, takas onayı.
  - Kutu metni: `apps/web/src/schedule/components/ScheduleConflictSheet.tsx:10`.
  - Pencere kararı: `apps/web/src/schedule/components/shift-window/useShiftEditor.tsx:220-250` (`attemptSubmit`). Orada `warnOnly` dalı zaten "Shift saved with a warning" toast'ını gösteriyor; availability nedeni her zaman bu dala düşmeli.
  - Sürükle-bırak incelemesi: `apps/web/src/views/SchedulePage.tsx:3218` ve `:3243` (`dropReview`).
- Çalışanın kendi programında küçük bir etiket görünür: "You marked this time unavailable".
- Dört ekranda ortak ad ve açıklama:
  - Ad: "Availability".
  - Müdür notunun adı: "Manager notes".
  - Açıklama cümlesi: "Availability is a preference, not a guarantee. If you're scheduled, the shift is yours: swap it, give it up, or request time off."
- **Dokunma:** işaretin çizimi (Vardiya kartı thread'inin işi).

**Parça 2 · Çalışan girişi**
- Yeni gün-gün bileşeni gelir: masaüstü ve telefon, hours ve shift types modları.
- Eski `apps/web/src/availability/WeeklyUnavailableEditor.tsx` (366 satır) silinir; ikiz sistem kalmaz. Onu kullanan form: `WeeklyPreferencesForm.tsx` (436 satır).
- Bileşen `WeeklyPreferencesPanel` üzerinden üç yerde kullanılıyor: `EmployeeDrawer`, `EmployeeOnboardingPage`, `EmployeeHubPage`.
- Kayıt şekli değişmez: `packages/shared/src/weekly-preferences.ts`, `WeeklyPreferenceSave`.
- Görsel referans mockup'taki sürüm 4: `kaynak/v4.js` ve `kaynak/v4.css`.

**Parça 3 · Müdür okuma**
- Employees çekmecesi: okuma çubuğu, tek cümle özet ve 7 gün kutucuğu.
- Sol menü → Availability (`apps/web/src/views/AvailabilityPage.tsx`, 395 satır): solda kişi listesi, sağda seçilen kişinin haftası. Telefonda önce liste, sonra kişinin sayfası.

**Üç parçada ortak olanlar**
- Sınıf: **incelemeli**. Her parça nf-guvenlik ONAY'ı alır ve 1440 ile 390 görüntüsü çekilir.
- e2e PC (Remote Control) thread'inde koşar. Main'e yalnız trenle gider.
- Migration beklenmiyor; veri modeli aynı kalıyor.

## 4. Mert'ten beklenen
1. **"kodla" (Availability).** Önerim parça 1'den başlamak. En küçük parça o ve Schedule'daki can sıkıcı onay kutusunu hemen kaldırıyor.
2. **Turuncu nokta ne zaman yayına çıksın?** Bu soru Vardiya kartı thread'inin. Cevap "Availability ile" olursa nokta parça 1'in trenine biner.

Bu thread'den Mert'e açık başka soru yok.

## 5. Dal ve push durumu
- Dal: `claude/important-dates-drawer-a-q470vy`. Son push: `0bf610f0`. Yerel ve origin aynı.
- Commit'lenmemiş ya da push'lanmamış iş **yok**. Çalışma ağacı temiz, stash yok. PR yok (bu repoda PR açılmıyor).
- Dalın 41 commit'inin hepsinin main'de karşılığı var. Konu satırlarıyla tek tek eşleştirildi (tablo 2a'da).
  - `git cherry` bunları "+" gösterir. Bu yanıltıcı: tren bazılarını squash'ladı (`f2b806ad`), bazılarını cherry-pick etti, bu yüzden yamalar birebir aynı değil.
- Dal güncel main'in (`9b871a97`) çok gerisinde; ortak noktası `625c7c85`. **Yeni iş bu dala yazılmaz.** Yeni hesaptaki thread güncel `origin/main`'den kendi dalını açar. Bu dalın silinmesi koordinatörün kararı; iş main'de doğrulandı.
- Bulut kopyasındaki iki geçici worktree (`aud-wt`, `cp-wt`) yalnız önizleme içindi:
  - `aud-wt`'deki değişiklik Audience varyant önizlemesiydi. Birebir aynısı zaten kayıtlı: `/mnt/project-files/pages/gorsel-kararlar/gelen/announcements-audience/source/varyantlar.diff`.
  - Kaybolacak kod yok.

## 6. GÜVENLİ DEĞİL
**Yok.** Bekleyen push, canlı veritabanı adımı ya da migration yok. Bekleyen iş Mert'in "kodla"sı; yeni hesapta güvenle kaldığı yerden başlar.

## 7. İlgili dosyalar

**Availability**
- Keşif: `/mnt/project-files/notes/availability/1-kesif.md`
- Spec, plan ve seçilen tasarım: `/mnt/project-files/notes/availability/2-spec-plan.md`
- Mockup sayfası (tek dosya, internet olmadan açılır; yalnız font Google'dan gelir): `/mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html`
  - Önizleme görüntüleri aynı klasörde: `onizleme-masaustu.png`, `onizleme-telefon.png`.
  - Kaynak: `kaynak/` (core.css/js ve o, v1–v5 için .css/.js). Yeniden derlemek için o klasörde `python3 build.py`.
  - Adres çubuğu seçenekleri:
    - `#v=4&s=mine&view=both&mode=hours`
    - `v` = o, 1–5
    - `s` = mine, onboard, team, drawer, schedule, mysched
    - `view` = both, desk, phone
    - `mode` = hours, types
    - `about=0` sağdaki "Bu tasarım" panelini gizler
- İşaret (Nokta) tasarımı ve ölçüleri, Vardiya kartı thread'inden: `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/README.md` ve `kaynak/marks.ts`.
- Bu thread'in olmayan, 9 Ekim'den kalma eski availability sayfaları (yalnız tarihçe): `/mnt/project-files/pages/musaitlik-tasarimlari/`, `/mnt/project-files/pages/schedule-musaitlik-izin/`.

**Important Dates + Announcements (bitti; yalnız referans)**
- Tek çekmece prototipi: `/mnt/project-files/pages/tek-cekmece-prototip.html`. Aynısı ve README'si `/mnt/project-files/pages/gorsel-kararlar/gelen/announcements-important-dates/` altında.
- İlk plan sayfası (10 Ekim): `/mnt/project-files/pages/important-dates-yeni-istekler.html`
- Audience varyantları (Original, A, B, C; Mert C'yi seçti): `/mnt/project-files/pages/gorsel-kararlar/gelen/announcements-audience/` (`README.md`, `index.html`, `shots/`, `source/varyantlar.diff`)
- Sütun değişikliğinin önce/sonra görüntüleri: `/mnt/project-files/notes/important-dates/sutunlar/`

**Bu devir için kopyalananlar:** `/mnt/project-files/devir/threadler/availability-redesign-kaynak/`
- `olcum-betikleri/`: mockup'ları tarayıcıda açıp görüntü alan Playwright aracı ve senaryoları.
  - Araç: `shot.mjs`. Senaryolar: `o.json`, `v1.json`–`v5.json`, `all.json` (60 ekran), `pv.json` (önizleme), `probe*.json`.
  - Kullanım: `node shot.mjs <mockup klasörü> <çıktı klasörü> <port> <senaryo.json>`.
  - Araç repodaki `node_modules` içindeki Playwright'ı ve `/opt/pw-browsers/chromium`'u kullanır. Başka bir makinede bu iki yol değiştirilir.
- `ekran/onizleme/`: 6 tasarımın masaüstü ve telefon görüntüleri (`pv-*.png`).
- `ekran/secilen-4/`: seçilen tasarımın bütün ekranları (`all-4-*.png`).
  - `mine`, `onboard`, `drawer`, `team` ekranları; `-t` ile bitenler shift types modu.
  - `schedule`, `mysched` ve `obrev` (onboarding özeti) de var.
- `audience-deneme/`: Audience deneme Artifact'ının yayındaki son kaynağı (`deneme.html` + `app.html`). Asıl kaynak bulut oturumunun geçici klasöründeydi. `app.html` içindeki demo giriş şifresi `DEMO-SIFRE-CIKARILDI` ile değiştirildi; Audience denemesi bundan etkilenmez.
- `hafiza/`: bu thread'in iki hafıza notu, `availability-yeniden-kurgu.md` (bugün güncellendi) ve `important-dates-drawer.md`. Koordinatörün hafıza kopyasında da var (`/mnt/project-files/devir/koordinator-hafiza/`). Ancak `availability-yeniden-kurgu.md`'nin güncel hâli bu klasördeki.

**Bilerek kopyalanmayanlar:**
- Reddedilen ilk mockup setinin geçici kalıntısı. Mert "tamamen sil" dedi.
- PAGES derleme çıktıları ve geçici test veritabanı dökümleri. Hepsi repodan yeniden üretilir.

## 8. Artifact'lar (bu hesapta; yeni hesap göremez)
Bu thread'in yayınladıkları:
| Artifact | Ne | Kaynak | Durum |
|---|---|---|---|
| https://claude.ai/artifact/FXWWvxLd3T9v5Qfy4112Mm | Tek çekmece prototipi (v10.1) | `/mnt/project-files/pages/tek-cekmece-prototip.html` | İş bitti, referans |
| https://claude.ai/artifact/S4g9JVLfFCcLW42QFPeSb3 | Important Dates yeni istekler planı | `/mnt/project-files/pages/important-dates-yeni-istekler.html` | Tarihçe |
| https://claude.ai/artifact/1tUcSJNCQhECQDtpjj6b9V | Audience sekmesi denemesi (O/A/B/C) | `availability-redesign-kaynak/audience-deneme/` | C main'de, tarihçe |
| https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471 | Kaynak bandı dizini | `/mnt/project-files/pages/kaynak-bandi/dizin.html` | Artık başka thread'ler güncelliyor |

- **Availability mockup'ları yayınlanmadı**, çünkü o gün Artifact sınırı doluydu. Mert dosyayı açarak seçti. Yeni hesapta link gerekirse `availability-tercih/index.html` tek dosya olarak yayınlanır.
- Mert'in Important Dates için verdiği referans tasarım: https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX. Görünümü main'e işlendi.
- Bu devirde yeni Artifact yayınlanmadı ve hiçbiri silinmedi.

## 9. Yeni hesaba taşınacak bulgular, kurallar ve çıkarımlar

**Kayıtta düzeltilecek eski bilgi**
- `docs/plan/KARARLAR.md` main'de 173. satır, "Müsaitlik tercih" maddesinin (4). bendi hâlâ şöyle diyor: "Beş görünüm (A–E ve Original) … thread B'yi öneriyor". Bu, **reddedilen ilk sete** ait. Doğrusu:
  > (4) Mert 2026-10-13 14:43 UTC'de "4 · Day by day"ı seçti (`/mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html`, sürüm 4). İlk beş görünüm reddedildi ve silindi. Kod üç parça (`2-spec-plan.md` "Seçilen tasarım"); Mert "kodla" yazana kadar kod yok.
- Bu düzeltme ilk kod dalında yapılır. CLAUDE.md §6: Mert'in thread'de verdiği ürün kararı o thread'in dalında `KARARLAR.md`'ye girer.

**Ürün kuralları (Mert)**
- Availability yalnız tercih ve hiçbir yazmayı engellemez: taslak, yayın ve takas dahil.
- Onaylı izin her zaman engeldir (kırmızı). Availability turuncu işarettir.
- Auto-fill müsait olmayanı seçmemeye devam eder. Bu benim varsayılanımdı; Mert itiraz etmedi.
- Müdür notu (M12) kendi işleviyle kalır; yalnız adı "Manager notes" olur.
  - **Dikkat:** M12'ye göre vardiya hem nota hem müsaitliğe çakışırsa bugün iki satırlı tek kutu çıkıyor. Yeni kuralda müsaitlik toast'a geçiyor, not kendi kartında kalıyor.
  - Benim varsayılanım: toast ve not kartı birlikte, kutu yok. Mert'e yalnız itiraz ederse sorulur.
- Telefonda yazı kutuları ≤767 px genişlikte 16 px olur.

**Tasarım dersleri (ilk set neden reddedildi)**
- Sahte kabuk, kolaj gibi yan yana paneller ve taramalı süs işleri "amatör" bulundu.
- İkinci set işe yaradı:
  - gerçek uygulama kabuğu ve uygulamanın kendi renk ve boşluk değerleri (`--theme-*`) kullanıldı;
  - her varyantta "Bu tasarım" paneli Türkçe olarak fikri, artısını, eksisini ve "dene" adımını yazdı;
  - Original her zaman ilk sırada durdu.
- Varyant sayfasında "hangisi?" sorusu olmaz; Mert numarayla cevap verir.

**Mockup motorunun bilinmesi gerekenleri** (`kaynak/core.js`, `window.NF`)
- Gün modeli `{all, r:[[a,b]], t:[types]}`. Saatler dakika cinsinden, 360 (06:00) ile 1560 (ertesi gün 02:00) arası.
- Her varyant `N.variants[id] = {editor, phoneEditor, readOnly, phoneReadOnly, team, phoneTeam, …}` ile kaydolur.
- 60 varyant × ekran × mod birleşimi konsol hatası olmadan açıldı.
- Sürüm 5'in cümle ayrıştırıcısı 20 ifadeyle denendi.

**Koddaki gerçekler**
- Sunucu availability'yi zaten yalnız uyarı sayıyor: `supabase/schema.sql` ~8932, `conflict_severity` 'availability' ve 'note' kodlarını atlıyor. **Migration gerekmiyor.**
- Onay kutusunu istemci açıyor (`useShiftEditor.tsx` `attemptSubmit`).
- `apps/web/src/schedule/lib/scheduleAvailabilityMark.ts` "a manager's note is never drawn (M12)" kuralını taşıyor.
- Veri uçları: `availability-data.ts` → `/v1/workspaces/{ws}/availability/weekly…`.
- Okuma şekli `weeklyPreferenceReadSchema`:
  - `employee` ve `manager` (`enabled` + `notes[7]`) kayıtları;
  - `settings.input_mode`, `shift_types`, `time_format`.
- Kayıt `source: employee|manager` taşır.

**Süreç**
- Proje kuralı #15 (Mert 2026-10-14): kaliteyi düşüren "zorla" bir özelliğin çıkarılması önerilebilir. Öneri sade dille, 5N1K ve "varken/yokken" sonuçlarıyla yazılır; özellik ancak Mert onaylarsa çıkar.
- Bulut thread'inde veritabanı, e2e ve tren yok. Bunlar PC thread'inde koşar; tren isteği koordinatör üzerinden gider.
- Artifact sınırı (hesap başına günde 200) yeniden yayınları da sayar. Yalnız içerik gerçekten değiştiyse yayınlanır.

## 10. Yeni hesapta bu işi sürdürecek thread için brief taslağı
```
İŞ: AVAIL-1 (Availability yeniden kurgu, parça 1) — her atama yolunda availability onay kutusu yerine onaysız kısa uyarı + Undo; çalışanın programında etiket; dört ekranda ortak ad ve açıklama.
Bitti ölçütü:
- Pencere, sürükle-bırak, kopyala-yapıştır ve takas onayında availability yüzünden kutu çıkmıyor; tek toast + Undo var, vardiya kaydediliyor (vitest + Playwright, e2e PC thread'inde).
- Onaylı izin ve gerçek çakışmalar eskisi gibi duruyor (testler gevşetilmeden).
- Çalışanın programında "You marked this time unavailable" etiketi (1440 ve 390 görüntüsü).
- Onboarding, My Availability, çekmece ve Availability sayfasında aynı ad ve aynı açıklama cümlesi; "Manager notes" adı.
- KARARLAR "Müsaitlik tercih" (4). bendi düzeltildi (devir raporu §9).
Dokun: apps/web/src/schedule (useShiftEditor, ScheduleConflictSheet, SchedulePage drop review), apps/web/src/availability metinleri, ilgili testler · Dokunma: işaretin kartta/hücrede çizimi (Vardiya kartı thread'inin; Nokta commit'i 70f3004a), auth ekranları, main'e doğrudan push.
Sınıf: incelemeli (birden çok ekran, paylaşılan bileşen) · migration yok.
İlgili kararlar: KARARLAR "Müsaitlik tercih" (2026-10-13), M8 (kısmen yerine geçti), M12, P24; Mert 2026-10-13 14:43 UTC "4".
Okunacak: /mnt/project-files/devir/threadler/availability-redesign.md, /mnt/project-files/notes/availability/2-spec-plan.md, /mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html (#v=4).
Dal: güncel origin/main'den yeni dal (eski claude/important-dates-drawer-a-q470vy'ye yazma).
Önerilen skill'ler: superpowers:test-driven-development, superpowers:verification-before-completion.
Not: Mert "kodla" demeden kod yok. Parça 2 (gün-gün editörü, WeeklyUnavailableEditor silinir) ve parça 3 (çekmece kutucukları + Availability sayfası liste/detay) ayrı işler, ayrı trenler.
```
