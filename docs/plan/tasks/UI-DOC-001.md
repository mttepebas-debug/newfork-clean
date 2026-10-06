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
- OPS-010 kararı: `20260916052509_document_publication_initial.sql` hosted'a uygulanmadı. Bu task'ta dosya en son migration'dan sonraki bir timestamp'e yeniden adlandırılır (local'de de henüz uygulanmadığı için güvenli); hosted'a daha sonra normal push ile gider.
- 2026-09-16 durumu: kaynak kod teslim edildi (rescue'da). web10/SQL59 ve typecheck PASS olarak raporlandı. Migration local DB'ye uygulanmadı.
- Temizlik bekleyen eski container'lar var: `newfork-docpub-01a0a8a7`, `newfork-docfilter-01a0a8a7`.
- 2026-09-17 (AUTH-002 bağı, ZORUNLU ilk adım): `20260916052509_document_publication_initial.sql` AUTH-002 migration'larından SONRAKİ yeni bir timestamp'e taşınır. AUTH-002 get/submit onboarding fonksiyonlarını yeni imzayla statik yeniden tanımladı; 052509'daki iki literal `coalesce(to_regprocedure(yeni), to_regprocedure(eski))` yapıldı. Apply sonrası doğrula: `get_employee_onboarding_service` ve `submit_employee_onboarding_service` gövdelerinde `publication_paused_at` geçiyor. Bu bloktaki replace'ler anchor kontrolsüz; eşleşmezse sessizce atlar, bu yüzden doğrulama şart.
- 2026-09-18 DÜZELTME (koordinatör doğruladı): `20260916052509_document_publication_initial.sql` artık HEM local'e HEM hosted'a (`hvyvyisrqyathtliyyyv`) uygulanmış durumda. Yukarıdaki "yeni timestamp'e taşı" ön koşulu GEÇERSİZ; dosyayı yeniden adlandırmak hosted'da ikinci kez uygulama denemesi yaratır. Dosya olduğu yerde kalır.
  - Bu task'ın kalanı: publication runtime'ının browser kabulü (Draft Save → Publish → Unpublish → Republish) ve legacy OR/named kayıtlarla uyum kontrolü. DB kilidi artık gerekmiyor (migration uygulandı).
  - Doğrulanması gereken: AUTH-002 imza değişikliği sonrası `get_employee_onboarding_service` ve `submit_employee_onboarding_service` gövdelerinde `publication_paused_at` filtresi var mı (052509'un replace'leri anchor kontrolsüz, sessizce atlamış olabilir). Local ve hosted'da ayrı ayrı bakılır.
