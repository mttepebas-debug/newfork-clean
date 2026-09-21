# JOIN-002 Durum modeli: workspace yaşam döngüsü, üyelik durumu, son kullanım
Status: draft
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
