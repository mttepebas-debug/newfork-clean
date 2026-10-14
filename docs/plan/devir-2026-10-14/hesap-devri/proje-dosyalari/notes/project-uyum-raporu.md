# Kuralların Project'te çalışırken çıkaracağı sorunlar

Tarih: 2026-10-09 · Okunan: `origin/main` @ `7ecbcc74` (CLAUDE.md, klasör CLAUDE.md'leri, `.claude/settings.json`, `.claude/agents/`, `.claude/skills/`, `scripts/`, `.github/workflows/ci.yml`, KARARLAR §0) ve proje dosyalarındaki devir özeti. Hiçbir dosya değiştirilmedi.

**Kısa cevap:** Evet, bir kısmı sorun çıkarır. Ürün, kalite ve güvenlik kuralları olduğu gibi geçerli. Sorun süreç katmanında: kurallar "senin Windows bilgisayarında tek bir koordinatör oturumu" varsayıyor. Project'te ise koordinatör ayrı bir Claude, her thread seninle doğrudan konuşuyor ve thread'lerin çoğu bulutta (Linux, senin bilgisayarın değil) çalışıyor.

Not: Koordinatörün bahsettiği `scripts/inbox.mjs` ve `KOORDINATOR.md` artık main'de yok; 2026-10-08'deki v2 ile arşive gitmiş. Bugünkü düzen guard, tren, kilit ve `DURUM.md` üzerine.

## Anladığım

Sen Project'in nasıl çalıştığını bilmeden kendi çok oturumlu düzenini kurdun; şimdi Project'te o kuralların işi bozup bozmayacağını soruyorsun. Proje talimatı "her thread CLAUDE.md'ye uyar, çelişirse CLAUDE.md kazanır" diyor. Yani thread'ler bu kurallara harfiyen uymaya çalışacak; uyamadıkları yerde ya takılacaklar ya da kuralı sessizce çiğneyecekler.

## Eksik ya da yanlış olabilecek (çakışanlar, en ciddisi önce)

1. **Kayıtlar GitHub'da değil, senin bilgisayarında.** `DURUM.md` koordinatör klasöründe (`C:\…\newfork-wt\coord`), `coord/kayit` dalı push edilmiyor (devir özetine göre main'in 4 commit önünde). Bulut thread'leri yalnız GitHub'ı görür, yani KARARLAR, BACKLOG ve sıra onlara eski hâliyle gelir. Bir thread eski bir karara dayanıp yanlış iş yapabilir.

2. **İki koordinatör olur.** Project'in kendi koordinatörü var (proje sohbetini okur, thread açar). CLAUDE.md §2 "Mert'le yalnız koordinatör konuşur" ve §5 "koordinatör tek oturum, `coord/kayit`" diyor. Project'te her thread seninle doğrudan konuşur. Eski koordinatör oturumunu da açık tutarsan iki merkez aynı işi dağıtır.

3. **"Main'e yalnız tren" kuralı Project'in varsayılan yoluyla çatışıyor.** Project'teki thread'ler alışkanlıkla dal açar, PR açar ve PR'ı "yeşile sürer". Üç sorun var:
   - PR GitHub aracıyla birleştirilirse guard bunu görmez: `scripts/guard.mjs` yalnız terminal komutlarını okur, GitHub aracını okumaz. Sonra `main-watch` 🔴 alarm verir.
   - PR açmak CI'ı senin bilgisayarındaki tek runner'da başlatır (`ci.yml` `pull_request` tetiği). Bu, trenin CI'ıyla yarışır.
   - Bilgisayarın kapalıysa CI hiç koşmaz; thread "yeşile sürme" adımında sonsuza dek bekler.

4. **Sabit Windows yolları bulutta bozuluyor.** `OPS_DIR`, `LOCK_DIR`, `TRAIN_DIR`, `MAIN_DIR` hepsi `C:/Users/TheWe/…` olarak yazılı (`scripts/ops.mjs:7`, `scripts/lock.mjs:20`, `scripts/train.mjs:23`, `scripts/wt-hazirla.mjs:12`). Linux'ta bu yol, repo klasörünün içinde `C:` adlı bir klasör olarak açılıyor (denedim: `/home/claude/newfork-clean/C:/Users/…`). Sonuçları:
   - Bulut thread'i `lock.mjs` koşarsa senin kilidini değil, kendi sahte kilidini alır. Koruma yokmuş gibi olur ama "kilit aldım" sanılır.
   - Guard bir dal silindiğinde ya da push reddettiğinde `audit.log`'u repo içine yazar; çöp klasör commit'e girebilir.
   - `wt-hazirla.mjs` `.env` dosyalarını `C:\` ana klasörden kopyalar; bulutta düşer, işçi ilk komutta takılır.

5. **Bulutta yerel veritabanı yok.** Bu kapsayıcıda Docker çalışmıyor (denedim). Yani `test:db`, pgTAP, e2e, `lock.mjs run db`, `db:schema`, tren bulutta koşmaz. CLAUDE.md bunları "işçi koşar" diye yazıyor; bulut thread'i ya takılır ya da atlar.

6. **Guard bulut thread'ini koordinatör sanıyor.** Guard'a göre işçi = alt ajan kimliği olan ya da `.claude/worktrees/agent-*` klasöründe çalışan oturum (`scripts/guard.mjs:350-353`). Project thread'i ikisi de değil. Yani thread kayıt dosyalarını (DURUM, KARARLAR, BACKLOG) yazabilir ve `train.mjs` koşabilir; "işçi kayıt yazmaz" koruması thread'lerde işlemiyor.

7. **"Aynı anda 1 işçi" Project'te kendiliğinden tutmaz.** Project birden çok thread'i aynı anda açabilir. Kuralı Project koordinatörünün bilmesi gerekiyor; şu an proje hafızasında yazmıyor.

8. **Komut ve dosya biçimi.** §2.10 "komut PowerShell 7'de, `pnpm.cmd`" ve §2.1 "dosya her zaman tam Windows yoluyla" bulut thread'i için anlamsız: bulut Linux'ta `pnpm` kullanır ve senin `C:\` yolunu tıklanır veremez. Project'te dosya kartı ya da proje dosyaları bağlantısı kullanılıyor.

9. **Koordinatöre özgü araçlar Project'te yok.** `/oto`, `/durum`, cron ile 20 dakikalık tur, uyanık tutma, `AskUserQuestion` ve onun karar kaydı kancası (`decision-log.mjs`) yerel Claude Code'a özgü. Project'te soru kartı başka bir araçla açılıyor; kararlar `decisions.jsonl`'e düşmez.

10. **Remote Control (bilgisayarında çalışan thread) ana klasörde açılıyor.** Onaylı klasör `C:\…\newfork-clean`, yani senin main klasörün. §3.B.1 orada iş yapmayı yasaklıyor. Böyle bir thread önce kendi worktree'sini açmalı; bunu bilmezse kuralı çiğner.

## Olduğu gibi uyanlar

- §1 vizyon, §3.A kalite ve güvenlik çıtası (workspace sınırı, RLS, test, ikiz sistem yok, arayüz, erişilebilirlik).
- §3.B'deki yasaklar (force push, `reset --hard`, stash, `--no-verify`) ve `.claude/settings.json` yasak listesi: bulutta da geçerli, Project kuralları da aynısını istiyor.
- §4 dayanak sırası ve "her zaman Mert'e" listesi; KARARLAR defteri; commit biçimi.
- Canlı veritabanı kuralları (§5.5): bu thread'de Supabase aracı açık, yani bulut thread'i canlıya erişebiliyor. Kural aynen gerekli; yalnız "riskli olanı koordinatör uygular" cümlesinde koordinatörün kim olduğu netleşmeli.
- Klasör CLAUDE.md'lerindeki teknik tuzaklar (yalnız komut biçimleri Windows'a göre).
- Remote Control thread'leri için Windows komutları, kilit ve tren aynen çalışır; orası senin bilgisayarın.

## Sorularım

1. Hangi düzen? (Aşağıda kartla soruyorum.)
2. Bulut thread'leri PR açsın mı, yoksa yalnız dalını push edip trene mi bıraksın? (İlk soruya bağlı; cevabına göre önerim aşağıda.)

## Bence

**Önerim: Project'in koordinatörü senin koordinatörün olsun; eski koordinatör oturumu ve `/oto` emekliye ayrılsın.** Project zaten mesajlaşmayı, durumu ve devri yapıyor; ikisini birden yürütmek çift iş ve çakışma demek. Değişecekler (hepsi senin onayınla, çünkü CLAUDE.md'de kural değişikliği):

1. CLAUDE.md'ye kısa bir "Project'te çalışma" bölümü: Project koordinatörü = §5 koordinatör, thread = işçi. Bulut thread'inin yaptığı: kod, lint, typecheck, birim test, dal push. Yapmadığı: `test:db`, e2e, kilit, tren. Bunlar bilgisayarında Remote Control thread'iyle.
2. Kayıtlar GitHub'da tek kaynak: `coord/kayit` her güncellemede push edilir (ya da kayıtlar doğrudan trenle main'e girer); `DURUM.md` repo'da ya da proje dosyalarında durur.
3. Main'e hâlâ yalnız tren. Thread'ler PR'ı birleştirmez; PR açılacaksa yalnız inceleme için, ve `ci.yml`'den `pull_request` tetiği kalkar ki runner'ın trenle yarışmasın. Tren Remote Control ile senin bilgisayarında koşar.
4. Betikler: Windows yolları yalnız Windows'ta kullanılsın; Linux'ta `lock.mjs` ve `train.mjs` "bu makinede yerel veritabanı yok" deyip dursun; guard bulut thread'ini (dal `claude/*`) işçi saysın.
5. İşçi sınırı 1 ve "Project koordinatörü kayıtları yazar" kuralı proje hafızasına yazılsın.
6. §2.1 ve §2.10: bulut thread'i için dosya bağlantısı proje dosyaları kartıyla, komut Linux biçimiyle; Windows biçimi yalnız sana verilen komutlarda.

Elenenler:
- **Eski düzeni sürdür, Project'i yalnız sohbet için kullan.** Artısı: hiçbir kural değişmez. Eksisi: Project'in ana faydasını (paralel thread, otomatik devir) kullanmazsın; her iş yine bilgisayarına bağlı kalır.
- **Treni bırak, PR ve GitHub birleştirmesine geç.** Artısı: Project'in doğal yolu. Eksisi: CI zaten senin bilgisayarındaki runner'da ($0 limiti, KARARLAR §3.A.9); guard, main alarmı ve tren kurallarının hepsini yeniden yazmak gerekir. Bugün değmez.

Maliyet: hepsi ücretsiz; değişiklik birkaç küçük belge ve betik işi.
