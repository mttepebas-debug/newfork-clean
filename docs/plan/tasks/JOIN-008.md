# JOIN-008 Kimlik sahipliği: hesabın adı, çalışan kaydı, owner'ın kendi kaydı
Status: done (2026-09-21, kapsam daraltildi)
Session: -   Branch: task/join-008   Worktree: newfork-wt/join-008   DB: KİLİT

Plan ID'leri: M1, M3, M5, M6, E4 + kullanıcı kapsamı 2026-09-21 (bilgi sahipliği, owner'ın employees girdisi)

Goal: Bir kişiye ait her bilginin tek sahibi olsun; workspace kuran kişinin o workspace'teki çalışan kaydı baştan doğru ve kendi kontrolünde olsun.

## Bugünkü hâl (ölçüldü)
- Ad üç yerde: `user_profiles.display_name`, `employee_profiles.first_name/last_name/preferred_name`, `employee_private_profiles.legal_first_name/legal_last_name/preferred_name`. Telefon ve avatar ikişer yerde (`user_profiles` + `employee_private_profiles`).
- `app_private.ensure_owner_employee_profile` owner'ın çalışan kaydını **owner onboarding bitince** yaratıyor ve adı `display_name`'i boşluktan bölerek türetiyor (`split_part(raw_name,' ',1)`); iki kelimeden uzun adlar, tek kelimelik adlar ve e-postadan türetilen "Workspace / Owner" hâli yanlış çıkıyor. Kayıt varsa adı **her tamamlamada üzerine yazıyor** (`employee.owner_identity_synced`), yani employees sekmesinde yapılan düzeltme siliniyor.
- Aynı fonksiyon `internal_note`'a sistem cümlesi yazıyor ("Owner account record created by owner onboarding.") — `internal_note` yönetici notu alanı.
- Owner kaydı `is_excluded_from_schedule = true` ile açılıyor; owner'a bu hiç sorulmuyor. Kullanıcı kuralı: "employer aynı zamanda shift alan bir employee gibi de olabilir."
- `legal_first_name` yalnız `save_employee_onboarding_profile_service` tarafından yazılıyor; owner employee onboarding'i hiç çalıştırmadığı için **owner'ın resmî adı hiçbir yerde yok** — belge ve imza yüzeyleri onu isteyince boş kalıyor.

## Karar: üç katman, her alanın tek sahibi
1. **Hesap — kişinin kendisinin.** `user_profiles` (görünen ad, e-posta, telefon, avatar) + `user_preferences`. Hiçbir workspace yetkilisi değiştiremez. Takım arkadaşlarının gördüğü ad burasıdır.
2. **Üyelik — workspace'in.** `workspace_memberships` + `employee_profiles` (rol, durum, `employee_code`, `start_date`, `internal_note`, `is_remote`, `is_excluded_from_schedule`, lokasyon/iş atamaları). Yönetici değiştirir; `internal_note` kişiye gösterilmez.
3. **İstihdam kaydı — kişinin workspace'e verdiği, gizli.** `employee_private_profiles` + `employee_sensitive_identifiers` (resmî ad, doğum tarihi, adres, acil durum, SSN). Kişi girer ve düzeltir; yetkili izinle okur.

In scope:
- Görünen ad tek kaynaktan: hesap bağlıysa `user_profiles.display_name`. `employee_profiles.first_name/last_name` **yalnız hesabı olmayan çalışan kaydı için** (M5) kullanılır; hesap bağlanınca kopyalanmaz, okunmaz. Listelerde gösterilen ad: `coalesce(nullif(employee_profiles.preferred_name,''), hesap görünen adı, first_name||' '||last_name)` — tek yardımcı fonksiyon, her yüzey onu çağırır.
- `ensure_owner_employee_profile` yeniden yazılır: ad bölme kalkar, `internal_note` boş bırakılır, isim üzerine yazma kalkar.
- Owner kaydı **kurulumun 1. adımında** açılır (M6: her adım DB'ye yazılır), tamamlamada değil.
- Owner sihirbazına açık soru: "Do you work shifts yourself?" → cevap `is_excluded_from_schedule`'ı belirler. Varsayılan sessizce hariç tutmak değil.
- Owner "evet" derse owner için de employee onboarding gereksinimleri açılır (resmî ad, belgeler); "hayır" derse resmî ad yalnız bir belge onu isteyince sorulur.
- `employee_private_profiles.preferred_name` ile `employee_profiles.preferred_name` çakışması tek alana iner; hangisinin düştüğü migration'da yazılır ve tüketiciler taşınır.
- pgTAP: owner kaydı 1. adımda var; adı düzeltince tamamlamada bozulmuyor; `internal_note` sistem cümlesi içermiyor; hesabın adı değişince listelerdeki ad da değişiyor; owner "shift alıyorum" derse schedule'da görünüyor.

Out of scope: bordro, SSN şifreleme şeması, avatar depolama birleştirme (BACKLOG: iki avatar alanı tek kaynağa).
Done when: yukarıdaki pgTAP'ler PASS; S1 turunda owner kendi employees girdisini görüyor ve düzeltebiliyor; `pnpm.cmd test` + `test:db` PASS.
Touches: `supabase/migrations/*`, `app_private.ensure_owner_employee_profile`, `app_private.apply_owner_onboarding_update`, `public.get_employee_detail`, `public.list_employees`, `apps/web/src/views/OwnerOnboardingPage.tsx`, `apps/web/src/employees/*`, `packages/shared`.
Test plan: pgTAP (`owner_employee_record.test.sql`, `identity_ownership.test.sql`) + Vitest (owner sihirbazı adım 1, employees satırı).
Risk: görünen ad hesaplaması schedule, employees, announcements ve export yüzeylerinin hepsine dokunuyor. Tek yardımcı fonksiyon + grep kanıtı zorunlu; adım adım, yüzey yüzey doğrulanır.

## Notes / Result
- 2026-09-21 sonuc. Migration `20260921200000_owner_record_is_the_owners`.
- **Olculen iki sey kapsami degistirdi:**
  1. `employee_profiles.preferred_name` uzerinde `CHECK (preferred_name = '')` var - kolon V1'de kilitli, yani plandaki "cift preferred_name" sorunu pratikte yok. Gercek tercih edilen ad yalniz `employee_private_profiles.preferred_name`'de. Yapilacak bir sey cikmadi, belgelendi.
  2. Gorunen adi tek kaynaga baglamak 57 DB fonksiyonuna (38'i `preferred_name` kullaniyor: schedule, kiosk, lineup, export, time tracking, shift exchange) dokunuyor. Katilim zincirinin disinda kaliyor, **BL-079** olarak backlog'a alindi.
- **Yapilanlar:** owner kaydi artik kurulumun 1. adiminda aciliyor; ad son bosluktan bolunuyor (orta ad verilen adla kaliyor); `internal_note` bos; **var olan kaydin adi bir daha uzerine yazilmiyor** (`employee.owner_identity_synced` olayi dustu); sihirbas 1. adimda "I work shifts too" soruyor ve cevap `is_excluded_from_schedule`'i belirliyor.
- **Yol ustunde bulunan uc guvenlik/dogruluk sorunu:** yeni `update_owner_onboarding_service` PUBLIC'e acik kalmisti (revoke edildi, yalniz service_role); eski 6 argumanli overload'lari yenisiyle **ayni adlari kabul ediyordu** ve PostgREST cagrisini belirsiz birakirdi (dusuruldu); `ensure_owner_employee_profile`'in 2 argumanli eski govdesi hala cagrilabilirdi (dusuruldu).
- **Kapsam disi birakildi:** owner'in **resmi adi** (`employee_private_profiles.legal_*`). Calisanlar onu kendi onboarding'inde veriyor; owner'in karsiligi kendi istihdam kaydini duzenledigi yer, o da JOIN-009'un hesap alani isi. Sihirbaza iki alan daha eklemek yerine oraya birakildi.
- **Kanit:** `owner_employee_record.test.sql` 9/9, `workspace_rls` 119/119 (iki test eski "tamamlamada adi onar" davranisini sabitliyordu, yeni sozlesmeye cevrildi), `workspace_lifecycle` 21/21, `typecheck`/`test`/`build`/`lint` PASS, tarayicida adim 1 ekran goruntusu alindi.
- **2026-09-21 kullanici duzeltmesi (JOIN-012, `task/join-012`).** "I work shifts too" kutucugu **kaldirildi** - sorunun sekli yanlismis. Herkesin bir employee kaydi var ve schedule'dan gizlenmek o satirdaki Exclude kutusuyla yapiliyor; owner da ayni yoldan geliyor. Kayit artik `is_excluded_from_schedule = false` ile aciliyor ve kurulum ilerledikce **butun aktif lokasyonlara ve butun aktif islere** aciliyor (`open_owner_record_to_everything`, her kayitta calisiyor, sonradan eklenenleri de topluyor). Sign-up'ta yazilan ad kisinin resmi adi kabul ediliyor ve kaydin adi o oluyor.
- `employee_private_profiles` satiri **seed edilmedi**: o tablo tam doldurulmus bir acil durum kisisi ve adres sarti kosuyor (ad >=1, telefon >=7, sehir >=1). Sadece resmi adi yazmak icin sahte acil durum verisi uydurmak gercek verinin yerine uydurma koymak olurdu. Owner o satiri bir calisanin doldurdugu yerden doldurur (JOIN-011).

