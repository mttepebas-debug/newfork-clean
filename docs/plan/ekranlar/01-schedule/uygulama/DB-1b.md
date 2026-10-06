# EKRAN-01 DB-1b — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DB-1b — düzenleme oturumunun yaşam döngüsü, auto-save | `nf-db` / veri hattı | R3 | ONAY @98940f92 (`nf-guvenlik`, 3. tur; 1. ve 2. tur DEĞİŞİKLİK) | 2026-10-06 |

## Sonrası için
- Tuzak: normal kaydetmenin satır süzgeci (ör. `pending_op_type = 'delete'` satırlarını atmak) kurtarma / auto-save kopyasında da olmalı; yoksa silinen vardiya taslakta geri gelir.
- Tuzak: yan etkili bir çağrı `coalesce(x, f())` içine konmaz; Postgres ilk argüman doluysa `f()`'yi hiç çalıştırmaz.
- Tuzak: "conflict" gibi normal bir cevap dönmeden önce kalıcı yan etki (kapatma, taslak üretme) yapılmaz; hata fırlatılsa geri alınırdı, normal cevapta kalıcı olur ve cevap söylemez.
- Kalıp: "canlı lokasyon" süzen her yardımcı çekirdeğin `app_private.location_is_live`'ını kullanır (arşivli + silinmiş); yalnız `deleted_at`'e bakan owner'ı da kilitler.
- Kalıp: yeni bir PT409 kapısı eklenen fonksiyon, aynı satırları kilitleyen servislerle aynı çalışma alanı kilidini (`availability_lock_workspace`, 921) aynı sırada alır.

## Rapor
**Karar:** DB-1b bitti, `nf-guvenlik` ONAY @98940f92 (üç tur: DEĞİŞİKLİK → DEĞİŞİKLİK → ONAY).
**İzin:** R3 — main'e gönderim ve canlı migration için izin istiyorum.
**Risk:** 🟠 düzenleme oturumunun kapanış yolu ve taslak silme değişti; iş artık hiçbir kapanışta silinmiyor, ama web hattının yeni cevapları okuması gerekiyor (§3).
**Soru:** yok.
**Sonraki:** BE-2b-DB (haftalık e-postada kısmi teslim kuralı), sonra DB-2.

### EKRAN-01 DB-1b — düzenleme oturumunun yaşam döngüsü, otomatik kurtarma taslağı (nf-db/veri)

Delegasyon: R3 (veri silme yolu); `nf-guvenlik` zorunlu inceleme yapıldı (3 tur); görsel QA yok (ekran kodu değişmedi).
**Ultrareview:** önerilmez — `nf-guvenlik` üç turda iki gerçek hata buldu ve ikisi de kapandı, her biri testle kilitli; Mert benzer işlerde "iki inceleme yeter" dedi (ILKELER P06).

### 1. Nerede duruyor
Bitti, dalda; "gönder" iznini bekliyor.
- Dal `task/ekran-01-db-1b`, worktree `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83`; `origin/main` `0987c9b8` üstüne rebase edildi (çatışma yok, araya yalnız `supabase/` dışı işler girdi). ONAY verilen uç `98940f92`; rebase sonrası aynı içerik + bu raporun arşiv commit'i.

### 2. Ne yapıldı (etkisi)
Schedule → düzenleme modu (Edit published schedule / New Schedule ▾ → bir taslak → Edit):
- **"Keep editing?" süresi dolunca iş silinmiyor (S1).** Önce: Ayşe 12 vardiya yazıp 20 dakika masadan kalkınca vardiyalar habersiz siliniyordu. Sonra: ekran yeni `autosave_schedule_edit_session_service`'i çağırınca iş "Auto-save · Ayşe Yılmaz · Oct 5, 9:14 PM" adlı taslağa geçer, kilit bırakılır; Ayşe dönünce New Schedule menüsünden açar. Hiçbir şey kaydedilmemişse yalnız düzenleme kapanır ("nothing_to_save"). Saat, düzenlemenin lokasyonunun saat diliminde ve workspace'in 12/24 saat ayarında; aynı dakikada ikinci auto-save "… (2)" olur.
- **Bütün kurtarma taslakları aynı adı alıyor (D-O9, KK-162).** Önce: "Recovered edit 2026-10-05 21:14:07 3f9a" (UTC, teknik). Şimdi: Zeynep, kirası dolmuş Ayşe'nin taslağını açınca Ayşe'nin işi "Auto-save · Ayşe … " taslağına geçer ve açılış cevabı bu adı söyler (`recovered_draft_name`) — ekran KK-162'deki tek satırı yazabilsin diye.
- **Başka taslak isteyince eski düzenleme sessizce sürmüyor (D-O9).** Önce: Can Plan B'yi düzenlerken Plan C'yi isterse ekran yine Plan B'yi açıyordu. Şimdi: Plan C açılır, Can'ın Plan B'deki kaydedilmemiş işi kendi Auto-save taslağına geçer, cevap bunu söyler. Aynı taslağı yeniden istemek (sayfa yenileme, kira kurtarma) düzenlemeyi eskisi gibi sürdürür. Plan C'yi başkası düzenliyorsa Can'ın düzenlemesine dokunulmaz ("Ayşe düzenliyor" cevabı).
- **Herkes yalnız kendi kaydedilmemiş değişikliklerini görüyor (D-Y5).** Önce: Owner Mert ile Ayşe aynı yayındaki haftayı düzenlerken Ayşe'nin kaydetmediği silme Mert'in ızgarasına biniyordu. Şimdi binmiyor.
- **Düzenlenen taslak altından silinmiyor (D-O6).** Önce: Zeynep, Ayşe'nin düzenlediği "Plan A"yı silerse Ayşe'nin her kaydı "draft revision stale" ile düşüyordu. Şimdi: kira canlıyken silme 409 + `schedule.draft_being_edited` ile reddedilir. Kira dolmuşsa silme önce Ayşe'nin işini Auto-save'e koyar, sonra siler.
- **Silinen vardiya geri gelmiyor.** Kişinin kaldırdığı yayındaki vardiya, kaydetmede olduğu gibi kurtarma taslağında da yok (inceleme bulgusu; eski kurtarma yolunda da vardı).
- **Taslağın canlı lokasyonları tek yerden (BL-224).** Arşivli ve silinmiş lokasyon taslağın hesabından düşer (KARARLAR Q-B, Q-C; yetki çekirdeğinin `location_is_live`'ı). Örnek: Kadıköy + Beşiktaş taslağında Beşiktaş arşivlenince Kadıköy müdürü Zeynep taslağı silebilir (önce owner dahil kimse silemiyordu). Aynı kural "başka taslağa kaydet"te de.
- **DB-1a incelemesinin bulgu 1 ve 2'si kapandı:** discard ve bekleyen değişiklik komutları düzenlemenin lokasyonlarını yeniden soruyor; Ayşe'nin kendi düzenlemesi kapanınca cevap kurtarma taslağını söylüyor.

### 3. Açık kalanlar
- **Web sözleşmesi (W-1b, `nf-backend`):**
  - Yeni servis `autosave_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id)` → `{status: 'saved' | 'nothing_to_save', draft_id, draft_name}`. Sahip değil / açık değil → P0002 "edit session not found" (404). Kapsamı düşmüşse 42501 + `authz.*` (403). Yetki sınıfı `schedule.edit`. Bugün ekran sayaç bitince `discard`'ı çağırıyor; `autosave`'e geçmeli (S1).
  - Açılış (`acquire`) cevabına `recovered_draft_name` eklendi (zod fazladan alanı atıyor; okunması için şemaya eklenmeli). `status: 'acquired_after_recovery'` artık kişinin kendi eski düzenlemesi kenara konduğunda da gelir. İki iş birden kenara konursa cevap yalnız diğer müdürünkini adlandırır (bilerek sade; kişinin kendi Auto-save'i taslak listesinde).
  - Taslak silme: düzenleniyorsa 409 + `schedule.draft_being_edited`.
  - Bekleyen değişiklik listesi artık yalnız çağıranın.
- **Canlı migration** izni (yukarıda).
- **Bilinçli dışarıda:** kirası dolmuş ama kimsenin yeniden açmadığı yayın / boş hafta düzenlemeleri (sekme kapandı) kendiliğinden Auto-save'e çevrilmiyor; kişi haftayı yeniden açınca sürüyor (BL-069), başkası taslağı açınca kurtarılıyor. Zamanlanmış bir süpürücü bu dilimde yok.

### 4. Ekranda ne değişti
Görünür değişiklik yok (ekran kodu yok). Davranış: Schedule → Plan menüsünden düzenlenen bir taslağı silmek artık reddediliyor; kurtarma taslakları "Auto-save · …" adıyla çıkıyor; başka taslağı açmak istenen taslağı açıyor.

### 5. Sırada ne var
1. "gönder" + canlı izni gelirse gönderim (rebase, tam kapı, migration ortak yerel DB'ye, parçalı `test:db`, push, main CI, canlı: önce yedek).
2. BE-2b-DB (koordinatörün sıraya eklediği), sonra DB-2.
- **Yolda bulunan:** `list_schedule_pending_ops_service` yalnız yayındaki vardiyayı değiştiren / silen düzenlemeleri "bekleyen" sayıyor; yayındaki haftaya yeni eklenen vardiya bekleyen sayılmıyor ve `source_published_shift_id` alıyor (D-O1, DB-3'te). Bilgi.
- **Yolda bulunan:** `add` / `update_schedule_pending_op_service` web'den çağrılmıyor (BL-168); bu dilimde yalnız kapsam sorusu eklendi, silinmeleri BL-168'de.

### Kanıt
- Yeni pgTAP `schedule_edit_session_lifecycle.test.sql`: 36 hücre. Eski kodda (autosave yerine boş geçici fonksiyonla) 17 kırmızı + 19 hata; `48f22117` sürümünde 23505 (inceleme turu 2'nin bulgusu); `98940f92`'de 36/36.
- `schedule_resume_lease.test.sql` iki çağrı aynı taslağı isteyecek biçimde yeniden yazıldı (eski hücre "başka kaynak isteyince de sürdür"ü kilitliyordu; D-O9'un tersi). Web'in kira kurtarması oturumun kendi kaynağını gönderiyor (`apps/web/src/schedule/hooks/useScheduleEditSession.ts:140-148`), yani yenilemede iş kenara konmuyor. 15/15.
- `schedule_edit_session_scope` (DB-1a) 23/23.
- Bütün `ci-green` listesi (167 dosya) migration'la, dosya başına rollback, `db.lock` altında (iki koşu): yalnız bilinen iki yerel belge dosyası (`bl052_document_lifecycle`, `bl052_document_notifications`; migration'sız da düşüyor, CI'da yeşil). İlk koşuda `bl052_document_onboarding` #25 bir kez düştü; aynı dosya migration'la tek başına 34/34 (yük).
- Sınıflandırma: `authorization_coverage` +1 satır (`autosave_schedule_edit_session_service` → `schedule.edit`). Grant: yalnız `service_role` (inceleme `has_function_privilege` ile ölçtü). Yeni `app_private.live_draft_locations` kimseye açık değil.
- Nedensiz 42501 sayısı değişmedi (yeni ret 409 + anahtar, 42501 değil).
- Commit'ler (rebase öncesi): `2440386c`, `48f22117`, `98940f92`.

Senin yerine verdiğim kararlar (teknik / dayanaklı):
- Başka taslak ya da kaynak istenince eski düzenleme Auto-save'e geçer, istenen açılır (D-O9 "sessizce sürdürülmez" + KK-162 ad ve tek satır + ILKELER P10 "ilerleme kaybolmaz"). Reddedilen: "açık düzenlemen var" diye durdurmak (fazladan adım, anti-hedef "kurumsal hantallık").
- Düzenlenen taslağın silinmesi canlı kira varken reddedilir, dolmuşsa önce iş kurtarılır (D-O6; P19).
- Auto-save saati düzenlemenin (adına göre ilk) lokasyonunun saat diliminde, workspace 12/24 ayarıyla.

## İnceleme

### Tur 1 (`2440386c`)

KARAR: DEĞİŞİKLİK İSTE (`2440386c`, dal `task/ekran-01-db-1b`)

Bir Yüksek bulgu var. Otomatik kayıt, kişinin sildiği vardiyayı taslakta geri getiriyor. Yetki, grant ve tenant tarafı temiz.

#### Bulgular

**1. Yüksek: Otomatik kayıt, silinen vardiyayı taslakta geri getiriyor**
- **Yer:** `supabase/migrations/20261007060000_schedule_edit_keeps_its_work.sql:74-77` (`app_private.close_schedule_edit_session`)
- **Ne görüldü:** Kapanan düzenlemenin bütün satırları Auto-save taslağına kopyalanıyor. "Silinecek" diye işaretli satırlar da bunlara dahil. Normal kaydet akışı bu satırları önce atıyor (aynı dosya 480-487).
- **Kanıt:** Geri alınan denemede (`trial2`) Ayşe yayınlanmış haftayı açtı ve tek vardiyayı sildi. Ekran "Keep editing?" süresinde otomatik kaydetti. Oluşan "Auto-save · Ayse Person · Oct 6, 8:20 AM" taslağında o vardiya hâlâ duruyor (1 satır). Aynı düzenleme normal kaydedilseydi taslakta 0 satır olurdu.
- **Bir kişi için etkisi:** Ayşe, Mehmet'in Salı vardiyasını kaldırıp masadan kalkar. Taslağı açtığında Mehmet'in vardiyası yerindedir. Fark etmeden yayınlarsa Mehmet iptal edildiğini sandığı vardiyaya çağrılmış olur.
- **Neden şimdi Yüksek:** Hata eski koddan geliyor. Ama bu iş kurtarma yolunu ana yol yaptı: her hareketsizlik, başka taslak açınca kenara konan düzenleme (D-O9) ve süresi dolmuş düzenlemesi olan taslağın silinmesi bu kopyalamadan geçiyor.
- **Beklenen:** Kopyalamaya `and pending_op_type is distinct from 'delete'` süzgeci eklensin. Bir pgTAP hücresi de eklensin: yayınlanmış hafta, sil, otomatik kaydet, taslakta 0 satır.

**2. Orta: Kişinin açık düzenlemesi "başkası düzenliyor" cevabından önce kapanıyor ve cevap bunu söylemiyor**
- **Yer:** aynı dosya, satır 189-195 ve 221-233 (`acquire_schedule_edit_session_service`)
- **Ne görüldü:** Can'ın açık düzenlemesi, istenen taslağın kimde olduğuna bakılmadan önce kapatılıp Auto-save taslağına alınıyor. Taslak başkasındaysa cevap `conflict` dönüyor ve içinde `recovered_draft_id` ya da `recovered_draft_name` yok. Kapanış yine de kalıcı oluyor.
- **Kanıt:** `trial4` denemesinde Can, kaydedilmemiş bir vardiyayla Plan B'yi düzenlerken Plan C'yi istedi; Plan C'yi Ayşe düzenliyordu. Cevap `{"status":"conflict","holder_name":"Ayse Person"}` oldu, Can'ın Plan B düzenlemesi `recovered` oldu.
- **Bir kişi için etkisi:** Can ekranda "Ayşe düzenliyor" yazısını görür ve Plan B'ye döner. Eklediği vardiya orada yoktur; adını hiç duymadığı bir Auto-save taslağındadır. Veri kaybolmuyor, ama KK-162'nin "cevap taslağın adını söyler" sözü bozuluyor.
- **Beklenen:** Açık düzenleme, çakışma ve kapsam kontrolleri geçtikten sonra kapatılsın. Ya da `conflict` cevabına kurtarılan taslağın kimliği ve adı eklensin. Bu yol için bir pgTAP hücresi de eklensin.

**3. Orta: Yeni ortak yardımcı yalnız silinmiş lokasyonu düşüyor, arşivliyi düşmüyor**
- **Yer:** aynı dosya, satır 30-40 (`app_private.live_draft_locations`)
- **Ne görüldü:** Yardımcı yalnız `deleted_at` dolu lokasyonu atıyor. KARARLAR Q-C (KK-13/KK-67, 2026-09-30) "arşivli ya da silinmiş lokasyon hiçbir kuralda canlı değildir" diyor. Yetki çekirdeği de (`authz_check`, `location_is_live` = `archived_at is null`) arşivli lokasyonu görünce herkese `out_of_scope` dönüyor.
- **Bir kişi için etkisi:** Kadıköy + Beşiktaş taslağında Beşiktaş arşivlenmişse taslağı kimse silemez ve içine kaydedemez; owner da dahil. Q-B'ye göre Kadıköy müdürü Ayşe silebilmeli.
- **Bağlam:** Silme yolundaki davranış eskiden de böyleydi, ama artık "tek kaynak" bu yardımcı ve kuralın yarısını taşıyor. Yerel DB'de silinmiş tek lokasyon aynı zamanda arşivli. Yani `app_private.location_is_live` ile süzmek iki durumu birden kapsar.
- **Beklenen:** Yardımcı `location_is_live` ile süzsün. BL-224 yardımcısının hiç test hücresi yok: silme ve kaydetme yollarında birer silinmiş ve arşivli lokasyon hücresi eklensin.

**4. Düşük: Taslak silme, çalışma alanı kilidini almıyor**
- **Yer:** aynı dosya, satır 584-616 (`delete_schedule_draft_service`)
- **(a) Yarış:** Düzenleme açılırken taslak okunur, oturum henüz eklenmemiştir. Silme bu arada araya girerse açık oturum görmez ve taslağı arşivler. Sonuçta arşivli taslak üzerinde bir düzenleme açılır ve her kayıt "draft revision stale" alır; bu, D-O6'nın düzeltmek istediği belirtinin ta kendisi. İş yalnız Auto-save yoluyla kurtulur.
- **(b) Kilit sırası:** Silme önce taslağı, sonra oturumu kilitliyor. Kaydet ters sırada (önce oturum, sonra taslak) kilitliyor. İkisi aynı anda gelirse Postgres kilitlenmeyi (deadlock) yakalar ve birini düşürür. Kaydet yalnız 40001 kodunu tanıdığı için 40P01 kodu kullanıcıya genel hata olarak döner.
- **Beekenen:** Silmenin başında `perform public.availability_lock_workspace(target_workspace_id);` çağrılsın. Bu, kaydet ve düzenleme açmanın kullandığı aynı 921 anahtarıdır ve iki sorunu birlikte kapatır.

**5. Düşük: Testte eksik hücreler**
Ad çakışınca eklenen " (2)" döngüsünün, 24 saat biçiminin, 2 numaralı bulgudaki çakışma yolunun ve BL-224 yardımcısının (3 numaralı bulgu) hücresi yok.

**Öneri (zevk notu, bulgu değil)**
Silme, kapsamını kaybetmiş bir kişinin süresi dolmamış kirasını hâlâ "düzenleniyor" sayıyor (PT409). Düzenleme açma (B-3) ise aynı kişiyi "hiçbir şey tutmuyor" sayıyor. Kira en çok 4 dakika içinde kendiliğinden düşüyor; iki kuralın aynı ölçüye bağlanması daha tutarlı olur.

**Temiz bulunanlar**
- **Grant:** `autosave` yalnız `service_role`'e açık. `live_draft_locations` ve `close_schedule_edit_session` anon, authenticated ve service_role için kapalı. Değişen fonksiyonların grant'ları korunmuş (`trial3`).
- **Tenant ayrımı:** `autosave` önce sahip ve çalışma alanıyla süzüyor, sonra yetki çekirdeğine soruyor. Başkasının oturumuna P0002 dönüyor. Bütün sorgular çalışma alanıyla süzülüyor; kurtarma taslağının lokasyonları oturumun lokasyonlarıyla aynı.
- **Çekirdek kuralı:** `search_path ''` her fonksiyonda var. `auth.uid()` ya da JWT okuması yok. Yetki kapısı çekirdek dışına çıkmamış. "Bilgi eksikse izin ver" varsayılanı yok: boş lokasyon listesi müdür için `out_of_scope`, owner/admin için izin.
- **D-Y5:** Kaydedilmemiş değişiklik listesi yalnız düzenlemenin sahibine gidiyor.
- **Taslak adı:** Gerçekçi en uzun ad 76 karakter; tablonun 1-80 sınırı içinde. Ad döngüsü sonlu.
- **Web/API sözleşmesi:** Eklenen `recovered_draft_name` mevcut şemayı bozmuyor (zod şeması fazladan alanı atıyor). PT409 + `schedule.draft_being_edited` API'de 409 ve okunur bir sebep anahtarına dönüşüyor.
- **Katalog:** `autosave` için `schedule.edit` sınıf satırı eklenmiş.

**Kanıt**
Denemelerin hepsi tek transaction içinde ve geri alınarak (`begin; <migration>; …; rollback;`) yapıldı, `docker exec -i supabase_db_newfork-clean psql`. `db.lock` alınmadı.

| Deneme | Sonuç |
|---|---|
| `trial2` (yayınlanmış haftada sil, sonra otomatik kaydet) | Auto-save taslağında 1 satır (beklenen 0) |
| `trial3` (`has_function_privilege`) | Yalnız `service_role` = t |
| `trial4` (başkasının taslağını isteme) | `conflict` cevabı, Can'ın eski düzenlemesi `recovered` |
| `trial5` (yeni pgTAP dosyası migration ile) | 26 ok, 0 not ok, 0 ERROR |

Ortak yerel DB'ye sızıntı yok: denemelerden sonra `autosave_schedule_edit_session_service` fonksiyonundan DB'de 0 tane var. Eski tanımlar `pg_get_functiondef` ile okundu (close, delete, authorize, authz_check, location_is_live).

**Hafıza notu (dosyaya yazılmadı)**
- **Kurtarma ve otomatik kayıt yolu:** Normal kaydet akışındaki satır süzgeci (ör. `pending_op_type='delete'` satırlarını atmak) kurtarma, otomatik kayıt ya da toplu kapatma kopyasında da var mı? Yayınlanmış haftada sil + otomatik kaydet denemesiyle sına.
- **Kapıdan önce yan etki:** Bir fonksiyon, bir sonraki kontrol "conflict" diye normal cevap dönmeden önce kalıcı bir yan etki yapıyor mu (kapatma, taslak üretme)? Hata fırlatılırsa geri alınır, normal cevap dönülürse kalıcı olur ve cevap bunu söylemez.
- **"live" adlı yardımcılar:** Q-C gereği arşivli lokasyonu da düşüyor mu? Yalnız `deleted_at`'e bakan yardımcı owner'ı da kilitler; `app_private.location_is_live` kullanılmalı.
- **Kilit sırası:** Yeni bir PT409 kapısı eklenen fonksiyon, aynı satırları kilitleyen öteki servislerle aynı çalışma alanı kilidini (921) alıyor mu? Almıyorsa iki risk var: kontrolü atlatan yarış ve ters kilit sırasından kilitlenme.

(Uygulandı: `48f22117` — bulgu 1–5 ve öneri.)

### Tur 2 (`48f22117`)

KARAR: DEĞİŞİKLİK İSTE (`48f22117`)

Önceki beş bulgunun dördü kapandı. Ama ikinci bulgunun düzeltmesi yeni bir hata getirdi: bir kişi, başkasının süresi dolmuş taslağını açamaz hale geliyor.

**Bulgu: Yüksek değil, Orta. Ama düzeltmenin getirdiği bir gerileme ve test hücresi yok**
**Yer:** `supabase/migrations/20261007060000_schedule_edit_keeps_its_work.sql`, `acquire_schedule_edit_session_service` içinde şu satır:

```sql
recovery_draft_id := coalesce(recovery_draft_id, app_private.close_schedule_edit_session(set_aside));
```

**Ne oluyor:** Postgres'te COALESCE ilk dolu değeri bulunca durur, ikinci argümanı hiç çalıştırmaz. İstenen taslağın eski sahibinin kaydedilmemiş işi varsa, bu iş önce kurtarma taslağına geçer ve `recovery_draft_id` dolar. Bu durumda kişinin kenara konan kendi düzenlemesi kapatılmaz, açık kalır. Ardından yeni düzenleme eklenmeye çalışılır. "Bir kişinin bir haftada tek açık düzenlemesi" kuralını koruyan benzersizlik indeksi (`schedule_edit_sessions_active_holder_week_idx`) bunu reddeder.

**Bir kişi için etkisi:**
- Can, Plan C'yi kaydetmeden düzenliyor. Ayşe de Plan B'yi kaydetmeden düzenlerken masadan kalkmış, kirası dolmuş.
- Can Plan B'yi açmak istediğinde her denemede hata alır. Hata kodu 23505; API bunu 409 olarak döner, Can'ın ekranında çakışma hatası çıkar.
- Veri kaybı yok: Ayşe'nin ve Can'ın işi yerinde duruyor. Ama Can, Plan C düzenlemesini kaydedip ya da atıp kapatana kadar Plan B'ye giremez.
- Önceki commit (`2440386c`) bu durumda doğru çalışıyordu.

**Kanıt:** Geri alınan denemede (`trial6`) bu sıra kuruldu; Can'ın Plan B isteği `23505` döndü.

**Beklenen:**
- Kenara konan düzenleme her durumda kapatılsın, sonra iki taslak kimliğinden biri cevaba konsun:
  ```sql
  set_aside_draft := app_private.close_schedule_edit_session(set_aside);
  recovery_draft_id := coalesce(recovery_draft_id, set_aside_draft);
  ```
- Bu yol için pgTAP hücresi eklensin: kendi düzenlemesi kaydedilmemiş + istenen taslağın sahibinin kirası dolmuş ve işi kaydedilmemiş. Can Plan B'yi açabilmeli, Plan C düzenlemesi `recovered` olmalı.

**Kapanan bulgular**
1. **Silinen vardiya geri gelmiyor:** Kurtarma kopyası artık "silinecek" işaretli satırları atlıyor ve bunun hücresi var.
2. **Çakışma cevabı:** "Başkası düzenliyor" cevabında kişinin kendi düzenlemesi açık kalıyor ve bunun hücresi var. Kendi düzenlemesini kapatma kısmı yukarıdaki gerilemeyi getirdi.
3. **Arşivli lokasyon:** Yardımcı artık yetki çekirdeğinin `location_is_live` ölçüsünü kullanıyor ve çalışma alanıyla süzüyor. Kadıköy + Beşiktaş taslağında Beşiktaş arşivlenince Zeynep (Kadıköy) taslağı silebiliyor; hücresi var.
4. **Silmede kilit:** Silme artık başta kaydet ve düzenleme açmayla aynı çalışma alanı kilidini (921) alıyor. Kaydet de önce 921'i aldığı için ikisi sırayla çalışıyor; ters kilit sırasından kilitlenme kalmadı.
5. **Eksik test hücreleri:** " (2)" ve 24 saat hücreleri eklendi.

Öneri de uygulanmış: silme, kapsamını kaybetmiş kişinin kirasını artık "düzenleniyor" saymıyor; düzenleme açmayla aynı ölçü.

`schedule_resume_lease` dosyasındaki yeniden yazım D-O9 kararıyla uyumlu: eski hücre "başka kaynak istenince de eski düzenlemeyi sürdür" davranışını kilitliyordu, D-O9 bunun tersini istiyor.

**Kanıt**
Hepsi tek transaction içinde ve geri alınarak denendi (`begin; migration@48f22117; …; rollback;`). `db.lock` alınmadı.

| Ne | Sonuç |
|---|---|
| `trial6`, yukarıdaki sıra | Can'ın isteği `23505` |
| `schedule_edit_session_lifecycle` | 33 ok, 0 kırmızı ya da hata |
| `schedule_resume_lease` | 15 ok, 0 kırmızı ya da hata |

**Hafıza notu (dosyaya yazmadım)**
Düzeltmede bir yan etki `coalesce(x, yan_etkili_fonksiyon())` içine taşınmışsa dikkat: Postgres COALESCE ikinci argümanı yalnız ilki boşsa çalıştırır. Yan etkiyi ayrı bir satırda çağırmak gerekir. Bu deseni görünce iki dalın da dolu olduğu durumu (burada iki kurtarma birden) bir denemeyle sına.

(Uygulandı: `98940f92`.)

### Tur 3 (`98940f92`)

KARAR: ONAY @98940f92

Önceki turdaki hata kapandı. Bir müdürün kendi düzenlemesi kenara konduğunda artık her durumda kapanıyor ve kurtarma taslağına geçiyor. Örnek: Can Plan C'yi kaydetmeden düzenlerken, kirası dolmuş Zeynep'in tuttuğu Plan B'yi açabiliyor.

**Ne değişti**
- **Düzeltme:** Kenara konan düzenleme ayrı bir satırda kapatılıyor (`set_aside_draft_id := close(...)`). Taslak kimliklerinden hangisinin cevaba gireceği ancak bundan sonra seçiliyor. Yalnız `acquire_schedule_edit_session_service` değişti, değişiklik bu iki satır.
- **Etkisi:** Can Plan B'yi açabiliyor. Cevap Zeynep'in Auto-save taslağının adını veriyor, Can'ın Plan C düzenlemesi `recovered` oluyor, yani onun işi de kendi Auto-save taslağında. Önceki sürümde aynı istek her seferinde reddediliyordu (23505).
- **Yeni hücre:** Eklenen pgTAP hücresi bu durumu üç iddiayla kilitliyor: açılan taslak Plan B, cevaptaki ad Zeynep'in Auto-save'i, Can'ın Plan C düzenlemesi `recovered`.

**Kanıt**
Hepsi tek transaction içinde ve geri alınarak koştu (`begin; migration@98940f92; …; rollback;`). `db.lock` alınmadı, ortak DB'ye hiçbir şey kalmadı.

| Ne | Sonuç |
|---|---|
| Önceki turun hatayı gösteren denemesi (`trial7`) | Can'ın Plan B isteği artık geçiyor (önceden `23505`) |
| `schedule_edit_session_lifecycle` | 36 ok, 0 kırmızı ya da hata |
| `schedule_resume_lease` | 15 ok, 0 kırmızı ya da hata |
| `schedule_edit_session_scope` | 23 ok, 0 kırmızı ya da hata |

**Öneri (engel değil)**
İki iş birden kenara konduğunda cevap yalnız diğer müdürün Auto-save taslağının adını veriyor. Kişinin kendi Auto-save taslağı cevapta yok; taslak listesinde yine görünüyor. Bu, kodda bilerek bırakılmış ve not edilmiş bir sadeleştirme. Ekranın iki adı birden göstermesi istenirse backlog'a yazılabilir.

**Hafıza notu**
Önceki turdaki notum geçerli kalıyor: yan etkisi olan bir çağrı `coalesce(..)` içine konmamalı, ayrı satırda çağrılmalı. Bu turda düzeltme tam bu biçimde yapıldı. Yeni bir not yok.

