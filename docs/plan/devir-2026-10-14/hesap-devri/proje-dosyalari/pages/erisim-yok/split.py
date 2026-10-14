import re,sys
src,out_html,js_name=sys.argv[1:4]
h=open(src,encoding='utf-8').read()
m=re.search(r'<script type="module">(.*)</script>\s*</body>',h,re.S)
js=m.group(1).replace('<\\/script','</script')
js=js.replace('�','\\uFFFD')
open(out_html.rsplit('/',1)[0]+'/'+js_name,'w',encoding='utf-8').write(js)
h=h[:m.start()]+'<script type="module" src="'+js_name+'"></script>\n</body>'+h[m.end():].split('</body>',1)[-1] if False else h[:m.start()]+'<script type="module" src="'+js_name+'"></script>\n</body>\n</html>\n'
open(out_html,'w',encoding='utf-8').write(h)
print(out_html, len(h), len(js))
