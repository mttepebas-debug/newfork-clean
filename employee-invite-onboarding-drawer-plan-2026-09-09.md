# Employee Invite, Drawer, Onboarding ve Belge Yasam Dongusu Plani

Tarih: 2026-09-09  
Durum: Urun plani; uygulama/test kaniti degildir.

Bu plan, employee invite/onboarding ve drawer access UX icin gecerli birlesik urun sozlesmesidir. Ayni kapsamdaki eski planlarla celisirse buradaki kararlar gecerlidir. Implementasyon oncesi mevcut dirty checkout, ilgili dosyalar ve unrelated WIP tekrar incelenmelidir.

## 1. Urun Sinirlari ve Teslim Sirasi

Teslim sirasi:

1. Employee drawer create/edit/invite UX, Profile/Employment/Access tab duzeni.
2. Invite kabulu, yedi adimli employee onboarding, Account > Profile baglantisi.
3. Dynamic Documents/Policies assignment, deadline, notification, review ve access restriction.
4. Ayri zorunlu takip teslimi: Account > Documents.

Kapsam disi:

- Payroll, SSN, tax ve resmi ise giris islemleri.
- Genel workflow engine.
- Kayit birlestirme.
- Admin adina dosya yukleme.
- Toplu review queue.
- Availability domain redesign.

Availability normal akisi korunur. Sadece re-invite/re-onboarding sirasinda employee availability yeniden girer; eski availability yeni effective kayit yururluge girene kadar korunur.

## 2. Employee Drawer UX

Drawer referans app'teki genis sag panel duzenine yaklasir:

- Sol summary rail.
- Orta scrollable section body.
- Sabit footer.
- Create modunda yalnizca Profile ve Employment tablari.
- Employee kaydedildikten sonra drawer refresh olur, Profile tab'dan baslar ve Availability, Documents, Access, History tablari gorunur.

### Employment Tab

- `Remote worker` ve `Exclude from schedule` secili oldugunda kart/toggle rengi degisir.
- Sol rail ustunde renkli status pill cikar:
  - `Remote`: amber/warning.
  - `Off schedule`: rose/danger.
- Normal employee icin 1 location + 1 job gerekir.
- `Remote worker` veya `Exclude from schedule` secilirse location/job assignment opsiyonel olur.

### Profile Tab

- `Invitation email` label'i `E-mail` olarak degistirilir.
- Profile tab uc ana basliga ayrilir:
  - Identity
  - Contact
  - Address
- Onboarding veya Account Profile'dan gelen employee-filled private fields drawer tasarim dilinde read-only input/readout olarak gosterilir.
- First/last create sirasinda editable kalir.
- Aktivasyondan sonra first/last kilitlenir.
- Linked account email Auth/account kaynagindan gelir.
- Invite/create email alani access invite akisi icin kullanilir.

## 3. Create Employee ve Invite Akisi

Create drawer Profile ile baslar.

- First name + last name girilince `Next` aktif olur.
- `Next`, Employment tabina gecirir.
- Employment readiness su kosullardan biriyle saglanir:
  - 1 location + 1 job secili.
  - `Remote worker` secili.
  - `Exclude from schedule` secili.

Readiness saglaninca:

- Email yoksa sadece `Save` aktif olur.
- Email varsa `Save` ve `Invite` ayni anda aktif olur.
- Email olsa bile invite opsiyoneldir.
- User `Save` basarsa employee unlinked/accessless kaydedilir, invite gonderilmez.
- User `Invite` basarsa employee henuz kayitli degilse once save yapilir, sonra invitation hazirlanir ve email gonderilir.

Email yazildigi anda footer'da role dropdown gorunur.

Role dropdown kurallari:

- Default role: `Employee`.
- Owner role secilemez.
- Admin, manager ve custom role secenekleri actor permission'a gore filtrelenir.
- Organization/location scope dropdown gosterilmez.
- Access scope, secilen role'un permission modelinden gelir.

Save sonrasi:

- Drawer ayni employee icin refresh edilir.
- Profile tab'dan acilir.
- Availability, Documents, Access, History tablari gorunur hale gelir.

## 4. Identity, Invite ve Re-Invite Kurallari

- Davet icin email gerekir.
- Emailsiz employee kaydi korunur.
- Invite preview varsa login/signup onerir.
- Genel email lookup endpoint'i olusturulmaz.
- Invite token/secret loglanmaz.
- Dogru verified session ile accept yapilir.
- Email verification gerekiyorsa invite return korunur.
- Verified session olmadan accept yapilmaz.
- Ayni org'da baska employee kaydina bagli hesap accept edemez.
- Otomatik merge yoktur.
- Accept + onboarding start atomic/idempotent olur.
- Replay ikinci membership veya onboarding case uretmez.
- Normal resend yeni link uretir ve eski token'i gecersiz kilar.
- Provider delivery retry ayni hazirlanmis invitation state'ini kullanir.

Revoke/unlink kurallari:

- Terminate/archive degildir.
- Employee identity, shifts ve time history korunur.
- Revoke icin email gonderilmez.
- Unlink organizasyon access'ini hemen kaldirir.
- Kiosk clock-in/out kapsami korunur.
- Yeni invite farkli verified global account tarafindan kabul edilebilir.
- Eski account org-private profile/docs erisimini kaybeder.
- Yeni account eski private records goremez.
- Manager history korunur.
- Re-onboarding bos baslar.
- Global email/password/phone korunur.
- Sharing preference kapali baslar.

## 5. Access Tab

Access tab employee'nin invite/account lifecycle kontrol merkezidir.

Desteklenecek durumlar:

- No email
- Ready to invite
- Invited/pending
- Delivery failed
- Retry
- Resend
- Revoke
- Onboarding
- Onboarded/linked
- Access removed/unlinked

### No Email State

Email'siz kaydedilmis employee icin gorsel uyari gosterilir:

```text
No email
Add an email before sending an invite.
```

`Add email` butonu Profile tab'daki `E-mail` input'una goturur ve odaklar.

### Invite State

- Ready state'te secili/default role ile invite gonderilebilir.
- Pending invite email, role, expiry ve delivery state gosterir.
- Pending state'te `Revoke` sunulur.
- Uygun durumda `Resend` sunulur.

### Failed Delivery State

- Delivery failure acik gosterilir.
- `Retry`, ayni invitation delivery state'iyle tekrar dener.
- `Resend`, yeni token/link uretir.
- Retry ve resend davranislari UI'da ayridir.

### Linked State

- Linked/onboarded employee icin workspace role goruntuleme/degistirme mevcut permission kurallariyla devam eder.
- Access removed/unlinked employee icin yeni invite baslatilabilir.

### Avatar Control

- Access tab altinda workspace-scoped avatar remove control bulunur.
- Bu islem global Account Profile avatarini silmez.
- Sadece bu workspace'te gorunen org avatarini kaldirir/gizler.

### Kiosk Group

- Access tab'da ayri `Kiosk` grubu tasarlanir.
- Ilk implementasyonda gercek kiosk PIN backend'i yoksa disabled/empty-state gosterilir.
- Sahte PIN reset davranisi eklenmez.

## 6. Onboarding UX

Onboarding yedi sabit adimdir:

1. Welcome
2. Personal Information
3. Emergency Contact
4. Availability
5. Documents
6. Policies & Agreements
7. Review & Submit

Genel UX:

- Desktop'ta onboarding'e ozel sol menu.
- Mobilde progress + step list.
- Ilk gecis sirali.
- Acilmis adimlar acik kalir.
- Fixed footer Back/Continue mobil klavye ile cakismaz.
- Reduced motion desteklenir.
- Start over ve Leave onboarding kaldirilir.
- Account menu icinde logout ve org switch kalir.
- Autosave draft korunur.
- Revision conflict gorunur.
- Eski sekme yeni kaydi sessiz ezmez.
- Documents/Policies eksikken Review'a gidilebilir.
- Final Submit zorunlu eksikler varsa engellenir.

## 7. Onboarding Step Icerikleri

### Welcome

- Light & airy yon kullanilir.
- Sirket adi, karsilama metni ve lokasyona gore guncel job assignments gosterilir.
- Logo varsa eklenir.
- Settings'de welcome message ve welcome visual ayri duzenlenebilir.
- Custom font/color/layout editor eklenmez.

### Personal Information

Zorunlu alanlar:

- First name
- Last name
- E-mail, read-only
- Phone
- Address
- Date of birth

Kurallar:

- Nickname/alternative name yoktur.
- ABD adres formati kullanilir.
- Country input yoktur.
- Manual address entry; address service yoktur.
- Global phone otomatik gelir ve duzenlenebilir.
- SMS verification iddiasi yoktur.
- DOB future olamaz.
- Avatar opsiyonel ve org-scoped.
- Share preference default off.
- Share kapsami: phone, email, birthday month/day.
- Address, DOB year ve emergency contact share edilmez.

### Emergency Contact

- Tek kisi.
- Name, relationship ve phone required.
- Email optional.
- Relationship list: spouse/partner, parent, sibling, child, friend, Other.
- Other ozel metin acar.
- Emergency phone employee phone ile ayni normalize numara olamaz.

### Availability

- Mevcut ekran ve domain kurallari kullanilir.
- Normal availability akisina yeni zorunluluk veya tasarim eklenmez.
- Re-onboarding'de yeniden girilir.
- Eski planlama kaydi yeni effective availability yururluge girene kadar korunur.

### Documents

- Tum document requests tek sayfada gorunur.
- Secili request ayni sayfada acilir.
- Document title primary, original file names secondary label olur.
- PDF/JPG/PNG desteklenir.
- HEIC destegi altyapi dogrulanmadan varmis gibi sunulmaz.
- Multi-file request desteklenir.
- Files/metadata draft olarak hazirlanir.
- Submit tum document version'i gonderir.
- Failed upload retry/remove edilmeden submit edilemez.
- Expired veya malicious file submit/approve edilemez.
- No requests varsa step otomatik gecilebilir.
- Optional requests upload olmadan gecilebilir.
- Conditional missing aciklama + taninan sure ister.

### Policies & Agreements

- Text/PDF listesi ve acilan icerik.
- Required/Optional ayrimi.
- Conditional policy mode yoktur.
- Acceptance icin full name input gerekir.
- Case/space esnek; harf hatasi engelleyicidir.
- Content opened olmali.
- Scroll-to-bottom veya wait timer zorunlu degildir.
- Required kabul edilmezse Submit engellenir.
- Acceptance snapshot immutable saklanir: name, timestamp, assigned content version.
- Re-invite yeni acceptance ister.

### Review & Submit

- Section summaries ve Edit links.
- Blocking missing list.
- Passive Submit.
- Double submit engellenir.
- Blocking document review varsa pending.
- Blocking review yoksa activation ayarina gore Active veya approval waiting.
- Ayri reject onboarding flow yoktur.
- Manager bekletebilir veya access revoke edebilir.
- Pending sirasinda profile/emergency draft duzenlenebilir.
- Activation olursa unsubmitted draft discard edilir.

## 8. Account > Profile ve Veri Sahipligi

Bu teslimde Account > Profile su alanlari yonetir:

- Global email
- Password
- Global phone
- Active org DOB
- Address
- Emergency contact
- Avatar
- Sharing preference

Kurallar:

- First/last activation sonrasi kilitlidir.
- Global phone tum linked org'lara yansir.
- Email/password gercek Auth flow ile degisir.
- Email dogrulanana kadar eski email gorunum/bildirim adresidir.
- Drawer yetkisi olan manager private org profile alanlarini gorebilir.
- Coworker/public paylasim yalniz share preference kapsamindadir.
- Revoked org private profile eski user'a gosterilmez.
- Global display name kilitli employee first/last degerini dolayli degistiremez.

## 9. Documents, Policies, Review ve Deadline Motoru

Documents/Policies motoru su eksenleri destekler:

- Optional / Required / Conditional
- Auto approve / Needs approval
- Target audience
- Distribution scope
- Deadline / suspension
- Expiration
- Extra fields
- Waiver/exemption
- Immutable version snapshot

Ana kurallar:

- Optional access engellemez.
- Required eksik final Submit'i engeller.
- Conditional eksik aciklama + taninan sure ile Submit'e izin verir.
- Optional Needs approval aktivasyonu engellemez.
- Ilk onboarding'de Conditional Needs approval reddedilirse duzeltilene kadar pending kalir.
- Empty/All target herkesi kapsar.
- Location/Department/Job gruplari AND, grup ici OR calisir.
- Named employees ek OR'dur.
- Coklu eslesme tek obligation uretir.
- Scope'tan cikan acik obligation/review/block kapanir, history korunur.
- Waiver reason required.
- Waiver otomatik yeniden assignment'a karsi kalicidir.
- Snapshot korunur.
- Yeni ayarlar mevcut obligation'lara acik manager action olmadan uygulanmaz.

## 10. Review ve File Lifecycle

- Employee upload eder.
- Admin adina upload yoktur.
- File bazinda Keep/Discard.
- Document bazinda Approve/Deny.
- Discard note optional.
- Deny reason required.
- En az bir Keep ve required metadata varsa approve yapilabilir.
- Tum files Discard ise Required/Conditional yalniz Deny olabilir.
- Yeni submission gelirse eski pending version karar alamaz.
- Approved renewal eski onayi expiration'a kadar bozmaz.
- Auto approve sonrasi manager re-review acabilir.
- Re-review mevcut onayi tek basina bozmaz.

## 11. Deadline, Suspension ve Notifications

Deadline/access kurallari:

- Deadline server authoritative.
- UI org timezone gosterir.
- Submit deadline'i durdurur.
- Draft upload deadline'i durdurmaz.
- Rejection tam tanimli sureyi yeniden baslatir.
- Deadline yoksa sistem kendiliginden deadline uydurmaz.
- Suspension sadece o org app access'ini etkiler.
- Global account, diger org'lar ve kiosk etkilenmez.
- Son blocker waiver/scope-out ile kalkarsa extra Submit olmadan access acilir.
- Archive active tracking'i durdurur; restore sonrasi gerekli eksikler icin tam sure baslar.

Notifications:

- Daily summary org timezone 09:00.
- Employee basina org bazinda tek ozet.
- Optional skipped/completed/removed obligations reminder'a girmez.
- Expiration warnings: 30/7/1 gun.
- Rejection, suspension ve access change event'leri ayrica bildirilir.
- Review notification manager'a app ici gider.
- Activation/suspension lifted email de alir.
- Notification delivery idempotent olur.

## 12. Account > Documents Takip Teslimi

Account > Documents ayri ama zorunlu follow-up teslimidir.

Bu yuzey sunlari icerir:

- Assigned/requested documents
- Employee uploads
- Extra fields
- Expiration
- Renewal
- Decisions
- Previous files/history
- Accepted policy versions
- Downloadable copies

Bu yuzey tamamlanana kadar active employee document notifications gecici onboarding Documents donusunu kullanabilir. Bu gecici fallback final employee document UX olarak kabul edilmez. Ikinci bir document engine yapilmaz; ayni servis/kurallar kullanilir.

## 13. Teknik Uygulama Plani

1. Dirty checkout ve ilgili drawer/invite/onboarding/document WIP dosyalari okunur.
2. Unrelated WIP korunur.
3. Employee drawer UI refactor dar tutulur:
   - Rail/status pills.
   - Profile grouped fields.
   - Create footer state machine.
   - Access lifecycle cards.
4. Existing create+invite command ve invitation service role-aware kalir.
5. Scope UI/API eklenmez.
6. Employee detail projection Access tab icin typed lifecycle state saglar:
   - Linked user
   - Invitation status
   - Delivery status
   - Role
   - Onboarding state
   - Private profile/avatar
7. Invite retry/resend/revoke ayrimi API ve UI'da acik tutulur.
8. UI text parse edilerek state cikarilmaz.
9. Accept, revoke, resend, submit, review, waiver ve activation transaction/revision guard ile idempotent yapilir.
10. Private profile/document/avatar URL ve reads tenant/employee scope ile fail-closed kalir.
11. Deadline/suspension API tarafinda enforce edilir.
12. Notifications/outbox idempotent olur.
13. Email delivery failure basarili domain islemini rollback etmez.
14. Browser, web tests, API/DB tests ve hosted/provider smoke ayri kanit kategorileriyle raporlanir.

## 14. Test ve Kabul Matrisi

Drawer create:

- No email Save.
- Email Save-only.
- Email Invite.
- Role default/filter.
- Save sonrasi full drawer visibility.

Drawer UI:

- Remote/Off schedule renkleri.
- Rail pills.
- Profile Identity/Contact/Address.
- Read-only private fields.

Access:

- No email warning.
- Add email navigation.
- Pending invite.
- Failed retry.
- Resend new token.
- Revoke.
- Onboarding.
- Linked/onboarded.
- Workspace avatar remove.
- Kiosk empty-state.

Invite:

- New account.
- Existing account.
- Verification return.
- Wrong account.
- Expired token.
- Revoked token.
- Old resend token.
- Replay.
- Concurrent accept.
- Provider retry.
- Same-org conflict.

Re-invite:

- Unlink immediately removes access.
- Failed send does not restore access.
- Same/different account accept.
- Old private data inaccessible.
- Employee identity/shifts/time history preserved.

Onboarding:

- Sequential first pass.
- Visited steps remain unlocked.
- Autosave.
- Revision conflict.
- Mobile footer.
- Incomplete Documents/Policies Review.
- Final Submit block.

Documents/Policies:

- Optional/Required/Conditional.
- Auto approve/Needs approval.
- Targeting.
- Waiver.
- Review version race.
- Expiration.
- Suspension.
- Notification dedup.

Security/RLS:

- Cross-tenant deny.
- Revoked user deny.
- Coworker share limits.
- Short-lived private URLs.
- Actor permission role assignment.

Proof labels:

- Focused local.
- Browser UAT.
- Provider smoke.
- Hosted migration.
- Release readiness.
