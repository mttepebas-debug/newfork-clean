---
name: e2e-flow-patterns
description: e2e kalıpları — Employee Hub tarih penceresi, Schedule kartında çift tık, ikinci yayın yolu, Auth e-postası Mailpit'ten, hassas işlemi API'den test etme, yerel DB'de kalan bildirim/güvenlik kayıtları
metadata:
  type: reference
---

2026-09-29, nf-test oturumu `local_0efbf957…`.

- **Employee Hub** yalnız bugün−2 … bugün+42 gününü çeker (`apps/web/src/views/EmployeeHubPage.tsx:83-84`).
  `tests.week()` vardiyası orada görünmez; e2e "gelecek hafta"yı kullanır (`e2e/flows/schedule-shift-note.spec.ts`).
- **Schedule düzenleme kipi:** karta tek tık yalnız odaklar; düzenleyici çift tık ya da Enter ile açılır
  (`ShiftCard.tsx:221-246`).
- **Canlı haftada ikinci yayın:** "Published" menüsü → "Publish another draft"; menü kayıttan sonra açık
  gelebilir. Kalıp: `schedule-multi-location.spec.ts:118`, `schedule-shift-note.spec.ts`.
- **Kayıt onayı** Supabase Auth e-postasıdır ve Mailpit'e düşer (`supabase status` → MAILPIT_URL;
  playwright.config `E2E_MAILPIT_URL`). Bağlantı site_url'e (5555) yönlendirir: yönlendirmeyi izlemeden iste,
  sonra parolayla gir (`owner-legal-name-setup.spec.ts`). API'nin Resend e-postaları ise Mailpit'e gelmez —
  nf-backend `resend-email-e2e.md`; ikisi çelişmez.
- **Hassas işlemin sunucu tarafı** ekranı atlayıp API'ye doğrudan istekle test edilir: taze token
  `/auth/v1/token?grant_type=password` (E2E_API_URL, E2E_ANON_KEY). Örnek: `ownership-transfer-password.spec.ts`.
- **Yerel DB'de iz:** bildirimli yayın yapan her e2e ortak yerel DB'de bekleyen bildirim satırı bırakır
  (BL-296'yı büyütür); account-password-change kalıcı güvenlik kaydı bırakır (BL-288).
- **Tekrar koşusu (`--repeat-each`)** çalışır (BL-203, 2026-09-29): dünya koşu başına tek olduğu için
  her tur kendi haftasını, builder etiketini, taslak adını ve yeni parolasını `e2e/fixtures/world.ts`
  `round`/`roundWeek`/`roundLabel`/`draftName` ile alır. Yeni spec aynı kalıbı izlemezse ikinci turda
  düşer; `pnpm e2e --repeat-each=2` ile dene.

İlgili: [[failure-screenshots-include-leftover-pages]].
