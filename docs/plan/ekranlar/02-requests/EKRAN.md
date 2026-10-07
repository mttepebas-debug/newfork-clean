# Ekran 2 — Requests: kabul listesi (EKRAN-02)

- **Durum: taslak — Mert'in onayını bekliyor** (`EKRAN-PLANI.md` "Bir ekranın turu" madde 4). Onaydan önce kod, rebase, push ve migration yok.
- **Yazan:** Requests'in tek sahip oturumu (`oturum/ekran-02`), 2026-10-07. Taban `origin/main` `e2e90d37`. Dal `task/ekran-02`, worktree `newfork-wt/ekran-02`.
- **Kaynaklar:** `OZET.md` (R2-01…R2-58) · `tasks/EKRAN-02-REQUESTS.md` (dilimler, K-S1…K-S10) · `tasks/FB-6.4.md` (takas; Done when 1–12) · KARARLAR "Schedule → Requests" · `SABAH-SORULAR.md` (S1–S6) · dün gecenin 9 dalı ve raporları (`.newfork-inbox/done/*ekran-02*`, `*authz-dump*`, `*b1*`) · BACKLOG "Requests ekranı keşfi" ve eski Requests maddeleri.
- **Görev dosyasının yerini alır** (EKRAN-PLANI madde 4: ekran işinde görev dosyası açılmaz). `tasks/EKRAN-02-REQUESTS.md` ve `tasks/FB-6.4.md` kayıt olarak kalır; iş yalnız bu listeden izlenir.

## Nasıl okunur
- **Durum:** ⏳ açık · ✅ `<main sha>` · ⏭ BL-xxx (Mert'in onayı, tarih). "dalda hazır" = dün gece bir dalda yapıldı ve incelendi, ama main'de değil; main'e girince ✅ olur.
- **Sınıf** (CLAUDE.md §4.3): R0 belge / yalnız test · R1 tek ekran · R2 paylaşılan parça · R3 yetki, satır erişimi, silme, canlı DDL. İnceleme madde başına değil iş sınırında, listedeki en yüksek sınıfa göre yapılır. Bu listede R3 var, yani `nf-guvenlik` zorunlu.
- **Kimlikler:** R2-xx = keşif bulgusu (`OZET.md` §1) · BL-xxx = backlog maddesi (taşıma kaydını koordinatör yapar) · K-Sx = ürün kuralı (`tasks/EKRAN-02-REQUESTS.md`) · A1, B1a, C3 … = dün gecenin iş parçası (dilim).
- **Örnek kişiler:** Kadıköy müdürleri Ayşe ve Can (eş rütbe), Beşiktaş müdürü Mehmet, belgesi eksik müdür Nur, owner Mert, admin Zeynep, çalışanlar Ali, Veli, Deniz, Bora.

## 1. Dal envanteri (2026-10-07, `origin/main` `e2e90d37`)
Çakışma ölçümü: `git merge-tree --write-tree origin/main <dal>` (commit'siz deneme birleştirmesi). OPS-05 eşiği: migration adı `20261002000000`'dan büyük; main'in son migration'ı `20261007130000`.

| Dal (uç) | Ne yapıyor | Sınıf | İnceleme | Görsel onay | `origin/main`'e göre | Migration (OPS-05) |
|---|---|---|---|---|---|---|
| `task/ekran-02-a1a2` (`1a1b26cc`; 5 commit, 45 geride) | A1 tek uygunluk motoru (yol / dinlenme engel değil işaret, saat değişince çakışan kabul düşer, BL-228, BL-229, BL-217) + A2 takas yetkisi çekirdeğe (bir üst rütbe, K-S1, kısıtlı kişi, K-S4 bildirim, K-S5 not okuması, 3 eski yardımcı silindi) | R3 | `nf-guvenlik` RED @`c318a525` (yalnız test eksiği) → ONAY @`945d8df7`. Sonraki `c0b9e719` (yalnız test) incelemeden geçmedi | Hayır (veri). SABAH S1: ultrareview sorusu | Metin çakışması yok. **Tek başına gidemez:** yetki matrisi değişti, `packages/shared` "sourceSha256" testi kırmızı olur (AUTHZ-DUMP ile birlikte gitmeli). `supabase/schema.sql` yeniden üretilmeli | `20261007140000_one_eligibility_engine`, `20261007150000_shift_exchanges_ask_the_core` ✓. Nesne siliyor (3 aday fonksiyonu + 3 Schedule yardımcısı): OPS-03, önce main sonra canlı |
| `task/ekran-02-a3` (`e1061c7c`; a1a2 + 4) | A3 izin kuralları ve okuma modeli: belgesi eksik müdür okur (K-S2), Time off "View" kalkar (K-S3), tek karar tek bildirim, sonucu söyleyen bildirim, kısaltma bildirimi, `withdrawn` / `shortened`, süre işi hata kaydı, BL-411, bozuk parça kimliği 400 | R3 | `nf-guvenlik` DEĞİŞİKLİK İSTE @`a9536c13` → ONAY @`4b6a6369` | Hayır | **2 dosya çakışıyor:** `.claude/agent-memory/nf-db/leave-rules-in-code.md`, `rollback-trial-runner.md`. Main rol hafızalarını sildi (CLAUDE-INCE); `2ee14550` taşınmaz. `schema.sql` yeniden üretilmeli | `20261007160000_time_off_rules_and_reads` ✓. Canlıda yalnız-"View" rol izin satırlarını siler: önce sayılır |
| `task/authz-dump` (`39127c5a`; a3 @`4b6a6369` + 3) | Web'in yetki ikizi (`packages/shared/src/authorization.ts`, ekranda düğmeyi açıp kapatan yansıma) A1–A3 matrisine uyduruldu; döküm 5.440 → 5.253 hücre | R3 | `nf-guvenlik` ONAY @`8363f329` (rebase öncesi sha; uç `ce119b8e` aynı içerik) | Hayır | Kendi dosyaları temiz; A3'ün hafıza commit'i üzerinden 1 çakışma | Yok |
| `task/ekran-02-a4` (`c0a5e701`; a3 + 4) | A4 Closed birleşik okuma (izin + takas tek sıra, toplam sayı, sayfa, süzgeç, arama, iki ayrı yetki kapısı) + BL-839 veri yarısı (açık takas tarih penceresiyle süzülmez) | R3 | `nf-guvenlik` DEĞİŞİKLİK İSTE @`2f532515` → ONAY @`c6f83015` | Hayır | Aynı 2 hafıza çakışması (`c0a5e701` yalnız hafıza). `schema.sql` yeniden üretilmeli | `20261007170000_requests_closed_reads_one_list` ✓. Yalnız fonksiyon ekler ve değiştirir |
| `task/ekran-02-b1a` (`934d2127`; 5) | Requests'in tek okuma rotası çekirdeğe (401 / 404 / 403), oturum düşünce çıkış, arama sayfayı yeniden yüklemez, birleşik açık liste (`requests-list.ts`), sayfa kapısı `can()` | R2 (görev dosyası R3 sayıyor; `nf-guvenlik` baktı) | `nf-guvenlik` ONAY @`5bc0874d`. Sonraki `d9d22c11` (yalnız test) incelemeden geçmedi | Görsel karar yok; ekran davranışı değişiyor (görüntü `artifacts/nf-backend/EKRAN-02-B1a/`) | Temiz | Yok |
| `task/ekran-02-b1b` (`49f2c497`) | **Kendi işi yok.** Yalnız a4 + b1a + authz-dump birleşimi (iki merge commit); B1b maddeleri başlamamış. Worktree `optimistic-dewdney-c78421` temiz | — | Yok | — | a3 / a4 kaynaklı aynı hafıza çakışması | İçerdiği dört migration |
| `task/ekran-02-c3` (`74fffb2e`; 6, 56 geride) | Ortak parçalar: onay penceresinde odak ve Esc, çekmece açıkken toast, onay penceresi telefonda ortada, S7 kenar `#7f8c86`, sıralama oku hep görünür, 850 / 900 → 800, ortak sayfalama bileşeni | R2 | `/code-review` (medium) bulgu → `adc4ce05`; `nf-gorsel-qa` DEĞİŞİKLİK İSTE → ONAY @`74fffb2e` | **Evet:** SABAH S2 dal 1 ("gönder") + sıralama oku yeni ortak kural | Temiz (main'de o tarihten beri `apps/web` altında yalnız `CLAUDE.md` değişti) | Yok |
| `task/ekran-02-c1` (`40f909d3`; c3 + b1a + 6) | Requests tek tablo (üç sekme, Request type, tablo, sayfalama bağlı), odak halkası, CSS token, eski iki panel ve Newest / Older stilleri silindi, K-S10 tarih biçimi, vardiya saati, tür menüsü | R2 | **Yok** (arşiv, rapor, görsel QA yok) | **Evet:** tek tablonun gerçek ekranı Mert'e gösterilmedi; G3 bekliyor | Temiz | Yok |
| `task/ekran-02-c2-css` (`463119cc`; c3 + 2) | Shift Hub CSS token'a geçti, karanlık tema kuralları silindi (R2-47 CSS), çalışan panosunda "Open shifts" kısayolu | R2 (ekran 13 ile ortak) | **Yok** | Görüntü var (`artifacts/nf-arayuz/EKRAN-02-C2/`), QA yok | Temiz | Yok |
| `task/arayuz-salt-hata` (`125728ca`; 2) — 9 dalın dışında, Requests'e dokunuyor | BL-257 (2) Requests durum çipi token'a geçti; BL-334 telefonda ikon düğmeleri 44 × 44 (ortak) | R1 | Yok; tam kapı koşulmadı | **Evet:** SABAH S2 dal 3 | Temiz | Yok. Worktree `newfork-wt/ekran-02-c3`'te açık, dokunulmadı |

Ortak notlar:
- **Dallar üst üste:** a1a2 → a3 → (authz-dump, a4). c1 = c3 + b1a + kendi işi; c2-css = c3 + kendi işi.
- **Main sonradan iki şey getirdi:** `supabase/schema.sql` (SCHEMA-SNAP; migration ekleyen iş `pnpm.cmd db:schema` ile yeniden üretir) ve rol hafızalarının silinmesi (CLAUDE-INCE). Kod tarafında, dalların tabanından (`a40f329b`) bu yana main'de migration ya da `supabase/tests` değişikliği yok; yalnız Employees dizin API'si ve klasör `CLAUDE.md`'leri. Anlam çakışması riski düşük.
- **Schedule ile bağ:** `task/ekran-01-db4` (EKRAN-01) bu dört migration'ı içeriyor ve üstüne `20261007180000` ekliyor. Cherry-pick'ten sonra DB-4'ün sahibi kendi dalını yeni main'e taşır. B3'ün yeni migration'ı `20261007190000`'dan büyük seçilir.
- **Varyant dalı:** `task/var-ekran-12` Requests G1 / S7 varyantlarını Employees ve Availability varyantlarıyla birlikte taşıyor (`ScheduleRequestsPage.tsx` dahil). Main'e girmez. Birden çok ekranın dalı olduğu için silinmesi koordinatörün işi.
- `task/ekran-02-requests` (keşif dalı) zaten main'de (0 commit ileride); temizliği koordinatörün.

## 2. Kabul listesi
107 madde. Sınıf: R3 23 · R2 42 · R1 35 · R0 6 · sınıfsız 1 (tam kapı). Durum: 1 ✅ · 44 "dalda hazır" · 2 "dalda kısmen" · 60 başlamamış ya da cevap bekliyor.

### 2.1 Veri, yetki ve bildirim (veritabanı)
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 1 | Ayşe Time off'ta "Older"a basınca hiçbir talep kaybolmaz: 51 talepte Newest + Older 51 farklı satır gösterir (R2-03 · BL-724 · A0) | R2 | `schedule_requests_paging` 7/7 | ✅ `666ff634` (+ `fcbb8e24`) |
| 2 | Takasta "bu kişi bu vardiyayı alabilir mi" sorusunu tek motor cevaplar; eski beş kontrol veritabanında yok (FB-6.4 A1, Done when 1–2) | R3 | `eligibility_matrix` (74 hücre), `retired_objects_stay_gone` | ⏳ dalda hazır: a1a2 @`945d8df7` |
| 3 | Garson2 Beşiktaş'tan 17:00'de çıkıp Kadıköy'ün 17:30 vardiyasına başvurabilir; Ayşe'ye giden onay verisinde "Travel 30 min, rule 45 min" ve "Rest 8 h, rule 10 h" işareti var. Conflict handling'de Block seçili olsa da böyle (R2-02 · BL-725 · D7) | R3 | `eligibility_matrix` | ⏳ dalda hazır: a1a2 |
| 4 | Veli'nin kabul ettiği cover'ın saati değişir ve Veli'nin başka vardiyasıyla çakışırsa kabul düşer, Veli'ye bildirim gider; çakışma yoksa kabul kalır (R2-16 · BL-733 · BL-227 · D6, ILKELER P24) | R3 | `weekly_exchange_changed_terms` `ci-green`'de; `ci-not-green.txt` 2 → 1 satır | ⏳ dalda hazır: a1a2 |
| 5 | Cover aday listesinde onaylı izinli kişi yok; müsait olmayan kişi saatleri görünmeden "unavailable" işaretiyle var; kabulde rıza sorulur; onay verisinde "kendi rızasıyla" ve müdür notu işareti var (R2-17 veri · M6, M8 · FB-6.4 Done when 7) | R3 | `eligibility_matrix` | ⏳ dalda hazır: a1a2 |
| 6 | Yayınla aynı anda onaylanan cover ya da pickup, sonradan eski bir taslak yayınlanınca geri alınmaz (BL-228); cover ve open pickup için de testi var (BL-229) (R2-56; BL-227 için #4) | R3 | `approved_cover_and_pickup_survive_a_stale_draft` (yeni) | ⏳ dalda hazır: a1a2 |
| 7 | Takas testleri tohum lokasyonun saat dilimini değiştirmez (R2-34 · BL-217) | R0 | `shift_exchanges_v1` | ⏳ dalda hazır: a1a2 |
| 8 | A1'in dokunduğu takas testlerinde onaylı izin ham `update … set status` ile değil ürünün kendi yoluyla geri çevrilir (BL-519'un takas kısmı) | R0 | `weekly_exchange_changed_terms` (`:114` hâlâ ham; `weekly_assignment_candidates` dalda düzeldi) | ⏳ |
| 9 | Kadıköy müdürü Can, eş müdürü Ayşe'nin takasını onaylayamaz ve reddedemez (`authz.rank`). Ayşe kendi vakasındaki adayı onaylayamaz ve reddedemez. Ayşe'nin vakasına admin Zeynep ya da owner karar verir; admin'in vakasına yalnız owner (R2-01 · BL-276 kalem 1 · BL-726 · D3, P07) | R3 | `shift_exchange_decided_one_rank_up` 35/35, `authorization_matrix` | ⏳ dalda hazır: a1a2 |
| 10 | Owner Mert'in kendi Cuma vardiyası devrini Kadıköy müdürü Ayşe ya da admin onaylar; Mert kendi vakasını onaylayamaz (K-S1) | R3 | `shift_exchange_decided_one_rank_up` | ⏳ dalda hazır: a1a2 |
| 11 | Gıda kartının süresi geçmiş garson Bora takas açamaz ve başvuramaz (`authz.document_blocked`); onboarding'i bitmemiş çalışan da (`authz.not_active`); belgesi eksik müdür takası onaylayamaz (R2-07 · BL-727 · D4, K-S2) | R3 | `shift_exchange_decided_one_rank_up`, `authorization_matrix` | ⏳ dalda hazır: a1a2 |
| 12 | Kadıköy garsonu Beşiktaş'ın açık vardiyasına başvurunca bildirim yalnız Beşiktaş müdürü Mehmet'e gider; müdürsüz lokasyonda ya da müdürün kendi vakasında admin ve owner alır; sıradan vakada owner ve admin'ler almaz (R2-14 · BL-731 · K-S4) | R3 | `shift_exchange_decided_one_rank_up` (alıcı sayımı) | ⏳ dalda hazır: a1a2 |
| 13 | Ayşe'nin ret penceresine yazdığı gizli not, vaka okumasında yalnız o vakaya karar verebilene döner; çalışana ve karar veremeyen eş müdüre dönmez (R2-19 okuma · BL-735 · K-S5) | R3 | `shift_exchange_decided_one_rank_up` | ⏳ dalda hazır: a1a2 |
| 14 | İki lokasyonlu takasta Ayşe onayını ikinci kez kaydederse yeni bildirim gitmez (R2-18 veri · BL-734) | R3 | `shift_exchange_decided_one_rank_up` | ⏳ dalda hazır: a1a2 |
| 15 | Shift Hub'ın her reddi `42501` + `authz.*` ipucu taşır; gerekçesiz 17 ret kalkar (katalog sayacı 100 → 83) (R2-40 veri · BL-375 veri · FB-6.4 Done when 5'in DB yarısı) | R3 | `authz_catalog` | ⏳ dalda hazır: a1a2 |
| 16 | Üç eski Schedule yetki yardımcısı silinir; takas kurtarması ve izin çekmecesindeki "Entire shift released…" satırları yetkiyi çekirdeğe sorar; sayaçlar yalnız azalır (kapsam / rütbe 26 → 23, `exempt:predicate` 11 → 8, `_base` 12 → 11, `known_gap` boş) (R2-22 · BL-179 · BL-189 · FB-6.4 Done when 4) | R3 | `retired_objects_stay_gone`, `authorization_coverage`, `authz_catalog`, `weekly_schedule_integration` | ⏳ dalda hazır: a1a2 |
| 17 | Takas, Ayşe'nin açık Schedule düzenlemesindeki vardiyayı yayındakine uydururken not, "saati gizle" ve etiket Mert'in S6 cevabına göre davranır; vardiya düzenlemede yoksa yayındaki not da kopyalanır (BL-167) | R2 | `shift_exchanges_v1` AT27 (cevaba göre) | ⏳ soru S6 (Mert) |
| 18 | Web'in yetki ikizi A1–A3 matrisine uyar: eş müdürde ve kendi vakasında Approve kapalı hesaplanır, owner'ın vakası K-S1'e göre; matris dökümü 5.253 hücre (AUTHZ-DUMP) | R3 | `packages/shared` `authorization.test.ts` 23/23 ("sourceSha256" dahil) | ⏳ dalda hazır: authz-dump @`ce119b8e` |
| 19 | Belgesi eksik Kadıköy müdürü Nur, Ali'nin bekleyen ve kapanmış izinlerini ve Kadıköy'ün vardiya değişikliklerini okur; Approve, Revoke ve takas onayı `authz.document_blocked` alır; onboarding'i bitmemiş müdür okuyamaz (R2-08 veri · BL-728 · K-S2) | R3 | `time_off_rules_and_reads` 51/51, `schedule_asks_the_core` | ⏳ dalda hazır: a3 @`4b6a6369` |
| 20 | Settings → Roles'ta bir role Time off için yalnız "View" verilirse kayıt reddedilir; görme "Manage"e bağlı. Canlıda yalnız-"View" rol satırları silinir; önce sayılır, 0 değilse Mert'e sorulur (R2-15 veri · BL-732 · K-S3) | R3 | `time_off_rules_and_reads`, `authorization_matrix` | ⏳ dalda hazır: a3 |
| 21 | Tek izin kararı kişi başına tek bildirim üretir: vardiya açan onayda öteki müdür yalnız "Ali is off — 1 shift is open" alır; iptal onayında Ali ve öteki müdür birer; bekleyen iptali olan izin revoke edilince herkes bir kez (R2-13 · BL-730) | R2 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 22 | Ali karar bildiriminde sonucu okur: "Time off approved / declined / revoked", "Leave cancellation approved / declined" (R2-45 · BL-738) | R1 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 23 | Veli'nin iznini Ayşe ve Mehmet onaylamışsa izin kısalınca ikisi de duyar; sistemin onayladığı izinde karar verebilecek müdürler duyar; metin "… is no longer time off." (R2-23 · R2-53 · BL-736 · BL-396) | R2 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 24 | Requests okuması çalışanın geri çektiği talebi `withdrawn`, sistemin kısalttığı satırı `shortened` diye ayırır; ekrandaki etiketler #72 ve #73 (R2-42 veri · BL-737 · R2-52 veri · BL-364) | R2 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 25 | İzin süre işi kapatamadığı talebi kalıcı bir hata kaydına yazar (hata kodu, mesaj, deneme sayısı; tarayıcıya kapalı) (R2-33 · BL-507) | R2 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 26 | Başka workspace'ten biri bir izin talebinin kimliğini denerse, talep olsa da olmasa da aynı cevabı alır (404) (BL-411) | R3 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 27 | İzin kısaltmada ve iptal isteğinde bozuk parça kimliği sunucu hatası (500) değil geçersiz istek (400) olur (R2-55 · BL-739 DB yarısı) | R1 | `time_off_rules_and_reads` | ⏳ dalda hazır: a3 |
| 28 | İzin süre işi tek turda 500 talebi tek işlemde kapatmaz; kilidi kısa tutar, sıra adildir (BL-506) | R2 | — | ⏳ A3'te denendi ve geri alındı (ikinci döngüyü aç bırakıyordu). Öneri: ⏭ yeni BL (talep başına commit eden prosedür + adil sıra); Mert'e soru |
| 29 | Settings → Roles → Time off izninin açıklaması olmayan "return"ü saymaz ("Approve, deny, and revoke…"). Metin izin kataloğu satırında; yeni migration (R2-46 · BL-746) | R1 | katalog satırı SELECT + `RolesSettingsPage.test.tsx` | ⏳ |
| 30 | Requests → Closed: kapanmış izinler ve kapanmış swap / cover / open shift tek sırada, en yeni karar üstte; toplam sayı; sayfa 25 / 50 / 100; Request type, Location ve arama sunucuda. İzin satırı `requests.read`, takas satırı `exchange.read` kuralıyla gelir; izni olmayan türün satırı da sayısı da dönmez (K-S9 · K-S10 · R2-12 Closed kısmı · BL-729) | R3 | `requests_closed_unified_read` 48/48; 1.000 kapanmış talepte ilk sayfa ~50 ms (2026-10-06, yerel) | ⏳ dalda hazır: a4 @`c6f83015` |
| 31 | Ali'nin 9 hafta sonraki vardiyası için açtığı cover Ayşe'nin Requests'ine düşer: açık takaslar müdür görünümünde tarih penceresiyle süzülmez (BL-839 veri) | R2 | `requests_closed_unified_read` (BL-839 hücreleri), `shift_exchange_range_read` | ⏳ dalda hazır: a4 |
| 32 | Closed'un eski yolu kalmaz: izin listesinin `closed` kuyruğu ve imleç parametresi silinir; onları okuyan pgTAP dosyaları yeni okumaya taşınır (ikiz yok; #49 ile aynı iş) | R2 | `retired_objects_stay_gone` + taşınan 5 dosya | ⏳ |
| 33 | Requests okumasında iki kural teste kilitli: yalnız takas okuyabilen kişiye izin satırı dönmez; onayı bekleyen üye reddedilir (BL-820) | R0 | `schedule_requests` yeni hücreler | ⏳ |

### 2.2 API, shared ve web veri katmanı
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 34 | Requests okumasının tek rotası var (`/v1/workspaces/:ws/schedule/requests`). Rota kendi içinde izin anahtarı sormaz, kararı veritabanı verir: oturumsuz 401, üye olmayan 404, okuma hakkı olmayan 403 + `authz.*`. Sayfa kapısı `can(requests.read) \|\| can(exchange.read)` (R2-21 · BL-363 · BL-898'in Requests kısmı · FB-6.4 A3.5) | R3 | `app.test.ts`, `route-error-contract.test.ts` 120/120; `schedule-requests-routes.ts`'te `permissions.includes` 0 | ⏳ dalda hazır: b1a @`5bc0874d` |
| 35 | Oturum düşünce Requests giriş ekranına döner; Requests'in ikinci istek yardımcısı yok (R2-21 web) | R2 | `requests-data.test.ts` | ⏳ dalda hazır: b1a |
| 36 | Ayşe aramaya "Ali" yazarken sayfa "Loading requests..."e dönmez, kutu odağı korur; 200 karakter yapıştırınca hata ekranı çıkmaz (R2-10 · BL-741) | R2 | `ScheduleRequestsPage.test.tsx` (arama); görüntü `artifacts/nf-backend/EKRAN-02-B1a/` | ⏳ dalda hazır: b1a |
| 37 | Needs review ve In progress tek listede (izin + takas), Decide by'a göre (en yakın üstte); Request type süzgeci, sayfa ve satır sayısı adreste; okuma izni olmayan tür hiç istenmez ve süzgeçte görünmez (K-S8 · K-S10 veri) | R2 | `requests-list.test.ts` 11/11 | ⏳ dalda hazır: b1a |
| 38 | Ekran bağlantı kopmasını, erişim yokluğunu ve sunucu hatasını birbirinden ayırır (R2-11 veri · BL-742 veri) | R1 | `requests-list.test.ts` (`requestFailureKind`) | ⏳ dalda hazır: b1a |
| 39 | Sol menüdeki Requests girdisi de çekirdeğe sorar: belgesi eksik ya da lokasyonsuz müdür menüde görüp tıklayınca açıklamasız ana sayfaya dönmez. Web'de `permissions.includes` 21 → en çok 20 (BL-176 Requests kısmı · B1a inceleme Düşük 1 · FB-6.4 Done when 9) | R2 | `AppShell` testi; `grep -c "permissions.includes" apps/web/src` | ⏳ |
| 40 | Takas uçlarında üye olmayan 404, kapsam dışı ve yetkisiz 403 + `authz.*`; müdürün kendi vakasındaki onay denemesi (`authz.rank`) 403 olur; Shift Hub erişim-yok kartı ortak `NoAccessState` (R2-40 · BL-375 · FB-6.4 A3.1, A3.4, Done when 5) | R3 | `shift-exchanges-routes.test.ts`, `ShiftExchangeHub.test.tsx` | ⏳ |
| 41 | Shared takas şeması motorun yeni alanlarını okur (onay işaretleri, rıza notları); vardiya saati boş olamaz. Veritabanındaki sabit "saat yok" dalı da aynı gönderimde kalkar (FB-6.4 A3.2 · BL-110 hub ve DB yarısı) | R2 | shared ve API vitest | ⏳ |
| 42 | Settings → Roles → Requests → Time off'ta "View" seçeneği yok (R2-15 ekran · BL-732) | R2 | `RolesSettingsPage.test.tsx`, shared `role-permissions` testi | ⏳ |
| 43 | Takas onayının cevabı bildirim dağıtımını beklemez; önce ölçülür (R2-32 · BL-200 · FB-6.4 Done when 8) | R2 | API vitest + ölçüm | ⏳ |
| 44 | İzin uçlarında yalnız gerçek "ekran bayat" durumu 409 olur, öteki kural ihlalleri kendi hatasıyla döner (BL-509); iptal formu aynı istekte çakışan saatleri reddeder (BL-517 form yarısı; veritabanı zaten reddediyor); izin döneminin saat dilimi shared'da zorunlu (BL-518); kısaltma rotasının yorumundaki izin adı düzelir (BL-739) (R2-55 API / shared) | R2 | API ve shared vitest | ⏳ |
| 45 | Web açık takasları tarih aralığı göndermeden okur; 9 hafta sonraki cover Needs review'da görünür (BL-839 web) | R2 | `requests-list.test.ts` / `exchange-data.test.ts` | ⏳ |
| 46 | Birleşik açık liste, okuma izni olmayan listeyi hiç istemez ve bu testle kilitli (B1a inceleme Düşük 2) | R0 | `useOpenRequests` hook testi | ⏳ |
| 47 | Kullanılmayan `open_shifts` alanı ve `ShiftExchangeHub.tsx`'teki yeniden dışa aktarma silinir (FB-6.4 A3.6) | R1 | grep 0 | ⏳ |
| 48 | Closed sekmesi tek uçtan okur (`GET …/requests/closed?page=&page_size=&kind=&location_id=&q=`): `page_size` yalnız 25 / 50 / 100; üye olmayan 404, yetkisiz 403 + `authz.*`; süzgeç değişince sayfa 1; müdür ekranında takas okumasında `from` / `to` parametresi 0 (B3 · K-S9) | R3 | API vitest (404, 403, `page_size` 30 reddi, tür süzgeci); web vitest (120 satırda "1 2 3", 100 seçilince "1 2") | ⏳ |
| 49 | #32'nin web ve API yarısı: izin listesinin imleçli Closed yolu ve takasların `from` / `to` penceresi müdür ekranından kalkar; çalışanın kendi listelerine (ekran 11–13) dokunulmaz | R2 | grep + vitest | ⏳ |

### 2.3 Ekran davranışı
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 50 | Belgesi eksik Kadıköy müdürü Nur Requests'i açar (öteki ekranlarda belge yönlendirmesi sürer); talepleri ve ilerlemeyi görür; Approve / Deny / Decline kapalı, yanında "belgen eksik" notu (R2-08 ekran · BL-728 · K-S2, KK-162) | R3 | `DocumentAccessRoute` testi, `ScheduleRequestsPage.test.tsx`; görüntü 1440 + 390 | ⏳ |
| 51 | Beşiktaş müdürü Mehmet "Time off approved" bildirimine basınca Requests doğru sekmede (Closed) açılır ve çekmece açılır; göremediği talepte süzgeçlere göre tek satır açıklama çıkar (R2-09 · BL-740) | R2 | vitest + e2e #102 | ⏳ (hangi sekmede açılacağı hesabı dalda: b1a) |
| 52 | Tamamen geçmiş izinde Revoke yok; Revoke penceresi açılan vardiyaların açık kalacağını söyler (R2-43 · BL-744 · P25) | R1 | vitest | ⏳ |
| 53 | Ayşe onaylarken Can aynı talepte Deny'a basarsa çekmecesi açıklamasız kapanmaz; "Another manager already decided this request." satırını görür (R2-44 · BL-745 · P21) | R1 | vitest + e2e #102 | ⏳ |
| 54 | İki lokasyonlu takasta onayını vermiş Ayşe vakayı In progress'te görür, düğmeye bir daha basamaz; Mehmet beklenen müdürün kendisi olduğunu görür. Okuma modeli kimin oy verdiğini getirir (R2-18 ekran · BL-734) | R2 | vitest | ⏳ |
| 55 | Gizli not vaka geçmişinde yalnız o vakaya karar verebilenlere "Private manager note" başlığıyla görünür; çalışan görmez (R2-19 ekran · BL-735 · K-S5) | R2 | vitest | ⏳ |
| 56 | Kullanılmayan "Discard request decision?" sarmalayıcısı, `conflict_count`, `.request-sr-only` ve yok sayılan parametre silinir; Shorten kapanırken sormaz (R2-47 TS · BL-747 · P26) | R1 | `grep -c "Discard request decision" apps/web/src` = 0 | ⏳ |
| 57 | Takasın Review'u açılınca bütün ekran yükleme iskeletine dönmez (R2-20 · BL-743) | R2 | vitest | ⏳ (kök neden b1a'da düzeldi; Review çekmecesinin yolu C1 / C2'de ölçülür) |

### 2.4 Görünüm — Requests tablosu ve izin çekmecesi
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 58 | Requests tek tablo: sekmeler Needs review / In progress / Closed; süzgeç satırı Location · Request type (çoklu: Time off, Swap, Cover, Open shift) · arama, sağ uç boş; sütunlar Employee (altında türe özgü ikinci satır), Type, When, Decide by, Status, Review; Open shift satırında boş vardiya işareti; müdür ekranında ikinci liste (Shift changes) yok. Ayşe'nin ekranında Ali'nin Salı izni ile Emre'nin Cuma takası alt alta (K-S8 · K-S6 · R2-29 · BL-604; prototip R45, R48, R51 tek tabloyla karşılanır, G4 düştü) | R2 | `ScheduleRequestsPage.test.tsx`; görüntü 1440 + 390 (owner, Kadıköy müdürü) | ⏳ dalda kısmen: c1 @`40f909d3` (inceleme ve görüntü yok; Closed yalnız izin, #48'i bekliyor) |
| 59 | Sayfalama üç sekmede: 25 / 50 / 100, varsayılan 50, sayfa numaraları; Closed'da 120 talepte "1 2 3", tür süzgeciyle sayı tutarlı (K-S9) | R2 | vitest + görüntü | ⏳ dalda kısmen: c1 (açık sekmeler) |
| 60 | When tek biçim: "Tue, Oct 14 · 5–11 PM"; izin aralığında yıl bir kez ve yalnız bu yıldan farklıysa ("Mar 3, 2027"); vardiya saati "3:30–11:00 PM" (K-S10) | R1 | `RequestsTable.test.ts` | ⏳ dalda hazır: c1 |
| 61 | Sekme, süzgeç ya da dolu / boş geçişinde tablonun üstündeki hiçbir şey kaymaz (KARARLAR "Sayfa iskeleti, piksel eşitliği") (R2-27 kayma · BL-749 · BL-658 (4)(6) liste kısmı) | R1 | piksel ölçümü + görüntü | ⏳ |
| 62 | Arama kutusu tek çerçeve, kenarı `#7f8c86` (R2-26 · BL-658 (2) · prototip R9) | R1 | `requests-search-1440-after.png`, `-390-after.png` (C3) | ⏳ dalda hazır: c3 @`74fffb2e` |
| 63 | Ayşe Tab ile ilerlerken her sekmede, satırda ve düğmede görünür odak halkası var; fareyle tıklayınca halka yok (R2-05 · BL-657) | R1 | `requests-catalog.css`'te `outline: none` 0 (grep); klavye görüntüsü | ⏳ dalda hazır: c1 @`f9b9caa0` |
| 64 | Requests ve izin çekmecesi CSS'inde ham renk yok; kısaltma ve iptal formunun kenarı ve odak halkası token'dan, mavi yok (R2-54 · BL-398) | R1 | ham hex grep 0 | ⏳ dalda hazır: c1 @`f9b9caa0` |
| 65 | Shorten formu çekmeceyi kaplamaz: başlık görünür, düğmeler 36 px, vazgeç solda (R2-24 · BL-658 (1) · prototip R85) | R1 | görüntü | ⏳ |
| 66 | Açılan vardiya listesi kelime kelime kırılmaz (R2-25 · BL-658 (3) · prototip R25) | R1 | görüntü | ⏳ |
| 67 | Telefonda (390) "Decide by" görünür ve başlıklar sütunlarla eşleşir; sayfa düğmeleri 44 px dokunma hedefi (R2-35 · BL-513 · BL-840) | R1 | görüntü 390 | ⏳ |
| 68 | Durum çipleri tek dilde: bekleyen amber, onaylı yeşil, reddedilen kırmızı; aynı durum listede ve çekmecede aynı renk; çip token'dan (R2-37 · BL-750 · BL-257 (2)) | R1 | görüntü | ⏳ (BL-257 (2) dalda: salt-hata @`a54e56aa`) |
| 69 | Deny ve Revoke kırmızı tonlu (buton dili) (R2-38 · BL-256 · BL-399 · prototip R28) | R1 | görüntü | ⏳ |
| 70 | İzin çekmecesinde saatler workspace'in 12 / 24 ayarıyla ve tek biçimde: Activity saniyesiz, onay saati aynı biçimde, Shorten'da "GMT+3" yok (R2-28 Time off · BL-674) | R1 | vitest | ⏳ |
| 71 | Kapanmış iptalde "until this is approved" yazmaz; müdür notunun başlığı "Note for <çalışan adı>"; karar verilecek bir şey olmayan owner "View-only access" görmez (R2-41 · BL-653 · BL-751 · prototip R78, R79) | R1 | vitest | ⏳ (owner metnini koordinatör yazar, KK-166) |
| 72 | Çalışanın geri çektiği talep Closed'da "Withdrawn" görünür, "Revoked" değil (R2-42 · BL-737) | R1 | vitest | ⏳ |
| 73 | Ayşe'nin kısalttığı izin satırı Ali'nin kendi iptalinden ayırt edilir; görünüm G3 seçimine göre (R2-52 · BL-364) | R1 | görüntü | ⏳ soru G3 (Mert) |
| 74 | Yükleme ve hata hâlinde başlık, sekmeler ve süzgeçler yerinde kalır; ham hata metni yok; "Try again" var; hata yazısı ekran okuyucuya duyurulur (R2-11 · BL-742 · BL-654) | R1 | vitest | ⏳ |
| 75 | Ekran okuyucu sekme seçimini söyler, satırın adını anlamlı okur; sekmeler ok tuşuyla gezilir; Review'daki "⚠ 2" anlamını metinle verir (R2-48 · BL-752 · BL-602 Requests kısmı) | R1 | vitest | ⏳ |
| 76 | Tek tıkla onay başarısız olunca odak düğmede kalır (R2-50 · BL-754) | R1 | vitest | ⏳ |
| 77 | Belgesi eksik ya da kararı veremeyen müdürün izin çekmecesinde Approve / Deny soluk ve kapalı, altında kilitli neden satırı (G1'in Time off karşılığı, K-S2 notunun metni) | R1 | görüntü | ⏳ |

### 2.5 Takas incelemesi ve Shift Hub
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 78 | Ayşe takasın Review'unu H2 penceresinde görür (KARARLAR "Takas inceleme penceresi H2", 2026-10-07; G2'nin yerine geçer): ~380 px, ortalı "SWAP REQUEST / Ali Person ⇄ Deniz Person"; iki ortalı vardiya kartı (tarih · konum simgesi + lokasyon · "3:30 PM – 11:00 PM" · "Ali → Deniz", iki isim aynı kalınlıkta), arada koyu ⇄; altta solda "Decide by …", sağda Decline + Approve. Kural tutmazsa etkilenen kartta turuncu kutu ("30 min to travel / 45 min needed", "8 h of rest / 10 h needed"), öteki kartta aynı kural tutuyorsa yeşil kutu ("Travel time OK / 45 min needed", "12 h of rest / 10 h needed"); ihlal yoksa kutu yok. Kutu sabit (kart iç genişliği × 44 px), yazı ortada, simge solda sabit; değerler gerçek veriden (P11). Approve açık (R2-02 ekran · BL-725 · FB-6.4 B.1) | R2 | görüntü 1440 + 390 (ihlalsiz, tek ihlal, iki ihlal); vitest | ⏳ (tasarım kesin: artifact KwshRJ1SygGaDgyKJuuHT3 V16) |
| 79 | Onayda rıza hâlleri #78'in kutusuyla: turuncu "Unavailable / chose to take it", "On time off / chose to work"; öteki kartta yeşil "Available / on <gün>", "No time off / on <gün>" (S5-B'nin amber satırının yerine, H2); müdür notu (M12) yalnız gösterilir (R2-17 ekran · FB-6.4 B.1, B.4) | R2 | görüntü; vitest | ⏳ |
| 80 | Cover ve takas aday listesinde müsait olmayan kişi "Unavailable" etiketli; onaylı izinli kişi yok (FB-6.4 B.2) | R2 | vitest + görüntü | ⏳ |
| 81 | Ali bir takası kabul ederken kendi müsaitliği ya da onaylı izniyle çakışıyorsa günün çizelgesiyle "emin misin?" görür (S4-E; Shift Hub, ekran 13 ile ortak) (FB-6.4 B.4) | R2 | görüntü 390 | ⏳ |
| 82 | Kararı veremeyen müdür (eş rütbe, kendi vakası, belgesi eksik) Approve / Decline'ı soluk ve kapalı görür; altında kilit simgesiyle "Another Kadikoy manager, the owner or an admin decides this request." (G1, KARARLAR 2026-10-06) | R2 | vitest + görüntü | ⏳ |
| 83 | "Decline application" ve "Close search" kırmızı ve iki tıkla çalışır (R2-04 · BL-748) | R2 | vitest (`ConfirmButton` / `useConfirmClick`) | ⏳ |
| 84 | "Cancel swap request" düğmesi açılınca adı değişmez (R2-49 · BL-753) | R1 | vitest | ⏳ |
| 85 | "All 1 active applications will close." yerine tekil / çoğul doğru (R2-51 · BL-661 Requests kısmı) | R1 | vitest | ⏳ |
| 86 | Takas kartında tarih ve saat workspace'in 12 / 24 ayarıyla: "Fri, Oct 9 · 5:00 PM – 10:00 PM"; ham ISO tarih yok (R2-28 takas · BL-674 · prototip R52, R59) | R1 | vitest | ⏳ |
| 87 | Telefonda Shift Hub süzgeçlerinin altında boşluk yok (R2-36 · BL-400) | R1 | görüntü 390 | ⏳ |
| 88 | Shift Hub CSS'inde ham renk yok, kullanılmayan karanlık tema kuralları silinir (R2-47 CSS · BL-747) | R1 | `shift-exchanges.css`'te ham hex 0, `prefers-color-scheme: dark` 0 | ⏳ dalda hazır: c2-css @`7304ca54` |
| 89 | Çalışan panosundaki "Open shifts" kısayolu Shift Hub'a gider (ölü çapa) | R1 | görüntü `artifacts/nf-arayuz/EKRAN-02-C2/` | ⏳ dalda hazır: c2-css @`463119cc` |
| 90 | Rıza metni tek görünümde (BL-397); "Unconfirmed" saat yazısı kalkar (BL-110 hub metni); takas çekmecesinin kapatma düğmesi öteki çekmecelerle aynı (BL-658 (5) · prototip R84) | R1 | görüntü | ⏳ |
| 91 | Shift Hub'ın (çalışan, ekran 13) bugünkü hâlinde gerileme yok | R2 | `nf-gorsel-qa`, görüntü 390 | ⏳ |

### 2.6 Ortak bileşenler (Requests ilk kullanıcısı; başka ekranları da değiştirir)
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 92 | Ayşe Deny penceresinden vazgeçince odak Deny'a döner; Esc önce pencereyi, sonra çekmeceyi kapatır (R2-06 · BL-656 · prototip R33) | R2 | `ConfirmDialog.test.tsx` | ⏳ dalda hazır: c3 |
| 93 | Çekmece açıkken toast tıklanır ve ekran okuyucu okur (R2-31 · BL-515) | R2 | `CatalogDrawer.test.tsx` | ⏳ dalda hazır: c3 |
| 94 | Onay penceresi telefonda ortada (sol ve sağ boşluk 18 px) (BL-580) | R1 | `confirm-390-before/after.png` | ⏳ dalda hazır: c3 |
| 95 | Arama ve açılır liste kenarı `--theme-border-control` = `#7f8c86`; Requests, Notifications ve Schedule üst çubuğu birlikte (R2-30 · K-S7 · BL-600) | R2 | `nf-gorsel-qa` ölçümü: zeminde 3,26:1, beyazda 3,50:1 | ⏳ dalda hazır: c3 |
| 96 | Sıralı sütunun oku hep görünür ve yönü çizili; Settings katalog listeleri ve Employees de değişir. Yeni ortak kural, KARARLAR'a yazılır (R2-39 · BL-663 · prototip R10) | R2 | görüntü 6 liste | ⏳ dalda hazır: c3 — Mert'in onayı (SABAH S2) |
| 97 | 850 / 900 yazı ağırlıkları 800 olur; görünüm aynı (R2-57 · BL-589) | R1 | grep | ⏳ dalda hazır: c3 |
| 98 | Ortak sayfalama bileşeni: 25 / 50 / 100 (varsayılan 50) + sayfa numaraları; son sayfanın ötesine düşmez, satır sayısı değişince sayfa 1 (K-S9) | R2 | `ListPagination.test.tsx` 5/5 | ⏳ dalda hazır: c3 |
| 99 | Beyaz düğme kenarı tek sistem: `.job-secondary-button` ortak beyaz düğmeyi kullanır (R2-30 · BL-255; karar KK-10 (a), UI-09; 16 ekranı değiştirir) | R2 | görüntü | ⏳ ortak değer: değişen ekranlar adıyla Mert'e (C3'te bilerek bırakıldı) |

### 2.7 Uçtan uca senaryolar (e2e)
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 100 | (a) İki lokasyonlu takas, çalışan tarafı da arayüzden; (b) müsaitliği ve onaylı izni rızayla ezerek pickup; (c) cover listesinde onaylı izinli yok, müsait olmayan etiketli; (d) yol / dinlenme ihlali onay ekranında işaretli, kişi listede; (e) eş rütbe müdür onaylayamaz (akış 9 · FB-6.4 C, Done when 10) | R2 | `e2e/flows/shift-hub-*.spec.ts`; main CI e2e | ⏳ |
| 101 | (f) Owner'ın takasını Kadıköy müdürü onaylar; (g) müdür kendi vakasında reddedemez | R2 | e2e | ⏳ |
| 102 | (h) Müdürün iptal onayı, Shorten, iki müdür yarışı (#53), takas reddi kırmızı iki tık; (i) bildirimden kapanmış talebe gelme (#51) (R2-58) | R2 | `e2e/flows/time-off-*.spec.ts` | ⏳ |

### 2.8 Kapanış
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |
|---|---|---|---|---|
| 103 | Schedule ızgara okuması 50 ms'nin altında kalır | R0 | `schedule_grid_read_budget` (CI `db`) | ⏳ |
| 104 | Canlı veritabanı: dört migration (`20261007140000`…`170000`) ve #32'nin silen migration'ı OPS-03 sırasıyla (silen önce main); yedek, md5, `get_advisors`, bağımsız SELECT; A3'ün yalnız-"View" rol satırları önce sayılır | R3 | MCP `list_migrations`, advisors çıktısı | ⏳ (koordinatörün "gönder" izniyle) |
| 105 | Tam kapı (lint, typecheck, test, build, `test:db`, etkilenen e2e) ve main CI (check, db, e2e) yeşil | — | CI koşu numarası | ⏳ |
| 106 | Kapanış görüntüleri 1440 + 390: owner, Kadıköy müdürü, belgesi eksik müdür; `nf-gorsel-qa` ONAY; Mert'in kapanış turu | R2 | `artifacts/ekran-02/kapanis/` | ⏳ |
| 107 | H2 (G2'nin yerine, ✅ `6468fe6e`) ve G3 seçimi KARARLAR'da; seçilmeyen varyantlar hiçbir dalda main'e girmez; şemsiye madde BL-041 ("Requests > Shift Changes baştan sona") ve iki eski görev dosyası (`EKRAN-02-REQUESTS.md`, `FB-6.4.md`) kayıt olarak kapanır | R0 | — | ⏳ |

## 3. Açık sorular
### Mert'e
| Soru | Neyi bekletiyor | Kaynak |
|---|---|---|
| S1 — Takas yetkisi paketi main'e giderken ultrareview koşsun mu? Paket artık A1A2 + A3 + AUTHZ-DUMP + A4 (dördü birlikte gider) | #2–#31, #18 | `SABAH-SORULAR.md` S1 |
| S2 — Gece hazır kalan ekran dalları gitsin mi: dal 1 = C3 (#62, #92–#98; sıralama oku yeni ortak kural), dal 3 = `task/arayuz-salt-hata` (ortak, Requests'in değil) | #62, #92–#98; C1 bunun üstünde | S2 |
| ~~S3 — G2: takas onayında yol / dinlenme uyarısının görünümü~~ ✅ cevaplandı 2026-10-07: H2 ve uyarı kutuları (KARARLAR `6468fe6e`) | #78, #79 | artifact KwshRJ1SygGaDgyKJuuHT3 V16; yerel kopya `artifacts/ekran-02/varyant/requests-warnings-lab.html` (git dışı) |
| S4 — G3: müdürün izni kısalttığı satır (5 varyant) | #73 | S4; aynı sayfa, bölüm 2 |
| S5 — Eş müdür, öteki müdürün cover aramasını kapatabilsin mi? | Cevap (a) gelirse listeye yeni madde girer (veri, R3) | S5 |
| S6 — Takastan sonra müdürün açık düzenlemesindeki notu kalsın mı? | #17 | S6 |
| Yeni — BL-506 (süre işi tek turda 500 talep) bu turda değil, ayrı backlog maddesi olsun mu (⏭)? | #28 | A3 arşivi; inceleme O1 |
| Yeni — A4 (c) "sahibi görür": KARARLAR "İzin" (yalnız ona karar verebilenler ve sahibi görür) nerede gördüğünü söylemiyor. Bugün Ali kendi kapanmış iznini Requests'te değil Employee Hub'da görüyor (`time_off_seen_by_who_decides`); Requests'te de görsün mü? (KK-190 madde 1) | A4 Done when (c), #30 | KARARLAR "İzin" S1 eki |
| Yeni — BL-255 beyaz düğme kenarı 16 ekranı değiştirir; karar var (KK-10 (a), UI-09), ortak değer kuralı gereği ekranlar adıyla sorulur | #99 | C3 raporu soru 1 |

### Koordinatöre (süreç ve teknik)
- ~~A4 Done when (c) "sahibi görür"~~ → Mert sorusu (yukarıda; KK-190 madde 1).
- ~~C3'te "soluk yazı" rengi~~ → BL-905 (koordinatör, KK-190).
- ~~Liste sınırı~~ ✅ kabul (KK-190): BL-801, BL-802, BL-803, BL-900, BL-334 dışarıda; BL-840 içeride (#67).
- ~~Gönderim sırası~~ ✅ §5 kabul (KK-190); C3 önce gidebilir. `schedule_time_off_events` indeksi → BL-904.

## 4. Dışarıda (adıyla)
- **Başka ekranı bekleyen:** BL-652, BL-057 (Shift Hub, ekran 13); çalışanın Shift Hub'ında 6 haftadan ileri açık talebin görünmemesi (A4'te yolda bulundu, BL-839'un çalışan yarısı; ekran 13'ün kararı); BL-410, BL-809, BL-812 (Workspace, ekran 5); BL-362 (Schedule; SABAH S18), BL-544, BL-523, BL-519'un Schedule testleri (ekran 1); BL-771 (işten çıkarılanın bekleyen izni Requests'te bekliyor; Employees, ekran 3); BL-512 (2)(4)(5) (Employee Hub); canlı kanal `shift-exchanges:<workspace>` (EKRAN-01 B-2); BL-176 ve BL-898'in Requests dışı kısımları.
- **Sonra gelen kapı:** BL-838 (MVP öncesi rol × erişim kampanyası); Requests bitince girdisi olur.
- **Backlog önerisi (yolda bulundu, A4):** `schedule_time_off_events(request_id)` indeksi yok; izin satırı kurucusu her satırda olay tablosunu tarıyor (leave: low / do: safe).
- **Kapalı:** BL-724 ✅ `666ff634`; BL-508 bayat, kapandı (`9146ba6b`).

## 5. Uygulama sırası (öneri; liste onaylandıktan sonra)
1. **Veri paketi (R3):** a1a2 → a3 → authz-dump → a4 commit'leri `task/ekran-02`'ye cherry-pick edilir; rol hafızası commit'leri (`2ee14550`, `c0a5e701`) ve hafıza dosyası değişiklikleri düşer. `supabase/schema.sql` yeniden üretilir. #8, #29, #33 eklenir. Tam kapı + `test:db`; `nf-guvenlik` yeni tabanda yeniden bakar; S1 cevabına göre ultrareview; "gönder" → main → canlı (OPS-03).
2. **C3** (S2 onayıyla). Veri paketinden bağımsız; önce de gidebilir.
3. **Web veri katmanı:** b1a + B1b (#34–#49).
4. **Requests ekranı:** c1 + B2 + B3 (#50–#77). Hepsi `ScheduleRequestsPage.tsx`'e dokunuyor; tek oturumda sırayla.
5. **Takas incelemesi:** c2-css + C2 (#78–#91), G1 ve H2 (G2'nin yerine) ile.
6. **e2e** (#100–#102), sonra kapanış (#103–#107).
