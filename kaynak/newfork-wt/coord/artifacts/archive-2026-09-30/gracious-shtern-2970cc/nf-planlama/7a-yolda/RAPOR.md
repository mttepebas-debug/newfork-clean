# nf-planlama — `.7a` yolda bulunanlar (2026-09-30)

Dal `task/backlog-program-19`, taban `origin/main` `3da79335`, commit **`98f17a6a`** (push yok).
Worktree `.claude/worktrees/gracious-shtern-2970cc`.

## 1. Nerede duruyor
Bitti. Dört bulgu işlendi: üçü yeni madde, biri yalnız bilgi notu. Açık madde 221 → 224.

## 2. Ne yapıldı (etkisi)
Önce var olan maddeler tarandı (BL-365, BL-243, BL-195; auth, `world.test`, GoTrue araması). Hiçbiri bu bulguların
aynısı değil; en yakın ikisine (BL-365, BL-243) karşılıklı bağlantı notu eklendi. Her iddia `.7a` dalında
(`task/fb62-core-b-7a` @`3dee00d5`) kodla doğrulandı.

- **(a) → BL-402 (low / safe), G7 `.8`, `nf-arayuz`.** Employees → kapsam dışı kişinin çekmecesi: sağda erişim-yok
  kartı var, ama soldaki sütun ("Employee details", "Code assigned on save") ve sekmeler hâlâ çiziliyor.
  Kanıt: `apps/web/src/employees/EmployeeDrawer.tsx:816-831` (sütun her durumda), `:971-975` (erişim-yok dalı).
- **(b) → BL-403 (low / safe), G7 `.8`, `nf-arayuz`.** Schedule'da çalışanı okuma izni olmayan için kişi adı tıklanınca
  bir şey açmıyor ama düğme gibi görünüyor. Kapı yalnız işleyicide (`SchedulePage.tsx:2650`, `:3161`, `:3237`;
  `scheduleGates.ts:22`); ad her zaman düğme (`ScheduleEmployeeCard.tsx:61-72`). **Ek bulgu:** Availability'de aynı
  durumda düğme pasif (`AvailabilityPage.tsx:248`), yani iki ekran farklı dil konuşuyor. Çare Availability'ye uymak.
- **(c) → BL-404 (low / safe), G13, `nf-db` (builder sahibi).** Rapor "hesap SQL ile kurulmuş olmalı" diyordu;
  **kök neden bulundu:** `tests.user` hesabı NULL token sütunlarıyla ve parolasız kuruyor (`supabase/test-support/builder.sql:108-114`);
  auth sunucusu NULL token'ı okuyamayıp 500 veriyor. Token'ları yalnız `tests.password` boşaltıyor (`builder.sql:550-561`)
  ve e2e dünyası parolayı altı kişiye veriyor, owner'a vermiyor (`e2e/global-setup.ts:23-42`). **Bugün kırık bir test
  yok:** owner girişi isteyen spec kendi parolasını veriyor (`ownership-transfer-password.spec.ts:42`). Tuzak yalnız
  yanlış hata (400 yerine 500). Yerel DB (salt SELECT, 2026-09-30): `@world.test` owner hesaplarının 169'undan 168'inde
  `confirmation_token` NULL; diğer 808 hesabın 7'sinde.
- **(d) → madde yok, G7 satırına bilgi.** Employees listesinin kurulum bitmeden 404 vermesi eski rota kapısının yan
  etkisiydi; artık liste sunucunun cevabı, owner'dan gizlenen bir şey yok. Kusur değil.
- **G7 satırı:** "`.7a` dal `task/fb62-core-b-7a` @`3dee00d5`, `nf-guvenlik` + görsel QA sürüyor" + BL-402/403/404 ve (d) notu.
  G13 satırına BL-404. Notes / Result'a 2026-09-30 satırı.

## 3. Açık kalan ve nedeni
Yok. BL-402 ve BL-403'ün satır numaraları `.7a` dalından; `.7a` main'e girince (T5b `.4` ile) yeniden ölçülür.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- `.7a` main'e girince: BL-365 ve BL-243 kapanışı, BL-402/403 satırlarının main'de yeniden ölçümü.
- BL-403, `.8`'in görsel işine doğal olarak eklenir (aynı `nf-arayuz` turu, aynı ekranlar).

## Ek — `nf-guvenlik` `.7a` ONAY (ikinci commit **`52ae789f`**)
- G7 satırı: "`nf-guvenlik` ONAY @`3dee00d5`, görsel QA sürüyor" + D1/D3 notları.
- **D1** (sıra şartı) → G7 notu; çözüm KK-31'deki sıra (`.7a` `.4` ile aynı turda ya da sonra). Madde yok.
- **D2** → yeni **BL-405 (medium / risky)**, G7. Hosted'la ilgili açık madde yoktu (BL-265 benzeri bir gönderimdi, kapalı),
  bu yüzden yeni madde açıldı. Doğrulama: zorunlu `allowed` `packages/shared/src/index.ts:2630-2637` (`.7a` dalı); onu üreten
  `get_employee_detail_service` `supabase/migrations/20260930121000_employees_reads_ask_the_core.sql:174` (main `4d430d6c`).
  Main'de 2026-09-29'dan beri 12 migration var; **canlıdaki son migration ölçülmedi** (canlı okuma koordinatörün MCP'si,
  OPS-03). "Kullanıcıya dönüşte"ye "Hosted bekleyen — BL-405" satırı eklendi. `docs/plan/HANDOFF.md` §5 madde 4'e
  (koordinatörün hosted listesi) dokunmadım, oraya BL-405'i sizin eklemeniz gerekiyor.
- **D3** (403'te `reason`/`detail`) → G7 notu, madde yok.
- Sayım: açık **225** = program 225, en yüksek BL-405.

## Kanıt
- `python say.py .` (devir notu §4 betiği): `acik 224 numarali 195 numarasiz 29 program 224 kopya []`, farklar ve kesişim boş, en yüksek BL-404.
- `git diff --stat 3da79335 98f17a6a`: `docs/plan/BACKLOG.md` +5, `docs/plan/tasks/BACKLOG-PROGRAM.md` +3/−2.
- Yazılan dosyalar: `docs/plan/BACKLOG.md` (BL-402, BL-403, BL-404; BL-243 ve BL-365'e birer not), `docs/plan/tasks/BACKLOG-PROGRAM.md` (G7, G13, Notes / Result).
