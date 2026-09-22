# JOIN-014 İsim mimarisi: bir kez sor, açıkça etiketle, tercih edilen adı yönet
Status: draft
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
