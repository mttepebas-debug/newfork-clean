# PAGES ekran belgeleri: plan (2026-10-10)

İstek: Mert, 2026-10-10 sabah 7:35 (California saati), thread "PAGES ekran belgeleri". Kural kısmı proje talimatlarına #11 olarak girdi. Bu dosya bir kerelik işin planı.

## Anladığım
- Uygulamanın her route'u (adresi) ayrı bir Artifact olur, numaralı: 1.0 Auth ve auth'a bağlı ekranlar 1.1, 1.2 …; sonra 2 Workspace, 3 Schedule ve öbürleri.
- Her Artifact yalnız main'deki bugünkü uygulamayı gösterir. Masaüstü ve telefon yan yana, aynı veriyle senkron çalışır. Üstte rol değiştirici (atlastaki gibi) ve örnek senaryolar var.
- Şablon "✅ Done · Important Date Drawer Designs" (https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX). Tek kusuru: masaüstü görüntü çok küçük.
- Elimizde güncel bir kopyası olan ekran yeniden yapılmaz; birden çok ekran taşıyan sayfa route'lara bölünür.

## Envanter: Library'deki 56 sayfa
Kaynak: `/mnt/project-files/pages/kaynak-bandi/artifactlar.json`, proje Artifact listesi, `/mnt/project-files/pages/atlas/source/tools/atlas.json`.

| Grup | Sayfalar | Güncel mi | Ne olacak |
|---|---|---|---|
| A. Sayfa atlası (17 sayfa) | Sign In, Public Pages, Owner Setup, Employee Welcome, Workspace Hub, Workspace, Requests, Employees, Employee Documents, Availability, Important Dates, Employee Home, Shift Hub, Announcements, Notifications, Settings, Account | Evet. Main `aac05f76`'dan derlendi; o günden bu yana main'e (`48c7c443`) yalnız belge girdi, uygulama kodu aynı. | PAGES'in kaynağı. Birden çok route taşıyanlar route'lara bölünür (aşağıdaki tablo). |
| B. Schedule test page (RNJEGWCDgdG2NpYRpWF4g3) | Schedule ızgarası, Export, Templates | Kısmen. Gerçek kod ama temeli eski main (`afb24b35`) ve içinde karar listesi ile varyant sekmeleri var. | 3.0–3.2 bu sayfanın kaynağından (`/mnt/project-files/pages/schedule-test/source/`) güncel main'le yeniden derlenir, yalnız "Original" kalır. |
| C. Tasarım ve varyant sayfaları (26) | Employees List Lab ×2, Shift card variants, Schedule availability lab, Shift windows test, Schedule Bar Variants, Schedule Templates S9, İzinli Güne Alınan Vardiya, Important Date Drawer Designs, Republish Acknowledgements, FB-6.7 ekran varyantları, Requests Warnings Lab ×2, Takas Penceresi Düğmeleri, Swap Onay Penceresi, Müsaitlik tasarımları, Newfork Locations, Locations Designs, Jobs & departments, Settings General Varyantları, Bildirim Varyantları, Shift Hub İzin Kartı, List Page Systems, Onboarding Documents, BL-969 Telefon Alanı, Telefon Kuralları Denemesi | Hayır: tasarım seçeneklerini ya da karar anını gösteriyorlar, bugünkü uygulamayı değil. Aynı ekranın güncel hâli A grubunda var. | Kopyalanmaz (kuraldaki "başka günceli varsa" durumu). Oldukları yerde tasarım geçmişi olarak kalır. Important Date Drawer Designs yalnız şablon olarak kullanılır. |
| D. Beklemede (Mert) | Giriş Tasarım Kitabı, Pre-business & Settings (Design tuvali) | — | Dokunulmaz (giriş ekranları ve Design tuvali beklemesi). Bugünkü giriş ekranları 1.x olarak belgelenir; yeni tasarım yapılmaz. |
| E. Uygulama ekranı değil | Newfork Landing ×2, Landing Preview, Motion Hero (tanıtım sitesi, uygulamada route'u yok), Komut Rehberi, İlerleme Raporu, Code İlerleme Envanteri, tasarım sistemi, Artifact dizini, atlas dizini | — | PAGES'e girmez. |

## Numaralı route listesi (52 ekran)
Kural: route = `apps/web/src/App.tsx`'teki bir adres. Yönlendirmeler (eski adresler), yalnız geliştirmede açılan `/dev/*` ve `schedule-badge-lab` adresleri dışarıda. Çekmece ve pencereler route değildir; ait oldukları route'un sayfasında senaryo olarak yer alır.

| No | Ekran | Adres | Kim açar | Kaynak |
|---|---|---|---|---|
| 1.0 | Sign in | /sign-in | çıkış yapmış kişi | atlas Sign In (bölünür) |
| 1.1 | Forgot password | /forgot-password | çıkış yapmış kişi | atlas Sign In |
| 1.2 | Reset password | /reset-password | e-postadaki bağlantıyla gelen | atlas Sign In |
| 1.3 | Account recovery | /account-recovery | çıkış yapmış kişi | atlas Sign In |
| 1.4 | Accept invitation | /accept-invite (= /invite/accept) | davet edilen | atlas Sign In |
| 1.5 | Workspace hub | /workspaces | herkes | atlas Workspace Hub (bölünür) |
| 1.6 | Workspace status | /workspaces/status | herkes | atlas Workspace Hub |
| 1.7 | Owner setup | /onboarding | owner | atlas Owner Setup |
| 1.8 | Employee welcome | /welcome/… | yeni çalışan | atlas Employee Welcome |
| 2.0 | Workspace | /app/workspace | owner, admin, manager | atlas Workspace |
| 3.0 | Schedule | /app/schedule | owner, admin, manager | Schedule test kaynağı, yeniden |
| 3.1 | Schedule export | /app/schedule/export | owner, admin, manager | Schedule test kaynağı, yeniden |
| 3.2 | Schedule templates | /app/schedule/templates | owner, admin, manager | Schedule test kaynağı, yeniden |
| 3.3 | Requests | /app/schedule/requests | owner, admin, manager | atlas Requests |
| 4.0 | Employees | /app/employees | owner, admin, manager | atlas Employees (bölünür) |
| 4.1 | Employee documents | /app/employees/documents | owner, admin | atlas Employee Documents |
| 4.2 | Employees archive | /app/employees/archive | owner, admin, manager | atlas Employees |
| 5.0 | Availability | /app/availability | owner, admin, manager | atlas Availability |
| 6.0 | Important Dates | /app/important-dates | owner, admin, manager | atlas Important Dates |
| 7.0 | Employee home | /app/employee-hub | çalışan | atlas Employee Home (bölünür) |
| 7.1 | My schedule | /app/employee-hub/schedule | çalışan | atlas Employee Home |
| 7.2 | Shift Hub | /app/employee-hub/shift-hub | çalışan | atlas Shift Hub |
| 7.3 | My availability | /app/employee-hub/my-availability | çalışan | atlas Employee Home |
| 7.4 | More (telefon menüsü) | /app/employee-hub/more | çalışan | atlas Employee Home |
| 8.0 | Announcements | /app/announcements | herkes | atlas Announcements (bölünür) |
| 8.1 | Announcement detail | /app/announcements/:id | herkes | atlas Announcements |
| 9.0 | Notifications | /app/notifications | herkes | atlas Notifications |
| 10.0 | Settings · General | /app/settings/general | owner, admin | atlas Settings (bölünür) |
| 10.1 | Settings · Locations | /app/settings/locations | owner, admin | atlas Settings |
| 10.2 | Settings · Jobs | /app/settings/jobs | owner, admin | atlas Settings |
| 10.3 | Settings · Notifications | /app/settings/notifications | owner, admin | atlas Settings |
| 10.4 | Settings · Schedule rules | /app/settings/scheduling | owner, admin | atlas Settings |
| 10.5 | Settings · Conflict handling | /app/settings/scheduling/conflicts | owner, admin | atlas Settings |
| 10.6 | Settings · Shift catalog | /app/settings/scheduling/shift-types | owner, admin | atlas Settings |
| 10.7 | Settings · Shift labels | /app/settings/scheduling/shift-labels | owner, admin | atlas Settings |
| 10.8 | Settings · Roles & permissions | /app/settings/roles | owner, admin | atlas Settings |
| 10.9 | Settings · Role detail | /app/settings/roles/:roleId | owner, admin | atlas Settings |
| 10.10 | Settings · Documents | /app/settings/documents | owner, admin | atlas Settings |
| 10.11 | Settings · Acknowledgements | /app/settings/acknowledgements | owner, admin | atlas Settings |
| 10.12 | Settings · Support | /app/settings/support | owner, admin | atlas Settings |
| 11.0 | Account · Profile | /account/profile | herkes | atlas Account (bölünür) |
| 11.1 | Account · Security | /account/security | herkes | atlas Account |
| 11.2 | Account · Preferences | /account/preferences | herkes | atlas Account |
| 11.3 | Account · Notification preferences | /account/preferences/notifications | herkes | atlas Account |
| 11.4 | Account · Workspaces | /account/workspaces | herkes | atlas Account |
| 11.5 | Account · Documents | /account/documents | herkes | atlas Account |
| 11.6 | Account · Inbox | /account/inbox | workspace'i olmayan kişi | atlas Account |
| 12.0 | Privacy | /privacy | herkes, girişsiz | atlas Public Pages (bölünür) |
| 12.1 | Terms | /terms | herkes, girişsiz | atlas Public Pages |
| 12.2 | Accessibility | /accessibility | herkes, girişsiz | atlas Public Pages |
| 12.3 | Contact | /contact | herkes, girişsiz | atlas Public Pages |
| 12.4 | Your privacy choices | /your-privacy-choices | herkes, girişsiz | atlas Public Pages |

Sıra: 1 Auth, 2 Workspace, 3 Schedule (Mert'in verdiği); sonrası sol menünün sırası. Requests ve Documents adres olarak Schedule ve Employees'in altında olduğu için 3.3 ve 4.1.
Güncel bir kopyası hiç olmayan ekran yok; yalnız Schedule'ın (3.0–3.2) varyantsız, güncel bir kopyası yok, o yeniden derlenecek.

## Her sayfanın düzeni (şablondan)
- Üst bilgi: numara ve ekran adı, adres, uygulamada nerede (menü → düğme), kim açabilir, hangi main'den derlendi.
- Denetimler: **Kim açıyor** (Owner · Manager · Employee; o ekranı açamayan rol gri ve nedeni yazılı), **Örnek senaryo** (2–4 tane; örnek: 6.0'da "Bu hafta tatil var", "Kapalı gün", "Manager yalnız kendi şubesi"), **Görünüm** (Yan yana / Alt alta), **Reset demo data**.
- Masaüstü 1440 × 900 ve telefon 390 × 844, ikisi aynı demo veriyle. Birinde kayıt yapınca öbürü de güncellenir; adres değişince öbürü de aynı adrese gider. Açık çekmece ya da pencere öbür tarafa geçmez (iki ayrı uygulama penceresi; bu bilinen sınır, sayfada yazılı).
- Masaüstü okunur boyut: dar pencerede iki görüntü alt alta gelir ve masaüstü bütün genişliği alır; ölçek en az %75, daha darsa yatay kaydırılır. "%100" düğmesiyle gerçek boyut.
- Uygulama Schedule'ı telefonda kapatır; 3.x'in telefon görüntüsü bunu olduğu gibi gösterir.
- Kaynak bandı kuralı her yayında (`bant.py`).

## Nasıl yapılacak (teknik)
- Atlas motoru PAGES'e kopyalanır: `/mnt/project-files/PAGES/_kaynak/` (atlas `source/`'undan). `pages.ts` route başına bir kayıt, numara ve senaryolarla genişler. Başka route'a giden bağlantı "Bu ekranın belgesi: 4.2 Employees archive" der.
- Uygulama bir kez derlenir; her Artifact küçük bir kabuk sayfası (şablon düzeni) ve iki pencerede açılan aynı uygulama dosyasıdır.
- Schedule için Schedule test kaynağı güncel main'e taşınır, varyantlar çıkarılır.
- Library: Artifact'ı Library'deki bir klasöre koyacak bir aracım yok. Yapabildiğim: her sayfanın dosyası `/mnt/project-files/PAGES/` klasörüne numaralı adla yazılır (Library → PAGES'te görünür), `MAP.txt` (şu an boş) numara → bağlantı listesiyle dolar, PAGES dizin sayfası Artifact olarak yayınlanır. Artifact başlıkları numarayla başlar ("1.0 Sign in · PAGES"), listede sıralı durur.

## Aşamalar
1. Plan (bu dosya).
2. Pilot: 6.0 Important Dates ve 1.0 Sign in. Mert'e bağlantı; kabuğun görünüşüne itiraz gelirse 52'ye yayılmadan düzeltilir.
3. Atlas kaynaklı 49 ekranın geri kalanı.
4. Schedule 3.0–3.2.
5. PAGES dizini, `MAP.txt`, bakım talimatı (`/mnt/project-files/PAGES/README.md`: tren main'e inince hangi ekranlar yenilenir).
6. Atlasın akıbeti (Mert'in cevabına göre).

## Eksik ya da yanlış olabilecek
- İkiz sistem: PAGES gelince atlas aynı ekranların ikinci kopyası olur (CLAUDE.md §3.A.4 "ikiz sistem yok"). Mert'e soruldu.
- 52 Artifact'ın yorumlarını tek oturum dinleyemez (oturum başına 10 sayfa sınırı). Yorumu sayfaya bırakmak yerine thread'e yazmak daha güvenli.
- Bazı yeniden yayınlarda otomatik izin kontrolü duruyor; Mert'in kural mesajı ekli olunca geçiyor.
- Kod işi bittiğinde PAGES güncellemesi bulut thread'inde yapılabilir (derleme Linux'ta çalışıyor); Remote Control gerekmez.

## Bence
- Route başına ayrı sayfa Mert'in kuralı; 52 sayfa çok görünse de hepsi tek derlemeden çıkıyor, bakım maliyeti düşük.
- Atlas dondurulsun: sayfaların üstüne "Yerini PAGES aldı: <numara>" bandı, güncellenmesi durur. Silme Mert'in kararı, sonra.
- Tasarım ve varyant sayfaları kopyalanmasın: bugünkü uygulamayı göstermiyorlar; kopyalamak PAGES'e eski tasarımları sokar.
