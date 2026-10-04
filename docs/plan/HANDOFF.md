# Koordinatör devri — 2026-10-04 gece

Devreden: "Koordinatör" `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` (worktree `.claude/worktrees/optimistic-dewdney-c78421`); bağlam dolu, AVAIL-002 kapandıktan sonra temiz sınırda devrediyor.
Devralan: `local_863130bd-957d-498b-9dfb-71a39090e29e` (havuzdan seçildi) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.** Devralan ilk turda `get_session self` ile ölçer, kayıt oturumuna besler.

## 0. Mert'in durumu ve iletişim
- Mert PC başında; tıklamalı sorular (AskUserQuestion) ve §13 şablonu. Kişi adlandırması: Lokasyon+Pozisyon+N (KadıköyMüdür1, KadıköyGarson1, Owner1).
- Mesaj teslimi bu devirde çalıştı (`send_message` "delivered"/"queued"); kısa kimlik (`local_91ac4f8d`) "not found" verir, tam kimlik kullan.
- Mert'in terminalinde Run düğmesi her komutu yeni sekmede, devreden koordinatörün klasöründe başlatır: `cd` taşınmaz. Hosted komutlarında `npx supabase --workdir <klasör> ...` kullan (bu devirde böyle çalıştı).
- Mert kayıt oturumunun penceresinde de ekran kararları veriyor; kayıt oturumu onları KARARLAR'a yazıp koordinatöre iletiyor.

## 1. İlk işler
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` (çıplak, zincirsiz), arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000).
3. Kendini "Koordinatör" yap, sabitle, RC aç.
4. Kayıt-20'ye (`local_d96f34f3-0d4a-4e84-a44b-6b653641d258`) "yeni koordinatör <kimlik>" beslemesi.
5. Devreden `local_abc4d126…` OPS-07 ile temizlenecek: commit'i yok, worktree temiz (bu dosya hariç her şey main'de). Ona "kendini temizle" mesajı gönder.

## 2. Süren işler
### DOC-TABLE (Settings → Documents tablo + Notifications tablo) — düzeltme turu Mert'in onayını bekliyor
- İlk tur bitti: `nf-arayuz` subagent, dal `worktree-agent-aeafa368ff57306a2`, worktree `.claude/worktrees/agent-aeafa368ff57306a2`, commit'ler `5d039ff5`, `b2e0f146`, `48d5ab25`, `632a41c0` (rol hafızası). Push yok, main'e ALINMADI. Rapor: inbox done `20261004T221608-nf-arayuz-doc-table-doc-table.md`; görüntüler `artifacts/nf-arayuz/doc-table/`. `e2e/flows/documents.spec.ts:59`'a `.first()` eklendi, e2e koşulmadı.
- Kararlar: KARARLAR Ekran kararları → Settings "Settings → Documents listesi tablo olur…" ve "### Notifications (gelen kutusu)" (Bildirimler A).
- **Mert ~22:20Z düzeltme verdi (kayıt-20 penceresinde):** (1) Notifications: kategori sekmeleri tek açılır liste; sekmeler yalnız Read / Unread; çoklu seçim + "Mark as read"; satırdaki yuvarlak okundu topu kalkar (sil kalır); Select all / Deselect all. (2) Bu sayfalarda başlık yeşil noktalı `CatalogPageHeader`'a döner (Settings → Documents dahil), altında ayraç çizgisi. (3) Sağ üst düğme işlevine göre adlı, yer ve boyut standart (sekme/sayfa geçişinde kaymaz). Görsel: https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK ("… · standart", "Notifications · Unread / Read…").
- Kayıt-20'nin önerdiği ayrıntılar Mert onayını bekliyor (220×40 düğme aynı yerde, adlar Add document type / Mark all as read / Add announcement / Add important date, Read sekmesinde "Mark as unread", Unread varsayılan + sayı, Settings → Documents üst yazısı "SETTINGS"). Onay gelince kayıt-20 KARARLAR'a yazıp iletir → düzeltme turu AYNI dalda (yeni `nf-arayuz`, aynı worktree), sonra `nf-gorsel-qa` (ilk QA eski tasarımı ölçtüğü için durduruldu), sonra main (R1/R2; tam kapı + documents e2e).
- Yolda bulunanlar backlog'da: BL-591 (boş sekme metni), BL-592–594.

### FB-6.7 Duyurular — yeniden planlanacak (veri önce)
- Mert 2026-10-04: "yeni kurallar korunur ve ona göre veri tarafı hazırlanır" → duyuru kısmı yeni kurallarla yeniden planlanır: önce `nf-db` + `nf-backend` (durum kümesi, sabit kişi listesi, onay anahtarı + rütbe, olay geçmişi, hatırlatma, yayın hatası bildirimi; R3), sonra web. Yayınlayan = yayın anındaki rol; saati silinen zamanlanmış duyuru draft'a döner. KARARLAR K19–K26 + ekler (`87e76422`), FB-6.7 Notes.
- Announcements ve Important Dates boş hâli (açık zemin + simge + yazana düğme) FB-6.7 içinde yapılacak (`48d38f52`, `a09b107d`).
- Konuşulmayan başlıklar (yeni pencerede): Başlık 2'nin kalanı, 3 önemli tarih, 4 kapalı gün, 5 yayından sonra değişen müsaitlik, yayın/bitiş saati mantığı (3c, önce gelsin önerisi), çalışanın duyuruyu pencere açmadan görmesi. Kaynak rapor: inbox done `20261004T211002-isci-2-nf-arayuz-fb-6-7-davranis.md`.
- Dal `task/fb-6.7-ui` (@1d1b4325 + işçi 3 @4d9226cc) eski kurallarla; akış taslağı güncellenecek.

### Belge mimarisi — raftan iniyor
- Mert: karma akış (Add employee → Documents adımı, muafiyet, kişiye özel istek); önce iki ön koşul. Kaynak: inbox done `20261004T211002-isci-2-nf-arayuz-belge-karma.md`, taslak https://claude.ai/artifact/PSSd8Nxgbe8BjY78oCkJim. Sıra Mert'le belirlenecek. BL-560 ilk iş.

### Sıradaki önerilecekler (önem sırasıyla)
1. **BL-562 kök neden** (leave: high / do: moderate): `schedule_grid_read_budget` (50 ms) üçüncü kez yük altında düştü (CI 37239720794, yalnız düşen iş yeniden koşunca yeşil). Not-meta (`20261007030000`) ızgara okumasına dokundu → boşta ölçüm şart.
2. FB-6.7 veri tarafı planı.
3. FB-6.4 Takas (görev dosyası main'de, `f5b542bf`; AVAIL-002 bittiği için önü açık).
4. Belge karma akışı ön koşulları.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Kayıt-20 | `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` | aktif, sabitli |
| Koordinatör (yeni) | `local_863130bd-957d-498b-9dfb-71a39090e29e` | devralıyor |
| Koordinatör (eski) | `local_abc4d126…` | temizlenecek (OPS-07) |
| FB-6.7 davranış (işçi 2) | `local_1628762e…` | rapor verdi, bekliyor; bağlamı ~%80 |
| FB-6.7 uygulama (işçi 1) | `local_9f1bbd26…` | durdu, dal `task/fb-6.7-ui` |
| FB-6.7 akış artifact'i (işçi 3) | `local_575ba63c…` | beklemede |
| Marka design dili | `local_5ffce2bb…` | BRAND işi (BL-586–589 onun) |
| Havuz "(havuz) boş" | `local_91ac4f8d…`, `local_10a5177a…`, `local_d8686bdf…`, `local_e4bbe6fe…` | boş |
| Rol: nf-guvenlik | `local_7dfbe7d3…` | boşta |
| Mert'in oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç", "Fotoğrafları karşılaştır…" | dokunma |

Dallar: `task/avail-design` (@8066c66a, müsaitlik tasarım taslakları; worktree `newfork-wt/avail-design`) duruyor — silinsin mi Mert'e sorulmadı.

## 4. Dersler (bu devir)
- `git worktree remove` uzun yolda "Directory not empty" ile yarım kalır → PowerShell `Remove-Item -LiteralPath '\\?\…' -Recurse -Force`, sonra `git worktree prune` (§11.10). Fact-forcing hook destructive komuttan önce 3 bilgi ister.
- Yerel `test:db` ortak DB kalıntısıyla kırmızı verebilir (BL-590: `bl052_document_*` "null notification_key"); CI sıfırdan kurulan DB'de karar verir.
- Main'e kod gönderimi koşan main CI'ı iptal eder; başka oturumun docs push'u da senin CI'ını iptal edebilir — en son koşuyu izle.
- e2e "fazla düzgün" geçen senaryo hatayı gizleyebilir: vardiya testleri hep varsayılan 9:00'ı yazdığı için TimeInput yapıştırma hatası görünmüyordu; artık `openAddShift` yazılan saati doğruluyor.
