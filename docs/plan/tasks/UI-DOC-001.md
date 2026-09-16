# UI-DOC-001 Documents publication runtime kapanışı
Status: blocked (RESCUE-001 Documents dilimine bağlı)
Session: -   Branch: task/ui-doc-001   Worktree: newfork-wt/ui-doc-001   DB: lock gerekecek
Öneri: Opus 5, high. Süre, yetki, hedefleme ve veri geçmişi aynı anda etkileniyor.
Kilit kuralı: bu task aktifken başka hiçbir task migration uygulamaz. Apply öncesi local DB yedeği alınır (pg_dump, repo dışına).

Goal: Documents drawer'ında Draft Save → Publish → Unpublish → Republish akışının local'de çalışması.

In scope:
- `20260916052509_document_publication_initial.sql` için dar inceleme: legacy OR/named kayıtlarıyla uyum.
- Migration'ın local DB'ye uygulanması.
- Publication browser E2E: hedefleme etkisi ve employee erişimi.

Out of scope:
- Hosted apply ve deploy.
- Email (BL-046).
- Drawer redesign.

Done when:
- Add/Save aktif.
- Dört publication adımı browser'da çalışıyor.
- Legacy kayıtlar sessizce dönüştürülmemiş.

Touches: supabase/migrations, apps/web/src/settings/Document*, apps/api document routes.

Test plan:
- Migration öncesi: `supabase/tests/document_publication.test.sql`.
- Migration sonrası: tek browser E2E turu.

Risk: süre, yetki, hedefleme ve veri geçmişi aynı anda etkileniyor.

## Kapalı kararlar (tekrar sorulmayacak)
- Hedefleme: grup içi çoklu seçim, gruplar arası AND. Boş grup herkes (All) demek.
- Hedef kitle: aktif çalışanlar, gelecekteki onboarding'ler ve hedefle eşleşen geri alınmış (restored) çalışanlar.
- Republish tam süreyi yeniden başlatır.
- Unpublished durumda upload/submit/review durur; okuma ve geçmiş korunur.
- Yeniden hedef dışında kalan yükümlülükler geçmişi korunarak kapanır.

## Notes / Result
- 2026-09-16 durumu: kaynak kod teslim edildi (rescue'da). web10/SQL59 ve typecheck PASS olarak raporlandı. Migration local DB'ye uygulanmadı.
- Temizlik bekleyen eski container'lar var: `newfork-docpub-01a0a8a7`, `newfork-docfilter-01a0a8a7`.
