# nf-planlama — FB-6.2 T5b-4 onayı ve nf-guvenlik raporlarının son taraması (2026-09-30)

Dal `task/backlog-program-22`, taban `origin/main` `a90aa7c4`, commit **`b4713666`** (push yok).

## 1. Nerede duruyor
Bitti. Açık madde 232 → 234. `nf-guvenlik` worktree'si silinebilir: dört FB-6.2 raporunda kayda geçmemiş bulgu kalmadı.

## 2. Ne yapıldı (etkisi)
- **G7 satırı:** T5b-4 ONAY @`e993bbed` (dal `task/fb62-core-a-t5b-4`); şart dal CI 36616977093 **yeşil** (`gh run view`,
  2026-09-30). T5b toplu dalı `task/batch-t5b` CI 36617252746 (`82371296`) yazılırken **koşuyordu**.
- **D1 → BL-413 (low / safe), `nf-backend`, `.7b`/FB-6.8:** Workspace ana sayfasının dört API rotası (pano, düzen,
  to-do oluşturma, to-do kapatma) `workspace.read` + `role === "employee"` kapısı taşıyor
  (`apps/api/src/communications/communication-routes.ts:256`, `:282`, `:314`, `:345`). D1 yalnız iki to-do rotasını
  saymıştı; aynı kalıp pano ve düzen rotalarında da var, maddeye dördü yazıldı.
- **D2 → KARARLAR DATA-08:** "`effect` yalnız kapsam kuralını seçer; kısıtlı üye ve izin kararı onu okumaz", KK-34 ve
  migration `20260930172000_the_todo_list_asks_the_core.sql` bağlantısıyla; kısıtlı üyeye açmanın yolu eylem başına `restricted_ok`.
- **Arşiv öncesi tarama** (`fb62-7a`, `fb62-t5b`, `fb62-t5b-3`, `fb62-t5b-4`): tek kayıtsız not bulundu —
  T5b §2 (`fb62-t5b/RAPOR.md:89-90`): davet API rotaları hâlâ `employee_access.manage` soruyor → **BL-414 (medium / moderate), `.7b`**.
  Main'de doğrulandı: `apps/api/src/app.ts:549`, `:598`, `:644`, `:699`. Etkisi: çekirdek yöneticiye kendi lokasyonunda
  davet izni verse de yönetici API'den 403 alıyor (kırılma değil, kural ayrışması). Diğer bulguların hepsinin kaydı var
  (Y1/O1/O-2/D-a/D-c kapandı; D-b KK-17; D-d BL-401; `.7a` D1–D3 G7/BL-405; T5b-3 KK-32, KK-34, BL-409…412).

## 3. Açık kalan ve nedeni
- `task/batch-t5b` CI sonucu yazılmadı (koşuyordu). Yeşil biterse G7 satırına eklenir.

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- T5b toplu turu main'e girince: BL-187, BL-155, BL-354 (dalda), BL-365 ve BL-243 (`.7a`) kapanışları; BL-402/403 main'de yeniden ölçüm; önce BL-405 (canlı gönderim, kullanıcı).
- BL-413 ve BL-414 `.7b` görev metnine eklenmeli (koordinatör).

## Kanıt
- `python say.py .`: `acik 234 numarali 205 numarasiz 29 program 234 kopya []`, farklar/kesişim boş, en yüksek BL-414.
- `gh run view 36616977093` → `task/fb62-core-a-t5b-4 e993bbed completed success`; `36617252746` → `task/batch-t5b 82371296 in_progress`.
- Yazılan dosyalar: `docs/plan/BACKLOG.md` (BL-413, BL-414), `docs/plan/KARARLAR.md` (DATA-08), `docs/plan/tasks/BACKLOG-PROGRAM.md` (G7, Notes / Result).
