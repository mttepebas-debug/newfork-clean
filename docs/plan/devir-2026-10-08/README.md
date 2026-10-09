# Devir — 2026-10-08 (workflow değişikliği öncesi tam envanter)

**Neden:** Mert (2026-10-08 ~22:30Z): "Workflow değişikliği yapacağız; bu sessionlar ve ilerlemeleri silinsin kaybolsun istemiyorum. Yeni koordinatör sessionında yeni workflow kararlarıyla devam edeceğiz." Koordinatör, "Koordinatör ile session yönetimi" (`local_6784bc5c…`) dışındaki bütün açık oturumlardan devir notu topladı; notlar oturumların kendi yazdığı metindir (aynen). Toplama: 22:27–22:31Z; oturumların hepsi DUR'da, notu yazıp boşta bekliyor.

**Devralan:** Mert (2026-10-09 ~02:15Z): "Koordinatör ile session yönetimi sessionuna devret". Devir o oturuma (`local_6784bc5c-57f7-4dd2-a4d2-1abc3b3f9cca`, başlangıç klasörü `C:\Users\TheWe\Documents\Codex\newfork-clean`) mesajla verildi; eski koordinatör (`f2f4ad49…`) posta kutusunu bıraktı ve bu worktree'ye bir daha yazmaz. Eski koordinatörün yardımcı betikleri (oturum geçmişi okuma `tx.py`, not bölümü çıkarma `sections.py`, posta toplama `collect.sh` vb.): `C:\Users\TheWe\Documents\Codex\newfork-wt\devir-yedek-2026-10-08\koordinator-betikleri\`.

**Yerler**
- Bu klasör: `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\docs\plan\devir-2026-10-08\` — GitHub'da `task/devir-2026-10-08` dalı (koordinatörün main'e gitmemiş 17 kayıt commit'iyle birlikte).
- Geçici dosyaların yedeği (git dışı, 172 MB): `C:\Users\TheWe\Documents\Codex\newfork-wt\devir-yedek-2026-10-08\` (`OKU-BENI.md`).
- Kayıtların (BACKLOG, KARARLAR, KOORDINATOR-KARARLARI, DERSLER, SABAH-SORULAR, HANDOFF, HATIRLATMALAR) güncel hâli: `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\docs\plan\` (main'den 17 commit ileride).

**Okuma sırası:** `KOORDINATOR.md` → `WORKFLOW-KONUSMASI.md` → aşağıdaki tablo → ilgili oturumun notu.

## 1. Genel durum (2026-10-08 22:45Z)
- Main `9f287986`, **main CI kırmızı** (Requests veri paketinden sonra izin/takas e2e'leri yavaş; kök bulunmadı — `EKRAN-02-requests.md` §4.1).
- Canlı = main + GA-2 (`20261008133054`). Requests'in silen migration'ı `20261008111800` bekliyor.
- Tek CI runner; kilitler boş; oturumlar DUR.
- Workflow kararları (oturum main'e kendisi gönderir, önce geri al, yalnız etkilenen testler, anlama adımı, …) Mert'ten alındı ama **hiçbir kural dosyasına yazılmadı** — `WORKFLOW-KONUSMASI.md`.
- **Mert ana klasörde 14 dosyayı sildi** (CLAUDE.md'ler, ILKELER, KARARLAR, handoffs; commit'lenmedi; "emin değilim"). Ana klasörde açılan yeni oturumlar kural dosyasız başlar.

## 2. Oturumlar
| Oturum (kart adı) | local_ | Not | Durum | Sıradaki adım | Kimi bekliyor |
|---|---|---|---|---|---|
| Schedule — EKRAN-01 | `6979dfbe…` | `EKRAN-01.md` | Paket 1 main+canlı; BL-974 hazır (`task/bl-974` @3607ae0b); #12 Undo (`task/ekran-01-undo` @53cb9276) ve #38 izin işareti (`task/ekran-01-38` @92072dab) ONAY'lı, canlı DDL + test:db bekliyor | #12/#38 rebase → test:db → "gönder" → canlı | Koordinatör: #12/#38 gönder, #28/#29 için `styles.css` izni, #10/#13/#15 kararları; Mert: S24, S25, #86–#88 görsel |
| Requests — EKRAN-02 | `224535dd…` | `EKRAN-02-requests.md` | Veri paketi main+canlı; **EKRAN-02-CI kök bulunmadı**; 111800 bekliyor; C2 (`task/ekran-02-c2r` @8ef7b05a) ONAY koşullu | Onay yolunu yerel DB'de `pg_locks` ile adım adım zamanla (hazır betik `measure.sh`) | Mert: tek tablo + C2 görünüm bakışı (S2, G13); 3 düşük bulgu kararı |
| Employees — EKRAN-03 | `e062291d…` | `EKRAN-03.md` | BL-969 dalda (`task/bl-969` yerel @d3e8e6ad, 3 ONAY); canlıda hiçbir şey yok | Rebase → `task/bl-969-4` push → dal CI → canlı ölçüm (0 değilse dur) | Koordinatör: main kırmızıyken dal CI gitsin mi; bekleyişte A4/A1/bekle |
| Güvenlik — GUVENLIK-A | `bf8f7f46…` | `GUVENLIK-A.md` | GA-1, GA-4 main+canlı; GA-2 **canlı ama main'de değil** (`task/guvenlik-a-ga2` @302af460); GA-3a/3b başlamadı; OTOMASYON-4 dalda (push yok) | GA-2'yi main'e al → GA-3a (R3, en güçlü model) | Mert: eski dal silme; GA-3 için ücretli `/code-review ultra`; yarım kalmış 4. soru |
| Araçlar — PARALEL-1 | `0ea2b338…` | `PARALEL-1.md` | BL-965 main+canlı; TREN-ARACI ve BL-987 ONAY'lı ama yeni karara göre **rafa**; OTOMASYON-5 başlamadı (anlama notu §5'te) | Yeni koordinatör OTOMASYON-5 kapsamını kararlaştırınca | Koordinatör + Mert: OTOMASYON-5'in 5 sorusu |
| Important Dates — EKRAN-08 | `05f60332…` | `EKRAN-08-CEKMECE.md` | İnceleme raporu main'de; **Mert seçimini yaptı (A + L1)**; ACIL-40001 main+canlı | Ekran 8 kod işi (önce veri modeli; BL-959 önce kapanmalı) | Mert: 2 varsayım (kısa saatli günde vardiya varsayılanı; All day kapalıyken saat) — SABAH-SORULAR'da yok |
| Giriş ve katılım — EKRAN-16 | `1f893110…` | `EKRAN-16.md` | Keşif bitti; BL-804 main+canlı | Seçimlerin kayda geçmesi, R3 görev dosyası | Mert: **giriş modeli** (kod / ikisi / parola — işi durduran tek soru), sembol, motto, hareket, yerleşim; 15 seçim kayda geçmedi |
| Settings General — EKRAN-10 | `a1ef992c…` | `EKRAN-10-GENERAL.md` | İnceleme main'de; **Mert altı tasarımın hiçbirini beğenmedi** (kayda geçmedi) | Neyi beğenmediğini sor; Locations/Jobs yolu: birebir kopya + 2–3 varyant | Mert: G1 (yeni tur), G2 öneriler, G3 saat dilimi modeli |
| Settings Jobs — EKRAN-10 | `ba6dcfcd…` | `EKRAN-10-JOBS.md` | V1 seçildi + 3 düzenleme, kayıt main'de; kod işi açılmadı | 4 kapsam sorusu + 1 görsel varyant | Mert: Jobs 4 soru ("dönünce cevaplayacağım, unutma") |
| Settings Locations — EKRAN-10 | `dd2f4f75…` | `EKRAN-10-LOCATIONS.md` | A seçildi, kayıt main'de; kod işi açılmadı | Kod işi (R1–R2) | Mert: ortak çekmecedeki 15 px kaymanın öteki ekranlara yayılması (kod işi başlarken) |
| Bildirim — BILDIRIM | `2e4ae653…` | `BILDIRIM.md` | Aşama 1 (söküm listesi, 162 olay, plan, varyantlar) bitti; B1 söküm başlayabilir | Söküm listesini bugünkü main'de yeniden ölç | Mert: G8 (6 temel model sorusu, önce sohbet), G9 (varyant) |
| Mert'in oturumları | `6fbc961d…` Test kuralları · `1d276368…` Dev sunucusu · `6295bf94…` Devir testi | `KOORDINATOR.md` §6 | Yönetilmez, uyandırılmadı; iş kalemi yok | — | — |

## 3. Mert'in karar vermesi gerekenler (birleşik liste)
1. **Workflow kararlarının yazılması ve açık noktaları** (`WORKFLOW-KONUSMASI.md` §3) ve ana klasördeki 14 silinen dosya.
2. **Giriş modeli** (EKRAN-16; işi durduran tek soru) + marka seçimleri.
3. **EKRAN-02:** tek tablo + C2 bakışı (S2, G13).
4. **EKRAN-10 General:** neyi beğenmedi (yeni tur), G2, G3 saat dilimi.
5. **EKRAN-10 Jobs:** 4 kapsam sorusu.
6. **EKRAN-08:** 2 varsayım.
7. **BILDIRIM:** G8 (6 soru), G9 (varyant).
8. **EKRAN-01:** S24, S25, #86–#88 görsel.
9. **SABAH-SORULAR'daki geri kalan:** G11 (BL-821), G14 (BL-968), S4–S23.
10. **GUVENLIK-A:** GA-3 için ücretli `/code-review ultra`; yarım kalmış 4. soru.
11. **Temizlik ve makine:** uzak dal silme listesi, `C:\Users\TheWe\.codex` silme (HATIRLATMALAR), Studio kapatma, vmmem, OTOMASYON-4 testi 2026-10-11.
12. **Para / CI:** GitHub ücretsiz 2.000 dk → dakika başı; tavan; public repo.

## 4. Canlı veritabanı (main'de olmayan ya da bekleyen)
- Canlıda olup main'de olmayan: **GA-2** `20261008133054` (`GUVENLIK-A.md` §7).
- Canlıya gitmeyi bekleyen: `20261008111800` (silen, Requests; yedek hazır), EKRAN-01 #12 ve #38 (ekleyen), BL-969 migration 1 ve 2 (ölçüm şartlı).
- Yedek yerleri her notun §7'sinde.

## 5. Bilinen riskler
- Main kırmızıyken hiçbir şey main'e gitmiyor (eski kural); yeni karar ("aynı bilinen test" istisnası) yazılmadı.
- Oturumların çoğu bir kez sıkıştırıldı; bağlamları %15–55 arası tahmin (notların §10'u).
- Bazı kaynaklar yalnız geçici klasörlerdeydi → yedeklendi (`devir-yedek-2026-10-08\scratchpad\`).
- Koordinatörün 17 kayıt commit'i main'de değil; bu dal da main değil. Yeni koordinatör ilk iş bunları main'e almalı (belge; CI başlatmaz).

## 6. Korunan dosyalar (notların temizlik bölümüne göre, 2026-10-08 ~23:00Z; yalnız kopya, asılları yerinde)
| Notun dediği | Yapılan |
|---|---|
| EKRAN-08: ekran görüntüleri yalnız uygulama worktree'sinde; silinmeden önce `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-08-CEKMECE\`'ye | 54 dosya oraya kopyalandı (`diff -rq` aynı); ayrıca `devir-yedek-2026-10-08\EKRAN-08-worktree-artifacts\` |
| EKRAN-02: `ekran-02-pkg` worktree'si silinmeden önce `artifacts\ekran-02\pkg\live-backup\` taşınmalı (111800'ün yedeği) | 13 dosya `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\ekran-02\`'ye kopyalandı (aynı); ayrıca `devir-yedek-2026-10-08\EKRAN-02-pkg-artifacts\` |
| PARALEL-1: `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-965-artifacts` (BL-965 canlı öncesi yedeği) arşive | 12 dosya `devir-yedek-2026-10-08\bl-965-artifacts\`'e kopyalandı (aynı) |
| Geçici klasördeki kaynak ve betikler kaybolabilir (EKRAN-01, -02, -03, -08, -16, EKRAN-10 ×3, GUVENLIK-A, PARALEL-1, BILDIRIM) | 11 oturumun geçici klasörü `devir-yedek-2026-10-08\scratchpad\<oturum>\`'e kopyalandı (172 MB) |
| Oturumların `artifacts\devir\` notları (worktree silinince gider) | Bu klasöre aynen alındı |

Kod düzeyinde "taşınmalı" denenler dosya işi değil, yeni koordinatörün işi: PARALEL-1 §4 (UZUN satırı ve NF_OVERRIDE yedeği `task/bl-987`'den yeni dala), BILDIRIM §8 (K1/K2 bakım işleri bildirim işçisi silinmeden önce yeni zamanlayıcıya), EKRAN-10 General §9 (kaynak `newfork-pages`'e alınacaksa).
