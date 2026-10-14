# Erişim yok ekranları (Artifact)

Link: https://claude.ai/artifact/Xr1CkDfyGejXq74pWdmnCW
Yapıldığı main: 28aeb82b (2026-10-14; erişim standardı, C · Odak kartı). Kuran thread: "Erişim yok hatası ekranları".

- `erisim-yok.html`: menü sayfası (kaynak bandı ekli). Dört grup: sayfanın yerine kart (sunucu "hayır" der), adresi yazınca (izni hiç yok, aynı adreste kart), satır içi uyarı, kodda var ekranda çıkmıyor. Kart varyantı düğmeleri kaldırıldı; C artık uygulamanın kendisi.
- Yayında yanına PAGES'in `app.html` / `app-schedule.html` derlemeleri eklenir; JS'leri `split.py` ile `app.js` / `app-schedule.js` dosyalarına ayrılır.
- `yeni-senaryolar.json`: eskiden yalnız bu sayfanın derlemesine eklenen 10 erişim-yok senaryosu. Artık PAGES kaynağında: `_kaynak/tools/sc/45-erisim-yok.py`.
- Yenilemek: `_kaynak`'ı `apps/web/.temp/pages`'e kopyala, `PAGES_NO_MANIFEST=1 PAGES_OUT=<geçici> node .temp/pages/tools/build-pages.mjs 2.0 3.0` (apps/web'den), iki dosyayı `split.py` ile ayır, aynı linke yayınla.
