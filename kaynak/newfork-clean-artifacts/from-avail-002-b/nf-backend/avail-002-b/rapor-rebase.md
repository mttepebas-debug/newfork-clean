# AVAIL-002-B — ek rapor: rebase + onboarding yönlendirmesi

**1. Nerede duruyor:** Bitti. `task/avail-002-b` A'nın yeni ucu `f90a6478` üstüne rebase edildi (çatışma yok); yeni uç `d17378b9`. Push yok.
Commit'ler (yeni sha): `035a29ce` shared+API, `1e14fd8f` web veri, `da4d4e8a` e2e spec, `d17378b9` onboarding yönlendirmesi.

**2. Ne yapıldı:**
- **Onboarding (/welcome):** müsaitlik adımı olmayan kişi (müdür/admin daveti) `/welcome/availability` adresini doğrudan açarsa artık adımı ve 403'ü görmez; ilk adımına yönlenir (bilinmeyen adresle aynı dal). Örnek: KadıköyMüdür2 davet linkinden sonra eski bir yer imiyle `/welcome/…/availability`'yi açar → Profile adımına iner. `EmployeeOnboardingPage.tsx` tek koşul; adım listesi zaten boş adımı gizliyordu.
- Test: kırmızı-önce yeni vitest ("sends a person without an availability step…"). Bu adımı açan dört eski test, onboarding'inde müsaitlik adımı olmayan bir kişiyle kuruluydu (bugün o kişi employee değil); employee'nin onboarding'ini (adım listede) kuracak şekilde düzeltildi; "zorunlu hafta" testi adımı zorunlu kurar.
- **Ret metinleri:** "Resolve shift hours or approved time off…" ve "A current conflict acceptance is required" — web, API ve e2e'de bu metinleri (eski ya da yeni) birebir arayan yer yok (grep; yalnız `http-error.test.ts:147` genel bir örnek cümle kullanıyor, etkilenmiyor).
- **Pre-flight not cümlesi:** A-fix yalnız not gerekçesini çakışma satırının cümlesinden çıkarıyor; müsaitlik satırı ("Ali Person shows as unavailable for this shift.") değişmedi → spec `:85`, `:112` etkilenmiyor.
- **Yetki ikizi:** A-fix `authz_actions`'a ve matris kural bölümlerine dokunmuyor (diff ölçüldü); döküm yeniden gerekmedi, `authorization.test` yeşil.

**Kanıt:** Tam kapı A-fix + B üstünde (koşu ~16:05–16:30Z): lint 0 hata (18 uyarı, önceden var), typecheck 0, test 0 (shared 17, api 59, web 229, ui 3 dosya), build 0.

**3. Açık kalanlar:** `nf-guvenlik` (A-fix + B tek tur). e2e yine koşulmadı (main penceresinde `db.lock`).

**4. Ekranda ne değişti:** Onboarding → müdür/admin, müsaitlik adresine doğrudan gelirse hata yerine kendi ilk adımını görür. Başka görünür değişiklik yok.

**5. Sırada:** güvenlik incelemesi; sonra main penceresi (A migration'ları kalıcı + e2e).
