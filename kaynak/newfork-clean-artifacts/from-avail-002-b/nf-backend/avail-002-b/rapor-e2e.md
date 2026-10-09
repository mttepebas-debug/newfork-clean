# AVAIL-002-B — ek rapor: e2e spec (nf-test rolüyle, koordinatör kararı)

**1. Nerede duruyor:** Spec güncellendi, aynı dalda ayrı commit `42eb11d6` (`task/avail-002-b`). Koşulmadı — A'nın migration'ları yerel DB'de kalıcı değil; koşu main penceresinde `db.lock` ile.

**2. Ne yapıldı:** `e2e/flows/schedule-availability-warning.spec.ts` A+B davranışına göre:
- Publish → Pre-flight: "Notes and already-live issues" grubu ve "Ali Person shows as unavailable for this shift." görünür; "I've seen this warning…" kutusu yok; Next hemen açık; yayın gider.
- Aynı haftayı yeniden yayınlama: satır yine not olarak listelenir; "Previously accepted" yok; kutu yok.
- Yazma anı bugünkü gibi sessiz (kutu C1 ile gelecek; o zaman D (a) bu kısmı değiştirir). Settings → Conflict handling senaryosu değişmedi.
- Kontrol: `pnpm --filter @newfork/e2e lint` 0 hata, `tsc --noEmit` 0.

**3. Açık kalanlar:**
- A'ya giden güvenlik düzeltmesi "Pre-flight not cümlesi"ni değiştirirse spec'teki iki metin (`:85`, `:112` "Ali Person shows as unavailable for this shift.") yeni cümleye göre güncellenmeli — rebase'te bakacağım.
- Öteki e2e dosyaları tarandı: etkilenen yok (`employee-onboarding.spec.ts` davetlisi Employee rolünde; `tests.availability` yardımcısı A'da `ranges` kullanıyor).

**4. Ekranda ne değişti:** Görünürde bir şey değişmedi (yalnız test).

**5. Sırada:** A'nın yeni ucu gelince `task/avail-002-b`'yi onun üstüne rebase; B güvenlik incelemesi A düzeltmesiyle tek turda.
