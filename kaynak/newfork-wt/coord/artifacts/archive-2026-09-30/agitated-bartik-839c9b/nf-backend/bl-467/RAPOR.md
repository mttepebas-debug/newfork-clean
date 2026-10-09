# BL-467 — rapor (İşçi: G18 Belgeler, nf-backend)

2026-09-30. Branch `task/bl-467` (taban `origin/main` `93902bdf`), commit `9e357abe`, push yok.
Worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\agitated-bartik-839c9b`. R1.

## 1. Nerede duruyor
Bitti; main'e alınmayı bekliyor.

## 2. Ne yapıldı
Belge çekmecesinde (Account → Documents, Employees → Documents, Employees çekmecesi → Documents) yazılan her şey
artık yeni bir revizyondan sonra da duruyor: ret gerekçesi, düzeltme süresi, dosya kararları ve notları, erteleme
nedeni, uzatma günleri ve gerekçesi, belge saat dilimi, politika "okudum" işareti ve yazılan ad.
Örnek: müdür Ayşe reddederken "Unreadable" yazar, dosyaya "Discard" ve "Blurry" notu verir; o sırada çalışan
belgenin saat dilimini değiştirir (yeni revizyon). Yazdıkları yerinde kalır, kapatırken "Discard unsaved
changes?" sorulur, "Reject" hepsini yeni revizyonla gönderir.

Tek mekanizma: dilim a'nın deposu genişledi. Her değer, yazıldığı şeye bağlı:
| Alanlar | Bağlı olduğu şey | Ne zaman düşer |
|---|---|---|
| son kullanma tarihi, ek alanlar | taslak sürüm (dilim a, değişmedi) | başka taslak / Submit |
| ret gerekçesi, düzeltme süresi, dosya kararları | incelenen sürüm | başka sürüm incelemeye gelince / Reject-Approve geçince |
| imza adı, "okudum" | politika metni (özeti) | metin değişince / Acknowledge geçince |
| erteleme nedeni, uzatma günleri ve gerekçesi, saat dilimi | belge | kendi komutu geçince |

Hepsi için aynen kalan: yalnız tarayıcıda; çekmece kapanınca, başka belgeye geçince, sayfa yenilenince düşer.
Yeni kural (gerekliydi): komutu başarıyla geçen alan temizlenir — yoksa süre uzatıldıktan sonra gerekçe ekranda
kalır, "Extend" yeniden basılabilir ve "Discard" yersiz sorulurdu. "Discard"ın ne zaman çıktığı değişmedi.

Kanıt:
- Önce kırmızı: 5 yeni hücre (her alan grubu için bir) bugünkü main'de düştü — ret alanları, erteleme,
  uzatma, saat dilimi, imza revizyondan sonra boşalıyordu. 2 koruma hücresi (başka sürüm incelemeye gelince ret
  gerekçesi düşer; politika metni değişince imza düşer) o gün de yeşil.
- `DocumentReviewDrawer.test.tsx`: 53/53 yeşil (dilim a ve b hücreleri dahil, değişmeden).
- Web typecheck yeşil; `pnpm.cmd lint` 0 hata (20 uyarı eski; iki dosyada uyarı yok).
- Web vitest tamamı (CI boşken): 1994 yeşil, 1 atlanan, **1 kırmızı**: `src/App.test.tsx` → "App > gives the
  first mouse press inside the save recovery sheet to the sheet" (Schedule'ın kaydetme kurtarma penceresi; bu
  işle ilgisiz dosya). Tek başına yeniden koşunca yeşil. Aşağıda yolda bulunan.
- Diff yalnız `DocumentReviewDrawer.tsx` ve `.test.tsx`.

## 3. Açık kalan
- Tarayıcıda denenmedi (R1; görev vitest istedi; dilim a'da aynı yapı gerçek akışta doğrulanmıştı).
- `DocumentExemptionAction`'daki muafiyet nedeni kapsamda değildi (listede yok); o ayrı bileşen, kendi durumu.

## 4. Ekranda ne değişti
Belge çekmecesi: yukarıdaki alanlar yeni revizyondan sonra boşalmıyor; bir komut geçince kendi formu baştan
başlıyor. Görünüm aynı.

## 5. Sırada ne var / yolda bulunanlar
- **(leave: medium / do: safe) Yük altında düşen test:** `src/App.test.tsx` "gives the first mouse press inside
  the save recovery sheet to the sheet" (`:1893`, `pressReachedTheButton` false) tam koşuda bir kez düştü, tek
  başına geçti. G14 (`7e19a76b`) ile gelmiş; backlog'da yok. `nf-test` yük altında yeniden ölçmeli.
