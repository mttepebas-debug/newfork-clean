import json, sys
T = {"breakfast": ("07:00","12:00"), "lunch": ("11:00","16:00"), "dinner": ("16:00","22:00"), "close": ("18:00","23:30")}
D = [("maria","server","lunch",[0,1,4,5]),("maria","server","dinner",[6]),("jake","server","dinner",[0,2,3,4]),
 ("priya","host","dinner",[1,2,4,5]),("priya","host","lunch",[6]),("ethan","busser","dinner",[0,1,4,5,6]),
 ("sophie","bartender","close",[2,3,4,5],"Closer"),("daniel","barback","close",[4,5]),("daniel","barback","dinner",[1]),
 ("carlos","linecook","lunch",[0,1,2,3,4],"Opener"),("aisha","linecook","dinner",[1,2,3,5,6]),("tom","prepcook","breakfast",[0,2,4,5]),
 ("luis","dishwasher","dinner",[2,3,4,5,6]),("hannah","server","lunch",[2,3]),(None,"server","dinner",[4,5]),(None,"busser","lunch",[5])]
U = [("emma","server","lunch",[0,1,2,3]),("emma","server","dinner",[5]),("noah","server","dinner",[1,2,4,5,6]),
 ("olivia","host","dinner",[3,4,5]),("marcus","linecook","dinner",[0,2,3,4,5]),("grace","bartender","close",[3,4,5,6],"Closer"),
 ("sam","dishwasher","dinner",[2,4,5,6]),("jake","bartender","close",[6]),("ryan","server","lunch",[4,5]),(None,"host","lunch",[6])]
def shifts(pats, loc, tag):
  out=[]
  for p in pats:
    who, job, typ, days = p[:4]; label = p[4] if len(p)>4 else None
    for d in days:
      s,e = T[typ]
      x={"label":f"{tag}-{who or 'open'}-{job}-{d}","person":who,"loc":loc,"job":job,"day":d,"start":s,"end":e}
      if label: x["label_names"]=[label]
      out.append(x)
  return out
print(json.dumps(shifts(D,"D","d"+sys.argv[1]) + shifts(U,"U","u"+sys.argv[1])))
