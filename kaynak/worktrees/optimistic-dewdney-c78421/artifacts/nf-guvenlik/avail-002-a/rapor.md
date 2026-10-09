# AVAIL-002 A1+A2 inceleme (nf-guvenlik)

**KARAR: DEĞİŞİKLİK İSTE** (incelenen: `task/avail-002-a` @ `9d8c767c`, taban `836d967a`)

Güvenlik açığı bulunmadı: başka workspace'e ya da lokasyona sızıntı yok, yetkide atlama yok, "bilgi eksikse izin ver" (fail-open) yok. Onayı durduran tek şey 1 numaralı bulgu. Bir yöneticiye gönderilen davet, belli bir ayar açıkken hiç tamamlanamıyor.

## Bulgular

### Yüksek
**1. "Müsaitlik onboarding'de zorunlu" açıkken davet edilen müdür ya da admin onboarding'i bitiremiyor.**
- Nerede: `supabase/migrations/20261007010000_availability_writes_ask_the_core.sql:16` ve `:98`. Kendi haftasını artık yalnız employee yazabiliyor (M13, KK-133).
- Neden takılıyor: onboarding adımları her davet edilen kişi için kuruluyor, rolüne bakılmıyor. Kurulumu `app_private.initialize_employee_onboarding`, davetin kabulü `accept_employee_invitation_for_user` yapıyor. Bu adımlardan biri "Availability". Settings → Scheduling → Availability'de "onboarding'de zorunlu" açıksa `guard_weekly_onboarding_requirement` bu adımı hem zorunlu hem aktivasyonu durduran adım yapıyor (`required = blocks_activation = true`). Bu dalla birlikte müdür kendi haftasını ne okuyabiliyor ne kaydedebiliyor (`authz.rank`). Adım hiç tamamlanmıyor. `submit_employee_onboarding_service` "required onboarding items remain incomplete" diyerek reddediyor. Kişi `pending_activation` durumunda kalıyor.
- Örnek: owner "availability required at onboarding"ı açar ve Ayşe'yi Kadıköy müdürü olarak davet eder. Ayşe daveti kabul eder, /welcome/availability sayfası 403 verir, Submit hiç açılmaz. Ayşe uygulamaya giremez. Owner'ın tek çıkış yolu ayarı kapatmak, bunu da bilmesi için bir işaret yok.
- Kanıt: geri alınan deneme, aynı senaryo, aynı müdür (workspace `6ea5d512…`, kişi `9abeff35…`):
  - main'de: READ ok, SAVE ok, adım `completed`.
  - dalda: READ ve SAVE `42501 authz.rank`, adım `not_started`, `required=t`, `blocks_activation=t`.
  - Ortak DB öncesi ve sonrası aynı.
- Beklenen: M13 doğruysa onboarding'in "Availability" adımı employee rütbesinde olmayan kişide hiç olmamalı ya da zorunlu sayılmamalı. Bu, aynı kuralın öbür ucu. Düzeltme `guard_weekly_onboarding_requirement`'ta `app_private.ranks_as_employee` ile `required` ve `blocks_activation` değerlerini `false` yapmak olabilir. Rol değişince adımın yeniden hesaplanması da gerekir. Bunun yanına pgTAP hücresi: davet edilen müdür, ayar açık, Submit çalışıyor.
- Not: yazarın matrisinde "aydan (onboarding'deki müdür) → rank" hücresi var. Yani ret bilinçli verilmiş, ama ret yüzünden onboarding'in takıldığı görülmemiş. Web tarafındaki adım listesi (`EmployeeOnboardingPage.tsx:232`) de role bakmıyor. Bu kısım B/C'nin işi.

### Orta
**2. Employee'den müdüre terfi eden kişinin eski müsaitlik işaretleri donup kalıyor.**
- Rol yükselince yöneticinin notu siliniyor (`app_private.manager_note_follows_role`). Kişinin kendi haftası (`employee_weekly_preferences`) ise kalıyor. `weekly_preference_capacity` bu haftayı rütbeye bakmadan okuyor. Bu dalla kişi kendi haftasını artık düzenleyemiyor (rank). Başka bir müdür de düzenleyemiyor: `availability.team_write` hedefin employee olmasını istiyor.
- Örnek: Can garsonken Salı akşamlarını "unavailable" işaretlemişti, sonra shift lead (manager) oldu. Schedule'da Salı vardiyası her yazmada uyarı kutusu açar, kartta turuncu "!" çıkar, Auto-fill Can'ı seçmez. Bu işareti kimse silemez.
- Beklenen: CLAUDE.md §9 ve P01'e göre bugünkü kurala uymayan kayıt silinir. Rol employee'nin üstüne çıkınca kendi haftası da silinsin, `manager_note_follows_role`'ün yanına bir satır. pgTAP: terfiden sonra haftası yok.

**3. Yöneticinin notu Publish'e hâlâ bir cümleyle giriyor (M12'ye aykırı).**
- Nerede: `20261007000000_availability_always_warns.sql:875`. Pre-flight'taki "schedule_conflict" bulgusunun metni, gerekçelerden yalnız `code <> 'availability'` olanları süzüyor. Yeni `note` gerekçesi süzülmüyor. `weekly_assignment_candidate_base` (`:1008`) ise doğru süzüyor: `not in ('availability','note')`.
- Örnek: Can'ın Çarşamba vardiyası hem dinlenme kuralına takılıyor hem de Ayşe'nin notuna denk geliyor. Mehmet Publish → Pre-flight'ı açınca bulguda "The assignment overlaps hours a manager noted for this person." cümlesini görür. Mehmet'in notu okuma izni (`availability.note_read`) olmasa da görür.
- Beklenen: `not in ('availability','note')` ve pgTAP'te başka bir çakışmayla birlikte not hücresi.

**4. Varsayılan saat önizlemesi notun saatlerini izne bakmadan veriyor (eskiden de vardı).**
- Shift types'ta varsayılan saat değişince açılan önizleme (`preview_schedule_default_hours_service`) `availability_impact_assessment` üzerinden bütün gerekçeleri döndürüyor. Bunun içinde `note` gerekçesi ve notun saatleri (`intervals`) de var. Önizleme yalnız `schedule.edit` soruyor, `availability.note_read` sormuyor.
- Bu dal yazma anı kontrolünde (`assess_weekly_schedule_assignment_service:275`) ve ızgarada bu süzgeci kurdu. Migration başlığı da "its hours reach only whoever the core lets read the note" diyor. Bu yol kapsanmamış. Yalnız `availability.read` izni olmayan özel rollü müdürü etkiliyor.
- Beklenen: aynı süzgeç bu yolda da, ya da bu yol backlog'a yazılsın.

### Düşük
**5.** Tipten saate çeviride bir gün 12'den fazla ayrı aralık çıkarsa (13'ten fazla, aralarında boşluk olan, işaretli tip) CHECK kısıtı mod değişikliğini bütünüyle geri çeviriyor (23514). Veri kaybolmuyor, ama owner modu değiştiremiyor ve nedenini göremiyor (`20261007020000_…:304-316`). Gerçekte olası değil. Not olarak kalsın.

## Koordinatörün 8 sorusu
1. **`authz_check`:** değişiklik tek bir blok (`:95-100`, diff eski tanımla birebir karşılaştırıldı). `employee_target` bayrağı `own` eylemlerinden yalnız `availability.own`'da açık, öteki `own` eylemlerine dokunmuyor. Fail-open yok. Sıra doğru: önce not_member ve workspace_closed, sonra hedef aynı workspace'te mi, sonra restricted ya da not_active, sonra rank. Bilinmeyen kişi her rolde `out_of_scope` alıyor (kişi araması rank kontrolünden önce).
2. **Dört servis:** dördü de çekirdeğe soruyor. Ham `workspace_memberships` ile kendi kaydı kontrolü yok, `service_actor_has_permission` yok, `auth.uid()` yok. Ret 42501 + `authz.*` (not_member, out_of_scope, rank, missing_permission; pgTAP'te var). `authorize` ret vermezse yazılan son `raise` `out_of_scope` diyor, yani boşluk yok.
3. **Employee'nin giriş modu:** kırılma yok. My availability ve onboarding adımı modu `weekly_preferences_read_service`'in `settings.input_mode` alanından alıyor (`20261007010000_…:277`). Ayar okuma ucunu (`/weekly/settings`) yalnız Settings → Scheduling ekranı (`WeeklyPreferenceSettings.tsx`) çağırıyor. B'ye not: bu uçtaki rotaya özel kapı (`permissions.includes("settings.schedule_rules.manage")`, `weekly-preferences-routes.ts:113`) çekirdekle aynı kuralı söylüyor. B bu kapıyı kaldırabilir.
4. **Yeni yardımcılar:** `weekly_preference_may_write` ve `weekly_preference_whole_days` `app_private` altında. İkisi de SECURITY DEFINER ve `search_path = ''`. `public, anon, authenticated`'tan geri alındı. Yalnız servislerin içinden çağrılıyorlar.
5. **Yönetici notu:**
   - ızgara: `get_schedule_read_model_service`, kelimeler ve `note_intervals` yalnız `note_read` olana.
   - haftalık projeksiyon: not ayrı alanda, turuncu saatlere girmiyor.
   - yazma anı: süzülüyor.
   - Auto-fill: `has_availability_conflict` notu içermiyor.
   - aday listesi: süzülüyor.
   - Shift Hub'daki çalışan uyarısı: yalnız çalışanın kendi saatleri.
   - saklanan yayın görüntüsü: okuyucu anahtarları süzüyor, istemciye doğrudan tablo izni yok.
   - Açık kalan iki yer: bulgu 3 (pre-flight cümlesi) ve bulgu 4 (varsayılan saat önizlemesi).
6. **Silme:** silinen tabloya başka tablodan bağ yok (yalnız kendi dışa giden bağları var). `seed.sql`, builder, e2e ve testlerde eski ad kalmadı. Beşi de `retired_objects_stay_gone`'da (19/19 yeşil). API'de önizleme çağrısı hâlâ duruyor (`availability-service.ts:68,79`). Bu B'nin işi, A B'siz main'e girmemeli (KK-131).
7. **`range` → `ranges`:**
   - DB'de zorlanıyor: tablolarda `weekly_preference_valid` CHECK'i var. En çok 12 aralık, sıralı, ayrık (değen iki aralık reddediliyor), gün içi, 24:00 yalnız bitiş olabilir.
   - Eski doğrulayıcı da bitiş > başlangıç istiyordu, dönüşümde kayıp yok.
   - Gece yarısını geçen tip ertesi güne yazılıyor, Cumartesi Pazar'a dönüyor.
   - Eski `range` okuyan DB fonksiyonu kalmadı (ölçüldü).
   - Çeviri sağlaması pgTAP'te 37/37.
8. **Sayaçlar ve testler:** eski yardımcının tavanı 11'den 10'a indi. Yeni `*_service` yok, silinen ikisi sınıflama listesinden çıktı. Gevşetme yok:
   - `schedule_asks_the_core`'da düşen iki hücre M13'ün sonucu ("Can kaydedemez" artık ret olarak kilitli), duyma kuralı Emre ile korunuyor.
   - "employee ayarı okur" testi kuralla değişti, kullanan ekran yok.

## Kanıt (komut ve sonuç)
- `git diff origin/main...9d8c767c`: 27 dosya. `authz_check` eski tanımla `diff -w -i` yapıldı, yalnız 5 satırlık blok farklı.
- `db.lock` alındı ve bırakıldı. Her test dosyası kendi psql oturumunda koştu: `begin;` + branch builder.sql + üç migration + test + `rollback;`. Ortak DB öncesi ve sonrası: 391 workspace, 1726 kullanıcı, `authz_check` md5 aynı, önizleme fonksiyonu duruyor.
  - authorization_matrix 10856 ok / 26 not ok. 26'sının hepsi önceden bilinen TODO, TODO dışı kırmızı 0.
  - authorization_coverage 5/5, authz_catalog 11/11, retired_objects_stay_gone 19/19
  - weekly_preferences_commands 42/42, weekly_preference_settings 32/32, weekly_preference_mode_conversion 37/37
  - availability_always_warns 64/64, schedule_asks_the_core 90/90, weekly_availability_preferences 47/47
- Bulgu 1 için geri alınan deneme (main ve dal karşılaştırması): yukarıda.
- Koşulmadı: tam kapı (lint, typecheck, test, build) ve e2e. Yazar da koşmadı. `packages/shared` yetki ikizi B gelene kadar kırmızı kalacak. A+B birlikte main'e girmeden önce koşulmalı.

## Öneri (zevk, onayı etkilemez)
- `authz_check:98`: `ranks_as_employee(state.workspace_id, state.user_id)` yerine `state.class = 'employee'` yazılabilir. Aynı bilgi zaten elde, bir sorgu az olur.
- `weekly_preference_capacity` hâlâ notu içeren `unavailable_intervals` ve `available_intervals` üretiyor. Okuyanı yalnız `assess`, o da bunları kullanmıyor. Ölü anahtarlar. Silinmezse ileride biri yanlışlıkla notu turuncuya katabilir.
- Yazma kapısının ret metni hâlâ "Resolve availability, …" diyor. Müsaitlik artık reddetmediği için yanıltıcı (yazar da not etti).