# Foundation checks for the PAGES engine: loading, server error and the new viewers.
extend("2.0", [
    sc("loading", "Yükleniyor: dört kartın gri iskeleti (Loading Workspace)", O, hold=[r"/workspace$"]),
    sc("error", "Okunamadı: We couldn't load Workspace + Try again (sunucunun cümlesi görünmez)", O, fail=[{"path": r"/workspace$", "method": "GET", "status": 500}]),
    sc("admin", "Admin · Daniel Brooks: bütün workspace", A),
    sc("shift-lead", "Shift Lead (özel rol) · Carlos Rivera", C),
], part="Sayfa durumları")
