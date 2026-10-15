import json,sys
SP=sys.argv[1]
f=json.load(open(SP+'/ext/frag.json')); icons=json.load(open(SP+'/ext/icons.json'))
css=f.pop('css')
frag={k:v for k,v in f.items()}
js=open(SP+'/mock-src.js').read()
html=('<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
 '<title>Notification variants · mock</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap">'
 '<style>'+css+'</style><style>'+open(SP+'/mock.css').read()+'</style></head><body><div id="root"></div>'
 '<script>var FRAG='+json.dumps(frag).replace('</','<\\/')+';var ICONS='+json.dumps(icons)+';</script><script>'+js+'</script></body></html>')
open(SP+'/site/mock.html','w').write(html); print(len(html))
