import re,sys
p=sys.argv[1]; s=open(p,encoding='utf-8',errors='surrogateescape').read()
n=len(s)
s=re.sub(r'<!-- nf-kaynak-bandi:start -->.*?<!-- nf-kaynak-bandi:end -->','',s,flags=re.S)
if not s.lstrip().lower().startswith('<!doctype'):
    s='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+s
open(sys.argv[2],'w',encoding='utf-8',errors='surrogateescape').write(s); print(p,n,'->',len(s))
