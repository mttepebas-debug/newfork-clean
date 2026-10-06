# RESCUE-001 Rescue WIP'ini bütün olarak main'e al
Status: done
Session: -   Branch: task/rescue-001   Worktree: newfork-wt/rescue-001   DB: yok (salt okunur)

Goal: `wip/rescue-2026-09-16` (`14647f8`) içeriğini tek task branch'inde main'e entegre edilebilir hale getirmek. Böylece main, local DB'de zaten uygulanmış olan 23 migration ile tutarlı olur.

In scope:
- `main`'den `task/rescue-001` branch'ini açmak.
- `git checkout 14647f8 -- .` ile rescue içeriğini almak, ardından `git rm` ile `AGENTS.md` ve `docs/project/` dosyalarını geri kaldırmak (bunlar main'de silindi, rescue ile geri gelmemeli).
- Kırılan typecheck, test ve build'lerin yalnızca kök nedenini düzeltmek.
- Kısa browser smoke:
  - Schedule (hafta değiştirme, filtre, Export paneli açılışı)
  - Settings > Documents (drawer açılıyor; Add/Save'in migration eksikliği nedeniyle kapalı olması beklenen davranış)
  - Settings > Roles, Locations (timezone alanı)
  - Employee Hub (dashboard ve schedule board)
  - Announcements: manager görünümü ve employee görünümü
- Rapora alan başına durum tablosu eklemek: kabul edildi / kanıtı eksik / kırık.

Out of scope:
- `20260916052509_document_publication_initial.sql` migration'ını DB'ye uygulamak. Dosya repoya girer ama uygulanmaz; bu iş UI-DOC-001'e ait.
- DB reset, seed ya da veri değişikliği.
- Yeni özellik, redesign, polish.
- Main'e merge ve push. Bunları koordinatör yapar.

Done when:
- `pnpm.cmd typecheck` PASS.
- web, api ve shared unit testleri PASS. Kalan her kırmızı test gerekçesiyle rapora yazılmış.
- `pnpm.cmd build` PASS.
- Smoke yapılan rotalarda crash ve console error yok.
- Branch push edilmiş ve rapor koordinatöre gönderilmiş.

Touches: repo geneli (web, api, shared, supabase). Sahiplik: bu task sürerken başka hiçbir task main'e kod merge etmez.

Test plan:
- Önce typecheck, sonra unit testler, en son build.
- pgTAP yok: local DB seed ile aynı değil (bkz. memory `local-db-test-fixture-drift`). Yalnızca rescue'da değişen SQL testlerinden biri kırmızıysa bu drift açısından incelenir.

Risk:
- Kararlar:
  - KULLANICI KARARI (2026-09-16): My Team → EmployeeScheduleBoard değişikliğini kullanıcı kendisi yaptı. Rescue'daki hali olduğu gibi korunacak; board geri alınmaz, My Team geri getirilmez.
  - Announcements employee scope migration'ı DB'ye elle eklendi (memory `announcements-employee-scope-ack`).
- Dev server: 5555/5556 portları doluysa worker sunucu başlatmaz, önce sorar.

## Notes / Result
- 2026-09-16 sonuç: main `d19542d` (import 557cc16, topbar fix a226bb1, My Team dosyaları silindi d19542d).
  - typecheck 7/7 ve build 4/4 PASS.
  - Unit testlerde rescue kaynaklı yeni kırmızı yok; main'de zaten var olan kırmızılar → TEST-001.
- Smoke sonuçları:
  - Kabul: Schedule, Export, Timezone, Roles, Employee Hub/board, Announcements listeleri.
  - Kanıt eksik: Documents lifecycle ve publication drawer (migration uygulanmadı, UI-DOC-001), Announcements acknowledge (ANN-001).
- Kapanış: README.md korundu (backlog). Rescue ve rescue-001 worktree'leri kaldırıldı; `wip/rescue-2026-09-16` yalnızca origin'de yedek olarak duruyor (F0 sonunda silinecek).
