# Newfork motion hero (15 sn)

Web sitesinin ilk ekranı için 15 saniyelik hareketli tanıtım. Bağımlılık yok: `index.html`,
`hero.css`, `hero.js`. Uygulamaya (`apps/web`) bağlı değil; site hangi teknolojiyle yapılırsa
yapılsın üç dosya olarak gömülür.

Önizleme: `index.html`'i tarayıcıda açın (ya da `npx serve marketing/motion-hero`).

## Sahneler

| Süre | Bölüm | Ne oluyor |
|---|---|---|
| 0–2,2 sn | Ignite | Parçacıklar birleşir, N logosu çizilir, "newfork" yazısı yükselir; kamera logonun içinden geçer |
| 2,2–3,9 | Chaos | Dağınık vardiya kartları ve "Who can cover Friday??", "schedule_v12_FINAL(3).xlsx" gibi etiketler; etiketlerin üstü çizilir |
| 3,9–5,2 | Order | Kartlar yay etkisiyle haftalık tabloya oturur; ışık süzülür |
| 5,2–9,1 | Detect | Koyu ekran açık temaya açılır; tablo katmanlarına ayrılır (tablo, müsaitlik, izin, vardiyalar); açık vardiya Maria'nın izinli gününe sürüklenir, reddedilir, Sam'e atanır |
| 9,1–11 | Deliver | Vardiya Sam'in telefonuna uçar; bildirimler düşer; üç lokasyon telefona bağlanır |
| 11–12,9 | Publish | Siyah Publish düğmesine tıklanır; yeşil yayın dalgası tüm kartlara yayılır; sayaçlar |
| 12,9–15 | Resolve | Tablo sağa çekilir, başlık ve düğmeler gelir; sonra hafif bir boşta hareketi sürer |

## Gömme

```html
<link rel="stylesheet" href="hero.css" />
<section class="nfh" data-newfork-hero>
  <div class="nfh-copy">…başlık, metin, düğmeler (index.html'deki gibi)…</div>
</section>
<script src="hero.js"></script>
```

- `data-loop` eklenirse tanıtım sürekli döner (showreel modu); yoksa bir kez oynar ve son karede durur.
- `data-nfh-reveal` taşıyan öğeler 13. saniyeden sonra sırayla görünür (`="mask"` alttan maskeyle).
- `data-nfh-replay` taşıyan bağlantı tanıtımı baştan oynatır.
- JS API: `NewforkHero.mount(el)` → `{ play, pause, seek(t), time, duration }`.

## Davranış

- Tek zaman çizelgesi: her kare yalnız zamandan hesaplanır; bu yüzden çubukta ileri geri sarılabilir
  (fare, dokunma ya da ok tuşları; boşluk tuşu oynat/durdur).
- `prefers-reduced-motion` açıksa animasyon oynamaz, son kare gösterilir.
- Sekme gizliyse ya da bölüm ekranda değilse çizim durur.
- Klavyeyle başlık/düğme alanına gelen kullanıcı beklemez; tanıtım son kareye atlar.
- 900 px altında animasyon üstte (4:3), metin altta.

Renkler uygulamanın açık tema değerlerinden (`apps/web/src/styles.css`): accent `#176954`,
yayın yeşili `#087f5b`, izin kırmızısı `#d4162a`, müsaitlik turuncusu `#d9730d`.
