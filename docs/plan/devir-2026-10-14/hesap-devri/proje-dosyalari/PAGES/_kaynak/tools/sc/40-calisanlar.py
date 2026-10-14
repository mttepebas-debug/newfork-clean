# Area "calisanlar": 2.0 Workspace, 4.0 Employees (+ employee drawer), 4.1 Employee documents
# (+ document drawer), 4.2 Employees archive, 5.0 Availability, 6.0 Important Dates.
# Data changes named in setup= live in the area's own mock services (they read currentScenario().setup).
def pid(n): return f"{n:08x}-0000-4000-8000-{n:012x}"
MARIA, JAKE, PRIYA, ETHAN, SOPHIE, CARLOS, AISHA, TOM, OLIVIA = pid(0x601), pid(0x602), pid(0x603), pid(0x604), pid(0x605), pid(0x607), pid(0x608), pid(0x609), pid(0x60d)
HANNAH, KEVIN, JASMINE, RYAN, BRIAN, MEGAN, DIEGO = pid(0x6e1), pid(0x6e2), pid(0x6e3), pid(0x6e4), pid(0x6e5), pid(0x6e6), pid(0x6e7)
OWNERP, RACHEL, EMMA = pid(0x6f0), pid(0x6f1), pid(0x60b)
def emp(person, section="profile", base="/app/employees"): return f"{base}?employeeId={person}&section={section}"
WS = r"/workspaces/[^/]+/workspace"

# ---------------- 2.0 Workspace ----------------
set_part("2.0", "Roller", ["owner", "manager", "admin", "shift-lead"])
set_part("2.0", "Sayfa durumları", ["loading", "error"])
set_part("2.0", "Özelleştirme · Customize", ["customize"])
extend("2.0", [
    sc("no-access", "Erişim yok: You don't have access to Workspace", C, fail=[{"path": WS + "$", "method": "GET", "status": 403}]),
], part="Sayfa durumları")
extend("2.0", [
    sc("hide-card", "Todos kartı gizlendi: soluk, tıklanamaz önizleme, Show Todos", O, [click("Customize"), click("Hide Todos")]),
    sc("move-card", "Today kartı bir aşağı: ilk kartın up düğmesi kapalı", O, [click("Customize"), click("Move Today down")]),
    sc("save-layout", "Düzen kaydedildi: mod kapandı, Todos kartı görünmüyor", O, [click("Customize"), click("Hide Todos"), click("Save layout")]),
    sc("all-hidden", "Bütün kartlar gizli: Every card is hidden...", O, [click("Customize"), click("Hide Today"), click("Hide Pending requests"), click("Hide Open shifts"),
        click("Hide Announcements"), click("Hide Todos"), click("Hide Notifications"), click("Hide Quick actions"), click("Save layout")]),
    sc("layout-error", "Düzen kaydedilemedi: hata satırı, mod açık kalır", O, [click("Customize"), click("Hide Todos"), click("Save layout")],
       fail=[{"path": WS + "/layout$", "method": "PUT", "status": 500}]),
], part="Özelleştirme · Customize")
extend("2.0", [
    sc("checklist-fresh", "Hiç ziyaret yok: 0 of 2 required visits complete", O, setup="workspace-checklist-fresh"),
    sc("checklist-visit", "App tour'a tıklandı: tamam işareti, 1 of 2", O, [click("App tour")], setup="workspace-checklist-fresh"),
    sc("checklist-load-error", "Kurulum listesi okunamadı: We couldn't load the setup checklist + Try again; sayaç ve liste gizli", O,
       fail=[{"path": WS + "/setup-checklist$", "method": "GET", "status": 500}]),
    sc("checklist-save-error", "Kurulum listesi kaydedilemedi: ...could not be saved.", O, [click("App tour")], setup="workspace-checklist-fresh",
       fail=[{"path": WS + "/setup-checklist$", "method": "PATCH", "status": 500}]),
    sc("checklist-done", "Kurulum listesi bitti: 2 of 2, altı maddede tamam işareti", O, setup="workspace-checklist-done"),
    sc("checklist-closed", "Kurulum listesi kapatılmış: kart hiç yok", O, setup="workspace-checklist-closed"),
], part="Kurulum listesi · Setup checklist")
extend("2.0", [
    sc("todo-add", "Todo eklendi: listede yeni satır", O, [fill("input[aria-label='New todo']", "Check the ice machine filter"), click("Add", within=".workspace-todo-form")]),
    sc("todo-resolve", "Elle eklenmiş todo kapatıldı (Order to-go containers listeden çıkar)", O, [click("Resolve Order to-go containers")]),
    sc("todo-error", "Todo kaydedilemedi: Todo update could not be saved.", O, [fill("input[aria-label='New todo']", "Check the ice machine filter"), click("Add", within=".workspace-todo-form")],
       fail=[{"path": WS + "/todos$", "method": "POST", "status": 500}]),
    sc("todo-due-soon", "Vadesi gelecekte: Due in 2h (Call the linen service)", O, setup="workspace-todo-due-soon"),
], part="Todos kartı · Todos")
extend("2.0", [
    sc("quiet", "Boş kartlar: No open todos, No active announcements, You're all caught up", O, setup="workspace-quiet"),
    sc("exchanges-error", "Shift changes okunamadı: sayı yerine —", O, fail=[{"path": r"/shift-exchanges$", "method": "GET", "status": 500}]),
], part="Kartlar · Cards")

# ---------------- 4.0 Employees ----------------
EMPL = r"/workspaces/[^/]+/employees"
ONE = EMPL + r"/[0-9a-f-]{36}"
SL = ["workspace.read", "schedule.read", "schedule.manage", "employees.read", "availability.read",
      "schedule.time_off_requests.read", "schedule.shift_change_requests.read", "schedule.shift_change_requests.manage",
      "announcements.read", "notifications.read", "notifications.read_own", "notifications.preferences.write_own"]
ROLE_EMPLOYEE, ROLE_SHIFT_LEAD = pid(0xc04), pid(0xc05)
STATUS = "[aria-label='Employee status']"
LOCS = ".employee-form-stack > fieldset:nth-of-type(1)"
JOBS = ".employee-form-stack > fieldset:nth-of-type(2)"
PANEL = {"scroll": ".manager-onboarding-review"}
TERM = ".employee-termination-confirm"
# The phone's section picker; on the desktop the step lands on the current rail button and does nothing,
# and the desktop follows the phone's new address.
def section(name): return fill("select[aria-label='Employee section'], nav[aria-label='Employee sections'] button[aria-current]", name)
def focus(sel): return {"act": "key", "target": sel, "key": "Shift"}
NEW = "/app/employees?mode=create&section=profile"
NAMES = [{"wait": 2000}, fill("input[aria-label='First name']", "Lena"), fill("input[aria-label='Last name']", "Fischer")]
# Next on Profile; on Employment the same button is a disabled Save (the other frame may be there already).
NEXT = {"click": ".employee-create-footer button[type=submit]"}
def add_sc(id, label, role, steps, **kw): return sc(id, label, role, steps, path=NEW, **kw)
NAMES_EMAIL = NAMES + [fill("input[aria-label='E-mail']", "lena.fischer@harborvine.test")]
ASSIGN = [click("Harbor & Vine Downtown", within=LOCS), click("Server", within=JOBS)]

set_part("4.0", "Roller", ["owner", "manager"])
set_part("4.0", "Liste · Employees", ["uptown", "invited", "attention"])
set_part("4.0", "Çalışan çekmecesi · Profile", ["drawer"])
set_part("4.0", "Çalışan çekmecesi · Access", ["reminder", "manager-invite"])
set_part("4.0", "Yeni çalışan · Add employee", ["add"])
extend("4.0", [sc("admin", "Admin · Daniel Brooks: bütün lokasyonlar", A)], part="Roller")
extend("4.0", [
    sc("onboarding-tab", "Onboarding sekmesi (Jasmine Torres)", O, [click("Onboarding", within=STATUS)]),
    sc("active-tab", "Active sekmesi", O, [click("Active", within=STATUS)]),
    sc("not-invited", "Not Invited çipi ve No app access (Diego Morales)", O, path="/app/employees?q=Diego"),
    sc("no-location", "No location süzgeci: listede No location çipi (Diego, Exclude from schedule)", O, path="/app/employees?location=none", setup="employees-no-location"),
    sc("search-empty", "Arama sonuçsuz: No matching employees", O, path="/app/employees?q=zzz"),
    sc("manager-tab-empty", "Müdürde boş sekme süzgeç sayılır: Needs Attention → No matching employees", M, [click("Needs Attention", within=STATUS)]),
    sc("no-employees", "Hiç kayıt yok: No employees yet", O, setup="employees-empty"),
    sc("columns", "Sütun ayarı açık: 6 of 7 visible, Employee kilitli, Show all, Reset", O, [click("Table column settings")]),
    sc("columns-changed", "Invite email sütunu açıldı ve bir sola alındı", O, [click("Table column settings"), click("Invite email", within="[aria-label='Employee table columns']"), click("Move Invite email left")]),
    sc("sort", "Start date'e göre azalan sıralama (iki tık)", O, [click("Start date", within="thead"), click("Start date", within="thead")]),
    sc("cell-click", "Primary job hücresine tıklandı: çekmece Employment bölümünde açılır (Maria)", O, [{"click": "tbody .employee-cell-with-icon"}], path="/app/employees?q=Maria"),
    sc("pagination", "Sayfalama: 55 kişi, Rows per page 25, üç sayfa", O, [fill("select[aria-label='Rows per page'], .list-pagination select", "25")], setup="employees-many"),
], part="Liste · Employees")
extend("4.0", [
    sc("list-loading", "Yükleniyor: sütun başlıklarının altında gri satırlar", O, hold=[EMPL + "$"]),
    sc("list-error", "Liste okunamadı: We couldn't load employees + Try again (sunucunun cümlesi görünmez)", O, fail=[{"path": EMPL + "$", "method": "GET", "status": 500, "error": "Employees could not be loaded right now."}]),
    sc("list-no-access", "Erişim yok: You don't have access to Employees (Shift Lead, liste reddedildi)", C, fail=[{"path": EMPL + "$", "method": "GET", "status": 403}]),
    sc("reader", "Salt okur Shift Lead: Add employee düğmesi yok", C),
], part="Liste durumları")
extend("4.0", [
    sc("manager-profile", "Müdür Profile'ı: Phone, Emergency, Address, Date of birth yok", M, path=emp(MARIA)),
    sc("invited-profile", "Davet bekleyen: adlar salt okur, e-postada Invitation pending (Hannah)", O, path=emp(HANNAH)),
    sc("no-account-profile", "Hesabı yok: adlar ve e-posta düzenlenir, e-posta boş (Diego)", O, path=emp(DIEGO)),
    sc("preferred-pending", "Bekleyen tercih edilen ad: Asked to be called Liv here. (Olivia)", O, path=emp(OLIVIA)),
    sc("preferred-use", "Use it: Preferred name alanında Liv, listede Liv Chen", O, [click("Use it")], path=emp(OLIVIA)),
    sc("preferred-leave", "Leave it: istek satırı kaybolur (Tom Becker)", O, [click("Leave it")], path=emp(TOM)),
    sc("preferred-error", "Tercih edilen ad zaten cevaplanmış: hata satırı", O, [click("Use it")], path=emp(OLIVIA),
       fail=[{"path": r"/preferred-names/[^/]+/decision$", "method": "POST", "status": 404, "reason": "employee.preferred_name.not_pending", "error": "that request is no longer waiting for an answer"}]),
    sc("preferred-approved", "Onaylı tercih edilen ad: salt okur Preferred name Soph (Sophie)", O, path=emp(SOPHIE)),
    sc("owner-own", "Owner'ın kendi kaydı: acil durum kişisi düzenlenir (optional)", O, path=emp(OWNERP)),
    sc("owner-own-phone", "Kendi numarasını acil durum numarası girdi: This is your own number..., Save kapalı", O,
       [fill("input[aria-label='Emergency contact']", "Ayse Tepebas"), fill("input[aria-label='Emergency phone']", "6175550100")], path=emp(OWNERP), setup="employees-owner-phone"),
    sc("owner-half", "Yarım acil durum kişisi (ad var, numara yok): Required, Save kapalı", O, [fill("input[aria-label='Emergency contact']", "Ayse Tepebas")], path=emp(OWNERP)),
    sc("owner-contact-error", "Acil durum kişisi kaydedilemedi", O,
       [fill("input[aria-label='Emergency contact']", "Ayse Tepebas"), fill("input[aria-label='Emergency phone']", "6175550199"), click("Save changes")], path=emp(OWNERP),
       fail=[{"path": ONE + "/emergency-contact$", "method": "PUT", "status": 500}]),
    sc("letters", "Ad alanında Türkçe harf: English letters only.", O, [fill("input[aria-label='First name']", "Çağrı")], path=emp(DIEGO)),
    sc("legal-review", "Legal name review bekliyor: Request changes / Accept (Ryan Mitchell)", O, [PANEL], path=emp(RYAN)),
    sc("legal-request-dialog", "Request changes penceresi: not boşken onay kapalı", O, [PANEL, click("Request changes for Legal name and contact details")], path=emp(RYAN)),
    sc("legal-changes-requested", "Değişiklik istendi: ret notu ve changes requested", O,
       [click("Request changes for Legal name and contact details"), fill(".app-confirm textarea", "Your last name on the ID is Mitchel."), click("Request changes", within=".app-confirm"), PANEL], path=emp(RYAN)),
    sc("legal-accepted", "Ad onaylandı (Accept): madde completed", O, [click("Accept Legal name and contact details")], path=emp(RYAN)),
    sc("onboarding-in-progress", "Onboarding sürüyor (Jasmine): panel düğmesiz, in progress", O, [PANEL], path=emp(JASMINE)),
    sc("onboarding-conflict", "Onboarding çakışması: This onboarding changed meanwhile...", O, [click("Accept Legal name and contact details"), PANEL], path=emp(RYAN),
       fail=[{"path": ONE + "/onboarding/review$", "method": "POST", "status": 409, "reason": "onboarding.changed", "error": "onboarding changed; refresh required"}]),
    sc("legal-no-decide", "Adı onaylayamayan Shift Lead (özel bilgi + onboarding izni): düğmeler kapalı", C, [PANEL], path=emp(RYAN), setup="employees-ryan-downtown",
       perms=SL + ["employees.private.read", "employee_onboarding.review"]),
], part="Çalışan çekmecesi · Profile")
extend("4.0", [
    sc("employment", "Aktif çalışan Employment: Locations, departmanlı Jobs, Start date, Internal note (Maria)", O, path=emp(MARIA, "employment")),
    sc("owner-employment", "Owner kaydı: lokasyonlar ve Owner job kilitli", O, path=emp(OWNERP, "employment")),
    sc("remote", "Remote açıldı: Required kalkar, rayda Remote rozeti", O, [click("Remote", within=".employee-toggle-grid")], path=emp(MARIA, "employment")),
    sc("off-schedule", "Off schedule rozeti olan kayıt (Rachel Adams)", O, path=emp(RACHEL, "employment")),
    sc("no-jobs", "Bütün job'lar kaldırıldı: Select at least one job, atama engeli, Save kapalı", O, [click("Server", within=JOBS), click("Host", within=JOBS)], path=emp(MARIA, "employment")),
    sc("doc-impact", "Uptown eklendi: Document assignment impact listesi", O, [click("Harbor & Vine Uptown", within=LOCS)], path=emp(MARIA, "employment")),
    sc("doc-impact-loading", "Belge etkisi yükleniyor: gri satırlar", O, [click("Harbor & Vine Uptown", within=LOCS)], path=emp(MARIA, "employment"),
       hold=[r"/assignment-preview"]),
    sc("doc-impact-error", "Belge etkisi okunamadı: We couldn't check document requirements + Try again, Save kapalı", O, [click("Harbor & Vine Uptown", within=LOCS)], path=emp(MARIA, "employment"),
       fail=[{"path": r"/assignment-preview", "status": 500}]),
    sc("doc-impact-none", "Belgesiz job eklendi: No document requirements will change.", O, [click("Busser", within=JOBS)], path=emp(MARIA, "employment")),
    sc("saved", "Internal note kaydedildi (Save changes)", O, [fill(".employee-drawer textarea", "Prefers patio sections."), click("Save changes")], path=emp(MARIA, "employment")),
    sc("conflict", "Revizyon çakışması: Someone else saved this employee meanwhile...", O, [fill(".employee-drawer textarea", "Prefers patio sections."), click("Save changes")],
       path=emp(MARIA, "employment"), fail=[{"path": ONE + "$", "method": "PUT", "status": 409, "reason": "employee.revision_conflict", "error": "employee revision conflict"}]),
    sc("save-refused", "Kaydetme reddi: sunucunun lokasyon kuralı cümlesi", O, [fill(".employee-drawer textarea", "Prefers patio sections."), click("Save changes")],
       path=emp(MARIA, "employment"), fail=[{"path": ONE + "$", "method": "PUT", "status": 400, "reason": "employee.location_required",
                                              "error": "Choose at least one location and mark one as primary, or turn on Remote or Exclude from schedule."}]),
    sc("gone-meanwhile", "Lokasyon çekmece açıkken silinmiş: This location was deleted. Reload locations.", O, [fill(".employee-drawer textarea", "Prefers patio sections."), click("Save changes")],
       path=emp(MARIA, "employment"), fail=[{"path": ONE + "$", "method": "PUT", "status": 409, "reason": "location.deleted", "error": "This location was deleted. Reload locations."}]),
    sc("manager-employment", "Müdür Employment: Remove düğmesi, Only an admin or the owner can terminate... notu", M, path=emp(MARIA, "employment")),
    sc("manager-remove-arm", "Remove iki tık: Confirm remove (3 saniye sonra çözülür)", M, [click("Remove from Harbor & Vine Downtown")], path=emp(MARIA, "employment")),
    sc("manager-removed", "Tek lokasyonundan çıkarıldı: çekmece kapanır, Removed from Harbor & Vine Downtown", M,
       [click("Remove from Harbor & Vine Downtown"), click("Confirm remove from Harbor & Vine Downtown")], path=emp(MARIA, "employment")),
    sc("manager-location-required", "Müdür sınıfı kaydın son lokasyonu kaldırılamaz (Rachel)", O,
       [click("Remove from Harbor & Vine Downtown"), click("Confirm remove from Harbor & Vine Downtown")], path=emp(RACHEL, "employment")),
    sc("references-error", "Seçenekler okunamadı: We couldn't load locations, jobs and roles + Try again", O, path=emp(MARIA, "employment"),
       fail=[{"path": EMPL + "/reference-data$", "status": 500}]),
    sc("many-locations", "8'den fazla lokasyon: Search locations kutusu", O, path=emp(MARIA, "employment"), setup="employees-many-locations"),
], part="Çalışan çekmecesi · Employment")
extend("4.0", [
    sc("drawer-availability", "Çekmecede Availability: Employee availability / Manager reminders (Maria)", O, path=emp(MARIA, "availability")),
    sc("drawer-availability-none", "Haftalık kaydı olmayan kişi (Hannah): You don't have access to this availability.", O, path=emp(HANNAH, "availability")),
], part="Çalışan çekmecesi · Availability")
extend("4.0", [
    sc("drawer-documents", "Çekmecede Documents: belge ve onay satırları (Maria)", O, path=emp(MARIA, "documents")),
    sc("drawer-documents-empty", "Belgesi yok (Diego): No documents yet", O, path=emp(DIEGO, "documents")),
    sc("manager-documents", "Müdürde Documents bölümü yok: section=documents Profile'a düşer", M, path=emp(MARIA, "documents")),
], part="Çalışan çekmecesi · Documents")
extend("4.0", [
    sc("failed-owner", "Owner'ın gözüyle teslim hatası: Invitation delivery failed + Retry (Kevin)", O, path=emp(KEVIN, "access")),
    sc("reminder-sent", "Send reminder gönderildi: durum Invitation sent kalır", O, [click("Send reminder")], path=emp(HANNAH, "access")),
    sc("retry-sent", "Teslim hatasında Retry: durum Invitation sent", O, [click("Retry")], path=emp(KEVIN, "access")),
    sc("copy-link", "Copy link: Link copied ya da pano reddinde Copy failed", O, [click("Copy link")], path=emp(HANNAH, "access")),
    sc("copy-failed", "Bağlantı alınamadı: Copy failed", O, [click("Copy link")], path=emp(HANNAH, "access"),
       fail=[{"path": ONE + "/invitations/link$", "status": 500}]),
    sc("revoke-arm", "Revoke invitation iki tık: Confirm revoke (3 saniye sonra çözülür)", O, [click("Revoke invitation")], path=emp(HANNAH, "access")),
    sc("revoked", "Davet geri alındı: Invitation revoked", O, [click("Revoke invitation"), click("Confirm revoke")], path=emp(HANNAH, "access")),
    sc("no-email", "E-postasız kişi: No email + Add email (Diego)", O, path=emp(DIEGO, "access")),
    sc("no-email-add", "Add email: Profile'a döner, E-mail alanında", O, [click("Add email")], path=emp(DIEGO, "access")),
    sc("ready", "Ready to invite: e-posta var, rol seçilmemiş (Choose a role)", O, path=emp(DIEGO, "access"), setup="employees-diego-email"),
    sc("invite-no-role", "Rol seçmeden Invite: Invite role titrer, ipucu Choose a role before sending the invitation", O, [click("Invite")], path=emp(DIEGO, "access"), setup="employees-diego-email"),
    sc("invite-sent", "Davet gönderildi: Invitation sent (Invite role Employee)", O,
       [fill("select[aria-label='Invite role']", ROLE_EMPLOYEE), click("Invite")], path=emp(DIEGO, "access"), setup="employees-diego-email"),
    sc("resend", "Resend: yeni bağlantı, eskisi geçersiz", O, [click("Resend")], path=emp(HANNAH, "access")),
    sc("invite-no-location", "Davet reddi: employee requires a location before invitation (lokasyonsuz Diego)", O,
       [fill("select[aria-label='Invite role']", ROLE_EMPLOYEE), click("Invite")], path=emp(DIEGO, "access"), setup="employees-no-location"),
    sc("expired", "Invitation expired + Resend", O, path=emp(HANNAH, "access"), setup="employees-invite-expired"),
    sc("declined", "Invitation declined", O, path=emp(HANNAH, "access"), setup="employees-invite-declined"),
    sc("onboarding-access", "Onboarding in progress (Jasmine)", O, path=emp(JASMINE, "access")),
    sc("linked", "Onboarded and linked: Workspace role, Remove access (Maria)", O, path=emp(MARIA, "access")),
    sc("role-change", "Rol değişti (Shift Lead) ve kaydedildi: Access'te kalır", O, [fill("select[aria-label='Workspace role']", ROLE_SHIFT_LEAD), click("Save changes")], path=emp(MARIA, "access")),
    sc("role-refused", "Rol reddi: müdür sınıfı rol, lokasyonsuz kişi", O, [fill("select[aria-label='Workspace role']", ROLE_SHIFT_LEAD), click("Save changes")],
       path=emp(MARIA, "access"), setup="employees-maria-no-location"),
    sc("role-reload-error", "Rol kaydedildi ama kayıt yenilenemedi: Role saved. This employee didn't reload. + Try again", O,
       [fill("select[aria-label='Workspace role']", ROLE_SHIFT_LEAD), click("Save changes")], path=emp(MARIA, "access"), setup="employees-reload-fails"),
    sc("owner-access", "Owner kaydında rol seçimi kapalı: Owner access is managed separately.", O, path=emp(OWNERP, "access")),
    sc("manager-roles", "Müdürün rol listesi yalnız Employee: tek seçenek, kapalı", M, path=emp(MARIA, "access")),
    sc("remove-access-arm", "Remove access iki tık: Confirm remove access (3 saniye sonra çözülür)", O, [click("Remove access")], path=emp(MARIA, "access")),
    sc("access-removed", "Erişim kaldırıldı: Access removed", O, [click("Remove access"), click("Confirm remove access")], path=emp(MARIA, "access")),
    sc("photo-arm", "Profil fotoğrafı olan kişi: Remove photo iki tık (Aisha Johnson; 3 saniye sonra çözülür)", O, [click("Remove photo")], path=emp(AISHA, "access")),
    sc("photo-removed", "Fotoğraf kaldırıldı: yer tutucu, Remove photo kapalı", O, [click("Remove photo"), click("Confirm remove")], path=emp(AISHA, "access")),
    sc("no-photo", "Fotoğrafsız kişi: Remove photo kapalı (Jake Thompson)", O, path=emp(JAKE, "access")),
    sc("photo-unavailable", "Fotoğraf okunamadı: We couldn't load the profile photo + Try again", O, path=emp(AISHA, "access"), fail=[{"path": ONE + "/avatar$", "method": "GET", "status": 500}]),
    sc("photo-remove-error", "Fotoğraf kaldırılamadı: satır içi hata", O, [click("Remove photo"), click("Confirm remove")], path=emp(AISHA, "access"),
       fail=[{"path": ONE + "/avatar$", "method": "DELETE", "status": 500}]),
    sc("manager-no-access", "Müdür owner kaydını açar: Access bölümü yok, salt okur (Close)", M, path=emp(OWNERP, "access")),
], part="Çalışan çekmecesi · Access")
extend("4.0", [
    sc("history", "History dolu: rol, onboarding, davet olayları (Carlos Rivera)", O, path=emp(CARLOS, "history")),
    sc("no-history", "No history yet", O, path=emp(DIEGO, "history"), setup="employees-no-history"),
], part="Çalışan çekmecesi · History")
extend("4.0", [
    sc("draft-terminate", "Taslak varken Terminate employee kilitli: Save your changes before terminating...", O, [fill(".employee-drawer textarea", "Prefers patio sections.")], path=emp(MARIA, "employment")),
    sc("manager-terminate-tip", "Müdürde kilitli Terminate employee ve ipucu baloncuğu", M, [{"act": "hover", "target": ".employee-terminate-passive"}], path=emp(MARIA, "employment")),
    sc("out-of-scope", "Kapsam dışı kişi (Uptown'daki Emma): çekmecede erişim yok kartı", M, path=emp(EMMA)),
    sc("detail-loading", "Kayıt yükleniyor: gri satırlar", O, path=emp(MARIA), hold=[ONE + "$"]),
    sc("detail-error", "Kayıt okunamadı: We couldn't load this employee + Try again (sunucunun cümlesi görünmez)", O, path=emp(MARIA), fail=[{"path": ONE + "$", "method": "GET", "status": 500, "error": "Employee could not be loaded right now."}]),
    sc("phone-section", "Telefon: üstteki Employee section seçimiyle Employment'a geçiş", O, [section("employment")], path=emp(MARIA)),
    sc("bad-section", "Geçersiz section değeri Profile'a düşer", O, path=emp(MARIA, "xyz")),
], part="Çalışan çekmecesi · durumlar")
extend("4.0", [
    sc("term-open", "Terminate employee penceresi: şimdiki zaman, saat dilimi, Reason boş (telefonda bu düğme yok)", O, [click("Terminate employee")], path=emp(MARIA)),
    sc("term-errors", "Alan hataları: gelecek zaman ve kısa gerekçe", O,
       [click("Terminate employee"), fill("input[aria-label='Effective date and time']", "{today+2}T10:00"), click(TERM)], path=emp(MARIA)),
    sc("term-armed", "İki tık: Confirm termination kurulu (3 saniye sonra çözülür; yalnız masaüstü)", O, [click("Terminate employee"), fill("textarea[aria-label='Reason']", "Moved out of state"), click(TERM)], path=emp(MARIA)),
    sc("term-done", "İşten çıkarıldı: Employee terminated. n published shifts released.", O,
       [click("Terminate employee"), fill("textarea[aria-label='Reason']", "Moved out of state"), click(TERM), click(TERM)], path=emp(MARIA)),
    sc("term-refused", "Sunucu reddi: worksite timezone must match an active employee location", O,
       [click("Terminate employee"), fill("textarea[aria-label='Reason']", "Moved out of state"), click(TERM), click(TERM)], path=emp(MARIA),
       fail=[{"path": ONE + "/termination$", "status": 400, "error": "worksite timezone must match an active employee location"}]),
    sc("term-no-timezone", "Saat dilimi yok (lokasyonlar okunamadı): An active employee location with a timezone is required.", O,
       [click("Terminate employee")], path=emp(MARIA), fail=[{"path": EMPL + "/reference-data$", "status": 500}]),
], part="Terminate penceresi · Terminate employee")
extend("4.0", [
    add_sc("add-next", "Ad girildi, Next: Employment adımı (Work mode), Select at least one location", O, NAMES + [NEXT]),
    add_sc("add-with-email", "E-postalı yeni kişi: davet özeti, Choose an invite role", O, NAMES_EMAIL + [NEXT]),
    add_sc("add-email-invalid", "Geçersiz e-posta: Enter a valid email address in Profile., Invite kapalı", O,
       NAMES + [fill("input[aria-label='E-mail']", "abc"), NEXT]),
    add_sc("add-saved", "Davetsiz kaydedildi: Employee saved.", O, NAMES + [NEXT] + ASSIGN + [click("Save", within=".employee-create-footer")]),
    add_sc("add-invited", "Davetle kaydedildi: Employee saved. Invitation sent.", O,
       NAMES_EMAIL + [NEXT] + ASSIGN + [fill("select[aria-label='Invite role']", ROLE_EMPLOYEE), click("Invite", within=".employee-create-footer")]),
    add_sc("add-invite-failed", "Davet gönderilemedi: Invitation couldn't be sent. + Retry invitation", O,
       NAMES_EMAIL + [NEXT] + ASSIGN + [fill("select[aria-label='Invite role']", ROLE_EMPLOYEE), click("Invite", within=".employee-create-footer")], setup="employees-invite-failed"),
    add_sc("add-invite-pending", "Davet yolda: Invitation delivery is pending. + Retry invitation", O,
       NAMES_EMAIL + [NEXT] + ASSIGN + [fill("select[aria-label='Invite role']", ROLE_EMPLOYEE), click("Invite", within=".employee-create-footer")], setup="employees-invite-pending"),
    add_sc("add-uncertain", "Belirsiz istek: Check the previous request before continuing. + Retry request", O,
       NAMES + [NEXT] + ASSIGN + [click("Save", within=".employee-create-footer")], fail=[{"path": EMPL + "/create$", "status": 500}]),
    add_sc("add-refused", "Kaydetme reddi (400): sunucu cümlesi", O, NAMES + [NEXT] + ASSIGN + [click("Save", within=".employee-create-footer")],
       fail=[{"path": EMPL + "/create$", "status": 400, "error": "Only the workspace owner holds the Owner job."}]),
    add_sc("add-manager", "Müdür yeni kişi: yalnız Downtown, rol listesi yalnız Employee", M, NAMES_EMAIL + [NEXT]),
    add_sc("add-manager-role", "Müdür sınıfı rolle davet, lokasyonsuz: reddetme cümlesi", O,
       NAMES_EMAIL + [NEXT, click("Exclude from schedule"), click("Server", within=JOBS), fill("select[aria-label='Invite role']", ROLE_SHIFT_LEAD), click("Invite", within=".employee-create-footer")]),
    sc("add-loading", "Loading locations, jobs and roles...", O, [click("Add employee")], hold=[EMPL + "/reference-data$"]),
], part="Yeni çalışan · Add employee")

# ---------------- 4.1 Employee documents ----------------
DOCS = r"/workspaces/[^/]+/employee-documents"
REQ = DOCS + r"/[0-9a-f-]{36}"
DOC_W4, DOC_FOOD, DOC_HANDBOOK = pid(0xd01), pid(0xd03), pid(0xd05)
def open_doc(name, doc_type=None):
    """Searches the person, narrows to one document type, opens the first row."""
    return [{"wait": 1200}, fill("input[aria-label='Search employee documents']", name)] + \
        ([fill("select[aria-label='Document type']", doc_type)] if doc_type else []) + [{"click": "tbody tr td"}]
DECISION = ".document-detail-body fieldset textarea"
set_part("4.1", "Sekmeler ve süzgeçler · Document status", ["all", "review", "missing", "expired"])
extend("4.1", [
    sc("completed", "Completed sekmesi: tamamlananlar ve owner'ın Exempt satırları", O, [click("Completed")]),
    sc("filter-location", "Lokasyon süzgeci: yalnız Uptown", O, [{"wait": 1200}, fill("select[aria-label='Location']", pid(0x102))]),
    sc("filter-type", "Belge türü süzgeci: yalnız Food handler", O, [{"wait": 1200}, fill("select[aria-label='Document type']", DOC_FOOD)]),
    sc("search", "Arama: Jasmine Torres'in belgeleri", O, [fill("input[aria-label='Search employee documents']", "Jasmine")]),
    sc("filter-empty", "Süzgeç boşu: No documents match these filters.", O, [fill("input[aria-label='Search employee documents']", "zzz")]),
    sc("sort-status", "Status sütununa göre sıralı", O, [click("Status")]),
], part="Sekmeler ve süzgeçler · Document status")
extend("4.1", [
    sc("statuses", "Durum çipleri: Grace period, Time zone needed, Paused, Removed", O, setup="documents-statuses"),
    sc("empty", "Hiç belge yok: No documents yet", O, setup="documents-empty"),
    sc("loading", "Yükleniyor: sütun başlıklarının altında gri satırlar", O, hold=[DOCS + "$"]),
    sc("list-error", "Liste okunamadı: We couldn't load documents + Try again", O, fail=[{"path": DOCS + "$", "method": "GET", "status": 500}]),
    sc("no-access", "Erişim yok: You don't have access to Documents", C, perms=SL + ["employee_documents.read"],
       fail=[{"path": DOCS + "$", "method": "GET", "status": 403}]),
], part="Liste durumları")
extend("4.1", [
    sc("review-drawer", "İnceleme bekleyen belge: dosya kararı (Keep), Reject kapalı, Approve açık (telefonda da)", O, open_doc("Priya", DOC_FOOD)),
    sc("approve", "Approve: Decision saved, durum Completed", O, open_doc("Priya", DOC_FOOD) + [click("Approve")]),
    sc("reject-ready", "Rejection reason yazıldı: Reject açılır", O, open_doc("Priya", DOC_FOOD) + [fill(DECISION, "The photo is blurry. Please upload a clearer scan.")]),
    sc("rejected", "Reject: durum Rejected, ret notu", O, open_doc("Priya", DOC_FOOD) + [fill(DECISION, "The photo is blurry. Please upload a clearer scan."), click("Reject")]),
    sc("discard-all", "Bütün dosyalar Discard: Approve kapalı", O, open_doc("Priya", DOC_FOOD) + [fill("select[aria-label^='Decision for']", "discard")]),
    sc("expired-approve", "Süresi geçmiş belgeyi onaylama reddi: expired document cannot be approved", O, open_doc("Priya", DOC_FOOD) + [click("Approve")],
       fail=[{"path": REQ + "/review$", "method": "POST", "status": 400, "error": "expired document cannot be approved"}]),
    sc("conflict", "Çakışma: This document changed. You're seeing the latest version.", O, open_doc("Priya", DOC_FOOD) + [click("Approve")],
       fail=[{"path": REQ + "/review$", "method": "POST", "status": 409, "reason": "document.changed", "error": "document changed; refresh required"}]),
    sc("unsaved-close", "Kaydedilmemiş notla kapatma: Discard unsaved changes?", O,
       open_doc("Priya", DOC_FOOD) + [fill(DECISION, "Needs a clearer scan."), click("Close document details")]),
    sc("next", "Next: listede sıradaki belge açılır", O, [click("Needs review"), {"click": "tbody tr td"}, click("Next")]),
    sc("download-error", "Dosya açılamadı: Couldn't open the file. Try again.", O, open_doc("Priya", DOC_FOOD) + [click(".document-file-row button")],
       fail=[{"path": r"/download$", "method": "GET", "status": 500}]),
    sc("doc-loading", "Belge yükleniyor: çekmecede gri satırlar", O, open_doc("Priya", DOC_FOOD), hold=[REQ + "$"]),
    sc("doc-error", "Belge okunamadı: We couldn't load this document + Try again", O, open_doc("Priya", DOC_FOOD),
       fail=[{"path": REQ + "$", "method": "GET", "status": 500}]),
    sc("from-link", "Bildirimden açılış: adresle Priya'nın Food Handler Card çekmecesi", O,
       path="/app/employees/documents?requirement=00100049-0000-4000-8000-000000100049"),
    sc("rejected-doc", "Reddedilmiş belge: ret notu ve Deadline (Noah Garcia, W-4)", O, open_doc("Noah", DOC_W4)),
], part="Belge çekmecesi · Review")
extend("4.1", [
    sc("missing-drawer", "Eksik belge: Deadline ve Extend delivery deadline (Jasmine, W-4)", O, open_doc("Jasmine", DOC_W4)),
    sc("extended", "Süre uzatıldı: yeni Deadline", O, open_doc("Jasmine", DOC_W4) + [
        fill(".document-detail-body input[type=number]", "5"), fill(".document-detail-body fieldset textarea", "Waiting for the new Social Security card."), click("Extend deadline")]),
    sc("exempt-arm", "Muafiyet onayı: açıklama, Reason boşken onay kapalı", O, open_doc("Jasmine", DOC_W4) + [click("Exempt from this document")]),
    sc("exempt-done", "Muaf tutuldu: durum Exempt, Remove exemption", O, open_doc("Jasmine", DOC_W4) + [click("Exempt from this document"),
        fill(".catalog-delete-confirm textarea", "Submitted a paper W-4 at the office."), click("Exempt from this document", within=".catalog-delete-buttons")]),
    sc("exempt-remove", "Muafiyeti kaldır onayı (Aisha Johnson, Handbook page)", O, open_doc("Aisha", DOC_HANDBOOK) + [click("Remove exemption")]),
    sc("owner-doc", "Owner'ın kendi belgesi: Owners aren't required to submit documents.", O, open_doc("Mert")),
    sc("suspended", "Erişim kısıtlı uyarısı: Workspace access is restricted...", O, open_doc("Jasmine", DOC_W4), setup="documents-suspended"),
    sc("timezone", "Belge saat dilimi alanı: Document time zone, Save document time zone", O, open_doc("Jasmine", DOC_W4), setup="documents-timezone"),
    sc("reader", "İnceleme izni yok (özel rol): Reject/Approve, muafiyet, uzatma yok", C, open_doc("Priya", DOC_FOOD), perms=SL + ["employee_documents.read"]),
], part="Belge çekmecesi · Missing, exempt")

# ---------------- 4.2 Employees archive ----------------
ARCH = "/app/employees/archive"
def arch(person, section="profile"): return emp(person, section, ARCH)
set_part("4.2", "Roller", ["owner", "manager"])
extend("4.2", [
    sc("search-empty", "Arama sonuçsuz: No matching employees", O, path=ARCH + "?q=zzz"),
    sc("empty", "Arşiv boş: No archived employees", O, setup="employees-empty"),
    sc("to-active", "Active sekmesi: Employees sayfasına geçer (4.0 notu)", O, [click("Active", within=STATUS)]),
], part="Arşiv listesi · Archived")
extend("4.2", [
    sc("brian", "Arşivlenmiş kişi (Brian Foster): alanlar salt okunur, Restore employee (telefonda da)", O, path=arch(BRIAN)),
    sc("brian-access", "Bağlı arşivlenmiş kişi: Access'te Archived", O, path=arch(BRIAN, "access")),
    sc("megan-access", "Bağlı olmayan arşivlenmiş kişi (Megan Ross): Invitation revoked, davet düğmesi yok", O, path=arch(MEGAN, "access")),
    sc("brian-history", "History: işten çıkarma olayı (Terminated)", O, path=arch(BRIAN, "history")),
    sc("restored", "Restore employee: çekmece kapanır, Megan listeden çıkar", O, [click("Restore employee")], path=arch(MEGAN)),
    sc("manager-restore", "Müdür arşivlenmiş kişiyi açar (Brian): Restore employee yok, yalnız Close", M, path=arch(BRIAN)),
    sc("restore-error", "Geri yükleme hatası: hata satırı, çekmece açık kalır", O, [click("Restore employee")], path=arch(MEGAN),
       fail=[{"path": ONE + "/archive$", "method": "PATCH", "status": 500, "error": "Employee could not be restored right now."}]),
], part="Çalışan çekmecesi · Archived")

# ---------------- 5.0 Availability ----------------
AV = r"/workspaces/[^/]+/availability/weekly"
def av(person): return emp(person, "availability", "/app/availability")
REMIND = [click("Manager reminders")]
set_part("5.0", "Roller", ["owner", "manager"])
set_part("5.0", "Ekip tablosu · Team availability", ["missing"])
extend("5.0", [
    sc("submitted", "Submitted sekmesi: gönderenler", O, [click("Submitted", within="[aria-label='Submission status']")]),
    sc("filter", "Uptown + arama HV-00: sayaç değişir", O, [{"wait": 1200}, fill("select[aria-label='Location']", pid(0x102)), fill("input[aria-label='Search employees']", "HV-00")]),
    sc("search-empty", "Boş görünüm: No employees match this view", O, [fill("input[aria-label='Search employees']", "zzz")]),
    sc("sort", "Employee sütunu ters sıralı", O, [{"wait": 1200}, click("Employee", within="[aria-label='Team availability']")]),
    sc("many-ranges", "Bir günde 3'ten çok aralık: +n more (Priya, Wednesday)", O, [fill("input[aria-label='Search employees']", "Priya")], setup="availability-many-ranges"),
    sc("shift-types", "Vardiya türü kipi: hücrelerde saat yerine tür adları (Dinner, Close)", O, setup="availability-shift-types"),
    sc("cannot-open", "Müdür açamadığı kişi: ad ve gün düğmeleri kapalı (Tom Becker)", M, [fill("input[aria-label='Search employees']", "Tom")], setup="availability-cannot-open"),
], part="Ekip tablosu · Team availability")
extend("5.0", [
    sc("loading", "Yükleniyor: tablonun gri iskeleti", O, hold=[AV + "/team$"]),
    sc("team-error", "Ekip okunamadı: We couldn't load team availability + Try again", O, fail=[{"path": AV + "/team$", "method": "GET", "status": 500}]),
    sc("no-access", "Erişim yok: You don't have access to Availability", C, fail=[{"path": AV + "/team$", "method": "GET", "status": 403}]),
], part="Sayfa durumları")
extend("5.0", [
    sc("open", "Kişi açıldı: Employee availability sekmesi, Submitted ve haftası (Aisha, telefonda da)", O, [click("Aisha Johnson")]),
    sc("not-submitted", "Göndermemiş kişi: Not submitted, Available all week özeti (Ethan)", O, path=av(ETHAN)),
    sc("from-link", "Bildirimden açılış: adresle Maria'nın haftası", O, path=av(MARIA)),
    sc("panel-error", "Haftalık panel okunamadı: çerçevesiz kart + Try again", O, path=av(MARIA), fail=[{"path": AV + "$", "method": "GET", "status": 500}]),
    sc("no-reminders", "Hatırlatma verisi yok: sekme yok, yalnız Employee availability", O, path=av(MARIA), setup="availability-no-reminders"),
    sc("to-profile", "Çekmeceden Profile bölümüne geçiş", O, [section("profile")], path=av(MARIA)),
], part="Çalışan çekmecesi · Availability")
extend("5.0", [
    sc("reminders", "Manager reminders: notlu gün (Priya)", O, REMIND, path=av(PRIYA)),
    sc("copy", "Use employee preferences: çalışanın haftası kopyalandı, Unsaved changes (Aisha)", O, REMIND + [click("Use employee preferences")], path=av(AISHA)),
    sc("copy-saved", "Kopyalandı ve kaydedildi: Saved", O, REMIND + [click("Use employee preferences"), click("Save", within=".weekly-preferences-actions")], path=av(AISHA)),
    sc("copy-off", "Çalışan göndermemiş: Use employee preferences kapalı (Ethan)", O, REMIND, path=av(ETHAN)),
    sc("hours", "Saat aralığı eklendi: Monday başlangıç/bitiş, End of day", O, REMIND + [click("Add hours on Monday")], path=av(ETHAN)),
    sc("all-day", "All day: Monday All day unavailable", O, REMIND + [click("input[aria-label='Monday all day unavailable']")], path=av(ETHAN)),
    sc("bad-time", "Geçersiz saat: alan kırmızı, kaydetme hatası", O, REMIND + [click("Add hours on Monday"),
        fill("input[aria-label='Monday unavailable start']", "25:99"), click("Save", within=".weekly-preferences-actions")], path=av(ETHAN)),
    sc("note", "Gün notu: Add Monday manager note, not alanı", O, REMIND + [click("Add Monday manager note"),
        fill("textarea[aria-label='Monday manager note']", "Picks up her kids after 3 PM.")], path=av(ETHAN)),
    sc("off", "Hatırlatmalar kapalı: Reminders are off..., düzenleyici kilitli", O, REMIND + [click("input[aria-label='Enable manager reminders']")], path=av(PRIYA)),
    sc("cleared", "Clear all unavailable selections: Unsaved changes, Discard açık", O, REMIND + [click("Clear all unavailable selections")], path=av(PRIYA)),
    sc("conflict", "Çakışma: Availability changed... + Reload", O, REMIND + [click("Clear all unavailable selections"), click("Save", within=".weekly-preferences-actions")], path=av(PRIYA),
       fail=[{"path": AV + "$", "method": "POST", "status": 409, "reason": "availability.changed", "error": "Availability changed. Reload before saving; your draft has not been saved."}]),
    sc("save-refused", "Kaydetme reddi (yetki): You don't have access to change this availability.", M, REMIND + [click("Clear all unavailable selections"), click("Save", within=".weekly-preferences-actions")], path=av(PRIYA),
       fail=[{"path": AV + "$", "method": "POST", "status": 403, "reason": "authz.out_of_scope"}]),
    sc("shift-type-editor", "Vardiya türü kipinde düzenleyici: tür düğmeleri, Shift default hours", O, REMIND + [click("Shift default hours")], path=av(PRIYA), setup="availability-shift-types"),
], part="Çalışan çekmecesi · Manager reminders")

# ---------------- 6.0 Important Dates (under Announcements, EKRAN-08) ----------------
# The published posts added to Important Dates; each opens in the one announcement drawer.
# Setups: dates-empty (mock/hub-setups.ts), posts-manager-two-locations (mock/announcements-service.ts).
DATES = r"/communications/important-dates"
NEW_TITLE = fill("input[placeholder='What is it about?']", "Patio reopening")
NEW_BODY = fill("textarea[placeholder='Share the details your team needs.']", "The patio opens again with the new heaters.")
STARTS = "input[data-field='starts_on']"
# A new dated post's Details filled in; locations and that day's hours are on Details too.
def new_where(days=7): return [click("New"), NEW_TITLE, NEW_BODY, fill(STARTS, "{today+%d}" % days)]
# A role without important_dates.read stays on this address and sees the access card; the old workspace landing stays allowed.
page("6.0")["via"] = r"^/app/workspace/?$"
def day_at(choice, place="Harbor & Vine Downtown"): return click(choice, within=f"[aria-label='{place} that day']")
set_part("6.0", "Roller", ["manager"])
set_part("6.0", "Liste · Important dates", ["list", "past"])
set_part("6.0", "Çekmece · Announcement", ["new", "closed", "short", "shifts", "removed"])
extend("6.0", [
    sc("empty", "Tarihli duyuru yok: No dates here.", O, setup="dates-empty"),
    sc("yearly", "Her yıl tekrarlanan: Christmas Day (Every year), iki lokasyon kapalı", O, [click("Christmas Day")]),
    sc("search", "Arama: deep clean (başlık ve metinde arar)", O, [fill("input[aria-label='Search important dates']", "deep clean")]),
    sc("search-empty", "Arama sonuç vermez: xyz", O, [fill("input[aria-label='Search important dates']", "xyz")]),
    sc("reader-search", "Salt okur arar (New yok): Christmas", C, [fill("input[aria-label='Search important dates']", "Christmas")], perms=SL + ["important_dates.read"]),
], part="Liste · Important dates")
extend("6.0", [
    sc("new-closed", "Yeni gün, Downtown kapalı: sarı bant ve Shifts sayacı", O,
       new_where() + [click("Harbor & Vine Downtown", within=".ad-loc"), day_at("Closed")]),
    sc("new-short", "Yeni gün, kısa saat: saatler düğmelerin altında açılır", O,
       new_where() + [click("Harbor & Vine Downtown", within=".ad-loc"), day_at("Short hours")]),
    sc("timed", "All day kapalı: başlangıç ve bitiş saati", O, [click("New"), NEW_TITLE, NEW_BODY, fill(STARTS, "{today+7}"), click("All day")]),
    sc("timed-24h", "24 saatlik workspace: saatler 24 saatlik, AM/PM yok", O, [click("New"), NEW_TITLE, NEW_BODY, fill(STARTS, "{today+7}"), click("All day")], setup="dates-24h"),
    sc("shift-choices", "Shifts sekmesi: seçilen düğme sonucunun rengini alır (Remove kırmızı, Open shift sarı, Keep yeşil)", O,
       new_where() + [click("Harbor & Vine Downtown", within=".ad-loc"), day_at("Closed"), click("Shifts"),
                      click('.ad-shift + .ad-shift [data-tone="amber"]'), click('.ad-shift + .ad-shift + .ad-shift [data-tone="green"]')]),
    sc("past-date", "Geçmiş başlangıç: Next geçer, Details'a dönünce Starts alanında \"It can't start before today\"", O, [click("New"), NEW_TITLE, NEW_BODY, fill(STARTS, "{today-1}"), click("Next"), click("Details"), {"scroll": STARTS}]),
    sc("audience", "Kime gidiyor: Hartwell private buyout (Uptown'daki herkes)", O, [click("Hartwell private buyout"), click("Audience")]),
    sc("acks", "Onaylayanlar Audience'ta: Hartwell private buyout", O, [click("Hartwell private buyout"), click("Audience")]),
], part="Çekmece · Announcement")
extend("6.0", [
    sc("admin", "Admin · Daniel Brooks: owner gibi bütün lokasyonlar", A),
    sc("manager-new", "Müdür yeni gün: yalnız Downtown seçilebilir", M, new_where()),
    sc("manager-other", "Müdür, owner'ın iki lokasyonlu kaydını açar: salt okunur", M, [click("Christmas Day")]),
    sc("manager-two", "İki lokasyonun müdürü: Downtown ve Uptown seçilebilir", M, new_where(),
       setup="posts-manager-two-locations"),
    sc("reader", "Salt okur (özel rol): New yok, kayıt okuyucu görünümünde açılır", C, [click("Kitchen deep clean & hood service")], perms=SL + ["important_dates.read"]),
], part="Roller")
extend("6.0", [
    sc("loading", "Yükleniyor: listenin gri iskeleti", O, hold=[DATES + "$"]),
    sc("list-error", "Liste okunamadı: We couldn't load Important Dates + Try again", O, fail=[{"path": DATES + "$", "method": "GET", "status": 500}]),
    sc("no-permission", "important_dates.read yok: aynı adreste erişim kartı (You don't have access to Important Dates)", C, perms=SL),
], part="Sayfa durumları")
