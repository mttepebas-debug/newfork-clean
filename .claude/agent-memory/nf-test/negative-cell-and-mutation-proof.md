---
name: negative-cell-and-mutation-proof
description: "X yok" diyen pgTAP hücresi önce başarılı cevabı ve öğenin varlığını kanıtlar; hücrenin yakaladığı servisi rollback'li işlemde bozarak kanıtlanır; bazı ortamlarda bozma reddedilir
metadata:
  type: feedback
---

- "X yok" diyen hücre önce cevabın başarılı olduğunu ve öğenin (ör. vardiya) bulunduğunu kanıtlar; yoksa
  hata ya da boş cevap da geçer. Örnek: `shift_note_reaches_only_its_owner.test.sql` → `shows_deniz_without_note`.
- Hücrenin gerçekten yakaladığını kanıtlamak için servisi aynı işlem içinde `create or replace … raise exception`
  ile boz (rollback'li, `db.lock` altında), sonra `pg_get_functiondef(...) like …` ile iz kalmadığını doğrula.
- Uygulama kodunu geçici bozarak kanıtlama bazen izin sınıflandırıcısınca reddedilir
  (ör. `note: base?.note as string`). Aynı sonuç başka yoldan denenmez; raporda "bozmayla kanıtlanmadı" yazılır.

**Why:** boş cevapla geçen negatif hücre hiçbir şey kanıtlamaz; bozma, testin gerçekten kırmızıya düştüğünü gösterir.
**How to apply:** yeni yetki/gizlilik hücresinde pozitif ön-koşul + bir kez bozma denemesi.
