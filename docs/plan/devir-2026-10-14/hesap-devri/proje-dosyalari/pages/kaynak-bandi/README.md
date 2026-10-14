# Artifact dizini ve kaynak bandı (2026-10-10)

Mert'in isteği (2026-10-10 06:37Z): Artifact'ları gösterdikleri uygulama sayfasına göre klasörlere ayırmak ve her birinde "Code'dan mı kurtarıldı, Project'te mi sıfırdan yazıldı" ipucu bırakmak.

- Dizin sayfası: https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471 (kaynak `dizin.html`, üreten `dizin.py`).
- Veri: `artifactlar.json` (klasörler, etiketler, her Artifact'ın klasörü, kaynağı ve notu). Yeni Artifact yayınlayan thread buraya bir satır ekler, sonra `python3 dizin.py <çıktı>` ile dizini üretip aynı bağlantıya yayınlar.
- Kaynak bandı: her sayfanın en üstünde ince bir şerit (etiket, tek cümle, klasör, dizine bağlantı, gizleme düğmesi). Bant sayfanın kaynak dosyasında değil, yayındaki dosyaya eklendi. **Bir sayfayı kendi kaynağından yeniden yayınlayan thread, yayından hemen önce `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <sayfa.html> <artifact-id>` koşsun; yoksa bant kaybolur.** Betik bandı her seferinde yeniler, iki kez koşmak zarar vermez.
- Bant konmayanlar: Pre-business & Settings (Design tuvali) ve Newfork tasarım sistemi (ikisi de tür sayfası; içine HTML eklenemiyor) ve dizin sayfasının kendisi.
- Dosyalar fiziksel olarak taşınmadı: README'ler, thread talimatları ve hafıza bu yolları kullanıyor; taşımak onları kırardı. Klasör yapısı dizin sayfasında ve `artifactlar.json`'da.
- Etiket dayanağı: `backup/tasarim-kaynaklari` dalı `kaynak/newfork-pages/pages.json` (bu hesapta Code'da yapılan 13 sayfa), `../LISTE.md` (diğer hesaptan taşınan 14 sayfa), Project thread kayıtları. Diğer hesaptan gelenlerin Code'da yapıldığı çıkarımdır (o hesap Claude Code ile kullanılıyordu); Design tuvali, tasarım sistemi ve Motion Hero için araç belli değil, "Kaynak belirsiz".

## Yeni sayfa eklemek (her thread kendisi yapar)
1. Kaydet: `python3 /mnt/project-files/pages/kaynak-bandi/kayit.py <artifact-id> "<ad>" <klasör-id> <kaynak> ["<not>"]`. Klasör listesi: `python3 kayit.py --list`. Kaynak: `project`, `code-bu`, `code-diger` ya da `belirsiz`. Betik `artifactlar.json`'a yazar ve `dizin.html`'i yeniden üretir.
2. Bant: `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <sayfa.html> <artifact-id>`, sonra sayfayı kendi url'sine yayınla.
3. Dizin: `dizin.html`'i https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471 adresine yayınla (aynı url).
Eski tasarım dallarının inceleme sayfaları `dal-inceleme` klasörüne girer.
