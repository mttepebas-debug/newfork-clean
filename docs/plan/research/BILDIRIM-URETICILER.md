# BILDIRIM-08 — Bildirim üretenler: üretici haritası ve test planı

Yazıldı: 16 Ekim 2026 (California). Yazan: BILDIRIM-08 hazırlık oturumu. **Kod yok**: bu belge yalnız harita ve plan.

- Ölçülen kod: `origin/main` @ `e62f841e`. Satır numaraları bu sha'daki `supabase/schema.sql`'in satırlarıdır (`schema:<satır>`). Söküm C2 (`origin/task/bildirim-06` @ `caca9f2f`, trende) main'e girince satırlar kayar; fonksiyonu adıyla arayın. Aşağıdaki her fonksiyonun hem main'de hem C2 dalında var olduğu `git grep` ile doğrulandı.
- Kaynak liste: plan sayfasının `C` dizisi (`PD\devir\threadler\bildirim-sistemi-kaynak\site\index.html`, 68 satır), KARARLAR S-91, S-92, S-95, S-96, S-123, S-124, P07, "Müsaitlik güncelleme bildirimi" (2026-09-26), `docs/plan/research/BILDIRIM-INCELEME.md` §2, vardiya değişimi planı (`PD\notes\vardiya-degisim\PLAN.md`).
- Üreticilerin eski yerleri, söküm C1 commit'inden (`7651582c`, "domain work stops calling the old notifications") okundu: oradan silinen her çağrı, yeni üreticinin doğal yeridir.

## 0. Özet

**Anladığım.** 4. dilim, çekirdeğin (3. dilim) tablolarına ve "gidecek mi" kuralına yazan üreticileri kurar. Bu belge her tür için: kod noktası, alıcı, seviye, kanal, tekilleştirme anahtarı, kapanma davranışı ve testi verir; dilimi çakışmasız alt dilimlere böler.

**Sayım.** Plan listesinde 68 satır var. 2'si ayrı bildirim değil (izin "vardiya açtı" ve "geri çekildi": karar kartında görünür). 1'i ayrı yol (davet, parola sıfırlama, hesap silme e-postaları). Kalan **65 tür**:

| Nereye | Tür | Not |
|---|---|---|
| **Bu dilim** | **48** | Schedule 8, takas 5, izin 4 (+2 davranış), müsaitlik 2, kişiler 14, belgeler 6, duyurular 5, hesap 3, workspace 1 |
| Vardiya değişimi işi | 8 | "Bugün" sütunu "Vardiya değişimi" olanlar (§4.1) |
| Sonra (MVP sonrası) | 5 | vardiya hatırlatması, yayınlanmamış hafta, Lineup ×2, yeni cihaz girişi |
| Stripe / ödeme | 4 | deneme, ödeme hatası, fatura, abonelik |

**Eksik ya da yanlış olabilecek.**
1. Çekirdeğin arayüzü henüz yok: `bildirim-cekirdek` oturumu 16 Ekim'de commit etmemişti, `origin/task/bildirim-07` yok. §6'daki imza bir **öneri**; çekirdek main'e girince bu belge onunla karşılaştırılıp düzeltilir.
2. Söküm C2, karar veren hesaplayan iki yardımcıyı da siliyor (`app_private.time_off_deciders`, `app_private.time_off_alone_deciders`) ve zamanlanmış duyuru hatasını söyleyen `app_private.announcement_tell_failed`'i siliyor. Yerlerine çekirdekte ortak bir "kim karar verir" yardımcısı gerekir (§6).
3. Her üretici var olan bir fonksiyonun gövdesini değiştirir (`CREATE OR REPLACE`). CLAUDE.md §5.5'e göre bu **riskli canlı migration**'dır: her biri `nf-guvenlik` ONAY'ı ve Mert'in "evet"i ister. 8 alt dilim = 8 riskli canlı adım. Öneri §5.3'te.
4. Takasın 5 türü bugünkü takas koduna yazılırsa vardiya değişimi işi o kodu baştan yazınca ikinci kez yazılır (§7 soru 1).

**Bence.** Sıra: Hesap+workspace → İzin → Schedule → Belgeler → Duyurular → Kişiler (iki parça) → Müsaitlik (+takas kararı). Gerekçe §5.2'de. Elenen: alan sırasını plan listesindeki sırayla yapmak (Schedule önce) — yayın fonksiyonu başka Schedule işleriyle çakışıyor ve çekirdeğin "karar veren" yardımcısını ilk kez izinde sınamak daha ucuz.

## 1. Ortak kurallar (her üretici)

| Kural | Nasıl | Dayanak |
|---|---|---|
| Aynı işlem | Üretici, domain fonksiyonunun içinde, işle aynı işlemde çekirdeğin yazma fonksiyonunu çağırır. Tetikleyici (trigger) kullanılmaz. | S-91; elenen: olay tablosuna tetikleyici (eski `notify_time_off_event` gibi) — kim yaptı, ne değişti bilgisi tetikleyicide eksik, test zor |
| Alıcı yetkiden | Rol adı yazılmaz; alıcı `authorize`/`scope_set` eylem anahtarıyla bulunur (aşağıdaki "Alıcı" sütunu eylemi verir). Karar isteyen türde: o lokasyonda eylemi olan **müdür**; müdür yoksa eylemi olan admin ve owner. | S-123, P07 |
| Mert'in istisnaları | Müsaitlik → kişinin müsaitliğini okuyabilen herkes (`availability.team_read`, rütbe şartı yok). Tercih edilen ad → owner + bütün admin'ler + kişinin lokasyonunda karar veren müdür. | Müsaitlik kararı 2026-09-26; S-123 |
| Yazan hariç | İşi yapan kişi kendi işi için bildirim almaz. Çekirdek bunu tek yerde yapar (alıcı listesinden `actor` çıkar); üretici ayrıca süzmez. | S-123 |
| Tek olay, kişi başına tek bildirim | Her çağrının bir tekilleştirme anahtarı vardır; aynı (tür, anahtar, alıcı) ikinci kez yazılmaz. Bir olay birden çok türe dokunuyorsa kişiye **tek** satır gider (en önemli tür seçilir, gövde ötekileri sayar). | S-95 |
| Kapanma | Karar isteyen satır karar verilince kapanır: öbür karar verenlerin satırı "Approved by …" / "Declined by …", çalışan geri çekince "Withdrawn" olur. Yeni bildirim yazılmaz, var olan satır güncellenir. | S-123 gürültü kuralları |
| Değişmeyen kayıt sessiz | Üretici önce/sonra karşılaştırır; değişiklik yoksa çağırmaz. | S-123 |
| Metin | Başlık İngilizce, sonucu söyler ("Your time off Oct 20–22 is approved"); ham tür kodu ekrana çıkmaz; gerekçe yalnız ilgili kişiye. | CLAUDE.md §3.A.7, BILDIRIM-INCELEME §2.5 |
| Saklama | 90 gün; hesap güvenliği 1 yıl. Çekirdeğin işi; üretici yalnız türü verir. | S-92 |

## 2. Tür haritası (bu dilim, 48 tür)

Kısaltmalar. **Seviye:** Z = zorunlu, Ö = önemli, İ = isteğe bağlı. **Kanal** (varsayılan, plan listesinden): U = uygulama içi, T = telefon (web push), E = e-posta; harf sırası planınkiyle aynı. **Bugün:** plan listesindeki durum (Var = eski sistemde vardı, Değişiyor = vardı ama kural değişiyor, Yok = hiç yoktu). **Kod noktası:** üreticinin çağrısının gireceği fonksiyon, `schema:<satır>` main @ `e62f841e`. Tür kodu önerisi `alan.olay` biçimindedir; kesin adı çekirdeğin kataloğu verir.

### 2.1 Schedule (8) — alt dilim U3 (U4b'de 1)

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün |
|---|---|---|---|---|---|---|---|
| 1 | `schedule.published` | Hafta ilk kez yayınlandı | `public.publish_schedule_draft_service` schema:18980 | Yayınlanan aralıkta yayınlanmış vardiyası olan çalışanlar | Ö | UTE | Değişiyor |
| 2 | `schedule.shift_changed` | Yeniden yayında vardiyamın saati/günü/işi değişti | aynı fonksiyon (yayın farkı) | O çalışan | Ö | UTE | Değişiyor |
| 3 | `schedule.shift_added` | Yeniden yayında bana vardiya eklendi | aynı | O çalışan | Ö | UTE | Değişiyor |
| 4 | `schedule.shift_removed` | Vardiyam başkasına verildi, açığa alındı ya da silindi | aynı | Vardiyanın eski sahibi | Ö | UTE | Yok |
| 5 | `schedule.unpublished` | Hafta yayından kaldırıldı (bekleyen talepler kapanır) | `public.unpublish_schedule_service` schema:27120 | O haftada yayınlanmış vardiyası olanlar | Ö | UTE | Yok |
| 6 | `schedule.shifts_unassigned` | İşten çıkarma / lokasyondan çıkarma vardiyaları sahipsiz bıraktı | `public.terminate_employee_service` schema:26537; `public.remove_employee_from_location_service` schema:20105 (U4b) | O lokasyonda `schedule.publish` eylemi olan müdür; yoksa admin + owner | Ö | UET | Değişiyor |
| 7 | `schedule.closed_day_removed_shift` | Kapalı gün yayınlanmış vardiyamı düşürdü | `app_private.announcement_apply` schema:911 (`delete from public.schedule_published_shifts`) | Vardiyası düşen çalışan | Ö | UTE | Var |
| 8 | `schedule.export_stopped` | Zamanlanmış program e-postası 3 hatadan sonra durdu | `public.record_schedule_export_schedule_failure_service` schema:19738 | Kuralı kuran kişi (kural satırının sahibi) | Ö | UE | Yok |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (dosya · ad) | 3 kontrol |
|---|---|---|---|---|
| 1–4 | `publication:<yayın olayı id>` + alıcı | Bir yayında kişiye **tek** satır: ilk yayında `published`; yeniden yayında öncelik `shift_removed` > `shift_changed` > `shift_added`, gövde öbürlerini sayar ("2 shifts changed, 1 new"). Değişmeyen kişiye bildirim yok. | `notify_schedule.test.sql` · "publish tells each scheduled person once" / "republish tells only the changed" / "a shift moved from Ali to Bob tells both" / "a shift made open tells its old owner" | (1) alıcı listesi = vardiyası olan/değişen kişiler; (2) aynı yayında kişi başına 1 satır, aynı yayının tekrarı yeni satır yazmaz; (3) yayınlayan kendi vardiyası olsa da almaz, vardiyası değişmeyen almaz |
| 5 | `unpublish:<olay id>` + alıcı | Bekleyen izin/takas o yayından kalkınca ayrı bildirim yazılmaz; gövde "pending requests were closed" der. | · "unpublish tells the week's people once" | (1) o haftada vardiyası olanlar alır; (2) bekleyen talebi olan kişiye yine 1 satır; (3) kaldıran almaz |
| 6 | `unassigned:<işten çıkarma ya da çıkarma olayı id>:<lokasyon id>` | Lokasyon başına tek satır, gövde sayı verir ("3 shifts are left without anyone"). Karar isteyen: biri vardiyayı atayınca satır kapanır. | · "terminating leaves one note per location's manager" | (1) o lokasyonun müdürü alır, müdürsüz lokasyonda admin+owner; (2) 3 vardiya → 1 satır; (3) işten çıkaran almaz, başka lokasyonun müdürü almaz |
| 7 | `closed_day:<duyuru id>:<sürüm>` + alıcı | Kişiye tek satır (birden çok vardiyası düşse de). Kapalı gün yayından kalkınca **bu satır silinmez** (BL-883, P09). Bekleyen takas da geçersizleşirse ikinci bildirim yok. | · "a closed day tells each removed person once" | (1) vardiyası düşen alır; (2) 2 vardiya + geçersiz takas → 1 satır; (3) kapalı günü yayınlayan almaz |
| 8 | `export_stop:<kural id>:<durdurulma zamanı>` | Kural yeniden açılıp yine durursa yeni satır. | · "a stopped export rule tells its owner" | (1) kural sahibi alır; (2) 3. hatada 1 satır, 4. çağrıda yeni satır yok; (3) başka export kuralının sahibi almaz |

### 2.2 Takas (bu dilimde 5; öbür 8'i vardiya değişimi işinde) — alt dilim U7

Bugünkü kodda takas olaylarının hepsi tek bir noktadan geçiyor: `public.shift_exchange_emit` schema:25125 (eskiden buradan `shift_exchange_emit_notification_base` çağrılıyordu; C1 sildi). Komutlar `public.shift_exchanges_command_service` schema:25611, süre dolumu `public.shift_exchanges_maintain_service` schema:25807. Beş tür bu tek noktaya bağlanır. **Bu alt dilim §7 soru 1'in cevabına bağlı.**

| # | Tür kodu | Olay | Alıcı (eylem) | Sv | Kanal | Bugün | Anahtar · kapanma |
|---|---|---|---|---|---|---|---|
| 9 | `exchange.cover_asked` | İsimle kapatma istendi (en çok 3 kişi) | Seçilen kişiler | Ö | UTE | Değişiyor | `case:<id>` + alıcı · kişi cevaplayınca satırı kapanır |
| 10 | `exchange.swap_offered` | Takas teklifi | Karşı taraf | Ö | UTE | Değişiyor | `case:<id>` + alıcı · aynı |
| 11 | `exchange.answered` | Karşı taraf kabul / red etti | İsteyen | Ö | UT | Var | `case:<id>:answer` |
| 12 | `exchange.needs_approval` | Değişim onay bekliyor (yalnız anlaşma olunca, ilk istekte bir kez) | Vardiyanın lokasyonunda `exchange.approve` eylemi olan müdür; yoksa admin + owner | Ö | UET | Değişiyor | `case:<id>:approval` · ilk karar öbürlerinin satırını "Approved by …" yapar |
| 13 | `exchange.decided` | Değişimin sonucu | İlgili çalışanlar (isteyen, alan) | Ö | UTE | Değişiyor | `case:<id>:decision` + alıcı · kişiye tek |

Test: `notify_shift_exchange.test.sql` · "cover ask tells only the chosen", "approval is asked once per case", "the first decision settles the other deciders". Kontroller her türde: (1) doğru kişi; (2) aynı vakada ikinci basış yeni satır yazmaz; (3) isteyen kendi isteği için almaz.

### 2.3 İzin (4 tür + 2 davranış) — alt dilim U2

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün |
|---|---|---|---|---|---|---|---|
| 14 | `time_off.requested` | İzin talebi (ve onaylı iznin iptal talebi) | `public.submit_time_off_service` schema:26145; `public.request_time_off_cancellation_service` schema:20655 | İznin lokasyonlarında `time_off.decide` eylemi olan müdürler; müdür yoksa admin + owner | Ö | UET | Var |
| 15 | `time_off.reminder` | Son karara 12 saat kala hatırlatma | `app_private.time_off_sweep` schema:7433 (eski `fallback_notified_at` mantığı burada) | Karar vermeyen müdürler; süre geçince admin + owner | Ö | UET | Var |
| 16 | `time_off.decided` | İzin kararı: onay, ret, süre dolumu, otomatik onay, yönetici iptali | `public.decide_time_off_service` schema:10410 → `app_private.time_off_finalize` schema:6967; `app_private.time_off_sweep`; `public.revoke_time_off_service` schema:22041 | Başvuran | Ö | UTE | Değişiyor |
| 17 | `time_off.shortened` | İzin kısaltıldı (müdür kısalttı ya da çalışan izinli gününde vardiya aldı) | `public.shorten_time_off_service` schema:25918 → `app_private.shorten_time_off` schema:6605 | Başvuran + izni onaylamış olanlar | Ö | UTE | Değişiyor |
| — | (davranış) | Onaylı izin vardiya açtı | `app_private.time_off_release_shifts` schema:7289 | Ayrı bildirim yok: karar satırının gövdesi "Approved · 2 shifts open" | — | — | Değişiyor |
| — | (davranış) | Çalışan talebini geri çekti | `public.employee_request_action_service` schema:11106 (`target_kind='time_off'`, `target_action='cancel'`) | Ayrı bildirim yok: karar verenlerin satırı "Withdrawn" olur | — | — | Değişiyor |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (`notify_time_off.test.sql`) | 3 kontrol |
|---|---|---|---|---|
| 14 | `time_off:<talep id>:request` + alıcı | Karar verilince öbür karar verenlerin satırı "Approved by Ayşe" / "Declined by Ayşe"; geri çekilince "Withdrawn". Çok lokasyonda kısmi oyda satır açık kalır. | "a request reaches its deciders, the owner's own request skips the queue" | (1) lokasyonun müdürü alır, müdürsüz lokasyonda admin+owner; (2) bir talep → karar veren başına 1 satır; (3) talep eden almaz, başka lokasyonun müdürü almaz |
| 15 | `time_off:<talep id>:reminder:<manager\|fallback>` + alıcı | Her aşama bir kez; karar gelince satır kapanır. | "the 12-hour reminder goes once to who hasn't decided" | (1) oy vermemiş müdür alır, oy vermiş almaz; (2) sweep iki kez koşsa 1 satır; (3) karar verilmiş talep için yok |
| 16 | `time_off:<talep id>:decided:<revizyon>` | Başvurana tek satır, sonuç başlıkta; gerekçe yalnız ona. Onay + "vardiya açıldı" **tek** satır (BL-730). İptal talebinin onayında da tek (eski çift kayıt S:5430). | "a decision tells the applicant once, with the outcome" | (1) başvuran alır; (2) onay + açılan vardiya + son oy → 1 satır; (3) karar veren müdür almaz, öbür müdürlere yeni satır yok (satırları kapanır) |
| 17 | `time_off:<kesilen talep id>:shortened` + alıcı | Kişi başına tek; kısaltanın kendisi almaz (tek lokasyonda onaylayan çoğu zaman kısaltandır → kimse almaz, doğru). | "shortening tells the applicant and every approver but the one who shortened" | (1) başvuran + öbür onaylayanlar alır; (2) bir kısaltma → kişi başına 1; (3) kısaltan almaz |
| — | — | Geri çekme: yeni satır yok. | "withdrawing settles the deciders' rows, writes none" | (1) karar verenlerin satırı Withdrawn; (2) yeni satır sayısı 0; (3) geri çeken kendi satırını almaz |

### 2.4 Müsaitlik (2) — alt dilim U7

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün | Anahtar · birleşme | Test (`notify_availability.test.sql`) · 3 kontrol |
|---|---|---|---|---|---|---|---|---|---|
| 18 | `availability.updated` | Çalışan müsaitliğini değiştirdi (yalnız gerçek değişiklik) | `public.weekly_preferences_save_service` schema:28321 | Kişinin müsaitliğini okuyabilen herkes (`availability.team_read`; müdür, admin, owner; rütbe şartı yok) | İ | U | Değişiyor | `availability:<kişi>:<kayıt olayı>`; aynı kişinin okunmamış satırı varsa yeni satır yerine o güncellenir (grup `availability:<kişi>`) | "saving availability tells everyone who may read it, unchanged save tells no one" · (1) team_read sahipleri alır; (2) değişmeyen kayıt 0 satır, iki kayıt arka arkaya 1 okunmamış satır; (3) çalışanın kendisi almaz |
| 19 | `availability.mode_changed` | Owner müsaitlik düzenini değiştirdi | `public.weekly_preference_settings_save_service` schema:28153 | Bütün aktif çalışanlar (davetliler hariç) | Ö | UE | Var | `availability_mode:<ayar revizyonu>` | "a mode change tells every active employee once" · (1) aktif çalışanlar alır, davetli almaz; (2) kişi başına 1; (3) değiştiren owner almaz |

### 2.5 Kişiler (14) — alt dilimler U4a ve U4b

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün | Alt dilim |
|---|---|---|---|---|---|---|---|---|
| 20 | `people.invite_accepted` | Davet kabul edildi, kişi katıldı | `app_private.accept_employee_invitation_for_user` schema:442 (iki kabul yolu da buradan geçer) | Davet eden (`employee_invitations.created_by`), hâlâ aktif üyeyse | İ | U | Yok | U4a |
| 21 | `people.invite_declined` | Davet reddedildi | `public.decline_employee_invitation_service` schema:10486 | Davet eden | İ | U | Yok | U4a |
| 22 | `people.invite_cancelled` | Davetli hesabını sildi, davet düştü | `public.request_account_deletion_v2_service` schema:20473 | Davet eden; metin hesap silmeyi söylemez (gizlilik) | İ | U | Var | U4a |
| 23 | `people.onboarding_submitted` | Onboarding incelemeye geldi | `public.submit_employee_onboarding_service` schema:26072 | Kişinin lokasyonunda `onboarding.review` eylemi olan müdür; yoksa admin + owner | Ö | UET | Yok | U4a |
| 24 | `people.onboarding_changes_requested` | Onboarding'de düzeltme istendi | `public.review_employee_onboarding_service` schema:21967; `public.review_employee_onboarding_before_availability_service` schema:21843 | Çalışan | Ö | UTE | Yok | U4a |
| 25 | `people.onboarding_completed` | Onboarding tamamlandı | aynı iki fonksiyon (son onay dalı) | Çalışan | Ö | UE | Yok | U4a |
| 26 | `people.preferred_name_requested` | Tercih edilen ad istendi | `public.request_employee_preferred_name_service` schema:20562 | Owner + bütün admin'ler + kişinin lokasyonunda `employee.decide_preferred_name` eylemi olan müdür | Ö | UE | Var | U4a |
| 27 | `people.preferred_name_decided` | Tercih edilen ad kararı | `public.decide_employee_preferred_name_service` schema:10365 | Çalışan | Ö | U | Var | U4a |
| 28 | `people.no_location` | Kişi lokasyonsuz kaldı | `public.remove_employee_from_location_service` schema:20105 (son lokasyon dalı) | Kişi üzerinde `employee.terminate` eylemi olanlar (owner, admin) | Ö | UE | Değişiyor | U4b |
| 29 | `people.role_changed` | Rolüm değişti | `public.update_employee_membership_role_service` schema:27260 | O kişi | Z | UE | Yok | U4b |
| 30 | `people.access_ended` | Erişimim bitti (işten çıkarma, erişimi kaldırma, arşiv) | `public.terminate_employee_service` schema:26537; `public.remove_employee_access_service` schema:19984; `public.set_employee_archived_service` schema:24742 (`should_archive=true`) | O kişi | Z | E | Yok | U4b |
| 31 | `people.restored` | Geri alındım (Restore) | `public.set_employee_archived_service` (`should_archive=false`, `restore_access=true`) | O kişi + kişinin lokasyonunda `schedule.publish` eylemi olan müdür | Z | UE | Yok | U4b |
| 32 | `people.ownership_transfer_requested` | Sahiplik devri istendi | `public.initiate_workspace_ownership_transfer_service` schema:14411 | Hedef kişi | Z | UE | Yok | U4b |
| 33 | `people.ownership_transfer_answered` | Devir kabul, ret ya da iptal | `public.respond_workspace_ownership_transfer_service` schema:21475; `public.cancel_workspace_ownership_transfer_service` schema:9582 | Karşı taraf (kabul/ret → başlatan; iptal → hedef) | Z | UE | Yok | U4b |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (`notify_people.test.sql`) · 3 kontrol |
|---|---|---|---|
| 20–22 | `invite:<davet id>:<accepted\|declined\|cancelled>` | Davet başına tek | "invite outcomes tell the inviter once" · (1) davet eden alır; davet eden artık üye değilse kimse; (2) 1 satır; (3) davetli almaz |
| 23 | `onboarding:<vaka id>:submitted:<gönderim no>` + alıcı | İlk inceleme öbürlerinin satırını kapatır | "onboarding review reaches the location's manager, admin and owner only without one" · (1) müdür alır / müdürsüzde admin+owner; (2) bir gönderim → karar veren başına 1; (3) çalışan almaz |
| 24–25 | `onboarding:<vaka id>:review:<inceleme no>` | Bir inceleme turunda çalışana tek (düzeltme + tamamlandı aynı turda olmaz) | "a review tells the employee once" · (1) çalışan alır; (2) 1 satır; (3) inceleyen almaz |
| 26 | `preferred_name:<istek id>` + alıcı | İlk karar öbürlerinin satırını "Approved by …"/"Declined by …" yapar; owner'ın kendi isteği kendiliğinden geçer, kimseye gitmez (S-04) | "a preferred name ask reaches owner, admins and the deciding manager; the first decision settles the rest" · (1) owner+admin'ler+karar veren müdür alır, başka lokasyon müdürü almaz; (2) karar sonrası yeni satır yok; (3) isteyen almaz |
| 27 | `preferred_name:<istek id>:decided` | Tek | "the employee hears the preferred name decision once" · (1) çalışan; (2) 1; (3) karar veren almaz |
| 28 | `no_location:<çıkarma olayı id>` + alıcı | Kişi yeniden lokasyon alınca satır kapanır | "a person left without a location tells who may terminate" · (1) owner+admin alır, müdür almaz; (2) 1; (3) çıkaran almaz |
| 29 | `role:<üyelik id>:<rol revizyonu>` | Tek | "a role change tells the person" · (1) kişi alır; (2) 1; (3) değiştiren almaz |
| 30 | `access_ended:<üyelik id>:<olay id>` | İşten çıkarma + erişim kaldırma aynı işlemdeyse tek. Kişi artık uygulamayı açamaz: **yalnız e-posta** (§6.3) | "access ending emails the person once, writes no in-app row" · (1) kişiye e-posta gönderimi kuyruğa girer; (2) 1; (3) uygulama içi satır yok, işi yapan almaz |
| 31 | `restored:<üyelik id>:<olay id>` + alıcı | Tek | "restore tells the person and the location's manager" · (1) ikisi alır; (2) kişi başına 1; (3) geri alan almaz |
| 32–33 | `ownership:<devir id>:<initiated\|accepted\|rejected\|cancelled>` | Cevap gelince istek satırı kapanır | "ownership transfer tells the other side at each step" · (1) karşı taraf alır; (2) adım başına 1; (3) adımı atan almaz |

### 2.6 Belgeler (6) — alt dilim U5

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün |
|---|---|---|---|---|---|---|---|
| 34 | `documents.requested` | Belge istendi (yükle ya da imzala; toplu tek bildirim) | `public.set_document_publication_service` schema:24657; `app_private.document_reconcile_employee` schema:4124 (kişiye yeni gereklilik düşünce) | Çalışan | Ö | UTE | Değişiyor |
| 35 | `documents.submitted` | Belge incelemeye geldi | `public.submit_employee_document_lifecycle_service` schema:26024 | Kişinin lokasyonunda `documents.review` eylemi olan müdür; yoksa admin + owner | Ö | UE | Değişiyor |
| 36 | `documents.decided` | Belge kararı | `public.review_employee_document_lifecycle_service` schema:21776 | Çalışan | Ö | UTE | Var |
| 37 | `documents.due_soon` | Son tarih yaklaşıyor (7 gün, 1 gün, gününde) | `public.documents_maintain_service` schema:10899 (bakım işçisi çağırır) | Çalışan | Ö | UTE | Değişiyor |
| 38 | `documents.expiring` | Belgenin süresi doluyor (30, 7, 1 gün) | aynı | Çalışan + `documents.review` karar verenleri | Ö | UE | Değişiyor |
| 39 | `documents.access_changed` | Erişim kısıtlandı ya da geri geldi | `app_private.document_suspend_overdue` schema:4263; `app_private.document_reconcile_employee` (geri gelme) | Çalışan | Ö | UTE | Var |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (`notify_documents.test.sql`) · 3 kontrol |
|---|---|---|---|
| 34 | `doc_request:<kişi>:<yayın ya da uzlaştırma olayı id>` | Bir olayda birden çok belge → kişiye **tek** satır ("2 documents to sign"); belge tamamlanınca satır kapanır | "a published rule asks each matching person once" · (1) kurala uyan kişiler alır, owner almaz (S: owner muaf); (2) 3 belge → 1 satır; (3) yayınlayan almaz |
| 35 | `doc_review:<gereklilik id>:<gönderim revizyonu>` + alıcı | İlk karar öbürlerinin satırını kapatır | "an upload reaches its deciders once; the first decision settles the rest" · (1) karar verenler; (2) karar sonrası yeni satır yok; (3) yükleyen almaz, incelemesiz kabulde **kimse** almaz (D06) |
| 36 | `doc_decision:<gereklilik id>:<revizyon>` | Tek; gerekçe yok (D08) | "the employee hears the document decision once" · (1) çalışan; (2) 1; (3) karar veren almaz |
| 37 | `doc_due:<gereklilik id>:<7\|1\|0>` | Her eşik bir kez; bugünkü "her gün 09:00" biter (BL-823) | "due reminders go at 7, 1 and 0 days, once each" · (1) çalışan; (2) bakım iki kez koşsa 1; (3) tamamlanmış belgeye yok |
| 38 | `doc_expiry:<onaylı belge id>:<30\|7\|1>` | Her eşik bir kez; workspace ayarındaki eşikler okunur (BL-822) | "expiry warnings go to the employee and the deciders, once per milestone" · (1) çalışan + karar verenler; (2) 1; (3) yenilenmiş belgeye yok |
| 39 | `doc_access:<kişi>:<suspended\|restored>:<olay zamanı>` | Kısıt + "missing" aynı gün tek satır | "access restriction and its return each tell the employee once" · (1) çalışan; (2) 1; (3) kısıtı kaldıran yönetici almaz |

### 2.7 Duyurular (5) — alt dilim U6

| # | Tür kodu | Olay | Kod noktası | Alıcı (eylem) | Sv | Kanal | Bugün |
|---|---|---|---|---|---|---|---|
| 40 | `announcements.published` | Duyuru ya da önemli gün yayınlandı (hemen ya da zamanlanmış) | `public.save_announcement_service` schema:22129; `app_private.announcement_release` schema:2289 (zamanlanmış) | Yalnız hedef kitle (`app_private.announcement_audience` schema:1071); yazan ve yayınlayan hariç | Ö | UT | Değişiyor |
| 41 | `announcements.reminder` | Remind | **yeni** `public.remind_announcement_service` + API yolu + duyuru çekmecesinde Remind düğmesi geri gelir (S-124) | Henüz onaylamamış hedef kişiler | Ö | UT | Yok |
| 42 | `announcements.unpublished` | Duyuru iptal (yayından kaldırıldı) | `public.set_announcement_state_service` schema:24561 | Duyuruyu almış olanlar | Ö | U | Yok |
| 43 | `announcements.changed` | Yayındaki duyurunun içeriği değişti | `public.save_announcement_service` (içerik revizyonu artınca) | Henüz onaylamamışlar; hedefe yeni eklenenlere `published` | Ö | U | Değişiyor |
| 44 | `announcements.publish_failed` | Zamanlanmış yayın başarısız | `app_private.announcement_release` (hata dalı; eski `announcement_tell_failed` C2'de siliniyor) | Zamanlayan, yoksa yazan; ikisi de üye değilse owner | Ö | UE | Yok |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (`notify_announcements.test.sql`) · 3 kontrol |
|---|---|---|---|
| 40 | `announcement:<id>:<yayın revizyonu>` + alıcı | Hedef değişince yalnız yeniler; yalnız saat değişince yok; geçmiş önemli tarih üretmez (S-16) | "publishing tells only the audience, never the writer" · (1) hedef listesi alır, hedef dışı müdür/admin/owner almaz (BL-858); (2) kişi başına 1; (3) yazan ve yayınlayan almaz |
| 41 | `announcement:<id>:remind:<tarih>` + alıcı | Günde en çok bir Remind (öneri) | "remind reaches only those who haven't acknowledged" · (1) onaylamamışlar; (2) aynı gün ikinci Remind yeni satır yazmaz; (3) onaylamış ve Remind'a basan almaz |
| 42 | `announcement:<id>:unpublished:<revizyon>` | Eski "yayınlandı" satırı kapanır, yerine tek iptal satırı | "unpublishing tells those who got it, once" · (1) almış olanlar; (2) 1; (3) kaldıran almaz |
| 43 | `announcement:<id>:content:<içerik revizyonu>` | Okunmamış eski satır varsa o güncellenir, yeni satır açılmaz | "a content change tells only those who haven't acknowledged" · (1) onaylamamışlar; (2) 1; (3) değiştiren almaz (BL-890) |
| 44 | `announcement:<id>:release_failed:<deneme>` | Tek | "a failed scheduled publish tells its scheduler once" · (1) zamanlayan; (2) 1; (3) hedef kitle almaz |

### 2.8 Hesap (3) ve Workspace (1) — alt dilim U1

| # | Tür kodu | Olay | Kod noktası | Alıcı | Sv | Kanal | Bugün |
|---|---|---|---|---|---|---|---|
| 45 | `account.password_changed` | Parola değişti (öteki oturumlar kapandı; tek bildirim) | `public.record_account_security_event_service` schema:19665 (`account.password_changed`) → `app_private.record_security_audit_event_service` schema:5927; çağıran API `apps/api/src/account/account-security-service.ts:235` | Kişi | Z | UE | Değişiyor |
| 46 | `account.email_changed` | Giriş e-postası değişti, istendi ya da iptal edildi | aynı fonksiyon (`account.email_change_requested`); `public.cancel_account_email_change_service` schema:9422; **tamamlanma için bugün olay yok** (H05) | Kişi; e-posta iki adrese | Z | UE | Değişiyor |
| 47 | `account.sessions_revoked` | Öteki oturumlar kapatıldı (parola değişmeden) | aynı fonksiyon (`account.sessions_revoked`) | Kişi | Z | U | Var |
| 48 | `workspace.closure_changed` | Workspace kapanışı planlandı ya da iptal edildi | `public.request_workspace_closure_service` schema:20747; `public.cancel_workspace_closure_service` schema:9471 | Bütün aktif üyeler | Z | UE | Yok |

| # | Tekilleştirme anahtarı | Birleşme / kapanma | Test (`notify_account.test.sql`) · 3 kontrol |
|---|---|---|---|
| 45 | `security:<audit olayı id>` | Parola değişimi ardından gelen `sessions_revoked` aynı istekteyse **yazılmaz** (H01'in iki satırı biter) | "a password change tells the person once, even with sessions revoked" · (1) kişi alır; (2) iki olay → 1 satır; (3) başka kullanıcı almaz |
| 46 | `security:<audit olayı id>` | İstek, iptal, tamamlanma ayrı olaylar | "an email change tells the person at each step" · (1) kişi; (2) adım başına 1; (3) başka kullanıcı almaz |
| 47 | `security:<audit olayı id>` | Tek | "signing out elsewhere tells the person once" · aynı üç kontrol |
| 48 | `closure:<workspace>:<scheduled\|cancelled>:<revizyon>` | Tek | "a closure plan tells every member, not the owner who made it" · (1) aktif üyeler; (2) kişi başına 1; (3) owner almaz, başka workspace'in üyesi almaz |

## 3. Testler: ortak düzen

- **Yer:** her alt dilim kendi pgTAP dosyasını yazar (`supabase/tests/notify_<alan>.test.sql`); dosya adları yukarıda. Kişiler test dünyasından (`supabase/test-support/builder.sql`: `tests.world`, `tests.person`, `tests.works_at`, `tests.publish_week`, `tests.leave`, `tests.cover_case`, `tests.closed_day`, `tests.role`).
- **Her türde üç kontrol** (bitti ölçütü): (1) doğru kişi(ler) — alıcı kümesi `results_eq` ile birebir; (2) tek bildirim — aynı olay iki kez tetiklenir ya da bir olay iki yoldan geçer, satır sayısı kişi başına 1; (3) yazan/yapan hariç — işi yapan kişi ve kapsam dışı biri (başka lokasyon ya da başka workspace) satır almaz.
- **Karar isteyen türlerde dördüncü kontrol:** ilk karar öbür karar verenlerin satırını kapatır ("Approved by …"), yeni satır yazmaz.
- **Kapsam:** testler çekirdeğin tablosunu okur; "gidecek mi" kuralının seviye/kanal mantığını tekrar sınamaz (o çekirdeğin testi). Üretici testi yalnız "hangi tür, kime, kaç kez" sorar.
- **Mevcut testler:** söküm C1 "domain tests stop expecting notifications" ile alan testlerinden bildirim beklentisini sildi; bu dilim onları geri koymaz, yeni dosyaya yazar.
- **Yeni `*_service`:** yalnız `remind_announcement_service` (U6). `supabase/tests/authorization_matrix.test.sql` ve `supabase/tests/authz_catalog.test.sql`'de sınıflanır.
- **E2E:** bu dilimde yok; kutu ekranları (5. dilim) "izin iste → müdür görür → onaylar → çalışan görür" akışını Playwright'la sınar.

## 4. Bu dilimin dışında kalanlar

### 4.1 Vardiya değişimi işiyle gelecek (8)
Kaynak: `PD\notes\vardiya-degisim\PLAN.md` §3 ("Anlar ve ekranlar"). Hepsi bugünkü kodda olmayan anlara bağlı (talip olma, 3 kişiye sorma, 4 saat kala kapanma, müdüre 12 saatte bir hatırlatma).

| Olay | Alıcı | Sv | Kanal |
|---|---|---|---|
| Ekstra vardiya herkese açıldı | Alabilecek çalışanlar | İ | UT |
| Açık vardiyayı başkası aldı | Talip olan öbürleri | İ | U |
| Sahibi vardiyasını geri aldı | Talip olanlar | İ | U |
| Kapatmayı başkası üstlendi | Sorulan öbürleri | Ö | U |
| Kimse kapatamadı (Ask someone else / Release to everyone) | İsteyen | Ö | UTE |
| Onay hatırlatması (12 saatte bir; kapanmadan 4 saat önce son uyarı) | Karar veren müdür | Ö | UET |
| Talep kapandı (vardiyadan 4 saat önce) | Talepteki herkes | Ö | U |
| Sahipsiz vardiya açık vardiyalara konsun mu | Lokasyon müdürü | Ö | UE |

### 4.2 Stripe / ödeme (4)
Deneme bitiyor (3 gün kala), ödeme başarısız ya da doğrulama gerekiyor, fatura ödendi, abonelik durdu. Stripe bağlanınca webhook'tan üretilir; bugün kod noktası yok.

### 4.3 Sonra, MVP sonrası (5)
Hafta yayınlanmadı (3 gün kala), vardiya hatırlatması (2 saat önce), Lineup paylaşıldı, Lineup'a başka lokasyondan kişi alındı, yeni cihazdan giriş. Lineup paylaşımı özelliği henüz yok.

### 4.4 Ayrı yol, dokunulmaz (S-96)
Davet e-postası, parola sıfırlama, haftalık program e-postası (zamanlanmış export), hesap silme e-postaları. Kendi yollarıyla gider (`apps/api/src/email/resend-email.ts`); bu dilim onlara dokunmaz. İstisna değil, not: #8 "export durdu" yalnız kuralın **durduğunu** kuralın sahibine söyler; e-postanın kendisi ayrı yolda kalır.

## 5. Alt dilimler ve sıra

### 5.1 Alt dilimler

| Kod | Alt dilim | Türler | Dokunacağı fonksiyonlar (hepsi `supabase/schema.sql` + yeni migration) | Başka dosyalar | Süre | Sınıf |
|---|---|---|---|---|---|---|
| U1 | Hesap + workspace | #45–48 | `record_account_security_event_service`, `app_private.record_security_audit_event_service`, `cancel_account_email_change_service`, `request_workspace_closure_service`, `cancel_workspace_closure_service` | `apps/api/src/account/account-security-service.ts` (e-posta değişikliği tamamlanınca olay kaydı; H05); `supabase/tests/notify_account.test.sql` | 2–3 sa | İncelemeli (parola/oturum) |
| U2 | İzin | #14–17 + 2 davranış | `submit_time_off_service`, `request_time_off_cancellation_service`, `decide_time_off_service`, `app_private.time_off_finalize`, `app_private.time_off_sweep`, `revoke_time_off_service`, `shorten_time_off_service`, `app_private.shorten_time_off`, `employee_request_action_service`, `app_private.time_off_release_shifts` | `supabase/tests/notify_time_off.test.sql` | 3–4 sa | İncelemeli |
| U3 | Schedule yayını | #1–5, #7, #8 | `publish_schedule_draft_service`, `unpublish_schedule_service`, `app_private.announcement_apply`, `record_schedule_export_schedule_failure_service` | `supabase/tests/notify_schedule.test.sql`; yayın penceresindeki "N people" metni (S-124) yerine "N people will be told" geri gelir: `apps/web` Schedule yayın penceresi | 3–4 sa | İncelemeli |
| U5 | Belgeler | #34–39 | `set_document_publication_service`, `app_private.document_reconcile_employee`, `submit_employee_document_lifecycle_service`, `review_employee_document_lifecycle_service`, `documents_maintain_service`, `app_private.document_suspend_overdue` | `apps/api/src/maintenance/maintenance-worker.ts` (dönen sayıya `notified` eklenecekse); `supabase/tests/notify_documents.test.sql` | 3–4 sa | İncelemeli |
| U6 | Duyurular | #40–44 | `save_announcement_service`, `set_announcement_state_service`, `app_private.announcement_release`; yeni `remind_announcement_service` | `apps/api/src/communications/communication-service.ts` + route (Remind); duyuru çekmecesinde Remind düğmesi (S-124); `authorization_matrix.test.sql`, `authz_catalog.test.sql`; `supabase/tests/notify_announcements.test.sql` | 3–4 sa | İncelemeli (yeni `*_service`, API cevap şekli) |
| U4a | Kişiler: davet, onboarding, tercih edilen ad | #20–27 | `app_private.accept_employee_invitation_for_user`, `decline_employee_invitation_service`, `request_account_deletion_v2_service`, `submit_employee_onboarding_service`, `review_employee_onboarding_service`, `review_employee_onboarding_before_availability_service`, `request_employee_preferred_name_service`, `decide_employee_preferred_name_service` | `supabase/tests/notify_people.test.sql` (ilk yarı) | 3–4 sa | İncelemeli (katılım/davet) |
| U4b | Kişiler: rol, erişim, geri alma, sahiplik, lokasyonsuz + sahipsiz vardiya | #6, #28–33 | `terminate_employee_service`, `remove_employee_from_location_service`, `remove_employee_access_service`, `set_employee_archived_service`, `update_employee_membership_role_service`, `initiate_/respond_/cancel_workspace_ownership_transfer_service` | `supabase/tests/notify_people.test.sql` (ikinci yarı) | 3–4 sa | İncelemeli (sahiplik devri) |
| U7 | Müsaitlik (+ takas, §7 soru 1'e göre) | #18–19 (+ #9–13) | `weekly_preferences_save_service`, `weekly_preference_settings_save_service` (+ `shift_exchange_emit`) | `supabase/tests/notify_availability.test.sql` (+ `notify_shift_exchange.test.sql`) | 2 sa (+2 sa) | İncelemeli |

Çakışma tablosu: hiçbir fonksiyon iki alt dilimde yok. `supabase/schema.sql` her dilimde değişir ama yalnız o dilimin fonksiyon blokları; tren sırayla aldığı için çakışma yok (başlık satırı çakışması bilinen tuzak: `schema-sql-rebase-header-conflict`). `terminate_employee_service` yalnız U4b'de (#6 ve #30 birlikte, bu yüzden #6 Schedule başlığında olsa da U4b'ye kondu).

### 5.2 Önerilen sıra ve neden

1. **U1 Hesap + workspace.** En küçük, karar veren yok; çekirdeğin "zorunlu seviye", "workspace'siz (hesap) bildirim" ve "yalnız e-posta" yollarını ilk sınayan dilim (§6.3).
2. **U2 İzin.** Çekirdeğin "karar veren" yardımcısını ve "ilk karar öbürlerini kapatır" davranışını ilk kuran dilim; sonrakiler (onboarding, belge, tercih edilen ad, takas) aynı kalıbı kullanır.
3. **U3 Schedule yayını.** En çok kişiye giden dilim. `publish_schedule_draft_service` başka Schedule işlerinin de dokunduğu fonksiyon; koordinatör o sırada Schedule'da açık iş olmadığını kontrol eder.
4. **U5 Belgeler.** Bakım işçisi (cron) yolunu sınar.
5. **U6 Duyurular.** Tek çok katmanlı dilim (DB + API + web düğmesi).
6. **U4a**, 7. **U4b** Kişiler. Katılım/davet ve sahiplik devri incelemeli sınıfın en hassası; kalıp oturduktan sonra.
8. **U7 Müsaitlik** (+ takas kararı).

### 5.3 Canlı migration yükü (öneri)
Her alt dilim var olan fonksiyon gövdelerini değiştirir → CLAUDE.md §5.5'te **riskli** migration: `nf-guvenlik` ONAY'ı + Mert'in "evet"i. 8 alt dilim 8 ayrı "evet" ister. Öneri: alt dilimler ayrı dal ve ayrı trenle main'e girsin (yerel DB ve CI her birini ayrı sınar), canlıya ise **üç toplu adımda** uygulansın: (1) U1+U2, (2) U3+U5+U6, (3) U4a+U4b+U7. Mert her toplu adım için bir kez "evet" der. Bu arada main ile canlı arasında fark birkaç gün sürebilir; canlıda gerçek kullanıcı yok (CLAUDE.md §3.A.5), risk düşük. (§7 soru 3)

## 6. Çekirdekle uyum

16 Ekim'de `bildirim-cekirdek` oturumunun dalında commit yoktu (`claude/jolly-aryabhata-072e13` = main), `origin/task/bildirim-07` yok, ortak not klasörü boş. Aşağısı üreticilerin çekirdekten **beklediği** arayüz; çekirdek main'e girince karşılaştırılır.

### 6.1 Üreticinin çağıracağı tek fonksiyon (öneri)

```sql
app_private.notify(
  w uuid,                 -- workspace; hesap türlerinde null (6.3)
  type_key text,          -- katalogdaki tür ('time_off.decided')
  recipients uuid[],      -- auth kullanıcı id'leri; çekirdek actor'ü çıkarır
  actor uuid,             -- işi yapan (sistemde null)
  dedupe_key text,        -- §2 "Tekilleştirme anahtarı"; (type_key, dedupe_key, alıcı) tekil
  subject jsonb,          -- {kind, id, location_ids[]} — derin bağlantı ve kapsam
  payload jsonb,          -- başlık/gövde değişkenleri (İngilizce metin katalogda)
  group_key text default null  -- aynı konunun okunmamış satırını güncellemek için (#18, #43)
) returns integer         -- yazılan satır sayısı (test için)
```

### 6.2 Üreticinin ihtiyaç duyduğu yardımcılar

| İhtiyaç | Neden | Öneri |
|---|---|---|
| **Karar veren bul** | C2 `time_off_deciders` ve `time_off_alone_deciders`'ı siliyor; izin, onboarding, belge, tercih edilen ad, takas, sahipsiz vardiya aynı kuralı ister | `app_private.notify_deciders(w, action, location_ids uuid[], target_employee uuid) returns uuid[]`: o lokasyonlarda `action` eylemi olan aktif müdürler (`authz_check` ile, rol adıyla değil); hiç yoksa aynı eylemi olan admin + owner. Eski gövdeler `git show 7651582c^:supabase/schema.sql` içinde |
| **Eylemi olan herkes** | Müsaitlik (#18) rütbe şartsız; lokasyonsuz kalan (#28) `employee.terminate` | `app_private.notify_holders(w, action, location_ids, target_employee) returns uuid[]` (müdür önceliği yok) |
| **Satırı kapat** | "Approved by …", "Withdrawn", karar gelince hatırlatmanın kapanması | `app_private.notify_settle(w, type_key, dedupe_key_prefix, outcome text, actor uuid)`: eşleşen açık satırları kapanmış duruma çeker, yeni satır yazmaz |
| **Kişiden kullanıcıya** | Alan fonksiyonları çoğunlukla `employee_id` taşır | Çekirdek `recipients` yerine `employee_id` de kabul edebilir ya da `app_private.notify_user_of(w, employee_id)` verir |

### 6.3 Uyumsuzluk riski olan yerler

1. **Workspace'siz bildirim.** Hesap türleri (#45–47) bir workspace'e ait değil; çekirdeğin tablosunda `workspace_id` zorunluysa bu türler yazılamaz. Öneri: `workspace_id` boş olabilir, RLS satırı yalnız alıcıya açar.
2. **Üye olmayana e-posta.** #30 erişim biten kişi ve anında kapanışta (#48) üyeler artık uygulamayı açamaz. "Uygulama içi her zaman yazılır" kuralı bunlarda anlamsız; çekirdek bu türlerde uygulama içini atlayıp yalnız e-posta kuyruğuna yazabilmeli ("gidecek mi" kuralı üyelik sormamalı).
3. **İki adrese e-posta.** #46 giriş e-postası değişince eski adrese de gider; alıcı bir kullanıcı değil, adres. Öneri: payload'da `extra_email_to`, çekirdek kuyruğa ikinci satırı yazar. Değilse bu kısım ayrı yol (Supabase'in kendi e-postası) kalır.
4. **Tekilleştirme yeri.** Anahtar (tür, anahtar, alıcı) üzerinde tekil index ve `on conflict do nothing` olmalı; yoksa sweep/bakım işlerinin (#15, #37, #38) iki kez koşması çift satır yazar.
5. **Yazan hariç tek yerde.** Çekirdek `actor`'ü alıcılardan çıkarmazsa her üretici ayrı süzer, unutulan olur. Testlerin 3. kontrolü bunu her türde sınar.
6. **Katalog alanları.** Üretici kataloğun şu alanlarına güvenir: `type_key`, seviye (Z/Ö/İ), varsayılan kanallar, başlık şablonu, "karar ister mi" (kapanma davranışı için), saklama sınıfı (güvenlik 1 yıl, S-92). Bunlardan biri katalogda yoksa üreticiye taşınmaz; çekirdeğe eklenir (S-91: katalog yalnız DB'de).
7. **Hız.** Yayın (#1–4) yüzlerce satır yazabilir; `notify` küme tabanlı (tek `insert … select`) olmalı. Schedule ızgarası okuma çıtası (≤50 ms) yazmayı kapsamaz ama yayın süresi ölçülmeli.

## 7. Mert'e sorulacak

Kural: cevap yoksa "sektörde nasıl yapılıyorsa o". Her soruda önerilen ilk sırada.

1. **Takasın 5 bildirimi ne zaman?** Bugünkü takas kodu vardiya değişimi işinde baştan yazılacak.
   - **(Önerilen) Vardiya değişimi işiyle gelsin.** Bildirim iki kez yazılmaz; o işe kadar takasta bildirim yok. Sektör: yeniden yazılacak akışa geçici kod eklenmez. Dayanak: S-123 sırası, vardiya değişimi planı.
   - Şimdi bugünkü koda yazılsın (U7'de, ~2 saat), vardiya değişimi işi yeniden yazar.
2. **Remind sınırı.** Duyuruda Remind düğmesi geri geliyor (S-124). Öneri: aynı duyuru için günde bir kez; ikinci basışta düğme "Reminded today" olur. Sektör (Slack, Connecteam): sınırlı hatırlatma. Dayanak: yok — yeni karar.
3. **Canlı migration'ları toplu uygulamak.** §5.3: sekiz riskli adım yerine üç toplu "evet". Dayanak: CLAUDE.md §5.5 (riskli sınıf), yeni karar.
4. **Yayın penceresindeki cümle.** S-124 "N people told"u "N people" yaptı; U3 ile "12 people will be told" geri gelsin mi? Öneri: evet, plan sayfası (S-123) bunu söylüyor; aynı dilimde.
5. **Erişimi biten kişiye yalnız e-posta.** E-posta dilimi (7. dilim, Resend) gelene kadar #30 hiçbir yere gitmez (kuyrukta bekler). Öneri: kabul; zorunlu türler e-posta dilimiyle birlikte gerçekten gider. Dayanak: S-96 (arada bildirim olmaması kabul).
