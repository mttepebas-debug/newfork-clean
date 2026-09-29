---
name: role-button-row-borrowed-name
description: role="button" satır kendi adı yoksa içindeki düğmelerin adını ödünç alır; Playwright kısmi ad eşleşmesi strict mode'da iki öğe bulur
metadata:
  type: feedback
---

Adı olmayan `role="button"` kapsayıcı (ör. New Schedule menüsündeki taslak satırı) erişilebilir adını içeriğinden, iç içe düğmeler dahil, kurar. Playwright `getByRole('button', { name: 'X' })` büyük/küçük harfe duyarsız kısmi eşleşme yapar; satıra "X" adlı düğme eklenince satır da eşleşir ve e2e strict mode'da düşer (main CI 36539551010, 2026-09-29, "Edit live schedule").

**Why:** vitest/testing-library ad eşleşmesi varsayılan olarak tam eşleşmedir; birim testleri bu çakışmayı göstermez, yalnız e2e gösterir.

**How to apply:** role="button" satıra/karta yeni iç düğme ya da metin eklenen incelemede: satırın kendi aria-label'ı var mı, e2e'deki string `name:` sorguları yeni adı kısmi olarak içeriyor mu diye `grep -rn "name: \"" e2e` ile tara. aria-label satırın durum metnini (Viewing/Published/tarih) ekran okuyucudan gizler; aria-describedby önerilir.
