p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
a = '''      text: "Tabloda üç tür var: Pickup (Maria'nın herkese bıraktığı vardiyayı isteyenler var), Cover (Maria'nın sorduğu kişilerden kabul edenler var) ve Swap. Satıra basınca çekmece sağdan açılır; telefonda alttan.",
      list: ["Çalışan tarafında adlar değişmez: Maria \\"Release shift\\" ya da \\"Ask for cover\\" seçer.", "Müdüre ilk isteyende bir bildirim; sonra 12 saatte bir hatırlatma ve kapanmadan 4 saat önce son uyarı."],
      basis: "Kararlar 04:01, 05:03, 05:39, 06:43, 12:57, Mert 13:52" },'''
b = '''      text: "Her satır türün ikonuyla başlar (Pickup el, Cover yerine geçen kişi, Swap iki ok). Sonra vardiyayı alacak kişinin adıyla başlayan bir cümle: kim, kimin vardiyası, saat, iş, lokasyon, gün. Altında karar son saati: vardiyanın başlamasından 4 saat önce. Satıra basınca çekmece sağdan açılır; telefonda alttan.",
      list: ["Telefonda cümle kısa (kim, kimin vardiyası); gün, saat ve lokasyon altında ayrı satırda; en altta durum ve son saat.", "Swap'ta iki satır: kim hangi günün vardiyasını alıyor, hangi lokasyonda. Son saat erken vardiyaya göre.", "Karar verilince cümle değişir: \\"Jake Miller picked up…\\", \\"Declined by you just now. Maria keeps the shift.\\"", "Müdüre ilk isteyende bir bildirim; sonra 12 saatte bir hatırlatma ve kapanmadan 4 saat önce son uyarı."],
      basis: "Kararlar 04:01, 05:03, 05:39, 06:43, 12:57, Mert 13:52; Mert 2026-10-14 00:28, 00:30" },'''
assert s.count(a) == 1, s.count(a)
s = s.replace(a, b)
open(p, "w", encoding="utf-8").write(s)
print("ok")
