# UI-DOC-002 Documents settings liste UI düzeni
Status: done
Session: ceeb830c   Branch: task/ui-doc-002   Worktree: newfork-wt/ui-doc-002   DB: -

Goal: `/app/settings/documents` listesinde filtre, column düzeni ve satır etkileşimi kullanıcı isteğine göre düzeltilsin.

In scope:
- Toolbar dropdown: doküman adı yerine Requirement filtresi (All / Required / Conditional / Optional).
- Columnlar: Document name | Description | Status (Draft/Published/Archived) | Published (son publish zamanı) + satır menüsü.
- Requirement ve Review columnları kaldırılır; sort keyleri yeni columnlara taşınır.
- Published zamanı `document_types.published_at` üzerinden; draft satırda boş.
- Satır hiçbir durumda disable/soluk olmaz; her zaman tıklanabilir ve drawer açılır.
- Published dokümanda drawer salt okunur (alanlar disabled, Save yok, "Unpublish to edit" notu).

Out of scope:
- Migration ve publication semantiği (DB trigger published düzenlemeyi reddetmeye devam eder).
- Drawer içerik redesign'ı, mobil layout yeniden tasarımı.

Done when:
- Requirement filtresi üç değeri süzüyor.
- Dört column ayrı hücrede render ediliyor.
- Published satır normal renkte, tıklanınca salt okunur drawer açılıyor.
- Republish sonrası Published column en yeni zamanı gösteriyor.
- `pnpm.cmd --filter @newfork/web exec vitest run` ilgili dosyalar PASS, `typecheck` PASS.

Touches: apps/web/src/settings/DocumentsSettingsPage.tsx, DocumentSettingsEditor.tsx, jobs-settings.css, DocumentsSettingsPage.test.tsx.

Test plan: DocumentsSettingsPage.test.tsx + DocumentSettingsEditor.test.tsx vitest, web typecheck, 5555 üzerinde göz kontrolü.

Risk: sort key değişimi mevcut testleri kırar; grid column sayısı artınca dar ekran taşması.

## Notes / Result
- Commits: 1ec3222 (filtre + columnlar + row kilidi), becd047 (read-only drawer başlığı), cfc2335 (dar ekranda Description column'u).
- Doğrulama: `pnpm.cmd --filter @newfork/web typecheck` PASS; `vitest run src/settings/` 20 dosya / 114 test PASS; 5557'de Meyhouse owner oturumuyla göz kontrolü (filtre 3 değer, 4 column, published satır normal renkte + salt okunur drawer, draft satır düzenlenebilir).
- Published column yalnızca `publication_status='published'` iken dolu. Migration öncesi legacy published kayıtların `published_at`'i null olduğu için onlarda `-` görünüyor; yeni publish sonrası dolacak.
- Republish zamanı kanıtı kod okumadan: `20260916052509_document_publication_initial.sql` publish'te `published_at=now()`, unpublish'te alanı bırakıyor. Canlı republish denenmedi (paylaşılan local DB'yi değiştirirdi).
- Kapsam dışı bulgu: DB trigger published tanımı düzenlemeyi hâlâ reddediyor; drawer bu yüzden salt okunur. Published dokümanı canlı düzenlemek istenirse ayrı bir DB task'ı gerekir.
- 2026-09-18 kapanış (koordinatör): main abd79ed (ff-merge, push). Requirement filtresi (All/Required/Conditional/Optional), 4 kolon (Document name | Description | Status | Published), published satır artık tıklanabilir ve salt okunur drawer açıyor, ≤1200px'te Description gizleniyor. Worker: web typecheck PASS, `src/settings/` 20 dosya / 114 test PASS, browser doğrulaması yapıldı.
- 2026-09-18: merge sonrası main CI YEŞİL (abd79ed).
