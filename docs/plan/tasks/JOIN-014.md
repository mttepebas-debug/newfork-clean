# JOIN-014 İsim mimarisi: bir kez sor, açıkça etiketle, tercih edilen adı yönet
Status: kısmen done (2026-09-21); tercih edilen ad onay modeli kaldı
Session: -   Branch: task/join-014   Worktree: yok   DB: KİLİT

Plan ID'leri: M1, M5, E1, E4 + kullanıcı kararları 2026-09-21

## Ölçüm (2026-09-21)
Ad **4 yerde soruluyor, 3 yerde saklanıyor**:
- `SignInPage.tsx:90` "Full name" → `user_profiles.display_name`
- `OwnerOnboardingPage.tsx:642` "Your full name" → **aynı** `display_name` (tekrar)
- `EmployeeDrawer.tsx:1904,1917,1930` "First/Last/Preferred name" → `employee_profiles.*`
- `EmployeeOnboardingPage.tsx:682` "First name/Last name" → **`employee_private_profiles.legal_*`**

İki ekran aynı etiketi farklı anlamlar için kullanıyor. `employee_profiles.preferred_name` `CHECK (preferred_name = '')` ile kilitli.

## Araştırma özeti
- Resmî ad bordro/vergi/sözleşme için, tercih edilen ad günlük kullanım için; ayrı alanlar olmalı (ADP, Sprintlaw).
- Onboarding resmî adı **bir kez** almalı ve oradan akmalı (PlatoForms).
- Employer'ın çalışanı adıyla eklemesi doğru; Deputy "sadece adla ekle, davet için e-posta gerekir, 7 gün" diyor.
- Kişi hesabını aldıktan sonra **kendi alanlarının sahibi** olur (Homebase).
- Ad gösterimi workspace **politikası**dır, değişiklik başına onay değil (Slack).

## Kullanıcı kararları (2026-09-21)
1. **Sihirbaz adı tekrar sormaz.** Adım 1'de yalnız workspace adı sorulur; hesabın adı salt okunur görünür, yanında hesap ayarlarına bağlantı.
2. **Resmî ad açıkça etiketlenir** ("Legal first name (as on your ID)") ve neden istendiği yazılır. Owner da kendi istihdam kaydında verir (JOIN-011).
3. **Employer'ın yazdığı ad geçicidir** ve ekran bunu söyler; cümle 4. kararla paralel olmalı.
4. **Tercih edilen ad workspace ayarıyla yönetilir.** Yeni ayar: `preferred_name_approval = auto_approve | manager_approval`.
   - **Bu ayar onboarding'in auto-approve / manager-approval ayarından AYRIDIR ve karıştırılmamalıdır.**
   - `auto_approve`: kişi daha önce onaylanmış/yayınlanmış adını değiştirirse, ilk defa eklerse, ya da onboarding'de yazarsa (onboarding bitiminde) **otomatik onaylanır ve yayınlanır**. Owner/manager'a **bildirim** gider.
   - `manager_approval`: değişiklik admin/manager/owner'a onaya gider. Onaylanırsa yayınlanır; onaylanmazsa **sessizce iptal edilir**.
   - Tercih edilen ad **yalnız** schedule, time off, employee list gibi yüzeylerde kullanılır. **Legal belgelerde asla.**
5. **Dışa açılan ad:** şimdilik yalnız belgeler ve imzalar her zaman resmî adı kullanır. Schedule export'ları uygulama içi görünen adı kullanmaya devam eder.

In scope: yukarıdaki beş karar.
Out of scope: görünen adı 57 fonksiyonda tek kaynağa bağlamak (BL-079) — bu task onun kapsamını daraltır ama kendisi değildir.
Done when: sihirbaz adı sormuyor; resmî ad etiketleri açık; drawer geçiciliği söylüyor; iki onay modu da testli; tercih edilen ad belge/imza yüzeylerinde görünmüyor.
Touches: `SignInPage`, `OwnerOnboardingPage`, `EmployeeDrawer`, `EmployeeOnboardingPage`, `workspace_scheduling_settings` ya da yeni ayar tablosu, bildirim katalogu, `employee_profiles.preferred_name` CHECK'i.
Risk: `preferred_name` kilidini açmak gösterilen adın hesaplandığı her yüzeye dokunur; önce tek yardımcı fonksiyon, sonra yüzeyler.

## Notes / Result
- **2026-09-21 kullanıcı düzeltmesi:** karar 1 tersine çevrildi — **kayıt ekranı ad sormasın, sihirbaz sorsun**. Gerekçe kabul edildi: kayıt sürtünmesi azalır, iki giriş yolu (davet ve kendi kuran) eşitlenir, ad gerçekten gerektiği anda sorulur.
- **Yapılan:**
  - `SignInPage` artık ad sormuyor; hesap oluşturmak e-posta + paroladır. `signUp(email, password)` üçüncü argümanı kalktı.
  - Owner sihirbazı adım 1: **Your first name (zorunlu) · Middle name (optional) · Your last name (zorunlu)**. Tek "full name" alanı ve onu son boşluktan bölme tahmini tamamen kalktı. Hesabın görünen adı `ad soyad` olarak buradan yazılıyor; orta ad kayda gider, her listeye değil.
  - Sihirbaz **preferred name sormuyor** (karar).
  - Employee onboarding: etiketler **"Legal first name / Legal middle name (optional) / Legal last name"** oldu ve **"Preferred name (optional)"** eklendi.
  - `employee_profiles.middle_name` ve `employee_private_profiles.legal_middle_name` kolonları eklendi (ikisi de `not null default ''`, ≤80).
  - `save_employee_onboarding_profile_service` **artık `preferred_name = ''` zorlamıyor** — kişi ne yazdıysa o kaydediliyor, boş bırakmak geçerli bir cevap.
  - Employee drawer'da **Middle name (optional)**; `save_employee` ve `save_employee_service` sarmalayıcıları orta adı taşıyor.
- **Kalan (bu task'ın gerisi):** `preferred_name_approval` workspace ayarı ve iki onay modu, bildirim, `employee_profiles.preferred_name` CHECK'inin açılması, tercih edilen adın hangi yüzeylerde görüneceği.
- **Kanıt:** `owner_employee_record` 11/11, `workspace_rls` 119/119, `workspace_lifecycle` 21/21, `account_workspace_controls` 52/52, `typecheck`/`test`/`lint`/`build` PASS. Tarayıcıda adım 1: "Your first name · Middle name optional · Your last name · Workspace name".

