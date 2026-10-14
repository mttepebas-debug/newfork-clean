import sys
d='/tmp/claude-0/sw/'
def r(p): return open(p, encoding='utf-8').read()
def safe(s): return s.replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')
page=r(d+'build/page.html')
for k,f in [('__CSS__','app.css'),('__VCSS__','build/frame.css'),('__DESK__','desk-shell.html'),('__RAIL__','desk-collapsed.html'),('__PHONE__','phone-shell.html'),('__JS__','build/frame.js')]:
    page=page.replace(k, safe(r(d+f)))
open(sys.argv[1],'w',encoding='utf-8').write(page)
print(len(page))
