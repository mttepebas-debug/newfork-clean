# RESCUE-001 Rescue WIP'ini bütün olarak main'e al
Status: draft
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
  - My Team sayfası (EmployeeTeamView) silindi ve EmployeeScheduleBoard ile değiştirildi. Koordinatörün önerisi silmenin korunması; kullanıcı onayı bekleniyor.
  - Announcements employee scope migration'ı DB'ye elle eklendi (memory `announcements-employee-scope-ack`).
- Dev server: 5555/5556 portları doluysa worker sunucu başlatmaz, önce sorar.

## Notes / Result
