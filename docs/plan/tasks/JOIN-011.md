# JOIN-011 Hesap alaninin kalani: belgeler, kendi istihdam kaydin, rozetler
Status: done (`c3e4af2`, `02a7850`); owner resmî adı eksik kaldı → BL-080
Session: -   Branch: task/join-011   Worktree: yok   DB: KILIT

Plan ID'leri: E3 (hesap ici), M1, M5 + kullanici kapsami 2026-09-21

Goal: Hesap alaninin alti sekmesi de tek konuya baksin ve kisi kendi verdigi bilgiyi kendisi duzeltebilsin.

In scope:
- **Account > Documents**: workspace secen `<select>` kalkar (`AccountDocumentsPage.tsx`, 93 satir); belgeler workspace'e gore gruplu listelenir, grup basina bekleyen is sayisi gorunur.
- **Kendi istihdam kaydin**: kisi kendi `employee_private_profiles` satirini (resmi ad, telefon, acil durum kisisi) okur ve duzeltir. Bugun bunu yalniz employee onboarding yaziyor; owner hicbir zaman calistirmadigi icin resmi adi hicbir yerde yok (BL-080). Yeni bir self-read/self-write RPC gerekir; `internal_note` ve yonetici alanlari gorunmez.
- **Rozet kurali**: account nav'inda sekme basina, sidebar hesap butonunda toplam. Sayi "senden bir sey bekleniyor" demek; okumakla degil is bitince kapanir.

Out of scope: gorunen adi tek kaynaga baglamak (BL-079), isletme ayarlari.
Done when: her sekme kendi konusunda; `<select>` yok; kisi kendi resmi adini girebiliyor ve owner'in resmi adi artik bos degil; rozetler testli.
Touches: `apps/web/src/account/*`, `supabase/migrations/*`, `packages/shared`.
Risk: self-write RPC yeni bir yazma yuzeyi; yalniz kendi satiri, yalniz kisiye ait alanlar, pgTAP ile sinirlanir.

## Notes / Result
