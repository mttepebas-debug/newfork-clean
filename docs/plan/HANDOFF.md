# Koordinatör devri — 2026-10-03 akşam (Mert'in isteği: "devret, yeni koordinatöre geç")

Devreden: "Koordinatör" `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` (worktree `.claude/worktrees/quirky-lovelace-871b05`); bağlam ~%69, belge mimarisi uzlaşmasının temeli (U1–U12) bittikten sonra temiz sınırda devrediyor.
Devralan: havuzdan `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` (eski on altıncı kayıt oturumu, OPS-07 ile temizlendi) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.**

## 0. Mert'in durumu
- Mert PC başında ama saatlerce cevap vermeyebiliyor. Tıklamalı sorular (AskUserQuestion) şu an tercihi; ürün sorusu §13 şablonuyla, seçenek + "(Önerilen)" + Dayanak.
- Mert "plan modunda gibi, önce sohbette konuşalım" dediği konularda KOD YAZILMAZ; izni ayrıca verir (belge mimarisi — §2).
- Konuşmada kişi adlandırması (Mert'in kuralı): Lokasyon+Pozisyon+N (KadıköyMüdür1, KadıköyGarson1, KadıköyBeşiktaşGarson2, Admin1, Owner1).

## 1. İlk işler (sırayla)
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` — ÇIPLAK komut. Sonra arka planda `node scripts/inbox.mjs wait 3600` (en çok 7000; tavan 2 saat — tavana ulaşırsa yeniden başlatma, hook raporu yine getirir).
3. Kendini "Koordinatör" yap, sabitle, RC aç (`set_remote_control self true`; bu oturum bir tur koştuktan sonra açılır).
4. **İki takılı oturum** (10:11Z'den beri mesaj teslim olmuyor, "onay bekliyor olabilir"): Mert'e o pencerelere bakmasını hatırlat; mesajlar sırada.
   - Kayıt oturumu (on yedinci) `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` — bekleyen iki BESLEME (B main'de + belge mimarisi U1–U10). Teslim olmazsa yeni kayıt oturumu havuzdan kur (`list_sessions`; Haiku/low gelir → opus/high), ilk kaydına §2'yi besle.
   - A3 e2e `local_863130bd-957d-498b-9dfb-71a39090e29e` — koşu mesajı (§2 FB-6.6) teslim olmadı.
5. Devreden oturumu (`local_91ac4f8d…`) OPS-07 ile temizle: worktree temiz, gönderilmemiş commit yok (bu devir commit'iyle birlikte).

## 2. Süren işler
### FB-6.6 Belgeler / onboarding — A1+A2+B main'de ve canlıda; A3 koşusu bekliyor
- Main: A1+A2 `84ada590` (nf-guvenlik tur 3 ONAY @`89d91f83`), B `f4dce985`; main CI 37090845658 ve 37115516542 YEŞİL. Canlı: dört migration `20261006000000`…`030000` (CANLI: TAMAM; md5'ler repo dosyasıyla aynı; Mert'in onayıyla 12 signature_templates rol satırı silindi; yedek `newfork-wt/coord/artifacts/coord/fb-6.6/hosted-push/backup/`, rapor `…/RAPOR.md`).
- A3: dal `task/fb-6.6-a3` @`2ba927b3` (8 senaryo yazıldı, koşulmadı). Görev: rebase origin/main → `db.lock` → `pnpm.cmd e2e -- flows/employee-onboarding.spec.ts flows/documents.spec.ts`; D5 birincil lokasyonu olan owner'la (BL-559). Yeşilse main'e (R2; Done when 11), BL-461 kapanır.
- FB-6.6'yı kapatmadan: Done when kanıtları task dosyasına; KARARLAR'a D1/D2/D5/S1/S2/reddedilen (Done when 13 — kayıt oturumunun işi).
- Temizlik (birleşme doğrulanmış): `task/fb-6.6-a1`, `task/fb-6.6-a2` (+ yedekler `backup/fb-6.6-a2-pre-rebase`, `-2`, `-3`), `task/fb-6.6-b` dalları ve `newfork-wt/fb-6.6-a1`, `-a2`, `-b` worktree'leri; `newfork-wt/fb-6.6-a1b-schedule` (boş, dal `task/fb-6.6-schedule` — iş belge mimarisine taşındı, sil). `git cherry` ile ölç, sonra sil. Alt ajan worktree'leri: `.claude/worktrees/agent-aedfefc1655cbca53` (nf-db hafıza farkı bu devir commit'ine alındı → içerik main'de), `agent-a9c2fed83104fc506`, `busy-kowalevski-4eedf7` (kirli ama içerik main'de; `--force` yasak).
- İşçi oturumları boşta, havuza döndürülecek (OPS-07): nf-db `local_abc4d126…` (FB-6.6 A1), nf-backend `local_d8686bdf…` (A2), nf-arayuz `local_01cffb57…` (B).

### Belge mimarisi uzlaşması — RAFTA (Mert, 2026-10-03 ~19:30Z; ayrıntı ve dönüş noktası kayıt dosyasının başında)
- Kayıt: `docs/plan/research/BELGE-MIMARISI-uzlasma-2026-10-03.md` (main `519eb287`). U1–U12 Mert'in kararları; T1–T9 türetilenler (T7–T9 Mert kabul etti). İki ters seçim (U2, U4) → ILKELER kanıtı henüz yazılmadı (kayıt oturumu takılı).
- Özet: tür anlamları aynı (U1); ayarlar iki yerde, belge kurallarının varsayılanı "onay iste" (U2); süresi dolan onaylı belge eksik sayılır, ek süre yok (U3); auto-fill seçmez ama takas/devir/açık vardiyada görünür → yönetici onayı (U4), çalışan nedeni görmez (U5); **belge görünürlüğü bütünüyle rütbe zinciri** (U6); vardiyaya dokunan müdür işlem anında yalnız "belge eksik" notu (U7); kısıtlı kişinin vardiyası Schedule ayarına bağlı (U8); aktif çalışana sonradan zorunlu belgeye teslim süresi (U9); Acknowledgements aynı kural (U10); **saat dilimi: lokasyon saati + yedek workspace saati + belge bitişi yalnız tarih** (U11); çok lokasyonlu tam gün izin birincilin gece yarısı (U12).
- Açık başlıklar (sırayla konuş): onboarding ince noktaları, bildirim içerikleri (bildirim platformu ayrı), uygulama sırası/parçalama (büyük R3: Schedule'ı besleyen 16 işleme okuyucu taşıma, yayın parmak izi riski — `nf-db`'nin ölçümü `local_abc4d126` oturumunda). Uzlaşma bitince görev dosyası (`nf-planlama`), sonra Mert'in kod izni.
- Bağlı backlog: BL-557 (owner yüklemesinde API/DB işaret farkı), BL-559 (birincilsiz kişi saat dilimi — U11 ile karar verildi, uygulama bekliyor), B'nin Y3'ü (satır başına karar veren düğmeleri = T2).

### FB-6.7 ekran (B + C) — PARK, Mert'in varyant seçimini bekliyor
- Değişmedi: işçi `local_1628762e…`, `newfork-wt/fb-6.7-ui`, `task/fb-6.7-ui`. Lab `http://127.0.0.1:5642/app/dev/fb67` kapalı; Mert bakacaksa önce ölç, kapalıysa launch.json ile aç (`git show e30f3de3:docs/plan/HANDOFF.md` §2).

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Kayıt (on yedinci) | `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` | takılı (mesaj teslim olmuyor) |
| FB-6.6 A3 nf-test | `local_863130bd-957d-498b-9dfb-71a39090e29e` | takılı, koşu bekliyor |
| FB-6.6 A1 nf-db | `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` | boşta → havuz |
| FB-6.6 A2 nf-backend | `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` | boşta → havuz |
| FB-6.6 B nf-arayuz | `local_01cffb57-9a21-48e4-9537-f448e142c6a9` | boşta → havuz |
| FB-6.7 B+C-ekran | `local_1628762e-1ac8-457c-be6a-540b5bafdb4d` | boşta, varyant seçimi bekliyor |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; incelemeler alt ajanla |
| Havuz "Bekle: … (81–86, 91–93)" | `list_sessions` | Haiku/low — iş vermeden önce opus/high |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

## 4. Dersler (bu devir)
- Besleme/KK saati o an `date -u` ile; soru öncesi okunan saat cevaba yazılmaz (iki kez yanlış yazıldı, kayıt oturumu yakaladı).
- Geri alınamaz canlı silme Mert'in onayıyla koordinatörün penceresinde → işi koordinatörün alt ajanı yapar (aktarılan onay geçmez).
- İncelemede "gizlenen durumun incelenmemiş kardeşi" (superseded, rejected) kontrolü — nf-guvenlik hafızasında.
- `git ls-tree <dizin>` dosya ölçümü yanıltır (dizinin kendisini listeler); dosya varlığını `git cat-file -e origin/main:<yol>` ile ölç.
- Mert tıklamalı soruda saatlerce dönmeyebilir; bekleyiciyi 2 saatlik tavanla kur, tavana ulaşınca yeniden başlatma.
- Önceki devirlerin dersleri: `git show e30f3de3:docs/plan/HANDOFF.md`.
