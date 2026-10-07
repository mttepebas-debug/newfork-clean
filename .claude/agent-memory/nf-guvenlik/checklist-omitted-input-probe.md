---
name: checklist-omitted-input-probe
description: Yetki ikizlerinde (TS expected()/can()) opsiyonel hedef alanı atlanınca "izin ver" çıkıyor mu diye elle yokla; matris hücreleri bunu kapsamaz
metadata:
  type: feedback
---

Yetki kararı veren saf fonksiyonlarda (ör. `packages/shared/src/authorization.ts` `expected()`, web `can()`) opsiyonel alanı (`person`, `locations`, `workspaceId`) ATLAYARAK çağır ve sonucu yokla. SQL matrisi her hedefe tüm alanları verir; "alan yok" hali hiçbir hücrede sorulmaz, twin testi yeşil kalır.

**Why:** FB-6.0-can (2026-09-25, `e427b24`) incelemesinde `person` atlanınca admin/manager'a sahibin kaydını düzenleme, işten çıkarma, kendi takasını onaylama "evet" çıktı; 1890 hücrelik twin testi yeşildi. CLAUDE.md §2.A: fail-open aynı işte kapatılır.

**How to apply:** `node --experimental-strip-types --input-type=module -e "import {expected} from './src/authorization.ts' ..."` ile (packages/shared içinde) alanı atlanmış çağrılar koştur. Ayrıca katalog eşitliği testinin canlı çekirdeğe değil dökümdeki listeye baktığını kontrol et.
