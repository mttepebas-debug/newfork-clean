# JOIN-007 Senaryo kapanışı: S1–S17 ve RLS sözleşmesi
Status: draft
Session: -   Branch: task/join-007   Worktree: newfork-wt/join-007   DB: KİLİT (yalnız pgTAP)

Plan ID'leri: G1, S1, S3, S7, S11, S13, S16, S17 + S2/S4–S6/S8–S10/S12/S14/S15'in regresyon pinleri

Goal: Planın her senaryosu bir testle sabitlensin; "çalışıyor" iddiası kodda karşılığı olan bir assert'e bağlansın.

In scope:
- Kalan ölçülmemiş senaryolar önce elle üretilir, sonra testlenir: S7 (iki workspace'ten davet, biri kabul → diğeri pending kalır), S11 (kurulum ortasında davet ve tersi), S13 (owner devri), S16 (hesap silme + geri alma), S17 (çapraz workspace RLS).
- S17 pgTAP: employee A workspace 1'in verisini okurken workspace 2'nin hiçbir satırını göremez — workspaces, memberships, employee_profiles, employee_invitations, locations, schedule tablolarından birer örnek.
- JOIN-001'in G1 satırındaki kırmızı üç pgTAP dosyası yeşile döner ya da neden düştüğü yazılır.
- S1 ve S3'ün tam turu: signup → kurulum → workspace, ve davet linkiyle signup → kabul → onboarding.
- Her senaryonun ekran görüntüsü `artifacts/join/` altına (commit edilmez).

Out of scope: yeni özellik. Bu dilim yalnız ölçer, sabitler ve çıkan hatayı en küçük düzeltmeyle kapatır.
Done when: S1–S17 tablosunda her satır ✅ ve iki kanıtlı; `pnpm.cmd lint`, `typecheck`, `test`, `test:db`, `build` PASS.
Touches: `supabase/tests/*`, `apps/web/src/**/*.test.tsx`, `apps/api/src/**/*.test.ts`.
Test plan: pgTAP + Vitest; elle tur raporu.
Risk: ölçüm yeni hata çıkarır; kapsam yönetimi kuralı uygulanır — hedefi engelleyen en küçük çözüm burada, bağımsız iyileştirme BACKLOG'a.

## Notes / Result
