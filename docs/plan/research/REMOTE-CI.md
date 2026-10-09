# Ağır koşuları Mert'in bilgisayarından çıkarmak (REMOTE-CI)

Araştırma 2026-10-06 (~14:00Z), `nf-planlama`, koordinatörün görevi. Neden: 2026-10-06 ~13:40Z bilgisayar aşırı yükten kapandı; Mert ağır koşuların (CI, e2e, `test:db`) artık kendi bilgisayarında koşmamasını istiyor. Bugün CI üç self-hosted runner'la bu bilgisayarda (KARARLAR OPS-01; GitHub Actions harcama limiti $0).

## 1. Bizim kullanımımız (ölçüm)
- **Koşu sayısı** (`gh run list --created ">=2026-09-29"`, 2026-10-06): 8 günde 179 koşu (main 97, dal 82). Gün gün: 09-29 88, 09-30 29, 10-01 22, 10-02…10-05 3–4, 10-06 27. Yoğun günde ~25, sakin günde ~4.
- **Koşu başına süre:** bugünkü main koşusu 37423285727 bu bilgisayarda check 4 dk, db 4 dk, e2e 8 dk, db-budget 1 dk (işler ayrı faturalanır, her biri yukarı yuvarlanır → ~21 dk). GitHub'ın 2 çekirdekli makinesi daha yavaş ve Supabase imajlarını her koşuda indirir: **koşu başına ~30–40 dk tahmin** (ölçülmedi; ilk koşuda ölçülür).

## 2. Seçenekler

| | Ne | Aylık maliyet (tahmin) | Bilgisayardan çıkar mı | P06 ile |
|---|---|---|---|---|
| **(a) GitHub'ın makineleri** | `runs-on: ubuntu-latest`; aynı iş akışı, runner satırı değişir (ci.yml'de yorumu hazır) | Ücretsiz 2.000 dk/ay + Linux 2 çekirdek **$0.006/dk**. Yoğun hız (~25 koşu/gün × 35 dk): **~$145/ay**. Son 8 günün ortalaması (~22/gün): **~$129/ay**. Yalnız main koşarsa (~12/gün): **~$64/ay**. Sakin hafta (~4/gün): **~$13/ay** | Evet, tamamen | Hesap var (GitHub), ama harcama limitini $0'dan açmak ücretli kullanım demek → **çelişir** |
| **(b) Bulutta kendi runner'ımız (VM)** | Hetzner gibi bir VM'e Docker + GitHub runner kurulur; Supabase yığını orada | Hetzner CX33 (4 vCPU, 8 GB) **€6.49/ay + IPv4 €0.50 ≈ $8/ay**; CPX32 (4 vCPU, 8 GB, daha hızlı) **€10.99/ay ≈ $12/ay** (ikincil kaynak, aşağıda). 8 GB ancak **tek iş sırayla** yeter (her işin kendi Supabase'i ~2–3 GB); üç iş paralel için 16 GB katmanı (~iki katı, doğrulanmadı). DigitalOcean 8 GB: $63/ay (sayfası) | Evet | **Yeni ücretli hesap → çelişir** |
| **(c) Claude Code bulut oturumları** | Ağır koşuyu bulutta bir Claude oturumunda çalıştırmak | Claude kullanımına dahil | Kısmen | Ücret yok, ama **uygun değil**: bulut ortamında Docker hazır gelmiyor, kısıtlı kurulumla çalıştırılabiliyor (ağ köprüsü yok, iptables yok); Supabase yerel yığını ~25 konteyner. CI'ın yerini tutmaz |
| **(d) Repoyu public yapmak** (yalnız bilgi) | Public repoda GitHub'ın standart makineleri ücretsiz ve sınırsız | $0 | Evet | Ücretsiz, ama **önerilmez**: ürünün bütün kodu, migration'ları ve plan belgeleri herkese açılır |

**Ücretsiz katmanla karışık yol (a'nın $0'lık hâli):** harcama limiti $0 kalırsa ayda 2.000 dakika = ~60 koşu (~2/gün); dakika bitince koşular bloklanır ("usage is blocked once you use up your quota"). Yalnız hafif `check` işi GitHub'a taşınırsa (~5 dk × ~22 koşu/gün ≈ 3.300 dk/ay) yine 2.000'i aşar. **Ücretsiz katman bugünkü hızı taşımaz.**

**Self-hosted runner ücreti:** GitHub'ın 2026-03-01'de başlatacağı self-hosted dakika ücreti ($0.002/dk) Aralık 2025'te süresiz ertelendi; bugün self-hosted ücretsiz (b seçeneği GitHub tarafında ek ücret getirmez).

## 3. P06 ile çelişki
ILKELER P06: "Lansman öncesi yeni ücretli hesap açılmaz"; ücretsiz yol önce gelir.
- (b) yeni ücretli hesap açar → doğrudan çelişir.
- (a) hesap açmaz ama ücretli kullanımı açar (harcama limiti, KARARLAR OPS-01 $0) → ruhuyla çelişir.
- Ücretsiz kalan yollar: (c) uygun değil, (d) önerilmez, $0'lık (a) hızı taşımaz.
- Sonuç: bilgisayarı tamamen rahatlatmanın ücretsiz ve güvenli bir yolu yok; karar Mert'in (P06'ya istisna ya da bugünkü düzen + "tek ağır iş" kuralı).

## 4. Mert'e soru (sabah; CLAUDE.md §13)
**Ağır testler (CI) nerede koşsun?**
- **Bugün:** her kod gönderiminde CI senin bilgisayarında üç kopyayla koşuyor; bugün aşırı yükten kapandı. Kural artık "aynı anda tek ağır iş".
- **Örnek:** bir günde 25 gönderim → bilgisayarda 25 × ~20 dk test.
- Seçenekler:
  - **(a) Bulutta küçük bir sunucu (Hetzner, ~$8–12/ay) runner olur; bilgisayarın tamamen boşalır, kod gizli kalır. Kurulumu Claude yapar, hesabı sen açarsın. (Önerilen)**
    `Dayanak: yok — yeni karar (ILKELER P06'ya istisna; en ucuz ücretli yol, aylık sabit ve tahmin edilebilir)`
  - (b) GitHub'ın makineleri: kurulum yok, ama kullanıma göre ~$13–145/ay (yoğun haftada pahalı).
  - (c) Bugünkü gibi bilgisayarında, "tek ağır iş" kuralıyla ($0; daha yavaş, aynı anda tek test).
  - Kaçış: "Önce sohbette konuşalım".

## Kaynaklar (2026-10-06)
- GitHub runner fiyatı: https://docs.github.com/en/billing/reference/actions-runner-pricing (Linux 2 çekirdek $0.006/dk, 4 çekirdek $0.012, 8 çekirdek $0.022).
- GitHub Free ücretsiz dakika ve $0 limitte blok: https://docs.github.com/en/billing/concepts/product-billing/github-actions (2.000 dk, 500 MB).
- 2026 fiyat düşüşü ve self-hosted ücretinin ertelenmesi: https://theplatformengineering.substack.com/p/github-actions-2026-pricing-changes, https://heise.de/-11118027.
- Hetzner (ikincil kaynak; hesap açmadan önce hetzner.com/cloud tablosundan doğrulanır): https://www.bitdoze.com/md/hetzner-cloud-cost-optimized-plans.md (CX33 €6.49), https://www.whtop.com/amp/plans/hetzner.com/144096 (CPX32 €10.99); 2026 fiyat artışı notu: https://findstack.com/resources/hetzner-price-increase-2026. Hetzner'in ABD bölgeleri: Virginia, Oregon (hetzner.com/cloud).
- DigitalOcean: https://www.digitalocean.com/pricing/droplets (8 GB General Purpose $63/ay).
- Claude Code bulutta Docker: https://claudeissues.com/issue/29515-feature-docker-support-in-claude-code-web-environment.
