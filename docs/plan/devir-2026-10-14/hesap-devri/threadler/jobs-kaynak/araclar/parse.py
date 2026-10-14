import re,sys,glob,json
import os
SEL=re.compile(os.environ.get("PAT"))
PROPS=('background','border','box-shadow','color','outline','transition','animation','font-weight','inset')
def rules(text):
    text=re.sub(r'/\*.*?\*/','',text,flags=re.S)
    out=[];stack=[];buf='';i=0
    for ch in text:
        if ch=='{':
            stack.append(buf.strip());buf=''
        elif ch=='}':
            if stack:
                sel=stack.pop()
                if not sel.startswith('@') and buf.strip():
                    out.append((' '.join(s for s in stack if s.startswith('@')),sel,buf.strip()))
            buf=''
        elif ch==';' and stack and not stack[-1].startswith('@'):
            buf+=ch
        else: buf+=ch
    return out
for f in sorted(glob.glob('src/apps/web/src/**/*.css',recursive=True)+glob.glob('src/packages/ui/**/*.css',recursive=True)):
    if '/dev/' in f: continue
    for media,sel,body in rules(open(f).read()):
        if not SEL.search(sel): continue
        decls=[d.strip() for d in body.split(';') if d.strip() and d.strip().split(':')[0].strip().startswith(PROPS)]
        if not decls: continue
        print(f.replace('src/apps/web/src/',''),'|',media,'|',' '.join(sel.split())[:160],'|',' ; '.join(decls)[:260])
