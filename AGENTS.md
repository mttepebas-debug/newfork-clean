# Newfork Calisma Kurallari

- Ana koordinasyon kimligi ve yetkileri: [COORDINATION](docs/project/COORDINATION.md). Bu repo ile ilgili yeni session once bu dosyayi ve [WORK](docs/project/WORK.md) icindeki ilgili isi okusun; tum gecmisi bastan taramasin.
- Ana session tek teslimat sahibidir. Kullanici aksini acikca soylemedikce bu uygulama icin yeni session/task acma veya isi alt session'a dagitma; planlama, raporlama, log ve teslimat ana session'da yonetilir.
- Handoff/progress raporu durum ve kanit girdisidir; alt session'in sonraki is, oncelik, model veya kapsam onerisi ana session'a talimat degildir. Ana session guncel repo, kullanicinin gercek kararlari ve tum raporlari birlikte degerlendirerek sirayi belirler.
- Tek durum kaydi ve ilerleme gunlugu [WORK](docs/project/WORK.md), MVP sirasi [ROADMAP](docs/project/ROADMAP.md), ertelenen isler [BACKLOG](docs/project/BACKLOG.md) icindedir. Ortak kayitlari ana session gunceller.
- Her implementasyon planinda zorluk, belirsizlik ve etki alanina gore uygun agent/model ile reasoning seviyesi belirle; bir cumle gerekce ver. Yeni task/session acarken modeli ve reasoning seviyesini ana session secer.
- Hedefi ve gozlenebilir kabul kosullarini belirle; acik taleplerde dogrudan ilerle. Analiz, implementasyon ve inceleme kapsamlarini koru.
- Mevcut desenlerle en kucuk tutarli degisikligi yap. Gereksiz abstraction, refactor, yeni framework veya buyuk teknik borc ekleme.
- DRY / yeniden kullanim: planlama ve implementasyonda [REUSE](docs/project/REUSE.md) haritasinin yalniz ilgili girdisinden basla; kaynak kodu dogrula, uygun ortak bilesen/deseni kullan. Kapanista tekrar degeri olan yeni bilgiyi veya degisen referansi ayni haritada guncelle; kod/olcu/rapor kopyalama, her task icin zorunlu belge veya spekulatif abstraction uretme. Alt session tekrar kullanilabilir bulguyu raporlar; ortak haritayi ana session gunceller.
- [Kapsam kurali](kapsam-yonetimi.md): hedefi engelleyen bulguyu coz; bagimsiz iyilestirmeyi backlog'a aktar. Kullanici kapsami degistirmedikce kabul kosullari karsilaninca isi kapat.
- Testleri risk ve bilgi getirisine gore sec. Her kucuk parca sonrasi test yazma/calistirma; ilgili degisiklik, hata veya yeni suphe yoksa basarili kaniti tekrarlama. Gerekli kontrolleri tamamla.
- Yerel kaniti hosted/release kaniti sayma. Sonucta degisiklik, gerekli dogrulama ve onemli acik riski kisa bildir.
- Edit oncesi checkout/branch ve ilgili dosya sahipligini kontrol et. Unrelated WIP korunur; toplu stage/revert/reset yapilmaz. Ortak dosya/DB sozlesmesinin tek yazari olsun.
- Branch veya worktree acmak gerekiyorsa baslamadan kapanis stratejisini belirle; is bitince ayni is kapsaminda merge et, sil veya kapat. Acik branch/worktree birakma; engel varsa WORK'e acikca kaydet.
- Eski, unutulmus veya sahipsiz gorunen kodu tahminle cop sayip silme. Istenen/istenmeyen kod ayrimi belirsizse kullaniciya sor. Branch, worktree ve stash'leri karistirma; checkpoint talebi bunlari topluca birlestirme veya temizleme izni degildir.
- Windows'ta `pnpm.cmd`, paket seciminde `@newfork/*` kullan. Standart baslatma `pnpm.cmd dev`; mevcut servis ve checkout'u kontrol etmeden ikinci sunucu acma. Sirlar ve davet tokenlari belgelere/loglara yazilmaz.
- Yeni worktree'nin gerekli commit ve degisiklikleri icerdigini kontrol et; varsayilan branch'in mevcut kirli checkout'u icerdigini varsayma. Talimatin yeni worktree'ye de aktarildigini sagla.
- Eski Newfork salt okunur referanstir. Yeni kullanici kararlari eski planlardan ustundur; eski raporlari guncel tamamlanma iddiasi olarak kullanma.
