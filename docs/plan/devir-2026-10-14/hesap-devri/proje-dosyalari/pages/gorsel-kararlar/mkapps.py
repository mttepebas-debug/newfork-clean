import sys
S=sys.argv[1]
inj=open(S+'/inject.js').read()
for f in ['app.html','app-schedule.html']:
    s=open('/mnt/project-files/PAGES/'+f).read()
    end='</body>\n</html>'
    i=s.rfind(end)
    assert i>len(s)-60, (f,i,len(s))
    s=s[:i]+'<script>'+inj+'</script>\n'+s[i:]
    open(S+'/varyant/'+f,'w').write(s)
    print(f,len(s))
