# Giriş, kurulum, workspace hub, Account ve açık sayfalar (1.0–1.11, 11.0–11.6, 12.0–12.4).
# Kurulum verisi (setup) mock/giris-setups.ts'te; demo parolası [GIZLI-CIKARILDI].
PW = "[GIZLI-CIKARILDI]"
EMAIL = "owner@harborvine.test"
def sign_in_fill(password=PW, email=EMAIL):
    return [fill("#email", email), fill("#password", password)]
INVITE_FROM = {"from": f"/invite/accept?token={TOK}"}

# ---------------------------------------------------------------- 1.0 Sign in
set_part("1.0", "Giriş formu · Sign in", ["form", "wrong", "expired"])
set_part("1.0", "Hesap açma · Create account", ["create", "invite"])
extend("1.0", [
    sc("pending", "Gönderiliyor: Please wait, düğme kapalı", hold=[r"^auth/signInWithPassword$"],
       steps=[*sign_in_fill(), click("button[type=submit]")]),
    sc("success", "Doğru parola: giriş yapılır, uygulamaya geçer (PAGES uyarısı)",
       steps=[*sign_in_fill(), click("button[type=submit]")]),
], part="Giriş formu · Sign in")
extend("1.0", [
    sc("invite-sign-in", "Davetle gelen kişi: I already have an account → giriş (Create a new account ikincil)", state=INVITE_FROM,
       steps=[click("I already have an account")]),
    sc("signup-error", "Hesap açılamadı: User already registered",
       fail=[{"path": r"^auth/signUp$", "error": "User already registered"}],
       steps=[click("Create a workspace account"), fill("#email", EMAIL), fill("#password", PW), click("button[type=submit]")]),
], part="Hesap açma · Create account")
extend("1.0", [
    sc("context-error", "Giriş oldu ama workspace bilgisi yüklenemedi: form + hata satırı (uygulamaya geçmez)",
       fail=[{"path": r"/v1/context$", "status": 500, "error": "Workspace context could not be loaded"}],
       steps=[*sign_in_fill(), click("button[type=submit]")]),
    sc("signed-in", "Oturumu açık kişi: Sign in açılmaz, uygulamaya geçer (PAGES uyarısı)", setup="g-signed-in"),
], part="Oturum açıkken · Signed in")

# ---------------------------------------------------------------- 1.9 Check your email
set_part("1.9", "E-posta onayı · Check your email", ["workspace", "invite"])
extend("1.9", [
    sc("back", "Back to sign in → giriş formu", steps=[click("Create a workspace account"), fill("#email", "new.owner@harborvine.test"),
       fill("#password", PW), click("button[type=submit]"), click("Back to sign in")]),
], part="E-posta onayı · Check your email")

# ---------------------------------------------------------------- 1.1 Forgot password
replace("1.1", "sent", sc("sent", "Bağlantı gönderildi: If an account exists…",
        steps=[fill("#email", EMAIL), click("Send reset link")]))
set_part("1.1", "Sıfırlama formu · Reset your password", ["form", "sent"])
extend("1.1", [
    sc("sending", "Gönderiliyor: Please wait", hold=[r"/v1/auth/password-reset$"], steps=[fill("#email", EMAIL), click("Send reset link")]),
    sc("limited", "Çok deneme: Too many reset requests", fail=[{"path": r"/v1/auth/password-reset$", "status": 429, "error": "Too many reset requests. Try again later."}],
       steps=[fill("#email", EMAIL), click("Send reset link")]),
    sc("unavailable", "Servis kapalı: Password reset is not available", fail=[{"path": r"/v1/auth/password-reset$", "status": 503, "error": "Password reset is not available"}],
       steps=[fill("#email", EMAIL), click("Send reset link")]),
], part="Sıfırlama formu · Reset your password")

# ---------------------------------------------------------------- 1.2 Reset password
RESET = "/reset-password#token_hash=demo-reset-link"
def new_pw(a=PW, b=PW): return [fill("#new-password", a), fill("#confirm-password", b), click("button[type=submit]")]
set_part("1.2", "Yeni parola · Choose a new password", ["invalid", "valid"])
extend("1.2", [
    sc("mismatch", "Parolalar uyuşmuyor: Passwords do not match.", path=RESET, steps=new_pw(PW, "harbor-vine-2027")),
    sc("saving", "Kaydediliyor: Please wait", path=RESET, hold=[r"^auth/updateUser$"], steps=new_pw()),
    sc("refused", "Sunucu yeni parolayı reddetti (aynı parola), ikinci deneme için form kalır", path=RESET,
       fail=[{"path": r"^auth/updateUser$", "error": "New password should be different from the old password.", "reason": "same_password"}], steps=new_pw()),
    sc("used-link", "Bağlantı kaydederken geçersiz çıktı → Reset link not valid", path=RESET,
       fail=[{"path": r"^auth/verifyOtp$", "error": "Email link is invalid or has expired", "status": 403, "reason": "otp_expired"}], steps=new_pw()),
], part="Yeni parola · Choose a new password")

# ---------------------------------------------------------------- 1.3 Account recovery
REC = f"/account-recovery?token={TOK}"
set_part("1.3", "Hesabı geri al · Bring your account back", ["form", "link", "restored"])
extend("1.3", [
    sc("restoring", "Geri alınıyor: Restoring", path=REC, hold=[r"/deletion/recovery$"], steps=[click("Restore my account")]),
    sc("refused", "Geri alınamadı (14 gün geçti ya da bağlantı kullanıldı)", path=REC,
       fail=[{"path": r"/deletion/recovery$", "status": 400, "error": "Valid recovery token required"}], steps=[click("Restore my account")]),
], part="Hesabı geri al · Bring your account back")

# ---------------------------------------------------------------- 1.4 Accept invitation
INV = f"/invite/accept?token={TOK}"
set_part("1.4", "Davet bağlantısı · Accept your invitation", ["valid"])
set_part("1.4", "Kapalı davet", ["expired", "revoked", "replaced", "broken"])
extend("1.4", [
    sc("accepting", "Kabul ediliyor: Accepting", E, path=INV, hold=[r"/v1/invitations/accept$"], steps=[click("Accept invitation")]),
    sc("accepted", "Kabul edildi: You're in + Start onboarding", E, path=INV, steps=[click("Accept invitation")]),
    sc("legacy", "Eski adres /accept-invite aynı ekranı açar", E, path=f"/accept-invite?token={TOK}"),
], part="Davet bağlantısı · Accept your invitation")
extend("1.4", [
    sc("declined", "Reddedilmiş: You declined this invitation", E, path=f"{INV}-declined"),
    sc("already", "Zaten katılmış: You have already joined Harbor & Vine", E, path=f"{INV}-accepted"),
    sc("unavailable", "Workspace kapalı ya da askıda: … isn't open right now", E, path=f"{INV}-workspace_unavailable"),
    sc("missing", "Hiçbir davetin taşımadığı bağlantı: This link doesn't work anymore", E, path=f"{INV}-missing"),
    sc("preview-failed", "Davet okunamadı: This invitation could not be opened", E, path=f"{INV}-fail"),
], part="Kapalı davet")
extend("1.4", [
    sc("mismatch", "Başka adrese gönderilmiş: This invitation is for another address", E, path=f"{INV}-mismatch", steps=[click("Accept invitation")]),
    sc("unconfirmed", "E-posta onaysız: Confirm your email first", E, path=f"{INV}-unconfirmed", steps=[click("Accept invitation")]),
    sc("member", "Kabul anında zaten üye: You have already joined", E, path=f"{INV}-member", steps=[click("Accept invitation")]),
    sc("accept-failed", "Kabul sırasında sunucu hatası: This invitation could not be opened", E, path=INV,
       fail=[{"path": r"/v1/invitations/accept$", "status": 500}], steps=[click("Accept invitation")]),
], part="Kabul reddi")

# ---------------------------------------------------------------- 1.5 Workspace hub
CEDAR = "Cedar & Smoke BBQ"
replace("1.5", "closed", sc("closed", "Bitenlerin üçü bir arada: Closed, Access removed, On hold (Why → 1.6)", O, setup="g-hub-endings"))
set_part("1.5", "Roller", ["owner", "manager", "employee"])
set_part("1.5", "Bitenler · No longer open to you", ["closed"])
set_part("1.5", "Davetler · Invitations", ["join"])
extend("1.5", [
    sc("declined", "Davet reddedildi: liste Your workspaces olur", O, [click(f"Decline invitation to {CEDAR}"), click("Confirm decline")]),
    sc("two-invites", "İki davet: You have 2 invitations (biri yarın bitiyor)", O, setup="g-hub-two-invites"),
    sc("join-failed", "Katılma hatası: Invitation update failed", E, [click(f"Join {CEDAR}")],
       fail=[{"path": r"/v1/invitations/[^/]+/accept$", "status": 500}]),
    sc("join-unconfirmed", "E-posta onaysız: Confirm your email first…", E, [click(f"Join {CEDAR}")], setup="g-hub-unconfirmed"),
    sc("invites-failed", "Davetler yüklenemedi satırı; liste yine görünür", O,
       fail=[{"path": r"/v1/invitations/pending$", "method": "GET", "status": 500}]),
], part="Davetler · Invitations")
extend("1.5", [
    sc("draft", "Kendi yarım kurulumu: Setup in progress, Discard / Continue (Your own workspace yok)", O, setup="g-hub-draft"),
    sc("discarded", "Kurulum silindi: satır kalkar, Your own workspace geri gelir", O,
       [click("Discard setup for Harbor & Vine Seaport"), click("Confirm delete")], setup="g-hub-draft"),
    sc("onboarding", "Katıldığı workspace'in onboarding'i sürüyor: Onboarding in progress", E, setup="g-hub-joined"),
    sc("left", "Onboarding'i bırakma (iki tık): workspace listeden düşer", E, [click(f"Decline onboarding for {CEDAR}"), click("Confirm decline")], setup="g-hub-joined"),
], part="Yarım kurulumlar · In progress")
extend("1.5", [
    sc("no-invites", "Davet yok: Your workspaces + Your own workspace", O, setup="g-hub-no-invites"),
    sc("open", "Open → workspace açılır, uygulamaya geçer (PAGES uyarısı)", O, [click("Open Saltline Oyster Bar")]),
    sc("open-failed", "Açılamadı: This workspace could not be opened", O, [click("Open Saltline Oyster Bar")],
       fail=[{"path": r"/v1/context$", "status": 500}]),
    sc("create", "Create your workspace → kurulum ekranı (PAGES uyarısı: 1.7)", O, [click("Create your workspace")], setup="g-hub-no-invites"),
    sc("create-failed", "Workspace açılamadı: Workspace could not be created", O, [click("Create your workspace")], setup="g-hub-no-invites",
       fail=[{"path": r"/v1/account/workspaces$", "method": "POST", "status": 500}]),
    sc("loading", "Yükleniyor: Checking your account", O, hold=[r"/v1/account/workspaces$"]),
    sc("auto-open", "Girişten gelen tek seçenekli hesap: kendiliğinden workspace'e geçer (PAGES uyarısı)", O, setup="g-hub-single", state={"landing": True}),
    sc("list-failed", "Liste yüklenemedi: Your workspaces didn't load + Try again", O,
       fail=[{"path": r"/v1/account/workspaces$", "method": "GET", "status": 500}]),
], part="Workspace listesi · Where you work")
extend("1.5", [
    sc("welcome-new", "Hiç bağlanmamış hesap: Welcome to Newfork", E, setup="g-hub-empty"),
    sc("welcome-back", "Eskiden bağlıydı: Welcome back", E, setup="g-hub-empty-returning"),
    sc("waiting", "Davet bekliyorum: No invitation yet + Check again", E, [click("I am waiting for an invitation")], setup="g-hub-empty"),
    sc("waiting-failed", "Davet bekleme ekranında hata: Invitations didn't load", E, [click("I am waiting for an invitation")], setup="g-hub-empty",
       fail=[{"path": r"/v1/invitations/pending$", "method": "GET", "status": 500}]),
], part="Boş hesap · Welcome")

page("1.5")["via"] = r"^/(invitations/pending|no-organization|organization-switcher)/?$"
extend("1.5", [sc("old-path", "Eski adres /organization-switcher → Workspace hub", O, path="/organization-switcher")], part="Eski adres · Old address")

# ---------------------------------------------------------------- 1.6 Workspace status
ST = "/workspaces/status"
replace("1.6", "owner", sc("owner", "Owner · Pier 9 Kitchen kapandı: It closed on …", O, path=f"{ST}/9e19a7c1-2d4b-4f6a-8c3e-1b5d7f9a0c63"))
replace("1.6", "manager", sc("manager", "Manager · Bayside Grill askıda: is on hold", M, path=f"{ST}/ba751de0-3c6e-4a8b-9d2f-4e6a8c0b2d74"))
replace("1.6", "employee", sc("employee", "Employee · Corner Bistro erişimi kaldırıldı: You no longer have access", E, path=f"{ST}/c0b1e7a5-4d8f-4b9c-ae31-5f7b9d1c3e85"))
set_part("1.6", "Durum ekranı · Workspace status", ["owner", "manager", "employee"])
page("1.6")["via"] = r"^/(workspaces|organization-switcher)/suspended(/.*)?$"
extend("1.6", [
    sc("default", "Kimliksiz adres: That workspace isn't open to you", O, path=ST),
    sc("undated", "Kapanış tarihi bilinmiyor: tarihsiz has closed metni", O, path=f"{ST}/9e19a7c1-2d4b-4f6a-8c3e-1b5d7f9a0c63", setup="g-status-closed-undated"),
    sc("passed", "Planlı kapanışın günü geçti: Dockside Tavern has closed", O, path=f"{ST}/d0c5d1de-7a3b-4c1e-9f20-5b7d9e1f3a65", setup="g-status-closure-passed"),
    sc("loading", "Yükleniyor: Checking your account", O, path=f"{ST}/9e19a7c1-2d4b-4f6a-8c3e-1b5d7f9a0c63", hold=[r"/v1/account/workspaces$"]),
    sc("legacy", "Eski adres /workspaces/suspended/… buraya döner", M, path="/workspaces/suspended/ba751de0-3c6e-4a8b-9d2f-4e6a8c0b2d74"),
], part="Durum ekranı · Workspace status")

# ---------------------------------------------------------------- 1.10 Almost ready (yeni)
add("1.10", "Almost ready", "workspace-hub", "/app", r"^/app/?$", [M, E],
    "Owner kurulumu bitirmemişken owner olmayan üyenin gördüğü bekleme ekranı: Check again, birden çok workspace varsa Choose a workspace.",
    "Kurulumu süren workspace'te /app ya da /onboarding açılınca", "Owner olmayan üye (admin, manager, çalışan)",
    [sc("manager", "Manager · birden çok workspace: Check again + Choose a workspace", M, setup="g-hub-setup-pending", part="Bekleme ekranı · Almost ready"),
     sc("employee", "Employee · tek workspace: yalnız Check again", E, setup="g-hub-setup-pending-single", part="Bekleme ekranı · Almost ready"),
     sc("check-again", "Check again: kurulum hâlâ sürüyor, ekran kalır", M, [click("Check again")], setup="g-hub-setup-pending", part="Bekleme ekranı · Almost ready"),
     sc("choose", "Choose a workspace → Workspace hub (PAGES uyarısı: 1.5)", M, [click("Choose a workspace")], setup="g-hub-setup-pending", part="Bekleme ekranı · Almost ready")])

# ---------------------------------------------------------------- 1.11 That workspace didn't load (yeni)
add("1.11", "That workspace didn't load", "workspace-hub", "/app", r"^/app/?$", [O, M, E],
    "Workspace bilgisi (context) sunucudan gelmeyince açılan hata ekranı: Try again, çerçevede Sign out.",
    "Uygulamanın herhangi bir /app adresi ya da /onboarding açılırken", "Herkes",
    [sc("owner", "Owner · bağlam hatası: That workspace didn't load + Try again", O,
        fail=[{"path": r"/v1/context$", "status": 500}], part="Hata ekranı · That workspace didn't load"),
     sc("employee", "Employee · aynı hata ekranı (telefonda da)", E,
        fail=[{"path": r"/v1/context$", "status": 500}], part="Hata ekranı · That workspace didn't load"),
     sc("retry", "Try again: hata sürüyor, ekran kalır", O, [click("Try again")],
        fail=[{"path": r"/v1/context$", "status": 500}], part="Hata ekranı · That workspace didn't load"),
     sc("loading", "Yükleniyor: Loading workspace (boş sahne)", O, hold=[r"/v1/context$"], part="Hata ekranı · That workspace didn't load"),
     sc("no-workspace", "Hata yok ama açılacak workspace yok → Workspace hub (PAGES uyarısı: 1.5)", O,
        fail=[{"path": r"/v1/context$", "status": 401, "error": "Invalid session or membership"}], part="Hata ekranı · That workspace didn't load")])

# ---------------------------------------------------------------- 1.7 Owner setup
SEA = "Harbor & Vine Seaport"
def location_form(name=SEA, street="200 Seaport Blvd", postal="02210", short=None, phone=None):
    steps = [fill("#location-name", name)]
    if short: steps.append(fill("#location-short-name", short))
    steps += [fill("#location-street", street), fill("#location-city", "Boston"), fill("#location-region", "MA"), fill("#location-postal", postal)]
    if phone: steps.append(fill("#location-phone", phone))
    return steps + [{"wait": 1200}]
replace("1.7", "next", sc("next", "Adım 1 dolduruldu: Continue → adım 2 (Where does your team work?)", O,
        [fill("#owner-first-name", "Mert"), fill("#owner-last-name", "Tepebas"), fill("#workspace-name", SEA), click("Continue")]))
set_part("1.7", "Adım 1 · Name your workspace", ["start", "next"])
extend("1.7", [
    sc("letters", "ABD harf kuralı: Şule yazınca alan hatası, Continue kapalı", O, [fill("#owner-first-name", "Şule"), fill("#owner-last-name", "Yılmaz")]),
], part="Adım 1 · Name your workspace")
extend("1.7", [
    sc("step2", "Adım 2 boş: No locations yet, Continue kapalı", O, setup="g-setup-step2"),
    sc("location-added", "Lokasyon eklendi: satır + Location added, Continue açık", O, [*location_form(), click("Add location")], setup="g-setup-step2"),
    sc("location-errors", "Alan hataları: aynı kısa ad (already goes by that short name) ve geçersiz telefon", O,
       [*location_form("Harbor & Vine Back Bay", "1 Boylston St", "02116", short="SEA", phone="555"), click("Add location")], setup="g-setup-step2-location"),
    sc("location-edit", "Düzenleme: Edit Harbor & Vine Seaport, Cancel + Save changes, Continue kapalı", O, [click(f"Edit {SEA}")], setup="g-setup-step2-location"),
    sc("location-remove", "Lokasyon silme (iki tık): liste boşalır, Continue kapalı", O, [click(f"Remove {SEA}"), click("Confirm remove")], setup="g-setup-step2-location"),
], part="Adım 2 · Locations")
extend("1.7", [
    sc("step3", "Adım 3 boş: Management notu, Add a department formu", O, setup="g-setup-step3"),
    sc("structure-added", "Departman ve iş eklendi: Front of house + Server, Continue açık", O,
       [fill("#department-name", "Front of house"), click("Add department"), {"wait": 500}, fill("#job-name", "Server"), click("Add job")], setup="g-setup-step3"),
    sc("structure", "Hazır yapı: Front of house (Server, Host), Kitchen (Line Cook)", O, setup="g-setup-step3-structure"),
    sc("rename", "Departmanı yeniden adlandırma: Front of house satır içi alan + Save / Cancel", O,
       [{"click": "text=Rename", "within": '.ob-dept-row:has(button[aria-label="Remove Front of house"])'}], setup="g-setup-step3-structure"),
    sc("remove-department", "İşli departmanı silme (iki tık): Front of house ve 2 işi gider", O, [click("Remove Front of house"), click("Confirm remove")], setup="g-setup-step3-structure"),
    sc("job-panel", "İş paneli: Server açık (ad, departman, Save / Remove / Close)", O, [click("Server")], setup="g-setup-step3-structure"),
    sc("loose-job", "Departmanı gitmiş iş: No department grubu (Barback)", O, setup="g-setup-step3-loose"),
    sc("duplicate", "Aynı adlı departman reddi: hata barda", O, [click("New department"), fill("#department-name", "Kitchen"), click("Add department")],
       setup="g-setup-step3-structure"),
], part="Adım 3 · Jobs")
extend("1.7", [
    sc("step4", "Adım 4 boş: Add employee kapalı, Owner işi kilitli", O, setup="g-setup-step4"),
    sc("employee-added", "Kişi eklendi: Added so far + davet kurulum bitince gider", O,
       [fill("#employee-first-name", "Ava"), fill("#employee-last-name", "Chen"), fill("#employee-email", "ava.chen@harborvine.test"),
        click(SEA), click("Server"), click("Add employee")], setup="g-setup-step4"),
    sc("exempt", "Works remotely + Not on the schedule: Locations / Jobs zorunlu değil", O,
       [fill("#employee-first-name", "Ava"), click("Works remotely"), click("Not on the schedule")], setup="g-setup-step4"),
    sc("draft-finish", "Taslak varken Finish: Add the employee draft or clear it…", O, [fill("#employee-first-name", "Ava"), click("Finish setup")], setup="g-setup-step4"),
    sc("clear-draft", "Taslağı silme iki tık: Confirm clear → Draft cleared", O,
       [fill("#employee-first-name", "Ava"), click("Clear draft"), click("Confirm clear")], setup="g-setup-step4"),
    sc("finish", "Finish setup → Workspace ana sayfasına geçer (PAGES uyarısı)", O, [click("Finish setup")], setup="g-setup-step4"),
    sc("finish-no-location", "Lokasyonsuz Finish: adım 2'ye döner + Add at least one active location…", O, [click("Finish setup")], setup="g-setup-step4-no-location"),
], part="Adım 4 · Team")
extend("1.7", [
    sc("start-over", "Baştan başlat: adım 1 + Setup reset", O, [click("Start over"), click("Confirm start over")], setup="g-setup-step3-structure"),
    sc("changed", "Başka sekmede değişti: Your setup changed in another tab or window…", O, [*location_form(), click("Add location")], setup="g-setup-step2",
       fail=[{"path": r"/owner-onboarding$", "method": "PATCH", "status": 409, "reason": "workspace.onboarding_changed", "error": "owner onboarding revision conflict"}]),
    sc("loading", "Yükleniyor: Loading your setup…", O, hold=[r"/settings/locations$"]),
    sc("references-failed", "Kurulum verisi yüklenemedi: hata satırı", O, fail=[{"path": r"/settings/locations$", "status": 500, "error": "Setup references could not be loaded"}]),
    sc("single", "Tek workspace: Switch workspace yok", O, setup="g-setup-single"),
    sc("not-owner", "Owner olmayan üye /onboarding açınca: Almost ready", M),
], part="Kurulum çerçevesi · Workspace setup")

# ---------------------------------------------------------------- 1.8 Employee welcome
WS = "/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"
REQ = lambda n: f"0000d001-0000-4000-8000-{n:012x}"
W4, I9, FOOD, BOOK = f"{WS}/documents/{REQ(2)}", f"{WS}/documents/{REQ(3)}", f"{WS}/documents/{REQ(4)}", f"{WS}/acknowledgements/{REQ(5)}"
FILE = 'section[aria-label="Your file"] input[type=file]'
set_part("1.8", "Karşılama · Welcome", ["start"])
set_part("1.8", "Profil · Your details", ["begin"])
extend("1.8", [
    sc("loading", "Yükleniyor: Loading your onboarding", E, path=WS, hold=[r"/v1/me/onboarding$"]),
    sc("load-failed", "Yüklenemedi: Your onboarding didn't load + Try again", E, path=WS, fail=[{"path": r"/v1/me/onboarding$", "method": "GET", "status": 500}]),
    sc("no-availability", "Uygunluk adımı olmayan rol (Manager): adımlarda Availability yok", M, path=WS, setup="g-welcome-no-availability"),
    sc("two-pending", "İki bekleyen onboarding: /welcome hub'a gönderir (PAGES uyarısı: 1.5)", E, setup="g-welcome-two"),
], part="Karşılama · Welcome")
extend("1.8", [
    sc("profile-errors", "Adreste ABD dışı harf: Continue → doğrulama satırı", E,
       [fill("label=Date of birth", "1998-04-17"), fill("label=Street address", "Bağdat Caddesi 12"), fill("label=City", "Boston"),
        fill("label=State", "MA"), fill("label=ZIP code", "02118"), click("Continue")], path=f"{WS}/profile"),
    sc("phone-in-use", "Numara workspace'te başkasında: phone in use uyarısı", E, [fill("label=Phone", "(617) 555-0171"), {"wait": 900}],
       path=f"{WS}/profile", setup="g-account-no-phone"),
    sc("emergency", "Sayfa 2: Who we call in an emergency", E, path=f"{WS}/profile/emergency", setup="g-welcome-profile-filled"),
    sc("relationship-other", "İlişki Other: How you know them alanı", E, [fill("label=Relationship", "Other")], path=f"{WS}/profile/emergency", setup="g-welcome-profile-filled"),
    sc("own-number", "Acil numara kendi numarası: hata", E, [fill("label=Phone", "(617) 555-0142")], path=f"{WS}/profile/emergency", setup="g-welcome-profile-filled"),
    sc("changed", "Başka yerde değişti: Your onboarding changed meanwhile…", E, [click("Save and continue")], path=f"{WS}/profile/emergency",
       setup="g-welcome-profile-filled", fail=[{"path": r"/v1/me/onboarding/profile$", "status": 409, "reason": "onboarding.changed", "error": "onboarding changed; refresh required"}]),
    sc("profile-rejected", "Yönetici profili geri çevirdi: Attention notu", E, path=f"{WS}/profile", setup="g-welcome-profile-rejected"),
], part="Profil · Your details")
extend("1.8", [
    sc("documents", "Belgeler: To upload (W-4, I-9, Food handler) ve To read (handbook)", E, path=f"{WS}/documents", setup="g-welcome-profile-done"),
    sc("w4", "Yükleme belgesi: Form W-4, Choose a file", E, path=W4, setup="g-welcome-profile-done"),
    sc("uploaded", "Dosya seçildi: dosya listesi, Remove, Submit and continue", E, [{"file": FILE, "name": "w4-2026-signed.pdf", "type": "application/pdf", "size": 182311}, {"wait": 900}],
       path=W4, setup="g-welcome-profile-done"),
    sc("i9-draft", "I-9 taslağı: Expiry date + Document number alanları", E, path=I9, setup="g-welcome-i9-draft"),
    sc("upload-failed", "Yükleme başarısız: did not upload + Try again / Drop it", E, [{"file": FILE, "name": "w4-2026-signed.pdf"}, {"wait": 900}],
       path=W4, setup="g-welcome-profile-done", fail=[{"path": r"/upload-url$", "status": 500}]),
    sc("wrong-format", "Kabul edilmeyen biçim (GIF): did not upload", E, [{"file": FILE, "name": "w4-photo.gif", "type": "image/gif"}, {"wait": 900}],
       path=W4, setup="g-welcome-profile-done"),
    sc("defer", "Koşullu belge erteleme: Don't have it yet? + Save reason", E,
       [fill("label=Reason", "My county class is on the 20th; I'll upload the card after it."), click("Save reason")], path=FOOD, setup="g-welcome-profile-done"),
    sc("deadline", "Teslim tarihi (Due …) ve saat dilimi uyarısı", E, path=FOOD, setup="g-welcome-deadline"),
    sc("handbook", "Politika onayı: kutu + ad → Acknowledge and continue açık", E,
       [click("I have read the Harbor"), fill("label=Type your name as", "Maria Lopez")], path=BOOK, setup="g-welcome-profile-done"),
    sc("handbook-signed", "Onaylanmış politika: Signed by … on … + Undo my confirmation", E, path=BOOK, setup="g-welcome-handbook-signed"),
    sc("rejected", "Yönetici reddi: Needs changes rozeti + not", E, path=W4, setup="g-welcome-rejected"),
    sc("document-failed", "Belge yüklenemedi (sayfa içi hata)", E, path=W4, setup="g-welcome-profile-done",
       fail=[{"path": r"/documents/[^/]+$", "method": "GET", "status": 500}]),
], part="Belgeler · Your documents")
extend("1.8", [
    sc("availability", "Uygunluk adımı: haftalık tablo + Skip for now", E, path=f"{WS}/availability", setup="g-welcome-profile-done"),
    sc("availability-leave", "Kaydedilmemiş saatle çıkış: Discard availability changes?", E, [click("Add hours on Monday"), {"wait": 300}, click("Exit onboarding")],
       path=f"{WS}/availability", setup="g-welcome-profile-done"),
], part="Uygunluk · Availability")
extend("1.8", [
    sc("review", "İnceleme: zorunlular eksik, Send for review kapalı", E, path=f"{WS}/review"),
    sc("ready", "İnceleme: hepsi tamam, Send for review açık", E, path=f"{WS}/review", setup="g-welcome-ready"),
    sc("submitted", "Gönderildi: Sent to your manager (düğme yok)", E, path=f"{WS}/review", setup="g-welcome-submitted"),
    sc("changes", "Değişiklik istendi: Your manager asked for a change", E, path=f"{WS}/review", setup="g-welcome-rejected"),
    sc("approved", "Onaylandı: Finishing up (Employee home'a geçiş)", E, path=WS, setup="g-welcome-approved"),
], part="İnceleme · Review")

# ---------------------------------------------------------------- 11.x Account (ortak)
NO_CONTEXT = [{"path": r"/v1/context$", "status": 401, "error": "Invalid session or membership"}]
WRONG_PW = lambda path: [{"path": path, "method": "POST", "status": 400, "reason": "session.password_incorrect", "error": "Current password is incorrect"}]
DEMO_NEW_PW = "new-demo-pass-26"
for no in ["11.0", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6"]:
    set_part(no, "Roller", ["owner", "manager", "employee"])

# ---------------------------------------------------------------- 11.0 Profile
page("11.0")["via"] = r"^/account/?$"
extend("11.0", [
    sc("dirty", "Değişiklik var: Discard + Save açık", E, [fill("label=Phone number", "(617) 555-0143")]),
    sc("missing", "Eksik alan: To save, fill in contact name", E, [fill("label=Contact name", "")]),
    sc("letters", "ABD harf kuralı: Şükrü yazınca alan altında hata", O, [fill("label=Preferred name", "Şükrü")]),
    sc("own-number", "Acil numara kendi numarası: alan hatası", E, [fill("label=Contact phone", "(617) 555-0142")]),
    sc("saved", "Kaydedildi: Profile saved", E, [fill("label=Phone number", "(617) 555-0143"), click("Save")]),
    sc("waiting", "Tercih edilen ad onay bekliyor: Profile saved. A manager needs to approve…", E, [fill("label=Preferred name", "Mari"), click("Save")]),
    sc("contact-failed", "Acil kişi kaydedilemedi: could not be saved in Harbor & Vine. Try again.", E,
       [fill("label=Contact name", "Ana Maria Lopez"), click("Save")],
       fail=[{"path": r"/emergency-contact$", "method": "PUT", "status": 500, "error": "Emergency contact could not be saved"}]),
    sc("contact-ended", "Erişim bitti: can no longer be changed in Harbor & Vine", E,
       [fill("label=Contact name", "Ana Maria Lopez"), click("Save")],
       fail=[{"path": r"/emergency-contact$", "method": "PUT", "status": 403, "reason": "authz.workspace_closed", "error": "workspace is closed"}]),
    sc("save-failed", "Veritabanı kaydı reddetti: hata satırı", E, [fill("label=Phone number", "(617) 555-0143"), click("Save")], setup="g-account-refuse-writes"),
], part="Profil formu · Profile")
extend("11.0", [
    sc("crop", "Fotoğraf seçildi: Crop profile photo penceresi", O, [{"file": 'input[aria-label="Choose profile photo"]', "name": "portrait.png", "type": "image/png"}, {"wait": 800}]),
    sc("photo-format", "Kabul edilmeyen biçim (GIF): hata satırı", O, [{"file": 'input[aria-label="Choose profile photo"]', "name": "portrait.gif", "type": "image/gif"}]),
    sc("photo-size", "5 MB'tan büyük fotoğraf: hata satırı", O, [{"file": 'input[aria-label="Choose profile photo"]', "name": "portrait.jpg", "type": "image/jpeg", "size": 7340032}]),
    sc("photo", "Fotoğraflı hesap: Replace + Remove", E, setup="g-account-avatar"),
    sc("photo-remove", "Fotoğrafı silme (iki tık): baş harfler döner, Save açık", E, [click("Remove"), click("Confirm remove")], setup="g-account-avatar"),
], part="Fotoğraf · Photo")
extend("11.0", [
    sc("two-owned", "İki workspace'in owner'ı: Legal name workspace adlarıyla", O, setup="g-account-two-owned"),
    sc("legal-failed", "Legal name okunamadı: We couldn't load your legal name + Try again", O, fail=[{"path": r"/legal-name$", "method": "GET", "status": 500}]),
], part="Yasal ad · Legal name")
extend("11.0", [
    sc("setup-note", "Kurulumu süren workspace: Finish setting up this workspace… notu", O, [{"scroll": ".account-employment-record"}], setup="g-account-draft"),
    sc("onboarding-note", "Onboarding'i bitmemiş workspace: not + Continue setup", E, [{"scroll": ".account-employment-record"}], setup="g-account-joined"),
    sc("no-workspace", "Workspace'siz hesap: acil kişi yok, Back to workspace yok", E, setup="g-account-empty", fail=NO_CONTEXT),
    sc("badges", "Menü sayaçları: Workspaces 1, Documents 2", E, setup="g-account-docs-open"),
], part="Hesap çerçevesi · Account")

extend("11.0", [sc("old-path", "Eski adres /account → Profile", O, path="/account")], part="Eski adres · Old address")

# ---------------------------------------------------------------- 11.1 Security
page("11.1")["via"] = r"^/app/account/security/?$"
replace("11.1", "delete", sc("delete", "Silme penceresi: Delete your account? (engelsiz hesap)", O, [{"wait": 1000}, click("Delete account")], setup="g-account-deletable"))
extend("11.1", [
    sc("email-change", "E-posta değişikliği istendi: Verify kutusu + Verification links sent…", O, [fill("label=New email", "mert@harborvine.test"), click("Change email")]),
    sc("email-pending", "Bekleyen değişiklik: Verify …, Resend, Cancel change", O, setup="g-account-email-pending"),
    sc("email-resent", "Resend: Verification links sent again", O, [click("Resend")], setup="g-account-email-pending"),
    sc("email-cancelled", "Cancel change: Email change cancelled", O, [click("Cancel change")], setup="g-account-email-pending"),
    sc("email-same", "Aynı adres: New email must be different", O, [fill("label=New email", EMAIL), click("Change email")]),
    sc("unverified", "E-posta doğrulanmamış: Not verified", E, setup="g-account-unverified"),
    sc("checking", "Yükleniyor: Checking verification (Change email kapalı)", O, hold=[r"/v1/account/security$"]),
    sc("load-failed", "Yüklenemedi: Your security details didn't load. Email verification and account deletion wait until they do. + Try again", O, fail=[{"path": r"/v1/account/security$", "method": "GET", "status": 500, "error": "Security details could not be loaded"}]),
], part="E-posta · Email address")
extend("11.1", [
    sc("password-changed", "Parola değişti: Password changed; other sessions were signed out", O,
       [fill("label=Current password", PW), fill("label=New password", DEMO_NEW_PW), fill("label=Confirm password", DEMO_NEW_PW), click("Change password")]),
    sc("password-wrong", "Yanlış mevcut parola: That password did not match…", O,
       [fill("label=Current password", "wrong-password"), fill("label=New password", DEMO_NEW_PW), fill("label=Confirm password", DEMO_NEW_PW), click("Change password")],
       fail=WRONG_PW(r"/security/password$")),
    sc("sessions", "Öbür oturumlar kapandı: Other sessions signed out", O,
       [fill("form.account-inline-form input[type=password]", PW), click("Sign out other sessions")]),
    sc("sessions-wrong", "Oturum kapatmada yanlış parola", O,
       [fill("form.account-inline-form input[type=password]", "wrong-password"), click("Sign out other sessions")], fail=WRONG_PW(r"/sign-out-others$")),
], part="Parola ve oturumlar · Password")
extend("11.1", [
    sc("delete-wrong", "Silme penceresinde yanlış parola", O,
       [{"wait": 1000}, click("Delete account"), fill("dialog input[type=password]", "wrong-password"), click("Confirm account deletion")],
       setup="g-account-deletable", fail=WRONG_PW(r"/security/deletion$")),
    sc("deleted", "Silme onaylandı → oturum kapanır, giriş ekranı (PAGES uyarısı)", O,
       [{"wait": 1000}, click("Delete account"), fill("dialog input[type=password]", PW), click("Confirm account deletion")], setup="g-account-deletable"),
    sc("blocked-transfer", "Engel: bekleyen sahiplik devri de özette", O, setup="g-account-transfer-out"),
], part="Hesabı silme · Delete account")
set_part("11.1", "Hesabı silme · Delete account", ["delete"])

extend("11.1", [sc("old-path", "Eski adres /app/account/security → Security", O, path="/app/account/security")], part="Eski adres · Old address")

# ---------------------------------------------------------------- 11.2 Preferences
extend("11.2", [
    sc("dirty", "Değişiklik var: Discard + Save açık", O, [fill("label=Date format", "YYYY-MM-DD")]),
    sc("saved", "Kaydedildi: Preferences saved", O, [fill("label=Date format", "YYYY-MM-DD"), fill("label=Time format", "24h"), click("Save")]),
    sc("save-failed", "Kayıt reddedildi: hata satırı", O, [fill("label=Date format", "YYYY-MM-DD"), click("Save")], setup="g-account-refuse-writes"),
], part="Bölgesel biçim · Regional format")

# ---------------------------------------------------------------- 11.3 Notification preferences
SCHED_IN_APP = 'input[aria-label="Schedule In-app"]'
NP = r"/me/notification-preferences$"
set_part("11.3", "Kategoriler · Notifications", ["expand"])
extend("11.3", [
    sc("dirty", "Değişiklik var: workspace seçici kilitli + uyarı, Discard / Save", O, [{"wait": 1000}, click(SCHED_IN_APP)]),
    sc("saved", "Kaydedildi: Notification preferences saved", O, [{"wait": 1000}, click(SCHED_IN_APP), click("Save")]),
    sc("saltline", "Başka workspace: Saltline Oyster Bar seçili", O, [fill("label=Workspace", "5a17e1ae-0b5c-4c2e-9a71-3f0c8d2b7e41")]),
    sc("mixed", "Karışık ana anahtar: kategoride tek bildirim kapalı", O,
       [{"wait": 1000}, click("Expand individual notifications for Schedule"), click(".notification-preference-details input[type=checkbox]:not(:disabled)")]),
    sc("changed", "Başka yerde değişti: Your notification choices changed elsewhere…", O, [{"wait": 1000}, click(SCHED_IN_APP), click("Save")],
       fail=[{"path": NP, "method": "PATCH", "status": 409, "reason": "notification.preference_changed", "error": "notification preferences changed"}]),
    sc("no-access", "Erişim yok kartı", E, fail=[{"path": NP, "method": "GET", "status": 403, "reason": "authz.denied", "error": "Forbidden"}]),
    sc("load-failed", "Yüklenemedi: We couldn't load your notification preferences + Try again, tablo ve Save yok", E, fail=[{"path": NP, "method": "GET", "status": 500, "error": "Notification preferences could not be loaded"}]),
    sc("loading", "Yükleniyor: gri satırlar (Loading notification preferences)", E, hold=[NP]),
    sc("no-workspace", "Workspace'siz hesap: Workspace notification controls become available…", E, setup="g-account-empty", fail=NO_CONTEXT),
], part="Kategoriler · Notifications")

# ---------------------------------------------------------------- 11.4 Workspaces
HV = "Harbor & Vine"
SALT = "Saltline Oyster Bar"
CLOSE_PANEL = "section.workspace-closure-panel"
def closure_flow(mode="Schedule closure", password=PW, name=None):
    steps = [click(f"Actions for {HV}"), click(mode, within=f'[role=menu]')]
    if name: steps.append(fill(f"{CLOSE_PANEL} input:not([type])", name))
    steps += [click("I understand everyone loses access"), fill(f"{CLOSE_PANEL} input[type=password]", password), click(mode, within=CLOSE_PANEL)]
    return steps
TRANSFER = [click(f"Actions for {HV}"), click("Transfer ownership", within="[role=menu]")]
FIND = "label=Find an admin"
extend("11.4", [
    sc("actions-owner", "İşlemler menüsü (owner satırı): Default, Transfer, Schedule, Close", O, [click(f"Actions for {HV}")]),
    sc("actions-member", "İşlemler menüsü (owner olmadığı satır): yalnız Set as default", O, [click(f"Actions for {SALT}")]),
    sc("set-default", "Varsayılan değişti: Default rozeti Saltline'a geçer", O, [click(f"Actions for {SALT}"), click("Set as default")]),
    sc("default-failed", "Varsayılan değiştirilemedi: hata", O, [click(f"Actions for {SALT}"), click("Set as default")],
       fail=[{"path": r"/active$", "method": "POST", "status": 500, "error": "Default workspace could not be changed"}]),
    sc("open", "Open → workspace'e geçer (PAGES uyarısı)", O, [click(f"Open {SALT}")]),
    sc("open-failed", "Açılamadı: Workspace could not be selected", O, [click(f"Open {SALT}")],
       fail=[{"path": r"/v1/context$", "status": 500, "error": "Workspace could not be selected"}]),
], part="Satır işlemleri · Actions")
extend("11.4", [
    sc("schedule-panel", "Planlı kapanış paneli: kişi sayısı, kutu, parola", O, [click(f"Actions for {HV}"), click("Schedule closure", within="[role=menu]")]),
    sc("scheduled", "Planlandı: Scheduled closure · tarih rozeti", O, closure_flow()),
    sc("cancel-closure", "Planlı kapanışta menü: Cancel closure", O, [click(f"Actions for {HV}")], setup="g-account-closure-scheduled"),
    sc("close-panel", "Hemen kapatma paneli: ad yazma + kırmızı Close immediately", O, [click(f"Actions for {HV}"), click("Close immediately", within="[role=menu]")]),
    sc("close-wrong-password", "Kapatmada yanlış parola: That password did not match…", O, closure_flow("Close immediately", "wrong-password", HV),
       fail=WRONG_PW(r"/closure$")),
    sc("blocked-transfer", "Bekleyen devir kapanışı durdurur: hata + Cancel that transfer", O, closure_flow(), setup="g-account-transfer-unseen"),
], part="Kapanış · Close workspace")
extend("11.4", [
    sc("transfer-none", "Devir paneli, sonuç yok: Nobody here matches…", O, [*TRANSFER, fill(FIND, "zz"), {"wait": 700}]),
    sc("transfer-candidates", "Devir paneli, aday: Daniel Brooks", O, [*TRANSFER, fill(FIND, "Da"), {"wait": 700}]),
    sc("transfer-started", "Devir başladı: Ownership transfer pending rozeti", O,
       [*TRANSFER, fill(FIND, "Da"), {"wait": 700}, click("Daniel Brooks"), click("I understand I cannot undo this"),
        fill("section.workspace-transfer-panel input[type=password]", PW), click("Start transfer")]),
    sc("transfer-pending", "Bekleyen devir: rozet + menüde Cancel transfer", O, [click(f"Actions for {HV}")], setup="g-account-transfer-out"),
    sc("transfer-in", "Gelen devir isteği şeridi: Accept / Reject owner transfer", O, setup="g-account-transfer-in"),
    sc("transfer-accept", "Devri kabul paneli: Take over …, parola", O, [click("Accept owner transfer")], setup="g-account-transfer-in"),
    sc("transfer-reject", "Devri ret paneli: Turn down …", O, [click("Reject owner transfer")], setup="g-account-transfer-in"),
], part="Sahiplik devri · Transfer ownership")
extend("11.4", [
    sc("setup", "Kurulumu süren taslak: Setup in progress + Continue", O, setup="g-account-draft"),
    sc("setup-continue", "Taslakta Continue: kurulum ekranına değil workspace ana sayfasına gider (PAGES uyarısı)", O,
       [click("Continue setup for Harbor & Vine Seaport")], setup="g-account-draft"),
    sc("onboarding", "Onboarding süren üyelik: Onboarding in progress + Continue", E, setup="g-account-joined"),
    sc("decline", "Daveti reddetme (iki tık): davet satırı gider, menü sayacı 1 kalır", E, [click("Decline invitation to Cedar & Smoke BBQ"), click("Confirm decline")]),
    sc("invited-only", "Workspace yok, davet var: Respond to your invitation…", E, setup="g-account-invited-only", fail=NO_CONTEXT),
    sc("empty", "Hiçbir şey yok: No workspaces yet + Create", E, setup="g-account-empty", fail=NO_CONTEXT),
    sc("load-failed", "Liste yüklenemedi: We couldn't load your workspaces + Try again", O, fail=[{"path": r"/v1/account/workspaces$", "method": "GET", "status": 500, "error": "Workspaces could not be loaded"}]),
    sc("loading", "Yükleniyor: gri satırlar (Loading workspaces)", O, hold=[r"/v1/account/workspaces$"]),
], part="Liste · Workspaces")

# ---------------------------------------------------------------- 11.5 Documents
page("11.5")["via"] = r"^/app/account/documents/?$"
POLICY_ROW = [click("Policies & Agreements"), {"wait": 1200}, {"click": "tbody tr:nth-child(1)"}]
DRAWER_FILE = 'aside input[type=file], [role=dialog] input[type=file]'
set_part("11.5", "Belgeler · Documents", ["policies"])
extend("11.5", [
    sc("waiting", "Bekleyenler: menüde Documents 2, sekmede 1 waiting on you (Expired)", E, setup="g-account-docs-open"),
    sc("expired", "Süzgeç Expired: yalnız süresi geçen", E, [{"wait": 1000}, click("Expired")], setup="g-account-docs-open"),
    sc("completed", "Süzgeç Completed", E, [{"wait": 1000}, click("Completed")]),
    sc("drawer", "Belge çekmecesi: Form W-4, sürüm geçmişi + Upload a new version", E, [{"wait": 1200}, {"click": "tbody tr:nth-child(4)"}]),
    sc("new-version", "Yeni sürüm seçildi: taslak dosya + Submit", E, [{"wait": 1200}, {"click": "tbody tr:nth-child(4)"}, {"file": DRAWER_FILE, "name": "w4-2026-new.pdf", "size": 154112}, {"wait": 900}]),
    sc("upload-failed", "Yükleme başarısız: could not be uploaded + Retry / Remove", E,
       [{"wait": 1200}, {"click": "tbody tr:nth-child(4)"}, {"file": DRAWER_FILE, "name": "w4-2026-new.pdf"}, {"wait": 900}], fail=[{"path": r"/upload-url$", "status": 500}]),
    sc("load-failed", "Workspace listesi yüklenemedi: We couldn't load your workspaces + Try again", E, fail=[{"path": r"/v1/account/workspaces$", "method": "GET", "status": 500}]),
    sc("no-workspace", "Workspace yok: You are not in a workspace yet.", E, setup="g-account-empty", fail=NO_CONTEXT),
    sc("loading", "Yükleniyor: gri satırlar (Loading your documents)", E, hold=[r"/v1/account/workspaces$"]),
], part="Belgeler · Documents")
extend("11.5", [
    sc("acknowledge", "Politika onayı çekmecede: kutu + ad → Acknowledge policy açık", E,
       [*POLICY_ROW, click(".onboarding-intent"), fill("label=Type your full name", "Maria Lopez")], setup="g-account-docs-open"),
    sc("acknowledged", "Politika onaylandı: imza satırı, liste Completed", E,
       [*POLICY_ROW, click(".onboarding-intent"), fill("label=Type your full name", "Maria Lopez"), click("Acknowledge policy"), {"wait": 600}], setup="g-account-docs-open"),
    sc("signed", "Onaylı politika çekmecesi: imza bilgisi", E, [click("Policies & Agreements"), {"wait": 1200}, {"click": "tbody tr:nth-child(1)"}]),
    sc("link", "Bildirim bağlantısı: Employee Handbook çekmecesi açık gelir", E,
       path=f"/app/account/documents?workspace=6ea5d512-bc7f-4cf3-aad4-2f0815de00fd&requirement=00100019-0000-4000-8000-000000100019&kind=acknowledgement"),
], part="Politikalar · Policies & Agreements")

# ---------------------------------------------------------------- 11.6 Inbox
INBOX = r"/v1/account/notifications$"
extend("11.6", [
    sc("read", "Read sekmesi", O, [click("Read")]),
    sc("unread", "Okunmamış hesap bildirimleri (3)", O, setup="g-account-unread"),
    sc("selected", "Seçili satır: 1 selected + Mark as read", O, [click('input[aria-label="Select Password changed"]')], setup="g-account-unread"),
    sc("marked", "Okundu işaretlendi: Unread 2", O, [click('input[aria-label="Select Password changed"]'), click("Mark as read")], setup="g-account-unread"),
    sc("dismissed", "Dismiss: satır kalkar", O, [click("Dismiss Password changed")], setup="g-account-unread"),
    sc("load-more", "Çok bildirim: Load more", O, [{"scroll": "text=Load more"}], setup="g-account-many"),
    sc("load-failed", "Yüklenemedi: hata", O, fail=[{"path": INBOX, "method": "GET", "status": 500, "error": "Notifications could not be loaded"}]),
    sc("loading", "Yükleniyor: Loading notifications...", O, hold=[INBOX]),
], part="Bildirim kutusu · Notifications")

# ---------------------------------------------------------------- 12.x Public pages
for no in ["12.0", "12.1", "12.2", "12.3", "12.4"]:
    set_part(no, "Sayfa · Page", ["page"])
extend("12.0", [sc("signed-in", "Oturum açık: üstte Open workspace", O, setup="g-signed-in")], part="Sayfa · Page")
extend("12.3", [sc("signed-in", "Oturum açık: Open workspace support", O, setup="g-signed-in")], part="Sayfa · Page")
