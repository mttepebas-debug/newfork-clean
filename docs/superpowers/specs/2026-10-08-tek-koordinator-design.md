# Tek koordinatör iş akışı (v2) — tasarım

Tarih: 2026-10-08 · Yazan: Mert'in oturumu (Claude) · Durum: taslak, Mert'in incelemesini bekliyor
Mert'in seçimleri (2026-10-08, soru turu): çalışanlar koordinatörün içinde · tam test trende bir kez, CI'da · tek karar defteri + tek durum sayfası · eski kural dosyaları geri getirilmez (Mert masaüstüne yedekledi; kaynak olarak git'teki son hâlleri okunur).

## Değişiklikler (Mert, 2026-10-08, sonradan)

Bu kararlar aşağıdaki metinle çeliştiğinde geçerli olan bunlardır; kurallar `CLAUDE.md`'de ve `/oto`'da.

- **D1 Main'e gönderim:** yalnız tren, beklemesiz. Hazır dal varsa ve tren koşmuyorsa tren hemen kalkar; koşan tren varsa dal sonrakine biner.
- **D2 İşçi sınırı:** aynı anda 1 işçi; fazlası yalnız Mert komut verince (`DURUM.md` "Sağlık"ta `işçi sınırı <n>`). §4 ve §12 buna göre düzeltildi.
- **D3 Main koruması:** ücretsiz alarm. Koordinatör her turda `node scripts/main-watch.mjs` ile main'e trenden başka yoldan commit girip girmediğine bakar; girdiyse 🔴 alarm, yeni iş başlamaz, Mert'e söylenir. Sunucu tarafı koruma (GitHub dal koruması) fikrinin yerine geçer.
- **D4 Main kırmızı:** önce geri al; canlı veritabanına dokunan değişiklikte önce düzelt. Sahibi yapar; 15 dakikada yapmazsa koordinatör. Süre kırmızının yük mü kod mu olduğu ayrıldıktan sonra başlar. §7.3'teki "Main kırmızıysa ilk tren yalnız düzelteni taşır" bununla birlikte okunur.

## Özet

- Mert yalnız **bir pencereyle** konuşur: koordinatör. Başka oturum açılmaz.
- İşi koordinatörün içinde, arka planda çalışan **alt ajanlar** yapar. Sonuçları koordinatöre kendiliğinden gelir. Bir kanca her ajanın son raporunu ayrıca diske yazar. Mesaj ya da rapor kaybolamaz.
- Ajan yalnız kendi dosyalarına **hızlı kontrol** koşar. Tam test **trende bir kez, CI'da** koşar. Main'e CI'ı yeşil olan commit'in kendisi gider.
- **Tek kilit** kalır (`db`). Kilidi oturum değil yalnız bir komut tutar; komut bitince kilit kendiliğinden açılır.
- Mert döndüğünde **tek dosya** okur: `DURUM.md`. Sorular tek turda sorulur.
- Ortak hafıza: kısa `CLAUDE.md` ve **tek karar defteri** `docs/plan/KARARLAR.md`. Bir **hakem ajanı**, defterde dayanağı olan soruyu kendisi karara bağlar; dayanağı olmayan soru Mert'e gider.
- `/oto` komutu gece ve gündüz aynı çalışır. Koordinatör saatlerce kendi döner; Mert dönünce `/durum` yazar.

## 1. Neden (ölçüm, 2026-10-06…08)

| Sorun | Ölçüm | Kök |
|---|---|---|
| CI uzun ve kalabalık | 60 koşu, medyan 14,3 dk, en uzun 40 dk; günde ~4,8 saat; 1/3'ü dal koşusu | Tek bilgisayar; aynı değişiklik 4 kez ağır test görüyor (dalda tam kapı, dal CI'ı, tren kapısı, main CI'ı) |
| Saatlerce bekleme | 2026-10-08 öğleden sonra 5 oturum ~5 saattir koordinatör kararı ya da ağır test sırası bekliyordu | Ağır test sırası tek kilitte; karar tek koordinatörde, oturumlar arası mesajla |
| Kilit tutma | `main.lock` 387 dk takılı kaldı (10-08 08:46); tren-1 `db` + `heavy` kilidini yeniden başlatma boyunca tuttu | Kilit oturuma bağlı; oturum durunca kilit kalıyor |
| Kayıp mesaj, rapor | `send_message` en az 6 kez ulaşmadı (DERSLER 09-29, hafıza 10-04, DERSLER 10-07); bir alt ajanın raporu 5 saat görülmedi | Oturumlar arası mesaj teslim garantisi yok |
| Okuma yükü | 13 kural ve kayıt dosyası ~7.900 satır (KOORDINATOR-KARARLARI 1.889, BACKLOG 3.134); ~20 oturum penceresi | Bilgi birçok yerde, tekrar ve çelişki var |

## 2. Başarı ölçütleri (ilk haftanın sonunda ölçülür, öncesi ve sonrası yan yana)

1. Mert döndüğünde okuduğu yer: yalnız `DURUM.md` ve soru turu. Açık oturum: 1.
2. Kaybolan rapor ya da mesaj: 0. Her ajanın son mesajı `docs/plan/gunluk/`'te.
3. 30 dakikadan uzun tutulan kilit: 0.
4. CI süresi: günde ≤ 2 saat. Yerelde tam kapı koşusu: 0.
5. "Hazır" → "main'de" süresi: medyan ≤ 60 dk. Bugün ölçülmüyor; ilk gün taban ölçülür.
6. Hakemin verdiği kararlardan Mert'in ters çevirdiği: ≤ %15. Önerilen seçeneğin kabulü (`decision-log stats`) ≥ %85.
7. `/oto` başladıktan sonra Mert'e dokunmadan geçen en uzun süre: ≥ 6 saat (soru beklemesi işi durdurur ama hattı durdurmaz).

## 3. İletişim sözleşmesi (Mert ↔ koordinatör)

Mert'in kullanım konforu için. Her biri yeni `CLAUDE.md`'de aynen yer alır. Kaynak: eski `CLAUDE.md` §3 ve §4.3.1, Mert'in 2026-10-08 notları.

1. **Türkçe, sade.** Kısa cümle, geliştirici dili yok. İç numara tek başına yazılmaz; yanında ne olduğu söylenir. Kod, commit ve ekran metni İngilizce.
2. **Dinle, sözünü kesme.** Mert anlatırken koordinatör işe girişmez. Önce dinler, gerekirse sorar, sonra önerir.
3. **Sorgula.** İstek Mert'ten geldi diye doğru kabul edilmez. Yanlış, gereksiz ya da zaman kaybı görülen istek açıkça söylenir. İtiraz bir kez, gerekçesiyle yapılır; Mert karar verince ona uyulur ve karar deftere yazılır. Güvenlik açığı ya da geri alınamaz kayıpta bir kez daha uyarılır.
4. **Daha iyi yolu göster.** Daha ucuz, daha kaliteli ya da projeye daha uygun bir yol varsa Mert ona yönlendirilir. Maliyet dolarla yazılır.
5. **Önce öneri, sonra iş.** Mert bir şey söyleyince koda ya da işe başlamadan önce: ne anladım · artı/eksi ve çakışan kural · önerim ya da itirazım.
6. **İsteği daralt.** Mert bir istek ya da prompt verince koordinatör kapsamı daraltır, hedefi ve başarı ölçütünü yazar, Mert onaylar, iş ondan sonra başlar. Küçük işte bu tek satır ve tek tıktır. Okuma ve ölçme onay beklemez.
7. **Yolda çıkan backlog'a.** İş sırasında bulunan başka şey plana katılmaz; `BACKLOG.md`'ye yazılır. İstisna: işin önündeyse (onsuz iş bitmez), işle ilgili bir güvenlik açığıysa ya da ürünün çıktısını bozuyorsa o işte düzeltilir ve nedeni günlüğe yazılır.
8. **Soru biçimi.** Tek tıkla cevaplanır, seçenekler adlıdır. Önerilen seçenek ilk sıradadır, `(Önerilen)` etiketini taşır, açıklamasının son satırı `Dayanak: …`. Kuruluş: bugün ne oluyor → isimli örnek → her seçeneğin sonucu. İşi durduran soru hemen sorulur; durdurmayanlar birikir, `/durum`'da ya da üçü geçince tek turda sorulur.
9. **Hata saklanmaz.** Claude'dan kaynaklanan hata için "benim hatam" denir.
10. **Komut Run düğmesiyle.** Mert'e verilen komut Terminal panelinde ▶ ile çalışır: tek satır, `bash` etiketli blok, PowerShell 7'de geçerli. Claude'un kendisinin çalıştırabileceği komut Mert'e verilmez.
11. **Öğreterek.** Mert tek başına geliştirici ve bu dünyayı öğreniyor (2026-10-08). Koordinatör önemli bir kararın nedenini tek cümleyle söyler; Mert'in bilmediği bir kavram geçerse yanında bir satırla ne olduğunu yazar. Amaç en verimli yoldan en kaliteli ürün.

## 4. Roller

| Kim | Ne yapar | Ne yapmaz |
|---|---|---|
| **Mert** | Yön verir, planı ve görsel tasarımı onaylar, defterin kapsamadığı soruları cevaplar, geri alınamaz işlere "evet" der | Oturum yönetmez, mesaj taşımaz |
| **Koordinatör** (tek oturum) | Dinler, daraltır, planı işlere böler, ajanlara verir, sonucu doğrular, treni koşar, `DURUM.md`'yi ve günlüğü yazar, karar defterini günceller, geri alınamaz işi Mert'in kendi penceresindeki "evet"inden sonra kendisi yapar | Kod yazmaz |
| **`nf-isci`** (yeni alt ajan) | Bir işi kendi worktree'sinde ve dalında uçtan uca yapar (veritabanından ekrana), hızlı kontrolleri koşar, dalı push eder, sözleşmeli son mesajı bırakır | Mert'le konuşmaz, kayıt dosyası yazmaz, main'e gönderim yapmaz, tam kapı koşmaz |
| **`nf-guvenlik`** (var) | İncelemeli işte bağımsız güvenlik ve kod incelemesi; `ONAY @<sha>` ya da bulgular | Dosya yazmaz |
| **`nf-okur`** (var) | Salt okur keşif, backlog maddesinin tazeliği, CI kırmızısını ayırma (altyapı mı, kod mu; hangi dal) | Dosya yazmaz |
| **`nf-hakem`** (yeni) | Gelen soruyu defterle karşılaştırır: `KARAR` (dayanaklı) ya da `SOR` (Mert'e, §3.8 biçiminde) | Dayanak uydurmaz; "benzer" madde yetmez |

- Model: hepsi Opus 5.5 (Mert, 2026-10-07). Effort: işçi medium, incelemeli işte high; hakem ve güvenlik high; okur medium.
- Paralellik: **işçi sınırı (varsayılan 1, Mert komutla artırır)**; `DURUM.md` "Sağlık"ta `işçi sınırı <n>` (D2). Neden: tek bilgisayar ve tek CI makinesi var; fazla paralel iş hızlandırmaz, sırada bekletir (2026-10-08'de 11 hat açıktı, 5'i saatlerce bekliyordu). Yarım iş biriktirmek yerine işi bitirmek önce gelir. Sınır 1'den büyükse yalnız dosyaları çakışmayan işler aynı anda koşar; görev metninde "dokunulacak" ve "dokunulmayacak" dosya listesi yazılır. Sınırı yalnız Mert'in komutu değiştirir.
- Değişen ilke: P17 ("tek hat; ikinci işi Mert açar") yerine: **paralel iş yalnız Mert'in onayladığı planın içinden ve dosyaları çakışmıyorsa.**

## 5. Bir işin yolu

1. **Sıra.** `DURUM.md` "Sırada" listesi. Kaynağı Mert'in onayladığı plan (`EKRAN-PLANI.md`) ve `BACKLOG.md`. Backlog'dan gelen iş önce `nf-okur` ile tazelik kontrolünden geçer (geçerli / değişmiş / bayat).
2. **Görev.** Koordinatör işçiyi başlatır: `Agent(subagent_type: nf-isci, isolation: worktree, run_in_background: true)`. Görev metni şablonu:
   ```
   İŞ: <ID> — <tek cümle hedef>
   Bitti ölçütü: <ölçülebilir maddeler>
   Dokun: <dosya/klasör> · Dokunma: <dosya/klasör>
   Sınıf: normal | incelemeli · Port: <web>/<api>
   İlgili kararlar: <KARARLAR madde kimlikleri>
   Önerilen skill'ler: <…>
   ```
3. **İşçinin adımları.** `node scripts/wt-hazirla.mjs <ID>`: `origin/main`'den `task/<ID>` dalı, `pnpm install`, shared ve ui build'i, yerel `.env*` kopyası. Sonra TDD, küçük commit'ler, hızlı kontroller (§7.1), `git push origin task/<ID>` (CI başlatmaz).
4. **Son mesaj sözleşmesi.** İlk satır makinece okunur, gövde en çok 15 satır:
   ```
   İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<ID>@<sha>
   Ne yapıldı (etkisi) · Kanıt (komut + sonuç, dosya:satır, ekran görüntüsü yolu) · Açık kalan · Ders (varsa, tek satır) · Backlog adayı (varsa)
   SORU ise: soru §3.8 biçiminde, seçenekler, önerilen ve dayanağı
   ```
5. **Kayıt.** `SubagentStop` kancası her ajanın son mesajını (`last_assistant_message`) `docs/plan/gunluk/<tarih>/<saat>-<İŞ>-<ajan>.md`'ye yazar. Koordinatör bildirimi kaçırsa ya da bağlamı sıkıştırılsa bile rapor diskte kalır.
6. **Koordinatörün işlemesi.**
   - `HAZIR` + normal sınıf → tren sırasına.
   - `HAZIR` + incelemeli sınıf → `nf-guvenlik`; `ONAY` gelince tren sırasına. Bulgu gelirse aynı işçiye geri (`SendMessage` ile bağlamıyla devam).
   - Canlı veritabanı değişikliği → `ONAY` + koordinatörün "gönder"i (§9) → işçi devam eder: yedek, `apply_migration`, md5/sürüm doğrulaması, `get_advisors`, dosya adı = canlı ledger sürümü → `HAZIR`.
   - `SORU` → hakem (§6.3). `KARAR` ise işçiye cevap gider, iş sürer. `SOR` ise soru `SORULAR.md`'ye, iş "Mert bekliyor" olur, işçi boşa çıkar.
   - `TAKILDI` → `nf-okur` ile neden; ya yön verilir ya iş bölünür.
7. **Kapanış.** İş main'de ve trenin CI'ı yeşil → `DURUM.md` "Bugün biten" satırı, backlog maddesi kapanır, dal ve worktree silinir (birleşmesi `git cherry` ile doğrulandıktan sonra).

**İş sınıfı** (bugünkü R0–R3 yerine iki sınıf):
- **Normal:** tek ekran ya da tek alan; paylaşılan sözleşmeye ve yetkiye dokunmuyor. Ayrı inceleme yok; kapı trenin CI'ı.
- **İncelemeli:** paylaşılan parça (shared tip, API cevap şekli, birden çok ekran), yetki, RLS, grant, `*_service`, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL. `nf-guvenlik` ONAY zorunlu; ekran değiştiyse masaüstü (1440) ve telefon (390) görüntüsü; koordinatör diff'in riskli kısmını okur.

**Ekran işi.** Mert'in onayladığı `ekranlar/<no>-<ekran>/EKRAN.md` kalır (kapsamın kendisi). Görsel karar gerekiyorsa işçi 2–3 gerçek varyant hazırlar; seçim `SORULAR.md`'ye görsel soru olarak gider.

## 6. Hafıza ve karar

### 6.1 Dosyalar (son hâl)

| Dosya | Ne | Kim yazar | Kim okur |
|---|---|---|---|
| `CLAUDE.md` (~100 satır) | Vizyon, iletişim sözleşmesi, kesin kurallar, karar yöntemi, iş akışı, kısa teknik harita | Mert onayıyla koordinatör | Her oturum ve ajan, kendiliğinden |
| `docs/plan/KARARLAR.md` | **Tek karar defteri:** vizyon ve ilkeler (P-xx), ürün ve ekran kuralları, yetki ve veri, teknik, süreç | Koordinatör | Hakem, işçi (ilgili bölüm), koordinatör |
| `DURUM.md` (koordinatör worktree'sinin kökü) | Canlı pano (§8) | Koordinatör, her turda üzerine yazar | **Mert** |
| `docs/plan/SORULAR.md` | Mert'e açık sorular | Koordinatör | Koordinatör, `/durum`'da |
| `docs/plan/gunluk/<tarih>.md` + `<tarih>/` | Gün günlüğü (koordinatörün satırları) ve ajanların ham raporları (kanca) | Koordinatör, kanca | Gerekirse herkes |
| `docs/plan/BACKLOG.md` | Yapılabilecek işler, `leave` / `do` işaretiyle | Koordinatör | Koordinatör, `nf-okur` |
| `docs/plan/EKRAN-PLANI.md`, `ekranlar/` | Yol haritası ve onaylı ekran kapsamları | Koordinatör | Koordinatör, işçi |
| Klasör `CLAUDE.md`'leri | O klasörün teknik tuzakları | Koordinatör (işçinin "Ders" satırından) | O klasöre dokunan |
| Claude hafızası | Yalnız Mert ve ortam bilgisi | — | Koordinatör |

Arşive giden: `ILKELER.md`, `KOORDINATOR-KARARLARI.md`, `DERSLER.md`, `HANDOFF.md`, `SABAH-SORULAR.md`, `handoffs/`, `tasks/` (açık görevler hariç) → `docs/archive/2026-10-08-v1/`. Arşiv kural değildir, okunmaz.

### 6.2 Karar defteri (`KARARLAR.md`)

- Bölümler: **0. Vizyon ve ilkeler** · **1. Ürün ve ekranlar** · **2. Yetki ve veri** · **3. Teknik** · **4. Süreç**.
- Madde biçimi (tek madde ≤ 3 satır): `**<ID>** <kural, tek cümle>. Neden: <…>. (<tarih>, <Mert | koordinatör>)`. Var olan kimlikler (OPS-05, P11 …) korunur, bağlantılar kırılmaz.
- Birleştirme: ILKELER (372) + KARARLAR (610) + KOORDINATOR-KARARLARI'nın **kural niteliğindeki** maddeleri + DERSLER'in **alışkanlığa dönüşmüş** dersleri. Tek seferlik operasyon kayıtları (şu dal gitti, şu oturum devredildi) taşınmaz.
- Hiçbir karar sessizce düşmez. Taşınmayan her kural niteliğindeki madde defterin sonundaki "Bırakılanlar" ekinde tek satırla durur (kimlik + neden: eskidi / başka maddeyle birleşti / yeni akışta anlamı kalmadı). Mert bu eki bir kez okur.
- Hedef boy ≤ 700 satır.

### 6.3 Hakem (`nf-hakem`)

- **Girdi:** soru, seçenekler, işin bağlamı (3–5 satır).
- **Yöntem:** `CLAUDE.md` vizyonu → `KARARLAR.md` ilgili bölüm → aynı konuda Mert'in son cevapları (`.newfork-inbox/decisions.jsonl`) → hüküm.
- **Çıktı:** `HÜKÜM: KARAR <seçenek> — Dayanak: <madde kimliği>` ya da `HÜKÜM: SOR — <soru, §3.8 biçiminde>`.
- **Kurallar:** dayanak durumu birebir kapsamalı; kapsamıyorsa `SOR`. Şunlar her zaman `SOR`: yeni görsel tasarım, temel model (yetki kapsamı, saat dilimi, izin iptali gibi), kayıtların kapsamadığı ürün kuralı, para, gizli anahtar, yeni bağımlılık, geri alınamaz silme, canlıda gerçek veri silme, kural değişikliği.
- **Kalibrasyon:** koordinatör her `KARAR`'ı günlüğe ve `DURUM.md` "Senin yerine verdiğim kararlar"a yazar. Mert ters çevirirse madde defterde düzeltilir. Bir bölümde ters çevirme %15'i geçerse o bölüm "her zaman sor" listesine girer (Mert'e sorulur).

## 7. Test, CI ve tren

### 7.1 İşçinin hızlı kontrolleri (CI yok)
- Dokunduğu paket: `pnpm.cmd --filter <paket> lint`, `typecheck`, ilgili vitest dosyaları.
- Veritabanı işi: ilgili pgTAP dosyaları ve migration denemesi, geri alınan tek işlemde: `node scripts/lock.mjs run db -- <komut>`.
- Kullanıcı akışı değiştiyse: etkilenen e2e dosyası, `node scripts/lock.mjs run db --e2e -- <komut>` (CI'da e2e koşarken bekler; aynı bilgisayarda iki e2e testleri yük altında düşürüyordu, DERSLER).
- Ekran değiştiyse ekran görüntüsü: `artifacts/<İŞ>/`, masaüstü 1440, telefon 390.

### 7.2 CI
- Tetik: `push` yalnız `train/**`; ayrıca `pull_request` (Mert'in PR'ları) ve `workflow_dispatch` (elle yeniden koşu). `main` ve `task/**` push'u CI başlatmaz.
- İşler aynı: check, db, e2e, db-budget. Runner aynı (Mert'in bilgisayarı).
- Main'in güvencesi: main'e yalnız `train.mjs` gider ve yalnız CI'ı o commit için yeşil olan treni fast-forward ile gönderir. GitHub'da commit'in yeşil işareti aynı sha olduğu için main'de de görünür.

### 7.3 Tren (`scripts/train.mjs`; `task/tren-araci-2`'deki onaylı aracın üstüne)
- `plan` ve `build` aynen kalır. Koordinatörün kayıt dalı `coord/kayit` her trene kendiliğinden eklenir.
- `gate` (yerel tam kapı) **kalkar**, yerine `ci`: `train/<zaman>`'ı push eder, CI'ı bekler (`gh run watch`), yeşilse 0, kırmızıysa 1 ve düşen işlerin özeti.
- `push`: yalnız `ci` yeşilse ve `origin/main` trenin atasıysa, fast-forward. `main.lock` yok.
- `apply-local`: push'tan sonra trenin yeni migration'larını ortak yerel veritabanına uygular (`lock run db`).
- `run <dal…>`: plan → build → ci → push → apply-local, tek komut. Koordinatör bunu arka planda başlatır; bittiğinde koordinatör uyanır.
- Yalnız belge değişen tren CI beklemeden gönderilir (CI zaten belgeyi koşmaz).
- **Ne zaman:** hazır dal var ve tren koşmuyorsa. Koşan tren varken hazır olanlar bir sonrakine birikir (doğal paketleme).
- **Kırmızıda:** `nf-okur` ayırır. Altyapıysa (yük, port, Docker) yalnız düşen iş yeniden koşar. Koddaysa bozan dal trenden çıkar, işçisine döner, tren onsuz yeniden kurulur. Main kırmızıysa ilk tren yalnız düzelteni taşır.

### 7.4 Kilit
- Tek kilit `db`, yalnız komut sarmalayıcısıyla: `node scripts/lock.mjs run db [--e2e] -- <komut>`.
- Sıra geliş sırasıyla (bilet dosyası). Komut bitince, başarılı ya da başarısız, kilit açılır. Sahibi süreç öldüyse (PID + başlangıç zamanı) bir sonraki bekleyen kilidi temizler ve alır.
- `take` / `release`, `main.lock` ve `heavy.lock` kalkar. Tek ağır koşu artık CI'dır, onu da GitHub sıraya koyar.

## 8. Otomasyon döngüsü

### 8.1 `/oto <hedef>` (gece-modu skill'inin yerine; gece ve gündüz aynı)
- **Başlarken:** Mert'in onayladığı plan `DURUM.md` "Plan" ve "Sırada"ya yazılır. `request_keep_awake`. Yedek saat: `CronCreate` her 20 dakikada (oturum boştayken çalışır).
- **Uyanma kaynakları:** ajan bitti bildirimi · tren komutu bitti · yedek saat · Mert'in mesajı.
- **Her tur:** gelen sonuçları işle (§5.6) → soruları hakeme → hazırları trene → boş yer varsa yeni işçi → `DURUM.md`'yi yaz → uyanık tutmayı yenile. Değişiklik yoksa tur tek satırla biter.
- **Kullanım:** `get_usage` ile ölçülür. Azalınca pahalı işler (uzun, incelemeli) sona alınır, ucuz işler sürer.
- **Durma:** sıra boş, tren yok, ajan yok → `DURUM.md` "Bitti", yedek saat silinir.

### 8.2 Kesintiye dayanıklılık
- **Bağlam sıkıştırma:** `SessionStart` kancası (`compact`, `resume`, `startup`) `DURUM.md`'nin üst kısmını bağlama koyar. `HANDOFF.md` gerekmez.
- **Uygulama ya da bilgisayar yeniden başlarsa:** arka plan ajanları durur. Dalları ve commit'leri kalır. `DURUM.md` "Koşuyor" satırındaki her iş için koordinatör dalın son commit'inden yeni işçi başlatır ("devam: task/<ID>@<sha>"). İşçi küçük commit attığı için kayıp, son commit'ten sonrasıyla sınırlıdır.
- **Koordinatör takılırsa:** yedek saat bir sonraki turu yine tetikler.

### 8.3 `/durum` (Mert döndüğünde)
1. `DURUM.md` dosya olarak Mert'e gönderilir; yanında en çok 6 satırlık özet.
2. "Senin yerine verdiğim kararlar" listesi (karar · dayanak).
3. Soru turu: `SORULAR.md`, dörder dörder. Cevaplar `KARARLAR.md`'ye, bekleyen işler sıraya döner.

### 8.4 `DURUM.md` şablonu
```
# Durum — <tarih saat>
🟢/🟠/🔴 <tek cümle>
## Seni bekleyen (<n>)   sorular · görsel seçimler · "evet" gereken işler
## Bugün biten           iş · ekranda ne değişti (ekran adıyla) · sha
## Koşuyor               iş · ajan · başladı · son haber
## Sırada                iş · neden önce
## Tren                  son tren: dallar · CI sonucu · süre
## Senin yerine verdiğim kararlar   karar · dayanak
## Sağlık                CI dk/gün · hazır→main medyan · kullanım %
```

## 9. Yetki ve onay

- **Koordinatör sormadan:** iş sırası, ajan sayısı, model ve effort, test ve dal kararları, şemanın iç ayrıntısı, defterde dayanağı olan ürün kararı (hakem), birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek, canlı migration için "gönder" (koşullar: inceleme ONAY, önce yedek, sonra md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT; silen migration trenin CI'ı yeşil olunca).
- **Her zaman Mert'e:** §6.3'teki "her zaman SOR" listesi ve `.claude/settings.json` yasak listesini gevşetmek.
- **Geri alınamaz işler** (canlıda gerçek veri silme, `supabase db reset`, force push, ücretli işlem, dosya indirme, kalıcı kurulum): Mert'in "evet"i koordinatörün penceresine yazılır ve işi koordinatör kendisi yapar. Ajana aktarılmaz.

## 10. Kaldırılanlar ve yerlerine gelenler

| Kaldırılan | Yerine |
|---|---|
| Ayrı çalışan oturumlar, `send_message` | Koordinatörün içinde alt ajanlar |
| `scripts/inbox.mjs` (posta kutusu, nabız, pano, `claim`) | Ajan bildirimi + `SubagentStop` kancası + `DURUM.md`. `.newfork-inbox/` içinde yalnız `decisions.jsonl` ve `audit.log` kullanılmaya devam eder; `new/`, `done/`, `status/`, `label/` arşive |
| `main.lock`, `heavy.lock`, `take` / `release` | `lock.mjs run db` |
| `guard.mjs`: ağır koşu, kayıt koruma, e2e damgası, `main.lock` | Kalan: Bash'ten main'e push reddi (yalnız `train.mjs`), dal ya da worktree silmeden önce yedek ref, işçi worktree'sinden kayıt dosyasına yazma reddi, yasak denemelerinin logu |
| R0–R3 | Normal / İncelemeli |
| `tasks/<ID>.md` görev dosyası | Görev metni ajan çağrısında ve günlükte; ekran işinde `EKRAN.md` |
| `HANDOFF.md` | `DURUM.md` + `SessionStart` kancası |
| `SABAH-SORULAR.md` | `SORULAR.md` |
| `/gece-modu` | `/oto` |
| `ILKELER`, `KOORDINATOR-KARARLARI`, `DERSLER` | `KARARLAR.md` |
| CI'ın `main` ve `task/**` tetikleri | `train/**` |
| "Aktarılan onay geçmez" (§5.3) | Tek pencere: geri alınamaz işi koordinatör, Mert'in kendi penceresindeki "evet"iyle yapar |

Kalanlar: `decision-log.mjs` (soru biçimi kontrolü ve kabul oranı, hakemin kalibrasyonu), `schema-snapshot.mjs`, `test-db.mjs`, `export-local-fixture.mjs`, `.claude/settings.json` yasak listesi, `nf-guvenlik` hafızası.

## 11. Geçiş (ayrıntı uygulama planında)

0. **Dondur:** mevcut koordinatöre ve açık oturumlara son kez "yeni iş alma, durumunu yaz". Açık işlerin dökümü (dal, sha, ne kaldı) `DURUM.md` "Sırada"ya. Kimsenin işi silinmez.
1. **Araçlar** (tek dal, tek tren): `lock.mjs run`; `train.mjs` `ci` + `run` (`task/tren-araci-2` üstüne); `ci.yml` tetikleri; `guard.mjs` sadeleşmesi; `SubagentStop` ve `SessionStart` kancaları; `nf-isci` ve `nf-hakem`; `/oto` ve `/durum`; `wt-hazirla.mjs`. Her parça testle.
2. **Kayıtlar:** `KARARLAR.md` birleştirmesi ve "Bırakılanlar" eki; yeni `CLAUDE.md`; klasör `CLAUDE.md`'lerinin yeni akışa uyarlanması; arşiv.
3. **Deneme** (DERSLER 13'ün alışkanlığı: yeni orkestrasyon önce küçük, uçtan uca): gerçek, küçük, normal sınıf bir iş; işçi → hazır → tren → main. Süreler ölçülür.
4. **Geçiş:** yeni koordinatör `coord` worktree'sinde açılır, `/oto` ile başlar. Eski oturumlar arşivlenir. Mert ana klasörde `git pull` öncesi sildiği dosyaları geri alır (yeni sürümleri trenle gelir).
5. **Bir hafta sonra:** §2'deki ölçütler, önce/sonra.

## 12. Riskler ve karşılıkları

| Risk | Karşılık |
|---|---|
| Dalda tam kapı olmadığı için tren daha sık kırmızı döner | İlk hafta ölçülür. Kırmızı oranı %30'u geçerse incelemeli işler dalda kendi pgTAP dosyalarının tamamını ve etkilenen e2e'yi koşar |
| Yeniden başlatmada yarım ajanlar durur | Küçük commit + `DURUM.md` "Koşuyor" + yeniden başlatma adımı (§8.2) |
| Koordinatör tek nokta | Yedek saat; `SessionStart` kancası; durum diskte |
| Koordinatörün bağlamı uzun koşuda dolar | Ajan dönüşü ≤ 15 satır, gerisi dosyada; sıkıştırmadan sonra `DURUM.md` yeniden yüklenir |
| CI ile yerel test aynı bilgisayarda çakışır | `lock run db --e2e` CI'da e2e koşarken bekler; işçi sınırı (varsayılan 1, Mert komutla artırır) |
| Hakem yanlış karar verir | Dayanak birebir olmalı; "her zaman sor" listesi; her karar `DURUM.md`'de görünür ve ters çevrilebilir; kalibrasyon §6.3 |
| Arka plan ajanının uzun işte bağlamı dolar | İş ≤ ~2 saatlik dilimlere bölünür; işçi `BÖLÜNDÜ` ile kalanını yazar |

## 13. Kapsam dışı

- GitHub'ın makinelerine CI taşımak (Actions bütçesi $0, Mert kararı).
- Agent Teams (2026-09-25 denemesi bilgisayarı dondurdu, DERSLER 13; deneysel, ajanlara ayrı worktree vermiyor).
- `BACKLOG.md`'nin içeriğini yeniden yazmak (yalnız yeri ve kullanım biçimi değişir; ayrı iş).
- Uygulama kodunda değişiklik.
