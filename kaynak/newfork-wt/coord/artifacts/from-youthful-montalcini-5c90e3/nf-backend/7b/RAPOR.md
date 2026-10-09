# FB-6.2 `.7b` (G7, Dal B) — nf-backend raporu, 2026-09-30

Dal `task/fb62-core-b-7b` (push edildi), worktree `.claude/worktrees/youthful-montalcini-5c90e3`, taban `origin/main` `a5a43ebd`.
Commit'ler: `935bf539`, `d6e91fbd`, `90d91cf7` (nf-db `.7b-db` `02162f94`'ün cherry-pick'i; `supabase/**` onun), `893cc89f`.
Kararlar: KK-35 (S1 a + S2 a, S3 a, S4 a), KK-36 (S5 c). Delegasyon: R3 (yetki yüzeyi) → `nf-guvenlik` + ekran değiştiği için `nf-gorsel-qa`.

## 1. Nerede duruyor
`.7b`'nin kapsamı bitti ve push edildi; main'e alınmadı (koordinatörün işi). Tam kapı yerelde yeşil (aşağıda). Dal CI'ı push ile başladı, sonucu koordinatör izler.

## 2. Ne yapıldı (etkisi)
- **Davet ve oluşturma çekirdekte (BL-414).** Employees çekmecesindeki davet gönderme, yeniden gönderme, iptal ve bağlantı kopyalama rotalarında izin kapısı kalktı. "Add employee" ile kayıt oluşturmada (davetli ya da davetsiz) de öyle. Kararı artık `employee.invite` / `can_invite_with_role` / `employee.create` veriyor. Örnek: Kadıköy müdürü Ayşe kendi lokasyonuna Pat'i davet eder (eskiden API 403 veriyordu). Başka lokasyondan birini davet ederse 403 ve `authz.*` gerekçesi alır; üye değilse 404 `authz.not_member`. Eskiden her hata veritabanının kendi cümlesiyle 409 dönüyordu.
- **E-posta gönderilemezse** cevap 409 "Invitation delivery failed". Sağlayıcının metni kullanıcıya ulaşmıyor, yalnız teslim kaydında kalıyor.
- **Lokasyondan çıkarma (S1).** Yeni uç: `DELETE /v1/workspaces/:w/employees/:e/locations/:locationId` → `{ releasedShiftCount, locationsLeft }`. Çekmecede Employment sekmesinde, sunucunun `removable` dediği her lokasyon için iki tıklı kırmızı "Remove from <lokasyon>" düğmesi var ("Confirm remove from <lokasyon>"). Örnek: Ayşe, Kadıköy ve Moda'da çalışan Emre'yi Kadıköy'den çıkarır. Emre'nin Kadıköy'deki gelecek vardiyaları boşa çıkar, Moda'dakiler kalır, kayıt silinmez.
- **"Yalnız yönetir" lokasyonları (S2).** Yeni uç: `PUT /v1/workspaces/:w/employees/:e/managed-locations` gövdesi `{ locationIds }`; liste tümüyle yerine konur. Çekmecede Employment sekmesinde "Manages without working there" grubu var. `allowed.set_managed_locations` doğruysa (admin/owner, hedef yönetici) işaretlenebilir liste ve "Save managed locations" düğmesi görünür. Değilse ama kişinin böyle lokasyonu varsa salt okunur liste görünür.
- **Çalışanlar ekranlarında `permissions.includes` sayısı 0 (Done when 6).**
  - Davet düğmeleri `allowed.invite`'tan (yeni kayıtta `can(employee.invite)`).
  - Onboarding inceleme ve etkinleştirme `allowed.onboarding_review`'dan.
  - Yasal ad incelemesi sunucunun verdiği `private_contact`'tan (S3 a).
  - Erişim sekmesi sunucu kayıtta bir erişim işine izin veriyorsa ya da daveti gösteriyorsa görünür.
  - Erişim bölümünü kilitleyen `role_name === "Owner"` kontrolü de kalktı.
- **"Çalışan görünümüne geç" koruması (S4 a).** `/app/employee-hub` rotası artık rol adına bakmıyor; çekirdeğin `employee_hub.read`'ine bakıyor (yeni `apps/web/src/auth/ActionRoute.tsx`). Owner ve yönetici bu adrese gidince çalışan arayüzünde kalıyor. Kendi çalışan kaydı olmayan kişi, sayfanın mevcut erişim-yok kartını görür. Menü öğesi `.8`'in işi.
- **Workspace ana sayfası (BL-413, KK-36).** Pano, to-do ekleme, to-do kapatma ve düzen kaydı rotalarında `workspace.read` + rol adı kapısı kalktı. Dördünün servisi de artık çekirdeğe `workspace.todos` soruyor (düzen servisi `.7b-db`'de).

## 3. Açık kalan ve nedeni
- **"Manages" ve "No location" etiketleri ekranda yok.** Veri hazır (liste satırında `managed_location_names`, `location_count = 0`). Etiketleri göstermek `.8`'in görsel işi.
- **Görünüm:** çıkarma düğmeleri ve "Manages without working there" grubu yalnız işlevsel. Stil ve metin varyantları `.8`'de (`nf-arayuz`).
- **e2e (akış 2 davet, akış 10 kapsam ve çalışan görünümü):** `.10`'da.

## 4. Ekranda ne değişti
- **Employees → çekmece → Employment:** yeni "Remove from <lokasyon>" düğmeleri; yönetici kaydında "Manages without working there" grubu.
- **Employees → çekmece → Access ve Profile:** davet düğmeleri ile onboarding incelemesi artık sunucunun cevabıyla görünüyor ya da gizleniyor. Aynı rolde farklı kişilerde farklı görünebilir, çünkü karar kişi ve lokasyon bazında.
- **Owner/admin/yönetici `/app/employee-hub` adresine gidince** artık Workspace'e geri atılmıyor; çalışan arayüzünü görüyor.
- Workspace ana sayfasında görünür bir değişiklik yok (kural aynı, karar çekirdekte).

## 5. Sırada ne var
1. `nf-guvenlik` incelemesi (R3: davet/oluşturma kapısının kalkması, yeni iki uç). Diff davet ve katılım yüzeyine dokunuyor; kullanıcıya ultrareview önerisi uygun (CLAUDE.md §5).
2. `nf-gorsel-qa` (çekmece değişti), sonra `.8` görsel varyantlar.
3. **Yolda bulunanlar (dokunulmadı):**
   - (a) `loadEmployeeInvitationLink` (`apps/web/src/employees/employee-data.ts`) hâlâ elle yazılmış bir `fetch`; her hatayı `InvitationError("invitation_unavailable")` yapıyor. Yöneticinin admin davetinin bağlantısını istemesi (`authz.rank`) ekranda "bağlantı yok" olarak görünür, "yetkin yok" olarak değil. Küçük; `request()`'e geçirilebilir. (leave: low / do: safe)
   - (b) Çekmecede "owner kendi kaydına bakıyor" bilgisi (`ownOwnerRecord`) hâlâ `role_name === "Owner"` ile hesaplanıyor. Owner rolü yeniden adlandırılırsa kendi acil durum kişisi alanı kaybolur. (leave: low / do: safe)
   - (c) Yeni `ActionRoute` (`can()` tabanlı rota koruması) FB-6.8'de `PermissionRoute`'un taşınmasında kullanılabilir.

## Sözleşme (`nf-arayuz` için)
- `@newfork/shared`:
  - `employeeDetailSchema`: `locations[].removable: boolean`, `managed_locations: { id, name }[]`, `allowed.set_managed_locations | invite | onboarding_review: boolean` (hepsi zorunlu).
  - `employeeSummarySchema.managed_location_names: string[]` (zorunlu; detay bunu taşımaz).
  - `employeeLocationRemovalSchema` `{ releasedShiftCount, locationsLeft }`, `employeeManagedLocationsSchema` `{ locationIds }`.
- `apps/web/src/employees/employee-data.ts`:
  - `removeEmployeeFromLocation(workspaceId, employeeId, locationId)` → `EmployeeLocationRemoval`.
  - `setEmployeeManagedLocations(workspaceId, employeeId, locationIds)` → `EmployeeManagedLocations`.
  - Davet fonksiyonları artık `RequestError` fırlatıyor (`reason`, `status`), dolayısıyla `isNoAccess()` çalışıyor.
- Çekmece mutasyonları: `removeFromLocationMutation`, `managedLocationsMutation`. Başarıda `["employees", w]` ve `["employee-detail", w, id]` tazelenir; hata çekmecenin hata satırına düşer.
- Durumlar: yükleniyor (düğme "Removing" / "Saving"), hata (çekmecenin `error` satırı), erişim-yok (403/404 `authz.*`, `isNoAccess`).
- Etiketler: "Manages" ← `managed_location_names.length > 0`; "No location" ← `location_count === 0`.

## Kanıt
- Tam kapı (2026-09-30, `893cc89f`, yerel):
  - `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build` → 0.
  - `pnpm.cmd typecheck` → 0.
  - `pnpm.cmd lint` → 0 hata, 20 uyarı (hepsi `react-hooks/exhaustive-deps`, önceden var olan; yeni hook eklenmedi).
  - vitest: shared 178/178, api 1021/1021, web 1873 geçti + 1 atlandı; üçünde "Unhandled" 0.
- Kırmızı → yeşil sırası: davet rotaları 13 kırmızı; oluşturma 5; yeni uçlar 10; BL-413 6 (+2 düzen); web veri 7; shared 4; çekmece 6; App 2. Hepsi önce kırmızı görüldü, sonra kod yazıldı.
- `grep -c "permissions.includes" apps/web/src/employees/EmployeeDrawer.tsx apps/web/src/employees/EmployeesPage.tsx` → 0 / 0.
- `git push -u origin task/fb62-core-b-7b` → yeni dal.
