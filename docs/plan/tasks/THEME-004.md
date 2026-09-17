# THEME-004 THEME-002 takibi: kalan sayfaların token'a geçişi ve AA kontrolü
Status: done
Session: TEST-001 session (local_24e92640; THEME-001/002 worker'ı, Opus 5 medium)   Branch: task/theme-004   Worktree: newfork-wt/theme-004   DB: yok
Öneri: aynı session (bağlam sıcak).

Goal: THEME-002'nin dışında kalan sayfa CSS'leri de token kullansın. MVP'de kullanıcıya görünen bütün yüzeylerde metin kontrastı AA olsun. Özellikle employee yüzeyleri ölçülmemişti.

Karar (koordinatör, 2026-09-16; kullanıcı THEME-002 açıklarının planlanmasını istedi):
- **Gerekli, şimdi yapılacak:**
  - Employee yüzeylerinde AA ölçümü (self-serve ABD lansmanı için erişilebilirlik).
  - Kalan sayfa CSS'lerinin birebir hex → token dönüşümü (görünüm değişmez).
  - `--theme-on-accent` token'ı.
- **Gerekli değil, ertelendi:** yakın tonları birleştirme (THEME-003). Görünümü değiştirir; F5 polish'te kullanıcıyla önce/sonra karşılaştırması yapılarak ele alınır.

In scope:
1. **Token dönüşümü (THEME-002'deki yöntem):**
   - Kalan sayfa CSS'lerinde (lineup, account, availability, employee-hub, shift-exchanges, documents, communications, settings/*.css ve diğerleri) yalnızca birebir hex ve uygun rol eşleşmesi token'a çevrilir.
   - `--x:` tanımlarına ve var() fallback'lerine dokunulmaz.
   - `--theme-on-accent: #ffffff` eklenir; accent/action zemin üstündeki beyaz metin bu token'a çevrilir.
   - postcss eşdeğerliği ve hesaplanmış stil karşılaştırmasında 0 fark olmalı.
2. **AA ölçümü ve düzeltme:**
   - Employee yüzeyleri: Employee Hub dashboard, Schedule board, Shift Hub (exchanges), My Availability, employee Line Up, Announcements (reader), Account.
   - Manager yüzeyleri: Line Up (manager), Availability, Important Dates, Employees drawer, Documents.
   - İhlallerde THEME-002 kararı uygulanır: ikincil metin `--theme-muted`.
   - Belirgin bir renk değişikliği gerekirse (muted dışı, ör. vurgu rengi ya da durum rozeti) uygulamadan önce koordinatöre sor.
3. **Employee hesabı:**
   - Local'de employee rolüyle giriş gerekir. Mevcut test hesabı ya da dev identity yöntemi kullanılır.
   - Parola gerekiyorsa kullanıcıdan iste; parolayı kendin girme.

Out of scope:
- Yakın ton birleştirme (THEME-003).
- Layout, tipografi ve redesign.
- Dark tema.

Done when:
- Listelenen sayfa CSS'lerinde birebir eşleşen hex kalmadı (kalanlar rol gerekçesiyle listelendi); `--theme-on-accent` kullanımda.
- 1. adım sonrası hesaplanmış stil farkı 0.
- Listelenen yüzeylerde AA ihlali 0 ya da gerekçeli istisna.
- Web typecheck, build ve light-theme testleri PASS.
- Branch push edildi, rapor gönderildi.

Test plan: CSS işi; sonunda typecheck, build ve light-theme testleri bir kez. Web'i 5558'de çalıştır (API 5556).

## Notes / Result
- 2026-09-16 main bd6877a:
  - `--theme-on-accent` eklendi; 12 sayfa CSS'i ve styles.css'te 69 birebir dönüşüm (34 on-accent). Hesaplanmış stil farkı 0 (24 manager + 7 employee görünümü).
  - Muted düzeltmeleri: lineup, employee-dashboard, drawer.
  - Kullanıcı onaylı değişiklikler:
    - D1: `--theme-muted-strong` #5f6b66, renkli zeminde ikincil metin için.
    - D2: Line Up uyarı metinleri `--theme-warning`, sharing butonu `--theme-accent`.
  - AA: listelenen employee ve manager yüzeylerinde 0 ihlal (employee sayfaları boş veriyle ölçüldü).
  - typecheck/build PASS; light-theme 2/2.
- Bulgu: sunucu tarafında sonlanan session sign-in'e yönlenmiyor → AUTH-002 kapsamına eklendi.
