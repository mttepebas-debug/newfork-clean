# Lineup aşama 1 — veritabanı (16 Ekim 2026, akşam, California)

Mobil stüdyo oturumu (ek oturum) yazdı. Ana oturum treni ve canlı adımı yürütür; bu dosya o iş için.

## Ne
- **İş:** LINEUP-DB, Line-up planının 1. aşaması (`PD\PAGES\gorsel-kararlar\gelen\lineup\PLAN.md` §5–§7, §12). Mert'in "kodla"sı: 16 Ekim ~4:55 PM PDT, mobil stüdyo ("planı kur implementasyona başla"). Aynı gün Mert işçi sınırını bu iş için 2'ye çıkardı ("İkisi birden"): Bildirim motoru işiyle paralel.
- **Dal:** `task/lineup-db-2` (origin'de), taban origin/main 35b29ac8. İlk dal `task/lineup-db` (taban d97524c3) eskidi; ana oturumun istediği düzeltmeler (göç sürümü, rebase, KARARLAR daldan çıkar) force push olmasın diye yeni dalda.
- **Sınıf:** incelemeli (yeni tablolar, RLS, yeni `*_service`, yeni çekirdek eylemi).
- **Canlı:** migration **riskli** sınıfta (nf-guvenlik, 16 Ekim; ilk sınıflandırmam "yalnız ekleyen" idi, yanlıştı). RLS açıp revoke ediyor, `app_private.authz_actions`'a satır ekliyor ve yeni bir SECURITY DEFINER `*_service` getiriyor (CLAUDE.md §5 madde 5). Hiçbir var olan fonksiyonun gövdesi değişmez, hiçbir şey silinmez. Yol: `nf-guvenlik` ONAY → **Mert'in ana oturumda yazdığı "evet"** → ana oturum kontrol listesiyle MCP `apply_migration` → dosya adı canlı ledger sürümüne.

## Değişen dosyalar
- `supabase/migrations/20261017045214_lineup_foundation.sql` (canlı ledger sürümü; 2026-10-16 9:52 PM PDT canlıya uygulandı):
  - tablolar: `location_sections`, `daily_lineups`, `daily_lineup_rows`, `daily_lineup_versions`, `daily_lineup_acknowledgements`. Hepsinde RLS açık, anon/authenticated'dan revoke. Her bağ `(id, workspace_id)`; satır kendi lineup'ının lokasyonunda kalır ve yalnız o lokasyonun section'larını alır.
  - çekirdek eylemi `lineup.read`: place, read, izin `schedule.read` (yeni izin anahtarı yok, KARARLAR "Lineup yetkisi").
  - `public.get_lineup_day_service(actor, workspace, date, location_ids?, shift_type_ids?)`: günün lineup'ları, lokasyon ve vardiya türüne göre. Canlı Schedule vardiyaları + lineup'ın değişiklikleri (section, sıra, call off, saat, iş, etiket, notlar) + yalnız lineup'taki kişiler; kapalı ve kısa gün `schedule_closures`'tan; durum (draft, shared, editing, past), paylaşılan sürüm ve onay sayısı. Yalnız `service_role`.
- `supabase/tests/lineup_foundation.test.sql` (38 madde), `authorization_coverage`, `authorization_matrix` (`lineup.read` satırı, `schedule.read` kuralıyla), `authz_catalog` (eylem listesi).
- `packages/shared/src/authorization.ts` (`lineup.read` ikizi) ve `authorization-matrix.expected.json` (yalnız eklenen hücreler).
- `supabase/schema.sql` (`pnpm.cmd db:schema`).
- KARARLAR metni (Mert'in 16 Ekim telefon Lineup seçimi) dalda değil: ana oturuma mesajla gönderildi, coord/kayit2 üstünden o yazar.

## İnceleme
- `nf-guvenlik` **ONAY @f33ed710**: kritik ve yüksek bulgu yok. Orta bulgu (Schedule'da başka güne taşınan vardiya, eski günün lineup değişikliklerini yeni güne taşıyordu) ve dört düşük bulgu (silinmiş iş/tip adları, eksik indeksler, ret gerekçesinin testte kilitlenmemesi) bu dalda düzeltildi: satır artık kendi lineup'ının gününü taşır, okuma yalnız o günün satırlarını birleştirir, aynı vardiyanın yeni günde kendi satırı olabilir. Düzeltme commit'i ayrıca incelemeye gitti.
- Düşük 4 (50 ms ölçümü küçük dünyada): yazma aşamasında büyük fixture'da yeniden ölçülecek.
- Ürün notu (inceleme): satır vardiyaya bağlı, kişiye değil. PLAN §10 madde 5 bunu kapsıyor (Shift Hub cover/swap: isim yerinde değişir, section ve sıra kalır). Call off yeni kişiye geçmemeli: aşama 5'teki canlı yama (Shift Hub, time off, Schedule) kişi değişince call off'u temizler.

## Test (dalın migration'ı testin kendi işleminde, rollback'li, ortak yerel DB'de)
- lineup_foundation 38/38 (taşınan vardiya, yeni günün satırı ve ret gerekçeleri dahil); authorization_matrix 10.712 ok, 0 not ok; authorization_coverage 5/5; authz_catalog 11/11; browser_privileges 10/10; public_roles_reach_no_table_directly 4/4; retired_objects_stay_gone 22/22; notification_core 104/104.
- shared: vitest authorization 23/23; typecheck ve lint temiz.
- Okuma bütçesi: fixture'da 50 ms altı (testin son maddesi, beşin en iyisi).

## Sonra
- Aşama 1b (riskli, ayrı): Shift Hub, time off ve Important Dates onaylarının `schedule_invalidation` göndermesi (PLAN §8). Var olan fonksiyonların gövdesi değişir; Mert'in "evet"i gerekir.
- Aşama 2: Lineup ekranı yeni okumaya geçer; telefonda Mert'in seçtiği "D · Karışım" düzeni (onayından sonra). API yolu `/v1/workspaces/:w/lineups/:date` ve shared şema bu aşamada.
- Aşama 3–5: düzenleme komutları, Add Staff, paylaşım ve çalışan onayı (PLAN §12).
- Açık sorular (PLAN §11), Mert cevaplayana kadar varsayılan: departman ve iş sırası ada göre; call off'ta bildirim yok; çalışan bütün ekibi görür.
