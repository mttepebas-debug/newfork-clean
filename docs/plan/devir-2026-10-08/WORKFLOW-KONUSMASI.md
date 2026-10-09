# Workflow konuşması — Mert ve koordinatör, 2026-10-08 (~17:00–22:30Z)

Kaynak: koordinatör oturumu (`f2f4ad49-6b1b-4db6-a445-4198729b2a0f`), Mert'in penceresinde; koordinatör salt okurdu, hiçbir kural dosyası değişmedi. Bu belge konuşmanın tek kaydıdır; kararların hiçbiri henüz `CLAUDE.md`, `KARARLAR.md` ya da `ILKELER.md`'ye yazılmadı. Karar kaydı kancası her soruyu ve cevabı `C:\Users\TheWe\Documents\Codex\.newfork-inbox\decisions.jsonl`'e yazdı (ham kanıt orada).

## 1. Mert'in şikâyeti (kendi sözleriyle, özet)
- "Claude md'ye yazdığım kuralları bile atlayabiliyorsun": kritik et, fayda/zarar sorgula, daha iyi yöntem öner, "istediğim şey eksik ya da yanlış olabilir" — uygulanmıyor.
- "Referans gösterirken baştan sona kısaltmasız dizin ver, kopyala/yapıştıra ve tıklayıp açmaya hazır" — uygulanmıyor.
- "Beni anlayana kadar soru sor, kapsamı daralt, tahmine boşluk bırakma" — soru sorulmuyor.
- "Testler çok uzun sürüyor, sessionlar çok uzun süre sıra ve izin bekliyor; daha hızlı, daha verimli bir yöntem istiyorum."

Koordinatörün kabul ettiği somut ihlaller (o gün): hatırlatma dosyasının yerini sormadan seçti; Schedule süzgecinde çok işli çalışan sorusunu sormadan karar verdi (KK-233); vmmem'i "Codex'in" diye tahmin etti; `.codex` boyutunu ölçmeden 38 GB dedi (gerçek 14 GB); REMOTE-CI araştırmasındaki "public repo" seçeneğini Mert'e sormadan eledi; kısaltılmış yollar yazdı. Ayrıca koordinatör kayıtları `C:\Users\TheWe\Documents\Codex\newfork-wt\coord` içinde ve uygulama o klasörü açamıyordu (konuşmada `C:\Users\TheWe\Documents\Codex\newfork-wt` oturuma eklendi).

## 2. Mert'in verdiği kararlar (tek tıklık sorularla; hepsi henüz kayda geçmedi)
| # | Konu | Karar | Not |
|---|---|---|---|
| 1 | Main'e gönderim | **Oturum kendisi gönderir, koordinatöre haber verir, izin beklemez** (Mert: "Sana haber verir ama senden izin beklemez") | Tren (KARARLAR OPS-08, aynı sabah kurulmuştu) ters çevrilir |
| 2 | Kırmızı main | **Önce geri al** (revert); canlı veritabanına dokunan değişiklikte "önce düzelt" | |
| 3 | Yerel test | **Yalnız etkilenenler**; tam takım dal CI'ında bir kez | |
| 4 | Canlı veritabanı | **Ekleyen adımlar oturumda (kontrol listesiyle), riskliler koordinatörde** (R3 canlı DDL, silen migration); geri dönüşsüz silme Mert'in "evet"iyle | |
| 5 | Anlama adımı | **Var**: iş başlatan isteklerde, **koordinatör ve oturumlar** (oturum, koordinatörden aldığı görevde) — dört başlık: Anladığım · Eksik ya da yanlış olabilecek · Sorularım · Bence | |
| 6 | Diğer konuşma önlemleri | **Elenen seçenekler görünür**, **"Bence" satırı** her isteğe | Mesaj denetim kancası seçilmedi |
| 7 | Yol biçimi | **Tam Windows yolu + tıklanır bağlantı** `[C:\…\dosya.md](göreli/yol)` | |
| 8 | Koordinatör kayıt klasörü | `C:\Users\TheWe\Documents\Codex\newfork-wt` oturuma eklendi (yapıldı) | |
| 9 | R3 kod | **Oturum kendisi gönderir, `nf-guvenlik` ONAY'ıyla** | |
| 10 | Geri alma | **Sahibi; 15 dk'da yapmazsa koordinatör** | Sürenin "ayrımdan sonra" başlaması önerildi, cevap yok (açık) |
| 11 | Yetkili rebase | **Çatışma yoksa CI yeniden beklenmez — ama oturum her önemli adımda koordinatöre mutlaka haber verir** ("Sen koordinatörlüğe devam ediyorsun… dur/devam diyebil ya da akıl verebil") | |
| 12 | Kırmızı main'de istisna | **Dal CI'ındaki tek kırmızısı main'deki aynı bilinen test olan dal main'e gidebilir** | Test düzeyinde ölçülmeli (PARALEL-1'in notu) |
| 13 | Denetim | **A: R3 ve canlı adımların hepsi, gerisinden günde 2–3 örnek; main CI hep izlenir** (maliyet/süre tablosu gösterildikten sonra) | |
| 14 | Kayıt yükü | **İşe yarayan kalır, gerisi günlük**: ayrı KK yalnız Mert'in yerine verilen ürün/ekran kararı, para ve canlı; oturumların izleyeceği yöntem kural dosyasına; gündelik kararlar HANDOFF'ta günlük tek satır | Ölçüm: 230 KK, 1.927 satır; bu gecenin 6 KK'sından 1'i sonradan okundu |
| 15 | Oturum sayısı | **5 sürsün; bu işler bitince 3'e düşmeyi yeniden düşünelim** | Tarih/tetik konmadı (açık) |
| 16 | Para / CI yeri | **$0 kalsın**; "önce süreç düzelsin, sonra GitHub'ın ücretsiz 2.000 dakikası, bitince dakika başı öde" (Mert'in kendi önerisi); tavan "önce süreç, tavan sonra" | Public repo: "kod güvenliğini sağlayabilecek bir yöntem geliştirebilirsek düşünebilirim" — şimdilik yok |
| 17 | Hostinger | Mert'in hesabı yok, fikir olarak sordu | Kapanmadı, para kararıyla birlikte |

Mert'in sorduğu ve cevabı verilen fikirler (karar değil): repoyu geçici public yapıp test koşmak (önerilmedi: ilk açılış kalıcı public demek + hesap riski); "test edilenleri public repoya koyup CI orada" (önerilmedi: testler neredeyse her şeye dokunuyor; GitHub şartları, başka repoyu test etmeyi yasaklıyor); kodun "olmazsa olmaz" parçalarını public'e koymamak (mümkün ama karmaşıklık + günlükler açık).

## 3. Açık kalan (Mert'in kapattığı ya da cevaplamadığı sorular)
1. Yeni düzene geçiş: önce 1–2 oturumla deneme mi, hepsi birden mi (öneri: deneme; DERSLER #13).
2. Konuşma kuralları için yalnız uyaran hatırlatma kancası (öneri: evet; "hatırlamaya güvenmek üç kez tutmadı").
3. Geri alma süresi ne zaman başlar (öneri: kırmızının yük mü kod mu olduğu ayrıldıktan sonra).
4. Kararlara ne zaman yeniden bakılır (öneri: 2026-10-15'te ölçümle).
5. Kural dosyası yapısı: Mert kendi sadeleştirme taslağını yazdı ve ana klasörde 14 dosyayı sildi (aşağı bakın); koordinatörün önerisi "silme yerine taşı / üç katman". Mert: "sana bir skill açacam onunla koordine et" → `claude-code-setup:claude-automation-recommender` çalıştı; öneri raporu `ONERI-OTOMASYON.md`'de. Mert "rapora uygun baştan sona ilerlemeyi yap" dedi, sonra "1 saniye pause al" dedi; iş başlamadan durdu (OTOMASYON-5 beklemede).
6. `main.lock` kalsın mı (taslakta kaldı), guard'ın CI denetimi (patch-id), e2e damgasının kalkması — koordinatörün türetmeleri, Mert'in açık kararı değil.

## 4. Ana klasörde Mert'in silmesi (önemli)
- 2026-10-08 13:23–14:01 PDT, ana klasörde (`C:\Users\TheWe\Documents\Codex\newfork-clean`) commit'lenmemiş silmeler: `CLAUDE.md`, `apps\api\CLAUDE.md`, `apps\web\CLAUDE.md`, `e2e\CLAUDE.md`, `docs\plan\ILKELER.md`, `docs\plan\KARARLAR.md`, `docs\plan\handoffs\` altında 8 devir dosyası.
- Mert: "evet ben sildim, ama kararımdan emin değilim". Hepsi git'te duruyor (`git restore <dosya>` ile geri gelir). Koordinatörün itirazı: ana klasörde yeni açılan oturumlar kural dosyasız başlıyor; yeniden yapılandırma ayrı worktree'de yapılmalı. Karar Mert'te; dokunulmadı.
- Mert ayrıca sohbette sadeleştirilmiş bir kök `CLAUDE.md` taslağı yapıştırdı (Vizyon, §2.A.1/2/7/8/9, ilke tablosu, §4.2 gönderim/ağır koşu çıkarılmış; test kuralı netleştirilmiş). Koordinatörün eleştirisi: güvenlik ve arayüz kuralları başka bir dosyada yaşamıyor; birkaç iç atıf kırık.

## 5. DERSLER'e göre eleştiri (koordinatör, aynı gün)
Kalıcı dersler ve bu kararlara etkisi:
- "Hatırlamaya güvenmek üç kez tutmadı" (e2e) ve "sorgula" kuralı dört kez çiğnendi → metin kuralı yetmez, mekanik yardım gerekir (karar 6'nın zayıf yanı).
- DERSLER #13 (yeni düzen tam boy kuruldu, aynı gece bırakıldı): tren sabah kuruldu, öğleden sonra kaldırılıyor; TREN-ARACI yazılıp rafa kalkıyor → yeni düzen önce küçük denenmeli.
- DERSLER #8 (yük kırmızısı 5 kez kod kusuru sanıldı) → 15 dk geri alma süresi ayrımdan sonra başlamalı.
- "Seçenek ayrıntısı karar diye kayda geçti": `main.lock` kaldırma, "bir hafta uyarı", e2e damgası, "15 dk" koordinatörün çıkarımlarıydı; karar gibi yazılmamalı.
- "Kurala değer ölçmeden sabitlendi": 15 dk ölçülmedi (CI koşusu 10–17 dk + sıra).
- "Bir kural dosyası okunurken öbürü okunmadı": tren/`main.lock` en az 8 dosyada geçiyor (CLAUDE.md 7 yer, KARARLAR 3, ILKELER 2, scripts/guard.mjs, lock.mjs, test-db.mjs, testler, supabase/CLAUDE.md, hafıza notu `guard-checks-locks-before-command.md`).
- Taslakta çelişki: guard "o commit'in dal CI'ı yeşil" ararsa "çatışmasız rebase'de CI yeniden beklenmez" kuralı kilitlenir → patch-id eşdeğerliği gerekir.
- Tutanlar: kayıt yükünü azaltmak, denetim A, `main.lock` beklemesinin kalkması, "yalnız etkilenen testler" (tam takım dal CI'ında mekanik olarak zorlanırsa).

## 6. Ölçümler (2026-10-08)
- Kök `CLAUDE.md`: 245 satır, 4.678 kelime; ~%37'si yalnız koordinatörün işi (§4.2, §4.5–4.8, §5, ilke tablosu). Klasör dosyaları: supabase 713, apps/api 406, apps/web 575, e2e 475 kelime. Claude Code belgesi: dosya başına hedef 200 satırın altı; CLAUDE.md "bağlam"dır, zorlama için kanca gerekir.
- CI: 20 günde 400 koşu, ~3.350 dk duvar saati (2026-09-19→10-08); main CI günde 3–31 koşu. Bir CI koşusu ~10–17 dk (check 3–4, db 2,5–3,5, e2e 7–8 dk).
- Gönderim: tren-1 88 dk (~40'ı makine), tren-2 hazır→main 66 dk; BL-974 12:59Z'de hazırdı, main kırmızı yüzünden girmedi.
- KK kullanımı: 230 kayıt; 440 oturum raporunun 106'sı en az birine atıf yapıyor; en çok atıf KK-75 (16), KK-72 (14), KK-220 (13).
- GitHub (resmî belge, 2026-10-08): public repoda standart makineler ücretsiz ve sınırsız, 4 çekirdek/16 GB; private'ta 2.000 dk/ay, 2 çekirdek/8 GB; ücretsiz planda 20 eşzamanlı iş; public repoda kendi makinende runner önerilmez. Hetzner fiyatları 2026'da iki kez arttı (araştırma dosyasındaki ~$8–12 bayat olabilir). Blacksmith 3.000 ücretsiz dk/ay, Ubicloud $2/ay kredi (üçüncü taraf kaynaklar, doğrulanmalı).
