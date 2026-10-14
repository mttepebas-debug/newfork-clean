import base64
d='/mnt/project-files/pages/gorsel-kararlar/gelen/jobs-cekmece-renk/'
V={'orijinal':('Original','Her şey beyaz; bölümleri yalnız ince çizgiler ayırıyor (arama kutusu düzeltilmiş hâliyle).'),
   'a':('A · Gri zemin, beyaz kartlar','Çekmece zemini sayfa grisi; Details ve Employees ayrı beyaz kartlar; seçili çalışan satırı açık yeşil.'),
   'b':('B · Bölüm şeritleri','Üst başlık, filtre alanı ve alt düğme şeridi açık gri; bölüm başlıkları küçük büyük harf; liste kenardan kenara; seçili satır açık yeşil.'),
   'c':('C · Çizgi ve gölge','Renk yok. Başlık ve alt düğme şeridi hafif gölgeyle ayrılır; bölüm başlıkları büyük; çerçeveler bir ton koyu; liste hafif gölgeli kart; seçili satırda solda yeşil çizgi, ad yeşil.'),
   'd':('D · Vurgu','Zemin beyaz kalır. Bölüm başlıkları yeşil küçük büyük harf, solunda yeşil çizgi; iki bölüm arasında ince gri boşluk; liste kenarsız; seçili kişinin harf dairesi yeşil dolu.'),
   'e':('E · Hafif ton','Çekmece içi çok açık gri; alanlar ve liste beyaz; seçili satır açık yeşil.')}
def img(p): return 'data:image/png;base64,'+base64.b64encode(open(d+p,'rb').read()).decode()
CSS='''<style>
:root{--bg:#f4f4f2;--fg:#1d2420;--mut:#5d6660;--line:#d9ddd8;--card:#fff}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;padding:16px}
h1{font-size:16px;margin:0 0 4px}p{color:var(--mut);margin:0 0 12px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:0 0 8px}
.g{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:16px;align-items:start}@media (max-width:700px){.g{grid-template-columns:1fr}}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;min-width:0}img{max-width:100%;display:block}
</style>'''
def head(t): return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+t+'</title>'+CSS+'</head><body>'
for k,(t,desc) in V.items():
    h=head('Jobs çekmecesi '+t)+f'''<h1>{t}</h1><p>{desc} Settings → Jobs → Bartender çekmecesi. Görüntüler main e0c18aae üzerinde; kod yok.</p>
<div class="g"><figure><h2>Masaüstü 1440</h2><img alt="{t}: masaüstü" src="{img(k+'-masaustu.png')}"></figure><figure><h2>Telefon 390</h2><img alt="{t}: telefon" src="{img(k+'-telefon.png')}"></figure></div></body></html>'''
    open(f'varyant/embed/jobs-renk/{k}.html','w').write(h)
h=head('Jobs arama kutusu')+'<h1>Arama kutusu: önce ve sonra</h1><p>İç içe çift çerçeve bir hataydı; düzeltmesini kabul ettin. Hangi renk seçilirse seçilsin bu düzeltme girer.</p><figure><img alt="Arama kutusu önce ve sonra" src="'+img("arama-kutusu-once-sonra.png")+'"></figure></body></html>'
open('varyant/embed/jobs-renk/arama.html','w').write(h)
p='parts-logic.js'; s=open(p).read()
rep=[('{ label: "B · Bölüm şeritleri", src: "embed/jobs-renk/b.html" }]','{ label: "B · Bölüm şeritleri", src: "embed/jobs-renk/b.html" }, { label: "C · Çizgi ve gölge", src: "embed/jobs-renk/c.html" }, { label: "D · Vurgu", src: "embed/jobs-renk/d.html" }, { label: "E · Hafif ton", src: "embed/jobs-renk/e.html" }, { label: "Arama kutusu (karara bağlandı)", src: "embed/jobs-renk/arama.html" }]'),
('seçili satır açık yeşil."]],\n        ["Ortak düzeltme"',
 'seçili satır açık yeşil."]],\n        ["İkinci tur (14 Ekim 12:13 AM)", ["Senin isteğin: renk değiştirmeden çizgi, gölge ve vurguyla ya da tasarım diline yakın bir renkle.", "C · Çizgi ve gölge: renk yok; başlık ve alttaki düğme şeridi hafif gölgeyle ayrılıyor; bölüm başlıkları büyük; çerçeveler bir ton koyu; liste hafif gölgeli kart; seçili satırda solda yeşil çizgi, ad yeşil.", "D · Vurgu: zemin beyaz; bölüm başlıkları yeşil, küçük büyük harfle, solunda yeşil çizgi; iki bölüm arasında ince gri boşluk; liste kenarsız; seçili kişinin harf dairesi yeşil dolu.", "E · Hafif ton: çekmecenin içi çok açık gri; alanlar ve liste beyaz; seçili satır açık yeşil."]],\n        ["Ortak düzeltme"'),
('["Ortak düzeltme", "Arama kutusundaki iç içe çift çerçeve bir hata; seçimden bağımsız olarak üçünde de düzeltildi."]','["Arama kutusu: karara bağlandı", "İç içe çift çerçeve bir hataydı; düzeltmesini kabul ettin. Hangi renk seçilirse seçilsin girer. Original görüntüler artık düzeltilmiş hâliyle."]'),
('asks: ["Original, A ya da B?"],\n      howto: "Üstteki düğmelerle Original, A ve B arasında geç; her birinde masaüstü ve telefon yan yana."',
 'asks: ["Original, A, B, C, D ya da E?"],\n      howto: "Üstteki düğmelerle Original ve A–E arasında geç; her birinde masaüstü ve telefon yan yana. Son düğme arama kutusunun önce ve sonra hâli."'),
('paneLabel: "Görüntüler, kod yok; her varyantta Bartender çekmecesi masaüstü 1440 ve telefon 390 yan yana"','paneLabel: "Görüntüler, kod yok; Original ve A–E, her birinde Bartender çekmecesi masaüstü 1440 ve telefon 390 yan yana"'),
]
for a,b in rep:
    assert s.count(a)==1, a[:60]; s=s.replace(a,b)
open(p,'w').write(s)
