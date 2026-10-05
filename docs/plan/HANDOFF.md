# Koordinatör devri — 2026-10-05 öğleden sonra (UTC)

Devreden: "Koordinatör" `local_863130bd-957d-498b-9dfb-71a39090e29e` (worktree `.claude/worktrees/gallant-feistel-508e83`); bağlam %70, Mert'in onayıyla ("Şimdi devret", 2026-10-05) prototip yayını kayıt oturumundayken devrediyor.
Devralan: Mert'in açacağı yeni oturum — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.** Devralan ilk turda `get_session self` ile ölçer, kayıt oturumuna besler.

## 0. Mert'in durumu ve aktif iş
- **Aktif iş PROTOTİP** (Mert, 2026-10-05): gerçek uygulamadaki her şey tıklanabilir prototipe taşınıyor — https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK ("Newfork uygulama prototipi", ÖZEL, paylaşılmaz; içinde Mert'in 41 kişilik listesi). **Gerçek uygulamada iş bekliyor** ("Uygulama tamamen beklesin"; prototipte bulunan hatalar uygulamaya TAŞINMAZ, backlog'a yazılır). Prototip planının sahibi ve sıralayanı koordinatör (KK-141/142).
- Mert kuralı (2026-10-05): **rapor geldikçe o oturuma sormadan çakışmasız yeni iş ver**, boş oturum bırakma (hafıza `keep-sessions-busy-prototype`).
- Prototip kuralları: davranış gerçek uygulamayla birebir; görünüm aynı ya da daha iyi, her cila not edilir; KARARLAR'da olup kodda olmayan karar prototipe uygulanır ve kontrol listesinde "decision (not yet in real app)" diye işaretlenir; kullanılmayan varyant bırakılmaz; tek yayıncı kayıt oturumu; derleme `python sched_lock.py take <kim> 600` ile.
- **Kullanım limiti:** 2026-10-05 ~07:30Z'de 5 saatlik hak %89 ölçüldü (13 oturum paralel). Yeni tur açmadan önce limiti gözet; kesilen iş yarım kalır.
- Mert PC başında, tıklamalı sorular (§13 şablonu). Meşgul oturuma giden mesaj "queued" kalır ve sırayla işlenir — çapraz mesaj çok, eski bilgiyi yeniden işleme.

## 1. İlk işler
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` (ÇIPLAK komut, zincirsiz — zincirlenirse hook yakalamaz), arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000).
3. Kendini "Koordinatör" yap, sabitle, RC aç.
4. Kayıt-20'ye (`local_d96f34f3-0d4a-4e84-a44b-6b653641d258`) "yeni koordinatör <kimlik>" beslemesi; Kayıt-21 hazırlıktaki oturuma (`local_abc4d126…`) da bildir.
5. Devreden `local_863130bd…`: commit'i yok, worktree temiz (bu dosya hariç her şey main'de). Ona "kendini temizle" mesajı gönder; arşiv Mert'e sorulur.

## 2. Prototip — nerede
- **Kanonik kaynak** kayıt-20'nin scratchpad'i SCR = `C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean--claude-worktrees-sleepy-lumiere-443370\20722961-50c7-4fbf-b932-c7b1a17e6a35\scratchpad` (pano `docs-table\project\App.dc.html`, `gen_app.py` birleştirici, `parts\README.md` sözleşme). Yayından sonra koordinatör kalıcı kopyayı alır: `robocopy <SCR> C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\prototype /MIR /XF *state.json` (state.json = yerel Supabase oturum token'ları, Mert silme kararı verene kadar kopyalanmaz); sonra ajanlar oradan çalışır.
- **Canlı sürüm 32** (Schedule S1–S5). **Yayını bekleyen** (kayıt-20 yapıyor, tahmin ~15:45Z): P1–P5 sayfaların derin turu, Q1–Q5 uygulama dışı ekranlar (x_*), PROTO-SCHED-FIX (Marka), PROTO-P2-FIX (Q), PROTO-EMP-SCHED, PROTO-X-KARAR, dört telefon panosu (PhoneEmployee, PhoneManager, PhoneManager2, PhoneAuth; 390×844, ana panonun sağında), S1 (1920'de liste içeriği en çok 1320 px ortalı — KK), Inter değişken font, `SCR\checks\regress.js` (gerileme denetimleri). Kural (KK): yeni eşitleme turları BU yayına girmez.
- **Yayından sonra sıradaki prototip işleri** (önerilen sıra):
  1. Masaüstü birebir eşitleme turları — serbest parçalar: workspace, requests, settings + set_* (p3box\p3_gen.py + p3src'den üretilir, parts'ı doğrudan düzenleme), notifications, announcements, dates; Account (p5 kaynakları) → `local_59616a96` ("Koordinatorden görev ataması", hazır bekliyor). Ölçü kaynağı: `artifacts/prototype/ref-pack/` (242 durum; sahibi `local_ba5d9903`). Dört tuzak: requests.js `var TO_SEED = [JSON]` biçimi korunur (Schedule okur); dates.js SEED biçimi korunur (gen_sched.py regex); set_* üreticiden; ortak veri (people.json, sample-documents.json, notifications.js) sormadan değişmez.
  2. Telefon kabuğu birleştirme (`local_8071d7f4`, PROTO-PHONE-SHELL) — **Mert'in görsel kararını bekliyor** (aşağıda 3.1); yan yana görüntüler `artifacts/prototype/phone-shell/`.
  3. Schedule paketi kalanı: S-ESLIK-1 (eşlik raporu) ve SCHED-FIX #15 (Mert kararı).
  4. Duyuru akış prototipi (ayrı artifact https://claude.ai/artifact/QQbm6M5GghTPYLHcCHEBP3, sürüm 7) ikinci tur: K24/K5 kalkar, K19 taslak görünürlüğü + iki tık silme, K20 geçmiş tarih yok, K21 yazara tek bildirim (koordinatör kararı (a)) — devir notu `artifacts/prototype/fb-6.7-akis/IKINCI-TUR.md`, kaynak `C:/tmp/akis-src`; önceki işçinin (`local_1628762e`) bağlamı %77, YENİ oturuma verilmeli.
  5. ~260 token karşılığı olmayan renk (PROTO-P2-FIX #22), q4_sweep /welcome/documents yatay kaydırma adayı.

## 3. Mert'in kararını bekleyenler
1. **Telefon liste sayfaları kabuğu (görsel, P04):** (a) gerçek ölçüler (yan 46 px, başlık serbest, filtreler alt alta, 36 px kontroller) / (b) cila (yan 16 px, başlık 132 px sabit, kayan 40 px sekme satırı, 44 px kontroller, kart satırı). Yan yana görüntüyü göster, seçtir; seçilen değer tek kural olur.
2. **Schedule → Export:** zamanlanmış e-posta dışa aktarmanın yerleşimi (Marka'nın raporunda iki seçenek; inbox done `20261005T102130-proto-sched-fix-proto-sched-fix.md`).
3. **Telefonda "Terminate employee"** gösterilsin mi (BL-407; PROTO-PHONE-MGR raporu).
4. **Uygulama dışı ekranlarda 4 metin sorusu** (PROTO-X-KARAR raporu, inbox done `20261005T082235-…`).
5. **Schedule Pazartesi sütunu kenar çizgileri:** üretilemedi; Inter dosyadan yüklenince yayında yine görürse Mert'ten ekran görüntüsü.
6. **10 `*state.json` dosyası** (yerel Supabase token'ları; SCR ve artifacts/prototype altında) — tur bitince silinsin mi (silme geri alınamaz, Mert'in onayı).
7. Uygulama beklerken SORULMAYANLAR (backlog'da "karar gerekir"): BL-628, 644, 646, 652, 667, 671, 679, 680; FB-6.4 owner'ın takas vakası (nf-guvenlik önerisi: onaysız kaydolur, müdürlere bildirim).

## 4. Oturumlar (2026-10-05 ~13:30Z)
| Oturum | Kimlik | Durum / sıradaki |
|---|---|---|
| Kayıt-20 (yayın + kayıt) | `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` | son tam kontrol + tek yayın; bağlam yarıyı geçti → yayından sonra kayıt rolünü Kayıt-21'e devreder |
| Kayıt-21 hazırlık | `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` | hazır (yalnız okudu), devri bekliyor; numarayı kayıt-20'nin son beslemesinden alır |
| Marka design dili oluşturma | `local_5ffce2bb-a35b-4c6f-809d-f3d5a0741744` | PROTO-SCHED-FIX bitti; marka işi (font → logo → renk) bekliyor |
| Prototip: uygulama dışı ekranlar (Q1–Q5) | `local_575ba63c-46e6-4d68-9835-28a9f46fccf9` | PROTO-P2-FIX + e-posta bitti; bekliyor |
| Prototip: eşlik denetimi | `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` | PROTO-REGRESS bitti; bekliyor |
| Prototip: KARARLAR uyum denetimi | `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` | PROTO-X-KARAR bitti; bekliyor |
| Koordinatorden görev ataması | `local_59616a96-5564-438f-9be5-e3b4d1bb2005` | EMP-SCHED bitti; sıradaki Account eşitleme (yayından sonra) |
| Prototip: gerçek uygulama ölçü paketi | `local_ba5d9903-0161-4711-9bb8-5c36f278dedc` | ref-pack bitti; worktree `newfork-wt/proto-ref-pack` duruyor (eşitlemeler bitene kadar) |
| Prototip işçi: çalışan ekranları telefonda | `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` | bitti; bekliyor |
| Prototip işçi: yönetim ekranları telefonda | `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` | bitti; bekliyor |
| Prototip işçi: Settings ve iletişim telefonda | `local_8071d7f4-6992-4ae4-8360-e51402a59472` | PROTO-PHONE-SHELL: Mert'e yan yana görüntü hazırlıyor, kararı bekleyecek |
| Prototip işçi: giriş ve kurulum telefonda | `local_d75967aa-27b0-4b5a-971a-72e1e16fa8ed` | bitti; bekliyor |
| Prototip: duyuru akışı güncelleme | `local_1628762e-1ac8-457c-be6a-540b5bafdb4d` | bağlam %77 — yeni iş verme; arşiv Mert'e |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | SEC-A2-A3-TASARIM bitti; bekliyor |
| FB-6.7 B+C-ekran uygulama | `local_9f1bbd26-06b7-46b0-996a-beecaa6521ae` | dal `task/fb-6.7-ui` (eski kurallarla); dokunma |
| Mert'in oturumları | "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç", "Slash komutları…", "Dev sunucusu başlat", "Fotoğrafları karşılaştır…" | dokunma |

Port dağılımı (dev sunucuları): Q 5630/31, Marka 5632/33, phone-emp 5622/23, phone-mgr 5626/27, phone-auth 5620/21, phone-mgr2 5616/17, emp-sched 5612/13, ref-pack 5638/39.

## 5. Gerçek uygulama (bekliyor)
- Main'de DOC-TABLE (`600e974d`: liste ortak dili, Notifications Read/Unread, Important Dates sekmeleri). Main CI 37258509819: check yeniden koşuda yeşil; e2e Pazar penceresinde BL-238 ile düşmüştü — **e2e işi 2026-10-05 ~13:30Z'de yeniden kuyruğa alındı, sonucunu kontrol et.**
- Uygulama dönünce sıra: SCHED-FIX (BL-607 SAVE penceresi, BL-606 K17 — kök nedenler maddelerde) → BL-562 (ızgara bütçesi) → FB-6.4 Takas (+A2 rütbe, +2 puan). Yayın öncesi güvenlik paketi (ILERLEME §8): A4 hosted e-posta ölçümü → A5 SSN metni → A1 BL-232+BL-178 (R3, ultrareview; tasarım inbox done `20261005T080542-nf-guvenlik-sec-a1-tasarim.md`) → A2 → A3 BL-351 (~4 puan; tasarım `20261005T131114-…`).
- Backlog: BL-684'e kadar, high 11, critical yok. Q/P/EMP-SCHED prototip bulguları yazıldı.
- Program FOUNDATION-B Aşama 6–7 %73,2 (183/250), değişmedi.

## 6. Temizlik (Mert'te bekleyen komutlar)
- Bu oturumun silemediği worktree'ler (izin yok): `.claude/worktrees/agent-aeafa368ff57306a2`, `agent-ab68e51d5764faab9` (DOC-TABLE, ikisi de main'de — `git cherry` boş), `agent-a77cae19a6eca8acb` (SCHED-FIX, değişiklik yok) ve dalları; komutlar devreden koordinatörün 2026-10-05 mesajlarında. `task/avail-design` silinsin mi sorulmadı.

## 7. Dersler (bu devir)
- Peer'e verilen kapsam daraltma mesajı geç ulaşırsa iş ikilenir (Q bulguları iki kez yazıldı) — daraltmayı işi verirken yap.
- Kimlik/sayı içeren kararı iletirken veriye bak: E-9100 (owner) yerine E-9004'ü yazmam gerekiyordu; Q oturumu yakaladı.
- Yeni oturum bağlamı ~%20'den başlar (sabit taban); bağlam eşiğini buna göre koy.
- "matched" diyen ajan kontrol listelerine güvenme: Mert Schedule'da ve çalışan Schedule'ında çok fark buldu; bağımsız ölçüm + regress.js.
