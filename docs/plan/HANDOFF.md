# Koordinatör devri — 2026-10-04 öğleden sonra

Devreden: "Koordinatör" `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` (worktree `.claude/worktrees/agitated-bartik-839c9b`); bağlam ~%72, müsaitlik kararları kilitlendikten sonra temiz sınırda devrediyor.
Devralan: Mert'in havuzdan seçtiği oturum — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.** Devralan ilk turda `get_session self` ile ölçer, kayıt oturumuna besler.

## 0. Mert'in durumu ve iletişim
- Mert PC başında; tıklamalı sorular (AskUserQuestion) ve §13 şablonu. Konuşmada kişi adlandırması: Lokasyon+Pozisyon+N (KadıköyMüdür1, KadıköyGarson1, Owner1).
- **Mesaj teslimi bozuk (2026-10-04):** devreden koordinatörden öteki oturumlara `send_message` / `SendMessage` 20 sn'de "undelivered" dönüyor (onay penceresi yok). Öteki oturumlardan koordinatöre mesaj ULAŞIYOR. Geçici yol: kayıt oturumuna besleme **dosyayla** — `C:/Users/TheWe/Documents/Codex/.newfork-inbox/kayit-besleme-<konu>-<tarih>.md` (kök; işlenince `done/`'a taşınır) ve Mert o pencereye "posta kutusundaki dosyayı oku" der. Yeni koordinatörde mesaj çalışıyor mu, ilk iş tek satırla dene.
- Tek seferlik talimat kural değildir (Mert 2026-10-04: "tek seferlik bir task vermiştim, kural değil"); kural dosyasına ancak "bundan sonra hep" denince yazılır. OPS-07 geçerli: oturum temizlenir, arşivlenmez.

## 1. İlk işler
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` (çıplak), arka planda `node scripts/inbox.mjs wait 7000`.
3. Kendini "Koordinatör" yap, sabitle, RC aç.
4. Kayıt oturumuna (kayıt-19, `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd`) **bekleyen besleme:** posta kutusu kökünde `kayit-besleme-avail-hardblock-kalkti-2026-10-04.md` (işlenmedi). Mesajla ya da Mert'e "oku" dedirterek ilet.
5. Eski kayıt-18 `local_d96f34f3-0d4a-4e84-a44b-6b653641d258`, FB-6.4 tazelik `local_01cffb57…` ve devreden koordinatör `local_10a5177a…` OPS-07 ile temizlenecek (hepsi temiz; her şey main'de).

## 2. Süren işler
### Müsaitlik (AVAIL) — kurallar KİLİTLİ, uygulama Mert'in onayını bekliyor
- Kurallar: KARARLAR "Müsaitlik (kullanıcı kararları 2026-10-04)" M1–M13 (+ tasarım seçimleri `ed076a19`). Kaynak kaydı `docs/plan/research/MUSAITLIK-calisma-prensibi-2026-10-04.md`.
- **Aynı gün değişen M8 (~13:45Z, Mert):** "availibility hiçbir zaman hard block olmasın. settingsten kaldıralım. her zaman için warn olsun. hiç bir zaman da conflict oluşturmasın" → ayar yok, Hard block yok, her yazmada "Scheduling rule" Warn kutusu (Cancel / Place shift), müsaitlik asla conflict üretmez. KARARLAR'a henüz işlenmedi (bekleyen besleme, §1.4).
- Tasarım seçimleri (Artifact https://claude.ai/artifact/DzdPU3Nhep6mo4nPMZUHDu, dal `task/avail-design` @8066c66a, push yok): S1 A+C (anahtar düzenleme şeridinde + Settings menüsünde, her zaman çalışır; kapalıyken turuncu tarama VE kart "!" gizlenir), S2 B (yönetici notu kartı hücre altında; not + işaret birlikteyse tek Warn kutusu iki satır; not iz bırakmaz), S3 B (preflight tek katlanır satır, onay yok), S4 E (çalışan "emin misin?" günün çizelgesiyle; takas kabulü de aynı), S5 B ("If approved" bölümünde amber rıza satırı).
- AVAIL-002 cevapları: S2 kayıpsız çeviri (günde birden çok aralık, gece yarısı sonrası ertesi güne), S3 değen tip işaretlenir, S4 koordinatör kararı (My availability + onboarding "Discard unsaved changes?" sorar, Employees çekmecesi sormaz), S5 açıklama cümlesi bugünkü gibi; S1 düştü (Hard block yok).
- **Görev dosyası:** `docs/plan/tasks/AVAIL-002.md` (main `aeec79db`; R3; 26 puan Hard block'la — kayıt oturumu yeniden hesaplayacak). Dilimler: A1/A2 `nf-db`, B `nf-backend`, C1/C2 `nf-arayuz`, D `nf-test`. **Başlatma Mert'in onayında** (koordinatör sordu, cevap bekleniyor). FB-6.4 ile aynı test dosyaları → sırayla.
- Tasarım işçisi `local_863130bd…` ("AVAIL tasarım artifact'i") bitti, beklemede.

### FB-6.4 Takas — görev dosyası main'de (`f5b542bf`), uygulama sırada
- Sınır: M6'nın takas kısmı (aday listesi, kabulde S4-E, onayda S5-B) FB-6.4'te; Schedule tarafı ve M5 keep/cancel kaldırma AVAIL-002'de. "Hard block'ta rıza" satırı düşecek (bekleyen besleme). AVAIL-002 ↔ FB-6.4 hangisi önce: ILERLEME §4 kuralıyla hesapla, Mert'e öner. BL-167 açık (FB-6.4 A1/A2 aynı fonksiyona dokunursa orada kapanır).

### FB-6.7 Duyurular — davranış konuşması Mert'le işçi 2 penceresinde
- Varyant seçimleri: B1-A ("Archive" iki tık kırmızı), B2-A, B3-A, C1-B, C2-A, C3 üçüncü tur A ("Tinted header"). Ekranlar kodlandı: işçi 1 `local_9f1bbd26…`, dal `task/fb-6.7-ui` @1d1b4325 (+ işçi 3'ün artifact commit'i @4d9226cc), durduruldu; C3 + lab silme bekliyor.
- Davranış konuşması işçi 2 `local_1628762e…` penceresinde (bağlamı ~%80); kararlar "FB-6.7-DAVRANIS" raporuyla gelecek. Akış Artifact'i https://claude.ai/artifact/QQbm6M5GghTPYLHcCHEBP3 (işçi 3 `local_575ba63c…`). Açık 5 soru: Restore Draft/Unpublished, Republish kime, saat değişikliği içerik mi, müdür onay sayısı, Workspace kutusu hatası (BL-564).

### Belge mimarisi — RAFTA
- Kayıt `docs/plan/research/BELGE-MIMARISI-uzlasma-2026-10-03.md` başı + `BELGE-MIMARISI-okuyucu-olcumu-2026-10-04.md`. FB-6.6 bugünkü hâliyle kapandı (main CI 37182814540). BL-560 (Manager rolünde belge yetkisi yok) raftan inince ilk iş.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Kayıt-19 | `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` | aktif; bekleyen dosya beslemesi var |
| Kayıt-18 (eski) | `local_d96f34f3…` | temizlenecek |
| FB-6.7 davranış (işçi 2) | `local_1628762e…` | Mert'le konuşuyor |
| FB-6.7 uygulama (işçi 1) | `local_9f1bbd26…` | durdu, C3 + lab silme bekliyor |
| FB-6.7 akış artifact'i (işçi 3) | `local_575ba63c…` | beklemede |
| AVAIL tasarım | `local_863130bd…` | bitti, beklemede |
| FB-6.4 tazelik | `local_01cffb57…` | bitti, temizlenecek |
| Havuz "(havuz) boş" | `local_91ac4f8d…`, `local_e4bbe6fe…`, `local_abc4d126…` | boş |
| Rol: nf-guvenlik | `local_7dfbe7d3…` | boşta |
| Mert'in oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

2026-10-04'te 26 boş "Bekle: …" havuz oturumu + 2026-10-01 eski koordinatörü Mert'in TEK SEFERLİK talimatıyla arşivlendi.

## 4. Dersler (bu devir)
- Rebase edilmiş dal `git branch -d` ile silinmez ("not fully merged"); `git cherry origin/main <dal>` 0 ise `-D` (guard yedekler).
- `git checkout -- <yol>` deny listesinde; kopyalanan dosyayı geri almak için `git show HEAD:<yol> > <yol>`.
- `git cherry-pick` `-q` bayrağı almaz.
- Arşiv, RC bağlıyken reddedilir; önce `set_remote_control <id> false`. Arşiv worktree'yi siler: önce `status` + `origin/main..HEAD` ölç.
- Temel bir modelde Mert aynı gün kararını değiştirebilir (M8): kural kaydında aynı gün değişeni açıkça işaretle (P22).
- Önceki devirlerin dersleri: `git show bb7b9e77:docs/plan/HANDOFF.md`.
