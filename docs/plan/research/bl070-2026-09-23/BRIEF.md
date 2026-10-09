# BL-070 derin araştırma — ortak brief (tüm ajanlar önce bunu okur)

## Görevin özü
Sana verilen kırmızı pgTAP test dosyalarının her biri için derin bir araştırma yapacaksın. Amaç "testi mi repoyu mu düzelteyim" sorusunu cevaplamak değil sadece; asıl amaç: **kodda yapılmış değişikliğin (eski davranış → yeni davranış) mantık olarak doğru mu, yoksa uygulamayı ürün sahibinin istemediği bir yöne mi sürüklüyor** sorusunu cevaplamak. Yanlış mantık üzerine doğru test yazmanın anlamı yok.

**Değerlendirme ölçütü koddaki mevcut yapı DEĞİLDİR. Ölçüt aşağıdaki "Hedef model"dir.** Ürün sahibi tek başına çalışan bir geliştirici; kod çok geniş ve karmaşık; kodda onun isteğinden farklı kurulmuş yapılar, yanlış kararlar sonucu oluşmuş mimariler olabilir. Kodun bir şeyi yapıyor olması, doğru olduğu anlamına gelmez. Kod hedefle çelişiyorsa bunu açıkça "kod hedefle çelişiyor" diye raporla — test yeşil olsa bile.

**Ürün niyeti hakkında karar verme.** Hedef modelde cevabı olmayan, çelişkili, garip ya da emin olmadığın her şeyi "Kullanıcıya sorular" bölümüne yaz: soruyu, neden sorduğunu, kanıtını, seçenekleri ve (varsa) önerini gerekçesiyle. Varsayım yapmak zorunda kalırsan açıkça "VARSAYIM:" diye işaretle.

## Hedef model (ürün sahibinin tarifi — ölçüt budur)

**Uygulama:** çok kiracılı (multi-tenant) vardiya planlama uygulaması. Bir workspace = bir işletme/şirket (ayrı abonelik). Aynı şirketin şubeleri aynı workspace içinde **lokasyon** olarak tutulur.

**Owner onboarding:** owner workspace'i kurar. Kurulumda zorunlu: workspace adı, en az 1 lokasyon, en az 1 department, en az 1 job. Onboarding'de employee eklemek opsiyonel.

**Uygulama açılınca:** owner'ın kendi adına bir employee kaydı oluşur. Owner yetkisi gereği bu kaydın bütün lokasyonlara erişimi ve bütün job'ları çalışabilme yetkisi vardır.

**Employee eklerken:** ad + soyad zorunlu; ayrıca ya (en az 1 lokasyon VE en az 1 job) ya da "remove/exclude from schedule" seçilmek zorunda. Bunlar dolunca kayıt kaydedilebilir. Kaydın gerçek bir kullanıcıya bağlanması için e-posta yazılıp davet gönderilmesi gerekir; e-posta yazıldığı an Invite düğmesi aktif olur. Davet sırasında employee'ye **rol ve erişim** ataması yapılır.

**Roller ve hiyerarşi: owner > admin > manager > employee.**
- **Owner:** her şey. Owner'a özel: billing/ödeme, sahiplik devri, workspace kapatma/silme, admin atama/kaldırma.
- **Admin:** owner ile aynı, organizasyon kapsamlı. Employee drawer'ında kendisine atanmış lokasyonlara BAKILMAKSIZIN bütün lokasyonlara ve bütün employee'lere erişir. Settings'te billing/sahiplik hariç çoğu ayara okuma+yazma. Rolleri (Settings → Roles) düzenleyebilir ama kendi izninden fazlasını veremez; admin atayamaz.
- **Manager:** YALNIZCA kendisine atanmış lokasyonlara ve o lokasyonlardaki employee'lere erişir. (Repoda manager'ın kapsamı, kendi employee kaydının lokasyon atamalarından `membership_location_scopes`'a otomatik senkronize ediliyor — bu hedefle uyumlu.) Settings'te çoğunlukla salt-okunur. Kendisine atanmamış lokasyonda yetkisi yok ya da kısıtlı — bu, uygulamanın en önemli ve en karmaşık kuralı; edge case'ler dikkatle düşünülmeli (ör. iki lokasyonda çalışan bir employee'nin yalnız bir lokasyonu manager'ın kapsamında).
- **Employee:** yalnız employee arayüzü.
- Owner, admin ve manager uygulamanın **admin arayüzüne** erişir; employee'ler her zaman **employee arayüzüne**. Owner/admin/manager'ın da kendi employee kaydı vardır: **vardiyaya konabilmeleri ve vardiya takas edebilmeleri gerekir** (kod şu an bunu desteklemiyor olabilir — araştır).
- Settings → Roles'taki özel roller: izinler, rolün kapsamı İÇİNDE daraltma yapar (ör. "View employees" kapalı bir manager rolü). Kapsamı genişletemez.

**Availability (müsaitlik):** employee daveti kabul edince onboarding'de **opsiyonel** bir availability adımı vardır; employee **müsait OLMADIĞI** günleri/saatleri işaretler. Employee'nin doldurduğu form hem **Availability sayfasında** hem de **employee drawer'ındaki Availability sekmesinin alt sekmelerinden birinde** görünür (diğer alt sekme yöneticinin kendi hatırlatma kaydı olabilir). Manager/admin vardiya yazarken availability **uyarısı** alır ama isterse **üzerine yazabilir (override)**. Organizasyon ayarlarında (Settings → conflict ayarları) admin, availability'nin **hard mı soft mu** conflict yaratacağını ayarlayabilir.

**Time off:** employee time off request gönderir; manager/admin **onaylarsa** bu doğrudan **HARD conflict**tir (yönetici onaylamış, employee planını ona göre yapmıştır). Onaylanmış izin yumuşatılamaz.

**Shift swap / seek for cover / release shift:** lokasyon ataması, job ataması ve availability önemlidir. **Kriterlerin hepsi sağlanmazsa employee eligible olamaz.** Tek istisna: availability'sini kendisi ayarlamış employee, **release edilmiş bir shifti pickup ederken kendi availability kararını override edip** pickup edebilir. Bütün sürecin sonunda **onay** gerekir: vardiyanın lokasyonunun yöneticisi (o lokasyon kapsamındaki manager) ya da admin/owner onaylar. **İki lokasyon söz konusuysa (ör. Kadıköy vardiyası Beşiktaş çalışanına) her iki lokasyonun yetkilisinin onayı gerekir.**

**Line Up:** sadeleştirilecek; bu araştırmanın kapsamı DIŞINDA. Line Up'a ait kontrolleri derin inceleme; yalnızca senin dosyandaki bir kural Line Up ile ortak bir kök nedene sahipse bunu kısa not düş.

**"Canlı veri yok" kuralı:** üründe canlı kullanıcı ve production verisi yok. Bugünkü kurallara uymayan veri/kod yolu/test fixture'ı korunmaz, silinir; geriye dönük uyumluluk (legacy tolerance) istenmez. Testler bugünkü kuralları iddia eder. Bir kod yolu yalnızca artık oluşturulamayan bir durumu idare etmek için varsa, bu da bir bulgudur.

## Bu oturumda daha önce verilmiş kararlar (BAĞLAYICI DEĞİL — hepsi yeniden değerlendirilecek)
Aşağıdaki kararlar kodu okuyarak ve hedef model tam anlatılmadan verildi. Senin işin bunları da hedef modele göre yeniden sınamak. Katılmıyorsan gerekçesiyle söyle.
- D1: manager tipindeki rollere organizasyon ayarı izinleri (settings.*) verilemez.
- D2: admin varsayılan olarak Settings → Roles'u düzenler; admin atama, sahiplik devri, kapatma, billing owner'da.
- D3: manager bir employee'yi yalnız o employee'nin TÜM aktif lokasyonları manager'ın kapsamındaysa işten çıkarabilir/arşivleyebilir; değilse admin/owner.
- "Taslak (yayınlanmamış) belge tanımının etkisi sıfır olmalı": atama yolları yalnız yayınlanmış tanımları seçmeli; taslak gelirse sessizce yutmak yerine hata.
- Employee onboarding'i hiç sıfırlanamaz (çalışan tarafı "Start over" tamamen kaldırılır).
- Saati bilinmeyen vardiya "saat doğrulanmalı" olmalı (gerekçeyle override değil).
- BL-091 (iki availability sistemi) için öneri: yeni sistem (haftalık tercihler) esas, eski sistem (`employee_schedule_availability_versions`) sökülsün — HENÜZ KARAR VERİLMEDİ.
- Dosya bazındaki eski kararlar senin alanının talimatında ayrıca listelenmiştir.

## Çalışma kuralları (kesin)
- **Salt okunur.** Kod/test/migration dosyası düzenleme yok; git'e yazma yok (commit, checkout, stash, branch yok); migration uygulama yok; `supabase db reset` YOK.
- **Veritabanı ortak** (başka oturumlar da kullanıyor): container `supabase_db_newfork-clean`. Deneme yapacaksan MUTLAKA tek bir transaction içinde ve sonunda `rollback;` ile: `{ echo "begin;"; ...; echo "rollback;"; } | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At`. pgTAP dosyaları zaten kendi `begin;`/`rollback;`'ını içerir.
- Tek test dosyası koşmak: `docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At < supabase/tests/<ad>.test.sql 2>&1 | grep -E '^not ok|^# |ERROR'`. Tüm suite'i KOŞMA (`supabase test db` yok).
- Repo: `C:/Users/TheWe/Documents/Codex/newfork-clean` (main, `41783c7`). Windows + Git Bash; `pnpm.cmd`.
- Eski/yeni davranışı bulmak için: migration'lar tarih sırasıyla `supabase/migrations/` altında (bir fonksiyonun eski hali daha eski migration'da); canlı tanım `select pg_get_functiondef('schema.fn(args)'::regprocedure);`; `git log -S'<metin>'`, `git log --format='%h %ad %s' --date=short -- <dosya>`, `git show <commit>` (commit mesajları çoğu zaman gerekçeyi anlatır).
- Belgeler: `docs/plan/tasks/*.md`, `docs/plan/BACKLOG.md` (BL-091..096 bu testlerle ilgili notlar içerir), `docs/plan/MVP-PLAN.md`, `docs/plan/ROADMAP.md`; `docs/archive/rebuild/*` tarihsel spec'ler (tarihlidir; sonraki kararlar öncekileri geçersiz kılar); kullanıcı kararları hafızası: `C:/Users/TheWe/.claude/projects/C--Users-TheWe-Documents-Codex-newfork-clean/memory/*.md` (özellikle join-architecture-decisions.md, settings-three-scope-ia.md, join-architecture-audit-gaps.md, button-language-decision.md).
- Baseline koşu çıktısı (22-23 Eylül, main 41783c7, 131 dosya, 38 kırmızı): `.../scratchpad/bl070-research/baseline-pgtap.txt`.
- Web/API kodu: `apps/web/src`, `apps/api/src`, ortak şemalar `packages/shared/src`. Bir kuralın ekranda nereye düştüğünü bulmak için API route → web data fonksiyonu → bileşen izini sür.

## Her dosya için rapor şablonu (Türkçe, kod bilmeyen ürün sahibi okuyacak)
Her teknik adın yanına ilk geçtiği yerde insani karşılığını yaz: ekrandaki yeri (menü → sekme → düğme), bir insan için ne yaptığı, somut örnek (Ayşe, Ali, Mehmet; Kadıköy, Beşiktaş lokasyonları; Lunch/Dinner vardiyaları gibi). Tek satır yeter; ders anlatma.

```
### <dosya adı>
**Ekrandaki karşılığı:** ...
**Test ne iddia ediyor (kırmızı kontroller):** ... (kontrol numaraları ve adları)
**Eski davranış:** nasıl çalışıyordu (hangi migration/commit, tarih) + 2-3 örnek senaryo ve uygulamanın her birini nasıl ele aldığı
**Ne değişti:** hangi değişiklik, ne zaman, yazılı gerekçesi (commit mesajı/task/spec'ten alıntıyla — varsa; yoksa "yazılı gerekçe yok")
**Yeni davranış:** nasıl çalışıyor + AYNI senaryoların yeni kodda ele alınışı
**Hedefe göre doğrulama:** eski ve yeni mantık hedef modele uyuyor mu? Hangisi doğru yönde? İkisi de yanlış olabilir mi? Rol/lokasyon kapsamı edge case'leri. Değişiklik uygulamayı istenmeyen yöne sürüklüyor mu?
**Kanıt:** koşulan testler ve denemeler (geri alınan), okunan kod (dosya:satır ya da fonksiyon adı + migration). Kodu okuyarak mı yoksa deneyerek mi tespit ettiğini açıkça ayır.
**Önerilen karar:** (Test düzelsin / Repo düzelsin / İkisi / Ürün kararı gerekli / Bekle) + 2-4 destekleyici gerekçe + diğer seçenek hangi durumda doğru olurdu + etiket `(leave: critical|high|medium|low / do: safe|moderate|risky)`
**Önceki karar ile karşılaştırma:** önceki karar (varsa) aynı mı kalmalı, değişmeli mi, neden
**Aynı dosyadaki yeşil kontrollerde hedefle çelişenler:** kısa liste (yoksa "yok")
**Kullanıcıya sorular:** (varsa) soru + neden + seçenekler + önerin
```

Dosya bölümlerinden sonra alan geneli için:
```
## Alan geneli bulgular
- Birden fazla dosyayı etkileyen ortak kök nedenler
- Hedef modelle çelişen ama bu testlerde görünmeyen önemli yapılar (kısa; yalnız gerçekten önemliyse)
- Fikir ve tavsiyeler (ürün sahibi açık)
## Kullanıcıya sorular (alan geneli, önem sırasıyla)
```

## Teslim
Raporunu `C:/Users/TheWe/AppData/Local/Temp/claude/C--Users-TheWe-Documents-Codex-newfork-clean/1bffafe5-0eb6-45b5-8b81-91ee54e69016/scratchpad/bl070-research/<alan-kodu>.md` dosyasına yaz (Write aracıyla). Son mesajında: dosya yolu, dosya başına tek satır özet (önerilen karar), ve kullanıcıya soruların listesi. Kısa tut; ayrıntı dosyada.

## EK (ürün sahibinden, araştırma başlarken): hiyerarşi değişebilir
Ürün sahibi "admin organizasyon kapsamlı / manager lokasyon kapsamlı" mantığını oturtmakta zorlandığını söyledi: manager yalnız kendi lokasyonlarıyla sınırlanınca ve bir employee aynı anda birden fazla lokasyonda çalışınca çok farklı senaryolar çıkıyor (schedule yazma, availability, aynı gün birden fazla lokasyonda çalışma, shift takasları, time off request'leri ve bunlar olurken manager'ın yalnız kendi lokasyonundaki olayları görebilmesi). **Kusursuz bir plana oturtmanın yolu yoksa hiyerarşiyi değiştirmeye açık.**
Bu yüzden: senin alanında manager lokasyon kapsamının çeliştiği ya da belirsiz kaldığı her senaryoyu "kod yanlış" diye kesin hükme bağlama; "KAPSAM MODELİ SORUSU" diye etiketle, senaryoyu somut yaz (kim, hangi lokasyon, hangi olay, kim görmeli/kim onaylamalı), bugünkü kodun ne yaptığını ölç. Ayrı bir ajan (alan G) kapsam modelinin kendisini tasarlıyor; senin etiketlediğin senaryolar ona girdi olacak.
