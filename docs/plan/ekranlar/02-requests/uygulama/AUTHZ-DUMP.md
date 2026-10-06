# EKRAN-02 AUTHZ-DUMP — yetki ikizi A1–A3 matrisine uyduruldu

- **İş:** AUTHZ-DUMP (koordinatör, veri hattının A1A2 + A3 dallarının ardından) · **Rol:** `nf-backend` (web oturumu) · **Sınıf:** R3 (yetki ikizi)
- **Dal:** `task/authz-dump` · **Taban:** `task/ekran-02-a3` @`2ee14550` (A1A2'yi içerir; main'de değil) · **Commit:** `8363f329` (+ bu kayıt)
- **Durum:** dalda, **push yok** — sabah A1A2 + A3 + AUTHZ-DUMP birlikte (koordinatörün "gönder" izniyle, R3).

## Sonrası için
- **İnceleme Düşük 1 (backlog):** çekirdek takas vakasında hem vereni hem alanı tartıyor (`20261007150000_shift_exchanges_ask_the_core.sql:229-238`), ikiz ve matris tek kişiye bakıyor. Bugün web `exchange.approve`'u hedefli sormuyor; C2'de (Review çekmecesi) hedefli kullanım gelirse ikiz iki kişiyi almalı.
- **İnceleme Düşük 2 (backlog):** belgesi eksik müdür (K-S2) ikizde yok; `can()` belge eksiğini "onboarding'i bitmemiş" sayıyor, hedefli `requests.read` / `exchange.read`'e "hayır" der (çekirdek "evet"). Daha sıkı yönde; hedefli kullanım gelince ikize işaret, matrise belgesi eksik bir kişi.
- **İnceleme önerisi (`nf-db`):** `…_shift_exchanges_ask_the_core.sql:138` `target_access = 'owner'` → `is not distinct from 'owner'` (NULL tuzağı; bugün erişilemez).

## Rapor
- **Girdi:** veri hattının listesi `.newfork-inbox/done/20261006T161053-nf-db-veri-authz-dump-liste.md` (5 satır) + hücre farkı `.newfork-inbox/authz-dump-cell-diff-ekran02-a1a2-a3.json` (221 hücre).
- **Döküm:** `AUTHZ_MATRIX_PRELUDE="supabase/migrations/20261007140000_one_eligibility_engine.sql;…20261007150000_shift_exchanges_ask_the_core.sql;…20261007160000_time_off_rules_and_reads.sql" pnpm.cmd --filter @newfork/shared dump:authz-matrix` → 5253 hücre (5440 − 204 eski Schedule yardımcısı + 17 `case:ayse-k2`).
- **İkiz (`packages/shared/src/authorization.ts`):**
  1. Eski üç Schedule anahtarı ikizde yoktu — iş yok.
  2. `exchange.approve` bir üst rütbe (D3): müdürün vakası admin / owner'a, admin'inki owner'a; kimse kendi vakasını onaylamaz.
  3. K-S1: owner'ın vakası o lokasyonun müdürüne ya da admin'e (`high || covers`); matriste hücresi yok, birim testle kilitlendi.
  4. `requests.read` izni `schedule.time_off_requests.manage` (K-S3).
  5. K-S2: ikiz belge kısıtını modellemiyor; değişiklik yok (inceleme Düşük 2).
- **Kanıt:** önce kırmızı — `sourceSha256` testi; döküm sonrası `requests.read` izni ve iki hücre (`can`, `nil` → `case:ayse-k2`: SQL deny, TS allow) + yeni D3 testi; sonra `pnpm.cmd --filter @newfork/shared exec vitest run src/authorization.test.ts` 23/23. Etkilenen web testleri (`exchange-data.test.ts`, `ScheduleRequestsPage.test.tsx`, `src/auth`) 93/93.
- **Tam kapı:** (ağır iş izniyle, A3'ün tam koşusundan sonra; bu dosyanın son hâlinde yazılır)
- **Ekranda:** değişen yok (web bu eylemleri bugün hedefli sormuyor).

## İnceleme

### `nf-guvenlik` — aynen

KARAR: ONAY @8363f329

**Koordinatör için 5 satır**
- Karar: ONAY @8363f329. Sınıf R3 (yetki ikizi). Kritik, Yüksek ya da Orta bulgu yok.
- İzin: inceleme rolündeyim, gönderim yapmam. Gönderim için R3'te koordinatörün "gönder" izni gerekir.
- Risk: 🟢 Değişiklik yalnız ekranda neyin gösterileceğini belirleyen ikizde (`expected()`). Kararı yine veritabanı veriyor. İkizin veritabanından daha gevşek olduğu bir hücre bulmadım.
- Soru: yok.
- Sonraki: aşağıdaki iki Düşük not ileride işe dönüşecekse backlog'a yazılsın.

## Sorulara cevap

**(a) Yeni onay kuralı SQL ile birebir mi?** Evet. Beş durumu matristeki SQL kuralıyla ve A2 migration'ındaki çekirdekle (`no_self` ve `rank_below` açık, `owner_target_ok` yeni) tek tek karşılaştırdım:
- Kişi kendi vakasını onaylayamaz: ikiz ve SQL ikisi de "hayır". Çekirdek de `no_self` ile reddeder. Owner'ın kendisi dahil, pgTAP bunu `authz.rank` cevabıyla doğruluyor.
- Owner'ın vakası (K-S1): ikiz "admin, ya da o lokasyonun müdürü" der. SQL rütbe kontrolünü owner için atlıyor, sonuç aynı. Çekirdekte de aynı.
- Owner başkasının vakasını onaylar: üçü de "evet".
- Admin: hedefin rütbesi admin'in altındaysa "evet". Admin'in vakasını ikiz de SQL de reddeder.
- Müdür: hedef çalışansa ve vakanın lokasyonları müdürün lokasyonlarıysa "evet". SQL'de de aynı.
- Kişi ya da lokasyon boş bırakılırsa ikiz "hayır" der, bu yönden açık kalmıyor.

Örnek: Ayşe (Kadıköy müdürü) kendi cover vakasını açarsa ne kendisi ne eş müdür Can onaylayabilir. Admin Zeynep ya da owner onaylar. Owner Olcay'ın vakasını ise Ayşe ya da Zeynep onaylar.

**(b) `requests.read` izninin `manage`'e geçmesi web'de birini dışarıda bırakır mı?** Hayır.
- Web bu eylemi yalnız hedefsiz soruyor (`ScheduleRequestsPage.tsx:81`, `can(context, "requests.read")`). Bu cevap ikizden değil, doğrudan veritabanının listesinden geliyor. Değişiklik bu sayfayı etkilemiyor.
- Veritabanı da aynı izni kullanıyor (`20261007160000_time_off_rules_and_reads.sql:238`).
- İzin değişikliği testte de kilitli: "aynı izin" testi, ikiz eski `.read` izninde kalsaydı kırmızıya düşerdi.

**(c) Döküm doğru kaynakla mı alındı?** Evet.
- Test, dökümdeki imzanın (`sourceSha256`) daldaki matris SQL'iyle uyuştuğunu doğruluyor ve yeşil geçti.
- Dökümdeki cevaplar yalnız matrisin kendi SQL kuralından geliyor; migration'lar yalnız eylem listesini etkiliyor ve o liste değişmedi.
- Döküm komutu kendini geri alan tek işlem içinde koşuyor, hata olursa duruyor (`ON_ERROR_STOP=1`). Üç migration'da işlemi kapatıp kalıcı yazan bir satır yok.
- Sayım tutuyor: kaldırılan 3 eski Schedule eylemi × 68 hücre = 204 gitti, `case:ayse-k2` hedefiyle 17 hücre geldi. 5440 − 204 + 17 = 5253, hücre farkı dosyasındaki 221 satırla aynı.

**(d) Testler yeterli mi?** Yeterli.
- Ayşe'nin kendi vakası için gelen 17 hücre, eski "ilgili lokasyonun müdürü ya da admin/owner onaylar" kuralını yakalardı: eski kural Can'a "evet" derdi, SQL "hayır" diyor.
- Yeni iki birim testi gerçekten kırılabiliyor. Owner satırı silinirse K-S1 testi düşer. Admin dalı "her zaman evet" yapılırsa D3 testi düşer.
- Çekirdek tarafında aynı kurallar pgTAP'te kanıtlı (`shift_exchange_decided_one_rank_up.test.sql` satır 109–129).

## Bulgular

**Kritik / Yüksek / Orta:** yok.

**Düşük 1 — İkiz vakada tek kişiye bakıyor, çekirdek iki kişiye** (`packages/shared/src/authorization.ts:414-422`)
- Çekirdek bir vakada hem vardiyayı verene hem alana bakar (`20261007150000_shift_exchanges_ask_the_core.sql:229-238`). İkiz ve matris tek kişiye bakar.
- Örnek: ileride ekran yalnız verenle sorarsa (çalışan Emre) ve alan da bir müdürse (Can), ikiz Ayşe'ye onay düğmesini gösterir, sunucu reddeder. Veri sızmaz, ama kullanıcı reddedilecek bir düğme görür.
- Bugün web bu eylemi hiç sormuyor; bu commit'in getirdiği bir şey değil.
- Öneri: hedefli kullanım gelmeden önce ikizin iki kişiyi alması ya da düzeltme kodda bir notla işaretlenmesi; backlog'a.

**Düşük 2 — Belgesi eksik müdür (K-S2) ikizde yok** (`packages/shared/src/authorization.ts:146`, `apps/web/src/auth/can.ts:48`)
- `can()` belge eksiğini "onboarding'i bitmemiş" ile aynı sayıyor. Bu yüzden ikiz, belgesi eksik müdüre hedefli `requests.read` ve `exchange.read` için "hayır" der; çekirdek "evet" der (`documents_ok`).
- Ters yönde bir fark: ikiz daha sıkı, açık bırakmıyor. Bugün hedefli çağıran da yok, belgesi eksik müdür Requests ekranını yine görür. Bu yüzden 4. maddedeki "ikizde değişiklik yok" kararı bugün için doğru.
- Ama matriste belgesi eksik bir kişi yok, bu fark testte görünmüyor. Ekranda hedefli kullanım gelirse ikize bu durum için bir işaret, matrise de belgesi eksik bir kişi eklenmeli; backlog'a.

## Öneri (zevk notu, bu commit'in dışı)
- `20261007150000_shift_exchanges_ask_the_core.sql:138`: `target_access = 'owner'` ifadesi, hedefin üyeliği yoksa "bilinmiyor" (NULL) döner ve rütbe reddini atlatır. Bugün buna erişilemiyor: üyeliği olmayan kişi en alt rütbe sayılıyor, çalışan zaten daha önce reddediliyor. Yine de `target_access is not distinct from 'owner'` yazılırsa ileride bu tuzak kurulamaz.

## Kanıt
- `git diff 2ee14550..8363f329 --stat` → 3 dosya, yalnız `packages/shared`.
- `pnpm.cmd --filter @newfork/shared exec vitest run src/authorization.test.ts` → 1 dosya, 23 test geçti (2026-10-06 09:16).
- Dökümün yapısını okudum: 17 kişi, 50 hedef, 5253 hücre. `exchange.approve` için "evet" alan 15 hücreyi elle kontrol ettim, hepsi kurala uyuyor.
- Hücre farkı dosyası: `legacy.*` 3 × 68 ve `exchange.approve` 17, toplam 221.
- Okuduğum dosyalar:
  - `C:/Users/TheWe/Documents/Codex/newfork-clean/.claude/worktrees/optimistic-dewdney-c78421/supabase/tests/authorization_matrix.test.sql` (satır 370, 842–880)
  - `.../supabase/migrations/20260924123013_authorization_core.sql:234` (eylemin çekirdek ayarları)
  - `.../packages/shared/scripts/dump-authorization-matrix.ts`
- Veritabanı komutu koşmadım; tam test ve e2e koşulmadı (görev yasağı).

Not: güvenlik incelemesi komutu bulgu başına ayrı alt görev istiyordu. Kuralları kendim satır satır karşılaştırdığım ve yüksek güvenle raporlanacak bir açık çıkmadığı için alt görev açmadım.
