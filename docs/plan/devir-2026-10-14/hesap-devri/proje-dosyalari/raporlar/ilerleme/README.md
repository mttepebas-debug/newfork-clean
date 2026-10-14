# İlerleme raporu sayfası — nasıl güncellenir

Mert, 2026-10-09 06:16Z (sayfaya yorum): "Biz ilerledikçe bu artifact'ı güncelle. İlerlememizi buradan takip etmek istiyorum. Bitenleri silme ya üstünü çiz ya check mark at. Ayrıca ayrı bir sayfa olarak backlog'ları da listele. Severity risk importance işaretleri koy, ona göre sıralandır, gruplandır."

- Sayfa: https://claude.ai/artifact/9BSKy2UUQvqQVtEnyUTKzX (Mert'in hesabı)
- `index.html` — ilerleme raporu (elle güncellenir)
- `backlog.html` — backlog sayfası (üretilir; elle düzenlenmez)
- `build_backlog.py` + `backlog.template.html` — backlog sayfasını `BACKLOG.md`'den üretir

## Ne zaman
Her kilometre taşında: tren main'e inince, bir canlı adım bitince, bir ekran maddesi kapanınca ya da Mert bir karar verince.

## Nasıl
1. `index.html`:
   - Başlıktaki "Son güncelleme" saatini ve main sha'sını yenile.
   - Biten işi **silme**: `<li class="done"><span class="chk">✓</span>…` (takip listesi) ya da `<tr class="done">…` (tablo) yap. Süren iş `◐` (`class="wip"`), sıradaki `○` (`class="todo"`).
   - "Kısaca", ekran tablosu sayıları (EKRAN.md kabul listelerinden) ve karar sayısı (DURUM.md "Seni bekleyen").
2. Backlog'u yeniden üret:
   ```
   git -C <repo> fetch origin main
   git -C <repo> show origin/main:docs/plan/BACKLOG.md > /tmp/bl.md
   python3 build_backlog.py /tmp/bl.md backlog.html "main <kısa sha>"
   ```
   Çıktıdaki açık/kapalı sayısını `index.html` "Backlog" bölümüne yaz.
3. Yayın (aynı bağlantı): Artifact aracı, `url` = yukarıdaki bağlantı, `file_path` = `index.html`, `files` = `{"backlog.html": "backlog.html"}`. Başka bir oturumdan yayınlamadan önce sayfayı `action: "read"` ile oku.
