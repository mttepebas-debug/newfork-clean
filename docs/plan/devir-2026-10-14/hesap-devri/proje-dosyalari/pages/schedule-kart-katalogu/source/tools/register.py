# Records a published PAGES screen: its link in tools/pages.json and its row in
# the Artifact index data (kaynak-bandi/artifactlar.json, folder "PAGES"), so
# the source band can be added. Usage: python3 tools/register.py <no> <artifact url>
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
no, url = sys.argv[1], sys.argv[2]
aid = url.rstrip("/").split("/")[-1]
pages = json.load(open(os.path.join(here, "pages.json")))
screens = {s["no"]: s for s in json.load(open(os.path.join(here, "..", "screens.json")))["screens"]}
pages["screens"].setdefault(no, {})["url"] = url
json.dump(pages, open(os.path.join(here, "pages.json"), "w"), indent=2, ensure_ascii=False)
band = "/mnt/project-files/pages/kaynak-bandi/artifactlar.json"
d = json.load(open(band, encoding="utf-8"))  # re-read right before changing (shared file)
if not any(k["id"] == "pages" for k in d["klasorler"]):
    d["klasorler"].insert(0, {"id": "pages", "ad": "PAGES · uygulamanın güncel ekranları", "ne": "Her route ayrı sayfa, numaralı (1.0 Sign in … 12.4); gerçek kod, demo veri, masaüstü ve telefon birlikte. Dizin: " + (pages.get("index") or "")})
s = screens[no]
row = {"id": aid, "ad": f"{no} {s['title']} · PAGES", "klasor": "pages", "kaynak": "project", "not": f"PAGES {no}: {s['ne']}"}
d["artifactlar"] = [a for a in d["artifactlar"] if a["id"] != aid] + [row]
json.dump(d, open(band, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("registered", no, aid)
