---
name: durum
description: Mert dönünce koordinatörün raporu (CLAUDE.md §2). DURUM.md'yi dosya olarak gönderir, en çok 6 satırlık özet ve "senin yerine verdiğim kararlar"ı yazar, sonra SORULAR.md'deki soruları tek turda sorar ve cevapları KARARLAR.md'ye işler. Yalnız koordinatör çalıştırır.
---

# /durum — Mert'e dönüş

1. `/oto`'nun "Her tur" adımlarını bir kez koş, `DURUM.md`'yi güncelle, `SendUserFile` ile gönder.
2. Özet, en çok 6 satır: 🟢/🟠/🔴 · ne bitti (ekran adıyla) · ne seni bekliyor · sıradaki en önemli iş ve nedeni.
3. "Senin yerine verdiğim kararlar": `DURUM.md`'deki liste (karar · dayanak). Tek soru: ters çevirmek istediğin var mı?
4. Soru turu: `docs/plan/SORULAR.md`, dörder dörder (`AskUserQuestion`; önerilen ilk, `(Önerilen)`, açıklamanın son satırı `Dayanak: …`).
5. Cevaplar: ürün, ekran ya da süreç kuralı → `docs/plan/KARARLAR.md` (tarih, kaynak Mert, neden, reddedilen seçenek). Soru `SORULAR.md`'den silinir; bağlı iş "Sırada"ya döner. Ters çevrilen hakem kararı: madde düzeltilir, `DURUM.md` "Sağlık"ta ters çevirme sayısı artar.
6. Kayıtlar commit'lenir (dosyalar adıyla); bir sonraki trenle gider.
