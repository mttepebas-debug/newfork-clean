# apps/api — API ve paylaşılan sözleşme

Fastify API'nin yerel kuralları; `packages/shared`'i de kapsar (ayrı dosyası yok): shared tip ve saf kural API sözleşmesiyle birlikte değişir.

## Yetki kapısı
- Tek kapı `auth/workspace-context.ts`: `resolveActor()` (üye değil ya da bilinmeyen → 404 `authz.not_member`; token yok → 401 `session.required`) + `authorize(ctx, action)` (yalnız `ctx.actions`; yoksa 403 `authz.out_of_scope`, `detail` = eylem). Handler'ın ilk satırı, zod'dan önce.
- `resolveWorkspaceAuthorization` / `resolveWorkspaceMembership` + `permissions.includes` eski kapılardır; yeni kodda kullanılmaz.
- İzin ile eylem 1:1 değil (`schedule.manage` → `schedule.edit`); eşleme `app_private.authz_actions`'ta.
- Token tek yerde doğrulanır: `auth/verify-user.ts`. Auth sunucusu cevapsızsa 503.
- Servis service-role ile `<ad>_service` RPC'sini çağırır; aktör doğrulanmış token'dan gelir, gövdeden asla.

## Hata
- DB hatası hep `rpcFailure()` (`http-error.ts`) → `HttpError` (`statusCode`, `pgCode`, `reason` = hint, `detail`).
- `statusForPostgresCode`'da olmayan SQLSTATE 500 olur (bugün 54000, 0A000). Yeni errcode'dan önce: `grep -oiE "errcode *= *'[A-Z0-9]{5}'" supabase/schema.sql | sort | uniq -c`.
- 422 yok: 23514/22023/P0001 → 400. Ekran `reason`'a bakar.
- JSON mesajlı RAISE düz cümleye döner; Schedule yükü `cause`'tan okunur (`pastEditPayload`).

## Sözleşme
- Değişiklik tek dalda DB → API → shared tip → web hook zincirini birlikte günceller.
- Bir shared şemanın birden çok okuyucusu olabilir (`scheduleReadModelSchema`: Schedule + Employee Hub). Zorunlu alandan önce `<şema>.parse` grep'i, web + API typecheck.
- Fixture SQL'den elle yazılmaz: rolled-back gerçek `select fn(...)::text` çıktısı (Postgres `09:00:00` döner); zod anahtar sırasını değiştirir, `toEqual` kullan.
- DB'ye bağlı kurala istemci bayrağı yok (yeni `is_owner_record` yok). Şema yalnız gövdenin tek başına karar verdiğini denetler; gerisi DB'nin hint'li reddi. Form önce reddedecekse eksik bilgiyi argüman alan saf fonksiyon (`managerLocationRefusal`).
- Okunur cümleli hint'ler `managementAndOwnerRefusals`'ta; `rpcFailure` kendisi kullanır. Settings (`organization-data.ts`) ve profil yazmaları web'den RLS'e gider; oradaki ret API'ye uğramaz.

## Yetki ikizi
- `expected()` (`authorization.ts`), `supabase/tests/authorization_matrix.test.sql`'in ikizi. Bölüm 2-5 değişince `node scripts/lock.mjs run db -- pnpm.cmd --filter @newfork/shared dump:authz-matrix`; sha256 bayat dökümü reddeder. Ortak DB'de olmayan migration için tek PowerShell satırı: `$env:AUTHZ_MATRIX_PRELUDE='supabase/migrations/<dosya>.sql'; node scripts/lock.mjs run db -- pnpm.cmd --filter @newfork/shared dump:authz-matrix`.
- Her dalın hücresi yok: ikizin yeşili kapsanmayan dalı kanıtlamaz.

## Test
- Her uç: başarı, 403, 404, doğrulama. Kapı tablosu örneği `schedule/schedule-routes-gate.test.ts` (eylem satırı + onRoute tamlığı).
- Yeni servis/route `service-` ve `route-error-contract.test.ts`'e satır ekler. Hata mock'u `rpcFailure({ message, code, hint })`.

## Tuzaklar
- FastifyReply thenable: reply döndüren async yardımcı `await`'te undefined olur, handler sürer. Boolean döndür (`refusedPassword`).
- Cron `/internal/cron/<ad>` + `CRON_SECRET`; Vercel'de `/api/internal/cron/<ad>`. Yeni yol öneki `vercel.json` rewrite'ı ister, yoksa SPA'ya düşer.
- E-posta Resend'le; `RESEND_API_KEY` yoksa production dışında sessizce atlanır, mailpit görmez.
