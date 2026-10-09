# Kök CLAUDE.md taslağı (koordinatör, 2026-10-08) — ONAYLANMADI, YAZILMADI

Bu, koordinatörün 2026-10-08 workflow konuşmasındaki kararları (bkz. `WORKFLOW-KONUSMASI.md` §2) bugünkü `CLAUDE.md`'ye işleyerek sohbette Mert'e gösterdiği tam metnin değişen bölümleridir. Mert'in sade taslağından iki değişiklik alındı (test kuralı, koordinatör tanımı); Mert'in silmeleri alınmadı. Mert ardından "bu overwhelming değil mi?" diye sordu; koordinatörün cevabı: evet, kurallara tam uyulamaz, ölçüm 245 satır / 4.678 kelime, ~%37'si yalnız koordinatörün işi → öneri "üç katman + araç" (`ONERI-OTOMASYON.md`). Yani bu taslak son hâl değil; yeni yapı (kök ~100–120 satır + `koordinator` skill + klasör dosyaları) bunun üstüne kurulacaktı.

Değişmeyen bölümler: §1 Vizyon, §2.A.1–2, §2.A.4–9, §2.B, §2.C (P15 satırı hariç), §3.1–2, §3.7–9, §4.3.2–6, §4.3.8–9, §4.4 (madde 2 hariç), §4.5, §4.6, §4.7, §5.2, §5.4–5, §6 yığın/istek yolu/portlar/tuzaklar.

## Değişen ya da eklenen metinler

**§2.A.3 Test (Mert'in sade taslağından):**
> **Test.** Hata için önce onu yakalayan kırmızı test, sonra düzeltme. Yeni ya da değişen bir akış için (yeni ekran adımı, yetki, para, veri kaybı) Playwright senaryosu yazılır. Görünüm, metin ve yerleşim değişikliğine birim testi yeter. Testi yeşile çevirmek için beklenti gevşetilmez. Yeni `*_service` yetki matrisinde ve katalogda sınıflanmadan girmez.

**§2.C P15 satırı:**
> | P15 | Kod ve git'te hızlı ve özerk; main'e işi yapan oturum kendisi gönderir (§4.2); yetkiye dokunan canlı DDL ve silen migration koordinatör izniyle. |

**§3.3 (yol biçimi):**
> 3. **5N1K.** Konu elverdiği kadar kim, ne, nerede, ne zaman, nasıl, neden. Nerede = uygulamadaki yer (ekran → menü → düğme) ya da tam Windows yolu, tıklanır bağlantıyla: `[C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\KARARLAR.md](docs/plan/KARARLAR.md)`; kısaltılmış ya da yalnız göreli yol yazılmaz (Mert, 2026-10-08). Ne zaman = tarih; bir sayı ne zaman ölçüldüyse. Gereken kadar, fazlası yazılmaz.

**§3.4 sonuna:**
> Uygulaması: Mert'in her isteğine bir **Bence** satırı yazılır: fayda ve zarar, varsa daha iyi yol; itiraz yoksa "itirazım yok, çünkü …" (Mert, 2026-10-08).

**§3.6'ya (ikinci cümleden sonra):**
> Elenen seçenekler de nedeniyle yazılır; hiçbir seçenek Mert'e söylenmeden elenmez (Mert, 2026-10-08).

**§4.1 Koordinatör (Mert'in sade taslağından):**
> **Koordinatör:** Mert'in tek muhatabıdır; kod yazmaz. Mert'le konuşurken §3'e uyar. Bir iş konuşulup planlanırken sorularla Mert'in isteğini tam anlamaya çalışır, kapsamı daraltır, hedefi ve bitti ölçütünü yazar; Mert onaylayınca işi bir oturuma ya da alt ajana verir (Mert, 2026-10-07). Büyük planı küçük işlere böler; gidişatı her zaman eleştirir ve doğrular. Okuma işini (keşif, tazelik, iddia doğrulama) `nf-okur`'a, dosya yazan işi oturuma verir. Güncel kimliği `docs/plan/HANDOFF.md`'nin başında.

**§4.1 Oturum:**
> **Oturum:** tek tiptir, sabit rolü yoktur. İşi uçtan uca yapar (veritabanından ekrana) ve main'e kendisi gönderir (§4.2); dokunduğu klasörün `CLAUDE.md`'si kendiliğinden yüklenir. Sorusunu ve kararını Mert'e değil koordinatöre götürür. Her önemli gönderim adımında koordinatöre tek satır haber verir (§6). İş bitince raporunu bırakır, posta kutusuna haber verir ve koordinatörden cevap gelene kadar boşta bekler.

**§4.2 Gözetim, Tek ağır koşu, Gönderim, Denetim:**
> - **Gözetim.** Posta kutusunu ve oturumların gönderim haberlerini en az 2 dakikada bir kontrol eder; 20 dakika ses vermeyen çalışan oturuma bizzat bakar. Gerektiğinde oturuma "dur" ya da "devam" der, yön verir.
> - **Tek ağır koşu.** (aynı) … Birden çok oturum `heavy.lock` bekliyorsa sırayı koordinatör yazar; kısa iş ve main düzeltmesi öne alınır.
> - **Gönderim (Mert, 2026-10-08; tren kalktı, KARARLAR OPS-08 ters çevrildi).** Main'e işi yapan oturum kendisi gönderir; koordinatörden izin beklemez, her önemli adımda ona tek satır haber verir (adımlar §6). Koşul: risk sınıfının incelemesi ONAY (R3'te `nf-guvenlik`), dal CI'ı yeşil, main'in üstüne fast-forward. Canlı veritabanında ekleyen migration'ı oturum kontrol listesiyle (§5.1) kendisi uygular; yetkiye dokunan (R3) canlı DDL, veri silen ve silen migration koordinatörün açık "gönder"iyle; geri dönüşsüz veri silme Mert'in "evet"iyle (§5.3).
> - **Denetim (Mert, 2026-10-08).** Koordinatör gönderimleri sonradan denetler: R3 ve canlı adımların hepsini, kalanından günde 2–3 örneği okur; main CI'ı hep izler.

**§4.3.1 (anlama adımı):**
> 1. **Başlangıç: anlama adımı (Mert, 2026-10-08).** İş başlatan her istekte (bir şeyi değiştiren, silen, oluşturan ya da bir oturuma iş veren) önce dört başlık yazılır: **Anladığım** · **Eksik ya da yanlış olabilecek** · **Sorularım** · **Bence**. Mert onaylamadan iş başlamaz; soru ve açıklama isteklerinde bu adım yoktur. Oturum da koordinatörden aldığı görevde aynı dört başlığı koordinatöre yazar, koordinatör cevaplar. Küçük işte bu tek satır ve tek tıktır; gerçek işte önce soru turu yapılır. Okuma ve ölçme onay beklemez. (devamı aynı)

**§4.3.7 (inceleme ve etkilenen testler):**
> - **R1** (tanım aynı): oturumun kendi diff okuması, etkilenen testler, ekran görüntüsü.
> - **R2** (tanım aynı): tek bağımsız inceleme (`nf-guvenlik` ya da `/code-review`, ikisi değil), etkilenen testler.
> - **R3** (tanım aynı): `nf-guvenlik` zorunlu (ekran değiştiyse masaüstü ve telefon görüntüsü de); etkilenen testler; koordinatör main'e girdikten sonra diff'in riskli kısmını okur.
> - **Etkilenen testler (en az set; Mert, 2026-10-08):** lint, typecheck ve dokunulan dosyaların birim testleri her zaman; `supabase/` değiştiyse dokunulan tablo ve fonksiyonun geçtiği `test:db` dosyaları (`grep`); ekran ya da API davranışı değiştiyse o ekranın e2e senaryoları. Oturum seçtiği testleri raporda yazar. Tam takım yalnız dal CI'ında bir kez koşar.

**§4.4.2:** "Koordinatör doğrular: commit main'de, main CI yeşil; denetim kuralına göre (§4.2) diff'i okur."

**§4.8 tablo satırı:**
> | Koordinatör karar verir | — | Mert'in yerine ürün/ekran kararı, para, canlı → `KOORDINATOR-KARARLARI.md` (5N1K); oturumların izleyeceği yöntem → ilgili kural dosyası; gündelik → `HANDOFF.md`'de günlük tek satır (koordinatör) |

**§5.1:**
> 1. **Koordinatör kendisi karar verir.** Ayrı kayıt (`docs/plan/KOORDINATOR-KARARLARI.md`, 5N1K) yalnız şunlar için: Mert'in yerine verilen ürün ya da ekran kararı (Mert çevirebilsin), para ve canlı veritabanı kararları. Oturumların izleyeceği yöntem kayda değil ilgili kural dosyasına yazılır. İş sırası, kilit sırası gibi gündelik kararlar `HANDOFF.md`'de günlük tek satırdır. Hepsi iş raporundaki "senin yerine verdiğim kararlar" listesinde gösterilir (Mert, 2026-10-08).
> - Sürekli yetkiler: … yetkiye dokunan (R3) canlı DDL ve silen migration için "gönder" iznini vermek. Canlı migration kontrol listesi (ekleyen migration'ı oturum kendisi uygular): risk sınıfının incelemesi ONAY, önce yedek (`pg_get_functiondef` + silinen nesnelerin tanımı), sonra md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT; silen migration main CI yeşil olunca gider.

**§5.3 son cümle:**
> Canlı migration bunlardan değildir: ekleyende oturumun kontrol listesi, R3'te ve silende koordinatörün "gönder"i yeter (§4.2; Mert, 2026-10-08).

**§6 Komutlar:** "Tam kapı (dal CI'ı koşar; yerelde §4.3.7'deki etkilenen testler yeter)" + odaklı `pnpm.cmd test:db supabase/tests/<dosya>.test.sql`.

**§6 Kilitler (`main.lock` kaldı — Mert'in açık kararı değil):**
> - `main.lock`: main'e gönderim (oturumun push'u); yoksa `scripts/guard.mjs` reddeder. Guard ayrıca dalın CI'ının yeşil olduğuna bakar (rebase'den önceki aynı değişiklik için). Bilinçli aşma `NF_OVERRIDE`; önce `refs/nf-backup/main/<zaman>` yedeği, `audit.log`.

**§6 "Gönderim adımları (tren)" yerine "Gönderim adımları":**
> 1. **Hazırla:** kod + etkilenen testler yerelde yeşil (§4.3.7); inceleme ONAY.
> 2. **Dal:** `git fetch origin && git rebase origin/main` → `git push origin <dal>` → dal CI'ı tam takımı koşar. Haber: `node scripts/inbox.mjs status "<iş-id>" "DAL <dal> @<sha>"`.
> 3. **Canlı (varsa):** ekleyen migration: yedek → `apply_migration` → dosya adı canlı ledger sürümü (KARARLAR OPS-05) → md5 + `get_advisors` + bağımsız SELECT. Haber: `"CANLI <sürüm>"`. R3 canlı DDL ve silen migration koordinatörün "gönder"ini bekler; silen migration main CI yeşil olunca gider.
> 4. **Main:** dal CI'ı yeşilse yeniden `git fetch origin && git rebase origin/main`; çatışma yoksa CI yeniden beklenmez, çatışma çözüldüyse dal CI'ı yeniden koşar. `main.lock` → `git push origin HEAD:main` (yalnız fast-forward; reddedilirse 4'ü tekrarla) → kilit bırakılır. Haber: `"MAIN <sha>"`.
> 5. **Sonra:** dalın migration'ı ortak yerel DB'ye `db.lock` ile uygulanır; main CI izlenir; kırmızıysa §6 "CI".
> - Durursan haber: `"DURDU <neden>"`. Haberler posta kutusundan gider (kalıcı); koordinatör görür, "dur" derse durulur.

**§6 CI (kırmızı main):**
> - Main kırmızıysa önce ayrılır: yalnız düşen işler yeniden koşturulur, hangi runner'da koştuğuna bakılır; altyapıdan gelen kırmızı koda düzeltme yazdırmaz; yük altında düşen test, kod kusuru sayılmadan önce boşta yeniden koşturulur. Kod kusuruysa bozan commit geri alınır (`git revert`; sahibi yapar, 15 dakikada yapmazsa koordinatör) ve haber verilir (`"GERİ ALDIM <sha>"`); sahibi düzeltmeyi dalında yapar. Canlı veritabanına dokunan değişiklik geri alınmaz, sahibi önce düzeltir. Main kırmızıyken, dal CI'ındaki tek kırmızısı main'deki aynı bilinen test olan dal main'e gidebilir (Mert, 2026-10-08).

## Öteki dosyalarda değişecekler
- `supabase/CLAUDE.md` 4. satır: "Bir dalın migration'ı ortak DB'ye kalıcı olarak yalnız main'e girdikten sonra, gönderen oturum tarafından (`db.lock` ile) uygulanır (`CLAUDE.md` §6 "Gönderim adımları" 5)."
- `e2e/CLAUDE.md` 28. satır: "`scripts/guard.mjs` main push'unda dalın CI'ının yeşil olmasına bakar (Mert, 2026-10-08); yerel e2e damgası artık şart değil."
- `ILKELER.md` P15: kural satırı yeni gönderime göre; bugünkü kanıt; sabahki tren kanıtı "ters çevrildi".
- `KARARLAR.md`: OPS-08 (tren) "ters çevrildi", yeni OPS-09.
- Hafıza notu `guard-checks-locks-before-command.md`.
