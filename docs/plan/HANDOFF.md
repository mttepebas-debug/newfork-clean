# Koordinatör devri — 2026-10-05 gece (UTC)

- **Devreden:** "Koordinatör" `local_9c7e674a-3796-486f-a7f7-613c4ce0c02e`. cwd ana klasör; kayıt işleri `../newfork-wt/coord` worktree'sinde. Bağlam %53, iş sınırında devrediyor.
- **Devralan:** Mert'in açacağı yeni oturum. Güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir (`get_session self`).

## 0. Yön (en önemlisi)
- **Aktif plan: ekran ekran ilerleme** — `docs/plan/EKRAN-PLANI.md` (Mert, 2026-10-05, KK-157; CLAUDE.md §1 güncellendi).
  - Bir ekran seçilir, dört alt ajanla keşfedilir (şablon planda), bulgular `docs/plan/ekranlar/<no>-<ekran>/` altına kaydedilir.
  - Mert kararları verir; ekran komple biter, sonraki ekrana geçilir.
  - "Komple" bitmeye ekranın eski açık backlog maddeleri de dahil.
- **Ekran 1 — Schedule: keşif ve kararlar bitti** (durum "karar"). Sıradaki iş görev dosyası `docs/plan/tasks/EKRAN-01-SCHEDULE.md`.
  - **Kaynak:** `docs/plan/ekranlar/01-schedule/OZET.md` (7 grup, önem sırasıyla). Mert'in kararları özetin "Mert'in seçimleri" bölümünde ve KARARLAR → Schedule'da (6 madde).
  - **İlk grup veri kaybı ve düzenleme oturumu:**
    - D-Y2 hareketsizlik: yeni kural, 15 sn geri sayım + otomatik "auto-save" kurtarma taslağı;
    - D-Y1 Undo sunucuda geri alır;
    - D-Y3 kilit erken düşüyor, D-Y4 yenilemede boş taslak, D-Y5 iki yöneticinin işi birbirine biniyor;
    - B-1/2/3 başka lokasyonun taslağı ve canlı kanal (R3: `nf-db` + `nf-guvenlik`);
    - Overwrite (yalnız şablonun lokasyonları, başlamış vardiyaya dokunmaz, iki tık).
  - **Mert'in sürükleme isteği (özette):** sürüklerken kabul eden hücre yeşil, etmeyen kırmızı yanar. Gerçek uygulamada altyapı var (`data-drop-status`, `ScheduleRow.tsx:341`, `styles.css:5841`), prototipte `drop-allowed` / `drop-blocked` (`newfork-prototype/parts/schedule.js`). Hangi sürüklemede eksik olduğu ölçülecek.
  - **Delegasyon önerisi:** iş büyük ve R3 parçalı; rol oturumlarına bölünmeli (ör. `nf-db` B-1/2/3 + Overwrite + D-Y5 sunucu tarafı; `nf-arayuz` / web D-Y1–Y4, erişilebilirlik ve cilalar). Aynı dosyada iki oturum çalışmaz: `SchedulePage.tsx` sıcak nokta.
- **Ekran 2 — Requests: keşif ve kararlar bitti.** Sıradaki iş görev dosyası.
  - **Kaynak:** `docs/plan/ekranlar/02-requests/OZET.md` (§1 tek liste, §6 FB-6.4 plan düzeltmeleri, §10 seçimler); KARARLAR "Schedule → Requests"e 7 satır; KK-158.
  - FB-6.4 Takas bu ekranın işi (R3, `nf-guvenlik` zorunlu).
  - Ayrı ekran oturumunda yürüdü (Mert'in isteği, P17).
- **Görsel kararlar (gerçek ekranda varyant, P04):**
  - Schedule: BL-445 (üst çubuğun dar penceredeki hâli), BL-524 (ad sütunu simgesi), BL-525 (renk körlüğü için şekil farkı), BL-441 (Publish'te hangi özet kalsın), C-D11 (tek lokasyonda Pazar görünmüyor), C-P2 (telefon düzeni).
  - Requests: G1–G4 ve S7 (arama kutusu kenarı; Mert "ikisini yan yana göster" dedi).
- **CI işi:** BL-562 (50 ms testi CPU paylaşımından düşüyor; kök neden maddede, `06a74d5a`) yalnız main'i kırarsa araya girer.

## 1. İlk işler
1. Worktree: `git -C ../newfork-wt/coord fetch origin` ve `checkout --detach origin/main`. Oku: `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md`, `docs/plan/EKRAN-PLANI.md`.
2. Posta kutusu: `node scripts/inbox.mjs claim` çıplak komut olarak (bileşik komutta hook tanımaz), sonra arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Kilit kimliği `rol/oturum` biçiminde (ör. `koordinator/ops`).
3. Kendini "Koordinatör" yap, sabitle, Remote Control aç.
4. **Ana klasör kirli:** `nf-guvenlik` alt ajanı hafıza notlarını ana klasöre yazdı (`.claude/agent-memory/nf-guvenlik/MEMORY.md` + iki `checklist-*.md`). İçerik main'de (`b5c2fa31`). Ana klasörde `.claude/` silme/geri alma oturumdan reddediliyor; Mert'e şu komut verildi:
   `git restore .claude/agent-memory/nf-guvenlik/MEMORY.md && rm .claude/agent-memory/nf-guvenlik/checklist-bulk-path-skips-single-guards.md .claude/agent-memory/nf-guvenlik/checklist-grep-count-and-id-leak.md && git merge --ff-only origin/main`.
   Ana klasör `e929abc7`'de kaldı; komut koşulmadıysa hatırlat.
5. **Oturumlar:**
   - "EKRAN-02 Requests ekranı keşfi" `local_47a5c079-bbdb-4533-a9d3-6fb7062efea7`: boşta, Opus xhigh, RC açık. Uygulamanın açtığı yer eski koordinatör worktree'si (`.claude/worktrees/handoff-koordinatorlugu-20c0b3`, dal `claude/great-villani-dfeb2f`). Raporları main'de. Requests uygulaması için temizlenip yeniden kullanılabilir (OPS-07).
   - Önceki koordinatör `local_b9b956a0…`: arşivi Mert'e bırakıldı.
   - "Dev server başlat" `local_6c7d4ec5…`: Mert'in kendi oturumu, dokunma.
6. **Main CI:** son kod koşusu 37360408243 (`086449dd`) yeşil. Sonrasında yalnız docs ve `.md` gönderimleri oldu (CI tetiklenmez).

## 2. Bu oturumda main'e girenler (hepsi docs)
- **BL-562 kök neden ölçümü** (`06a74d5a`): boşta okuma 21–24 ms (değişmedi); CI'da yük altında en iyi okuma 50–65 ms.
- **Ekran planı ve keşif şablonu** (`20fa9282`, `e929abc7`).
- **Schedule:**
  - keşif raporları, özet, 5 bayat madde kapanışı, BL-552 → BL-685 birleşmesi (`b5c2fa31`);
  - kararlar + CLAUDE.md + ILKELER kanıtları (`82108918`).
- **Requests:** raporlar (`1bcc64cb`, ekran oturumu); kararlar + KK-158 + sürükleme isteği (`d65737b7`).

## 3. Mert'e açık sorular
- **Görsel kararlar:** yukarıdaki liste.
- **Önceki devirden hâlâ açık:**
  - `*state.json` (yerel Supabase oturum anahtarları) silinsin mi;
  - deneme artifact'i (MAhawwnF…) ve `newfork-prototype-stage` silinsin mi;
  - üç eski worktree klasörü artığı (`agent-aeafa368…`, `agent-ab68e51d…`, `agent-a77cae19…`) silinsin mi.

## 4. Dersler (bu devir)
- **Alt ajanın transkripti:** `tasks/<id>.output` bu makinede boş. Gerçek transkript `~/.claude/projects/<proje>/<oturum>/subagents/agent-<id>.jsonl`. Son mesajı repoya almak için ufak bir node betiği yeterli: JSONL'de son `assistant` metni.
- **Takılan komut:** girdisiz `cat > dosya` komutu takılır. Betik dosyası Write aracıyla yazılmalı.
- **Kilit:** guard `main.lock`'u komut koşmadan önce denetliyor; kilit ayrı bir komutta alınır.
- **Alt ajanın ana klasöre yazması:** izolasyonsuz alt ajan (ör. `nf-guvenlik`) ana klasöre hafıza yazabiliyor. Görev mesajına "hafıza notunu raporuna yaz, dosyaya yazma" eklenmeli.
- **Soru kurmak:** Mert seçenek dışı cevaplarda kural koyuyor (bu turda 3 kez). Örnek, ölçüm ve "bugün tam olarak ne oluyor" anlatımı soruyu kolaylaştırıyor; Mert bir soruda ayrıntılı anlatım istedi.
