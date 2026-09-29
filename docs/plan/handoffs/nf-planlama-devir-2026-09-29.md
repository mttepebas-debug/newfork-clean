# nf-planlama devri — 2026-09-29

Devreden: `Rol: nf-planlama` (`local_c67b8d60-e3f5-49aa-aba8-bb7860234876`), bağlam ~%68. Devralan: yeni `nf-planlama` oturumu. Koordinatör: "Koordinatör el değiştirmesi" (`local_243f826b-1906-491b-b1fc-1a1bdbb4316d`); kullanıcı PC başında değil, yönetim koordinatörde (KOORDİNATÖR DUYURUSU 2026-09-29).

## 1. Açık dal (main'e alınmadı)
- `task/backlog-program-planlama`, worktree `.claude/worktrees/infallible-poincare-15d4f4`, tabanı `origin/main` `3a31d625`. Commit'ler: `dbdf9664` → `66724abc` → `2da79800` (+ bu devir dosyası). **Dalın tamamı alınır; `66724abc` tek başına alınmaz** (o commit'te program dosyası betik hatasıyla boştu, `2da79800` onardı).
- Koordinatöre iki rapor gönderildi, ikisi de kullanıcı onayı beklerken süresi doldu, **ulaşmadı**. Bu dosya ve devir mesajı onların yerine geçer.
- Main'e alınınca: `git merge-base --is-ancestor <son sha> origin/main` ile doğrula, `git checkout --detach origin/main`, dalı sil.

## 2. BACKLOG-PROGRAM'ın durumu (`docs/plan/tasks/BACKLOG-PROGRAM.md`)
- 290 açık madde (286 + BL-332…335) 24 iş grubu + G0 kayıt bakımı + GK karar bekleyen + GF/GY/GS (programa girmez). Sayım betikle ve bir bölüm elle doğrulandı; tam dizin `docs/plan/research/backlog-index-2026-09-29.md`.
- Kural: **aynı anda tek grup**; test turu = art arda biten 1–2 grup. ILERLEME §9 buna göre.
- G1–G3 tazeliği BACKLOG.md'de (22 madde: 21 geçerli, BL-303 değişmiş). G4 ve sonrası her grup başlarken ölçülür.
- **Koordinatör kararı KK-1 (2026-09-29):** programda şu an tek iş Account yeniden tasarımı (`nf-arayuz`); backlog grupları o bitince başlar. **Etkisi:** G16 (giriş öncesi, hesap ve workspace ekranları) ile BL-335 (iki telefon alanı), BL-072 (iki avatar alanı), BL-149 (Workspaces listesi bayat), BL-287, BL-331 Account yeniden tasarımıyla çakışır; o iş bitince bu maddelerin tazeliği yeniden ölçülmeli (bir kısmı tasarımla kapanabilir). ILERLEME §9 ve program dosyası KK-1'i henüz yazmıyor: ilk iş bunu eklemek.

## 3. Bekleyen işler (sırayla)
1. **GK önerileri (koordinatör isteği a):** kullanıcı beklenmeyecek; her GK maddesi için vizyona (ROADMAP MVP, KARARLAR.md; çok kiracılı, çok lokasyonlu, çok rollü, çalışan birden çok lokasyonda, yönetici hem yönetir hem vardiya alır, farklı saat dilimleri) en uygun seçenek ve tek satır gerekçe. Program dosyasında her sorunun "(Önerilen)" seçeneği zaten var; eksik olan vizyon gerekçesi satırı. Koordinatör karara bağlayıp `docs/plan/KOORDINATOR-KARARLARI.md`'ye loglar. Başlangıç notları: BL-238 önerisi (a) her lokasyonun kendi saat dilimi (çok saat dilimli vizyon); BL-317 önerisi (a) owner listede görünür (owner da çalışan, KARARLAR); BL-330 önerisi (a) zamanlanmış dışa aktarmada notlar gitmesin (kişisel bilgi dışarı çıkmaz); BL-335 önerisi (a) tek telefon.
2. KK-1'i ILERLEME §9'a ve program dosyasının "İş sırası" başına yaz.
3. G0 kayıt bakımı (33 satır; docs, çakışmasız) — koordinatör isterse.
4. G4 başlarken tazeliğini ölç (G1–G3 hazır).

## 4. Açık sorular (koordinatörde)
- G1 ve G14, stil B oturumunun (`task/schedule-dialog-mockups`) pencereleriyle aynı dosyalarda: sıra.
- G7 (yetki ailesi A) park edilen FB-6.2 ile büyük örtüşme: ayrı mı, FB-6.2.1 açılışına mı bağlı.

## 5. Dersler (bu oturum; ayrıntı `~/.claude/OBSERVATIONS.md`)
- Dosya yazan betik: önce oku ve kodla, uzunluğu `assert` et, sonra yaz. Aynı gün iki kez dosya yarıda kaldı (BACKLOG.md 464 satır, program dosyası); ikisi de gönderilmeden yakalandı. Yeni dosyalar `git diff --stat`'ta görünmez: commit sonrası içeriği Python ile say.
- Karar satırına yalnız kullanıcının kendi cümlesi; aktarımın özeti ayrı satırda "koordinatörün özeti".
- Büyük backlog'u tam okuma: özet dizin (betik) + ağır ölçümü salt okur alt ajanlara ver; bağlam korunur.
- Bu makinede GateGuard kancası her yeni dosya için "bilgi ver" istiyor ve `--amend`'i reddediyor → onarımı yeni commit'le yap.
