# Bekleyen görsel kararlar (2026-10-11, /oto thread'i)

Artifact: https://claude.ai/artifact/JqDJXpTnExgEuNnjhxpimG (klasör: ortak). Sürüm 4'ten beri ekran sekmeli (Mert 2026-10-11 20:15Z: bütün bekleyen görsel kararlar bu sayfada, her ekran bir sekme; yeni görsel karar çıktıkça buraya eklenir).

## Dosyalar
- `gorsel-kararlar.html`: yayınlanan kabuk (bantlı). `kaynak/` altındaki üç parçadan kurulur: `parts-head.html` (stil, gövde, soru şablonları) + `parts-live.js` (canlı maddelerin varyant CSS'i ve ITEMS) + `parts-logic.js` (sekmeler, gömülü sayfalar, TODO ve "Sayfada olmayanlar" listeleri, çizim kodu). Kurma: head + `<script>\n(function () {\n` + live + logic + bant bloğu.
- Canlı maddeler (bugünkü main): PAGES'in `app.html` ve `app-schedule.html` kopyası, içine `inject.js` (`python3 mkapps.py <klasör>`).
- Gömülü eski sayfalar (`embed/...`, yayında duruyor, burada kopyası yok, büyük): Artifact tool `read` + `paths` ile bu artifact'tan indirilir. Kaynakları: atanmamis = PeCwcUC922XVirLhgBYfBr; schedule/{ust-cubuk,pencereler,test} = RNJEGWCDgdG2NpYRpWF4g3 `pages/*.html`; jobs = BUJShpW3rXDGFVNyEygDZr; general = Kwz63F5JeddW5S7y2kSsAi; bildirim = M8yVRt1fWEY8Sg24ze8Wmv; eski/requests-g3 = E6DvBpyyt8rZeDv7opzj1j; eski/republish = 6YJ3MmXnmAJMY7JYGboWj6 (ikisi aynı `today/index.html`'i paylaşır); bl-1024 = `gelen/bl-1024-requests/`. Gömerken `kaynak/strip.py` iç sayfanın bandını siler.
- `gelen/<iş>/`: öteki thread'lerin koordinatör üzerinden gönderdiği varyantlar.

## Yeni madde eklemek
1. Gelen sayfayı `embed/<ad>/` olarak kopyala (`strip.py`), `parts-logic.js`'te EMBEDS'e bir satır ekle (tab, code, facts, asks, src, orig).
2. Kabuğu kur, `python3 /mnt/project-files/pages/kaynak-bandi/bant.py gorsel-kararlar.html JqDJXpTnExgEuNnjhxpimG`, aynı dosya yoluyla ya da `url` ile yayınla; yalnız yeni dosyaları `files`'a koy (yayındakiler kalır). Tek yayın en çok 64 MB.
3. Mert'in cevabı başka thread'in maddesiyse koordinatöre ilet.
