# FB-6.2 `.7b` görsel QA düzeltmesi — nf-backend raporu, 2026-09-30

Dal `task/fb62-7b-qa-fixes` (push edildi), worktree `.claude/worktrees/youthful-montalcini-5c90e3`, taban `origin/main` `840b92a7`.
Commit'ler: `dfb11860` (web + shared), `e49032a1` ve `d6fa3a82` (nf-db `4480d41f` ve `866945fb`'nin cherry-pick'i, `supabase/**` onun), `ef466825` (lint).
Kaynak: `nf-gorsel-qa` DEĞİŞİKLİK İSTE @`0806cc62`, bulgu 1–3. Delegasyon: R2 → `nf-guvenlik` kısa bakış + görsel QA yeniden.

## 1. Nerede duruyor
Üç bulgu düzeldi ve push edildi. Main'e alınmadı. Tam kapı yerelde yeşil.

## 2. Ne yapıldı (etkisi)
- **Bulgu 1: gizli profil alanları kaybolmuyor.** Sunucu artık iki durumu ayırıyor: "okuma izni yok" için `private_contact: null`, "izin var, kayıtta bir şey yok" için boş nesne (migration `20260930190000`, nf-db). Nesnenin biçimini birlikte kararlaştırdık: ad anahtarları yok, alanlar null, `emergency_contact_email` "" ve paylaşım bayrakları false. Mevcut shared şemaya değişmeden uyuyor. Web'de kural aynı kaldı (`private_contact !== null` = okuyabilir). Örnek: owner Alex Kim'i açınca Date of birth, Phone, Emergency contact ve adres alanlarını yine "Not provided" olarak görür; Emre'de dolu görür. Legal name review paneli aynı koşula bağlı, o da düzeldi.
- **Bulgu 2: hesabı bağlı kişide Invite yok.** İki katmanda çözüldü:
  - Sunucu, hesabı bağlı ya da arşivli kayıtta `allowed.invite`'ı false veriyor (nf-db).
  - Çekmecenin alt çubuğundaki Invite düğmesi ayrıca `user_id` doluysa gösterilmiyor. Bu, komutun ön koşulu; bir yetki kuralı değil.

  Örnek: admin Emre'yi açınca Access'te "Onboarded and linked" yazıyor ve yanında Invite düğmesi yok.
- **Bulgu 3: "Manages without working there" çalıştığı lokasyonu sunmuyor.** Seçenekler, kişinin Locations'taki lokasyonları dışarıda bırakıyor. Örnek: Ayşe Kadıköy'de çalışıyor; editörde yalnız Beşiktaş kutusu var.

## 3. Açık kalan ve nedeni
- Grubun biçimi (başlık, kutular ve düğme tek satırda, telefonda kırılıyor) ve QA'nın 4–7. maddeleri `.8`'in görsel işi.
- **Kenar durum:** bir lokasyon hem "yalnız yönetir" listesinde olup sonradan çalışılan lokasyon olursa, editörde görünmez ama listede kalır. Kaydet'e basınca da korunur. Bugün böyle bir kaydı hiçbir akış üretmiyor, çünkü atama ekranı yönetilen lokasyonu kaldırmıyor. Gerekirse sunucu, çalışılan lokasyonu yönetilen listeden düşürebilir (nf-db). (leave: low / do: safe)
- Legal name review paneli canlıda görülemedi (QA madde 8): yerel DB'de incelemesi bekleyen kimse yok. Vitest'te hem görünür hem gizli hâli kilitli.

## 4. Ekranda ne değişti
- **Employees → çekmece → Profile:** yetkili kişi, kaydı boş olan çalışanda gizli alanları yeniden "Not provided" olarak görüyor.
- **Employees → çekmece → alt çubuk:** hesabı bağlı kişide Invite yok.
- **Employees → çekmece → Employment:** yöneticinin "Manages without working there" listesinde çalıştığı lokasyonlar yok.

## 5. Sırada ne var
1. `nf-guvenlik` kısa bakış (R2: okuma projeksiyonu ve `allowed.invite` koşulu).
2. Görsel QA yeniden: owner / admin / manager, Profile + Access + Employment; madde 8 dahil.
3. `.8` (`nf-arayuz`): grubun biçimi, tek seçenekli rol seçici, hub kartı metni, menü.

## Kanıt
- Kırmızı → yeşil:
  - "bağlı hesapta Invite yok" ve "çalıştığı lokasyon sunulmaz" önce kırmızıydı (`dfb11860` öncesi koşu).
  - "boş nesnede alanlar görünür" (web) ve shared biçim testi bugünkü doğru davranışı kilitliyor.
  - Eski "managed locations" testi çalışılan lokasyonu ekliyordu; çalışılmayan bir lokasyonla yeniden yazıldı.
- Tam kapı (2026-09-30, `d6fa3a82` + `ef466825`, yerel; CI boştaydı):
  - build → 0; `pnpm.cmd typecheck` → 0.
  - `pnpm.cmd lint` → 0 hata, 20 uyarı. Uyarıların hepsi eski `exhaustive-deps`; ilk koşudaki tek hata benim kullanılmayan test sabitimdi, `ef466825` ile silindi.
  - vitest: shared 179/179, api 1021/1021, web 1877 geçti + 1 atlandı. Üçünde "Unhandled" 0.
  - `ef466825` sonrası: lint yeniden koşuldu (hata 0), yalnız değişen dosya (`EmployeeDrawer.test.tsx`) 67/67.
- `git push -u origin task/fb62-7b-qa-fixes` → yeni dal.
