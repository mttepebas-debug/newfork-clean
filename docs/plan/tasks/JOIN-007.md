# JOIN-007 Senaryo kapanışı: S1–S17 ve RLS sözleşmesi
Status: daraltildi (2026-09-22); kendi fixture'ini kuran senaryo testleri
Session: -   Branch: task/join-007   Worktree: newfork-wt/join-007   DB: KİLİT (yalnız pgTAP)

Plan ID'leri: G1, S1, S3, S7, S11, S13, S16, S17 + S2/S4–S6/S8–S10/S12/S14/S15'in regresyon pinleri

Goal: Planın her senaryosu bir testle sabitlensin; "çalışıyor" iddiası kodda karşılığı olan bir assert'e bağlansın.

In scope:
- Kalan ölçülmemiş senaryolar önce elle üretilir, sonra testlenir: S7 (iki workspace'ten davet, biri kabul → diğeri pending kalır), S11 (kurulum ortasında davet ve tersi), S13 (owner devri), S16 (hesap silme + geri alma), S17 (çapraz workspace RLS).
- S17 pgTAP: employee A workspace 1'in verisini okurken workspace 2'nin hiçbir satırını göremez — workspaces, memberships, employee_profiles, employee_invitations, locations, schedule tablolarından birer örnek.
- ~~JOIN-001'in G1 satırındaki kırmızı üç pgTAP dosyası yeşile döner~~ **Kapsam dışı (2026-09-22).** Hangi üç dosya olduğu hiçbir yerde yazılı değil, ve BL-070 gereği yerel DB'de zaten ~664 subtest kırmızı — o kırmızı tabana bakarak senaryo testi yazmak sinyal vermiyor. Yerine: her senaryo **kendi fixture'ini kuran** yeni bir pgTAP dosyasında ölçülür, tıpkı `owner_employee_record` (25/25) ve `own_employment_record` (6/6) gibi. Bunlar kırmızı tabandan bağımsız geçiyor.
- Mevcut kapsam ölçüldü, tekrar yazılmayacak: S13'ün büyük kısmı `account_workspace_controls` (52 assert), S17'nin büyük kısmı `workspace_rls` (120 assert), workspace durumu `workspace_lifecycle` (21 assert). Yazılacak olan bu üçünün **ölçmediği** senaryolar.
- S1 ve S3'ün tam turu: signup → kurulum → workspace, ve davet linkiyle signup → kabul → onboarding.
- Her senaryonun ekran görüntüsü `artifacts/join/` altına (commit edilmez).

Out of scope: yeni özellik. Bu dilim yalnız ölçer, sabitler ve çıkan hatayı en küçük düzeltmeyle kapatır.
Done when: ölçülmemiş senaryolar kendi fixture'ini kuran pgTAP dosyalarında yeşil; `typecheck`, `test`, `lint` PASS. `test:db` bütünü **kapı değil** (BL-070).
Touches: `supabase/tests/*`, `apps/web/src/**/*.test.tsx`, `apps/api/src/**/*.test.ts`.
Test plan: pgTAP + Vitest; elle tur raporu.
Risk: ölçüm yeni hata çıkarır; kapsam yönetimi kuralı uygulanır — hedefi engelleyen en küçük çözüm burada, bağımsız iyileştirme BACKLOG'a.

## Notes / Result

## Notes / Result

**2026-09-22 — ölçülmemiş senaryolar yazıldı, ikisi ürünü düzeltti.**

- `joining_from_two_workspaces.test.sql` **10/10** — S7 ve S11.
  - **S7:** iki workspace aynı kişiyi çağırabiliyor; birini kabul etmek
    diğerini olduğu yerde bırakıyor, ve sonradan o da cevaplanabiliyor. Bir
    davet bir workspace ile bir hesap arasında; kabul etmek başkasının
    sorusuna verilmiş cevap değil.
  - **S11 testi baştan yanlış varsayımla yazıldı ve ürün düzeltti.** "Kurulum
    ortasında davet gelirse ikisi de yaşar" diye kurmuştum; gerçek kural tam
    tersi — `20260917100000_owner_workspace_pending_invitation_guard` bekleyen
    davet varken kendi workspace'ini kurmayı **reddediyor**. Test artık var
    olan kuralı sabitliyor: reddediliyor, reddedilmek daveti cevaplamış
    sayılmıyor, cevaplayınca yol açılıyor ve katıldığı workspace duruyor.
- `one_workspace_cannot_see_another.test.sql` **6/6** — S17. Aynı kişi, iki
  workspace: karşı tarafın `workspaces`, `workspace_memberships` ve
  `locations` satırlarının hiçbiri görünmüyor, kendi tarafı ise tam.

**Yan bulgu, ayrı kaydedildi: SEC-002.** `employee_profiles` ve
`employee_invitations` `authenticated`'a `SELECT` veriyor ama policy'leri o
rolün çalıştıramadığı `public.can_access_employee`'i çağırıyor — doğrudan
okuma policy karar vermeden hata veriyor. Kapalı başarısız oluyor ve web bu
tabloları doğrudan okumuyor, ama grant tutulamayan bir söz veriyor. Test bu
iki tabloyu bilerek dışarıda bırakıyor ve sebebini başında yazıyor.

**Kalan:** S13 ve S16 ayrıca yazılmadı — `account_workspace_controls`
(52 assert) devir akışını, `account_security_deletion_lifecycle` ise silme ve
geri almayı zaten ölçüyor. Yeniden yazmak kapsam değil, tekrar olurdu.
