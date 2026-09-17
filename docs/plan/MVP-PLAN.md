# MVP Plan: self-serve ücretli lansman (ABD, İngilizce)

Durum: UZLAŞILDI (2026-09-16). ROADMAP.md bu plana bağlıdır; eski 13 adımlık sıra F-fazlarına yeniden dizilecek. Codex döneminden gelen ID'ler (BL-xxx) korunuyor; yeni işler yeni ID alıyor.

## Hedef
Bir ABD'li restoran sahibi landing sayfasından kaydolur ve trial başlatır. Lokasyonlarını ve çalışanlarını ekler, Schedule yayınlar, Stripe ile ödeme yapar. Çalışanlar davetle katılır, programlarını görür, izin ve vardiya değişikliği talep eder, Line Up, belge ve duyuruları takip eder. Önemli olaylar e-posta ve push bildirimi olarak ulaşır.

## Repo taraması: mevcut durum (2026-09-16, rescue dahil)
- **Güçlü:** Schedule (web ~30k, api ~8k satır), Settings (~12k), Employees + Documents lifecycle, Account/Workspaces, Employee Hub (~5k), Availability, Announcements. 281 migration, 118 pgTAP, 289 unit test dosyası.
- **Yok:**
  - Stripe/billing (yalnızca trial hakkı migration'ı var)
  - Landing sayfası
  - Bildirim e-postası (Resend yalnızca auth ve davet için kullanılıyor)
  - Push bildirimi
  - Hata izleme (Sentry vb.)
  - CI (.github yok)
- **Hosted:**
  - Supabase projesi `ndcqztpwwzxcqlidgcwi` ESKİ Newfork şemasını taşıyor (Nisan–Ağustos migration'ları, payroll/compliance). Yeni rebuild'in migration zinciri (20260817'den itibaren) bununla uyumsuz, yani bu projeye migration uygulanamaz.
  - Vercel projesi bağlı. `vercel.json` cron'u dakikada bir çalışıyor, bu da Pro plan gerektiriyor.
- **Temizlik:**
  - Production route'larında ~5,7k satır geliştirme ve prototip kodu var (`/dev/*`, `schedule-badge-lab`).
  - Kiosk ve Time Entries route'ları açık.
  - Env'de `LOCAL_SSN_ENCRYPTION_KEY` duruyor (SSN kapsam dışı).

## Fazlar
Her faz bir kapıdır. Paralel çalışma DB kilidi kuralına bağlıdır (CLAUDE.md).

### F0 — Sağlam temel
| ID | İş | Not |
|---|---|---|
| RESCUE-001 | WIP'i main'e al | done d19542d |
| TEST-001 | Kırmızı unit testler ve vitest env izolasyonu | done 95063a7 |
| OPS-010 | Hosted: migration'lar uygulandı, Vercel deploy; smoke AUTH-002 + AUTH-UX-001 sonrası | smoke bekliyor |
| OPS-014 | Notification outbox dakikalık tetikleme: Supabase pg_cron (Vercel Hobby) | OPS-010 sonrası |
| OPS-011 | Minimal CI (GitHub Actions) | done 6509e38 |
| OPS-012 | Production hijyeni: Kiosk ve Time Entries gizlendi, SSN env ve README temizlendi | done 8642575 |
| THEME-001 | Dark temayı emekliye ayır (yalnızca light) | done c0ecf3d |
| THEME-002 | Light token seti, z-index ve kontrast sıkılaştırması | done 6f677a0 |
| AUTH-001 | Kayıt sonrası döngü, switcher UI, sign-in prod metni, context 503 | done a69276e |
| AUTH-002 | DB guard (davetli create edemez) + workspace bazlı onboarding getter + API (DB lock) | hazır, AUTH-UX-001 ile paralel |
| AUTH-UX-001 | Auth/davet/onboarding akışı UI: mockup → web implementasyonu (owner onboarding çıkışı, switcher recovery, Not now, davet kartı, /welcome/:workspaceId, revoke edilmiş oturum) | hazır |
| THEME-004 | Kalan sayfa CSS'leri token'a, `--theme-on-accent`, employee ve kalan manager yüzeylerinde AA | done bd6877a |
| OPS-013 | Hata izleme: Sentry (ücretsiz) + Vercel logları | OPS-010 sonrası |

### F1 — Çekirdek akışların kapanışı (manager + employee)
| ID | İş |
|---|---|
| UI-DOC-001 | Documents publication runtime |
| BL-048 | Add Department crash triyajı |
| BL-038 | Schedule Templates kararları ve UAT |
| REQ-AUDIT → REQ-001/002/003 | Time off ve release/cover/swap uçtan uca |
| OBS-002 | Availability → Schedule zinciri |
| EH-001 (BL-056/057) | Employee Hub nav ve polish; responsive web yeterli |
| BL-055 | Global tarih/saat tercihinin tüketilmesi |

### F2 — Günlük operasyon
| ID | İş |
|---|---|
| LU-000 → LU-001 (BL-040) | Line Up: ayrı plan konuşması, ardından sadeleştirme |
| ANN-001 | Duyuru kişi hedeflemesi ve okundu takibi |
| BL-053 | Acknowledgements sayfasının MVP rolü |

### F3 — Bildirimler
| ID | İş |
|---|---|
| NOTIF-001 (BL-045/046) | Producer kataloğu audit'i: hangi olay kime, hangi kanaldan gider |
| NOTIF-002 | E-posta teslimatı: Resend, şablonlar, tercih, dedup, hata/retry, cron (BL-027 anahtar yenileme önce) |
| NOTIF-003 | Web push (PWA): service worker, abonelik, tercih ve teslimat |

### F4 — Ticari kapı
| ID | İş |
|---|---|
| BL-034 | Landing sayfası ve signup hunisi |
| BL-059 | Stripe: plan/limit, 14 gün trial, checkout, webhook, fatura portalı, tekrar trial engeli |
| BL-007/008 | Onboarding yedi adım ve avatar (lansman için gerekli mi, karar gerekiyor) |

### F5 — Guardrail ve polish
| ID | İş |
|---|---|
| BL-042/043/047/054 | Admin polish (Jobs drawer dahil) |
| THEME-003 | Yakın renk tonlarını token'lara birleştir (görsel değişiklik; kullanıcıyla önce/sonra karşılaştırması) |
| OBS-001 | Invite/access mutasyon kabulü |

### F6 — Lansman hazırlığı
| ID | İş |
|---|---|
| BL-058 | Beş tenant E2E (hosted ortamda) |
| REL-001 | Production ortamı, migration, provider/cron smoke, yedekleme, rate limit, security advisor, destek e-postası |
| REL-002 | Soft launch: ilk ücretli kullanıcılar ve geri bildirim döngüsü |

## MVP sonrası
Native mobil uygulama, BL-067 saat limitleri, Kiosk, Time Tracking, payroll, compliance, i18n (Türkçe), default-hours review, shift preset'leri.

## Kararlar (kullanıcı, 2026-09-16)
- Hosted: eski Supabase hesabı referans olarak kalır. Kullanıcı yeni Supabase hesabını bağlayacak ve OPS-010 o hesapta yeni proje ile yapılacak.
- Push: MVP'de web push (PWA). Native uygulama MVP sonrası.
- Compliance, payroll, time tracking, break ve bunlarla ilişkili her şey (BL-067 saat limitleri dahil) MVP sonrası.
- Tema: yalnızca light; dark emekli (THEME-001/002). Mobilde Schedule Export yok.
- Fazlar sırayla ilerler: F0 → F6. Bir faz içindeki task'lar paralel çalışabilir.

## Açık kararlar
1. Onboarding yedi adım ve avatar (BL-007/008) lansman için şart mı? (F4'ten önce sorulacak)
