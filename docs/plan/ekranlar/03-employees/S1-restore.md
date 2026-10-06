# EKRAN-03 S1 — "Restore employee" senaryoları

Görev: EKRAN-03-S1 (koordinatör, 2026-10-06). Ölçüm `origin/main 722a2b89` + yerel DB (yalnız SELECT), 2026-10-06.

**Mert'in yönü (2026-10-06, OZET §4 S1'e seçenek dışı cevap, aynen):** "tekrar davet edilmesine gerek yok. aynı email adresine revoke edilen access geri verilir ama düşünülmesi gereken senaryolar var: userin email şifresini kaybetmiş olması/userin eksik belgeleri vs."

Yani: Employees → Archived → kişi → **Restore employee**, kişinin erişimini aynı hesapla geri verir; yeni davet yok. Bu belge o yönün uç durumlarını sınar.

## 1. Bugün ne oluyor (ölçüm)

| Konu | Bugün | Kanıt |
|---|---|---|
| İşten çıkarma (Terminate) | Üyelik `suspended`; eski **rolü** `employee_access_snapshots`'a yazılır, eski **durumu** (active / pending_activation) yazılmaz. Hesap (auth) silinmez, banlanmaz. Kayıtta `archived_at` dolar, hesap bağı (`user_id`) korunur. Bekleyen davetler `revoked`. | `terminate_employee_service` (son tanım `20260930130000_employees_writes_ask_the_core.sql`), gövde :92-148 |
| Belgeler | Zorunluluklar kapanır (`lifecycle_closed_at`), son tarih ve askı sayacı (`deadline_at`, `paused_remaining_seconds`) silinir; yüklenmiş dosyalar kalır. | `document_reconcile_employee` tetikleyicisi; `bl052_document_rehire.test.sql:63` |
| Lokasyon / iş / rol | Atamalar kapanmaz; rol askıdaki üyelikte durur. | gövdede `ended_at` yazan satır yok |
| Vardiyalar | Yalnız yayındaki ve etkili andan sonra başlayan vardiyalar "Unassigned" olur. Taslak vardiya, bekleyen izin / takas talebi ellenmez. | gövde :106-133; E3-02, E3-12 |
| Bildirim | Hiçbiri. `employee_offboarding_followups`'a satır düşer ama okuyan yok. | gövde :135-143; grep 0 |
| **Restore (ekran)** | Web `setEmployeeArchived(…, false)` çağırır, `restoreAccess` hep `false`. DB `user_id = null` yapar ("Employee record restored for rehire"). Üyelik `suspended` kalır. Kişi girince "You no longer have access to …" görür; davet listesi askıdaki üyeliğin workspace'ini göstermez. | `EmployeeDrawer.tsx:471-473`, `employee-data.ts:191-199`, `set_employee_archived_service` migration :533, :603, :627-628; `WorkspaceStatusPage.tsx:96-100` |
| **Restore (hesapla, DB'de var, ekranda yok)** | `restore_access = true`: üyelik snapshot'taki rolle `active` olur. Şart: `employee.remove_access` izni + `authorize_role_grant`. Yalnız `employees_on_the_core.test.sql:273,304` sınıyor. | migration :553-566, :610 |
| Kim Restore edebilir | `employee.archive` (person, cross, `rank_below`). Owner ve admin evet; müdür hayır (DB'de Kadıköy müdürü → kendi lokasyonundaki Emre: `out_of_scope`). Admin başka admin'i geri alamaz. | `authorize()` SELECT |
| Parola sıfırlama | Var: Sign in → "Forgot password?" → `/forgot-password`, `/reset-password`; bağlantı API'den Resend ile. Link ile giriş (magic link) yok. | `SignInPage.tsx:146`, `App.tsx:162-163`, `apps/api/src/account/password-reset.ts:99`; KARARLAR "Giriş ve hesap kurtarma" |
| E-posta değişimi | Kişi kendisi: Account → Security, doğrulamalı. Yönetici: bağlı ve davetli kişide alan salt okunur. Kayıttaki `invitation_email` ile hesap e-postası senkron değil: liste eski adresi gösterir. | `account-security-routes.ts:87`; `EmployeeDrawer.tsx:2056-2057`; `EmployeesPage.tsx:669`; KARARLAR EMP-001 S5 |
| Belge son tarihi | Üyeliğin `active` olduğu an ya da zorunluluğun yeniden açıldığı an + `period_days`. Kısıt (`document_actor_blocked`): üyelik `active` + `suspend_on_overdue` + süre dolmuş. | `start_document_activation_periods`, `document_reconcile_employee` |
| Silinen lokasyon / iş | Yumuşak silme; o lokasyon / işe bağlı **herkesin** ataması kapanır (arşivdekiler dahil). Restore geri açmaz. Restore'da müdürün lokasyon kuralı (`keep_manager_at_a_location`) çağrılmıyor (E3-13 doğrulandı). | `delete_catalog_entity_service` :53-56, `delete_job_with_assignments_service` :31-44 |
| Hesap silme | Account → Security; auth satırı silinmez: e-posta `deleted+<id>@deleted.invalid`, rastgele parola, 100 yıl ban. Engel yalnız **aktif** üyelik: işten çıkarılan (askıdaki) kişi hesabını silebilir. | `account-deletion-worker.ts:150-158`, `get_account_deletion_blockers_service` |
| Çok workspace | Aynı hesap birden çok workspace'te üye olabilir; askıdaki workspace ötekileri etkilemez. | `resolveLanding.ts:99-125`; KARARLAR "Katılım ve giriş akışı" |
| Yerel DB | 7 arşiv kaydı (Meyhouse), 6'sının hesap bağı yok; terminate / restore olayı 0 → fixture'dan, ekran izi yok. | SELECT, 2026-10-06 |
| Testler | Restore / terminate için e2e yok; hesapla restore dalını yalnız bir pgTAP dosyası sınıyor. | yukarıda |

## 2. Senaryolar

Örnek kişiler: owner **Mert**, admin **Selin**, Kadıköy müdürü **Ayşe**, garson **Ali** (`ali@example.com`), Kadıköy aşçısı **Emre**.

| # | Senaryo | Bugün | Öneri | Dayanak | Örnek |
|---|---|---|---|---|---|
| 1 | Newfork parolasını unuttu | Restore hesabı kopardığı için kişi giriş yapsa da erişemez; parola sıfırlama ayrıca var. | Restore hesabı açar; parolası yoksa kişi giriş ekranındaki "Forgot password?" yolunu kullanır. Restore'un sonuç metni bunu tek cümleyle söyler: "Ali can sign in again with ali@example.com." Yeni akış yok. | KARARLAR "Giriş ve hesap kurtarma (2026-09-26)"; Mert 2026-10-06 | Ali Kasım'da geri dönüyor, parolayı hatırlamıyor; "Forgot password?" → ali@example.com'a 1 saatlik bağlantı → yeni parola → Kadıköy programı. |
| 2 | E-posta hesabına artık erişemiyor ya da e-postası değişti | Kişi e-postasını yalnız giriş yapabiliyorsa (Account → Security) değiştirebilir. Yönetici değiştiremez. Erişimi kaybedilmiş adres için yol yok. | Hesapla Restore yine yapılır. Kişi eski adrese ulaşamıyorsa tek yol yeni adrese yeni davet: hesap bağı kopar, kişi yeni hesapla onboarding'e başlar (bugünkü "rehire" mekaniği). Restore penceresinde ikinci, ayrı bir eylem olarak. | **yeni karar — Mert'e soru (Q1)** | Ali'nin eski iş e-postası kapandı; artık ali.new@example.com kullanıyor. |
| 3 | Eksik belge ya da çıkarıldığı sürede süresi dolmuş belge | Bugünkü Restore'da belge zorunlulukları kapalı kalır (hesap bağı yok). Hesapla dalda zorunluluk yeniden açılır: son tarih = Restore anı + belgenin süresi; hâlâ geçerli ve onaylı belge "completed". Süresi geçmiş belge yeniden istenir. Belgenin süresi dolarsa kişi kısıtlı olur: yalnız eksiğini tamamlar. | Hesapla Restore; belge kuralları değişmeden uygulanır. Restore penceresi eksik belgeleri adıyla listeler: "Food handler card is missing; Ali has 14 days to upload it." Son tarihin nereden sayılacağı soruda. | KARARLAR "Ürün kuralları" (kısıtlı kişi K 87, owner muafiyeti K 88); **son tarih kaynağı: yeni karar — Mert'e soru (Q2)** | Ali'nin gıda kartı çıkarıldığı Ağustos'ta 3 gün kala eksikti; Kasım'da geri alınıyor. |
| 4 | Çıkarıldığında onboarding'i yarımdı | Bugünkü Restore + yeni davet onboarding'i baştan başlatır (özel bilgiler silinir). Hesapla dal üyeliği `active` yapar, onboarding kaydı yarım kalır: kişi onboarding'i bitirmeden tam erişim alır (hata). | Kişi tam olarak çıkarıldığı durumuna döner: onboarding yarımsa üyelik "kurulumda" (`pending_activation`) açılır, kişi kaldığı adımdan sürdürür; bitirene kadar kısıtlı. Teknik: snapshot üyeliğin eski durumunu da saklar (Claude kararı, P19). | ILKELER P10 (ilerleme kaybolmaz); KARARLAR K 87 (tamamlanmamış onboarding = kısıtlı), K 240-242 | Ali adres adımında çıkarıldı; geri alınınca adres adımından sürdürür, Schedule'ı onboarding bitince görür. |
| 5 | Eski lokasyonu / işi / rolü artık yok | Lokasyon ya da iş silinince atama kapanır; Restore geri açmaz → kişi lokasyonsuz / işsiz döner. Müdür lokasyonsuz `active` olabilir (E3-13). | Restore penceresi kişinin bugün geçerli atamalarını gösterir; en az 1 lokasyon ve birincil iş yoksa seçtirir, seçilmeden "Restore" açılmaz. Müdürse müdür lokasyon kuralı uygulanır. Rol snapshot'taki roldür; rütbe kuralı (`authorize_role_grant`) geçer. | KARARLAR K 84 (birincil iş, en az 1 lokasyon; müdür K4); E3-13 | Ali'nin tek lokasyonu Beşiktaş Eylül'de kapandı; Mert Restore'da Ali'yi Kadıköy'e atar. |
| 6 | Newfork hesabını silmiş | Askıdaki kişi hesabını silebiliyor; hesap "mezar taşı" (banlı, e-posta değişmiş) olur. Hesapla Restore bu banlı hesabın üyeliğini açardı: kimse giremez. | Hesap silinmişse "hesapla Restore" yapılamaz; pencere bunu söyler ve tek yol yeni davettir (Q1'deki ayrı eylem). Silme kurtarma süresi içindeyse kişi önce kendi hesabını kurtarır. | ILKELER P25 (sonuç açık yazılır); P11 (doğru veri); kural yok ama tek mümkün yol | Ali Eylül'de hesabını sildi; Mert Kasım'da Restore'a basınca "Ali deleted their Newfork account. Invite them again to bring them back." |
| 7 | Bu arada başka bir workspace'e katılmış | Workspace'ler bağımsız; askıdaki üyelik ötekini etkilemez. | Değişiklik yok. Restore sonrası Ali girişte workspace listesinde iki workspace görür; son kullandığına iner. | KARARLAR "Katılım ve giriş akışı" (K 222-250) | Ali Ekim'de başka bir restoranda çalıştı; Kasım'da Restore → girişte iki workspace. |
| 8 | Aylar sonra geri dönüyor | Bugünkü akışta süre farkı yok. | Süre sınırı yok: aynı Restore. Belgeler 3. satıra göre; profil bilgisi (adres, acil durum kişisi) eski kalır, kişi kendisi günceller. | Mert 2026-10-06 ("tekrar davet edilmesine gerek yok"); P13 (bordro / compliance MVP dışı) | Ali 8 ay sonra geri dönüyor; eski acil durum kişisi duruyor, Profile'dan günceller. |
| 9 | Kim Restore edebilir | Owner ve admin (rütbe kuralıyla); müdür değil. Admin başka admin'i geri alamaz. | Aynen. Hesapla Restore ek olarak erişim verme yetkisi ister; ikisi aynı kişide (owner / admin). Bayat ekrandan gelen ters çağrıya karşı komut kaydın o anki durumunu kontrol eder (B D1; Claude kararı, P19). | KARARLAR K 79 (tamamen çıkarma ve arşiv yalnız admin / owner); ILKELER P07, P08 | Ayşe Kadıköy'deki Ali'yi geri alamaz; Selin ya da Mert alır. Selin başka admin Deniz'i geri alamaz; Mert alır. |
| 10 | Kime bildirim gider | Hiç kimseye (terminate'te de). | Geri dönen kişiye e-posta + uygulama içi: "You have access to Meyhouse again." Lokasyon müdürü uygulama içi bilgi alır (programı o kuracak). Admin / owner'a bildirim yok (Restore'u zaten onlar yaptı). | ILKELER P07 ("bildirim karar verene ve işi doğrudan etkilenene"); A bölümü anti-hedef "bildirim gürültüsü" | Selin Ali'yi Restore ediyor → Ali e-posta alır; Ayşe uygulama içinde "Ali is back at Kadıköy" görür. |
| 11 | Schedule'da boşalmış eski vardiyalar | Terminate etkili andan sonraki yayındaki vardiyaları "Unassigned" yapar; Restore geri doldurmaz ve söylemez. | Restore penceresi hâlâ boş duran eski vardiyaları sayar ve ne olacağını söyler; ne olacağı soruda. Geçmiş tarihli çıkarmada boşaltma "şimdiden önceye" uzanmaz (OZET K1). | ILKELER P09 (veri sessizce düşmez; yayınlanmış veri geriye dönük değişmez); OZET K1; **yeni karar — Mert'e soru (Q3)** | Ali 10 Ekim'de çıkarıldı; 12 ve 14 Ekim Kadıköy akşam vardiyaları "Unassigned" oldu; 14 Ekim'i kimse almadı. 11 Ekim'de Restore. |

Yolda bulunanlar (Restore kapsamı dışında, backlog adayı):
- Terminate bildirimi yok ve `employee_offboarding_followups` okunmuyor (E3 D Y5 ile aynı kök).
- Liste kayıttaki davet e-postasını gösteriyor; kişi e-postasını değiştirince eski adres görünür (senkron yok).
- Silinen lokasyon / iş, arşivdeki kişilerin atamalarını da kapatıyor.
- Askıdaki kişi hesabını silebiliyor (engel yalnız aktif üyelik).

## 3. Mert'e sorular (CLAUDE.md §13)

**Q1 — Eski e-postasına ulaşamayan kişiyi nasıl geri alalım?**
- **Bugün:** Employees → Archived → Ali → Restore employee kişinin hesabını koparıyor ve yeni davet istiyor; e-postayı yönetici değiştiremiyor.
- **Örnek:** Ali'nin eski adresi ali@oldjob.com kapandı, giriş yapamıyor, parolası da yok. Mert onu geri almak istiyor.
- **(a) Restore penceresinde ikinci eylem "Invite to a new email": Ali'nin yeni adresine davet gider, eski hesap bağı kopar; Ali yeni hesapla onboarding'e baştan başlar, eski belgeleri ve vardiya geçmişi kayıtta kalır. Normal Restore aynı hesapla geri açar. (Önerilen)**
  `Dayanak: Mert 2026-10-06 (aynı e-postaya erişim geri verilir; e-posta kaybı ayrıca düşünülecek) + ILKELER P25 (sonuç açıkça yazılır)`
- **(b)** Owner / admin, bağlı hesabın e-postasını Employees'te doğrudan değiştirebilsin; Ali yeni adresle "Forgot password?" kullanır, onboarding tekrarlanmaz. Başkasının hesabını ele geçirmeye açık bir yol olur.
- **(c)** Yol olmasın: Ali Newfork desteğine yazar.
- Kaçış: "Önce sohbette konuşalım".

**Q2 — Geri dönen kişinin eksik belgesi için süre nereden başlasın?**
- **Bugün:** Employees → Archived → Ali → Restore employee; belge zorunlulukları hesap bağı koptuğu için kapalı kalıyor. Hesapla geri almada kod süreyi Restore anından baştan başlatıyor.
- **Örnek:** Gıda kartının süresi 14 gün; Ali Ağustos'ta 3 gün kala çıkarıldı, Kasım'da geri alınıyor.
- **(a) Süre Restore anından baştan başlar (Ali'nin 14 günü var); süre dolarsa Ali yalnız eksiğini tamamlayabilir, programa yazılmaz. (Önerilen)**
  `Dayanak: KARARLAR "Ürün kuralları" (kısıtlı kişi K 87; süre üyeliğin açıldığı andan) — Restore'a uygulanışı yeni karar`
- **(b)** Kalan süreden devam eder (Ali'nin 3 günü var).
- **(c)** Eksik belge bitmeden Restore tamamlanmaz: Ali geri alınır ama doğrudan kısıtlı başlar.
- Kaçış: "Claude karar versin".

**Q3 — Ali çıkarılınca boşalan vardiyalar, Restore'da ne olsun?**
- **Bugün:** Terminate, Ali'nin yayındaki gelecek vardiyalarını "Unassigned" yapıyor; Restore onları geri vermiyor ve bunu söylemiyor.
- **Örnek:** Ali 10 Ekim'de çıkarıldı; 12 Ekim vardiyasını Emre aldı, 14 Ekim akşam vardiyası hâlâ boş. 11 Ekim'de Selin Ali'yi Restore ediyor.
- **(a) Hâlâ boş olan vardiyalar geri verilmez; Restore penceresi "1 of Ali's shifts is still unassigned: Tue Oct 14, 5–11 PM" diye yazar, müdür Schedule'da kendisi atar. Başkasının aldığı vardiyaya dokunulmaz. (Önerilen)**
  `Dayanak: ILKELER P09 (veri sessizce düşmez; yayınlanmış program geriye dönük değişmez) + P24 (müdür onayı ezilmez)`
- **(b)** Hâlâ boş olanlar otomatik olarak Ali'ye döner ve Ali bildirim alır.
- **(c)** Restore penceresinde onay kutusuyla seçilsin: "Give Ali back 1 unassigned shift".
- Kaçış: "Backlog'a yaz".

Sorulmadan Claude'un verdiği kararlar (P19, teknik iç ayrıntı): snapshot üyeliğin eski durumunu da saklar (satır 4); Restore komutu kaydın o anki durumunu kontrol eder (satır 9); Restore'da müdür lokasyon kuralı çağrılır (satır 5). Satır 1, 5, 6, 7, 8, 9, 10'un önerisi yazılı bir kurala ya da ilkeye dayanıyor; koordinatör onaylarsa soru gerekmez.
