# EKRAN-05 Workspace — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün gece görevi; ekran planının 4. adımı).
Session: -   Branch: task/ekran-05-<dilim>   Worktree: newfork-wt/ekran-05-<dilim>   DB: A1 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). A1 ve B1 `nf-guvenlik` zorunlu (yetki kapısı değişiyor: BL-807, BL-808); ekran değişen C1 `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — setup checklist'in yetki kapısı çekirdeğe taşınıyor, rota içi kapı kalkıyor (BL-808); belge işi satırı izne bağlanıyor (BL-807). Geri kalanı R2 (okuma fonksiyonu, saat dilimi, bildirim).
Hat sırası (koordinatör, 2026-10-06): **EKRAN-04'ten sonra** — veri hattı EKRAN-04 A1 bitince A1; web hattı EKRAN-04 B1'den sonra B1; arayüz hattı EKRAN-04 V / C1'den sonra V / C1.

**Kaynaklar:** keşif `docs/plan/ekranlar/05-workspace/OZET.md` (E5-01…E5-20, §3 prototip, §4 S1–S6, §5 KK-179) ve `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md`; KARARLAR Schedule → "Bugün hangi saat dilimiyle", K28, satır 93 (yerleşik Manager'da belge izni yok), MVP sınırı (Stripe billing yok), UI-09; KK-34 (to-do org kapsamı), KK-179. **`C-gorsel.md` henüz yok** (ağır iş, izinle); C1 başlamadan önce okunur, bulguları C1'e eklenir.

**Tazelik 2026-10-06 (`origin/main` `47e312f6`):** keşif aynı gün (`a40f329b`); arada `apps/ packages/ supabase/` değişmedi. Dilim başlarken kendi ölçümünü yapar.

## Goal
Workspace ekranını (sol menü → Workspace: Today, Pending requests, Open shifts, Announcements, Todos, Notifications, Quick actions kartları; Customize; Setup checklist ve Settings → General'daki gizleme düğmesi; bunların API, DB ve bildirimleri) EKRAN-PLANI'nın "bitmiş sayılır" tanımına getirmek.

Bir kişi için: Los Angeles'taki müdür Mina Salı 18:10'da Workspace'i açar; "Scheduled today" Salı'nın sayısıdır, başlıktaki "Tuesday" ile aynı gün. Zeynep'in arşivlediği duyuru Ayşe'nin kutusundan kalkar. Ayşe Requests'te Ali'nin iznini onaylayıp döndüğünde "Time off" hemen düşer; Beşiktaş müdürünü bekleyen takas Ayşe'nin "Shift changes" sayısına girmez. Profil satırı olmayan bir owner ana sayfayı açabilir. Customize'da Cancel beyazdır.

## Ürün kuralları (yazıldığı gibi uygulanır)
- **KK-179 (koordinatör, 2026-10-06; OZET §5):**
  - (1) "Bugün" her lokasyonun kendi saat dilimiyle; başlık tarihi aynı güne bağlı; çok lokasyonlu müdürde toplam her lokasyonun kendi gününe göre (KARARLAR Schedule). BL-238 ile tek iş.
  - (2) Her üyenin hesap satırı vardır — kural DB'de; canlıda profilsiz üye varsa satır oluşturulur, silinmez.
  - (3) Kutu yalnız canlı duyuru (K28).
  - (4) Belge süresi işi / bildirimi: kabul, ama S6 teyidi gelmeden yapılmaz; gece yapılmaz.
  - (5) Belge işi satırı `documents.read` ile süzülür (KARARLAR satır 93).
  - (6) Setup checklist çekirdeğe (`workspace.setup`) sorar; admin görür mü S3'e bağlı.
  - (7) "Shift changes" EKRAN-02 A2'nin rütbe kuralını izler; süzgeç tek yerde, sunucuda.
  - (8) Notifications kutusu sayfayla aynı okuma; eski `get_notifications_service` silinir, `retired_objects_stay_gone`'a eklenir.
  - (9) Salt hatalar düzeltilir. (10) Başlık iskeleti RED → S5 varyantı. (11) "Aynı sayı iki kutuda" dokunulmaz.
- **KK-34 değişmez** (S4'te Mert yeniden açmadıkça): kişiye bağlı olmayan to-do workspace'in ortak listesi.
- **Gece kuralı:** yeni davranış (BL-806 zamanlanmış görev, "expired" bildirimi) Mert'in teyidinden önce yapılmaz.

## Açık sorular (CLAUDE.md §13; sabah Mert'e — metin OZET §4'te)
- **S1** — izni olmayana kart: gizlensin (önerilen) / "—" ve "No access" / 0 kalsın. → BL-410, B1 + C1.
- **S2** — Todos 5'ten fazla: sınır kalksın, kutu kaysın (önerilen) / "+N more" / kalsın. → BL-667, A1 + C1.
- **S3** — checklist: App tour ve Billing kalksın, yalnız owner görsün (önerilen) / "Coming soon" / kalsın. → BL-811, BL-808, A1 + B1 + C1.
- **S4** — to-do kimin listesi (yalnız Mert KK-34'ü açarsa): ortak + yazan adı + Undo (önerilen) / lokasyon / kişisel / kalsın. → A1 + C1 (açılırsa).
- **S5** — başlık: gerçek ekranda varyant (P04). → BL-815, V + C1.
- **S6** — belge süresi işi zamanında + "expired" bildirimi (önerilen) / yalnız zamanında / kalsın. → BL-806, A1.
- Cevap gelmeden yalnız ilgili kısım bekler; dilimin geri kalanı yürür.

## Bulgu → dilim eşlemesi
| Bulgu | Dilim | Backlog |
|---|---|---|
| E5-01 "bugün" UTC | A1 (+ B1 başlık tarihi) | BL-804 (+ BL-238) |
| E5-02 profilsiz hesapta 500 | A1 | BL-805 |
| E5-03 arşivli duyuru | A1 | BL-564 |
| E5-04 belge işi okumada üretiliyor, "expired" yok | A1 (S6 sonrası) | BL-806 |
| E5-05 belge izni olmayan müdür işi görüyor | A1 | BL-807 |
| E5-06 checklist çekirdek dışı | A1 (DB) + B1 (rota, web) | BL-808, BL-276 (üç fonksiyon) |
| E5-07 "Shift changes" fazla sayıyor | A1 (sunucu sayısı) + B1 | BL-809 |
| E5-08 eski gelen kutusu | A1 + B1 | BL-533 |
| E5-09 yanlış satırlar, Announcements "View all" | B1 (tarih) + C1 | BL-666, BL-810 |
| E5-10 checklist adımları | A1 + B1 + C1 (S3) | BL-811 |
| E5-11 bayat sayılar | B1 | BL-812 |
| E5-12 izinsiz kart 0 | B1 + C1 (S1) | BL-410 |
| E5-13 Customize | C1 | U41, BL-813 |
| E5-14 ham hata | B1 | BL-814 |
| E5-15 Todos 5 | A1 + C1 (S2) | BL-667 |
| E5-16 başlık | V + C1 (S5) | BL-815 |
| E5-17 aynı sayı iki kutuda | dokunulmaz (KK-179 (11)) | — |
| E5-18 ölü yük | A1 (alan) + B1 (sorgu) + C1 (CSS) | BL-816 |
| E5-19 katalog sınıfı | A1 | BL-817 |
| E5-20 404 / 403 | A1 | BL-818 |
| Prototip taşı: W2 (S5), W6, W25, W26, W33, W37, W43, W44, W45 | C1 (+ A1 W25) | yukarıdakiler |

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri önce, sunum sonra; aynı dosyaya iki oturum aynı anda konmaz.

### V — S5 başlık varyantları (`nf-arayuz`; R1, main'e girmez)
- **Ne:** gerçek uygulamada DEV'de query param ile 2–3 varyant (liste iskeleti 142 px tek satır; yalnız selamlama + tarih; bugünkü), 1440 ve 390; üst yazı metni varyantlarla; Mert seçer.
- **Done when:** ekran görüntüleri `artifacts/nf-arayuz/EKRAN-05/varyant/`; seçim KARARLAR "Ekran kararları → Workspace"a yazıldı (koordinatör); dal silindi.

### A1 — Pano okuması, yetki ve veri kuralları (`nf-db`; R3)
- **Ne:** BL-804 (her lokasyonun saat dilimine göre "bugün"; BL-238 o tarihte açıksa birlikte); BL-805 (hesap satırı kuralı + mekanizma; canlıda profilsiz üye ölçümü, varsa satır oluşturma — silme yok); BL-564 (arşiv, süre, yayın hatası süzülür); BL-807 (iş satırı `documents.read`); BL-808 (üç checklist servisi `authorize(…, 'workspace.setup')`, `authz.*` ipucu; admin S3'e göre); BL-809 (sunucuda tek "shift changes" sayısı, EKRAN-02 A2 kuralıyla); BL-533 (pano bildirimleri sayfanın okumasından; `get_notifications_service` silinir + `retired_objects_stay_gone`); BL-817 (katalog satırı `workspace.todos`); BL-818 (bilinmeyen ve kapsam dışı to-do aynı cevap); BL-816 (`unread_notification_count` kalkar); S2 (a) ise BL-667 sınırı kalkar; S6 (a)/(b) ise BL-806 (zamanlanmış görev, okuma ucu yazmaz, "expired" ayrı olay anahtarı); S3'e göre BL-811'in veri kısmı.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/communication_operations.test.sql`, `time_off_seen_by_who_decides.test.sql`, `authorization_coverage.test.sql`, `retired_objects_stay_gone` testi, yeni `workspace_today_timezone.test.sql`, `ci-green.txt`; gerekirse `supabase/test-support/builder.sql` (profilsiz kişi kurulabilmeli).
- **Bağımlılık:** EKRAN-04 A1 main'de (hat sırası; aynı `authorization_matrix` / `ci-green.txt`); BL-809 için EKRAN-02 A2 main'de.
- **Done when:** (a) LA lokasyonunda saat 18:00 (UTC ertesi gün) "today" sayısı lokasyonun gününe göre (pgTAP, sabit saat); (b) profilsiz owner için pano NULL değil ya da kural gereği profilsiz üye oluşamıyor (pgTAP, önce kırmızı); canlı ölçümün sonucu Notes'a; (c) arşivli / süresi dolmuş / yayımlanamamış duyuru panoda 0 (pgTAP); (d) belge izni olmayan müdürde belge işi satırı 0, izni olanda 1 (pgTAP); (e) checklist servisleri çekirdek dışında kapı kullanmıyor (`service_actor_has_permission` sayacı 3 azaldı), ret `authz.*` ipucuyla; (f) `get_notifications_service` yok, `retired_objects_stay_gone` yeşil; (g) bilinmeyen ve kapsam dışı to-do aynı SQLSTATE + ipucu; (h) "shift changes" sayısı `awaiting_other_manager`'ı saymıyor (pgTAP).
- **Test plan:** kırmızı pgTAP → migration (rollback denemesi) → `test:db` (`db.lock`, tek ağır iş). Canlı ölçüm (profilsiz üye) yalnız SELECT; satır oluşturma canlıya migration'la (CLAUDE.md §8 sürekli yetki koşulları, yedekle).
- **Reviewer:** `nf-guvenlik` zorunlu (yetki kapısı, çekirdek, ikiz silme).

### B1 — API, shared, web veri katmanı (`nf-backend`; R3)
- **Ne:** BL-808 (iki checklist rotasından `authorize(… permissions.includes …)` kalkar, karar çekirdekte; web checklist görünürlüğü `can()` ile, rol adı değil); BL-809 (web sunucudaki sayıyı okur; Shift Hub modelini panoda çekmez); BL-533 (pano şeması yeni bildirim okumasına); BL-804 (başlık tarihi pano cevabındaki güne bağlı); BL-812 (izin kararı `workspace-dashboard` sorgusunu yeniler); BL-814 (ham hata yok; ortak hata kartı, `isNoAccess`); BL-666 (1)–(2) (tarih yönü, belge işinde kişi + belge adı); BL-816 (şemadan `unread_notification_count` kalkar); S1'e göre BL-410 (kart izne bağlı).
- **Touches:** `apps/api/src/communications/communication-routes.ts`, `communication-service.ts`, `apps/api/src/app.test.ts` (Workspace satırları), `packages/shared/src/communications.ts`, `apps/web/src/communications/communications-data.ts`, `apps/web/src/requests/requests-data.ts` (yalnız yenileme), `apps/web/src/views/WorkspacePage.tsx` (veri, hata, `can()`).
- **Bağımlılık:** A1 main'de; EKRAN-04 B1 main'de (hat sırası).
- **Done when:** checklist rotalarında `permissions.includes` 0 (grep); admin / owner / müdür için checklist yetkisi çekirdeğin cevabıyla aynı (API vitest); izin onayından sonra pano sorgusu geçersiz (web vitest, önce kırmızı); "Failed to fetch" / "Internal server error" ekranda yok (web vitest); ileri tarihli iş "Due in 25d" (web vitest).
- **Reviewer:** `nf-guvenlik` zorunlu.

### C1 — Kartlar, Customize ve checklist görünümü (`nf-arayuz`; R2)
- **Ne:** U41 (Cancel beyaz vazgeç; `secondary` sınıfı silinir; Customize ve Add yeşil aksiyon); BL-813 (iki sekme uyarısı ya da son durumla yenileme; gizli kart Customize'da etkileşimsiz; hepsi gizlenince tek cümle; simgelerde `aria-hidden`); BL-666 (3)–(6) ("General", ok yalnız açılan satırda, "View all notifications" tek satır, "New announcement" yeni duyuru penceresini açar); BL-810 (Announcements "View all"); W37 (bağlantı üzerinde alt çizgi, öteki ekranlarla ölçülerek); BL-816 (ölü CSS); S5'in seçimi (BL-815); S3'ün seçimi (BL-811 adımları, Settings → General metni kişi başına); S1 / S2 seçimlerinin görünümü; C raporunun bulguları (geldiğinde).
- **Touches:** `apps/web/src/views/WorkspacePage.tsx` (görünüm), `apps/web/src/styles.css` (Workspace bölümü), `apps/web/src/settings/GeneralSettingsPage.tsx` (yalnız metin), `apps/web/src/views/AnnouncementsPage.tsx` (yalnız "yeni" adresle açılış, BL-666 (6)).
- **Bağımlılık:** B1 main'de; S1, S3, S5 cevaplandı (S2 yalnız Todos kutusu); EKRAN-04 C1 main'de (hat sırası; `styles.css` sıcak dosya).
- **Done when:** önce / sonra ekran görüntüsü 1440 + 390 (owner, müdür) `artifacts/nf-arayuz/EKRAN-05/C1/`; Cancel beyaz; "View all notifications" tek satır; `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### D — e2e (`nf-test`; R2)
- **Ne:** Workspace akışı: müdür Customize → kart sırala, gizle, Save layout → yeniden açınca düzen kalıcı; Cancel taslağı atar; to-do ekle ve kapat; owner checklist adımı → hedef sayfa → işaret; izin onayından sonra "Time off" düşer.
- **Touches:** `e2e/flows/workspace-*.spec.ts`.
- **Bağımlılık:** C1 main'de; `db.lock`; CI boşken (tek ağır iş).
- **Done when:** main CI e2e'de yeşil; `skip` / `fixme` yok.

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| V | `nf-arayuz` | R1 | yok | — | 1 |
| A1 | `nf-db` | R3 | EKRAN-04 A1, EKRAN-02 A2 (BL-809), S2 / S3 / S6 (ilgili kısım) | `ci-green.txt`, `authorization_coverage.test.sql`, BL-238 (Schedule) | 5 |
| B1 | `nf-backend` | R3 | A1, EKRAN-04 B1 | `apps/web/src/lib/**` (hata kartı), `requests-data.ts` | 3 |
| C1 | `nf-arayuz` | R2 | B1, S1 / S3 / S5, EKRAN-04 C1 | `styles.css` | 3 |
| D | `nf-test` | R2 | C1 | — | 1 |
| **Toplam** | | **R3** | | | **13** |

## Out of scope
1. **Girişten sonra iniş:** BL-624 (bekleyen davet ekranı), BL-625 (son kullanılan workspace), BL-627 (paylaşılan cihaz) — ekran 16 (Giriş ve katılım).
2. **Genel yetki kalıntıları:** BL-176 (`PermissionRoute` içindeki `permissions.includes`), BL-553 (menü görünürlüğü), BL-659 (başka ekranlardaki yeşil vazgeç) — kendi turlarında.
3. **Ad kaynağı:** BL-079 (selamlamadaki ad için tek kaynak) — Account turu.
4. **BL-348** (ad onayı bildirimi `/app`'e gidiyor) — Notifications turu.
5. **Requests tek tabloya dönünce** "Pending requests" kartının "Time off / Shift changes" ayrımı — EKRAN-02 sonrası yeniden bakılır.
6. **E5-17** (aynı sayı iki kutuda) — KK-179 (11), dokunulmaz.
7. **B'nin zevk önerisi** (Origin ve `no-store` listeleri) — CSRF yolu yok; BL açılmadı.

## Done when (ekranın tamamı)
1. V, A1, B1, C1, D'nin Done when'i kanıtıyla Notes / Result'ta (komut + sonuç, sha).
2. E5-01…E5-20 bir dilimde kapandı ya da Out of scope'ta adıyla.
3. Prototip "taşı" (W2 S5'e göre, W6, W25, W26, W33, W37, W43, W44, W45) uygulamada.
4. KK-179 ve S1–S6'nın cevapları uygulandı.
5. Tam kapı yeşil (lint, typecheck, test, build, `test:db`, etkilenen e2e); main CI yeşil.
6. 1440 ve 390 ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-05/kapanis/`; `nf-gorsel-qa` ONAY.

## Notes / Result
-
