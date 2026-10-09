# AVAIL-002 A-fix + B yeniden inceleme (nf-guvenlik)

**KARAR: ONAY @f90a6478 + @d17378b9.** Şartlı: main penceresinde, migration'lar kalıcı uygulandıktan sonra e2e `schedule-availability-warning.spec.ts` ve `employee-onboarding.spec.ts` yeşil olmalı. e2e'yi henüz kimse koşmadı (yazar da ben de). Kırmızı çıkarsa onay geçersiz olur.

İncelenen: `task/avail-002-a` 9d8c767c..f90a6478 (A-fix) ve `task/avail-002-b` f90a6478..d17378b9 (B). Kritik, Yüksek ya da Orta bulgu yok. Önceki turun 5 bulgusundan 1–4 kapandı. 5 (12'den fazla aralık) bilerek bırakıldı.

## Önceki bulgular nasıl kapandı
1. **Davet edilen müdür onboarding'de takılıyordu, kapandı.** "Availability" adımı artık yalnız employee'ye açılıyor (`guard_weekly_onboarding_requirement` başka rolde satırı hiç yazmıyor). Rol değişince açık onboarding'e adım ekleniyor ya da adım siliniyor (`app_private.availability_follows_role`). pgTAP ayar açıkken şunu kanıtlıyor: Ayşe (müdür) Submit edebiliyor ve aktif oluyor, Ali (employee) adımı borçlu.
2. **Terfi edenin işaretleri donuyordu, kapandı.** Terfide kendi haftası, geçmişi (source employee) ve komutları siliniyor (Mert'in kararı: "Terfide silinsin", M14). pgTAP: Emre terfi edince turuncu 0, Auto-fill onu yine seçiyor, kimseye bildirim gitmiyor. Employee'ye geri dönen kişi boş haftayla başlıyor. Employee rolleri arasındaki değişiklik haftayı koruyor.
3. **Not Publish'e giriyordu, kapandı.** `:877` artık `not in ('availability','note')`.
4. **Varsayılan saat önizlemesi notu sızdırıyordu, kapandı.** Notu okuyamayana not gerekçesi gitmiyor. pgTAP'te shift lead Nil notu almıyor. Migration fonksiyonu metin değiştirerek güncelliyor ve beklenen satırı bulamazsa duruyor. Sessizce bozulmaz.

## Koordinatörün soruları
**A-fix tetikleyicisi (`availability_follows_role`):**
- **Silme ne zaman çalışıyor:** yalnız `not ranks_as_employee` olduğunda. Employee rolleri arasındaki değişiklik bir şey silmiyor (pgTAP Veli hücresi).
- **Tetiklenme:** `after insert or update of role, role_id`. Bir rolün "experience"ı sonradan değişemiyor (`save_workspace_role_service:16`), yani rütbe yalnız üyelik satırı üzerinden değişiyor. Kaçan bir yol yok.
- **Başka workspace'e ya da kişiye dokunuyor mu:** hayır. Her silme `workspace_id = new.workspace_id` ile, kişi de `employee_profiles (workspace_id, user_id)` ile bulunuyor. Bu ikili tekil (`employee_profiles_workspace_user_idx`). Aynı kişinin başka workspace'teki haftasına dokunulmuyor. Komutlar `command->>'employee_id'` ile süzülüyor. Shared şema bu alanı her kayıtta zorunlu tutuyor, yani boş kalan kayıt yok.
- **Teknik ayarlar:** SECURITY DEFINER, `search_path = ''`, `public/anon/authenticated`'tan geri alınmış. Eski `manager_note_follows_role` silinmiş, ikiz yok.
- **Migration'daki toplu silme:** dört silme de "employee rütbesinde olmayan profil" kümesini seçiyor. Üyeliği olmayan profil employee sayılıyor ve korunuyor. Silinen satırlara RESTRICT ile bağlı bir şey yok. Onboarding adımına RESTRICT bağı olan tek tablo `employee_acknowledgement_envelopes`, o da yalnız acknowledgement adımlarına bağlanıyor. Yerel DB'de silinecek satır sayısı 0 (açık onboarding'de rütbesi uymayan adım 0, rütbesi uymayan kişinin haftası 0).

**B:**
- **Rota kapısının kaldırılması (Settings → Scheduling → Availability ayarı):** fail-open açmıyor. Servis DB'de `settings.availability.write` / `.read` soruyor. API testi "lets the core answer a settings save" 403'ü gösteriyor.
- **Hayır sözleşmesi:** `rpcFailure` çevirisi `authz.not_member` → 404, öteki `authz.*` → 403. Rotalar üye olmayana 404 veriyor. Test tablosu dört hint'i deniyor.
- **Silinen uçlar:** önizleme uçları (çalışan ve onboarding) ve taslak çakışma ucu gerçekten 404. API testinde `availabilityConflicts.statusCode` 404, önizleme 404.
- **Shared yetki ikizi:** `availability.own` satırı eklendi (`employeeTarget`, `restrictedOk`, `own`). Sıra SQL ile aynı. `authorization.test` yeşil.
- **Web'de yeni `permissions.includes`:** yok (diff tarandı). My Availability menüsü zaten yalnız employee rolüne görünüyor (`AppShell.tsx:146` `roles: ["employee"]`). Onboarding'de adımı olmayan kişi ilk adıma yönleniyor (d17378b9).
- **e2e beklentisi gevşetilmiş mi:** hayır. Eski "onay kutusu, Previously accepted" beklentisi, yeni kural M9'un beklentisiyle değişmiş. Yeni spec kutunun olmamasını, "Previously accepted"ın olmamasını ve satırın iki yayında da listelenmesini açıkça kilitliyor.
- **Eski veri şekli:** `weeklyCommitment`, `range`, `kept_count`, preview ve `availability-conflicts` kalıntısı yok (grep).

## Düşük, onayı etkilemez
- **Kapanmış onboarding'lerde eski adım:** yerel DB'de employee olmayan kişilerin kapanmış (approved/cancelled) onboarding'lerinde 653 "Availability" adımı duruyor. Migration yalnız açık onboarding'leri temizliyor. Bunlar zararsız geçmiş. Bir onboarding geçmişi ekranı bu adımları gösteriyorsa müdürün geçmişinde "Availability" görünebilir. Backlog notu.
- **Terfide kalan not kopyaları:** terfide not (`manager_weekly_reminders`) siliniyor, ama notun eski sürümleri `weekly_preference_events` (source manager) ve `weekly_preference_commands` içinde kalıyor. İstemcinin bu tablolara izni de, bunları okuyan servis de yok, ama "Terfide silinsin" kararının tam karşılığı değil. Önceki tetikleyici de bunları silmiyordu.
- **Eski rota kapısı:** `/availability/weekly/team` rotasındaki rotaya özel `permissions.includes("availability.read")` kapısı duruyor. Bu dalda eklenmedi, önceden vardı. Çekirdek de soruyorsa kaldırılabilir (backlog).

## Kanıt
- `db.lock` alındı ve bırakıldı. f90a6478'in `git archive`'ından her test dosyası kendi psql oturumunda koştu: `begin;` + builder + üç migration + test + `rollback;`. Ortak DB öncesi ve sonrası aynı (391 workspace / 1726 kullanıcı / 46 hafta / 2737 adım, `authz_check` md5 aynı).

  | Test dosyası | Sonuç |
  |---|---|
  | availability_follows_role | 20/20 |
  | availability_always_warns | 69/69 |
  | weekly_availability_preferences | 47/47 |
  | weekly_preferences_commands | 42/42 |
  | weekly_preference_settings | 32/32 |
  | weekly_preference_mode_conversion | 37/37 |
  | retired_objects_stay_gone | 19/19 |
  | authz_catalog | 11/11 |
  | authorization_coverage | 5/5 |
  | schedule_asks_the_core | 90/90 |
  | schedule_default_hours_review | 56/56 |
  | authorization_matrix | 10856 ok, TODO dışı kırmızı 0 (26'sı önceden bilinen TODO) |

- B worktree'sinde (d17378b9, değişiklik yapılmadı):

  | Paket | Sonuç |
  |---|---|
  | shared: authorization, weekly-preferences, availability-assessment | 48/48 |
  | api: availability/*, app.test, schedule-routes-gate | 359/359 |

- Yazarın raporundan (bağımsız koşmadım): tam kapı A-fix + B üstünde yeşil (lint 0 hata, typecheck 0, test, build). e2e koşulmadı, koşu main penceresine bırakıldı.