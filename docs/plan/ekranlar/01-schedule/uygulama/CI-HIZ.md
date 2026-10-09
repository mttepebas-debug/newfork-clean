# CI-HIZ — Schedule hız testi sonda tek başına; main koşuları birbirini iptal etmez

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule (CI) | EKRAN-01 CI-HIZ | nf-test / ekran oturumu | R2 | ONAY @23f168ae (`nf-guvenlik` alt ajanı) | 2026-10-06 |

## Sonrası için
- Kalıp: CI iş akışı değişikliğinde kanıt dal koşusudur; log'daki `Files=` sayısı `ci-green.txt` satır sayısıyla karşılaştırılır (bugün 166 satır: db işi 165, db-budget 1).
- Tuzak: `db-budget` `needs: [check, db, e2e]`; üçünden biri kırmızıysa hız testi **atlanır** (koşu yine kırmızı, gizli yeşil yok). Main 37420857018'in ilk denemesinde böyle oldu.
- Tuzak: concurrency grubu en çok bir bekleyen koşu tutar; main'e art arda üç kod gönderimi gelirse ortadaki "cancelled" görünür. Main izlemesi o commit'in değil son koşunun sonucuna bakar.
- Sınır: "tek başına" yalnız aynı koşunun içinde; başka dalın koşusu öteki runner'larda aynı anda çalışabilir. Hız testi yine kırmızı çıkarsa ilk bakılacak yer bu.
- Tuzak: `ci.yml` çalışma kopyasında CRLF; Node ile metin değiştirirken önce `\r\n` → `\n`.

## Rapor

**Karar:** `nf-guvenlik` ONAY @23f168ae · sınıf R2 (CI yapısı)
**İzin:** R2 — gönderildi, main `0987c9b8..23f168ae`
**Risk:** 🟢 yalnız CI ayar dosyası; 50 ms sınırı ve green list aynen
**Soru:** yok
**Sonraki:** BL-562 ve BL-756 kapanış satırı önerisi aşağıda; "iki ardışık main gönderimi" kanıtı bir sonraki kod gönderiminde görülecek

### 1. Nerede duruyor
Bitti, main'de (`23f168ae`). Main koşusu 37420857018 ikinci denemede yeşil (dört iş). Dal `task/ci-hiz`, worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\ci-hiz`.

### 2. Ne yapıldı
- **Önce:** Schedule ızgarasının hafta okuma testi (`schedule_grid_read_budget`, ≤ 50 ms) veritabanı testleriyle birlikte, tarayıcı testleri (e2e) aynı bilgisayarda koşarken ölçülüyordu: 57–67 ms, main iki kez kırmızı.
- **Sonra:** test db işinin listesinden süzülüyor ve yeni `db-budget` işinde, kod kontrolü + db + e2e bittikten sonra tek başına koşuyor. Dal koşusunda 05:49:50'de (e2e bittikten 2 sn sonra) başladı, 17/17 geçti. Main koşusunda da geçti (17/17, 3 sn).
- **Önce:** main'e yeni gönderim gelince çalışan main koşusu iptal oluyordu (BL-756; ör. 37409057689).
- **Sonra:** main'de yeni koşu bekler, eskisi biter (`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`); görev dallarında eskisi gibi iptal.
- Green list küçülmedi: dosya `ci-green.txt`'de duruyor, `ci-green-guard.sh` yerelde geçti.

### 3. Açık kalanlar
- **İki ardışık main gönderiminde ilk koşunun iptal olmaması** bu işte gözlenmedi: arşiv gönderimi yalnız `docs/` olduğu için CI tetiklemiyor. Kural ayarda; kanıt bir sonraki iki kod gönderiminde `gh run list --branch main` ile görülür.
- Main 37420857018 ilk denemede kırmızıydı: `check` (runner `newfork-local-pc`) içinde tek web testi, `ShiftQuickEditor.test.tsx` "spends Escape on the rule box like Cancel" — Escape sonrası pencere 1181 ms'de kapandı, bekleme 1000 ms. `gh run rerun --failed` ile ikinci deneme yeşil (check yine `newfork-local-pc`): yük kaynaklı. Kalıcı düzeltme CI-HIZ-2.

### 4. Ekranda ne değişti
Görünürde bir şey değişmedi; yalnız CI.

### 5. Sırada ne var
- BACKLOG önerisi: **BL-562** "Kapandı 2026-10-06 (`23f168ae`): hız testi CI'da sonda tek başına (`db-budget`); dal 37418888097 ve main 37420857018 yeşil, sınır 50 ms aynı." **BL-756** "Kapandı 2026-10-06 (`23f168ae`): main'de `cancel-in-progress` kapalı, dallarda açık; ardışık iki main gönderiminin kanıtı ilk fırsatta eklenir."
- Kanıt: dal koşusu 37418888097 (check, db 165 dosya, e2e, db-budget 1 dosya — hepsi success); main 37420857018 deneme 2 (dördü success; check/db-budget `newfork-local-pc`, e2e `-pc-2`, db `-pc-3`).
