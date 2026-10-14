# Round 3: people illustrations in Mert's reference style (2026-10-14):
# faceless bust, clear hair shape, uniform details, the role's prop in front.
# 48x48 grid, stroke 2, round joins. Every shape carries a fill role class;
# style "cizgi" paints fills with the background (outline only, currentColor),
# style "renkli" paints them with flat colors plus a dark outline.
def head(cx, hair='swoop', hat=None, hatcls='wh'):
    out = []
    if hair == 'bun':
        out.append(f'<circle class="hr" cx="{cx}" cy="5" r="2.8"/>')
    if hair == 'long':
        out.append(f'<path class="hr" d="M{cx-8.6} 28.5C{cx-10.4} 12 {cx-6} 6 {cx} 6S{cx+10.4} 12 {cx+8.6} 28.5Z"/>')
    if hair == 'long':
        pass
    elif hair == 'quiff':
        out.append(f'<path class="hr" d="M{cx-7.6} 17.2C{cx-9} 10.5 {cx-6} 4.5 {cx+.5} 4.5S{cx+9} 10.5 {cx+7.6} 17.2Z"/>')
    else:
        out.append(f'<path class="hr" d="M{cx-7.6} 17.2C{cx-8.6} 10.5 {cx-5} 6 {cx} 6S{cx+8.6} 10.5 {cx+7.6} 17.2Z"/>')
    out.append(f'<path class="sk" d="M{cx-3} 24.5v5.5h6v-5.5"/>')
    out.append(f'<circle class="sk" cx="{cx-6.6}" cy="19.6" r="1.9"/><circle class="sk" cx="{cx+6.6}" cy="19.6" r="1.9"/>')
    out.append(f'<path class="sk" d="M{cx-6.5} 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S{cx-6.5} 24.2 {cx-6.5} 20Z"/>')
    if hair == 'swoop':
        out.append(f'<path class="ln" d="M{cx+1} 8.6c2.6.2 4.6 1.8 5.4 4.2"/>')
    elif hair == 'part':
        out.append(f'<path class="ln" d="M{cx-2.6} 7c-.9 1.6-1.1 3.2-.8 4.8"/>')
    elif hair == 'quiff':
        out.append(f'<path class="ln" d="M{cx-3} 7.2c2-1.4 5-1.6 7.6-.2"/>')
    elif hair == 'long':
        out.append(f'<path class="ln" d="M{cx-6.3} 14.6c3.4.3 6.4-1.3 8.6-4.2"/><circle class="gd" cx="{cx-6.6}" cy="22.6" r=".9"/>')
    if hat == 'cap':
        out.append(f'<path class="{hatcls}" d="M{cx-7.8} 14.6C{cx-8} 8.6 {cx-4.4} 5.4 {cx} 5.4S{cx+8} 8.6 {cx+7.8} 14.6Z"/><path class="{hatcls}" d="M{cx-8.6} 14.4h17.2c0 1.7-1.1 2.8-2.6 2.8H{cx-6}c-1.5 0-2.6-1.1-2.6-2.8Z"/>')
    elif hat in ('skullcap', 'bandana'):
        out.append(f'<path class="{hatcls}" d="M{cx-7.4} 14.4C{cx-7.6} 8.8 {cx-4.2} 5.8 {cx} 5.8S{cx+7.6} 8.8 {cx+7.4} 14.4c-4.8 1-10 1-14.8 0Z"/>')
        if hat == 'bandana':
            out.append(f'<path class="{hatcls}" d="M{cx+6.6} 10.6l3.8-1.6-.5 3.4Z"/>')
    elif hat == 'beanie':
        out.append(f'<path class="{hatcls}" d="M{cx-7.8} 13C{cx-8} 7.8 {cx-4.4} 4.6 {cx} 4.6S{cx+8} 7.8 {cx+7.8} 13Z"/><rect class="{hatcls}" x="{cx-8.4}" y="12.4" width="16.8" height="3.6" rx="1.4"/>')
    elif hat == 'toque':
        out.append(f'<path class="{hatcls}" d="M{cx-6.4} 11.6c-2.8-.3-3.4-4.2-.8-5.2.3-3.2 4-4.1 5.7-2.3 1.6-2 5.2-1.8 6.2.5 2.6-.8 5 1.7 3 4.1 1.6 1.7.2 3.4-1.6 3Z"/><rect class="{hatcls}" x="{cx-6.6}" y="10.6" width="13.2" height="4" rx="1"/>')
    return ''.join(out)

def torso(cx, cls='sh'):
    return f'<path class="{cls}" d="M{cx-15} 46v-7c0-4.5 3-7.5 7.5-8.7L{cx-3} 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/>'

def bowtie(cx, y):
    return (f'<path class="ac" d="M{cx} {y}l-3.6-2.1v4.2ZM{cx} {y}l3.6-2.1v4.2Z"/>'
            f'<circle class="ac" cx="{cx}" cy="{y}" r="1.1"/>')

def collar(cx):
    return f'<path class="sh" d="M{cx-3} 29l3 3.6 3-3.6"/>'

C = []
# 1 server carrying a tray: soup with steam and a wine bottle
cx = 18
C.append(("server-tray-ill", "Server carrying a tray", "Server, food runner",
  torso(cx) +
  f'<path class="vs" d="M{cx-15} 46v-7c0-4.5 3-7.5 7.5-8.7L{cx-4} 29.4c.6 5.4-.4 11-3 16.6Z"/>' +
  collar(cx) + bowtie(cx, 31.6) + head(cx, 'swoop') +
  '<path class="gl" d="M37.5 32.5v-9.2a2.6 2.6 0 0 1 1.3-2.3v-5h2.8v5a2.6 2.6 0 0 1 1.3 2.3v9.2Z"/>'
  '<path class="mt" d="M38.8 16v-1.6h2.8V16Z"/>'
  '<path class="fd" d="M24.5 27h12a6 5.5 0 0 1-12 0Z"/>'
  '<path class="ln" d="M30.5 24.2c-1-.9-1-1.9 0-2.8s1-1.9 0-2.8"/>'
  '<path class="mt" d="M22 32.5h22.5l-1.6 3h-19.3Z"/>'
  '<path class="sk" d="M31 35.5v1.4a2.2 2.2 0 0 0 4.4 0v-1.4Z"/>'))

# 2 server with curled mustache: covered plate and wine glass
cx = 19
C.append(("server-mustache-ill", "Server with curled mustache", "Server, waiter",
  torso(cx) +
  f'<path class="vs" d="M{cx-15} 46v-7c0-4.5 3-7.5 7.5-8.7L{cx-4} 29.4 {cx} 39l4-9.6 4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/>' +
  collar(cx) + bowtie(cx, 31.6) + head(cx, 'part') +
  f'<path class="hr" d="M{cx} 21.2c-1.2-1-2.8-1-3.8.2-.7.8-1.6.6-1.9-.2 0 1.8 1.9 2.6 3.6 1.7l2.1-1 2.1 1c1.7.9 3.6.1 3.6-1.7-.3.8-1.2 1-1.9.2-1-1.2-2.6-1.2-3.8-.2Z"/>'
  '<path class="mt" d="M24 42a7.5 6.5 0 0 1 15 0Z"/><path class="mt" d="M22 42h19v2h-19Z"/><circle class="mt" cx="31.5" cy="34.4" r="1.2"/>'
  '<path class="ln" d="M27 39.2a4.6 4.6 0 0 1 2.6-2.4"/>'
  '<path class="gl" d="M40.5 29h5.5l-.4 3.4a2.4 2.4 0 0 1-4.7 0Z"/><path class="ln" d="M43.25 34.8V42M41 42.5h4.5"/>'))

# 3 server taking an order: notepad and pencil
cx = 19
C.append(("server-order-ill", "Server taking an order", "Server",
  torso(cx) +
  f'<path class="vs" d="M{cx-15} 46v-7c0-4.5 3-7.5 7.5-8.7L{cx-4} 29.4c.6 5.4-.4 11-3 16.6Z"/>' +
  collar(cx) + bowtie(cx, 31.6) + head(cx, 'quiff') +
  '<rect class="pd" x="24.5" y="28.5" width="11" height="14" rx="1.4"/>'
  '<path class="ln" d="M27.5 27v3M30 27v3M32.5 27v3M27.5 34h5.5M27.5 37.5h4"/>'
  '<path class="ac" d="m43.2 24.8-1.8-1.8-7.6 7.6-.7 2.5 2.5-.7Z"/>'
  '<path class="sk" d="M23 43.5c-1.6 0-2.6-1.2-2.6-2.6V39h4.1v4.5Z"/>'))

# 4 bartender shaking a cocktail behind the bar
cx = 18
C.append(("bartender-shaking-ill", "Bartender shaking a cocktail", "Bartender",
  torso(cx) +
  f'<path class="ln" d="M{cx-6} 31v10.5M{cx+6} 31v10.5"/>' +
  collar(cx) + bowtie(cx, 31.6) + head(cx, 'quiff') +
  '<path class="mt" d="M30.5 24h8.5l-1.1 11.5h-6.3Z"/><path class="mt" d="M32 24v-2.2a2.75 2.75 0 0 1 5.5 0V24Z"/>'
  '<path class="ln" d="M32.6 27l.4 6"/>'
  '<path class="sk" d="M30.8 35.5h8.2v1.3a2.6 2.6 0 0 1-2.6 2.6h-3a2.6 2.6 0 0 1-2.6-2.6Z"/>'
  '<path class="ln" d="M27.6 21c-1.1 1.6-1.1 3.4 0 5M42 21c1.1 1.6 1.1 3.4 0 5M29.5 17.5l-1.2-1.4M40 17.5l1.2-1.4"/>'
  '<rect class="wd" x="2.5" y="41.5" width="43" height="4" rx="2"/>'))

# 5 general manager in a suit and tie
cx = 24
C.append(("gm-suit-ill", "General manager in a suit", "General manager (GM)",
  torso(cx, 'nv') +
  f'<path class="sh" d="M{cx-4} 29.2h8L{cx} 41Z"/>'
  f'<path class="ac" d="M{cx-1.4} 31.4h2.8l-.6 2h-1.6ZM{cx-.8} 33.4h1.6l1 6.3-1.8 2.3-1.8-2.3Z"/>'
  f'<path class="nv" d="M{cx-4} 29.2 {cx-6.6} 32.4l2.4 1.4-1.5 1.4L{cx-1.2} 43Z"/>'
  f'<path class="nv" d="M{cx+4} 29.2l2.6 3.2-2.4 1.4 1.5 1.4L{cx+1.2} 43Z"/>'
  f'<path class="sh" d="M{cx+8.5} 36.4h4.2l-.7 1.6-.7-.9-.7.9-.7-.9-.7.9Z"/>' +
  head(cx, 'part')))

# 6 chef behind a steaming pot
cx = 18
C.append(("chef-pot-ill", "Chef with a steaming pot", "Chef, cook",
  torso(cx, 'wh') +
  f'<path class="ac" d="M{cx-3.4} 29.6h6.8L{cx} 34.4Z"/>'
  f'<circle class="ln2" cx="{cx-4.5}" cy="37.5" r=".4"/><circle class="ln2" cx="{cx-4.5}" cy="41.5" r=".4"/>' +
  head(cx, 'none') +
  f'<path class="wh" d="M{cx-7.6} 12.4c-3.2-.3-4-4.8-1-6.1.3-3.8 4.6-4.9 6.6-2.8 1.8-2.4 6-2.2 7.2.6 3-1 5.8 1.9 3.5 4.8 1.8 2 .2 4-1.9 3.5Z"/>'
  f'<rect class="wh" x="{cx-7.6}" y="11.2" width="15.2" height="4.4" rx="1"/>'
  f'<path class="ln3" d="M{cx-3} 11l-.4-3.6M{cx+.6} 11V7.2M{cx+4} 11l.4-3.4"/>'
  '<path class="pt" d="M25.5 33h17v8a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3Z"/>'
  '<path class="pt" d="M24.5 31h19v2h-19Z"/><path class="pt" d="M32.4 31v-1.6a1.6 1.6 0 0 1 3.2 0V31Z"/>'
  '<path class="ln" d="M25.5 35.5h-2.2M42.5 35.5h2.2"/>'
  '<path class="ln" d="M30 27c-1-.9-1-1.9 0-2.8s1-1.9 0-2.8M37.5 27c-1-.9-1-1.9 0-2.8s1-1.9 0-2.8"/>'))

# per character colors for the "renkli" style
COLORS = {
 "server-tray-ill":       dict(hr="#6b4430", job="#4478A8"),
 "server-mustache-ill":   dict(hr="#2c2420", job="#4478A8"),
 "server-order-ill":      dict(hr="#b0703c", job="#3C7A68"),
 "bartender-shaking-ill": dict(hr="#3a2b22", job="#B7791F"),
 "gm-suit-ill":           dict(hr="#5d6168", job="#111827"),
 "chef-pot-ill":          dict(hr="#2c2420", job="#B84234"),
}

# Round 4 onward (Mert chose the "renkli" style on 2026-10-14 08:04Z)
C += [
 ('busser-tub-ill', 'Busser carrying a bus tub', 'Busser',
  '<path class="vs" d="M9 46v-7c0-4.5 3-7.5 7.5-8.7L21 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="vs" d="M21 29l3 3.6 3-3.6"/><path class="ln" d="M24 32.6v3"/><path class="hr" d="M16.4 17.2C15.4 10.5 19 6 24 6S32.6 10.5 31.6 17.2Z"/><path class="sk" d="M21 24.5v5.5h6v-5.5"/><circle class="sk" cx="17.4" cy="19.6" r="1.9"/><circle class="sk" cx="30.6" cy="19.6" r="1.9"/><path class="sk" d="M17.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S17.5 24.2 17.5 20Z"/><path class="ln" d="M25 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="pd" d="M15.5 35a4.5 4.5 0 0 1 9 0Z"/><path class="bb" d="M26.5 35v-5.5H31V35Z"/><path class="ln" d="M33.5 35v-5"/><path class="pt" d="M11 35h26l-2 9.5H13Z"/><path class="ln" d="M18 39.6h12"/><circle class="sk" cx="11.5" cy="38" r="2.2"/><circle class="sk" cx="36.5" cy="38" r="2.2"/>'),
 ('host-stand-ill', 'Host at the host stand', 'Host',
  '<path class="bz" d="M9 46v-7c0-4.5 3-7.5 7.5-8.7L21 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="sh" d="M20 29.2h8L24 37Z"/><path class="bz" d="M20 29.2 17.6 32.2l2.2 1.3-1.3 1.3L23 41Z"/><path class="bz" d="M28 29.2l2.4 3-2.2 1.3 1.3 1.3L25 41Z"/><rect class="gd" x="29.6" y="32.4" width="4.6" height="2" rx=".6"/><path class="hr" d="M16.4 17.2C15.4 10.5 19 6 24 6S32.6 10.5 31.6 17.2Z"/><path class="sk" d="M21 24.5v5.5h6v-5.5"/><circle class="sk" cx="17.4" cy="19.6" r="1.9"/><circle class="sk" cx="30.6" cy="19.6" r="1.9"/><path class="sk" d="M17.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S17.5 24.2 17.5 20Z"/><path class="ln" d="M21.4 7c-.9 1.6-1.1 3.2-.8 4.8"/><path class="wd" d="M8.5 36h31l-2 3.6H10.5Z"/><path class="wd" d="M12.5 39.6h23V46h-23Z"/><path class="pd" d="M15.5 36c2.8-1.9 5.7-2.1 8.5-.7 2.8-1.4 5.7-1.2 8.5.7Z"/><path class="ln" d="M18 42.8h12"/>'),
 ('hostess-menus-ill', 'Hostess holding menus', 'Hostess',
  '<path class="vs" d="M4 46v-7c0-4.5 3-7.5 7.5-8.7L16 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="sk" d="M16 29.2l3 3.8 3-3.8Z"/><path class="hr" d="M10.4 28.5C8.6 12 13 6 19 6S29.4 12 27.6 28.5Z"/><path class="sk" d="M16 24.5v5.5h6v-5.5"/><circle class="sk" cx="12.4" cy="19.6" r="1.9"/><circle class="sk" cx="25.6" cy="19.6" r="1.9"/><path class="sk" d="M12.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S12.5 24.2 12.5 20Z"/><path class="ln" d="M12.7 14.6c3.4.3 6.4-1.3 8.6-4.2"/><circle class="gd" cx="12.4" cy="22.6" r=".9"/><rect class="mn" x="27.5" y="24.5" width="11" height="16" rx="1.2"/><rect class="mn" x="25" y="27" width="11" height="16" rx="1.2"/><path class="lg" d="M28 31.5h5M29 35h3"/><circle class="sk" cx="25" cy="39" r="2.2"/>'),
 ('barback-crate-ill', 'Barback carrying a crate', 'Barback',
  '<path class="ts" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="ln" d="M14 29.4a3 2.5 0 0 0 6 0"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="bn" d="M9.2 13C9 7.8 12.6 4.6 17 4.6S25 7.8 24.8 13Z"/><rect class="bn" x="8.6" y="12.4" width="16.8" height="3.6" rx="1.4"/><path class="gl" d="M24.5 35V31a2 2 0 0 1 1-1.7V26h2v3.3a2 2 0 0 1 1 1.7V35Z"/><path class="gl" d="M30 35V31a2 2 0 0 1 1-1.7V26h2v3.3a2 2 0 0 1 1 1.7V35Z"/><path class="gl" d="M35.5 35V31a2 2 0 0 1 1-1.7V26h2v3.3a2 2 0 0 1 1 1.7V35Z"/><path class="wd" d="M22 35h20v9.5H22Z"/><path class="ln" d="M29 39.8h6"/><circle class="sk" cx="22.4" cy="38.4" r="2.2"/>'),
 ('expo-ticket-ill', 'Expo calling an order', 'Expo',
  '<path class="wh" d="M4 46v-7c0-4.5 3-7.5 7.5-8.7L16 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="wh" d="M15.4 29.2h7.2v2c-2.3 1.1-4.9 1.1-7.2 0Z"/><circle class="ln2" cx="15" cy="35.5" r=".4"/><circle class="ln2" cx="23" cy="35.5" r=".4"/><path class="hr" d="M11.4 17.2C10.4 10.5 14 6 19 6S27.6 10.5 26.6 17.2Z"/><path class="sk" d="M16 24.5v5.5h6v-5.5"/><circle class="sk" cx="12.4" cy="19.6" r="1.9"/><circle class="sk" cx="25.6" cy="19.6" r="1.9"/><path class="sk" d="M12.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S12.5 24.2 12.5 20Z"/><path class="ln" d="M20 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="hd" d="M11.2 14.6C11 8.6 14.6 5.4 19 5.4S27 8.6 26.8 14.6Z"/><path class="hd" d="M10.4 14.4h17.2c0 1.7-1.1 2.8-2.6 2.8H13c-1.5 0-2.6-1.1-2.6-2.8Z"/><path class="ao" d="M28.5 33 34 27"/><path class="aw" d="M28.5 33 34 27"/><path class="pd" d="M30.5 12.5h8v11l-1.33-1-1.33 1-1.34-1-1.33 1-1.33-1-1.34 1Z"/><path class="ln" d="M32.6 16h3.8M32.6 19h2.8"/><circle class="sk" cx="34.5" cy="25.6" r="2.2"/><rect class="mt" x="2.5" y="41" width="43" height="4.5" rx="1.6"/><path class="gd" d="M34 41a4.5 4 0 0 1 9 0Z"/><path class="gd" d="M37.7 37v-1.4h1.6V37Z"/>'),
 ('driver-box-ill', 'Delivery driver with a box', 'Delivery driver',
  '<path class="jk" d="M9 46v-7c0-4.5 3-7.5 7.5-8.7L21 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="jk" d="M21 29l3 3.6 3-3.6"/><path class="hr" d="M16.4 17.2C15.4 10.5 19 6 24 6S32.6 10.5 31.6 17.2Z"/><path class="sk" d="M21 24.5v5.5h6v-5.5"/><circle class="sk" cx="17.4" cy="19.6" r="1.9"/><circle class="sk" cx="30.6" cy="19.6" r="1.9"/><path class="sk" d="M17.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S17.5 24.2 17.5 20Z"/><path class="ln" d="M25 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="ac" d="M16.2 14.6C16 8.6 19.6 5.4 24 5.4S32 8.6 31.8 14.6Z"/><path class="ac" d="M15.4 14.4h17.2c0 1.7-1.1 2.8-2.6 2.8H18c-1.5 0-2.6-1.1-2.6-2.8Z"/><rect class="bx" x="13.5" y="32.5" width="21" height="12.5" rx="1"/><path class="ln" d="M24 32.5V37"/><rect class="pd" x="27" y="38.5" width="5" height="3.6" rx=".5"/><circle class="sk" cx="14" cy="36" r="2.2"/><circle class="sk" cx="34" cy="36" r="2.2"/>'),
 ('sous-chef-ill', 'Sous chef, arms crossed', 'Sous chef',
  '<path class="vs" d="M9 46v-7c0-4.5 3-7.5 7.5-8.7L21 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="vs" d="M20.4 29.2h7.2v2c-2.3 1.1-4.9 1.1-7.2 0Z"/><circle class="wh" cx="19.6" cy="33.6" r=".9"/><circle class="wh" cx="28.4" cy="33.6" r=".9"/><path class="hr" d="M16.4 17.2C15.4 10.5 19 6 24 6S32.6 10.5 31.6 17.2Z"/><path class="sk" d="M21 24.5v5.5h6v-5.5"/><circle class="sk" cx="17.4" cy="19.6" r="1.9"/><circle class="sk" cx="30.6" cy="19.6" r="1.9"/><path class="sk" d="M17.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S17.5 24.2 17.5 20Z"/><path class="ln" d="M25 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="hd" d="M16.6 14.4C16.4 8.8 19.8 5.8 24 5.8S31.6 8.8 31.4 14.4c-4.8 1-10 1-14.8 0Z"/><path class="ao" d="M10 41.5 30 37"/><path class="aw" d="M10 41.5 30 37"/><circle class="sk" cx="31" cy="36.8" r="2.2"/><path class="ao" d="M38 41.5 18 37"/><path class="aw" d="M38 41.5 18 37"/><circle class="sk" cx="17" cy="36.8" r="2.2"/>'),
 ('line-cook-flame-ill', 'Line cook with a flaming pan', 'Line cook',
  '<path class="wh" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="wh" d="M13.4 29.2h7.2v2c-2.3 1.1-4.9 1.1-7.2 0Z"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="ac" d="M9.6 14.4C9.4 8.8 12.8 5.8 17 5.8S24.6 8.8 24.4 14.4c-4.8 1-10 1-14.8 0Z"/><path class="ac" d="M23.6 10.6l3.8-1.6-.5 3.4Z"/><path class="fi" d="M30.6 31.5c-2-2.5-.5-5.5 1.6-7-.2 2 .8 2.8 1.8 1.4.4-2.4 2-4.2 3.8-5-.6 2.6.6 4 1.6 5.2 1.2 1.4 1.4 3.6.2 5.4Z"/><path class="fy" d="M33.4 31.5c-.8-1.2-.2-2.6.8-3.4.2 1 .8 1.4 1.4.6.6 1.2 1.4 1.8.8 2.8Z"/><path class="pn" d="M28.5 31.5h14v.8a4.6 4.6 0 0 1-4.6 4.6h-4.8a4.6 4.6 0 0 1-4.6-4.6Z"/><path class="hd" d="M28.5 32.2h-5.5a1 1 0 0 0 0 2h5.5Z"/><circle class="sk" cx="24" cy="33.2" r="2.2"/>'),
 ('prep-cook-ill', 'Prep cook at the cutting board', 'Prep cook',
  '<path class="ts2" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="ap" d="M10.5 46V34.5h13V46Z"/><path class="ln" d="M11.4 34.5l1-4.2M22.6 34.5l-1-4.2"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="wh" d="M9.6 14.4C9.4 8.8 12.8 5.8 17 5.8S24.6 8.8 24.4 14.4c-4.8 1-10 1-14.8 0Z"/><rect class="wd" x="21" y="37" width="24" height="6.5" rx="2"/><path class="cr" d="M24.5 36.8c3-1.6 7.5-2.6 10.5-2.6a1.6 1.6 0 0 1 0 3.2c-3 0-7.5-.2-10.5-.6Z"/><path class="lf" d="M36.4 35.2l3-2-.4 2 2 .2-2.4 1.4Z"/><path class="mt" d="M26 41.2c3-1.6 7-2 10-1.5v2.4H26Z"/><path class="hd" d="M36 39.6h5.4V42H36Z"/>'),
 ('dishwasher-ill', 'Dishwasher scrubbing a plate', 'Dishwasher',
  '<path class="ts" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="ap" d="M10.5 46V34.5h13V46Z"/><path class="ln" d="M11.4 34.5l1-4.2M22.6 34.5l-1-4.2"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><circle class="pd" cx="34" cy="32" r="7.5"/><circle class="ln" cx="34" cy="32" r="4.5"/><rect class="sp" x="33" y="28.5" width="6.5" height="4" rx="1" transform="rotate(-20 36 30.5)"/><circle class="bb" cx="41.6" cy="22.6" r="2"/><circle class="bb" cx="37.2" cy="21" r="1.3"/><circle class="bb" cx="43.8" cy="27.6" r="1.4"/><circle class="sp" cx="28.4" cy="37.6" r="2.2"/>'),
 ('runner-plates-ill', 'Runner with two plates', 'Food runner',
  '<path class="vs" d="M9 46v-7c0-4.5 3-7.5 7.5-8.7L21 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="sk" d="M21 29.2l3 3.6 3-3.6Z"/><circle class="hr" cx="24" cy="5" r="2.8"/><path class="hr" d="M16.4 17.2C15.4 10.5 19 6 24 6S32.6 10.5 31.6 17.2Z"/><path class="sk" d="M21 24.5v5.5h6v-5.5"/><circle class="sk" cx="17.4" cy="19.6" r="1.9"/><circle class="sk" cx="30.6" cy="19.6" r="1.9"/><path class="sk" d="M17.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S17.5 24.2 17.5 20Z"/><path class="ao" d="M12.5 33.5 8 28.4"/><path class="aw" d="M12.5 33.5 8 28.4"/><path class="ao" d="M35.5 33.5 40 28.4"/><path class="aw" d="M35.5 33.5 40 28.4"/><path class="pd" d="M2.5 25.5h11a5.5 1.8 0 0 1-11 0Z"/><path class="fd" d="M4.6 25.5a3.4 3 0 0 1 6.8 0Z"/><path class="pd" d="M34.5 25.5h11a5.5 1.8 0 0 1-11 0Z"/><path class="lf" d="M36.6 25.5a3.4 3 0 0 1 6.8 0Z"/><circle class="sk" cx="8" cy="28.2" r="2.2"/><circle class="sk" cx="40" cy="28.2" r="2.2"/>'),
 ('cashier-pos-ill', 'Cashier at the register', 'Cashier',
  '<path class="ts" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="ts" d="M14 29l3 3.6 3-3.6"/><path class="hr" d="M8.4 28.5C6.6 12 11 6 17 6S27.4 12 25.6 28.5Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M10.7 14.6c3.4.3 6.4-1.3 8.6-4.2"/><circle class="gd" cx="10.4" cy="22.6" r=".9"/><rect class="mt" x="32.2" y="33" width="3.6" height="5"/><rect class="hd" x="26.5" y="22.5" width="15" height="11" rx="1.6"/><rect class="bb" x="28.5" y="24.5" width="11" height="7" rx=".6"/><rect class="wd" x="2.5" y="38.5" width="43" height="4.5" rx="1.6"/><rect class="hd" x="20" y="34.5" width="5" height="4" rx=".8"/>'),
 ('barista-ill', 'Barista at the espresso machine', 'Barista',
  '<path class="sh" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="bx" d="M10.5 46V34.5h13V46Z"/><path class="ln" d="M11.4 34.5l1-4.2M22.6 34.5l-1-4.2"/><path class="hr" d="M9.4 17.2C8 10.5 11 4.5 17.5 4.5S26 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M14 7.2c2-1.4 5-1.6 7.6-.2"/><rect class="mt" x="26" y="20" width="18" height="14" rx="1.6"/><path class="hd" d="M26 23.4V21.6A1.6 1.6 0 0 1 27.6 20h14.8a1.6 1.6 0 0 1 1.6 1.6v1.8Z"/><path class="hd" d="M30.5 28h7.5v1.8h-7.5Z"/><path class="ln" d="M38 28.9h4"/><path class="pd" d="M31.4 33h6v3.4a2.2 2.2 0 0 1-2.2 2.2h-1.6a2.2 2.2 0 0 1-2.2-2.2Z"/><rect class="wd" x="2.5" y="39" width="43" height="4.5" rx="1.6"/>'),
 ('sommelier-pour-ill', 'Sommelier pouring wine', 'Sommelier',
  '<path class="sh" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="vs" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L13 29.4 17 39l4-9.6 4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="sh" d="M14 29l3 3.6 3-3.6"/><path class="ac" d="M15.8 31.6h2.4l-.5 1.6h-1.4ZM16.3 33.2h1.4l.8 5-1.5 1.8-1.5-1.8Z"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M14.4 7c-.9 1.6-1.1 3.2-.8 4.8"/><g transform="rotate(-55 32 21)"><path class="gl" d="M30 30V22a2 2 0 0 1 1-1.7V15h2v5.3a2 2 0 0 1 1 1.7v8Z"/></g><circle class="sk" cx="29" cy="26" r="2.2"/><path class="lw" d="M38.4 23.8c.4 2 .5 5.2.3 7.2"/><path class="bb" d="M35.5 31h7l-.5 3.8a3 3 0 0 1-6 0Z"/><path class="mn" d="M35.9 33.6h6.2l-.1 1.2a3 3 0 0 1-6 0Z"/><path class="ln" d="M39 37.8v4.6M36.4 42.6h5.2"/>'),
 ('pastry-chef-ill', 'Pastry chef with a cake', 'Pastry chef',
  '<path class="wh" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="wh" d="M13.4 29.2h7.2v2c-2.3 1.1-4.9 1.1-7.2 0Z"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="wh" d="M10.6 11.6c-2.8-.3-3.4-4.2-.8-5.2.3-3.2 4-4.1 5.7-2.3 1.6-2 5.2-1.8 6.2.5 2.6-.8 5 1.7 3 4.1 1.6 1.7.2 3.4-1.6 3Z"/><rect class="wh" x="10.4" y="10.6" width="13.2" height="4" rx="1"/><rect class="mt" x="25.5" y="37" width="18" height="1.8" rx=".9"/><rect class="mt" x="33.5" y="38.8" width="2" height="3.4"/><rect class="mt" x="30.5" y="42" width="8" height="1.8" rx=".9"/><rect class="pk" x="27.5" y="29" width="14" height="8" rx="1"/><path class="wh" d="M27.5 31v-2h14v2c-1.2 1.2-2.3 1.2-3.5 0-1.2 1.2-2.3 1.2-3.5 0-1.2 1.2-2.3 1.2-3.5 0-1.2 1.2-2.3 1.2-3.5 0Z"/><circle class="ac" cx="34.5" cy="27" r="1.6"/>'),
 ('pizza-toss-ill', 'Pizza cook tossing dough', 'Pizza cook',
  '<path class="wh" d="M5 46v-7c0-4.5 3-7.5 7.5-8.7L17 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="wh" d="M16.4 29.2h7.2v2c-2.3 1.1-4.9 1.1-7.2 0Z"/><path class="hr" d="M12.4 17.2C11.4 10.5 15 6 20 6S28.6 10.5 27.6 17.2Z"/><path class="sk" d="M17 24.5v5.5h6v-5.5"/><circle class="sk" cx="13.4" cy="19.6" r="1.9"/><circle class="sk" cx="26.6" cy="19.6" r="1.9"/><path class="sk" d="M13.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S13.5 24.2 13.5 20Z"/><path class="ln" d="M21 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="ac" d="M12.2 14.6C12 8.6 15.6 5.4 20 5.4S28 8.6 27.8 14.6Z"/><path class="ac" d="M11.4 14.4h17.2c0 1.7-1.1 2.8-2.6 2.8H14c-1.5 0-2.6-1.1-2.6-2.8Z"/><path class="ao" d="M30 33 35.5 17.5"/><path class="aw" d="M30 33 35.5 17.5"/><circle class="sk" cx="36" cy="16.6" r="2.2"/><ellipse class="dg" cx="37" cy="10" rx="8" ry="2.6" transform="rotate(-10 37 10)"/><path class="ln" d="M29 6.5c1.6-1.6 3.6-2.4 5.6-2.6M44.5 15.5c-1 .8-2.2 1.2-3.4 1.4"/><circle class="ln2" cx="27.5" cy="12" r=".4"/><circle class="ln2" cx="45" cy="9" r=".4"/>'),
 ('grill-cook-ill', 'Grill cook flipping a burger', 'Grill cook',
  '<path class="vs" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="vs" d="M14 29l3 3.6 3-3.6"/><path class="ap" d="M10.5 46V34.5h13V46Z"/><path class="ln" d="M11.4 34.5l1-4.2M22.6 34.5l-1-4.2"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><path class="hd" d="M9.2 14.6C9 8.6 12.6 5.4 17 5.4S25 8.6 24.8 14.6Z"/><path class="hd" d="M8.4 14.4h17.2c0 1.7-1.1 2.8-2.6 2.8H11c-1.5 0-2.6-1.1-2.6-2.8Z"/><path class="hd" d="M26.6 34.6l4.2-7.4 1.8 1-4.2 7.4Z"/><rect class="mt" x="29.5" y="21.5" width="9" height="5.5" rx="1" transform="rotate(-20 34 24)"/><rect class="br" x="32" y="13.5" width="9" height="3.6" rx="1.8" transform="rotate(12 36.5 15.3)"/><path class="ln" d="M42.6 19.5c1-.8 1.6-2 1.8-3.2M29.5 15c.4-1.2 1.2-2.2 2.2-2.8"/><circle class="sk" cx="27" cy="34.4" r="2.2"/><rect class="pn" x="2.5" y="41" width="43" height="4.5" rx="1.6"/><path class="fi" d="M33 41c-.8-1.2-.2-2.6.8-3.4.2 1 .8 1.4 1.4.6.6 1.2 1.2 2 .6 2.8ZM39.5 41c-.8-1.2-.2-2.6.8-3.4.2 1 .8 1.4 1.4.6.6 1.2 1.2 2 .6 2.8Z"/>'),
 ('shift-lead-ill', 'Shift lead with a clipboard', 'Shift lead',
  '<path class="bz" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="bz" d="M14 29l3 3.6 3-3.6"/><rect class="gd" x="20.6" y="33" width="4.4" height="2" rx=".6"/><circle class="hr" cx="17" cy="5" r="2.8"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><rect class="wd" x="27" y="22" width="13.5" height="19" rx="1.5"/><rect class="pd" x="28.8" y="24.6" width="9.9" height="14" rx=".6"/><rect class="mt" x="30.8" y="20.8" width="6" height="3.2" rx="1"/><path class="ln" d="M30.6 28.6l1 1 2-2M30.6 33.4l1 1 2-2M35 29h1.8M35 34h1.8"/><circle class="sk" cx="27.4" cy="37.4" r="2.2"/>'),
 ('porter-mop-ill', 'Porter mopping, wet floor sign', 'Porter',
  '<path class="ts2" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="ln" d="M14 29.4a3 2.5 0 0 0 6 0"/><path class="hr" d="M9.4 17.2C8.4 10.5 12 6 17 6S25.6 10.5 24.6 17.2Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M18 8.6c2.6.2 4.6 1.8 5.4 4.2"/><rect class="wd" x="37.6" y="5" width="2.6" height="30" rx="1.3"/><path class="pd" d="M33 34.6h11.8l1.4 6.4H31.6Z"/><path class="ln" d="M34.6 37v4M38.9 37v4M43.2 37v4"/><circle class="sk" cx="38.9" cy="24" r="2.2"/><path class="ys" d="M22 44.6l3.6-12.4h4L33.2 44.6Z"/><path class="ln" d="M27.6 35.6v4M27.6 42v.1"/>'),
 ('bartender-tap-ill', 'Bartender pouring a beer', 'Bartender',
  '<path class="vs" d="M2 46v-7c0-4.5 3-7.5 7.5-8.7L14 29h6l4.5 1.3c4.5 1.2 7.5 4.2 7.5 8.7v7Z"/><path class="vs" d="M14 29l3 3.6 3-3.6"/><path class="hr" d="M8.4 28.5C6.6 12 11 6 17 6S27.4 12 25.6 28.5Z"/><path class="sk" d="M14 24.5v5.5h6v-5.5"/><circle class="sk" cx="10.4" cy="19.6" r="1.9"/><circle class="sk" cx="23.6" cy="19.6" r="1.9"/><path class="sk" d="M10.5 15c3.2 0 5.2-1.4 6.5-3.2 1.3 1.8 3.3 3.2 6.5 3.2v5c0 4.2-2.9 7.3-6.5 7.3S10.5 24.2 10.5 20Z"/><path class="ln" d="M10.7 14.6c3.4.3 6.4-1.3 8.6-4.2"/><circle class="gd" cx="10.4" cy="22.6" r=".9"/><rect class="mt" x="25.5" y="19" width="18" height="4.4" rx="1.2"/><rect class="hd" x="33" y="10.5" width="3.2" height="8.5" rx="1.2"/><path class="mt" d="M33.6 23.4h2v3h-2Z"/><path class="bb" d="M30.8 28.6h7.6l-.9 11h-5.8Z"/><path class="fy" d="M31.1 31.6h7l-.7 7.6h-5.6Z"/><path class="pd" d="M30.8 28.6h7.6l-.2 3h-7.2Z"/><rect class="wd" x="2.5" y="40" width="43" height="4.5" rx="1.6"/>'),
]
COLORS.update({
 'busser-tub-ill': {'hr': '#1f1a17', 'sk': '#c68a62', 'job': '#3C7A68'},
 'host-stand-ill': {'hr': '#8a5a3a', 'sk': '#f3c9a8', 'job': '#6E56A8'},
 'hostess-menus-ill': {'hr': '#6b3e26', 'sk': '#e0ac85', 'job': '#6E56A8'},
 'barback-crate-ill': {'hr': '#1f1a17', 'sk': '#8d5a3c', 'job': '#B7791F'},
 'expo-ticket-ill': {'hr': '#3a2b22', 'sk': '#f1cfb4', 'arm': '#ffffff', 'job': '#176954'},
 'driver-box-ill': {'hr': '#2c2420', 'sk': '#c68a62', 'job': '#B84234'},
 'sous-chef-ill': {'hr': '#b0703c', 'sk': '#f3c9a8', 'arm': '#4b555b', 'job': '#B84234'},
 'line-cook-flame-ill': {'hr': '#1f1a17', 'sk': '#8d5a3c', 'job': '#B84234'},
 'prep-cook-ill': {'hr': '#3a2b22', 'sk': '#e0ac85', 'job': '#B84234'},
 'dishwasher-ill': {'hr': '#2c2420', 'sk': '#c68a62', 'job': '#4478A8'},
 'runner-plates-ill': {'hr': '#2c2420', 'sk': '#e8b896', 'arm': '#4b555b', 'job': '#4478A8'},
 'cashier-pos-ill': {'hr': '#b5793c', 'sk': '#f3c9a8', 'job': '#4478A8'},
 'barista-ill': {'hr': '#3a2b22', 'sk': '#c68a62', 'job': '#B7791F'},
 'sommelier-pour-ill': {'hr': '#2c2420', 'sk': '#f1cfb4', 'job': '#6E56A8'},
 'pastry-chef-ill': {'hr': '#6b3e26', 'sk': '#e8b896', 'job': '#B7791F'},
 'pizza-toss-ill': {'hr': '#1f1a17', 'sk': '#f3c9a8', 'arm': '#ffffff', 'job': '#B84234'},
 'grill-cook-ill': {'hr': '#3a2b22', 'sk': '#8d5a3c', 'job': '#B84234'},
 'shift-lead-ill': {'hr': '#2c2420', 'sk': '#8d5a3c', 'job': '#176954'},
 'porter-mop-ill': {'hr': '#1f1a17', 'sk': '#e0ac85', 'job': '#3C7A68'},
 'bartender-tap-ill': {'hr': '#b5793c', 'sk': '#f1cfb4', 'job': '#B7791F'},
})
ROUND = {slug: (3 if i < 6 else 4) for i, (slug, *_ ) in enumerate(C)}
RK = dict(sk='#f3c9a8', sh='#e8eef3', vs='#4b555b', ac='#c8323c', mt='#d9dfe4', gl='#5d8f6b', fd='#f2b65a', pd='#ffffff', wd='#b9855a', pt='#a9b4bc', nv='#2f4163', wh='#ffffff',
  bz='#3f6f66', mn='#7a2e3a', gd='#e0b04a', ts='#5b7fa6', ts2='#5f8f6e', bn='#4a5d6e', bx='#c99a62', jk='#e8a33d', pn='#3b4248', fi='#f28c28', fy='#ffd25a',
  cr='#ef8a2c', lf='#6aa84f', hd='#2f3437', ap='#9fb8c8', sp='#f4c430', bb='#dff1fb', pk='#f4a6b8', dg='#f3dfb2', br='#7a4a2e', ys='#f4c430')

# Series rounds from 2/5 on (Mert 2026-10-14 08:24Z): drawn with kit.py, one module per round.
# A slug that already exists is redrawn in place (round 5 redrew host, sommelier, pizza cook).
from seri2 import S2, COL2
from seri3 import S3, COL3
from seri4 import S4, COL4
from seri5 import S5, COL5
_idx = {s: i for i, (s, *_) in enumerate(C)}
for _rnd, _lst, _col in ((5, S2, COL2), (6, S3, COL3), (7, S4, COL4), (8, S5, COL5)):
    for _slug, _name, _role, _body in _lst:
        if _slug in _idx: C[_idx[_slug]] = (_slug, _name, _role, _body)
        else: _idx[_slug] = len(C); C.append((_slug, _name, _role, _body)); ROUND[_slug] = _rnd
    COLORS.update(_col)
# round 9 (Mert 09:04Z): the 25 off-task drawings are replaced in place, then 15 new ones
from seri6 import REPL, COL6
from seri7 import S7, COL7
for _old, _new in REPL.items():
    C[_idx[_old]] = _new; ROUND[_new[0]] = 9
COLORS.update(COL6)
for _slug, _name, _role, _body in S7:
    C.append((_slug, _name, _role, _body)); ROUND[_slug] = 9
COLORS.update(COL7)
