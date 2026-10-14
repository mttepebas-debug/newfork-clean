# Writes screens.json: the numbered PAGES screens (one per app route) with
# their Turkish description and example scenarios. Edit here, then run:
#   python3 tools/screens.py
import json, os
O, M, E = "owner", "manager", "employee"
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
    [sc("invalid", "Bağlantısız açılış (geçersiz)")], signed_out=True)
add("1.3", "Account recovery", "sign-in", "/account-recovery", r"^/account-recovery/?$", [],
    "Hesabına giremeyen kişinin yardım istediği ekran.", "Sign in → hesap kurtarma bağlantısı", "Oturumu olmayan herkes",
    [sc("form", "Kurtarma formu")], signed_out=True)
add("1.4", "Accept invitation", "employee-onboarding", "/invite/accept", r"^/(accept-invite|invite/accept)/?$", [E],
    "Davet bağlantısıyla gelen kişinin daveti kabul ettiği ekran. Oturumu yoksa önce 1.0 Sign in'e (davet senaryosu) gider.", "Davet e-postasındaki bağlantı", "Davet edilen kişi (giriş yapmış)",
    [sc("valid", "Geçerli davet", path=f"/invite/accept?token={TOK}"),
     sc("expired", "Süresi dolmuş", path=f"/invite/accept?token={TOK}-expired"),
     sc("revoked", "Geri alınmış", path=f"/invite/accept?token={TOK}-revoked"),
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
                   sc("shift-changes", "Shift changes sekmesi", O, [click("Shift changes")])]))
# 4 · Employees
add("4.0", "Employees", "employees", "/app/employees", r"^/app/employees/?$", MGR,
    "Çalışan listesi (All, Invited, Onboarding, Needs Attention, Active), çalışan çekmecesi, davet, rol, yeni çalışan.", "Sol menü → Employees", "Owner, admin, manager (manager kısmen düzenler)",
    roles_sc(MGR, [sc("drawer", "Çalışan çekmecesi: Maria Lopez", O, path="/app/employees?employeeId=00000601-0000-4000-8000-000000000601&section=profile"),
                   sc("add", "Yeni çalışan", O, [click("Add employee")]), sc("invited", "Davet edilenler", O, [click("Invited")]), sc("attention", "Needs Attention", O, [click("Needs Attention")])]))
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
add("6.0", "Important Dates", "important-dates", "/app/important-dates", r"^/app/important-dates/?$", MGR,
    "Tatiller, kapalı günler, etkinlikler ve izin yasağı günleri: ekle, düzenle, yayından kaldır, arşivle.", "Sol menü → Important Dates", "Owner, admin, manager (manager yalnız kendi şubesi)",
    [{"id": "list", "label": "Yaklaşan günler", "role": O},
     {"id": "new", "label": "Yeni gün çekmecesi", "role": O, "steps": [{"click": "text=New date"}]},
     {"id": "edit", "label": "Thanksgiving'i düzenle", "role": O, "steps": [{"click": "text=Actions for Thanksgiving"}, {"click": "text=Edit date"}]},
     {"id": "past", "label": "Geçmiş günler", "role": O, "steps": [{"click": "text=Past"}]},
     {"id": "manager", "label": "Manager · yalnız Downtown", "role": M}])
# 7 · Employee hub
add("7.0", "Employee home", "employee-hub", "/app/employee-hub", r"^/app/employee-hub/?$", [E],
    "Çalışanın ana sayfası: sıradaki vardiya, duyurular, hatırlatmalar.", "Çalışan menüsü → Home", "Çalışan",
    [sc("home", "Ana sayfa", E), sc("timeoff", "İzin iste", E, [click("Request time off")]), sc("shift", "Vardiya ayrıntısı", E, [click("View shift")])])
add("7.1", "My schedule", "employee-hub", "/app/employee-hub/schedule", r"^/app/employee-hub/schedule(/.*)?/?$", [E],
    "Çalışanın kendi programı.", "Çalışan menüsü → Schedule", "Çalışan",
    [sc("week", "Bu hafta", E), sc("next", "Sonraki hafta", E, [click("Next week")])])
add("7.2", "Shift Hub", "shift-hub", "/app/employee-hub/shift-hub", r"^/app/employee-hub/shift-hub(/.*)?$", [E],
    "Vardiya değişim merkezi: açık vardiyalar, takas, bırakma, devralma teklifleri. Onaylı izinle çakışan vardiya soluk kartla, nedeniyle gösterilir.", "Çalışan menüsü → Shift Hub", "Çalışan",
    [sc("available", "Açık vardiyalar", E), sc("time-off", "İzinli saate denk gelen açık vardiya (Fri, soluk kart)", E),
     sc("cover", "Vardiyayı üstlenme isteği", E, [click("Request to cover")]), sc("mine", "Taleplerim", E, [click("My requests")]), sc("history", "Geçmiş", E, [click("History")])])
add("7.3", "My availability", "employee-hub", "/app/employee-hub/my-availability", r"^/app/employee-hub/my-availability(/.*)?/?$", [E],
    "Çalışanın haftalık tercihleri ve izin talebi.", "Çalışan menüsü → My Availability", "Çalışan",
    [sc("week", "Haftalık tercihler", E), sc("add", "Pazartesiye saat ekle", E, [click("Add hours on Monday")]), sc("timeoff", "İzin talepleri sekmesi", E, [click("Time Off Requests")])])
add("7.4", "More", "employee-hub", "/app/employee-hub/more", r"^/app/employee-hub/more/?$", [E],
    "Telefondaki \"More\" menüsü: çalışanın geri kalan sayfaları.", "Telefon alt menüsü → More", "Çalışan")
# 8 · Announcements
add("8.0", "Announcements", "announcements", "/app/announcements", r"^/app/announcements/?$", ALL,
    "Duyurular listesi, yeni duyuru, onay (acknowledgement) takibi.", "Sol menü → Announcements", "Herkes (yazma owner, admin, manager)",
    roles_sc(ALL, [sc("new", "Yeni duyuru", O, [click("New announcement")]), sc("drafts", "Taslaklar", O, [click("Draft")])]))
add("8.1", "Announcement detail", "announcements", "/app/announcements", r"^/app/announcements/[^/]+/?$", ALL,
    "Tek bir duyurunun sayfası ve onay durumu.", "Announcements → bir duyuru", "Herkes",
    [sc("employee", "Çalışan okuyor (onay bekliyor)", E, [click("Actions for Walk-in cooler repair on Tuesday"), click("View announcement")]),
     sc("owner", "Owner düzenliyor", O, [click("Actions for Thanksgiving prix fixe menu"), click("Edit announcement")]),
     sc("manager", "Manager düzenliyor", M, [click("Actions for Server section rotation"), click("Edit announcement")])])
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
    "10.6": [sc("edit", "Breakfast'ı düzenle", O, [click("Edit Breakfast")]), sc("new", "Yeni vardiya türü", O, [click("Add shift type")])],
    "10.7": [sc("edit", "Training'i düzenle", O, [click("Edit Training")]), sc("new", "Yeni etiket", O, [click("Add shift label")])],
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
S.sort(key=lambda x: [int(p) for p in x["no"].split(".")])
json.dump({"screens": S}, open(os.path.join(here, "..", "screens.json"), "w"), ensure_ascii=False, indent=1)
print(len(S), "screens")
