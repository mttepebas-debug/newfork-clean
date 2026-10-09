# TEL-KAPALI-2 — Telefonda sayfa içi Schedule bağlantıları gizli

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule (Workspace, Shift Hub, bildirim) | EKRAN-01 TEL-KAPALI-2 | nf-backend / web hattı | R1 | Oturumun kendi diff okuması (R1; bağımsız inceleme gerekmiyor) | 2026-10-06 |

## Sonrası için
- Kalıp: bir ekrana götüren sayfa içi bağlantıyı telefonda gizlemek için bileşenin başına `const phone = usePhoneWidth();` (erken dönüşlerden önce) ve bağlantıya `manager && phone ? null : …`.
- Tuzak: `App.test.tsx`'te aynı testte ikinci `render(<App />)` oturum açık kaldığı için giriş ekranını bulamaz; telefon ve masaüstü durumları ayrı testte sınanır.
- Ölçüm: web vitest 2169 (+1 atlanan); e2e schedule + scope + owner-legal-name-setup + görüntü 20/20 (2026-10-06, `86562b65`).

## Rapor

### EKRAN-01 TEL-KAPALI-2 — rapor (web hattı, nf-backend)

**Karar:** R1 · oturumun kendi diff okuması
**İzin:** R1 — main yeşile dönünce izin beklemeden gönderilir (şu an main kırmızı: TEL-KAPALI'nın CI'ında pc-2 runner'ında iki farklı e2e süre aşımı)
**Risk:** 🟢 yalnız görünür bağlantılar; çalışanın bağlantıları değişmedi
**Soru:** yok
**Sonraki:** W-1b (bağımlılık bekliyor)

#### Ne yapıldı (öncesi → sonrası)
- **Öncesi:** telefonda (768 px altı) müdür / owner Workspace'te "Open Schedule" (iki yerde) ve kurulum listesinde "First schedule view", Shift Hub'da "View current schedule", vardiya bildiriminde "Open schedule" görüyordu; dokununca "Schedule is available on a computer." çıkmazına düşüyordu.
- **Sonrası:** bu bağlantılar telefonda yok. Bildirimdeki vardiya bilgisi duruyor, yalnız bağlantı yok. Çalışanın "View current schedule" ve bildirim bağlantısı (Employee view → Schedule) değişmedi. Masaüstünde değişiklik yok.
- Koordinatör kararı (dayanak Mert'in "Schedule telefonda tamamen kapalı" kararı), 2026-10-06.

#### Kanıt
- Önce kırmızı: `App.test.tsx` "offers no way into Schedule from Workspace on a phone (TEL-KAPALI-2)" (telefonda 2 bağlantı buldu).
- Tam kapı (`86562b65`): lint + typecheck + test + build EXIT=0 — ui 9, shared 210, api 990, web 2169 (+1 atlanan).
- E2E (db.lock): `schedule-*`, `scope-and-employee-view`, `owner-legal-name-setup` + görüntü senaryosu: 20 passed (5.6m).
- Ekran görüntüleri: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\optimistic-dewdney-c78421\artifacts\nf-backend\TEL-KAPALI-2\1-desktop-1440-workspace.png` (masaüstünde "Open Schedule" var), `2-phone-390-workspace.png` (telefonda yok).

#### Açık kalan
- Yok.

#### Ekranda ne değişti
- Telefonda: Workspace (Open shifts kutusu, hızlı işlemler, kurulum listesi), Shift Hub vaka ayrıntısı, vardiya bildirimi — Schedule bağlantıları yok.
