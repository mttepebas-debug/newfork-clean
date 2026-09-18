# UI-DOC-002 Documents settings liste UI düzeni
Status: active
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
