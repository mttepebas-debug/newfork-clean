# Koordinatör devri — 2026-10-05 akşam (UTC)

Devreden: "Koordinatör" `local_b9b956a0-10ef-4fc4-94c3-5ae26e8b6f6b` (worktree `.claude/worktrees/handoff-koordinatorlugu-20c0b3`); bağlam %62, iş sınırında (BL-606 main'de) devrediyor.
Devralan: Mert'in açacağı yeni oturum — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir** (`get_session self`).

## 0. Mert'in durumu ve yön (en önemlisi)
- **Prototip DURDU** (Mert, 2026-10-05 ~18:30Z, KK-156): "koordinator hariç bütün sessionları kapat. prototipi oldugu gibi bırak gerçek uygulamada geliştirmeye devam etmek istiyorum. çok vakit kaybettik". Prototip işi açılmaz; "oturumları meşgul tut" kuralı geçersiz (hafıza `keep-sessions-busy-prototype`).
- **Yan oturum yok.** Koordinatör dışındaki 19 newfork-clean oturumu arşivlendi (worktree'ler önce ölçüldü). Kayıt oturumu da kapandı: **kayıtları (BACKLOG, KOORDINATOR-KARARLARI, DONE) koordinatör yazıyor.** Kısa işler alt ajanla (`isolation: worktree`); yeni kenar çubuğu oturumu açmadan önce Mert'e sor.
- "Prototip: Settings eşitleme" (`local_863130bd…`) arşivlenemedi (uygulama "kullanıcı için tutuyor"); Mert kenar çubuğundan kapatacak.
- Mert PC başında; tıklamalı sorular (§13 şablonu). Kısa ve hızlı ilerleme bekliyor.

## 1. İlk işler
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku. Yeni worktree'de `pnpm.cmd install` + `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`.
2. `node scripts/inbox.mjs claim` (çıplak komut), arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Yan oturum olmadığı için posta kutusu sessiz kalabilir.
3. Kendini "Koordinatör" yap, sabitle, RC aç.
4. Main CI'a bak: devir anında son kod koşusu 37360408243 (`086449dd`, BL-606 + BL-607) yeşildi; bu devir notunun docs gönderimi ondan sonra.
5. Devreden `local_b9b956a0…`: commit'leri main'de; worktree'sinde yalnız commit'lenmemiş 4 eski `.claude/agent-memory/nf-guvenlik/*` kopyası var (main'deki daha yeni; commit ETME). Arşivini Mert'e bırak.

## 2. Bugün gerçek uygulamada bitenler (main'de)
- **BL-607** (`ba653646`): Schedule "Keep editing?" penceresinde SAVE çalışıyor; metin "No activity for 15 minutes.", çubuk 300 sn. `useEditIdleTimer` artık `{ secondsRemaining, keepAlive }` döndürüyor; uyarı açıkken sayfa hareketi zamanlayıcıyı sıfırlamaz.
- **BL-606** (`021da39d`, alt ajan nf-arayuz, koordinatör ONAY @`42a092d2`, R1): K17 "Confirm once per editing session" — kapalı gün onayı düzenleme oturumunda bir kez; `apps/web/src/schedule/lib/closedDayAnswer.ts`. Yolda: **BL-685** (low/safe, `confirm_scope` alanı web'e ulaşmıyor).
- Tam kapı iki gönderimde de yeşil (lint, typecheck, test — web 232 dosya —, build). Main CI: 37359265187 (BL-607): check yeşil, e2e yeni gönderimle iptal, **db kırmızı yalnız `schedule_grid_read_budget.test.sql` test 2 "within 50 ms"** (e2e ile aynı anda; tam BL-562; değişiklik yalnız web, `supabase/` dokunulmadı). **37360408243 (`086449dd`, ikisi birlikte): YEŞİL — e2e, check, db üçü de success (2026-10-05 ~19:30Z).** Bütçe testi bu koşuda geçti; önceki düşüş yükten (BL-562).

## 3. Sıradaki (devir notu sırası; her biri tazelik ölçümüyle)
1. **BL-562** — Schedule ızgara 50 ms bütçe testi CI'da e2e ile aynı anda koşunca düşüyor (`supabase/tests/schedule_grid_read_budget.test.sql` test 2). Kök neden maddede.
2. **FB-6.4 Takas** (+ A2 rütbe kuralı, 19 puan; görev dosyası `docs/plan/tasks/FB-6.4*.md`). R3: `nf-guvenlik` zorunlu.
3. **Yayın öncesi güvenlik paketi** (ILERLEME-PLANI §8): A4 hosted e-posta ölçümü → A5 SSN metni → A1 BL-232 + BL-178 (R3, ultrareview önerisi) → A2 → A3 BL-351. Tasarımlar posta kutusu done: `20261005T080542-nf-guvenlik-sec-a1-tasarim.md`, `20261005T131114-nf-guvenlik-sec-a2-a3-tasarim.md`.
- Backlog: BL-685'e kadar; high 12, critical yok (2026-10-05, kayıt-21 ölçümü + BL-685).
- Program FOUNDATION-B Aşama 6–7 %69,8 (183/262), program %76,8 (261/340) — KK-146 sonrası (kayıt #200).

## 4. Prototip (durdu — yalnız bilgi)
- Artifact'ler (özel): "Newfork Desktop" https://claude.ai/artifact/VWK5TmCgVvicJ7EKoLcDCx (sürüm 2, masaüstü) ve "Newfork Phone" https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK (sürüm 38, 4 telefon panosu). Duyuru akışı https://claude.ai/artifact/QQbm6M5GghTPYLHcCHEBP3 (sürüm 7; v8 yayın reddi çözülmedi, deneme artifact'i https://claude.ai/artifact/MAhawwnFUcLTb7J8nqapyf).
- Kaynak: `C:\Users\TheWe\Documents\Codex\newfork-prototype` (KANONIK.md); dondurulmuş kopyalar `newfork-clean\artifacts\prototype` ve kayıt-20 scratchpad'i; hazırlık kopyası `newfork-prototype-stage`. Yayınlanmamış biten iş: PROTO-ESIT-P4 (kanonik klasörde).
- Prototipte bulunan gerçek uygulama hataları backlog'da (BL-606–684 arası). Prototip cilalarının gerçek uygulamaya taşınması: BL-618 (park).
- Prototip konusu açılırsa Mert'e sunulan öneri: prototip yalnız tasarım defteri; %100 eşitleme yok; fark listesi + "taşı/bırak".

## 5. Mert'e açık sorular (prototip durduğu için çoğu bekler)
- `*state.json` (yerel Supabase oturum anahtarları: SCR 10, `artifacts\prototype` 8, `newfork-prototype` 0) silinsin mi — geri alınamaz, Mert onayı.
- Deneme artifact'i (MAhawwnF…) ve `newfork-prototype-stage` klasörü silinsin mi.
- Üç eski worktree klasörü artığı (`.claude/worktrees/agent-aeafa368ff57306a2`, `agent-ab68e51d5764faab9`, `agent-a77cae19a6eca8acb`; git'ten çıkmış, `.git` yok) silinsin mi.
- Prototip yeniden açılırsa: Export e-posta varyantı A/B, liste çerçevesi boyu (E9), akış v8 yolu, "Couldn't publish" bildirimi, gerçek e-posta (E-9006, E-7001).
- Uygulama beklerken sorulmayanlar (backlog "karar gerekir"): BL-628, 644, 646, 652, 667, 671, 679, 680; FB-6.4 owner takas vakası.

## 6. Dersler (bu devir)
- `artifacts/` ana klasörün içinde: worktree oturumları oraya Write/Edit ile yazamıyor (hook). Ortak çalışma klasörü repo dışında olmalı.
- `robocopy /MIR`'i kuru koşu (`/L`) olmadan çalıştırma: hedefte başka oturumların 1609 dosyasını silecekti.
- Yarım iş aynı klasördeyken yayın: ayrı hazırlık kopyası (taban + yalnız biten işin dosyaları) — KK-154.
- Arşiv, worktree'yi siler: önce her worktree'de `status --short` + `git cherry origin/main HEAD`.
- Komut döngüsünün son satırı (`[ $rc -ne 0 ] && break`) başarıda 1 döndürür; "failed" bildirimi ölçüm hatasıydı — adım adım `exit=` satırlarına bak.
