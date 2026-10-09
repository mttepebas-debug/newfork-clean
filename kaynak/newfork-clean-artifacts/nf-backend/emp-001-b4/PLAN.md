# EMP-001 B4 — rol taslağa girer: uygulama planı

**Goal:** Employees çekmecesinde "Workspace role" seçimi taslakta durur; "Save changes" önce kişi kaydını (değiştiyse), sonra rolü gönderir. Çekmece hiçbir durumda "kaydedilmemiş değişiklik" uyarısı göstermez.

**Architecture:** `6722c4aa` kalıbı. `rolePicked` (null = kayıtlı role uyar) çekmece durumunda; `roleDirty` ve `anyDirty = dirty || roleDirty` Save, Terminate ve Invite kapılarını besler. `saveMutation` iki komutu sırayla gönderir; giren kişi kaydı `dirty`'yi düşürdüğü için yeniden deneme yalnız rolü gönderir. API ve `employee-data.ts` değişmez.

**Spec:** `docs/plan/tasks/EMP-001.md` (origin/main) In scope B4, Done when 29–38, K7; koordinatör eki (Remove sonrası kapsamdan çıkan kişi).

## Global Constraints
- Dokunulan dosyalar: `apps/web/src/employees/EmployeeDrawer.tsx`, `EmployeeDrawer.test.tsx`, `EmployeeDrawer.create.test.tsx`, `apps/web/src/styles.css`. Başka hiçbir şey.
- Yeni paket yok, yeni bildirim sistemi yok (`useToast` from `@newfork/ui`).
- Test dosyaları CRLF; mock'lar testler arasında temizlenmiyor → yeni `describe` kendi `beforeEach`'inde `mockClear`.
- Push yok. e2e yerelde koşmaz.

## Review Focus
1. Kişi kaydı girdi, rol düştü → ikinci Save kişi kaydını yeniden göndermemeli (T1, hücre 31a).
2. Kişi kaydı düştü → rol hiç gitmemeli (T1, hücre 31b).
3. Rol kaydından sonra taslak eski `revision`'da kalmamalı; form "dokunulup geri alınmış" olsa da (T1, hücre 34).
4. Rol taslaktayken detay yeniden okunursa seçim ezilmemeli; başka kişiye geçince sıfırlanmalı (T1, hücre 35 yeniden açma).
5. "Invite" kaydı önce kaydetmeye devam etmeli (`invite.spec.ts` buna dayanıyor) — var olan test `:443` korunur.

## Tasks

### T1 — rol taslağı ve iki parçalı kayıt (Done when 29, 30, 31, 33, 34, 36)
- [ ] Kırmızı: `describe("the workspace role is saved by Save changes (EMP-001 B4)")` — 29 (çağrı yok, Save etkin), 30 (yalnız rol → tek çağrı; ad + rol → sıra), 31 (iki durum), 33 (iki durum), 34, 36 (iki durum). Eski "updates the workspace role for a linked employee" testi 29/30'a dönüşür.
- [ ] Yeşil: `rolePicked`, `roleDirty`, `anyDirty`, `canSubmit`; `saveMutation` iki komut; `roleMutation` silinir; `AccessSection` `value={rolePicked ?? currentRoleId}`; `onSuccess` yalnız kişi kaydı gittiyse Profile'a döner.
- [ ] Commit.

### T2 — Terminate kilidi ve Enter (32, 37)
- [ ] Kırmızı: yalnız rol taslaktayken Terminate pasif, `title` "profile" içermez; değişiklik yokken Enter `saveEmployee` çağırmaz.
- [ ] Yeşil: kapı `anyDirty`; metin "Save your changes before terminating the employee" (BL-431'in çaresi); `submit` başında `if (!anyDirty) return`.
- [ ] Commit.

### T3 — uyarı sökümü (35)
- [ ] Kırmızı: rol taslaktayken Esc / dışarı tıklama → `onClose`, `updateEmployeeRole` yok, `alertdialog` yok; yeniden açınca kayıtlı rol. Yeni kişi formu doluyken Esc / dışarı tıklama → `onClose`, `createEmployee` yok. `create.test.tsx:236` ve `:483` yeni kurala göre yeniden yazılır.
- [ ] Yeşil: `discardOpen`, onay penceresi, `beforeunload`, `pendingNavigationRef`/`allowNavigationRef` silinir; `.employee-discard-*` CSS silinir. Gezinme koruması: koordinatör cevabına göre A (yalnız istek yoldayken tutar) ya da B (tümü silinir).
- [ ] grep'ler 0. Commit.

### T4 — Remove sonrası kapsamdan çıkan kişi (koordinatör eki)
- [ ] Kırmızı: Remove başarılı + detay yeniden okuması `authz.out_of_scope` → `onClose` çağrılır, `toast.success("Removed from Main Dining")`; detay okunuyorsa `onClose` yok, bildirim yok.
- [ ] Yeşil: `removeFromLocationMutation.onSuccess` yenilemeden sonra `getQueryState(...).error`'a `isNoAccess` ile bakar.
- [ ] Commit.

### T5 — kapı ve rapor
- [ ] `gh run list --limit 3` (CI koşuyorsa bekle) → `pnpm.cmd lint`, `typecheck`, `--filter @newfork/web exec vitest run` (tamamı), `build`.
- [ ] `invite.spec.ts` yolunu kod okuyarak doğrula.
- [ ] `RAPOR.md` + koordinatöre mesaj (sha).
