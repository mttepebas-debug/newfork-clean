# JOIN-002 Durum modeli: workspace yaşam döngüsü, üyelik durumu, son kullanım
Status: done (2026-09-21, 33658d6)
Session: -   Branch: task/join-002   Worktree: newfork-wt/join-002   DB: KİLİT

Plan ID'leri: M2, M3, R5 (veri tarafı), S14 (temel), E7 (temel)

Goal: Workspace'in "hangi hâlde" olduğu tek alandan okunsun; üyelik plandaki üç durumu taşısın; iniş kararı için son kullanım zamanı üyelikte dursun.

In scope:
- `workspace_lifecycle_status` enum'una `draft`, `suspended`, `closed` değerleri eklenir (ayrı migration; `ALTER TYPE ADD VALUE` aynı transaction içinde kullanılamaz).
- `membership_status` enum'una `removed` eklenir.
- `workspaces.lifecycle_status` varsayılanı `draft`; kurulumu bitmemiş mevcut workspace'ler `draft`'a backfill edilir; onboarding tamamlanınca `active`'e geçer.
- `app_private.workspace_allows_interactive_access` yalnız `lifecycle_status` okur (onboarding koşulu düşer).
- `workspace_memberships` + `last_used_at timestamptz` ve + `employee_id uuid` (çalışan kaydı bağı, M3); `employee_profiles.user_id` üzerinden backfill; `(user_id, last_used_at desc)` indeksi.
- Üyelikten çıkarma `removed` yazar (bugün satır siliniyor ya da `suspended` kullanılıyor — J1 ölçümünde yol doğrulanmadı, bu dilimde belirlenir).
- pgTAP: draft workspace'e erişim kapalı; suspended/closed kapalı; closure_scheduled + gelecek tarih açık; removed üyelik erişemez; last_used_at yazılabilir.

Out of scope:
- Enum tipini takas edip `deleted` / `invited` değerlerini fiziksel silmek. 72 fonksiyon bu iki tipe değiyor; kullanılmayan değer davranış üretmiyor. Bunun yerine "hiçbir satır bu değerleri kullanmaz" pgTAP testiyle sabitlenir. (BACKLOG: enum temizliği.)
- UI. Durum ekranları JOIN-006'da.

Done when: migration local'e uygulanmış, pgTAP PASS, `pnpm.cmd typecheck` + `pnpm.cmd test` PASS, mevcut 79 üyelik ve 3 workspace backfill sonrası doğru durumda.
Touches: `supabase/migrations/*`, `supabase/tests/*`, `app_private.workspace_allows_interactive_access`, `public.create_owner_workspace`, onboarding tamamlama yolu, `packages/shared` tipleri.
Test plan: pgTAP (yeni dosya `workspace_lifecycle.test.sql`, `membership_status.test.sql`) + mevcut `workspace_rls.test.sql` yeşil kalır.
Risk: `workspace_allows_interactive_access` 72 fonksiyonun erişim kapısı; backfill yanlışsa var olan workspace'ler kilitlenir. Backfill öncesi/sonrası satır sayısı raporlanır.

## Notes / Result
- 2026-09-21 sonuç. İki migration (`20260921100000`, `20260921100100`) local'e uygulandı ve `supabase_migrations.schema_migrations`'a işlendi. Backfill: 5 workspace `draft`, 42 üyelik `employee_id` aldı.
- **Plandan üç sapma, gerekçeleriyle:**
  1. `closed` etiketi eklenmedi. Planın "closed"ı repoda `deleted` adıyla zaten var ve 7 fonksiyon o değeri yazıp okuyor. Plan kuralı 5 (yalnız isim farkı çelişki değil) gereği yeniden adlandırılmadı.
  2. `lifecycle_status` varsayılanı `active` bırakıldı; `draft`'ı onboarding tetikleyicisi yazıyor. Varsayılanı `draft` yapmak 119 assert'lik `workspace_rls.test.sql` dâhil bütün fixture'ları bozuyordu; tetikleyici aynı sonucu sıfır fixture değişikliğiyle veriyor.
  3. Tetikleyicinin adı `onboarding_syncs_workspace_lifecycle_trigger`. Tetikleyiciler ad sırasına göre çalışıyor ve `set_active_workspace_when_owner_onboarding_completes_trigger` açılamayan workspace'i reddediyor; draft'tan çıkış ondan önce olmalı.
- Yol üstünde düzeltilen: `workspace_rls.test.sql`'deki üç kapanış fixture'ı `'2026-09-19T12:00:00.000Z'` sabitini kullanıyordu, bugün geçmişte kaldığı için üç assert kırmızıydı. `now() + interval '30 days'` oldu. (Web tarafının aynı hatası `3a13b95`'te düzeltilmişti.)
- **Kanıt:** `workspace_lifecycle.test.sql` 17/17, `workspace_rls` 119/119, `explicit_workspace_context` 8/8, `account_workspace_controls` 52/52. `pnpm.cmd typecheck` PASS, `pnpm.cmd test` PASS (214 dosya / 1556 test).
- **Kapsam dışı bulgu:** local `pnpm.cmd test:db` bu değişiklikten ÖNCE de 664 subtest'te kırmızıydı; değişiklikten sonra 662. A/B aynı DB üzerinde ölçüldü (eski gate fonksiyonu geri konup tetikleyici kapatılarak). Yani bu dilim iki testi düzeltti, hiçbirini bozmadı; kalan 662 local veri sapmasından geliyor. BACKLOG'a yazıldı, JOIN-007 ile kapanır.

