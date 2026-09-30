---
name: kayit-oturumu-yontem
description: Kayıt oturumu (KARARLAR OPS-04) nasıl çalışır; backlog sayımı ve mutabakat yöntemi, program grubu kontrolü, docs-only gönderimde tuzaklar
metadata:
  type: project
---

2026-09-30'dan beri ilerleme kayıtlarını kalıcı bir rol oturumu tutuyor (KARARLAR OPS-04). Güncel pano
`docs/plan/ILERLEME-PLANI.md` §0 (0a durum, 0b açık işler, 0c kullanıcıda bekleyenler); iş sırası
`tasks/BACKLOG-PROGRAM.md`'den. Koordinatör "BESLEME" gönderir, kayıt oturumu ölçer, yazar, docs-only gönderir.

**Backlog sayımı (betikle, elle değil):** `BACKLOG.md`'de `## Kapanan maddeler` başlığının üstünde `- ` ile
başlayan üst düzey satırlar açık, altındakiler kapanandır. Üç ayrı kontrol birbirini tutmalı:
1. satır sayımı (numaralı `^- \*{0,2}BL-\d+` + numarasız);
2. `BACKLOG-PROGRAM.md` Notes zinciri ("açık madde X → Y");
3. `git show <sha>:docs/plan/BACKLOG.md` ile eski commit'lerde aynı sayım.
Numara mutabakatı: en yüksek BL = açık + kapanan + dosyada satırı olmayan numaralar.

**Grup kontrolü:** her açık madde program tablosunda tam bir grupta olmalı. Tablonun "Maddeler" sütununda
parantez içleri kapananlardır; parantezler (iç içe dahil) atılıp kalan `BL-\d+` ve `U\d\d` açık maddelerle
karşılaştırılır. Numarasız maddeler `U01…U66` takma adlarıyla eşlenir (dosyanın sonundaki ek tablo, metnin başı).
2026-09-30'da sayı doğruydu, fark buradaydı: yeni açılan altı madde hiçbir gruba yazılmamıştı.

**Why:** "sayım uyuşmuyor" notu günlerce durdu; sayının kendisi değil gruplama ve Notes zinciri eksikti.
Hangisinin eksik olduğunu yalnız üç kontrol birlikte gösteriyor.

**How to apply:**
- Yeni madde yazılırken grubu da yazılır (madde satırında "Program: Gxx" ve program tablosunda).
- Docs dosyaları çalışma kopyasında CRLF; betikle düzenlerken `newline=""` ile oku, aynı satır sonuyla yaz.
  `sed -i` dosyayı LF'ye çevirir (git normalleştirir, ama diff uyarısı verir).
- Rol hafızası `docs/` dışında: docs-only gönderimle main'e gidemez. Ayrı yerel dala commit edilir
  (`keep/nf-planlama-memory`), sha koordinatöre söylenir.
- İşaretlemede tahmin yok: madde, altındaki tazelik satırları, MVP-PLAN fazı ve ROADMAP okunur; yetmiyorsa
  işaret "belirsiz" yazılır ve nedeni maddenin altına konur.
- Başka bir ajanın aynı anda ölçtüğü grubun madde satırlarına dokunulmaz (2026-09-30, G14).
