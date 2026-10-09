# G5 — Parola, oturum ve hesap güvenliği: işçi oturumunun kararları

İşçi: G5 (nf-backend + nf-db), dal `task/g5-account-security`, taban `origin/task/g4-scheduled-export` `6013d5a7`,
2026-09-29. Kapsam: BL-283, BL-162, BL-161 (kod kısmı), BL-279 (1)–(5), KK-11.

## K1 — Parola kontrolü veritabanında, hesap başına sayaçla (BL-283)
- **Karar:** API parolayı artık Supabase Auth'a kendi sunucusundan giriş yaparak kanıtlamıyor. Yeni
  `verify_account_password_service` parolayı `auth.users`'taki bcrypt özetiyle veritabanında karşılaştırıyor
  ve yanlış denemeleri hesap başına sayıyor: 15 dakikada 5 yanlış → yalnız o hesabın parola kontrolleri, en
  eski denemenin 15 dakikası dolana kadar 429 `session.password_attempts_exceeded` ("Too many incorrect
  passwords. Try again in N minutes."). Doğru parola sayacı sıfırlar. Kontrol çalışamazsa 503; "yanlış
  parola" asla denmez. Paralel denemeler hesap başına danışma kilidiyle (advisory lock) sıraya giriyor.
- **Neden bu yol:** kova sorununu yalnız bu kapatıyor. Hesap başına sayaç GoTrue'ya gitmeye devam etseydi,
  kendi açtığı birkaç hesapla ortak kovayı (API adresi başına 30 / 5 dk) dolduran biri herkesin
  parola isteyen işlemlerini yine durdurabilirdi. Artık API'nin parola kontrolü o kovaya hiç dokunmuyor.
- **Etkilenen altı yer:** parola değiştirme, diğer oturumları kapatma, v2 hesap silme, workspace kapatma,
  sahiplik devri, devir yanıtı. Hepsi tek yardımcıyı (`apps/api/src/auth/verify-password.ts`) kullanıyor.
- **nf-guvenlik için bakılacak:** parola RPC parametresi olarak Postgres'e gidiyor. Yerelde
  `log_statement = ddl`, `log_parameter_max_length_on_error = 0` (parametre loga düşmüyor); hosted değerleri
  ölçülmedi. Fonksiyon parolayı hiçbir hata metnine koymuyor.
- **Geri alma:** orta — `verify-password.ts`'in eski (GoTrue) sürümü geri konur, fonksiyon ve tablo kalabilir.

## K2 — "Forgot password?" sınırı veritabanında; fazla istek sessiz (BL-162)
- **Karar:** `claim_password_reset_send_service` (e-postanın ve çağıranın adresinin sha256 özetiyle; ikisi de
  düz saklanmaz): aynı e-postaya 15 dakikada bir e-posta; fazlası aynı 202 cevabı alır ama gönderilmez →
  gelen kutusundaki bağlantı geçerli kalır. Aynı çağıran adresine saatte 10 → 429. Bellek sayacı silindi.
- **Eskiden farkı:** Ayşe'nin e-postasını bilen biri 3 istekle Ayşe'yi bir saat 429'a düşürebiliyordu; artık
  Ayşe hiç engellenmez, yalnız 15 dakika içinde ikinci e-posta gitmez.
- **Geri alma:** düşük.

## K3 — Kurtarma bağlantısı 15 dakikada bir yenilenir; cevap süresi sabit (KK-11, BL-279 (3))
- **Karar:** `prepare_account_deletion_recovery_resend_service` son bağlantı 15 dakikadan yeniyse hiçbir şey
  yapmaz (null) → geçerli bağlantı ezilmez. Yeniden gönderme ucu her cevabı en az 1,5 sn'de verir; hesabın
  var olup olmadığı süreden anlaşılmaz.
- **İnceleme düzeltmesi (nf-guvenlik ORTA, ONAY @1590a7b2 sonrası):** gönderim artık 1,2 sn'lik bütçeye bağlı ve
  bütçede kesiliyor (`password-reset.ts` deseni; sinyal Resend'e kadar gidiyor) → yavaş gönderimde de cevap tabanda.
  Çağıran adres başına saatte 10 yeniden gönderme isteği (`claim_account_recovery_resend_service`, `account.self`),
  fazlası 429; adres sha256 özetiyle saklanıyor.
- Eski yaşam döngüsü testi (`account_security_deletion_lifecycle`) anında yeniden gönderimi sınıyordu; bugünkü
  kurala göre son bağlantıyı 16 dakika eskiterek güncellendi.
- **Geri alma:** düşük.

## K4 — Hesap silmede önce kilit, sonra e-posta (BL-279 (4))
- **Karar:** sıra: talep kaydı → hesabı kilitle (ban) → bütün oturumları kapat → kurtarma e-postası.
- **Bilinen sonuç:** e-posta sağlayıcısı o anda düşerse kişi hata görür, oturumu kapanmış olur; bağlantıyı
  15 dakika sonra "resend" ile alabilir. Tersi (hesap açık kalıp silme bekliyor) geri alınamazdı.
- **Geri alma:** düşük.

## K5 — Davet önizlemesinde token gövdede (BL-279 (2))
- **Karar:** `GET /v1/invitations/preview?token=` → `POST /v1/invitations/preview` gövdede `{ token }`; web
  (`employee-data.ts`) buna göre. GET kalktı (ikiz yok). Token artık API istek loglarına düşmüyor.
- **Açık (yolda bulunan):** davet e-postasındaki sayfa bağlantısı (`/invite/accept?token=`) ve kurtarma bağlantısı
  (`/account-recovery?token=`, BL-279 (5)) tarayıcı adresinde token taşımaya devam ediyor. Düzeltme,
  bağlantıyı `#token=`'a taşıyıp sayfanın onu okumasını ister. Kurtarma sayfası `apps/web/src/account/**`'ta
  (Account turu, dokunma yasağı); davet sayfası aynı desenle birlikte yapılmalı → iki sayfa tek iş.
- **Açık (bilinçli):** `employee_invitation_delivery_secrets.token` düz metin kalıyor. Davet e-postasını yeniden
  göndermek ham bağlantıyı istiyor. Tablo RLS'li ve herkese (service_role dahil) kapalı, yalnız tanımlayıcı
  fonksiyonlar okuyor. Öneri (backlog): davet bekleme durumundan çıkınca satırı silmek.
- **Geri alma:** düşük.

## K6 — Saklama süresi dolan workspace'in dosyaları depodan silinir (BL-279 (1))
- **Karar:** saklama işçisi, kaydı "temizlendi" diye işaretlemeden önce `employee-onboarding` kovasındaki
  `workspace_id/...` altındaki bütün dosyaları (kimlik, sözleşme) klasör klasör listeleyip siler. Bir dosya
  silinemezse iş bekler; sonraki koşu kalanı siler, sonra işaretler.
- **Geri alma:** düşük (kod); silinen dosya geri gelmez. Yalnız saklama süresi dolmuş workspace'e uygulanır.

## K7 — Yerel parola ayarları hosted'la aynı (BL-161 kod kısmı)
- **Karar:** `supabase/config.toml` `minimum_password_length = 8` (web ve API zaten 8 istiyor),
  `secure_password_change = true` (kullanıcı hosted'da açtı, K22). Çalışan yerel Supabase yeniden
  başlatılınca geçerli olur; seed ve e2e parolaları 8 karakterden uzun.
- **Açık:** hosted'da en kısa parola uzunluğu 8 → kullanıcı (hosted ayar).

## Ekranlar için sözleşme (Account turu / nf-arayuz)
- Parola soran her pencere (Account → Security → Change password, Sign out other sessions, Delete account;
  Settings → workspace kapatma ve sahiplik devri) artık 429 + `reason: "session.password_attempts_exceeded"`
  alabilir; `error` metni kişiye söylenecek cümledir. Bugün ekranlar metni gösteriyorsa ek iş gerekmez.

## Doğrulama (2026-09-29, bu dal)
- pgTAP (ortak yerel DB, `db.lock`, tek transaction + rollback; migration kalıcı uygulanmadı): yeni
  `account_checks_count_in_the_database` migration'sız kırmızı, migration'la 14/14; `authorization_coverage` 5/5
  (iki yeni fonksiyon `account.self`), `account_security_deletion_lifecycle` 37/37.
- API vitest: `src/account`, `src/auth`, `src/employees`, `src/email`, `app.test`, `app.error-handling.test`
  22 dosya 281 test; web `AcceptInvitationPage.test` 10. Kırmızılar önce görüldü (doğrulayıcı 4, sıfırlama 3,
  yeniden gönderme 1, davet 3, saklama 2).
- `pnpm typecheck` 7/7; değişen dosyaların eslint'i temiz.
