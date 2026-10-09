KARAR: DEĞİŞİKLİK İSTENİYOR @9733f42c — tek madde: ek kontrol (b), aşağıda "Ek kontrol". İlk turdaki yedi madde ONAY.

## Ek kontrol (2026-09-30, koordinatörün isteği): Emergency contact kaydı reddedilince kişi ne görüyor
Account → Profile → "Emergency contact". Aynı commit (`9733f42c`), 1440, light.

**(b) Erişimi alınmış üye — beklenen karşılanmıyor (E1).**
Kurulum: "World e2e1790693406000"da çalışan Deniz, Account → Profile açıkken (form dolu: Contact / Friend / 4155550100),
owner Employees → Deniz → Access → "Remove access" → "Confirm remove access" yaptı. Deniz aynı sayfada Relationship'i
"Sibling" yapıp "Save"e bastı.
- Görünen: kırmızı uyarı **"Your emergency contact could not be saved in World e2e1790693406000. Try again."**
  (`role="alert"`, 13px). Aynı anda Emergency contact bölümü ekrandan tümüyle kalkıyor ve "Save" pasifleşiyor; yani
  "Try again" denecek bir şey kalmıyor. Görüntü: `82-removed-member-contact-save-1440.png`.
- Neden: API isteği çekirdeğe sormadan **404 "Workspace not found", `reason: authz.not_member`** ile çeviriyor
  (tarayıcıdan okunan cevap). Ekran yalnız `authz.not_active` ve `authz.workspace_closed` nedenlerinde
  "…can no longer be changed…" diyor (`apps/web/src/account/ProfilePage.tsx`, `saveContact`); `authz.not_member`
  "Try again." dalına düşüyor. Kayıt oturumunun kod okuması doğru çıktı.
- Olmalı: "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the
  workspace is closed." (zaten yazılı cümle).
- Sayfa yenilenince: Emergency contact bölümü yok, hata da yok (`83-removed-member-profile-after-reload-1440.png`).
- Not: "Remove access" üyeliği **suspended** yapıyor ve çalışan kaydının hesap bağını koparıyor (DB'den okundu).
  Ayrı bir "askıya al" düğmesi görmedim; (b)'nin iki hâli bu ekranda tek yol.
- Önem: düşük sıklık (form açıkken erişimin alınması gerekiyor), ama BL-444'ün verdiği söz bu durumda tutmuyor.
  İşaret önerisi: leave: low / do: safe (web'de nedene `authz.not_member` eklemek) ya da moderate (API'nin bu uçta
  çekirdeğin nedenini vermesi) — hangisi, `nf-backend` kararı.

**(a) Kurulumu bitmemiş (taslak) workspace — ret ekrandan kurulamıyor; form hiç sunulmuyor.**
- Yerel DB'de 119 taslak workspace var; hiçbirinde owner dışında üye yok (SELECT), yani "taslak workspace'in çalışanı"
  kurulamadı. Taslakta çalışan kaydı olan tek kişi owner; onunla bakıldı (e2e artığı `bl080-…@newfork.test`,
  "New workspace").
- Görünen: Emergency contact başlığının altında workspace adı ve şu cümle: **"Finish setting up this workspace, then you
  can add your emergency contact. Continue it in Account › Workspaces."** Alan yok, "Save" pasif; kayıt denenemiyor,
  dolayısıyla ret cümlesi de görülemiyor. Okunur ve doğru yöne götürüyor. Kontrast 5,1:1.
  Görüntü: `85-draft-owner-emergency-contact-1440.png`.
- Küçük bulgu (E2, backlog, leave: low / do: safe): cümledeki "Account › Workspaces" bağlantısı tarayıcının varsayılan
  mavisi ve altı çizili (`rgb(0, 0, 238)`), uygulamanın bağlantı rengi değil (token kuralı).
- Denenmeyen: taslak workspace'te owner olmayan bir çalışanın kaydı reddedilince ne yazdığı — böyle bir kişi yok,
  kurmak DB'ye elle yazmayı gerektirir (rolümün dışı).

**Bu ek kontrolün bıraktığı veri:** Deniz Person'ın (E-0007, "World e2e1790693406000") erişimi alındı ve geri verilmedi
(yeniden davet gerekir); acil durum kişisi değişmedi ("Friend"). Taslak workspace'te hiçbir şey yazılmadı. Meyhouse'a
girilmedi. Dev sunucuları yeniden açıldı (06:51) ve PID ile kapatıldı; süreç 0, port 0.

---
Aşağısı ilk turun raporu (yedi madde).

KARAR (ilk tur): ONAY @9733f42c

EMP-001 B (söküm) görsel QA'sı — main `9733f42c`, 2026-09-30. Engelleyici bulgu yok. Üç backlog maddesi, bir öneri,
altı kapsam dışı gözlem var. Test verisinde geri alınamayan bir yan etki kaldı (en altta, "Veri").

## Nasıl bakıldı
- Uygulama: web 5616 / api 5617 (bu worktree, `origin/main` @ `9733f42c`), ortak yerel DB. Yalnız dev sunucusu; test/build yok.
- Veri: Meyhouse'a hiç girilmedi. Dünün e2e artığı **"World e2e1790693406000"** workspace'i kullanıldı (2 lokasyon:
  Kadikoy, Besiktas; owner Olcay, admin Zeynep, müdür Ayse = Kadikoy, müdür Mehmet = Besiktas, çalışan Emre/Ali/Deniz).
  Neden bu: en yeni e2e dünyalarının owner hesabıyla giriş yapılamıyor (auth "Database error finding user" veriyor,
  `confirmation_token` boş); bu dünyada owner dahil herkes girebiliyor.
- Giriş: e2e'nin kendi yolu (`e2e/fixtures/world.ts` ile aynı, dünya parolası `e2e/global-setup.ts`'ten okunur).
  Sihirli bağlantı yolu bu hesaplarda çalışmıyor (yukarıdaki auth hatası).
- Roller: owner, admin (Zeynep), manager (Ayse). Genişlik: 1440 ve 390. Tema: light.
- Görüntüler bu klasörde; aşağıda dosya adıyla.

## Madde madde sonuç

| # | Bakılan | Sonuç | Kanıt |
|---|---|---|---|
| 1 | Employees → kişi → çekmece → Employment: "Manages without working there" izi | **Yok.** Başlık, açıklama, kutular, küçük "Save", boşluk ya da ayırıcı artığı yok; Locations kutusundan sonra doğrudan Jobs geliyor, aralık öncekiyle aynı. Owner, admin, manager; 1440 ve 390. | `02-owner-ayse-employment-1440.png`, `21-owner-ayse-employment-390.png`, `21-admin-ayse-employment-1440.png`, `21-ayse-emre-employment-1440.png` |
| 2a | Müdür kaydı (Ayse), "Exclude from schedule" işaretli | Locations başlığı **"Required"** kalıyor. Sıradan çalışanda (Emre) aynı işaret başlığı "Required"sız yapıyor. | `03-owner-ayse-excluded-required-1440.png`, `06-owner-emre-excluded-optional-1440.png` |
| 2b | Müdür kaydında son lokasyonun işareti kalkınca | **"Save changes" pasif**, cümle çıkıyor: "A manager needs at least one location to manage. Choose a location, or turn on Remote." "Exclude from schedule" açılınca da pasif ve cümle duruyor. "Remote" açılınca cümle kalkıyor, kayıt serbest. | `07-…-1440.png`, `07-…-390.png`, `08-…`, `09-…` |
| 2c | Cümlenin yeri ve okunurluğu | Çekmecenin alt çubuğunun hemen üstünde, tam genişlikte açık kırmızı şerit (alanın altında değil). 1440'ta tek satır, 390'da iki satır, düğmelerin üstünde, hiçbir şeyi örtmüyor. Yazı 12px, renk kontrastı **6,3:1** (eşik 4,5:1). Ayrıca Locations kutusunun içinde "Select at least one location." ipucu da çıkıyor. | aynı görüntüler |
| 2d | Ekran okuyucu | Cümle canlı bölge: form tepkisinde `role="status"`, sunucu reddinde `role="alert"` — çıktığı anda okunur. Locations alanına ya da pasif düğmeye `aria-describedby` ile bağlı değil (bkz. öneri Ö1). | ölçüm |
| 2e | İşaretli sıradan çalışanda lokasyonsuz kayıt | **Serbest.** Gerçek kayıtla denendi: Emre "Exclude from schedule" + lokasyonsuz iken notu değiştirince "Save changes" aktif, cümle yok. | `42-owner-excluded-employee-no-location-save-free-1440.png` |
| 3 | Tek lokasyonlu müdürde "Remove from Kadikoy" | İlk tık: düğme dolu kırmızı "Confirm remove". İkinci tık: sunucu reddediyor (400), alt şeritte aynı cümle (`role="alert"`), ham hata yok, lokasyon yerinde kalıyor. 1440 ve 390. Klavyeyle de: Enter hazırlıyor, Escape vazgeçiyor, çekmece açık kalıyor. | `11-owner-remove-armed-1440.png`, `12-owner-remove-refused-1440.png`, `12-owner-remove-refused-390.png` |
| 4 | Employees listesi → Location sütunu | **"Manages …" çipi yok** (üç rolde, iki genişlikte; liste cevabında da `managed…` alanı yok). "No location" çipi duruyor: masaüstünde sütunda, telefonda adın altında. Çip kontrastı 8,0:1. Masaüstünde bütün satırlar 58px. Telefonda çipli satır 76px, ötekiler 58px — çip ikinci satır açtığı için; tasarımın gereği, bulgu değil. | `20-admin-list-no-location-1440.png`, `20-owner-list-no-location-390.png`, `20-ayse-list-no-location-390.png` |
| 5a | Access → lokasyonsuz kişiyi Manager yapma | Gerçek kayıtla: lokasyonsuz Emre'de "Workspace role" → Manager seçilince sunucu reddediyor, alt şeritte aynı cümle, seçim "Employee"ye dönüyor. | `41-owner-emre-make-manager-refused-1440.png` |
| 5b | Add employee → lokasyonsuz kişiyi Manager olarak davet | "Invite" basılınca istek gitmeden aynı cümle çıkıyor. (Bu denemede tarayıcıdan çıkan her yazma isteği engellendi; kayıt oluşmadı, DB'de doğrulandı.) | `51-owner-invite-manager-refused-1440.png` |
| 6 | Account → Profile → Emergency contact, aktif çalışan (Emre) | Kayıt çalışıyor: Relationship "Friend" → "Sibling", "Save" → "Profile saved", alan yeni değerde. Sonra "Friend"e geri kaydedildi. 1440 ve 390. | `60-emre-emergency-contact-saved-1440.png`, `60-…-390.png` |
| 7 | Komşu ekranlar | Çekmecenin Profile, Availability, Documents, Access, History sekmeleri owner ve admin'de açılıyor; manager'da Documents sekmesi zaten yok, ötekiler açılıyor. "Add employee" üç rolde açılıyor. Sayfa hatası (pageerror) yok. | `30-…-access-…png`, `31-…-add-employee-…png` |

**2b için dürüst not:** bu dünyada üç rolün de gördüğü her kayıtlı lokasyonun kutusu kilitli (yanında "Remove" var), yani
"son lokasyonun işaretini kaldırmak" formda elle yapılamıyor. Formun tepkisi, çalışan cevabı **yalnız tarayıcıda**
değiştirilerek görüldü (lokasyon "kaldırılamaz" diye işaretlendi; DB'ye yazı yok). Gerçek kullanımda kişi bu cümleyi
"Remove" (madde 3), rol değişikliği (5a) ve davet (5b) üzerinden görüyor; üçü gerçek veriyle denendi.
Madde 3 yalnız owner ile denendi; admin aynı düğmeyi görüyor (`21-admin-ayse-employment-1440.png`), manager başka bir
müdürün kaydını görmüyor, kendi kaydı salt okunur.

## Bulgular (önem sırasıyla)

**B1 — backlog (leave: low / do: safe). Add employee'de Manager daveti seçiliyken Locations "Required" demiyor.**
Employees → Add employee → E-mail + "Invite role: Manager" → Next → "Exclude from schedule" işaretle.
Görünen: Locations başlığında "Required" yok, uyarı yok; kişi ancak "Invite"a basınca cümleyi görüyor.
Olmalı: kayıtlı müdürde olduğu gibi (madde 2a) başlık "Required" kalmalı, çünkü kural aynı.
Görüntü: `50-owner-invite-manager-no-location-1440.png`. Engelleyici değil: kayıt yine reddediliyor, cümle doğru.

**B2 — backlog (leave: low / do: safe). Davet reddinden sonra cümle, söyleneni yapınca da ekranda kalıyor.**
Aynı akış: "Invite" → cümle çıkıyor → "Remote" işaretleniyor (cümlenin istediği şey) → cümle hâlâ duruyor; bir
sonraki basışa kadar gitmiyor. Kayıtlı müdürün formunda (2b) cümle "Remote" açılınca hemen kalkıyor; iki yer farklı
davranıyor. Olmalı: taslak kurala uyunca cümle kalksın. Görüntü yok (durum satırıyla ölçüldü).

**B3 — backlog (leave: low / do: safe). Access sekmesindeki ret cümlesi başka sekmedeki düğmeleri söylüyor.**
Access'te rol Manager yapılınca çıkan cümle "Choose a location, or turn on Remote." diyor; ikisi de Employment
sekmesinde. Kişi nerede olduğunu cümleden bilemiyor. Olmalı: "…on the Employment tab" gibi yer bilgisi ya da
Employment'a götüren bağlantı. Görüntü: `41-owner-emre-make-manager-refused-1440.png`. Metin kararı; ürün sahibine sorulur.

## Öneri (zevk / ince ayar)
**Ö1.** Cümle Locations alanına `aria-describedby` ile, pasif "Save changes" de cümleye bağlanabilir; alan boşken
`aria-invalid`. Şimdiki hâli (canlı bölge) WCAG 3.3.1'i karşılıyor; bu yalnız sonradan alana dönen ekran okuyucu
kullanıcısı için iyileştirme.

## Kapsam dışı gözlemler (bu işin farkında değil; yalnız haber)
1. **"Unassigned +1" (mevcut madde BL-428 için ölçüm):** bu dünyada owner satırı "Unassigned +1" yazıyor; owner'ın iki
   lokasyonu var, birincili yok. Yani sayı doğru, sorun sunumda. `20-admin-list-no-location-1440.png`.
2. **"Remove" düğmesinde Escape'ten sonra odak halkası kayboluyor:** klavyeyle Enter (hazırla) → Escape (vazgeç)
   sonrası odak düğmede ama halka çizilmiyor (`outline: none`); Tab ile çıkıp dönünce geri geliyor. WCAG 2.4.7, düşük.
3. **Locations/Jobs başlığının erişilebilir adı "LocationsRequired"** (iki kelime arasında boşluk yok); ekran okuyucu
   bitişik okuyabilir.
4. **Access → "Remove access" dinlenirken dolu kırmızı;** aynı çekmecedeki "Remove" dinlenirken açık kırmızı, basınca
   doluyor. Aynı türden iki yıkıcı düğme farklı görünüyor. `41-…png`.
5. **Telefonda (390) çekmecenin alt çubuğunda "Terminate employee" yok** (masaüstünde var). Bilerek mi, bilmiyorum.
6. **Account → Profile telefonda sağda ~15px gri şerit** görünüyor (`60-emre-emergency-contact-saved-390.png`);
   kaydırma çubuğu yeri olabilir, doğrulanmadı.

Bilinen diye verilenler (çıkarma sonrası "You don't have access…" ekranı, Access'teki "Profile photo" açıklamaları,
936px üst çubuk) bulgu yazılmadı. Not: owner ile Emre Kadikoy'dan çıkarıldığında çekmece açık kaldı, erişim yok ekranı
çıkmadı (`40-owner-emre-after-removal-1440.png`).

## Veri — ne yazıldı, ne geri alındı
Hepsi e2e artığı "World e2e1790693406000" içinde, Emre Person (E-0003) kaydında. Meyhouse ve "G14 QA" verisine dokunulmadı
(Meyhouse çalışan kayıtlarının son değişikliği 2026-09-29 04:18 UTC, bu oturumdan önce).

| Yapılan | Geri alındı mı |
|---|---|
| Emre: "Exclude from schedule" açıldı, kaydedildi (madde 5a ve 2e için lokasyonsuz kişi gerekiyordu) | Evet, kapatıldı |
| Emre: Kadikoy'dan çıkarıldı | Evet, Kadikoy yeniden eklendi, birincil |
| Çıkarma sırasında Emre'nin Kadikoy'daki **3 yayımlanmış vardiyası sahipsiz kaldı** | **Hayır.** Geri alınmadı; benim hatam: çıkarmanın vardiya bıraktığını önceden hesaba katmadım. e2e artığı bir dünya, kimsenin verisi değil. |
| Emre'nin History sekmesinde bu adımların kayıtları, kayıt sürümü 3 → 6 | Hayır (tarihçe silinmez) |
| Emre: acil durum kişisi Relationship "Sibling" yapıldı (iki kez: 1440 ve 390) | Evet, "Friend" |
| Ayse (müdür): "Remove from Kadikoy" iki kez denendi | Sunucu reddetti, değişiklik yok (Kadikoy, birincil, sürüm 3) |
| Add employee → "Qa Probe" | Oluşmadı (yazma tarayıcıda engellendi; DB'de 0 satır) |

## Süreçler
Başlatılan iki dev sunucusu (web 5616: nohup 88232 → vite 6460; api 5617: nohup 103072 → `tsx watch` 91160 → 95144)
PID ile kapatıldı; sonrasında bu worktree'den çalışan süreç 0, 5616/5617 dinleyen 0. Worktree temiz (`git status` boş).
Roldeki portlar boştu, sapma yok.

## Skills
`design:accessibility-review` ve `design:design-critique` yüklendi, ölçütleri uygulandı (kontrast, klavye, odak, canlı
bölge, tutarlılık). Bitişte `superpowers:verification-before-completion`: her satırdaki sonuç bu oturumda alınan ölçüm
ya da görüntüye dayanıyor; tarayıcıda değiştirilen cevapla görülenler ayrıca belirtildi.
