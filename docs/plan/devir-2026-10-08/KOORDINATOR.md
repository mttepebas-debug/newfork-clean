# DEVIR — KOORDİNATÖR (2026-10-08, ~22:45Z)

## 1. Kimlik
- Oturum: koordinatör; `CLAUDE_CODE_SESSION_ID` `f2f4ad49-6b1b-4db6-a445-4198729b2a0f` (posta kutusu `claim` bunda: `C:\Users\TheWe\Documents\Codex\.newfork-inbox\coordinator.json`); HANDOFF'taki kart kimliği `local_70128f8f-5bc3-4776-92cf-1fe096aa4404`. Başlangıç klasörü `C:\Users\TheWe\Documents\Codex\newfork-clean`.
- Kayıt worktree'si: `C:\Users\TheWe\Documents\Codex\newfork-wt\coord` (detached; `origin/main` `9f287986` + **17 yerel commit, main'e gitmedi**, `99762577..c992f389`; bu devir klasörüyle birlikte `task/devir-2026-10-08` dalına gönderildi). İçerik: KK-229…KK-235, BL-974…BL-989, iki DERSLER girişi, HATIRLATMALAR dosyası, HANDOFF gece notları.
- Yeni koordinatörün ilk işi: `node scripts/inbox.mjs claim` (posta kutusu bu oturumdan devralınır); bu klasörü ve `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\docs\plan\HANDOFF.md`'yi okumak.

## 2. Bugünkü genel durum
- **Main** `9f287986` (tren-2, 2026-10-08 12:28Z). **Main CI kırmızı** (run 37777039059, iki koşu): tren-2'nin Requests veri paketinden sonra izin/takas e2e'leri 2–5 kat yavaş, 60 sn aşımı. Kök bulunmadı → `EKRAN-02-requests.md` §4.1 (EKRAN-02-CI). KK-231.
- **Canlı** (Supabase `hvyvyisrqyathtliyyyv`) = main + **GA-2** (`20261008133054`, GUVENLIK-A, main'de değil). Requests'in silen migration'ı `20261008111800` canlıya gitmedi (main CI yeşilini bekliyor). Vercel main'den yayında.
- **CI:** tek runner (`newfork-local-pc`; -pc-2 ve -pc-3 Mert'in 2026-10-07 kararıyla kapalı, KARARLAR OPS-01 eki). Kilitler boş (22:40Z ölçümü).
- **Oturumlar:** 2026-10-08 ~18:00Z Mert'in "Bütün sessionlar idle beklesin" talimatıyla DUR; ~22:30Z bu devir notları istendi. Cron (gece modu) kapalı.

## 3. Main'e girmeyi bekleyen hazır işler
| İş | Dal @ sha | Durum | Not |
|---|---|---|---|
| BL-974 Schedule "by role" Jobs süzgeci (Mert'in bildirimi) | `task/bl-974` @`3607ae0b` (uzakta) | Hazır, R1, diff koordinatörce okundu | Dal CI'ı Requests gerilemesiyle kırmızı (37780828448); KK-233 (çok işli kişinin seçilmeyen işteki vardiyası gizli kalır — Mert'e "senin yerine" diye bildirildi) |
| GA-2 org ayar izinleri yalnız owner/admin | `task/guvenlik-a-ga2` @`302af460` (uzakta) | Canlıda; nf-guvenlik ONAY @e455efa9; test uyarlaması @5c6275f7 okundu | KK-232 |
| TREN-ARACI (tren aracı) | `task/tren-araci-2` @`55fb876b` (uzakta) | Hazır ama **yeni düzende rafa kalkıyor** | PARALEL-1 notu |
| BL-987 + BL-988 | `task/bl-987` @`77b8120b` (YEREL) | BL-987 yeni karara ters (rafa); BL-988 (heavy UZUN) kurtarılabilir | PARALEL-1 notu |
| BL-965 sonuç | `task/bl-965-sonuc` @`1f6a69c6` (uzakta) | Yalnız görev dosyası | |
| EKRAN-01 #12 Undo, #38 | `task/ekran-01-undo` @`53cb9276`, `task/ekran-01-38` @`92072dab` | nf-guvenlik ONAY'lı, canlı migration taşıyor (gönder verilmedi) | EKRAN-01 notu |
| BL-969 Employees | yerel `d3e8e6ad` (`task/bl-969-4` adıyla gidecek) | Canlı ölçüm bekliyor | EKRAN-03 notu |
| C2 Requests takas incelemesi | `task/ekran-02-c2r` @`8ef7b05a` (yerel) | ONAY @4903f87f koşullu; Mert'in görünüm bakışı (S2/G13) | EKRAN-02 notu |

## 4. Mert'in kararını ya da işini bekleyenler
- **Workflow kararları kayda yazılmadı** → `WORKFLOW-KONUSMASI.md` (17 karar, 6 açık nokta). Taslak kural metni → `ONERI-CLAUDE-md-taslak.md`; otomasyon önerileri → `ONERI-OTOMASYON.md`.
- **Ana klasörde silinen 14 dosya** (CLAUDE.md'ler, ILKELER, KARARLAR, handoffs): Mert sildi, "emin değilim". Geri getirmek `git restore` (dokunulmadı).
- **Sabah soruları:** `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\docs\plan\SABAH-SORULAR.md` — Tur 0 (G1–G9, G11, G13, G14) ve Tur 1–7 (S2…S25); bu sabah soru turu yapılmadı.
- **Hatırlatmalar:** `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\docs\plan\HATIRLATMALAR.md` — `C:\Users\TheWe\.codex` silme (14 GB; yedek `C:\Users\TheWe\Documents\Codex\.newfork-backups\codex-worktree-da4e-2026-10-08\`); Mert "sildim" deyince `git -C C:\Users\TheWe\newfork worktree prune`.
- **Uzak dal silme** (ajanlara yasak, Mert'te): `task/guvenlik-a`, `task/guvenlik-a-ga4`, `task/guvenlik-a-ga4-v2`, `task/sayfa-klasoru` (yedek `C:\Users\TheWe\Documents\Codex\newfork-clean\.newfork-backups\branches-guvenlik-a-2026-10-08.bundle`), `task/acil-40001`, `task/acil-40001-v2`; ayrıca eski `task/bl-965*`, `task/bl-969`, `task/bl-969-2/-3`, `task/tren-araci` (birleşme `git cherry -v origin/main <dal>` ile ölçülmeli).
- **Makine:** Supabase Studio kapatma (~380 MB) önerisi; vmmem'in kaynağı (`hcsdiag list`, yönetici); OTOMASYON-4 uçtan uca testi 2026-10-11 (Hesap 2 limiti).
- **Para/CI:** GitHub ücretsiz 2.000 dk → sonra dakika başı (Mert'in önerisi; tavan sonra); public repo şimdilik yok.

## 5. Koordinatörün yarım işleri
- **OTOMASYON-5** (PARALEL-1'e verildi: `/gonder` skill + `scripts/ship.mjs`, guard'ın CI denetimi, koordinatör hatırlatma kancası): oturum anlama adımını yazdı (5 soru, 9 nokta — PARALEL-1 notunda), **cevaplanmadı, beklemede**. Kapsam yeni koordinatörle yeniden kararlaşacak.
- Kural belgeleri (yeni kök CLAUDE.md, `koordinator` skill'i, klasör dosyalarına taşıma, ILKELER P15, KARARLAR OPS-08 ters / OPS-09, DERSLER) **yazılmadı** (Mert "pause" dedi).
- Yeni `nf-ci-triage` alt ajanı yazılmadı.
- Requests'in silen migration'ına (111800) koşullu "gönder" verildi (KK-229); koşul (main CI yeşil) sağlanmadı.
- EKRAN-01 #12 ve #38 canlı migration'ları için "gönder" verilmedi (bekliyor).

## 6. Bilinmesi gereken (kayıtta olmayan)
- `list_events` bu akşam boş döndü; oturum geçmişleri `C:\Users\TheWe\.claude\projects\<proje>\<id>.jsonl`'den okunabiliyor (koordinatörün betiği: `custom-title` ile oturum bulunur).
- Mert'in kendi oturumları (yönetilmez, uyandırılmadı): "Test kuralları ve e2e gereksinimleri" (`6940a53c…`; §2.A.3 test kuralının ağır koşu doğurup doğurmadığı soru-cevabı; sonuç: kural koşu başlatmıyor, "kullanıcı akışı" tanımsız, CI e2e'nin hepsini koşuyor; Mert'in sade taslağındaki yeni test cümlesi buradan), "Dev sunucusu başlat" (`00593917…`; dev sunucusu ve DERSLER içeriğini mobilde görmek), "Devir testi" (`2577cf3c…`; içerik yok, iş yok). Mert'in açtığı yeni oturum "Koordinatör ile session yönetimi" (`local_6784bc5c…`) incelenmedi (talimat gereği).
- Bugünkü KARAR-001 kabul oranı düşük: Mert birçok soruya seçenek dışı serbest cevap verdi ya da soruyu kapattı → seçenek setleri isteğini karşılamıyordu (DERSLER 2026-10-01 KARAR-001 dersi).
- Koordinatör bağlamı ~%35 (22:45Z).

## 7. Ekler (bu klasörde)
- Oturum devir notları (oturumların kendi yazdığı, aynen): `EKRAN-01.md`, `EKRAN-02-requests.md`, `EKRAN-03.md`, `GUVENLIK-A.md`, `PARALEL-1.md`, `EKRAN-08-CEKMECE.md`, `EKRAN-16.md`, `EKRAN-10-GENERAL.md`, `EKRAN-10-JOBS.md`, `EKRAN-10-LOCATIONS.md`, `BILDIRIM.md`.
- `WORKFLOW-KONUSMASI.md`, `ONERI-CLAUDE-md-taslak.md`, `ONERI-OTOMASYON.md`, `README.md` (dizin ve özet).
