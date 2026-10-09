# EMP-001 B4: rol "Save changes" ile kaydedilir; çekmece kapanırken sormaz (nf-backend, 2026-09-30)

## 1. Nerede duruyor
Bitti, main'e alınmayı bekliyor. Söküm main'e girdikten sonra dal `origin/main` üstüne alındı; tam kapı, üç Employees e2e'si ve Access ekran görüntüleri rebase'den sonra koşuldu. Açık kalan: bağımsız inceleme.

- Dal: `task/emp-001-b4`, uç `57f45555`, taban `origin/main` @ `6610ffac`. Push yok.
- Worktree: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-blackburn-f4a88f`
- Commit'ler: `776fc213` (kod + testler), `3ffa8f36` (istek yoldayken gezinme hücresi), `57f45555` (rol hafızası). Rebase öncesi adları: `d46d7957`, `54a73953`, `c2a4bfed`.
- Kapı ve e2e `9733f42c` tabanındaki `e48df45c`'de koşuldu; ardından main'e giren iki commit (`660200db`, `6610ffac`) yalnız `docs/plan` değiştirdi, kod farkı yok (`git diff --name-only e48df45c 57f45555` → yalnız `docs/`).
- Delegasyon: R2; bağımsız inceleme ve görsel QA koordinatörde (aşağıda inceleme sorusu var).

## 2. Ne yapıldı (etkisi)
**Employees → bir kişi → çekmece → Access → "Workspace role"**
- Rol seçmek artık hiçbir şey göndermez; seçim formda durur, "Save changes" etkinleşir. Örnek: owner Mert, Ayşe'yi Employee'den Manager'a çevirir; yanlış seçtiyse kaydetmeden geri alır.
- "Save changes" önce kişi kaydını (değiştiyse), sonra rolü gönderir. Yalnız rol değiştiyse tek istek gider ve çekmece Access'te kalır; ad da değiştiyse bugünkü gibi Profile'a döner.
- Kişi kaydı girip rol reddedilirse: hata görünür, seçici seçilen rolü göstermeye devam eder, ikinci "Save changes" yalnız rolü gönderir (kişi kaydı ikinci kez gitmez). Kişi kaydı reddedilirse rol hiç gönderilmez.
- Kaydı kaydedemeyen ama rolü değiştirebilen okuyucuda da "Save changes" çıkar (yalnız hesabı bağlı, arşivlenmemiş kişide; rol seçicisi de yalnız orada var).
- Rol kaydından sonra form yeni revizyonu alır; ardından yapılan ad değişikliği çakışma hatası vermez.

**Çekmecenin alt çubuğu**
- "Terminate employee", taslakta yalnız rol varken de pasif; ipucu artık "profile" demiyor (BL-431).
- Hiçbir şey değişmemişken bir giriş alanında Enter kayıt göndermez (BL-432).

**Kapatma (K7 (i))**
- Çekmece hiçbir durumda "kaydedilmemiş değişiklik" sormaz: var olan kişide de, "Add employee" formunda da Cancel, X, Esc ve dışarı tıklama yazılanı atar ve kapatır. Tarayıcının "sayfadan ayrıl" uyarısı da yok.
- Kalan tek koruma (koordinatör kararı A): yeni kişi için "Save" isteği sunucuya gitmişken tarayıcının geri tuşu ve çekmece dışındaki bağlantılar sessizce tutulur; cevap gelince serbest kalır. Pencere, soru, uyarı yok. Hücre: `EmployeeDrawer.create.test.tsx` "holds the route while the create request is on its way, without asking, and lets go once it is answered".

**"Remove from <lokasyon>" sonrası (koordinatör eki)**
- Çıkarma başarılı olup kişi okuyanın kapsamından çıkınca çekmece kapanır ve "Removed from <lokasyon>" bildirimi çıkar (var olan `useToast`). Örnek: Kadıköy müdürü Ayşe kişiyi Kadıköy'den çıkarır, kişi yalnız Beşiktaş'ta kalır; eskiden "You don't have access to this employee" kilidi ve altında "Terminate employee" kalıyordu.
- Kişi hâlâ kapsamdaysa bugünkü gibi: çekmece açık kalır, kayıt yeniden okunur, bildirim yok.

## 3. Açık kalanlar
| Ne | Neden |
|---|---|
| Görsel QA | Ekran görüntüleri alındı (aşağıda); `nf-gorsel-qa` turu koordinatörün kararı. |
| Bağımsız inceleme | R2, koordinatörde. Soru: "iki çağrının sırası ve kısmi hata hiçbir yolda rolü sessizce düşürüyor ya da iki kez gönderiyor mu". Bakılacak yer: `EmployeeDrawer.tsx` `saveMutation` (`:400-454`), `submit` (`:816-847`). İncelemeciye not: aynı karede iki gönderim (çift Enter) `busy` kapısını eski değerle geçebilir; bu kişi kaydı için bugün de böyle, rol aynı yoldan geçiyor. |

## 4. Ekranda ne değişti
**Employees → çekmece → Access**: "Workspace role" seçince kayıt olmaz; alt çubukta "Save changes" yanar. Kayıt sürerken seçici pasif.

**Employees → çekmece → alt çubuk**: "Terminate employee" ipucu değişti; yalnız rol taslaktayken de pasif.

**Employees → "Add employee" çekmecesi**: form doluyken kapatınca "Discard new employee?" penceresi gelmez; sekmeyi kapatırken tarayıcı uyarmaz.

**Employees → çekmece → Employment → "Remove from <lokasyon>"**: kişi kapsamdan çıkarsa çekmece kapanır, bildirim çıkar. Aynı çekmece Availability ve Schedule sayfalarından da açılıyor; davranış orada da aynı.

Ekran görüntüleri (e2e dünyası, admin Zeynep → Emre Person → Access; hiçbir şey kaydedilmedi), `artifacts/nf-backend/emp-001-b4/shots/`:
- `access-desktop.png`, `access-phone.png`: rol dokunulmamış, "Save changes" sönük.
- `access-desktop-role-picked.png`, `access-phone-role-picked.png`: "Manager" seçili, "Save changes" yanıyor, masaüstünde "Terminate employee" soluk.
- Gözlem: telefonda alt çubukta "Terminate employee" yok (eski kural, `styles.css:2667` alt çubuğun sol bölümünü telefonda gizliyor); yeni ipucu metni bu yüzden yalnız masaüstünde görünür.

| Metin | Durum |
|---|---|
| "Save profile changes before terminating the employee" | değişti → "Save your changes before terminating the employee" |
| "Discard new employee?" | silindi |
| "Keep editing" | silindi |
| "Discard" | silindi |
| "Removed from <lokasyon>" | yeni (bildirim) |

## 5. Sırada ne var
1. **Dal CI + bağımsız inceleme + main'e alma** (koordinatör). KARARLAR "Ekran kararları → Employees" iki yeni madde (EMP-001 tablosu B4 satırı) ve BL-431, BL-432 kapanışı aynı turda; `keep/fb62-8-save-pattern` dalı B4 girince silinecek.
2. **Görsel QA**, sökümden sonra: Access sekmesi masaüstü + telefon.
3. **Yolda bulunanlar (dokunulmadı):**
   - (leave: low / do: moderate) **Manager'ı Employee yapıp aynı kayıtta son lokasyonunu da çıkarmak tutulur.** Employees → çekmece: kişi kaydı rolden önce gittiği için form, kişi hâlâ Manager sayılırken "A manager needs at least one location to manage…" der. Bugünkü yol: önce rolü kaydet, sonra lokasyonu. Çare ürün kararı ister (form taslaktaki role mi, kayıtlı role mi baksın; veritabanı sırası değişmez).
   - (leave: low / do: safe) **`PublicTrustPages.test.tsx` "/privacy" hücresi ilk tam koşuda yük altında düştü** (5,2 s, zaman aşımı); tek başına 8 hücre yeşil, rebase sonrası ikinci tam koşuda da yeşil. Bu işin dosyalarıyla ilgisi yok.
   - (leave: low / do: safe) **EMP-001 Touches satırı bayat:** "iki test dosyasında Discard beklentisi yok (grep 0)" diyordu; `EmployeeDrawer.create.test.tsx`'te iki hücre vardı, yeni kurala göre yeniden yazıldı.
   - (leave: low / do: safe) `saveMutation.onSuccess` içindeki `props.creating` dalı ölü görünüyor (yeni kişi `createMutation`'dan geçiyor); dokunulmadı.

## Kanıt
Ölçüm zamanı: 2026-09-30, rebase'den sonra (`e48df45c`, taban `9733f42c`), main CI 36720132559 bittikten sonra. Rebase öncesi ilk koşu (`c2a4bfed`): 1937 geçti, 1 düştü (yük).

| Kapı | Komut | Sonuç |
|---|---|---|
| Kırmızı (TDD) | `vitest run` iki çekmece dosyası, uygulamadan önce | 13 düştü, 106 geçti; her biri beklenen nedenle |
| lint | `pnpm.cmd lint` | 5/5 görev, 0 hata (web 20 uyarı, hepsi eski; çekmecedeki 3 uyarı değişmedi) |
| typecheck | `pnpm.cmd typecheck` | 7/7 görev |
| web vitest, tamamı | `pnpm.cmd --filter @newfork/web exec vitest run` | 221 dosya; 1950 geçti, 1 atlandı, 0 düştü |
| e2e (yerel, `db.lock` ile) | `pnpm.cmd e2e flows/invite.spec.ts flows/scope-and-employee-view.spec.ts flows/remove-from-location.spec.ts` | 7 geçti (1,4 dk); o sırada `task/batch-t9` dal CI'ı sıradaydı |
| yeni gezinme hücresi | `vitest run src/employees/EmployeeDrawer.create.test.tsx` ×3 | 21/21, üç koşuda |
| build | `pnpm.cmd build` | 4/4 görev |
| grep (35) | `grep -c "beforeunload"` ve `"discardOpen\|Discard new employee"` `EmployeeDrawer.tsx`; `employee-discard` `styles.css` | 0 / 0 / 0 |

Done when → hücre (`EmployeeDrawer.test.tsx`, `describe` "EmployeeDrawer saves the workspace role with Save changes"):
| # | Hücre | Satır |
|---|---|---|
| 29 | holds a picked role in the form and sends nothing | `:2227` |
| 30, 36a | sends the role alone when only the role changed, and stays on Access | `:2236` |
| 30, 36b | sends the record, then the role, and returns to Profile | `:2250` |
| 31a | keeps the picked role when it fails after the record landed; the retry sends the role alone | `:2264` |
| 31b | sends no role when the record is refused | `:2280` |
| 32 | holds Terminate while only the role is unsaved, and does not say profile | `:2293` |
| 33 | offers Save changes to a reader who may change the role and not the record; offers no Save changes to a reader who may change neither | `:2301`, `:2312` |
| 34 | saves a later name change on the revision the role save left | `:2320` |
| 35 | closes on Escape and on a click outside without asking, and forgets the picked role (`:2341`); `create.test.tsx`: "closes a filled form on Escape, a click outside and Cancel without asking", "lets browser history leave a filled create form without asking" | |
| 37 | sends nothing on Enter when nothing changed | `:2357` |
| ek | closes and says so when the person can no longer be read; stays open and reads the record again when the person is still in reach | `:2379`, `:2389` |

Skills: `superpowers:writing-plans` yüklendi, plan `artifacts/nf-backend/emp-001-b4/PLAN.md` (kısa biçim; tasarruf notu). `test-driven-development` ve `verification-before-completion` metinleri yüklenmedi (tasarruf), yöntemleri uygulandı: önce kırmızı koşu, bitişte tam kapı.

## Karar kaydı (kendi alanım)
| Karar | Dayanak | Geri alma maliyeti |
|---|---|---|
| Rol taslağı `rolePicked` (null = kayıtlı role uyar); başka kişiye geçince ve başarılı kayıtta sıfırlanır | `6722c4aa` kalıbı | — |
| Rol girince form "dokunulmamış" sayılır | Rol servisi revizyonu artırıyor; dokunulup geri alınmış form eski revizyonda kalıp sonraki kayıtta 40001 alırdı (hücre 34) | 2 satır |
| Yeniden denemede (kişi kaydı önceki basışta girmiş, şimdi yalnız rol giriyor) sekme olduğu yerde kalır | K7 (ii) "yalnız rol kaydedildiyse Access'te kalır"; hata da orada görünüyordu | 1 koşul |
| "Save changes" rol için yalnız hesabı bağlı, arşivlenmemiş kişide çıkar | Rol seçicisi yalnız orada; aksi hâlde hiç yanmayan bir düğme çıkardı | 1 koşul |
| Kayıt sürerken rol seçicisi pasif (`busy`) | Diğer alanlarla aynı | — |
| Terminate ipucu "Save your changes before terminating the employee" | BL-431'in yazdığı çare | metin |
| Gezinme koruması yalnız istek yoldayken (A) | Koordinatör kararı 2026-09-30 | ~35 satır silinir |
| Kapsamdan çıkış, yenilemeden sonra detay sorgusunun hatasına `isNoAccess` ile bakılarak anlaşılır | Sunucunun cevabı; istemci kapsam hesabı yapmaz (`db-decides-client-mirrors`) | 12 satır |
