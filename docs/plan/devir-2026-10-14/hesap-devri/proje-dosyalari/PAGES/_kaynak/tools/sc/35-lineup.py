# Lineup (Mert 2026-10-13), read-only first stage (main b8315a0f); phone + B states (main 32bbbc47).
add("3.4", "Lineup", "lineup", "/app/schedule/lineup", r"^/app/schedule/lineup/?$", MGR,
    "Günün lineup'ı, Schedule'ın yayınlanmış verisinden canlı: her lokasyon bir kart, içinde her vardiya (Lunch, Dinner) katlanır; kişiler departman ve job altında, en erken başlayan önce (Name, Shift, Position, In – Out, Label). Gün seçici, haftanın 7 günü şeridi, lokasyon ve vardiya süzgeci. Telefonda (390) tek lokasyon ve tek vardiya: üstte Location seçimi, vardiyalar sekme (kişi sayısıyla), altında özet kartı (On the floor, First in, Last out) ve departman → job → kişi listesi; Lineup alt çubukta. Yüklenirken gri iskelet, okunamazsa ortada kart ve beyaz Try again (B görünümü). Şimdilik salt okunur; düzenleme, call off, notlar ve Publish sonraki aşamalarda.",
    "Sol menü → Schedule → Lineup", "Owner, admin, manager (masaüstü ve telefon; telefonda alt çubukta Lineup)",
    roles_sc(MGR, [sc("next-day", "Sonraki gün: tarih turuncu yanar, tıklayınca bugüne döner", O, [click("Next day")]),
                   sc("fold", "Vardiyayı katlama", O, [click(".lineup-shift-head[aria-expanded]")]),
                   sc("filter-location", "Lokasyon süzgeci: Uptown", O, path="/app/schedule/lineup?location=00000102-0000-4000-8000-000000000102"),
                   sc("loading", "Yükleniyor", O, hold=["/schedule/reference"]),
                   sc("error", "Okunamadı: Try again", O, fail=[{"path": "/schedule/reference", "status": 500, "reason": "internal"}]),
                   sc("no-access", "Erişim yok kartı", O, fail=[{"path": "/schedule/reference", "status": 403, "reason": "authz.out_of_scope"}])]))
