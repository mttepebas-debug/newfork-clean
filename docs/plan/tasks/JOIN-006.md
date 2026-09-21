# JOIN-006 Durum ekranları: askıda, çıkarıldın, kapandı
Status: draft
Session: -   Branch: task/join-006   Worktree: newfork-wt/join-006   DB: -

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
