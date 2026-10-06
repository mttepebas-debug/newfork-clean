# JOIN-006 Durum ekranları: askıda, çıkarıldın, kapandı
Status: done (2026-09-21, bir madde JOIN-010'a ayrildi)
Session: -   Branch: task/join-006   Worktree: yok   DB: KILIT (list_my_workspaces)

Plan ID'leri: E7, G4 (UI yarısı), S12, S14

Goal: Bir hesabın önü kapandığında ne olduğunu ve ne yapabileceğini aynı çerçevede okusun.

In scope:
- **Workspace askıda**: mevcut `SuspendedOrganizationStatusPage` metni workspace adını ve "diğer workspace'lerin etkilenmedi"i söyler.
- **Üyelikten çıkarıldın** (yeni): `membership_status = 'removed'` (JOIN-002) olan üyelik için ekran; tek eylem hub'a dönmek.
- **Workspace kapandı** (yeni): `lifecycle_status = 'closed'`; kapanma tarihi ve varsa veri saklama süresi.
- `ProtectedRoute.tsx:43-45` yükleme hatasından **ham `{error}` kalkar**; yerine sabit cümle ve "Try again" / "Choose a workspace".
- Beş hâl (yükleniyor, owner bitirmedi, yükleme hatası, askıda, çıkarıldın, kapandı) tek `PreBizFrame` altında, tek bileşen ailesiyle.

Out of scope: hesap silme/kurtarma ekranı (var, dokunulmuyor).
Done when: her hâl için bir render testi; S12 ve S14 elle turu; ham sunucu mesajı basan yer kalmadığına dair grep kanıtı.
Touches: `apps/web/src/auth/ProtectedRoute.tsx`, `apps/web/src/shell/SuspendedOrganizationStatusPage.tsx`, yeni durum ekranları, `apps/web/src/auth/resolveLanding.ts` (durum → ekran).
Test plan: Vitest render testleri + grep.
Risk: düşük.

## Notes / Result
- 2026-09-21 sonuc. Migration `20260921220000_the_list_explains_its_endings`.
- **Asil bulgu:** ucunden ikisi ekrana hic ulasamiyordu, cunku `list_my_workspaces` onlari **eliyordu**. Kapanan workspace `lifecycle_status <> 'deleted'` filtresine, erisimi alinan hesap da `employee_access_snapshots` filtresine takiliyordu. Ikisi de listeden dusunce workspace hic var olmamis gibi okunuyor ve aciklanacak bir yer kalmiyor.
- Liste artik ikisini de tasiyor ve hangisi oldugunu soyluyor: yasam dongusu kapanani, yeni `access_removed` bayragi ise "erisimin alindi"yi "workspace askida"dan ayiriyor. Ikisi de bugune kadar ayni `suspended` uyelik durumu olarak kaydediliyordu.
- `SuspendedOrganizationStatusPage` yerine `WorkspaceStatusPage`: uc hal tek sayfada, her biri kendi basligi ve cumlesiyle, hepsinde "Choose a workspace". Rota `/workspaces/status/:workspaceId`; eski iki yol yonlendirmeye indi.
- Hub'da yeni bolum: **"No longer open to you"** - rozet (On hold / Access removed / Closed) ve "Why" dugmesi. Bu satirlar artik "Where you work" icinde degil.
- `ProtectedRoute`'taki ham `{error}` kalkti. Ekranda "Could not query the database" gibi cumleler cikiyordu; suclayici okunuyor ve ne yapilacagini soylemiyor.
- **JOIN-010'a ayrilan madde:** `membership_status = 'removed'`. Bugun erisim kaldirma `suspended` + snapshot yaziyor ve bu geri alinabilir bir ozellik (restore). `removed` yazmaya gecmek 9 fonksiyonu (rehire kabul yolu, `enforce_membership_role_change`, restore, liste) etkiliyor. JOIN-002'nin regresyonundan sonra durum semantigini yan etki olarak degistirmiyorum; kendi dilimi olacak.
- **Kanit:** `WorkspaceStatusPage.test.tsx` 5/5, `WorkspaceHubPage.test.tsx` 13/13 (uc ending icin tablo testi), `ProtectedRoute.test.tsx` ham mesaj yok assert'i, `workspace_rls` 119/119, `account_workspace_controls` 52/52, `typecheck`/`test`/`lint`/`build` PASS.
- Iki pgTAP assert'i "kapanan workspace listeden kaybolur" davranisini sabitliyordu; yeni sozlesmeye cevrildi (listede kalir, kapali olarak isaretlenir).

