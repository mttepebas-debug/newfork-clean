# Canlıda e-posta: Resend hazırlığı (MVP-RESEND)

Ölçüm 2026-10-06 ~08:52Z: `origin/main` + canlı yalnız okuma (Vercel env **adları**, Vercel logu, canlı DB SELECT). Hiçbir gizli değer okunmadı ve burada yok.

## 1. Bugün canlıda ne oluyor

Uygulamanın kendi e-postalarının hepsi tek yoldan, Resend'den gider (`apps/api/src/email/resend-email.ts:17`, anahtar `RESEND_API_KEY`). Canlı Vercel projesi `newfork-clean-api`'nin production ortamında `RESEND_API_KEY` **tanımlı değil**; gönderen adresi değişkenleri (`EMPLOYEE_INVITE_FROM`, `ACCOUNT_SECURITY_FROM`, `SCHEDULE_EXPORT_FROM`) de yok. Yani bugün canlıda bu e-postaların hiçbiri çıkmıyor.

| Özellik (uygulamadaki yeri) | Kod | Anahtar yokken canlıda |
|---|---|---|
| Çalışan daveti: Employees → Add employee / çekmece → Invite | `employees/invitation-service.ts:319-342`, `employee-create-service.ts:56-86` | Kişi oluşur, davet "failed"; ekranda 409 "Invitation delivery failed" |
| Davet hatırlatma: çekmece → Access → Send reminder | `invitation-service.ts:175` | Aynı 409 |
| Parola sıfırlama: Sign in → Forgot password? | `account/password-reset.ts:104-121` | E-posta gitmez; kişi her durumda aynı "check your email" cevabını görür, fark etmez |
| Hesap silme kurtarma e-postaları: Account → Security → Delete account | `account/account-security-service.ts:359-385`, `account-deletion-worker.ts:76,129` | Hata; kurtarma bağlantısı gitmez |
| Zamanlanmış Schedule e-postası: Schedule → Export → zamanla | `schedule/schedule-export-cron.ts:281-293` | 503 "Email delivery is not configured"; son 27 dk'lık logda 100 kez (3 satırda "RESEND_API_KEY is not set") |
| Bildirim e-postaları, belge hatırlatmaları, duyuru, sahiplik devri | — | E-posta kodu yok (bildirimler yalnız uygulama içi) |

**Ayrı yol: Supabase Auth.** Kayıt doğrulama (Sign up → "Confirm your email") ve e-posta değişikliği doğrulaması (Account → Security → Change email) Supabase'in kendi postasıyla gider, Resend'den değil (`apps/web/src/auth/AuthContext.tsx:284`; `supabase/config.toml:243` SMTP tanımsız). Supabase'in hazır e-posta servisi saatte çok az e-posta gönderir (yaklaşık 2) ve üretim için özel SMTP önerir ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp), [rate-limits](https://supabase.com/docs/guides/auth/rate-limits)). Canlı projede özel SMTP tanımlı mı ölçülemedi (MCP auth ayarını okumuyor). Resend SMTP de verir: aynı anahtarla Supabase → Authentication → SMTP Settings'e girilirse bu e-postalar da Resend'den gider.

## 2. Resend

| | Ücretsiz | İlk ücretli (Pro) |
|---|---|---|
| Aylık | 3.000 e-posta | 50.000 e-posta |
| Günlük | 100 e-posta | sınır yok |
| Alan adı | 3 | 10 |
| Fiyat | $0 | **$20 / ay** |

Kaynak: [resend.com/pricing](https://resend.com/pricing), 2026-10-06.

- **Alan adı doğrulaması zorunlu:** "You must add and verify at least one domain to send emails with Resend" ([domains](https://resend.com/docs/dashboard/domains/introduction)). Doğrulanmadan gerçek alıcıya teslim yok. DNS'e SPF ve DKIM kayıtları eklenir; Resend alt alan adı önerir (ör. `mail.tepebash.com`).
- **Newfork'un elindeki alan adı:** `tepebash.com` (Vercel'de mert-2a14 altında, canlı adres `https://www.tepebash.com`). Koddaki varsayılan gönderenler `onboarding@newfork.app` ve `security@newfork.app`; `newfork.app` hesapta yok, sahipliği ölçülmedi. Önerilen: `tepebash.com` (ya da `mail.tepebash.com`) doğrulanır, gönderen adresleri env ile verilir.
- **Ücretsiz katman yeter mi:** günde 100 e-posta, ilk 2–5 lokasyonlu müşteri için davet + parola + haftalık Schedule e-postasını karşılar; 100 kişilik ekibin aynı gün toplu daveti sınıra dayanır.
- **Rakip ücretsiz:** Brevo, günde 300 e-posta, transactional dahil ([dreamlit.ai](https://dreamlit.ai/blog/brevo-review)); kod Resend'e yazılı olduğu için geçiş kod işi ister.

## 3. Mert'in adımları (sırayla)

Gizli değer sohbete, belgeye ya da oturuma yazılmaz. Anahtarı yalnız Mert Vercel'e yapıştırır.

1. **Hesap:** resend.com → Sign up (GitHub ya da e-posta) → ücretsiz plan ($0).
2. **Alan adı:** Resend → Domains → Add Domain → `mail.tepebash.com` (bölge: US East) → Resend'in gösterdiği DNS kayıtlarını not et (SPF ve DKIM).
3. **DNS:** alan adının DNS'i nerede yönetiliyorsa (Vercel → Domains → `tepebash.com` → DNS Records ise oradan) bu kayıtları birebir ekle → Resend'de "Verify DNS Records". Doğrulama dakikalar ile birkaç saat sürebilir.
4. **Anahtar:** Resend → API Keys → Create API Key → ad `newfork-clean-api production`, izin "Sending access", alan adı `mail.tepebash.com` → anahtarı kopyala (bir kez gösterilir).
5. **Vercel:** vercel.com → mert-2a14 → proje `newfork-clean-api` → Settings → Environment Variables → Production için ekle:
   - `RESEND_API_KEY` = (anahtar; yalnız Mert yapıştırır)
   - `EMPLOYEE_INVITE_FROM` = `Newfork <onboarding@mail.tepebash.com>`
   - `ACCOUNT_SECURITY_FROM` = `Newfork <security@mail.tepebash.com>`
   - `SCHEDULE_EXPORT_FROM` = `Newfork <schedule@mail.tepebash.com>`

   Sonra Deployments → son production → Redeploy (env yeni deploy'da okunur).
6. **İsteğe bağlı, önerilen:** Supabase → proje `hvyvyisrqyathtliyyyv` → Authentication → Emails → SMTP Settings → Enable custom SMTP: host `smtp.resend.com`, port 465, kullanıcı `resend`, parola = aynı Resend anahtarı, gönderen `no-reply@mail.tepebash.com`. Kayıt doğrulama e-postaları da Resend'den gider, saatlik sınır kalkar.
7. **Sonra (oturum yapar, değer görmeden):** canlıda bir test daveti, bir parola sıfırlama ve zamanlanmış dışa aktarma ucunun 200 döndüğü Vercel logundan doğrulanır.

Bu adımlar hesap açma, alan adı ve gizli anahtar işlemi olduğu için yalnız Mert yapar (CLAUDE.md §8); bir oturum yapacaksa Mert'in "evet"i o oturumun kendi penceresine yazılır.

## 4. Kapattığı backlog maddeleri

| Madde | Anahtarla kapanır mı |
|---|---|
| BL-027 "Resend anahtarını yenile" | Evet. Bugün canlıda anahtar hiç yok: "yenile" değil "ekle". |
| BL-101 zamanlanmış dışa aktarma (tetik bugün düzeldi, kalan 503) | 503 kısmı evet. Aynı maddedeki eklerin iki kez base64'lenmesi (`BACKLOG.md:205`) ilk gerçek gönderimde ayrıca doğrulanır. |
| Numarasız "zamanlanmış dışa aktarma canlıda 503" (`BACKLOG.md:163`) | Evet. |
| BL-046 (bildirim / belge e-postası), BL-703, BL-385, BL-357, BL-628 | Hayır: kod işi ya da Supabase yolu. |

**Kayıt düzeltmesi:** `BACKLOG.md:211` (2026-09-30) "`RESEND_API_KEY` Vercel'de zaten tanımlı" diyor; o ölçüm eski projedendi. Bugün `newfork-clean-api` production'ında yok (2026-10-06 ölçümü).

**Yolda bulunan:** canlıda dış bir tetik her dakika var olmayan uçları çağırıp 404 alıyor (`/api/internal/cron/notifications/email-dispatch`, `push-dispatch`, `billing`, `time-entries`, `workspace-cleanup`); kaynağı muhtemelen Supabase `pg_cron`, ölçülmedi.
