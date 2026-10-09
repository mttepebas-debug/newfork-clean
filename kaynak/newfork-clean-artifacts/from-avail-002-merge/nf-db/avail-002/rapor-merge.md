# AVAIL-002-merge — nf-db: main penceresi hazır

**1. Nerede duruyor:** A+B, `origin/main` (`0b6a397b`) üstüne rebase edildi. Migration'lar ortak yerel DB'ye kalıcı uygulandı. `test:db` ve e2e geçti. **Push için uç: `b9a83f66c826466d4664d47f7eb52e6da35b84c0`** (dal `task/avail-002-merge`, worktree `newfork-wt/avail-002-merge`). main.lock bende, sen söyleyince bırakırım. db.lock bırakıldı.

## 2. Ne yapıldı
- Rebase çatışmasız geçti (9 commit). `git diff --stat d17378b9 HEAD -- . ':!docs'` yalnız `.claude/agent-memory/nf-guvenlik/` altında 2 dosya gösterdi; kod yok, tam kapı yeniden koşulmadı.
- Kurulum §6'ya göre yapıldı: pnpm install, shared/ui build, yerel `.env*`.
- CI boştaydı (`gh run list`). Son koşu 06:34Z, success.
- Kalıcı uygulanmadan önce yerel yedek alındı: `artifacts/nf-db/avail-002/pre-merge-local-backup.sql` (worktree içinde, gitignore). İçinde silinen tablo, haftalar, geçmiş, komutlar, notlar ve onboarding gereksinimleri var.
- `npx supabase migration up --local`: `20261007000000`, `20261007010000`, `20261007020000` uygulandı. Bekleyen başka migration yoktu.

## Kanıt
- **`pnpm.cmd test:db`** (166 dosya, 15285 test; ~16:00Z):
  - `ci-green.txt`'teki 164 dosyanın 162'si yeşil. Kalan ikisi `bl052_document_lifecycle` ve `bl052_document_notifications`; bunlar önceden bilinen ortak DB kayması, migration olmadan da kırmızı.
  - Listede olmayan iki dosya da kırmızı: `scheduling_settings_shift_types_rls` (3 hücre: shift type saat ve ad kısıtları, müdürün shift type yaratması) ve `weekly_exchange_changed_terms` (`schedule_time_off_requests.location_id` artık yok). İkisi de müsaitlikle ilgisiz.
  - `management_owner_job`: "TODO passed 19-20", başarısız değil.
- **e2e, şartlı iki senaryo** (yerel 5565/5566): 4/4 yeşil.
  - `employee-onboarding.spec.ts` 2/2.
  - `schedule-availability-warning.spec.ts` 2/2: Ali'nin işaretli saati, Publish'te not olarak listelenip hiçbir şey sormuyor, republish'te de aynı; Conflict handling'de Employee availability kuralı yok.
- **e2e tamamı:** 41/41 yeşil (5.5 dk, ~16:13Z).
- Kayıtlar: `artifacts/nf-db/avail-002/test-db.log`, `e2e-two.log`, `e2e-all.log`.

## 3. Açık kalanlar
- Push ve main.lock devri sende.
- Canlıya migration (OPS-03) sende. Canlı ölçümü (~15:40Z, yalnız SELECT): silinecek satır yok.
- `scheduling_settings_shift_types_rls` ve `weekly_exchange_changed_terms` liste dışı kırmızı; backlog'da yoksa yazılmalı.

## 4. Ekranda ne değişti
Bu adımda yeni değişiklik yok; değişen ekranlar B raporunda.

## 5. Sırada ne var
Push → main CI izle → canlıya migration → worktree ve dal temizliği (`task/avail-002-a`, `task/avail-002-b`, `task/avail-002-merge`).

## Skill
- superpowers:verification-before-completion: her iddia yukarıdaki komut ve sonuçla.
