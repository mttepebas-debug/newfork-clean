import zipfile
src = open("/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html", encoding="utf-8").read()
i = src.index("</style>") + len("</style>")
out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + src[:i] + "\n</head>\n<body>\n" + src[i:].lstrip("\n") + "\n</body>\n</html>\n")
D = "/mnt/project-files/pages/vardiya-degisim-indir/"
open(D + "Vardiya-degisim-mockup.html", "w", encoding="utf-8").write(out)
with zipfile.ZipFile(D + "Vardiya-degisim-mockup-2026-10-13.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write(D + "Vardiya-degisim-mockup.html", "Vardiya-degisim-mockup.html")
print(len(out))
