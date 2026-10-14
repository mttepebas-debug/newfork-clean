import base64
d='/mnt/project-files/pages/gorsel-kararlar/gelen/tek-cumle-uyarilar/'
V={'orig':('Original','Bugün tek gri cümle, sayfanın ya da çekmecenin ortasında.'),
   'a':('A · Aynı aile','Erişim kartı C\'nin akrabası: ortalı kart, yeşil tonlu daire içinde simge, başlık, kısa açıklama, yeşil tam genişlik düğme.'),
   'b':('B · Sade boş durum','Kart gölgesi yok, açık gri zemin üzerinde simge, başlık, açıklama ve beyaz küçük düğme.'),
   'c':('C · Bilgi şeridi','İçeriğin tepesinde tek şerit: solda simge, başlık ve açıklama; altında beyaz düğme.')}
P=[('desk','Schedule telefonda açılınca'),('req','Requests: artık olmayan talep'),('docd','Documents: belge ayrıntısı açılamıyor'),('role','Settings → Roles: olmayan rol')]
def img(p): return 'data:image/png;base64,'+base64.b64encode(open(d+p,'rb').read()).decode()
CSS='''<style>
:root{--bg:#f4f4f2;--fg:#1d2420;--mut:#5d6660;--line:#d9ddd8;--card:#fff}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;padding:16px}
h1{font-size:16px;margin:0 0 4px}p{color:var(--mut);margin:0 0 12px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:20px 0 8px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}img{max-width:100%;display:block}
</style>'''
for k,(t,desc) in V.items():
    h='<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tek cümlelik uyarılar '+t+'</title>'+CSS+'</head><body>'
    h+=f'<h1>{t}</h1><p>{desc} 17 yerden dördü; her görüntüde solda masaüstü 1280, sağda telefon 390. Bütün yerler canlı sayfada.</p>'
    for pk,pt in P:
        h+=f'<h2>{pt}</h2><figure><img alt="{t}: {pt}" src="{img("v-"+pk+"-"+k+".png")}"></figure>'
    open(f'varyant/embed/tek-cumle/{k}.html','w').write(h+'</body></html>')
p='parts-logic.js'; s=open(p).read()
anchor='''    {
      tab: "requests", code: "R1", bl: "BL-1024",'''
assert s.count(anchor)==1
item=r'''    {
      tab: "ortak", code: "O2", proto: true, bl: "Erişim yok hatası ekranları thread'i", title: "Tek cümlelik uyarılar: sayfanın yerine geçen tek cümle", where: "17 yer: Schedule telefonda, Requests ve Shift Hub'da olmayan talep, olmayan vardiya ve duyuru, Documents, Availability, Settings (General, Roles, Jobs, şablon) · masaüstü ve telefon",
      mode: "page", pages: [{ label: "Original", src: "embed/tek-cumle/orig.html" }, { label: "A · Aynı aile", src: "embed/tek-cumle/a.html" }, { label: "B · Sade boş durum", src: "embed/tek-cumle/b.html" }, { label: "C · Bilgi şeridi", src: "embed/tek-cumle/c.html" }],
      orig: "https://claude.ai/artifact/7pQDWftLVrPVLGuxVRLuMV", origName: "Tek cümlelik uyarılar: 17 yerin hepsi (canlı sayfa)",
      paneLabel: "Görüntüler, kod yok; 17 yerden dördü (Schedule telefonda, olmayan talep, belge ayrıntısı, olmayan rol), her birinde masaüstü ve telefon yan yana. Bütün yerler için yukarıdaki canlı sayfayı aç",
      facts: [
        ["Ne", "14 Ekim 11:33 PM'de istedin: \"Schedule is available on a computer.\" gibi bir sayfanın, çekmecenin ya da pencerenin yerine geçen tek cümlelik uyarılar düzgün bir görünüme kavuşsun, telefonda da. 17 yer bulundu; bugün 9 ayrı görünümleri var."],
        ["Varyantlar", ["Original: tek gri cümle, ortada; düğme yok.", "A · Aynı aile: erişim kartının C'sine (Odak kartı) akraba; ortalı kart, yeşil tonlu daire içinde simge, başlık, kısa açıklama, yeşil tam genişlik düğme (örnek: \"Schedule opens on a computer\" ve Open Lineup).", "B · Sade boş durum: gölgesiz, açık gri zeminde simge, başlık, açıklama ve beyaz küçük düğme.", "C · Bilgi şeridi: içeriğin tepesinde tek şerit; solda simge, başlık ve açıklama, altında beyaz düğme."]],
        ["Üçünde aynı", "Metinler aynı. Olmayan kayıt ile yetki dışı kayıt aynı cümleyi alıyor (\"isn't available\"). Yükleme hatası olan iki yer (Employee Hub'daki Schedule, Shift Hub) zaten seçilmiş \"We couldn't load\" kartına gidiyor."],
        ["Bağlantı", "Birden çok ekran sekmesindeki \"Erişim yok kartı\" maddesiyle aynı aileden; orada C seçilirse A en uyumlu olanı."],
        ["Kim", "Owner, admin, manager ve çalışan; masaüstü ve telefon."],
        ["Sahibi", "\"Erişim yok hatası ekranları\" thread'i. Shift Hub ekranları Takas thread'inin, Jobs uyarısı Jobs thread'inin; ikisi de bu seçimi bekliyor."]
      ],
      asks: ["Original, A, B ya da C?"],
      howto: "Üstteki düğmelerle Original, A, B ve C arasında geç; her birinde aynı dört yer. 17 yerin hepsini canlı sayfada gör."
    },
'''
s=s.replace(anchor,item+anchor); open(p,'w').write(s)
