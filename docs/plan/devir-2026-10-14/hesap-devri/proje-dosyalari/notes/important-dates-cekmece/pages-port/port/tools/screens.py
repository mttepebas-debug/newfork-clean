# Writes screens.json: the numbered PAGES screens (one per app route) with
# their Turkish description and example scenarios. Edit here, then run:
#   python3 tools/screens.py
import json, os
O, M, E = "owner", "manager", "employee"
# admin: Daniel Brooks (whole workspace); custom: Carlos Rivera, Downtown Shift Lead (a custom manager-class role).
A, C = "admin", "custom"
MGR = [O, M]
ALL = [O, M, E]
def roles_sc(roles, extra=()):
    names = {O: "Owner · Mert Tepebas", M: "Manager · Rachel Adams (Downtown)", E: "Employee · Maria Lopez"}
    return [*({"id": r, "label": names[r], "role": r} for r in roles), *extra]

S = []
def sc(id, label, role=None, steps=None, **kw):
    d = {"id": id, "label": label}
    if role: d["role"] = role
    if steps: d["steps"] = steps
    d.update(kw)
    return d
def click(t, within=None):
    d = {"click": t if t.startswith(("text=", "input", "button", "[", ".")) else "text=" + t}
    if within: d["within"] = within
    return d
def fill(sel, value): return {"fill": sel, "value": value}
TOK = "8f2c41d9b7a64e0c9d3b5a7e1f6c2d48"
def add(no, title, area, path, match, roles, ne, nerede, kim, scenarios=None, signed_out=False):
    S.append({"no": no, "title": title, "area": area, "path": path, "match": match, "roles": roles,
              "signedOut": signed_out, "ne": ne, "nerede": nerede, "kim": kim,
              "scenarios": scenarios or roles_sc(roles or [O])})

# 1 · Auth and everything that hangs on it
add("1.0", "Sign in", "sign-in", "/sign-in", r"^/sign-in/?$", [],
    "Giriş ekranı: e-posta ve parola, parolamı unuttum bağlantısı, davetle gelen kişi için hesap açma.",
    "Uygulamanın adresi açılınca, oturum yoksa", "Oturumu olmayan herkes",
    [{"id": "form", "label": "Giriş formu"},
     {"id": "expired", "label": "Oturum süresi doldu", "setup": "session-expired"},
     {"id": "create", "label": "Workspace hesabı aç", "steps": [{"click": "text=Create a workspace account"}]},
     {"id": "invite", "label": "Davetle gelen kişi", "state": {"from": "/invite/accept?token=demo"}},
     {"id": "wrong", "label": "Yanlış parola", "steps": [
         {"fill": "input[type=email]", "value": "owner@harborvine.test"},
         {"fill": "input[type=password]", "value": "wrong-password"},
         {"click": "button[type=submit]"}]}], signed_out=True)
add("1.1", "Forgot password", "sign-in", "/forgot-password", r"^/forgot-password/?$", [],
    "Parola sıfırlama bağlantısı isteme ekranı.", "Sign in → \"Forgot password?\"", "Oturumu olmayan herkes",
    [sc("form", "Boş form"), sc("sent", "Bağlantı gönderildi", steps=[fill("input[type=email]", "owner@harborvine.test"), click("Send reset link")])], signed_out=True)
add("1.2", "Reset password", "sign-in", "/reset-password", r"^/reset-password/?$", [],
    "E-postadaki bağlantıyla gelen kişinin yeni parola belirlediği ekran.", "Parola sıfırlama e-postasındaki bağlantı", "Bağlantıyla gelen kişi",
    [sc("invalid", "Bağlantısız açılış (geçersiz)"), sc("valid", "Geçerli bağlantı: yeni parola", path="/reset-password#token_hash=demo-reset-link")], signed_out=True)
add("1.3", "Account recovery", "sign-in", "/account-recovery", r"^/account-recovery/?$", [],
    "Hesabına giremeyen kişinin yardım istediği ekran.", "Sign in → hesap kurtarma bağlantısı", "Oturumu olmayan herkes",
    [sc("form", "Bağlantısız açılış (düğme kapalı)"), sc("link", "E-postadaki bağlantıyla", path=f"/account-recovery?token={TOK}"),
     sc("restored", "Hesap geri geldi", path=f"/account-recovery?token={TOK}", steps=[click("Restore my account")])], signed_out=True)
add("1.4", "Accept invitation", "employee-onboarding", "/invite/accept", r"^/(accept-invite|invite/accept)/?$", [E],
    "Davet bağlantısıyla gelen kişinin daveti kabul ettiği ekran. Oturumu yoksa önce 1.0 Sign in'e (davet senaryosu) gider.", "Davet e-postasındaki bağlantı", "Davet edilen kişi (giriş yapmış)",
    [sc("valid", "Geçerli davet", path=f"/invite/accept?token={TOK}"),
     sc("expired", "Süresi dolmuş", path=f"/invite/accept?token={TOK}-expired"),
     sc("revoked", "Geri alınmış", path=f"/invite/accept?token={TOK}-revoked"),
     sc("replaced", "Yerine yenisi gönderilmiş (Resend sonrası eski bağlantı)", path=f"/invite/accept?token={TOK}-replaced"),
     sc("broken", "Bozuk bağlantı", path="/invite/accept?token=abc")])
add("1.5", "Workspace hub", "workspace-hub", "/workspaces", r"^/workspaces/?$", ALL,
    "Girişten sonra workspace seçimi, bekleyen davetler, yeni workspace kurma.", "Girişten sonraki ilk ekran; sol üst workspace menüsü → All workspaces", "Herkes",
    roles_sc(ALL, [sc("join", "Davete katıl", O, [click("Join Cedar & Smoke BBQ")]), sc("closed", "Kapalı workspace nedeni", O, [click("Why Pier 9 Kitchen is not open")])]))
add("1.6", "Workspace status", "workspace-hub", "/workspaces/status", r"^/workspaces/status(/[^/]+)?/?$", ALL,
    "Askıya alınmış ya da kapanmış workspace'in durum ekranı.", "Workspace hub → durumu sorunlu workspace", "Herkes")
add("1.7", "Owner setup", "owner-onboarding", "/onboarding", r"^/onboarding/?$", [O],
    "Yeni workspace kurulum sihirbazı: işletme, lokasyonlar, ekip, ilk program.", "Workspace hub → Create a workspace", "Workspace kuran owner",
    [sc("start", "İlk adım: workspace adı", O), sc("next", "Ad girildi, sonraki adım", O, [fill("main input", "Harbor & Vine Seaport"), click("Continue")])])
add("1.8", "Employee welcome", "employee-onboarding", "/welcome", r"^/welcome(/.*)?$", [E],
    "Davet edilen çalışanın karşılama adımları: profil, belgeler, onaylar.", "Daveti kabul eden çalışanın ilk girişi", "Yeni çalışan",
    [sc("start", "Karşılama", E), sc("begin", "Başla: ilk adım", E, [click("Begin")])])
add("1.9", "Check your email", "sign-in", "/sign-in", r"^/sign-in/?$", [],
    "Hesap açtıktan sonra çıkan ekran: e-posta onay bağlantısı gönderildi, adresi onaylayıp giriş yap. Hesap, adres onaylanana kadar oturum açmaz.",
    "Sign in → \"Create a workspace account\" (ya da davet bağlantısıyla gelince hesap aç) → Create account", "Yeni hesap açan kişi",
    [sc("workspace", "Workspace hesabı açtıktan sonra", steps=[click("Create a workspace account"), fill("input[type=email]", "new.owner@harborvine.test"), fill("input[type=password]", "[GIZLI-CIKARILDI]"), click("button[type=submit]")]),
     {"id": "invite", "label": "Davetle gelen kişi hesap açtıktan sonra", "state": {"from": "/invite/accept?token=demo"}, "steps": [fill("input[type=email]", "hannah.scott@harborvine.test"), fill("input[type=password]", "[GIZLI-CIKARILDI]"), click("button[type=submit]")]}], signed_out=True)
# 2 · Workspace
add("2.0", "Workspace", "workspace", "/app/workspace", r"^/app/workspace/?$", MGR,
    "Yöneticinin ana sayfası: yapılacaklar, kurulum listesi, bekleyen işler.", "Sol menü → Workspace", "Owner, admin, manager",
    roles_sc(MGR, [sc("customize", "Kartları özelleştir", O, [click("Customize")])]))
# 3 · Schedule (its own build, from the Schedule test page source; phase 4)
SCHEDULE_SC = {
    "3.0": [sc("next", "Sonraki hafta", O, [click("Next week")]),
            sc("filter", "Karta tıklayınca filtre", O, [click('[data-shift-badge]:not([data-ghost="true"])')]),
            sc("settings", "Görünüm ayarları", O, [click("Settings", within="main")]),
            sc("drafts", "Taslak menüsü", O, [click("Draft selector: New Schedule")]),
            sc("past-draft", "Geçen haftanın taslağı: salt okunur", O, [click("Previous week"), {"wait": 900}, click("Draft selector: New Schedule")]),
            sc("calendar", "Takvim açık: seçili haftanın günlerinde üzerine gelme", O, [click("Open schedule calendar")]),
            sc("add", "Boş taslakta vardiya ekleme", O, [click("Draft selector: New Schedule"), click("New Schedule (blank)"),
                                                       click('button[aria-label^="Add shift for Carlos Rivera"]')]),
            sc("time-off", "Tam gün izinli hücrede Add shift yok (Maria Lopez)", O, [click("Draft selector: New Schedule"), click("New Schedule (blank)")])],
    "3.1": [sc("excel", "Excel biçimi", O, [click("Excel")]), sc("png", "PNG biçimi", O, [click("PNG")])],
    "3.2": [sc("rename", "Şablonun adını değiştirme", O, [click("Rename template Standard week")]),
            sc("delete", "Şablonu silme (iki tık)", O, [click("Delete template Standard week")])],
}
for no, title, path, ne in [("3.0", "Schedule", "/app/schedule", "Haftalık vardiya ızgarası: düzenleme, taslak, yayınlama, Auto-fill."),
                            ("3.1", "Schedule export", "/app/schedule/export", "Programın PDF ve Excel dışa aktarma önizlemesi."),
                            ("3.2", "Schedule templates", "/app/schedule/templates", "Haftalık şablonlar: kaydet, uygula.")]:
    add(no, title, "schedule", path, "^" + path + "/?$", MGR, ne, "Sol menü → Schedule", "Owner, admin, manager (telefonda kapalı)",
        roles_sc(MGR, SCHEDULE_SC[no]))
add("3.3", "Requests", "requests", "/app/schedule/requests", r"^/app/schedule/requests/?$", MGR,
    "İki sekme (Time off, Shift changes): izin talepleri ve vardiya değişimleri tek listede. Çekmeceler Important Dates diliyle: izin (Details · Shifts · Activity), cover ve open shift (adayı seç, tek adımda ver). Swap ve cover iki taraf anlaşınca listeye düşer.", "Sol menü → Schedule → Requests", "Owner, admin, manager (manager yalnız kendi şubesi)",
    roles_sc(MGR, [sc("timeoff", "İzin çekmecesi: Ethan Brooks", O, [click('[aria-label^="Ethan Brooks, Time off"]')]),
                   sc("timeoff-shifts", "İzin çekmecesi · Shifts sekmesi", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Shifts")]),
                   sc("deny", "İzni reddetme: gerekçe", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Deny")]),
                   sc("cover", "Cover çekmecesi: Noah Garcia", O, [click('[aria-label^="Noah Garcia, Cover"]')]),
                   sc("open", "Open shift çekmecesi", O, [click('[aria-label^="Open shift, Open shift"]')]),
                   sc("swap", "Takas penceresi", O, [click('[aria-label^="Jake Thompson, Swap"]')]),
                   sc("only-timeoff", "Time off sekmesi", O, [click("Time off")]),
                   sc("shift-changes", "Shift changes sekmesi", O, [click("Shift changes")]),
                   sc("case-gone", "Bağlantıdaki talep artık yok: \"Request unavailable\" + Show all requests", O,
                      path="/app/schedule/requests?tab=shift-changes&case=97500000-0000-4000-8000-000000000001"),
                   sc("case-failed", "Bağlantıdaki talep okunamadı: \"Request could not load\" + Try again", O,
                      path="/app/schedule/requests?tab=shift-changes&case=97500000-0000-4000-8000-000000000001", setup="case-read-fail"),
                   sc("case-loading", "Bağlantıdaki talep okunuyor: \"Loading request...\"", O,
                      path="/app/schedule/requests?tab=shift-changes&case=97500000-0000-4000-8000-000000000001", setup="case-read-slow")]))
# 4 · Employees
add("4.0", "Employees", "employees", "/app/employees", r"^/app/employees/?$", MGR,
    "Çalışan listesi (All, Invited, Onboarding, Needs Attention, Active), çalışan çekmecesi, davet, rol, yeni çalışan.", "Sol menü → Employees", "Owner, admin, manager (manager kısmen düzenler)",
    roles_sc(MGR, [sc("drawer", "Çalışan çekmecesi: Maria Lopez", O, path="/app/employees?employeeId=00000601-0000-4000-8000-000000000601&section=profile"),
                   sc("uptown", "Lokasyon süzgeci: Uptown (Uptown'da ikinci lokasyon olarak çalışanlar ve owner da listede)", O, path="/app/employees?location=00000102-0000-4000-8000-000000000102"),
                   sc("add", "Yeni çalışan", O, [click("Add employee")]), sc("invited", "Davet edilenler", O, [click("Invited")]), sc("attention", "Needs Attention", O, [click("Needs Attention")]),
                   sc("reminder", "Davet bekleyen kişi: Hannah Scott, Access (Send reminder)", O, path="/app/employees?employeeId=000006e1-0000-4000-8000-0000000006e1&section=access"),
                   sc("manager-invite", "Müdür, sahibin gönderdiği daveti görür: Kevin Nguyen, Access (Send reminder, Copy link, Revoke)", M, path="/app/employees?employeeId=000006e2-0000-4000-8000-0000000006e2&section=access")]))
add("4.1", "Employee documents", "employee-documents", "/app/employees/documents", r"^/app/employees/documents/?$", [O],
    "Çalışan belgeleri: inceleme, onay, red, muafiyet, süre uzatma.", "Sol menü → Employees → Documents", "Owner, admin",
    [sc("all", "Bütün belgeler", O), sc("review", "İnceleme bekleyenler", O, [click("Needs review")]), sc("missing", "Eksikler", O, [click("Missing")]), sc("expired", "Süresi geçenler", O, [click("Expired")])])
add("4.2", "Employees archive", "employees", "/app/employees/archive", r"^/app/employees/archive/?$", MGR,
    "Arşivlenmiş çalışanlar ve geri alma.", "Employees → Archived", "Owner, admin, manager")
# 5 · Availability
add("5.0", "Availability", "availability", "/app/availability", r"^/app/availability/?$", MGR,
    "Ekibin haftalık müsaitliği ve tercihleri.", "Sol menü → Availability", "Owner, admin, manager",
    roles_sc(MGR, [sc("missing", "Göndermeyenler", O, [click("Not submitted")])]))
# 6 · Important Dates
add("6.0", "Important Dates", "important-dates", "/app/announcements/important-dates", r"^/app/announcements/important-dates(/[^/]+)?/?$", MGR,
    "Announcements altındaki tarihli duyurular: tatiller, kapalı ve kısa saatli günler, etkinlikler. Aynı çekmeceyle eklenir ve düzenlenir.",
    "Sol menü → Announcements → Important Dates", "Owner, admin, manager (manager yalnız kendi şubesi)",
    [sc("list", "Yaklaşan günler", O),
     sc("new", "Yeni gün çekmecesi", O, [click("New")]),
     sc("closed", "Kapalı gün: Kitchen deep clean (Downtown)", O, [click("Kitchen deep clean & hood service")]),
     sc("short", "Kısa saat: Hartwell private buyout (Uptown 5 PM – 11 PM)", O, [click("Hartwell private buyout"), click("Locations & publishing")]),
     sc("shifts", "Kısa saatin dışında kalan vardiyalar (Shifts)", O, [click("Hartwell private buyout"), click("Shifts")]),
     sc("removed", "Kapalı gün yayınlanınca kaldırılan vardiyalar (History)", O, [click("Kitchen deep clean & hood service"), click("History"), click("Show the")]),
     sc("past", "Geçmiş günler (salt okunur)", O, [click("Past")]),
     sc("manager", "Manager · yalnız Downtown", M)])
# 7 · Employee hub
add("7.0", "Employee home", "employee-hub", "/app/employee-hub", r"^/app/employee-hub/?$", [E],
    "Çalışanın ana sayfası: sıradaki vardiya, duyurular, Coming up (kendi şubesinin yaklaşan önemli günleri), hatırlatmalar.", "Çalışan menüsü → Home", "Çalışan",
    [sc("home", "Ana sayfa", E), sc("timeoff", "İzin iste", E, [click("Request time off")]), sc("shift", "Vardiya ayrıntısı", E, [click("View shift")])])
add("7.1", "My schedule", "employee-hub", "/app/employee-hub/schedule", r"^/app/employee-hub/schedule(/.*)?/?$", [E],
    "Çalışanın kendi programı.", "Çalışan menüsü → Schedule", "Çalışan",
    [sc("week", "Bu hafta", E), sc("next", "Sonraki hafta", E, [click("Next week")])])
add("7.2", "Shift Hub", "shift-hub", "/app/employee-hub/shift-hub", r"^/app/employee-hub/shift-hub(/.*)?$", [E],
    "Vardiya değişim merkezi: açık vardiyalar, takas, bırakma, devralma teklifleri. Onaylı izinle çakışan vardiya soluk kartla, nedeniyle gösterilir.", "Çalışan menüsü → Shift Hub", "Çalışan",
    [sc("available", "Açık vardiyalar", E), sc("time-off", "İzinli saate denk gelen açık vardiya (Fri, soluk kart)", E),
     sc("cover", "Vardiyayı üstlenme isteği", E, [click("Request to cover")]), sc("mine", "Taleplerim", E, [click("My requests")]), sc("history", "Geçmiş", E, [click("History")]),
     sc("own-search", "Kendi cover araması: aday listesi, Close cover search", E, [click("My requests"), click("Awaiting manager")]),
     sc("close-search", "Aramayı kapat penceresi: gerekçe yazılı, kırmızı Close search (iki tıkla kapanır)", E,
        [click("My requests"), click("Awaiting manager"), click("Close cover search"), fill("dialog textarea", "Shift covered internally")])])
add("7.3", "My availability", "employee-hub", "/app/employee-hub/my-availability", r"^/app/employee-hub/my-availability(/.*)?/?$", [E],
    "Çalışanın haftalık tercihleri ve izin talebi.", "Çalışan menüsü → My Availability", "Çalışan",
    [sc("week", "Haftalık tercihler", E), sc("add", "Pazartesiye saat ekle", E, [click("Add hours on Monday")]), sc("timeoff", "İzin talepleri sekmesi", E, [click("Time Off Requests")])])
add("7.4", "More", "employee-hub", "/app/employee-hub/more", r"^/app/employee-hub/more/?$", [E],
    "Telefondaki \"More\" menüsü: çalışanın geri kalan sayfaları.", "Telefon alt menüsü → More", "Çalışan")
# 8 · Announcements
add("8.0", "Announcements", "announcements", "/app/announcements", r"^/app/announcements/?$", ALL,
    "Tek duyuru listesi (Important Dates dahil): durum sekmeleri, sıralanan sütunlar, yeni duyuru. Çalışan yalnız kendisine gelenleri görür.",
    "Sol menü → Announcements", "Herkes (yazma owner, admin, manager)",
    roles_sc(ALL, [sc("new", "Yeni duyuru çekmecesi", O, [click("New")]),
                   sc("where", "Yeni duyuru: şubeler ve yayın zamanı", O, [click("New"), fill("input[placeholder='What is it about?']", "Staff meal moves to 3:30 PM"),
                       fill("textarea[placeholder='Share the details your team needs.']", "Starting Monday, family meal is at 3:30 PM."), click("Next")]),
                   sc("drafts", "Taslaklar", O, [click("Draft")]),
                   sc("scheduled", "Zamanlananlar", O, [click("Scheduled")]),
                   sc("archived", "Arşiv", O, [click("Archived")]),
                   sc("sort", "Status sütununa göre sıralı", O, [click("Status")]),
                   sc("employee-past", "Çalışan · geçmiş duyurular", E, [click("Past")])]))
add("8.1", "Announcement detail", "announcements", "/app/announcements", r"^/app/announcements/(?!important-dates(/|$))[^/]+/?$", ALL,
    "Tek bir duyurunun çekmecesi: Details, Locations & publishing, Audience, Shifts, Acknowledged, History. Çalışan okur ve onaylar.",
    "Announcements → bir duyuru", "Herkes",
    [sc("employee", "Çalışan okuyor (onay bekliyor)", E, [click("Walk-in cooler repair on Tuesday")]),
     sc("owner", "Owner: zamanlanmış duyuru", O, [click("Thanksgiving prix fixe menu")]),
     sc("audience", "Kime gidiyor (Audience)", O, [click("Holiday time-off requests are open"), click("Audience")]),
     sc("acks", "Onaylayanlar (Acknowledged)", O, [click("New POS terminals: training this week"), click("Acknowledged")]),
     sc("history", "Geçmiş (History)", O, [click("New POS terminals: training this week"), click("History")]),
     sc("past", "Bitmiş duyuru: salt okunur, yalnız Archive", O, [click("Labor Day brunch hours")]),
     sc("failed", "Yayınlanamadı", O, [click("Patio heaters install")]),
     sc("unpublished", "Yayından kalkmış duyuru", O, [click("Sunday brunch tasting")]),
     sc("manager", "Manager: kendi taslağı", M, [click("Server section rotation")])])
S[-1]["via"] = r"^/app/announcements/?$"
# 9 · Notifications
add("9.0", "Notifications", "notifications", "/app/notifications", r"^/app/notifications/?$", ALL,
    "Bildirim kutusu.", "Sol menü → Notifications", "Herkes",
    roles_sc(ALL, [sc("read", "Okunanlar", O, [click("Read (")])]))
# 10 · Settings
SET = [("10.0", "General", "general"), ("10.1", "Locations", "locations"), ("10.2", "Jobs", "jobs"),
       ("10.3", "Notifications", "notifications"), ("10.4", "Schedule rules", "scheduling"),
       ("10.5", "Conflict handling", "scheduling/conflicts"), ("10.6", "Shift catalog", "scheduling/shift-types"),
       ("10.7", "Shift labels", "scheduling/shift-labels"), ("10.8", "Roles & permissions", "roles"),
       ("10.9", "Role detail", None), ("10.10", "Documents", "documents"),
       ("10.11", "Acknowledgements", "acknowledgements"), ("10.12", "Support", "support")]
SET_EXTRA = {
    "10.0": [sc("checklist", "Kurulum listesi gizli", O, [click("Hide checklist")])],
    "10.1": [sc("new", "Yeni lokasyon", O, [click("New location")]), sc("edit", "Downtown'u düzenle", O, [click("Actions for Harbor & Vine Downtown"), click("Edit location")]), sc("archived", "Arşiv", O, [click("Archived")])],
    "10.2": [sc("addjob", "Bar'a job ekle", O, [click("Add job to Bar")]), sc("people", "Bartender çalışanları", O, [click("Manage employees for Bartender")])],
    "10.6": [sc("edit", "Breakfast'ı düzenle", O, [click("Edit Breakfast")]), sc("new", "Yeni vardiya türü", O, [click("New shift type")]),
             sc("hours", "Varsayılan saat değişikliği", O, [click("Edit Breakfast"), {"wait": 300}, fill("#shift-catalog-default-end", "13:00")]),
             sc("overnight", "Gece yarısını geçen saat", O, [click("Edit Close"), {"wait": 300}, fill("#shift-catalog-default-end", "01:00")]),
             sc("same", "Başlangıç = bitiş", O, [click("Edit Breakfast"), {"wait": 300}, fill("#shift-catalog-default-end", "07:00")]),
             sc("archived", "Arşivlenmiş tür (listenin sonunda)", O, [click("Actions for Close"), click("Archive Close"), click("Confirm archive Close")]),
             sc("search", "Arama sonuç yok", O, [fill('input[aria-label="Search shift types"]', "Brunch")])],
    "10.7": [sc("edit", "Training'i düzenle", O, [click("Edit Training")]), sc("new", "Yeni etiket", O, [click("New shift label")]),
             sc("archived", "Arşivlenmiş etiket (listenin sonunda)", O, [click("Actions for Opener"), click("Archive Opener"), click("Confirm archive Opener")]),
             sc("search", "Arama sonuç yok", O, [fill('input[aria-label="Search shift labels"]', "Expo")])],
    "10.8": [sc("new", "Yeni rol", O, [click("New role")])],
    "10.10": [sc("new", "Yeni belge türü", O, [click("New document")]), sc("drafts", "Taslaklar", O, [click("Draft")])],
    "10.11": [sc("preview", "Handbook önizleme", O, [click("Actions for Employee Handbook"), click("Preview template")]), sc("retention", "Saklama süreleri", O, [click("Retention")])],
}
SET_DESC = {
    "10.0": "İşletme adı, logo, saat dilimi ve genel ayarlar; kurulum listesi.",
    "10.1": "Lokasyonlar: adres, telefon, saat dilimi; yeni lokasyon, arşiv.",
    "10.2": "Departmanlar ve job'lar; job'a çalışan atama.",
    "10.3": "Workspace bildirim kuralları: kim, hangi kanaldan, ne zaman.",
    "10.4": "Program kuralları: hafta başlangıcı, yayın, mesai sınırları.",
    "10.5": "Çakışma kuralları: izin, müsaitlik, üst üste vardiya; uyar ya da engelle.",
    "10.6": "Vardiya türleri (Breakfast, Lunch, Dinner, Close) ve varsayılan saatleri.",
    "10.7": "Vardiya etiketleri (Training, Opener, Closer, Private event).",
    "10.8": "Roller ve izinleri; yeni rol, rol kopyalama.",
    "10.9": "Tek bir rolün izinleri (örnek: Shift Lead).",
    "10.10": "Çalışanlardan istenen belge türleri (W-4, I-9, Food Handler Card).",
    "10.11": "İmzalı onay şablonları (Employee Handbook, Tip Pooling Policy) ve saklama süreleri.",
    "10.12": "Destek: e-posta ve tanı bilgisi.",
}
for no, title, sub in SET:
    if sub is None:
        add(no, f"Settings · {title}", "settings", "/app/settings/roles/00000c05-0000-4000-8000-000000000c05", r"^/app/settings/roles/[^/]+/?$", [O],
            SET_DESC[no], "Settings → Roles & permissions → bir rol", "Owner, admin",
            [sc("custom", "Özel rol: Shift Lead", O), sc("builtin", "Hazır rol: Manager", O, path="/app/settings/roles/00000c03-0000-4000-8000-000000000c03")])
        continue
    add(no, f"Settings · {title}", "settings", f"/app/settings/{sub}", rf"^/app/settings/{sub}/?$", [O],
        SET_DESC[no], f"Sol menü altı → Settings → {title}", "Owner, admin (manager Settings'e giremez)",
        roles_sc([O], SET_EXTRA.get(no, [])))
# 11 · Account
ACC = [("11.0", "Profile", "profile"), ("11.1", "Security", "security"), ("11.2", "Preferences", "preferences"),
       ("11.3", "Notification preferences", "preferences/notifications"), ("11.4", "Workspaces", "workspaces"),
       ("11.5", "Documents", "documents"), ("11.6", "Inbox", "inbox")]
ACC_DESC = {
    "11.0": "Ad, telefon, profil fotoğrafı.", "11.1": "E-posta ve parola değişimi, öbür oturumları kapatma, hesabı silme.",
    "11.2": "Görünüm, saat ve tarih biçimi.", "11.3": "Kişinin kendi bildirim tercihleri, kategori kategori.",
    "11.4": "Kişinin bütün workspace'leri ve bekleyen davetleri.", "11.5": "Kişinin kendi belgeleri ve imzaladığı onaylar.",
    "11.6": "Workspace'i olmayan kişinin bildirim kutusu (hesap bildirimleri).",
}
ACC_EXTRA = {
    "11.1": [sc("delete", "Hesabı silme", O, [click("Delete account")])],
    "11.3": [sc("expand", "Schedule bildirimlerini aç", O, [click("Expand individual notifications for Schedule")])],
    "11.5": [sc("policies", "Policies & Agreements", E, [click("Policies & Agreements")])],
}
for no, title, sub in ACC:
    add(no, f"Account · {title}", "account", f"/account/{sub}", rf"^/account/{sub}/?$", ALL,
        ACC_DESC[no], f"Sol menü altı → Account → {title}", "Herkes", roles_sc(ALL, ACC_EXTRA.get(no, [])))
# 12 · Public pages
PUB = [("12.0", "Privacy", "privacy"), ("12.1", "Terms", "terms"), ("12.2", "Accessibility", "accessibility"),
       ("12.3", "Contact", "contact"), ("12.4", "Your privacy choices", "your-privacy-choices")]
for no, title, sub in PUB:
    add(no, title, "public", f"/{sub}", rf"^/{sub}/?$", [], f"Herkese açık {title} sayfası.", "Sayfa altındaki bağlantılar", "Herkes, girişsiz",
        [{"id": "page", "label": "Sayfa"}], signed_out=True)

here = os.path.dirname(os.path.abspath(__file__))
# Per-area scenario files (tools/sc/<area>.py), so several threads can add to the
# map side by side. Each file calls extend(no, [...]) to add scenarios to a page,
# replace(no, id, scenario) to fix one, and add(...) for a new page.
def page(no):
    return next(x for x in S if x["no"] == no)
def extend(no, scenarios, part=None):
    target = page(no)
    have = {one["id"] for one in target["scenarios"]}
    for one in scenarios:
        if part and "part" not in one: one["part"] = part
        if one["id"] in have: raise SystemExit(f"{no}: duplicate scenario id {one['id']}")
        have.add(one["id"]); target["scenarios"].append(one)
def replace(no, id, scenario):
    target = page(no)
    idx = next(i for i, one in enumerate(target["scenarios"]) if one["id"] == id)
    target["scenarios"][idx] = scenario
def set_part(no, part, ids):
    for one in page(no)["scenarios"]:
        if one["id"] in ids: one["part"] = part
import glob
for path in sorted(glob.glob(os.path.join(here, "sc", "*.py"))):
    exec(compile(open(path, encoding="utf-8").read(), path, "exec"), {**globals()})
# A page opens for every role one of its scenarios names (admin, Shift Lead...).
ORDER = [O, A, M, C, E]
for x in S:
    used = {one["role"] for one in x["scenarios"] if one.get("role")}
    if x["roles"] and used - set(x["roles"]):
        # The page's own first role stays the default.
        x["roles"] = [x["roles"][0]] + [r for r in ORDER if r != x["roles"][0] and r in set(x["roles"]) | used]
S.sort(key=lambda x: [int(p) for p in x["no"].split(".")])
json.dump({"screens": S}, open(os.path.join(here, "..", "screens.json"), "w"), ensure_ascii=False, indent=1)
print(len(S), "screens")
