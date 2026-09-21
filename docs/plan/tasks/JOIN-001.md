# JOIN-001 Katılım zinciri: davet, onboarding ve business yaşam döngüsü (şemsiye)
Status: active (2026-09-19; kullanıcı kararı: "MVP roadmap listesinde ilk sıraya bu oturmalı"). 2026-09-21: dilimler JOIN-002…JOIN-007 olarak yeniden çıkarıldı; aşağıdaki J1–J7 taslağı ve durum matrisi ölçüm öncesi tahmindir, yerini denetim tablosuna bıraktı.
Session: koordinatör dağıtır; dilim başına ayrı session. DB: J3 ve J6 kilit ister.
Öneri: dilim başına Opus 5 / high (mantık + DB), UI dilimlerinde mevcut UI-PRE-001 session'ı devam eder.

Goal: Bir kullanıcının bir business'a bağlanma (ya da bağlanmama) yolunun TAMAMI kapalı olsun. "Kapalı" demek: her durum kombinasyonu bir kez elle üretilmiş, davranışı yazılmış, hatası düzeltilmiş ve testle sabitlenmiş olsun. Bu faz bitmeden F1 çekirdek akışlarına geçilmez.

Kapsam sınırı: kullanıcı bir business'ın aktif üyesi olduktan SONRAKİ işler (Schedule, Requests, Line Up, duyurular) bu şemsiyenin dışındadır. İçeride kalanlar: giriş, davet, onboarding, çakışma durumları, belge adımı, business'ın kapanması/devri/askıya alınması ve hesabın silinmesi.

## Durum matrisi
Sütunlar: durum | bugünkü hâl | kapandığı dilim. "bilinmiyor" satırlarını J1 ölçer ve bu tabloyu günceller.

### A Giriş
| A1 | sign-in giriş modu eski tasarım dilinde | D4 |
| A2 | kayıt modu, `/account-recovery`, sonlanan oturum ekranı | J6 |

### B Davet
| B1 | davet oluşturma + e-posta teslimi | var |
| B2 | preview / accept / decline uçları var; decline'ın UI yolu ve sonucu | bilinmiyor → J1 |
| B3 | yanlış hesapla accept: ekran var ama sunucunun İngilizce cümlesine bağlı (API artık 42501 → 403) | J2 |
| B4 | süresi geçmiş ya da iptal edilmiş davet token'ı | bilinmiyor → J1 |
| B5 | birden fazla pending davet; biri kabul edilince diğerlerinin akıbeti | bilinmiyor → J1, düzeltme J2 |
| B6 | zaten üye olunan business'a ikinci davet | bilinmiyor → J1 |
| B7 | revoke / reminder / remove access mutasyonları kabul edilmedi (OBS-001 buraya katlandı) | J2 |
| B8 | davet satırında rol ve davet eden görünmüyor | D5 (DB kilidi) |
| B9 | `/v1/invitations/pending|accept|decline` auth hatasında 409 dönüyor, 401 olmalı | J2 |

### C Çakışma
| C1 | pending davet varken kendi business'ını kurma: DB guard var (AUTH-002) | doğrulama J1 |
| C2 | kurulumu bitmemiş business varken davet: pending, o business'ı sahibi olmayan üyeye "In progress" altında listeliyor | J2 |
| C3 | aktif business varken davet: switcher üç grubu gösteriyor | var (D1) |

### D Onboarding
| D-a | employee onboarding: adım modeli, profile bölünmesi, belge sayfası | D2 (aktif) |
| D-b | owner sihirbazı: çerçeve, çoklu departman, timezone, adım 4 job+lokasyon kapısı | D3 |
| D-c | yarıda bırakma: `reset` / `leave` / yeniden giriş davranışı uçtan uca doğrulanmadı | J3 |
| D-d | `finalizeActivation` reddedilirse sayfa asılı kalıyor | J3 |
| D-e | erişilemeyen `workspaceId` için P0002 → 503; 404 olmalı | J3 |
| D-f | `supabase/seed.sql:143` "Pending Demo" üyeliği `pending_activation` ama onboarding case'i yok | J3 (DB kilidi) |
| D-g | owner kurulumu yarım + owner olmayan üye | AUTH-004, done |

### E Business yaşam döngüsü
| E1 | kurulumu bitmemiş business'ı discard: 10 dk reauth kapısına takılıyor | karar + iş J4 |
| E2 | closure ve closure/cancel uçları var; uçtan uca akış doğrulanmadı | J4 |
| E3 | ownership transfer (teklif / respond / cancel / candidates) uçları var; uçtan uca ve UI doğrulanmadı | J4 |
| E4 | `SuspendedOrganizationStatusPage` var; `membership_status = 'suspended'` hangi yoldan geliyor, ekran gerçekten görülüyor mu | bilinmiyor → J1, iş J4 |
| E5 | hesap silme + geri alma; silme işi artık pg_cron'da (OPS-014) | doğrulama J4 |
| E6 | Workspaces sayfasının satır DIŞI metinleri eski dilde (başlık, devir/kapatma panelleri, ham hata fallback'leri) | J4 |
| E7 | son satırın "…" menüsü kırpılıyor (`.workspace-list { overflow: hidden }`) | J4 |

### F Belge
| F1 | onboarding belge sayfası (tek adım "Documents") | D2 |
| F2 | HATA: `DocumentReviewDrawer`'da yükleme/silme/erteleme `lifecycle_revision`'ı artırıyor, kullanıcının girdiği son kullanma tarihi siliniyor | J5 |
| F3 | drawer'ın 10 mutation'ından 8'i test edilmiyor; D2 bir kısmına pin testi yazıyor | kalanı J5 |

### G Test tabanı
| G1 | üç pgTAP dosyası (onboarding/document) BL-052'den beri kırmızı, RLS sözleşmesi doğrulanmıyor | J6 |
| G2 | web `EmployeeOnboardingPage` testleri yük altında flaky (izole PASS) | J6 |

## Dilimler
- **D2–D5** — UI-PRE-001 (aktif, `task/ui-pre-001` worker'ı): employee onboarding, owner sihirbazı, sign-in, davet satırı. Kendi dosyasında izlenir; bu şemsiyenin UI ayağıdır.
- **J1 Durum turu (salt okunur, ilk kapı).** Matristeki "bilinmiyor" satırlarının hepsi local'de elle üretilir, davranışı yazılır, bu dosya güncellenir. Kod değişmez; bulunan her hata kendi dilimine yazılır. Çıktı: doldurulmuş matris + hata listesi.
- **J2 Davet yaşam döngüsü.** B3, B5, B7, B9, C2. OBS-001 (reminder/revoke/remove access kabulü) burada kapanır.
- **J3 Yarım kalan onboarding.** D-c, D-d, D-e, D-f. DB kilidi ister (seed + P0002 → 404).
- **J4 Business yaşam döngüsü.** E1–E7. E1 için kullanıcı kararı gerekiyor (satıra parola adımı mı, kurulumu bitmemiş business'ı reauth kapısından muaf tutmak mı).
- **J5 Belge tarafı.** F2 (veri kaybı hatası) ve F3'ün kalan mutation testleri.
- **J6 Kalan giriş ekranları ve test tabanı.** A2, G1, G2.
- **J7 (küçük, ayrı) Employee drawer atama kapısı.** Kullanıcı kararı 2026-09-18: uygulama içi `EmployeeDrawer` da onboarding adım 4 ile aynı kuralı alır (en az 1 job + 1 lokasyon; `is_remote` ya da `is_excluded_from_schedule` muaf; karşılanmazsa kaydet deaktif). Create ve edit yolları, mevcut testler, API'de kuralın zaten olup olmadığı.

Sıra: J1 önce (diğer dilimlerin kapsamını o keser). J2/J3/J4 J1'den sonra, DB kilidi çakışmadığı sürece paralel. D2–D5 kendi hızında devam eder. J5, J6, J7 en sonda.

Done when: matristeki her satır ya "var + test" ya da bilinçli "MVP sonrası" olarak işaretli; her dilim kendi testleriyle main'de; hosted smoke bu zincir üzerinden geçiyor.
Test plan: dilim başına hedefli web/api testleri + etkilenen pgTAP; şemsiye kapanışında beş senaryoluk elle tur (yeni owner, davetli employee, çoklu davet, devir, kapatma).
Risk: kapsam geniş ve çoğu "bilinmiyor" — bu yüzden J1 salt okunur kapı olarak ayrıldı. İkinci risk: J3/J4 DB'ye dokunuyor, kilit sırası koordinatörde.

## Notes / Result
- 2026-09-19 açılış: kullanıcı bu zinciri MVP sırasının başına koydu. OBS-001 ve UI-PRE-001 bu şemsiyenin altına alındı; BACKLOG'daki ilgili satırlar buraya işaret ediyor.

## 2026-09-21 — plan ↔ uygulama denetimi ve yeni dilimler

Katılım mimarisi PLAN'ı (M/R/E/G/B/S) kanıtla ölçüldü: 45 maddenin 9'u ✅, 19'u 🟡, 5'i ⚠️, 5'i ❌, 7'si doğrulanamadı. Ölçüm özeti ve kanıtlar bu task'ın oturum raporunda; yapısal kararlar aşağıda.

**Kullanıcı kararları (2026-09-21):**
- `manager` rolü ve workspace başına rol/izin sistemi **korunur**, planın rol listesi genişler.
- `membership_status = 'pending_activation'` **korunur**; kullanılmayan `'invited'` değeri kullanımdan kalkar.
- Workspace durumu **tek alanda** toplanır: `draft | active | suspended | closure_scheduled | closed`.
- B1/B2 ödeme **kapsam dışı** (Stripe sonra); `workspace_entitlements` tabloları silinmez, okunmaz.
- Tasarım kararları Claude'a bırakıldı: ölçüt uygulamanın kendi renk/token/buton dili ve profesyonel sonuç. Canvas bağlayıcı değil, referans.

**Bu task'ın iddialarından ölçümle düşenler:** B3 ("API artık 403 dönüyor" — 409 dönüyor), B9 ("auth hatasında 409" — 401 dönüyor, düzelmiş), B7 ("revoke kabul edilmedi" — çalışıyor, 204).

**Dilimler (sıra bağlayıcı):** JOIN-002 (durum modeli, DB) → JOIN-003 (resolver + tek hub) → JOIN-004 (davet sözleşmesi + altı hâl + admin) → JOIN-005 (switcher + davet bildirimi) → JOIN-006 (durum ekranları) → JOIN-007 (senaryo kapanışı).

