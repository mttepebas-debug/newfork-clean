---
name: checklist-mock-boundary-and-timing-isolation
description: BL-137 (3 tur) sonrasi iki tekrar eden kontrol; test iddiasi mocklanmis sinirin disinda mi calisiyor, zaman butceli testler ayri vaka mi
metadata:
  type: feedback
---

BL-137 (şifre sıfırlama) üç tur sürdü; iki tekrar eden kontrol türü var:

**1. Mock sınırı vs gerçek satır.** Bir test "şu satırı koruyor" dediğinde, hangi
modülün mocklandığına bak. `apps/web/src/lib/supabase.ts` testinde yalnız
`@supabase/supabase-js`'nin `createClient` çağrısı (auth.verifyOtp/updateUser/
signOut) mocklandı; `window.localStorage.setItem/removeItem` çağrıları gerçek
kaldı. Bu yüzden ilgili satır silinince test kırmızı olur (doğruladım:
kod okumasıyla, satır kaldırılınca hangi assertion patlayacağını izleyerek).
Eğer test dosyası hedef fonksiyonun BULUNDUĞU modülü topyekûn mocklarsa
("vi.mock('./supabase', ...)" gibi), o testler o dosyanın satırlarını asla
koruyamaz — yalnız çağrıldığını kanıtlar, davranışını değil.
**Nasıl uygula:** "bu test X satırını koruyor" iddiası geldiğinde, o dosyanın
`vi.mock` listesinde testin iddia ettiği modülün kendisi var mı diye bak; varsa
reddet, yoksa satırı zihinsel olarak silip hangi assert'in patlayacağını izle.

**2. Zaman bütçeli testler tek vakaya bölünmeli.** Önceki tur `for (const send of
[hung, instant, slowButInBudget])` döngüsüyle üç senaryoyu aynı floor/budget
altında test ediyordu (floor=120, budget=80) — eşik ile gerçek gecikme arası
pay (115 vs 120) belirsizdi. Düzeltme her senaryoyu kendi floor/budget'ıyla
ayrı teste böldü (floor=0+budget=80 gönderim testi, floor=0+budget=80 abort
testi, floor=120+anlık gönderim testi), her birinde eşik gerçek gecikmenin
5ms altında. Gerçek zamanlayıcılar erken ateşlenmez, yalnız geç kalabilir; bu
yüzden ">=eşik" biçimindeki kontrol yük altında YALNIZ geç kalma yönünde güvenlidir
(yanlış kırmızı vermez), erken ateşlenme riski yoktur. Tek testte birden fazla
zaman senaryosu varsa bu güvenceyi doğrulamadan geçme.
