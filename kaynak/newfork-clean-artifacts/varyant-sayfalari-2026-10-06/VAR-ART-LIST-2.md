# VAR-ART-LIST-2 — Sistem 1 + tek tablolu Requests (nf-arayuz)

- **Karar:** R0, aynı bağlantı güncellendi (Version 2): https://claude.ai/artifact/R22hrq2pwAET22CKT6K1BE — yalnız Sistem 1; öteki sistemler kaldırıldı. main'e girmez.
- **İzin:** gerekmiyor (paylaşım sahibin Share menüsünden).
- **Risk:** 🟢 1440 ve 390'da taşma yok, sayfa hatasız; 🟠 tek tablo veri katmanında iş ister (aşağıda b).
- **Soru:** (a) Closed listesinin uzunluğu Mert'e sorulacak; önerim aşağıda.
- **Sonraki:** LIST-YESIL (ortak dildeki üç düğme yeşile), sonra boşta.

## Sayfada ne var
- Employees tam sayfa; **Requests tam sayfa**; Requests'in "Request type" süzgeci açık hâli; Announcements ve Notifications küçük önizleme (tıklayınca büyür).
- Requests: sekme yalnız bir satır — **Needs review (6)** (karar sende: bekleyen izin + müdür onayı bekleyen takas / cover / açık vardiya), **In progress (2)** (çalışanlardan cevap bekleniyor: Finding cover, Awaiting response), **Closed**. Önerinle aynı; daha iyisini görmedim.
- Süzgeç satırı: Location · **Request type** (çoklu: Time off, Swap, Cover, Open shift) · arama. Sağ uçta düğme yok — doğrulandı: Requests'te ana eylem düğmesi yok (envanter, `ScheduleRequestsPage.tsx`).
- Türler koddan: vardiya değişikliği `kind` = `swap`, `cover`, `open_pickup` (`packages/shared` `exchange_kind`; ekranda "Cover" / "Open shift"); izin iptal talebi ayrı tür değil, izin satırının ikinci satırında ("Cancels approved time off").
- Sütunlar: Employee (altında türe özgü ikinci satır: açılan vardiya sayısı, takasın karşılığı, aday sayısı, iptal), Type (renkli işaret + metin), When (izinde tarih, vardiyada gün + saat), Decide by, Status, Review. 6 satır, üç tür karışık, Decide by'a göre sıralı.
- Görüntüler (1440): `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\VAR-ART-LIST-2\` — `s1-employees.png`, `s1-requests.png`, `s1-requests-filter.png`, `s1-announcements.png`, `s1-notifications.png`, `_whole-page.png`.

## (a) Tarih süzgeci kalkınca Closed
- Bugün: izin listesi "Newest / Older" sayfalarıyla gelir (sayfalı); vardiya değişiklikleri ise adreste `from` / `to` ile bugün → +6 hafta penceresinde okunur (görünür tarih seçici yok).
- Önerim: Closed **en yeni karar en üstte**, sayfa sonunda "Load older" (sayfalı, tarih seçici yok); arama tarihi de bulur ("Oct 11", "Ali"). Needs review / In progress kısa listeler, sayfalama gerekmez. Dayanak: ILKELER anti-hedef "ayar cehennemi" (tarih seçici yerine sıralama + arama).

## (b) Veri katmanı
- Bugün **iki ayrı uç**: izin `GET /v1/workspaces/:w/schedule/requests` (`apps/web/src/schedule/requests-data.ts:50`), vardiya değişikliği `GET /v1/workspaces/:w/shift-exchanges` (`shift-exchanges/exchange-data.ts:62`). İzinleri ayrı (`requests.read`, `exchange.read`).
- Needs review / In progress: istemcide iki listeyi birleştirmek mümkün (kısa listeler; ikisi de yüklenir, Decide by'a göre sıralanır; yetkisi olmayan tür süzgeçte hiç görünmez).
- Closed: iki ayrı sayfalamayı tek "en yeni üstte" sıraya birleştirmek istemcide doğru yapılamaz (sayfa sınırları kayar, sayaç tutmaz). **Birleşik bir okuma ucu gerekir** (tek imleç, tek sıralama, tür süzgeci sunucuda) — `nf-backend` işi; yetki iki kapıyı da ayrı ayrı uygulamalı. Önerim: önce açık sekmeler istemci birleşimiyle, Closed için birleşik uç ayrı dilim.
