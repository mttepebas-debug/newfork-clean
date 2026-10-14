# Gece işi: tasarım sayfalarını güncel hâle getirme (2026-10-09, /oto thread'i)

Mert'in isteği (2026-10-09 10:29Z): Code oturumlarından çıkan bilgilere göre Artifact'ları güncelle.
- Karara varılmışsa: sayfadaki bütün varyantları sil, yalnız en güncel (seçilen) hâli bırak. Böylece her sayfanın güncel görüntüsü ve işleyişi Artifact olarak elde olur.
- Karara varılmamışsa: güncel hâl (Original, bugünkü uygulama) + varyantlar + her maddede durum etiketi: "Karar verildi", "Yarı karar (şu kısmı bekliyor)", "Karar bekliyor".

## Kurallar
1. Karar kaynağı (bu sırayla güven): Mert'in en yeni açık sözü (oturum özetlerinde zaman damgalı) > repo `docs/plan/KARARLAR.md` (main; `/home/claude/newfork-clean/docs/plan/KARARLAR.md` ya da `git show origin/main:docs/plan/KARARLAR.md`) > sayfanın kendi KARARLAR-NOTU.md / README.md'si > denetim notları.
2. Kaynaklar (yeniden tarama yapma; bunlar hazır):
   - `/mnt/project-files/notes/sayfa-kayip-denetimi.md` (ekran ekran, "Mert'in payı" sütunu)
   - `/mnt/project-files/notes/oturum-ozetleri/*.md` (ekran oturum özetleri), `/mnt/project-files/notes/schedule-kayip-ozellikler.md`
   - `/mnt/project-files/pages/LISTE.md` (sayfa listesi, Mert'in seçimi sütunu)
   - Ham oturum özetleri: `git -C /home/claude/newfork-clean show origin/backup/oturum-ozetleri:docs/oturumlar/oturumlar/<NNN-id8>.md`; bir sayfanın konuşulduğu oturumu bulmak için: `git -C /home/claude/newfork-clean grep -l <artifact-id> origin/backup/oturum-ozetleri -- docs/oturumlar/oturumlar/`
   - Eski tasarım kaynak dosyaları: `git -C /home/claude/newfork-clean show origin/backup/tasarim-kaynaklari:kaynak/newfork-pages/<dosya>` ve `kaynak/newfork-clean-artifacts/<ekran>/`
3. Sayfanın bugünkü yayınlı hâlini Artifact aracının `read` eylemiyle oku (url ile); dönen kayıtlı HTML dosyasından çalış. Başka hesabın sayfasını açma (izin istemi çıkar); bu listedeki bağlantıların hepsi bu hesaptadır.
4. Yeni HTML'i `/mnt/project-files/pages/guncel/<kisa-ad>.html` (çok dosyalıysa `/mnt/project-files/pages/guncel/<kisa-ad>/`) olarak yaz. Başka thread'in klasöründeki dosyayı (ör. `pages/schedule-*`) değiştirme; kopyala, kopyada çalış.
5. Yayın: Artifact `publish` ile AYNI url'ye yeni sürüm (url parametresi). Yayın aracı /mnt/project-files dosyasını reddederse dosyayı önce scratchpad'e kopyala ve oradan yayınla. Bir yayın izin istemine takılırsa bekleme: o sayfayı "yayınlanamadı" diye raporla, sıradakine geç.
6. Karara varılmış sayfa: başlık `✅ Done · <eski başlık>`; sayfanın en üstünde kısa bir şerit: "Karar: <ne> (Mert, <tarih>, <kaynak>). Uygulamada: koda girdi / henüz koda girmedi (<dal ya da BL>)". Kalan tek hâl tam çalışır kalsın (tıklama, çekmece, efekt varsa). Seçilen hâl zaten "Orijinal · bugünkü uygulama" ise yalnız Orijinal kalır.
7. Kararsız ya da yarı kararlı sayfa: ilk seçenek "Original" (bugünkü uygulama) kalır; her madde/varyant grubunda durum etiketi; reddedilen varyantlar silinir (Mert reddettiyse artık seçenek değildir), açık olanlar kalır. En üstte bekleyen soruların tek satırlık listesi.
8. Sayfada yeni kişi adları uydurma; demo veri ABD İngilizcesi. Ekran metni İngilizce, açıklamalar Türkçe ve sade.
9. Artifact sayfası kuralları: yazmadan önce `artifact-design` skill'ini yükle. Sayfa telefonda (390 px) yatay kaydırmasız açılsın.
10. `mcp__hearthbot__` araçlarını çağırma; Mert'e yazma. Git'te hiçbir şey commit etme ya da push etme.
11. Sonucu `/mnt/project-files/notes/gece-isi/sayfa-<grup>.md` dosyasına yaz: her sayfa için tek satır: başlık · url · karar durumu (Done / yarı / bekliyor) · neye dayanarak (kaynak dosya:satır ya da oturum no + Mert'in sözü, kısa) · yayınlandı mı · kaldırılan varyantlar · bekleyen sorular.
