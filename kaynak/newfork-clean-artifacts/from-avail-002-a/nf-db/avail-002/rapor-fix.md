# AVAIL-002-A-fix — nf-db: nf-guvenlik bulgularının düzeltmesi

**1. Nerede duruyor:** 1, 2, 3, 4 numaralı bulgular ve üç ek madde düzeltildi. Dal `task/avail-002-a`, iki yeni commit: `77a10987` (A2 tarafı) ve `f90a6478` (A1 tarafı). Push yok. Yeniden inceleme senin isteğinde.

## 2. Ne yapıldı (etkisi)

**Bulgu 1 (Yüksek): davet edilen müdür ya da admin onboarding'i bitiriyor.** Teknik kararım, senin önerinle aynı: adım hiç kurulmuyor.
- Employee rütbesinde olmayan kişinin onboarding'inde Availability adımı oluşmuyor. `guard_weekly_onboarding_requirement` bu adımın eklenmesini sessizce atlıyor; kim eklerse eklesin tek yer burası.
- Rol değişince adım onu izliyor. Employee'nin üstüne çıkan kişinin açık onboarding'inden adım siliniyor; yeniden employee olunca geri ekleniyor. İkisinde de onboarding revision'ı bir artıyor. Bunu yeni `app_private.availability_follows_role` tetikleyicisi yapıyor.
- Kayıt: açık onboarding'de employee olmayan kişinin Availability adımı migration'da siliniyor (eski veri tutulmuyor).
- pgTAP `availability_follows_role` (yeni dosya, `ci-green.txt`'ye eklendi), "availability required at onboarding" açıkken:
  - Ali (employee) adımı borçlu.
  - Ayşe (davet edilen müdür) adımı hiç almıyor. Profilini doldurup Submit ediyor, durumu `active` oluyor.
  - Ali onboarding'deyken müdür yapılınca adımı kaybediyor.
  - Ayarı kapatıp açmak müdürün onboarding'ine dokunmuyor.
  - Ali yeniden employee olunca adım geri geliyor ve zorunlu oluyor.
- Kırmızı-önce: HEAD migration'larıyla bu hücreler kırmızıydı.

**Bulgu 2 (Orta, Mert'in kararı "Terfide silinsin"): terfide kişinin kendi haftası siliniyor.**
- Rol employee'nin üstüne çıkınca dört şey birlikte siliniyor; uyarı ve bildirim yok:
  - yöneticinin notu (eskiden de siliniyordu),
  - kişinin kendi haftası,
  - o haftanın geçmişi (`weekly_preference_events`, `source = 'employee'`),
  - kayıtlı kaydetme komutları (`weekly_preference_commands`).
- Yeniden employee olan kişi boş başlıyor.
- Eski `manager_note_follows_role` tetikleyicisi ve fonksiyonu yeni tetikleyicide birleşti. İkisi de silindi ve `retired_objects_stay_gone`'a eklendi.
- Kayıt: employee olmayan kişilerin haftası, geçmişi ve komutları migration'da siliniyor.
- pgTAP (aynı dosya). Emre ve Veli employee; ikisi de Pazartesi akşamını işaretliyor.
  - Terfiden önce Auto-fill Emre'yi o akşama koymuyor, ızgarada Pazartesi turuncu.
  - Veli başka bir employee rolüne geçince haftası, geçmişi ve komutları duruyor.
  - Emre müdür olunca haftası, geçmişi ve komutları yok; bildirim sayısı değişmiyor.
  - Schedule'da `has_availability_conflict = false`, ızgarada turuncu yok, Auto-fill onu yeniden seçiyor.
  - Emre yeniden employee olunca haftası yok.
- Kırmızı-önce: HEAD migration'larıyla 5 hücre kırmızıydı.
- Aynı kural yüzünden `availability_always_warns`'taki "Can'ın (müdür) Cumartesi işareti" fikstürü artık oluşamaz. Fikstür kaldırıldı; hücre "Can'dan hiçbir şey listelenmez" oldu.

**Bulgu 3 (Orta): Pre-flight'taki çakışma cümlesi notu taşımıyor.**
- `schedule_conflict` mesajı `not in ('availability','note')` ile süzülüyor.
- pgTAP: Veli'nin dinlenme çakışması ve Ayşe'nin notu aynı vardiyada.
  - Publish dinlenme çakışmasını listeliyor ama hiçbir satırda "manager noted" geçmiyor.
  - Bu hücre önce kırmızıydı.

**Bulgu 4 (Orta): varsayılan saat önizlemesi notu yalnız okuyabilene gösteriyor.**
- `preview_schedule_default_hours_service`, notu okuma izni (`availability.note_read`) olmayan için `before_assessment` ve `after_assessment`'tan `note` gerekçesini çıkarıyor. Yazma anındaki süzgeçle aynı.
- Değişiklik `pg_get_functiondef` + `replace` ile yapıldı; hedef satır bulunamazsa migration durur.
- pgTAP: notu okuyamayan "shift lead" Nil, Veli'nin vardiyasını notlu akşama taşıyan önizlemede notu almıyor. Önce kırmızıydı.

**Ek maddeler**
- Ret metinlerinden müsaitlik çıktı:
  - "Resolve availability, shift hours or approved time off…" → "Resolve shift hours or approved time off before this assignment".
  - Önizlemedeki "Resolve availability or approved leave…" → "Resolve shift hours or approved time off before applying these hours".
  - "A current availability acceptance is required" silinemedi, çünkü hâlâ oluşuyor: kapalı gün, kısa dinlenme ve belge onayı istendiğinde. Metni "A current conflict acceptance is required" oldu.
  - pgTAP: hiçbir public fonksiyonda "Resolve availability" ya da "availability acceptance" kalmadı. Web, API ve e2e bu metinleri aramıyor (grep).
- `weekly_preference_capacity` artık yalnız `employee_intervals` ve `manager_intervals` döndürüyor. Notu da içeren birleşik `unavailable_intervals` ve `available_intervals` silindi. Okuyan yoktu (ölçüldü: yalnız `assess`, o da kullanmıyor). Test hücresi "işaret ve not ayrı gelir, hiç birleşmez" oldu.
- `authz_check`: `ranks_as_employee(...)` yerine `state.class <> 'employee'` (öneri uygulandı, bir sorgu az).

## Kanıt
- Odaklı geri alınan deneme, her dosya kendi psql oturumunda: `availability_follows_role` 20/20, `availability_always_warns` 69/69, `weekly_availability_preferences` 47/47, `weekly_onboarding_preferences` 27/27, `retired_objects_stay_gone` 19/19.
- Tam `ci-green` (`164` dosya, geri alınan, üç migration + builder; koşu `~15:50Z bitti`): 162/164 yeşil; kalan iki `bl052_document_lifecycle` ve `bl052_document_notifications` migration olmadan da aynı hatayı veriyor (önceki raporla aynı ortak DB kayması); `schedule_grid_read_budget` 17/17 (ızgara ≤50 ms).
- Ortak DB'de iz yok: 391/1726/80 öncesi ve sonrası aynı.
- Canlı (yalnız SELECT, ~15:40Z): `employee_weekly_preferences` 0 satır (employee olmayanlarınki 0), `weekly_preference_events` 0, `weekly_preference_commands` 0. Migration'ın canlıda sileceği satır yok.

## 3. Açık kalanlar
- Bulgu 5 (12'den fazla aralık): dokunulmadı, not olarak duruyor.
- Yeniden inceleme senin isteğinde.
- Tam kapı (lint, typecheck, test, build) A+B birlikte koşulacak; önceki rapordaki gibi.
- `bl052_document_onboarding` 25. hücre ("legacy file projection…") kararsız. Aynı girdiyle bir koşuda kırmızı, hemen ardından yeşil geldi. Bu işle ilgisi yok; büyük olasılıkla saniye çözünürlüklü zaman damgası. Backlog'a yazılmalı.
- Test fikstürlerinde müdüre doğrudan `insert` ile hafta veren başka dosyalar olabilir (22 dosya bu tabloya dokunuyor, tek tek taranmadı). Kural kaydetme yolunda çekirdekle, terfide tetikleyiciyle zorlanıyor. DB'de "employee olmayana hafta yazılamaz" kısıtı yok; istenirse ayrı iş.

## 4. Ekranda ne değişti
Bu dilimde görünür bir şey değişmedi. B ve C için:
- **Onboarding (/welcome):** müdür ya da admin davetinde Availability adımı sunucudan hiç gelmiyor. Web adım listesi boş adımı zaten gizliyor (`EmployeeOnboardingPage.tsx:232`, `.filter(item.items.length > 0)`), yani adım listesinde ek iş yok. Yalnız `/welcome/availability` adresine doğrudan gelen müdür `AvailabilityStep`'i görür ve sunucudan 403 alır (`:147`, `:842`). B, `availability` gereksinimi yoksa bu rotayı ilk adıma yönlendirmeli.
- **Schedule:** ret metinleri değişti (yukarıda); web bunları birebir aramıyor.

## 5. Sırada ne var
- nf-guvenlik yeniden inceleme → ONAY ya da bulgu.
- B (nf-backend) bu daldan; yukarıdaki onboarding rotası notu ve önceki raporun 5. bölümü.

## Senin yerine verdiğim kararlar
- Müdür ve admin için Availability adımı "var ama zorunlu değil" yerine "hiç yok". Böylece web, adımın olup olmamasına bakarak doğru listeyi çizer; employee'nin ayar kapalıyken gördüğü isteğe bağlı adımla da karışmaz.
- Terfide "bağlı kayıtlar": haftanın geçmişi (`source = 'employee'`) ve kaydetme komutları. Notun geçmişine (`source = 'manager'`) dokunulmadı; o kayıt nota ait ve bu kararın konusu değil.
- "A current … acceptance is required" silinmedi, yalnız metni değişti; çünkü müsaitlik dışındaki çakışmalarda hâlâ oluşuyor.

## Skill
- superpowers:test-driven-development: her bulgu önce kırmızı pgTAP, sonra düzeltme.
- superpowers:receiving-code-review: her bulgu kodda doğrulandı. Bulgu 1 ve 3 birebir doğru çıktı. Bulgu 4'teki sızıntı `availability_impact_assessment`'ın `reasons`'ı süzmeden geçirmesinden geliyor. "Acceptance" metni için "hiç oluşmuyorsa sil" koşulu tutmadı, metin değişti.
