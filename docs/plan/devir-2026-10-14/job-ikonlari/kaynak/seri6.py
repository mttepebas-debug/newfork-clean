"""Round 9 (2026-10-14, Mert 09:04Z): these sit left of the name in Lineup, so only the person
doing the job, or the thing that person uses most and that makes you think of the job at once.
The 25 off-task drawings (scenes, general objects) are replaced in place: REPL maps old slug -> new
drawing, so numbers stay put. S7 (seri7.py) adds 15 more at the end."""
import math
from kit import *
from seri3 import flame

def rp(x0, y0, rot, lx, ly):
    a = math.radians(rot)
    return x0 + lx * math.cos(a) - ly * math.sin(a), y0 + lx * math.sin(a) + ly * math.cos(a)

REPL, COL6 = {}, {}
def put(old, slug, name, role, body, **col):
    col.setdefault('hr', '#000000'); REPL[old] = (slug, name, role, body); COL6[slug] = col

def wine_bottle(c='gl', label='cm', seal='mn'):
    """Lying along +x: base at 0, mouth at 18."""
    return (P(c, 'M0 -2.9h9.8c1.8 0 2.6 1.9 3.4 2.2h4.6v1.4h-4.6c-.8.3-1.6 2.2-3.4 2.2H0a.8.8 0 0 1-.8-.8v-4.2a.8.8 0 0 1 .8-.8Z')
            + R(f'{label}-n', 2.2, -2.9, 5.6, 5.8) + R(f'{seal}-n', 3.2, -.7, 3.6, 1.4, .3) + P('ln', 'M2.2 -2.9v5.8M7.8 -2.9v5.8')
            + R(f'{seal}-n', 16.4, -.9, 1.6, 1.8) + P('ll', 'M.8 -1.8h8.4'))

def server_top(cx, vestc='bk', tie=('bowtie', 'ac'), hair='short', **hk):
    o = torso(cx, 'sh')
    if vestc: o += vest(cx, vestc, depth=12)
    o += shirt_collar(cx)
    if tie[0] == 'bowtie': o += bowtie(cx, 31.6, tie[1])
    elif tie[0] == 'tie': o += necktie(cx, tie[1], length=12)
    return o + head(cx, hair=hair, **hk)

def stream(d, c='#7fb6e0', w=1.8):
    return f'<path fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" d="{d}"/>'

# 124 server pouring water from a pitcher
cx = 14
px, py, pr = 32, 20.4, 32
hx, hy = rp(px, py, pr, -7.4, -.4); sx, sy = rp(px, py, pr, 7.6, -7.8)
put('walk-in-obj', 'server-pitcher-ill', 'Server pouring water', 'Server',
    server_top(cx, None, ('tie', 'bk')) + apron_waist(cx, 'bk', 41)
    + R('wh', 25, 42.6, 24, 7, 1) + P('wh-d', 'M26 44.8h22v1H26Z')
    + P('bb', 'M37 33.2h8l-.8 9.4h-6.4Z') + P('lb-n', 'M37.5 37.4h7l-.5 5h-6Z') + P('ll', 'M38.4 34.4l.4 7')
    + stream(f'M{g(sx)} {g(sy+.6)}c.8 2.6 1.6 6 1.4 {g(36.6-sy)}')
    + arm((25, 32.6), (29.2, 41), (hx - 1.4, hy + 2.6), 'sh')
    + G(P('bb', 'M-4.6 -7.4h9.2l.9 11.2c.1 1.4-1 2.6-2.4 2.6H-3.1c-1.4 0-2.5-1.2-2.4-2.6Z') + P('lb-n', 'M-4.2 -1.6h8.4l.5 5.8c.1 1-.7 1.8-1.7 1.8h-5.9c-1 0-1.8-.8-1.7-1.8Z')
        + R('ic-n', -2.6, -.4, 2.4, 2.4, .4) + R('ic-n', .6, .6, 2.4, 2.4, .4) + P('bb', 'M4.6 -7.4l3-1.6.4 1.8-2.8 1.6Z')
        + P('bb', 'M-4.5 -5.6h-1.4c-2 0-3.2 1.6-3.2 3.6v1.2c0 2 1.2 3.4 3.2 3.4h1.2V.8h-1c-.9 0-1.4-.7-1.4-1.6v-.8c0-.9.5-1.6 1.4-1.6h1.4Z') + P('ll', 'M-3 -5.6v8'), px, py, pr)
    + hand(hx, hy, pr - 90, 'grip'),
    hr='#5a3825', sk='#f1cfb4', job='#4478A8')

# 126 server presenting the check
cx = 15
put('probe-thermometer-obj', 'server-check-ill', 'Server presenting the check', 'Server',
    server_top(cx, 'nv', ('tie', 'ac'), 'slick')
    + arm((26, 32.6), (33.6, 44), (40.6, 34), 'sh')
    + G(R('bk', 0, 0, 12.6, 17, 1.4) + R('pd-n', 1.4, 1.6, 9.8, 13.6, .3) + R('st-n', 2.8, 3.6, 6, 1, .5) + R('st-n', 2.8, 6, 7, 1, .5) + R('st-n', 2.8, 8.4, 5, 1, .5)
        + R('bk-n', 2.8, 11.6, 7, 1.4, .5) + R('gd', 10.6, -1.6, 1.6, 12.4, .8) + R('gd-d', 10.6, 8.6, 1.6, 2.2), 28.4, 21.6, 6)
    + hand(40.4, 31.4, 0, 'thumb'),
    hr='#2c2420', sk='#c68a62', job='#4478A8')

# 127 diner server with the coffee pot
cx = 15
put('kds-screen-obj', 'diner-coffee-ill', 'Diner server with a coffee pot', 'Server, diner',
    torso(cx, 'tl') + shirt_collar(cx, 'wh') + badge(cx + 5, 33.4, 'wh') + apron_waist(cx, 'wh', 42) + head(cx, hair='bun', earring=True)
    + P('ln3', 'M32 9.6c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6M36.4 9.6c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6')
    + arm((26, 32.6), (35.4, 39), (40.8, 25.4), 'tl')
    + P('bb', 'M28.2 22c0-3.4 1.6-5.4 3.2-6.2h4.8c1.6.8 3.2 2.8 3.2 6.2v3.6c0 2.4-2 4.2-4.4 4.2h-2.4c-2.4 0-4.4-1.8-4.4-4.2Z')
    + P('br-n', 'M28.6 22.6h10.4v3c0 2-1.6 3.6-3.6 3.6h-3.2c-2 0-3.6-1.6-3.6-3.6Z') + P('ll', 'M30 18.6c-.4 1-.6 2-.6 3')
    + R('bk', 30.4, 13.2, 6.8, 2.8, .8) + R('og', 30.8, 11.2, 6, 2.2, .8)
    + P('bk', 'M37.2 14.4h2.8c1.4 0 2.4 1 2.4 2.4v4c0 1.4-1 2.4-2.4 2.4h-1.2v-1.8h1c.4 0 .8-.4.8-.8v-3.6c0-.4-.4-.8-.8-.8h-2.6Z')
    + hand(41, 23.4, -90, 'grip'),
    hr='#c0392b', sk='#f3c9a8', job='#4478A8', tl='#3f9e93')

# 129 busser wiping the table
cx = 15
put('speed-rack-obj', 'busser-wipe-ill', 'Busser wiping a table', 'Busser',
    torso(cx, 'bk') + crew(cx, 'bk') + apron_bib(cx, 'ap') + head(cx, hair='buzz')
    + R('wd', 1, 41.6, 47, 8, 1.2) + P('wd-l', 'M2 42.6h45v1H2Z')
    + P('lt', 'M30.4 35c4-2.8 9.8-2.8 13.8 0M33 31.8c2.6-1.6 6.2-1.6 8.8 0')
    + P('wh-n', 'M44 24.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z') + P('lt', 'M44 24.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z')
    + P('yl', 'M29.6 41.6c-.4-2.4 1-4.2 3.4-4.4l11.6-.8c1.8 0 2.8 2.4 2 5.2Z') + P('yl-d', 'M43.2 36.6l1.4-.1c1.6.2 2.4 2.2 1.8 5.1h-2.4Z') + P('lt', 'M41 37l3.8 4.4M38.4 37.4l3.6 4.2')
    + arm((26, 32.6), (28.8, 40.2), (33.8, 39.4), 'bk', 'sk')
    + hand(33.6, 39.2, -4, 'flat'),
    hr='#1f1a17', sk='#c68a62', job='#3C7A68')

# 133 barback with a keg on the shoulder
cx = 13
put('wine-rack-obj', 'barback-keg-ill', 'Barback carrying a keg', 'Barback',
    torso(cx, 'ts') + crew(cx, 'ts') + head(cx, hair='short', hat='beanie', hatc='gy')
    + arm((24, 32.6), (32.6, 36), (33.8, 27.6), 'ts', 'sk')
    + G(R('mt', -11.6, -5.8, 23.2, 11.6, 3.2) + P('mt-d', 'M-7.4 -5.8h1.4v11.6h-1.4ZM6 -5.8h1.4v11.6H6Z') + P('mt-d', 'M-11 3.4h22.4v1.6H-11Z')
        + P('ll', 'M-9.6 -3.6h19') + R('bk', 11.4, -1.8, 2.2, 3.6, .6), 32, 21.2, -6)
    + hand(33.6, 26.4, -90, 'grip'),
    hr='#2c2420', sk='#c68a62', job='#B7791F')

# 135 chef tasting with a spoon
cx, cy = 16, 18
put('kitchen-timer-obj', 'chef-tasting-ill', 'Chef tasting with a spoon', 'Chef, sous chef',
    chef_coat(cx, 'wh', top=cy + 11) + head(cx, cy, hair='none', hat='toque')
    + P('ln3', 'M33 33.6c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6M38 33.6c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6')
    + P('mt', 'M28 38.2h16v6.6c0 1.8-1.4 3.2-3.2 3.2h-9.6c-1.8 0-3.2-1.4-3.2-3.2Z') + R('mt', 27, 36.8, 18, 2.2, 1) + R('bk', 44.6, 37.2, 4, 1.8, .9) + P('mt-d', 'M40.6 39h3.4v5.6c0 1.4-.8 2.4-2 2.8Z')
    + arm((cx + 11, 34.6), (cx + 16.4, 43), (cx + 10.4, 31.4), 'wh')
    + P('mt', f'M{cx+8.6} 29.6 L{cx+3.4} 26.6 l.6-1.1 5.4 3Z') + E('mt', cx + 2, 25.8, 2.2, 1.3, 28)
    + hand(cx + 9.4, 30.2, -120, 'fist'),
    hr='#2c2420', sk='#e0ac85', job='#B84234')

# 139 server opening a bottle of wine
cx = 14
put('rush-hour-obj', 'server-corkscrew-ill', 'Server opening a bottle of wine', 'Server, sommelier',
    server_top(cx, 'bk', ('bowtie', 'mn'), 'short') + P('wh', f'M{cx-12.6} 40.6c1.6-.6 3.4-.4 4.6.4l-.2 8h-4.6Z') + P('bl-n', f'M{cx-12.4} 43h4.2v.8h-4.2Z')
    + arm((25.4, 32.6), (28.6, 44.6), (31.4, 40.4), 'sh')
    + P('gl', 'M27 46V31.6c0-3 2.4-4.4 3.4-6.2v-8.4h4.6v8.4c1 1.8 3.4 3.2 3.4 6.2V46Z') + R('cm', 27, 33.6, 11.4, 8.4) + P('mn-n', 'M32.7 35.6l1.8 1.8-1.8 1.8-1.8-1.8Z') + P('ll', 'M28.6 32v13')
    + R('tn', 31.2, 14.4, 3, 3, .6) + P('ln', 'M32.7 14.4V10') + G(R('bk', 0, -1.3, 13, 2.6, 1.3) + R('mt', -.6, -.8, 3, 1.6, .4), 32.7, 10, -20)
    + G(R('mt', -.4, -.6, 6, 1.2, .6), 30.4, 17, 200)
    + hand(31.2, 38.6, -90, 'grip'),
    hr='#6b4430', sk='#e8b896', job='#4478A8')

# 140 expo at the pass, wiping the plate rim
cx = 15
put('table-for-two-obj', 'expo-pass-ill', 'Expo wiping a plate at the pass', 'Expo',
    torso(cx, 'bk') + shirt_collar(cx, 'bk') + apron_bib(cx, 'ap') + head(cx, hair='slick')
    + L('ln', (37.4, 0), (37.4, 3.6)) + P('mt', 'M30.4 9.6c0-3.6 3.2-6 7-6s7 2.4 7 6Z') + P('yl-l', 'M31.4 10.2h12l3.4 16H28Z')
    + R('mt', 19, 40.6, 29.6, 3, 1.2) + P('mt-d', 'M19.6 43.6h28.4v6H19.6Z')
    + E('pd', 37, 38.8, 9, 2.4) + E('sl-n', 37, 38.6, 6, 1.3) + P('fd', 'M32.4 38.4c.8-2.6 2.8-3.6 4.6-3.6s3.8 1 4.6 3.6Z') + O('lf-n', 35.4, 36.2, .7) + O('rd-n', 38.4, 35.8, .7)
    + arm((26, 32.6), (24.8, 42.6), (27.6, 38.2), 'bk')
    + P('wh', 'M27.2 35.6c1.8-1 4-1 5.4.4l-.4 3.6c-1.6.6-3.4.6-5 0Z') + hand(28.2, 38, -20, 'flat'),
    hr='#3a2b22', sk='#f3c9a8', job='#176954')

# 141 host taking a reservation call
cx = 17
put('birthday-cake-obj', 'host-phone-ill', 'Host taking a reservation call', 'Host, hostess',
    torso(cx, 'sh') + jacket(cx, 'pu', depth=11) + head(cx, hair='long', earring=True)
    + R('wd', 18, 44.4, 30, 5, 1) + P('pd', 'M24.6 44.6l1.4-3.8c3.2-1 6.4-.8 9.2.6 2.8-1.4 6-1.6 9.2-.6l1.4 3.8c-3.4-1-7.2-.8-10.6.8-3.4-1.6-7.2-1.8-10.6-.8Z')
    + P('st-n', 'M27.6 42.2l5.4.4v.7l-5.6-.4ZM37.6 42.6l5.2-.4.1.7-5.2.4Z')
    + arm((28, 32.6), (34, 40), (29, 25.6), 'pu')
    + G(P('bk', 'M-5.6 -1.4h11.2a1.4 1.4 0 0 1 0 2.8H-5.6a1.4 1.4 0 0 1 0-2.8Z') + E('bk', -6.4, .6, 2.4, 2.8) + E('bk', 6.4, .6, 2.4, 2.8), 25, 19.8, 78)
    + hand(27.6, 22.4, -112, 'grip'),
    hr='#6b3e26', sk='#e8b896', job='#6E56A8')

# 142 pastry chef piping a cake
cx = 14
put('clock-in-obj', 'pastry-piping-ill', 'Pastry chef piping a cake', 'Pastry chef',
    chef_coat(cx, 'wh') + head(cx, hair='bun')
    + P('mt', 'M27.2 46.4h18.4l-2.4 2.6H29.6Z') + R('mt', 26, 44.2, 20.8, 2.4, 1.2)
    + R('pk', 28.4, 35, 16, 9.2, 1.2) + P('wh', 'M28.4 35h16v2.6c-1.6 1.6-3.2 1.6-4 0-1.2 1.6-2.8 1.6-4 0-1.2 1.6-2.8 1.6-4 0-1.2 1.6-2.8 1.6-4 0Z')
    + O('wh', 31.4, 33.8, 1.4) + O('wh', 41.4, 33.8, 1.4) + O('ch', 41.4, 32.4, .9)
    + arm((25, 32.6), (28.6, 41), (31.6, 23.6), 'wh', 'sk')
    + G(P('wh', 'M0 -3.8L12.4 -.9V.9L0 3.8Z') + P('wh', 'M0 -3.8c-1.8 0-2.8 1.8-2.8 3.8s1 3.8 2.8 3.8Z') + R('mt', 12.2, -.9, 2.4, 1.8, .4) + P('ln3', 'M3 -2.6l1 5.2'), 34.6, 14.8, 92)
    + P('wh', 'M35 31.6c-1.2.4-1.6 1.6-.6 2.2 1.4.6 2.6-.6 1.8-1.8Z')
    + hand(33.6, 20.8, -78, 'grip'),
    hr='#b0703c', sk='#f1cfb4', job='#B7791F')

# 143 baker with the bread peel
cx = 14
put('coffee-break-obj', 'baker-peel-ill', 'Baker with the bread peel', 'Baker',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'tn') + O('wh-l', cx - 4, 38, .8) + head(cx, hair='short', hat='skull', hatc='wh') + P('lt', f'M{cx-6.2} 12.4h12.4')
    + arm((25, 32.6), (25.6, 42.6), (28.8, 34.4), 'wh', 'sk')
    + P('ao6', 'M25.6 41L41 15.6') + P('t-wd', 'M25.6 41L41 15.6')
    + G(R('wd', -7.2, -6, 14.4, 12, 3) + P('wd-d', 'M-6.4 3.4h12.8v1.2H-6.4Z'), 40.6, 12.4, -28)
    + E('bx', 40.2, 10.4, 5.6, 3.6, -28) + P('dg-n', 'M37.6 9.6l2.2-1.6.5.6-2.2 1.6ZM40 11.6l2.2-1.6.5.6-2.2 1.6Z')
    + hand(29.4, 34.6, -58, 'grip'),
    hr='#6b4430', sk='#e0ac85', job='#B7791F')

# 144 delivery driver: helmet, bag straps, the map on the phone
cx = 15
put('inventory-count-obj', 'driver-map-ill', 'Delivery driver with helmet and map', 'Delivery driver',
    torso(cx, 'jk') + crew(cx, 'jk') + P('bk', f'M{cx-9} 29.6l2.6-.8.8 19.2h-2.8ZM{cx+9} 29.6l-2.6-.8-.8 19.2h2.8Z') + head(cx, hair='none')
    + P('rd', f'M{cx-7.4} 17.4C{cx-8} 8.4 {cx-4.4} 5 {cx} 5s8 3.4 7.4 12.4Z') + P('rd-d', f'M{cx+3.4} 5.8c2.6 1.6 4.4 5 4 11.6h-2.4c.4-5.4-.2-9.2-1.6-11.6Z')
    + P('bk', f'M{cx-7.4} 14.4h14.8v3H{cx-7.4}Z') + P('ll', f'M{cx-4.4} 8.6c1.2-1.4 2.8-2.2 4.6-2.4') + P('lt', f'M{cx-6.6} 17.6c.6 3.6 3 6 6.6 6.2')
    + arm((26, 32.6), (31, 42), (34.6, 36.4), 'jk')
    + R('bk', 29.6, 17.6, 10.4, 18, 2) + R('wh-n', 31, 20, 7.6, 13, .6) + P('st-n', 'M31 25.6h7.6v1H31ZM34 20v13h1V20Z') + P('gn-n', 'M31 29.4l3-3 1 .9-3 3Z')
    + P('rd', 'M36 21.6a1.8 1.8 0 0 1 1.8 1.8c0 1.4-1.8 3.2-1.8 3.2s-1.8-1.8-1.8-3.2a1.8 1.8 0 0 1 1.8-1.8Z')
    + hand(34.8, 35.4, -90, 'grip'),
    hr='#000000', sk='#c68a62', job='#B84234')

# 145 server ringing in an order on the POS
cx = 14
put('delivery-truck-obj', 'server-pos-ill', 'Server ringing in an order', 'Server, cashier',
    server_top(cx, 'bk', ('bowtie', 'ac'), 'pony')
    + G(R('bk', 0, 0, 17, 13.4, 1.6) + R('wh-n', 1.4, 1.4, 14.2, 10.6, .6)
        + ''.join(R(c, 2.4 + 4.6 * (i % 3), 2.4 + 3.4 * (i // 3), 3.8, 2.6, .6) for i, c in enumerate(('gn-n', 'bl-n', 'yl-n', 'og-n', 'gn-n', 'pu-n', 'bl-n', 'rd-n', 'gn-n'))), 29.2, 15.4, 4)
    + P('mt', 'M36 28.6h3.2l1.8 14.4h-6.8Z') + R('mt', 31.4, 42.4, 13.6, 2.6, 1.2)
    + arm((25, 32.6), (27.6, 42), (30.4, 29.6), 'sh')
    + hand(30.8, 28, -64, 'point'),
    hr='#3a2b22', sk='#f3c9a8', job='#4478A8')

# 146 sommelier presenting the bottle on a napkin
cx = 14
put('handwash-obj', 'sommelier-present-ill', 'Sommelier presenting the bottle', 'Sommelier',
    torso(cx, 'sh') + vest(cx, 'bk', depth=15) + shirt_collar(cx) + necktie(cx, 'mn', length=15)
    + P('lg', f'M{cx-3.4} 28.8C{cx-6} 34 {cx-4} 39 {cx-1.4} 40M{cx+3.4} 28.8C{cx+6} 34 {cx+4} 39 {cx+1.4} 40') + E('mt', cx, 40.6, 3, 1.4) + P('mt', f'M{cx-3} 40.6c0 1.8 1.4 2.8 3 2.8s3-1 3-2.8Z')
    + head(cx, hair='slick', stache='plain')
    + arm((25, 32.6), (27.6, 43), (37.4, 36.6), 'sh')
    + P('wh', 'M27.4 38.6c3.4-2.6 7-4 10.4-4.2l1.4 5c-3.2.6-6.2 2-9 4Z') + P('wh-d', 'M30.2 43.4c2.6-1.8 5.4-3 8.4-3.6l.4 1.4c-3 .6-5.6 1.8-8.2 3.6Z')
    + G(wine_bottle(), 25.6, 36, -34)
    + hand(38.6, 36, -34, 'flat'),
    hr='#2c2420', sk='#f1cfb4', job='#6E56A8')

# 148 prep cook labelling the prep containers
cx = 14
put('specials-board-obj', 'prep-label-ill', 'Prep cook labelling containers', 'Prep cook',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'bk') + head(cx, hair='curly', hat='band', hatc='gn')
    + R('wh', 30.4, 18.4, 13.6, 2.2, .8) + R('bb', 31, 20.6, 12.4, 11, 1.2) + R('gn-n', 31.6, 23.2, 11.2, 7.8, .8) + O('gn-d', 34, 26, .9) + O('gn-d', 38.6, 27.6, .9)
    + R('wh', 29.4, 31.6, 15.6, 2.2, .8) + R('bb', 30, 33.8, 14.4, 12.6, 1.2) + R('rd-n', 30.6, 37, 13.2, 8.8, .8)
    + R('cm', 32, 36.4, 10.6, 3.6, .3) + P('lt', 'M33.4 38.2c.8-.8 1.4-.8 2 0s1.2.8 2 0')
    + arm((25, 32.6), (26.4, 42.6), (29.8, 37.4), 'wh', 'sk')
    + G(R('bk', -1, -.9, 9.6, 1.8, .9) + R('rd', 8, -.9, 2.6, 1.8, .6), 31.8, 34.8, -122)
    + hand(30.6, 36.4, -60, 'fist'),
    hr='#1f1a17', sk='#8d5a3c', job='#B84234')

# 149 catering server with canapés, white gloves
cx = 16
put('team-huddle-obj', 'catering-canape-ill', 'Catering server with canapés', 'Catering, banquet server',
    torso(cx, 'wh') + shirt_collar(cx) + bowtie(cx, 31.6, 'bk') + O('gd-n', cx + 5, 37, .8) + O('gd-n', cx + 5, 41.4, .8) + head(cx, hair='slick')
    + arm((27.5, 32.5), (34.5, 37.5), (34.2, 25.4), 'wh') + hand(33.8, 24.8, -20, 'flat', c='wh')
    + R('bk', 26.4, 20.4, 19.6, 2.6, 1) + P('bk-d', 'M27 22.2h18.4v.6H27Z')
    + ''.join(E('tn', x, 19.4, 1.9, .9) + O(c, x, 18.2, 1.1) for x, c in ((29, 'og'), (33, 'gn'), (37, 'rd'), (41, 'yl')))
    + O('lf-n', 33.4, 17.2, .5) + O('lf-n', 41.4, 17.2, .5),
    hr='#3a2b22', sk='#c68a62', job='#6E56A8')

# 150 shift lead with the store keys
cx = 15
key = lambda c: (P(c, 'M-2.6 0a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 0 1-5.2 0Z') + R(c, 2.2, -1.05, 9.4, 2.1, .6)
                 + P(c, 'M7.4 1v1.9h1.5V1M9.8 1v1.3h1.3V1') + O('wh-n', -.7, 0, .95) + P(f'{c}-d', 'M3 -.1h7.6v.6H3Z'))
put('reservation-call-obj', 'shift-lead-keys-ill', 'Shift lead with the store keys', 'Shift lead, manager',
    torso(cx, 'bz') + P('bz', f'M{cx-3.4} 27.8l3.4 3.8 3.4-3.8-1-1.2h-4.8Z') + P('lt', f'M{cx} 31.6v4') + badge(cx - 10, 33.4) + head(cx, hair='curly', earring=True)
    + arm((26, 32.6), (31.4, 40), (31.6, 27.4), 'bz')
    + G(key('mt'), 38.4, 30.4, 112) + G(key('gd'), 38.4, 30.4, 82) + R('ac', 41.6, 31.4, 4.4, 6.6, 1.6) + O('wh-n', 43.8, 32.8, .7)
    + P('ln', 'M38.4 23.4a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7')
    + hand(31.8, 26.2, -78, 'fist'),
    hr='#3a2b22', sk='#8d5a3c', job='#176954')

# 151 dishwasher in rubber gloves, loading the rack
cx = 14
put('storefront-obj', 'dishwasher-gloves-ill', 'Dishwasher in rubber gloves', 'Dishwasher',
    torso(cx, 'ts') + crew(cx, 'ts') + apron_bib(cx, 'ap') + head(cx, hair='buzz', beard=True)
    + R('mt', 42, 6, 6, 43, 1)
    + ''.join(G(E('pd', 0, 0, 2.4, 8.6) + E('sl-n', 0, 0, .9, 5.6), x, 31.6, 0) for x in (30.4, 35, 39.6))
    + R('pt', 26.6, 37, 20, 8, 1.2) + P('lt', 'M31.6 37v8M36.6 37v8M41.6 37v8')
    + arm((25, 32.6), (24.4, 42.6), (27.6, 38.6), 'ts', 'yl') + hand(28.4, 38.2, -20, 'grip', c='yl')
    + P('lb-n', 'M44 12a1.2 1.2 0 0 1-2.4 0c0-.8 1.2-2.4 1.2-2.4s1.2 1.6 1.2 2.4Z').replace('lb-n', 'bb'),
    hr='#1f1a17', sk='#c68a62', job='#4478A8')

# 152 barista steaming milk
cx = 14
put('closing-time-obj', 'barista-steam-ill', 'Barista steaming milk', 'Barista',
    torso(cx, 'sh') + apron_bib(cx, 'br') + head(cx, hair='pony', earring=True)
    + R('mt', 33.6, 2, 14.4, 6.4, 1.4) + P('ao6', 'M42.4 8.4L38.6 22') + P('t-mt', 'M42.4 8.4L38.6 22') + O('bk', 43, 7.8, 1.6)
    + P('ln3', 'M33.6 18.6c-1.6-1-2-2.8-.6-4M45 20c1.6-1 1.8-2.8.4-4M31.6 14.4c-1.2-1.6-.8-3.4.8-4.4')
    + arm((25, 32.6), (28.4, 41.4), (31.6, 30.6), 'sh', 'sk')
    + P('mt', 'M33.4 22.4h10.4l-.8 11.6c-.1 1.4-1.2 2.4-2.6 2.4h-3.6c-1.4 0-2.5-1-2.6-2.4Z') + P('mt', 'M43.8 22.4l2.6-1.2v1.6l-2.4 1.6Z')
    + P('mt-d', 'M40.4 23h3.2l-.8 11.2c-.1.8-.6 1.4-1.4 1.6Z') + P('ll', 'M35.2 24v9')
    + P('mt', 'M33.4 24.6h-1.6c-1.6 0-2.6 1.2-2.6 2.8v1.6c0 1.6 1 2.8 2.6 2.8h1.6v-1.8h-1.4c-.6 0-1-.5-1-1.1v-1.4c0-.6.4-1.1 1-1.1h1.4Z')
    + hand(31.4, 28.6, -90, 'grip'),
    hr='#2c2420', sk='#e8b896', job='#B7791F')

# 153 tray of drinks (server, cocktail server)
put('tip-jar-obj', 'drinks-tray-obj', 'Tray of drinks', 'Server, cocktail server',
    E('mt', 24, 38, 21, 5.6) + E('mt-d', 24, 38.8, 17, 3.6)
    + P('pd', 'M7.6 20h13l-6.5 8.4Z') + P('lq-n', 'M9.6 21.6h9l-4.5 5.8Z') + L('ln', (14.1, 28.4), (14.1, 35.4)) + P('ln', 'M11 35.8h6.2') + O('ol', 15.6, 22.6, 1.3)
    + P('pd', 'M18.8 15.4h9.6c.3 4.4-1.4 7.4-4.8 7.6-3.4-.2-5.1-3.2-4.8-7.6Z') + P('mn-n', 'M19.2 18.4h8.8c-.5 2.2-2 3.6-4.4 3.6s-3.9-1.4-4.4-3.6Z') + L('ln', (23.6, 23), (23.6, 31.6)) + P('ln', 'M20.6 32h6')
    + P('pd', 'M30.6 18.6h10l-1.4 16.6c-.1 1-.9 1.6-1.8 1.6h-3.6c-.9 0-1.7-.6-1.8-1.6Z') + P('lq', 'M31.2 22.6h8.8l-1.1 12.4c-.1.8-.7 1.2-1.4 1.2h-3.8c-.7 0-1.3-.4-1.4-1.2Z')
    + P('wh', 'M30.8 23c-1-1.8.4-3.6 2.4-3.2.8-1.6 3.4-1.8 4.4-.4 1.4-1 3.6-.2 3.4 1.6 1 .6.6 2.2-.6 2.4Z') + P('ll', 'M32.4 25.6v8.4'), job='#4478A8')

# 154 piping bag on a cupcake (pastry chef)
put('pass-window-obj', 'piping-bag-obj', 'Piping bag on a cupcake', 'Pastry chef, baker',
    P('pk', 'M10.4 34h19.2l-2.4 12H12.8Z') + P('pk-d', 'M15 34.6l1 11M20 34.6v11M25 34.6l-1 11').replace('pk-d', 'lt')
    + P('wh', 'M8.6 34.4c-.8-3.8 2.2-6 5.4-5.4-.2-3.6 3.4-5.4 6.4-3.8.8-2.4 4.4-2.8 6 .2 3.4-.2 5.6 3.2 3.4 6.2 1.6 1.4 1 2.8-.4 2.8Z') + P('ln3', 'M12 31.6c3 1 7 1 10.4-.2M15.6 27.6c2.4.8 5.4.8 7.6-.4')
    + O('ch', 20.6, 22.4, 1.8)
    + G(P('wh', 'M0 -5L17 -1.2V1.2L0 5Z') + P('wh', 'M0 -5c-2.4 0-3.8 2.4-3.8 5s1.4 5 3.8 5Z') + R('mt', 16.8, -1.2, 3.4, 2.4, .5) + P('ln3', 'M4 -3.6l1.4 7'), 41.6, 6.6, 140), job='#B7791F')

# 155 hand truck with boxes (receiver)
put('food-truck-obj', 'hand-truck-obj', 'Hand truck with boxes', 'Receiver, stocker',
    P('ao6', 'M12 4.4l5.2 36.4M16 4l5.2 36.4').replace('ao6', 'ln') + P('ao6', 'M11.4 4.6h5') + P('t-rd', 'M11.4 4.6h5')
    + P('ao6', 'M12.6 6l5 35M17.4 5.4l5 35') + P('t-rd', 'M12.6 6l5 35M17.4 5.4l5 35')
    + P('ao6', 'M17.6 41.4h17') + P('t-rd', 'M17.6 41.4h17')
    + R('bx', 21, 26, 15.6, 14.4, .8) + R('tn-n', 27.2, 26.4, 3.2, 13.6) + P('lt', 'M33.4 36.6v-3.2m-1.1 1.1 1.1-1.1 1.1 1.1')
    + R('bx', 20.4, 12.8, 13.6, 13.2, .8) + R('tn-n', 25.6, 13.2, 3, 12.4) + P('lt', 'M31 22.8v-3m-1 1 1-1 1 1')
    + O('bk', 18.6, 42.6, 4.4) + O('mt', 18.6, 42.6, 1.6), job='#6E56A8')

# 156 manager name badge
put('shift-swap-obj', 'manager-badge-obj', 'Manager name badge', 'Manager, general manager',
    G(R('gd', -21, -11.5, 42, 23, 3.6) + P('gd-d', 'M-19 7.6h38v1.8h-38Z') + R('gn', -18, -8.2, 36, 5, 1.4)
      + P('ll', 'M-17.4 .4h3')
      + '<text x="0" y="5.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="6.4" fill="#1d2528">MANAGER</text>'
      + P('wh-n', 'M0 -7.6l.75 1.5 1.6.2-1.2 1.1.3 1.6-1.45-.75-1.45.75.3-1.6-1.2-1.1 1.6-.2Z'), 24, 24.4, -8),
    job='#176954')

# 157 pizza on the peel (pizza cook)
put('time-off-obj', 'pizza-peel-obj', 'Pizza on the peel', 'Pizza cook',
    P('ao6', 'M33 33.4l12 12') + P('t-wd', 'M33 33.4l12 12')
    + E('wd', 21.4, 21.4, 17.4, 14.6, 45) + E('wd-d', 24.6, 24.8, 13, 9.6, 45).replace('wd-d', 'wd-l')
    + O('cr', 20.4, 20.4, 12.4) + O('rd', 20.4, 20.4, 10.4) + O('yl', 20.4, 20.4, 9.4)
    + ''.join(O('ch', x, y, 1.9) for x, y in ((16.6, 16.4), (23.8, 15.6), (25, 22.6), (17.4, 24.6), (20.8, 20.2))) + O('lf-n', 14.6, 20.6, .9) + O('lf-n', 26.4, 18.6, .9), job='#B84234')

# 158 salad bowl and tongs (salad prep)
put('hello-name-tag-obj', 'salad-tongs-obj', 'Salad bowl and tongs', 'Salad prep, prep cook',
    P('mt', 'M28.6 4.4l3.4-.8 1 3.8-4.2 15.6c-.2.8-1 1.2-1.8 1-.8-.2-1.2-1-1-1.8l3.4-12.8-8.6 11c-.6.6-1.4.8-2 .2-.6-.4-.8-1.4-.2-2Z')
    + P('lf', 'M6.6 27.6c-.8-3.4 1.4-5.8 4.4-5.2.6-3.4 4.8-4.6 6.8-1.8 1.8-3 6.2-2.8 7.6.6 3-1.4 6.4.8 6 4.2 2.6.2 3.6 2 3.4 3.4h-2.2c-.2-1.4-1.4-2-2.6-1.6-.6-2.2-3-3-4.6-1.8Z').replace('Z', 'H6.6Z')
    + P('lf-l', 'M11 24.6c1.4-1 3-1.2 4.4-.2M21 22.8c1.6-.8 3.2-.6 4.6.4') + O('rd', 12.8, 25.6, 2.2) + O('ol', 27.2, 25.8, 2) + O('cm-n', 27.2, 25.8, .9) + O('rd', 21.4, 26.4, 1.8)
    + P('wd', 'M3 27.4h42c0 9.6-8.6 16.6-21 16.6S3 37 3 27.4Z') + P('wd-d', 'M38.6 30.4c-1.6 6.6-6.2 11-13 12.4 8.6-.4 15.6-5.2 17.2-12.4Z') + P('ll', 'M7.4 31.4c1.2 3.4 3.6 6.2 7 7.8')
    + R('wd', 2, 26, 44, 3, 1.5), job='#3C7A68')
