"""Round 9, part 2 (2026-10-14, Mert 09:04Z): 15 new drawings, no. 159-173.
Same rule as seri6: the person doing the job, or the tool that person uses most."""
from kit import *
from seri3 import flame
from seri6 import rp, stream

S7, COL7 = [], {}
def add(slug, name, role, body, **col):
    col.setdefault('hr', '#000000'); S7.append((slug, name, role, body)); COL7[slug] = col

def bar_top(cx, vestc='bk', tie=('tie', 'bk'), hair='slick', **hk):
    o = torso(cx, 'sh') + vest(cx, vestc, depth=12) + shirt_collar(cx)
    if tie[0] == 'bowtie': o += bowtie(cx, 31.6, tie[1])
    else: o += necktie(cx, tie[1], length=12)
    return o + head(cx, hair=hair, **hk)

# 159 bartender muddling mint and lime in a rocks glass
cx = 14
add('bartender-muddle-ill', 'Bartender muddling a mojito', 'Bartender, mixologist',
    bar_top(cx, 'bk', ('tie', 'bk'), 'slick', beard=True)
    + counter('wd', 41.5)
    + P('bb', 'M30.4 28.8h14.4l-1.2 12.7H31.6Z') + P('lf', 'M31.2 35.6h12.8l-.5 5.9H31.7Z') + P('ol', 'M33 37.8l3.2-2 2.4 3.4Z') + P('lf-d', 'M39.6 36.6l2.4 1.8-2.8 1.6Z')
    + P('lf', 'M31.4 29c-1.6-2.4-1-4.6 1.2-5.6 1 2.2.6 4.2-1.2 5.6ZM43.6 29c1.4-2.6.6-4.6-1.6-5.4-.8 2.2-.2 4 1.6 5.4Z') + P('ll', 'M32.4 30.2l.8 9.8')
    + R('br', 36, 15.2, 3.2, 22.8, 1.4) + R('br-d', 36, 34.6, 3.2, 3.4, 1.2) + P('ll', 'M36.9 17v14')
    + arm((25, 32.6), (29.4, 41.2), (35.2, 22.6), 'sh', 'sk')
    + hand(35.6, 19.6, -90, 'fist'),
    hr='#2c2420', sk='#e0ac85', job='#6E56A8')

# 160 bartender free-pouring into a martini glass
cx = 13
bx, by, br = 44.4, 1.6, 116
nx, ny = rp(bx, by, br, 14.2, 0)
mx, my = rp(bx, by, br, 21.6, 0)
add('bartender-pour-ill', 'Bartender free-pouring', 'Bartender',
    bar_top(cx, 'mn', ('bowtie', 'bk'), 'short')
    + counter('wd', 41.5)
    + stream(f'M{g(mx)} {g(my)}c-.4 3-.6 6.4-.4 {g(31.6-my)}', '#e0a43a', 2)
    + P('pd', 'M27.8 29.6h16l-8 7.6Z') + P('lq-n', 'M30.4 31.2h10.8l-5.4 5.1Z') + P('ll', 'M30.4 30.8l3 2.8')
    + L('ln', (35.8, 37.2), (35.8, 41.2)) + P('ln', 'M32.4 41.4h6.8')
    + arm((24, 32.6), (32.2, 33.6), (nx - 1.6, ny + 2.2), 'sh', 'sk')
    + G(P('lq', 'M0 -3.6h10.4c1.8 0 2.4 2.2 3.6 2.2h3.2v2.8H14c-1.2 0-1.8 2.2-3.6 2.2H0a.9.9 0 0 1-.9-.9v-5.4A.9.9 0 0 1 0-3.6Z')
        + R('cm-n', 2.2, -3.6, 6, 7.2) + R('ac-n', 3.4, -1, 3.6, 2, .4) + P('ln', 'M2.2 -3.6v7.2M8.2 -3.6v7.2')
        + R('mt', 17.2, -1, 2.8, 2, .4) + P('mt', 'M20 -.5h1.8v1H20Z') + P('ll', 'M1 -2.4h8'), bx, by, br)
    + hand(nx, ny, br - 90, 'grip'),
    hr='#1f1a17', sk='#c68a62', job='#6E56A8')

# 161 barista pouring latte art
cx = 14
px, py, pr = 31.6, 25.2, 44
hx, hy = rp(px, py, pr, -7.4, -.6)
sx, sy = rp(px, py, pr, 6.6, -7.2)
add('barista-latte-ill', 'Barista pouring latte art', 'Barista',
    torso(cx, 'sh') + crew(cx, 'sh') + apron_bib(cx, 'gl') + head(cx, hair='short', beard=True, hat='beanie', hatc='og')
    + counter('wd', 41.5)
    + E('wh', 39.4, 41, 8.2, 1.8) + P('wh', 'M32.6 34.2h13.6l-1.6 5.8c-.4 1.2-1.4 1.8-2.6 1.8h-5.2c-1.2 0-2.2-.6-2.6-1.8Z')
    + P('wh', 'M46.2 35.4c1.8 0 2.2 2.6.2 3.2l-1 .2') + E('cb', 39.4, 34.2, 6.8, 1.9) + P('cm-n', 'M39.4 35.6c-1.6-.8-3.2-1.6-2.6-2.4.6-.6 1.8-.2 2.6.6.8-.8 2-1.2 2.6-.6.6.8-1 1.6-2.6 2.4Z')
    + P('ll', 'M34.2 36v3')
    + stream(f'M{g(sx)} {g(sy)}c.6 1.4 1.2 2.6 1.6 {g(33.4-sy)}', '#f7efe2', 1.6)
    + arm((25, 32.6), (28.4, 41.4), (hx - 1, hy + 2.6), 'sh', 'sk')
    + G(P('mt', 'M-4.4 -6.4h8.8l.9 10.6c.1 1.3-.9 2.4-2.2 2.4H-3.7c-1.3 0-2.3-1.1-2.2-2.4Z') + P('mt', 'M4.4 -6.4l2.8-1.4.4 1.6-2.6 1.8Z')
        + P('mt-d', 'M1.8 -5.8h2.4l.8 10.2c.1.8-.5 1.4-1.2 1.6Z')
        + P('mt', 'M-4.4 -4.6h-1.4c-1.8 0-2.8 1.4-2.8 3.2v1.2c0 1.8 1 3 2.8 3h1.2V1h-1c-.7 0-1.2-.6-1.2-1.4v-.8c0-.8.5-1.4 1.2-1.4h1.4Z') + P('ll', 'M-3 -4.6v7.6'), px, py, pr)
    + hand(hx, hy, pr - 90, 'grip'),
    hr='#5a3825', sk='#f1cfb4', job='#B7791F')

# 162 sommelier swirling a glass of red
cx = 14
add('sommelier-swirl-ill', 'Sommelier swirling a glass', 'Sommelier',
    torso(cx, 'sh') + jacket(cx, 'bk', depth=12) + shirt_collar(cx) + necktie(cx, 'mn', length=11)
    + P('lg', f'M{cx-3.6} 28.6C{cx-7} 33 {cx-7.4} 37 {cx-5.8} 40.6') + O('gd', cx - 5.6, 41.2, 2.2) + O('gd-d', cx - 5.6, 41.2, 1.1)
    + head(cx, hair='slick', earring=True)
    + P('lt', 'M28.4 14.6c-1.4 2.6-1.4 5.6 0 8.2M45.6 14.6c1.4 2.6 1.4 5.6 0 8.2')
    + P('pd', 'M30 11.4h14c.6 6.2-1.6 11.4-7 11.4s-7.6-5.2-7-11.4Z') + P('mn-n', 'M30.2 16.4c2.2-1.2 4.6.6 6.8 0s4.6-1.6 6.8-.4c-.4 4.2-2.6 6.8-6.8 6.8s-6.4-2.6-6.8-6.4Z')
    + P('ll', 'M31.6 13v4.4') + L('ln', (37, 22.8), (37, 33.6))
    + arm((25, 32.6), (30.4, 42), (35.4, 31.4), 'bk')
    + hand(35, 30.8, -90, 'fist') + P('ln', 'M33.2 34.6h7.6'),
    hr='#2c2420', sk='#f3c9a8', job='#6E56A8')

# 163 sushi chef rolling maki with the bamboo mat
cx = 13
maki = lambda x, y: O('bk', x, y, 2.8) + O('wh-n', x, y, 1.9) + O('og-n', x - .2, y + .1, .9) + O('lf-n', x + .7, y - .5, .45)
add('sushi-roll-ill', 'Sushi chef with a board of maki', 'Sushi chef',
    torso(cx, 'wh') + P('bl', f'M{cx-3.4} 27.6L{cx+6.4} 41l1.6-1.2L{cx-1.4} 27Z') + crew(cx, 'wh') + head(cx, hair='buzz', hat='band', hatc='bl')
    + arm((24, 32.6), (27.6, 42), (33.6, 35.6), 'wh', 'sk')
    + R('wd', 26.4, 31.4, 21.2, 3.4, 1) + R('wd', 28.4, 34.6, 2.6, 2.4, .4) + R('wd', 43, 34.6, 2.6, 2.4, .4) + P('wd-d', 'M27.2 33.6h19.6v.8H27.2Z')
    + maki(31.2, 27.6) + maki(37, 27.6) + maki(42.8, 27.6)
    + hand(33.4, 35.8, 0, 'flat'),
    hr='#1f1a17', sk='#e8b896', job='#B84234')

# 164 pizza cook spreading the sauce
cx = 13
add('pizza-sauce-ill', 'Pizza cook spreading the sauce', 'Pizza cook',
    torso(cx, 'bk') + crew(cx, 'bk') + apron_bib(cx, 'wh') + head(cx, hair='short', hat='cap', hatc='rd')
    + counter('wd', 41.5)
    + E('dg', 37.2, 37.4, 10.6, 4.2) + E('rd', 37.6, 37.2, 8.4, 3) + P('lt', 'M32.4 36.6c2.8-1.4 7.4-1.6 10.6-.2M34.6 38.4c2-.6 4.8-.6 6.6.2')
    + E('mt', 42.6, 36.8, 2.8, 1.2) + L('ao6', (42, 36.4), (42.6, 22)) + L('t-mt', (42, 36.4), (42.6, 22))
    + arm((24, 32.6), (32.4, 33.4), (40.8, 23.6), 'bk', 'sk')
    + hand(41.8, 22.6, -45, 'fist'),
    hr='#2c2420', sk='#f3c9a8', job='#B84234')

# 165 line cook tossing a wok over the flame
cx = 13
wx, wy, wr = 36.4, 30.4, -12
gx, gy = rp(wx, wy, wr, -13, -1)
add('wok-toss-ill', 'Line cook tossing a wok', 'Line cook, cook',
    chef_coat(cx, 'bk', btn='wh') + head(cx, hair='none', hat='skull', hatc='wh')
    + flame(32, 44, 1.1) + flame(38.4, 44.6, 1.3) + flame(44, 44, 1)
    + O('og-n', 33.4, 19.4, 1.6) + O('gn-n', 37.6, 16.2, 1.5) + O('rd-n', 42, 18.8, 1.6) + P('wk-n', 'M35 22.4l2.8-1.2.6 1.4-2.6 1.2Z') + P('gn-n', 'M43.4 23.4l2.2-1.8.8 1-2 1.8Z') + O('fy-n', 39.8, 20.6, 1.1)
    + P('lt', 'M31 22.4c1.4-4.4 9.2-6.6 14-1.4')
    + G(P('bk', 'M-9.4 -1.6h19c0 5-4.2 8.6-9.5 8.6s-9.5-3.6-9.5-8.6Z') + P('bk-l', 'M-6.6 1c1.6 2.2 4 3.2 6.6 3.2') + R('bk', -9.8, -2.6, 19.8, 1.8, .9)
        + R('wd', -16.6, -2.6, 7.2, 2.4, 1.2), wx, wy, wr)
    + arm((24, 32.6), (27, 41.4), (gx - 1.6, gy + 2.6), 'bk', 'sk')
    + hand(gx, gy, wr, 'grip'),
    hr='#000000', sk='#c68a62', job='#B84234')

# 166 grill cook turning a steak with tongs
cx = 13
add('grill-tongs-ill', 'Grill cook with tongs and a steak', 'Grill cook',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'bk') + head(cx, hair='short', beard=True, hat='band', hatc='rd')
    + flame(30.6, 47.6, .8) + flame(36.4, 48, 1) + flame(42.4, 47.6, .8)
    + R('bk', 26.4, 40, 21.6, 2.4, 1.2)
    + P('ln', 'M28.6 43.4h17.6M28.6 45.4h17.6')
    + P('br', 'M30.8 37.4c-.6-2.6 1.4-4.6 4.8-4.8l6.4-.2c2.8 0 4.4 1.6 4.2 3.8-.2 1.8-1.8 3.2-4.4 3.4l-7.8.4c-1.8 0-2.8-.8-3.2-2.6Z')
    + P('lt', 'M33.4 38.4l2.4-5M37.2 38.2l2.4-5.2M41 37.8l2.2-4.8') + P('cm-n', 'M32.4 35.4c.2-1 1.2-1.8 2.4-1.8')
    + L('ao6', (29.4, 25.2), (38.4, 34.4)) + L('t-mt', (29.4, 25.2), (38.4, 34.4)) + L('ao6', (30.8, 24), (40.6, 32.6)) + L('t-mt', (30.8, 24), (40.6, 32.6))
    + arm((24, 32.6), (25.6, 41.6), (28, 26.6), 'wh', 'sk')
    + hand(29, 25, -45, 'fist'),
    hr='#5a3825', sk='#e0ac85', job='#B84234')

# 167 cook plating with a squeeze bottle
cx = 13
add('cook-squeeze-ill', 'Cook plating with a squeeze bottle', 'Line cook, chef',
    chef_coat(cx, 'wh') + head(cx, hair='slick', hat='skull', hatc='bk')
    + counter('wd', 41.5)
    + E('wh', 37.6, 38.4, 10.2, 3) + E('sh-n', 37.6, 38.2, 7, 1.9)
    + O('rd-n', 32.2, 38.4, .9) + O('rd-n', 34.4, 37.2, .9) + O('rd-n', 41, 37.2, .9) + O('rd-n', 43.2, 38.4, .9)
    + P('og-n', 'M35.8 38.8c-.6-1.8.8-2.8 2.4-2.6 1.8.2 2.6 1.8 1.4 2.8Z') + P('lf-n', 'M38.6 36.4c.8-1.2 2.2-1.4 3-.6-.8.8-1.8 1-3 .6Z')
    + P('rd', 'M33.6 13.6h5.6v12.8c0 1-.8 1.8-1.8 1.8h-2c-1 0-1.8-.8-1.8-1.8Z') + P('rd-d', 'M37.4 14.2h1.4v12c0 .8-.4 1.4-1 1.6Z')
    + P('wh', 'M34.2 28.2h4.4l-1.4 3.4h-1.6Z') + P('wh', 'M35.8 31.6h1.2l-.2 2.2h-.8Z') + O('rd', 36.4, 35.2, .6) + P('ll', 'M34.8 15.4v9')
    + arm((24, 32.6), (28.2, 41.2), (32.4, 23.2), 'wh', 'sk')
    + hand(32.6, 22.2, -10, 'grip'),
    hr='#2c2420', sk='#f1cfb4', job='#B84234')

# 168 busser carrying a stack of dirty plates
cx = 13
add('busser-plates-ill', 'Busser with a stack of plates', 'Busser, dishwasher',
    torso(cx, 'bk') + crew(cx, 'bk') + apron_waist(cx, 'ap', 41) + head(cx, hair='curly')
    + arm((24, 32.6), (26.8, 41.6), (32.4, 38), 'bk', 'sk')
    + P('wh', 'M27 27.6a10 2.6 0 0 1 20 0v7.8a10 2.6 0 0 1-20 0Z') + P('sh-n', 'M27.4 28.6c2 1.6 5.6 2.4 9.6 2.4s7.6-.8 9.6-2.4v6.6c-2 1.6-5.6 2.4-9.6 2.4s-7.6-.8-9.6-2.4Z')
    + P('lt', 'M27 30.2a10 2.6 0 0 0 20 0M27 32.8a10 2.6 0 0 0 20 0') + E('sh-n', 37, 27.6, 6.4, 1.4)
    + P('lf-n', 'M33.4 27.4c.8-1 2-1 2.8 0Z') + P('rd-n', 'M38.4 27.8c1 .5 2.2.5 3-.2')
    + P('mt', 'M39.6 27.6l5-9.4 1.2.6-4.8 9.4Z') + P('mt', 'M43.2 17.6l1.8-3 .6.4-1.4 3.2ZM44.6 18.4l1.8-3 .6.4-1.6 3.2Z')
    + hand(32.6, 38.4, 0, 'flat'),
    hr='#1f1a17', sk='#8d5a3c', job='#3C7A68')

# 169 barback hauling a bucket of ice
cx = 13
add('barback-ice-ill', 'Barback hauling ice', 'Barback',
    torso(cx, 'gy') + crew(cx, 'gy') + head(cx, hair='short', hat='cap', hatc='bk')
    + P('bb', 'M29.4 26.6h16.4l-1.6 15.6c-.1 1-1 1.8-2 1.8H33c-1 0-1.9-.8-2-1.8Z') + P('lb-d', 'M41.6 27.2h3.4l-1.6 15c-.1.8-.7 1.4-1.4 1.6Z')
    + R('bb', 28.8, 25.4, 17.6, 2.6, 1.2) + P('ll', 'M31.8 29.4l1.2 11.6')
    + R('ic', 31.4, 21.6, 4.6, 4.6, 1) + R('ic', 35.6, 20.4, 4.6, 4.6, 1) + R('ic', 39.8, 21.8, 4.6, 4.6, 1) + R('ic', 33.4, 18.2, 4.2, 4.2, 1) + R('ic', 37.8, 16.8, 4.2, 4.2, 1)
    + P('ll', 'M32.4 22.8l1.6-.4M36.6 21.6l1.6-.4M38.8 18l1.4-.4')
    + P('ln', 'M29.6 27c-2.4 4.6-.8 9.6 2.4 11')
    + arm((24, 32.6), (25.6, 42), (30.6, 37.6), 'gy', 'sk')
    + hand(31.4, 37.6, -10, 'grip'),
    hr='#5a3825', sk='#f3c9a8', job='#6E56A8')

# 170 porter taking out the trash bag
cx = 13
add('porter-trash-ill', 'Porter with a trash bag', 'Porter, dishwasher',
    torso(cx, 'bz') + crew(cx, 'bz') + badge(cx + 4.6, 33.4, 'wh') + head(cx, hair='buzz', beard=True)
    + P('bk', 'M30.6 28.6c-4 3.2-6.2 7.6-5.6 12.2.6 4.6 4.6 7.2 10.4 7.2s9.8-2.6 10.4-7.2c.6-4.6-1.6-9-5.6-12.2Z')
    + P('bk-l', 'M30.6 34.4c-1.2 2.4-1.4 5-.6 7.4M41 33.6c1 1.6 1.4 3.4 1.4 5') + P('ll', 'M28.2 37.4c-.2 2.2.2 4 1.2 5.6')
    + P('bk', 'M32.6 28.6l-1-4.4c1.6-.8 3-.4 4 .6 1-1 2.4-1.4 4-.6l-1 4.4Z')
    + arm((24, 32.6), (28.2, 40.6), (32.4, 25.4), 'bz', 'sk')
    + hand(33, 24.6, -90, 'fist'),
    hr='#1f1a17', sk='#8d5a3c', job='#3C7A68')

# 171 rolling pin on the dough (baker, pastry chef)
add('rolling-pin-obj', 'Rolling pin on dough', 'Baker, pastry chef',
    P('dg', 'M4.6 34c0-4.2 8.6-7.4 19.4-7.4S43.4 29.8 43.4 34s-8.6 7.6-19.4 7.6S4.6 38.2 4.6 34Z') + P('dg-d', 'M8 36.4c3.4 2.2 9.4 3.4 16 3.4s12.6-1.2 16-3.4c-2.4 2.8-8.8 4.8-16 4.8s-13.6-2-16-4.8Z')
    + O('wh-n', 11.4, 30.4, .7) + O('wh-n', 36.8, 38.6, .7) + O('wh-n', 39.6, 30.2, .6) + O('wh-n', 15, 38.6, .5)
    + G(R('wd', -12.4, -4.2, 24.8, 8.4, 4.2) + P('wd-d', 'M-10 2.4h20v1.6h-20Z') + P('ll', 'M-9.6 -2.2h18')
        + R('wd', -20.4, -1.8, 8.6, 3.6, 1.8) + R('wd', 11.8, -1.8, 8.6, 3.6, 1.8), 24, 25.2, -14),
    job='#B7791F')

# 172 portafilter and tamper (barista)
add('tamper-obj', 'Portafilter and tamper', 'Barista',
    R('bk', 2.6, 30.4, 17.4, 4.6, 2.3) + P('bk-l', 'M5 31.8h12.6')
    + P('mt', 'M19 27.4h20.6v3.2c0 4-3.2 7.2-7.2 7.2h-6.2c-4 0-7.2-3.2-7.2-7.2Z') + P('mt-d', 'M35.6 27.8h4v2.8c0 3.2-2 5.8-4.8 6.8 1-2 .8-5.4.8-9.6Z')
    + R('mt', 26.2, 37.6, 6, 2.6, .8) + P('br', 'M20.4 27.4c.2-1.2 1.2-2 2.4-2h13c1.2 0 2.2.8 2.4 2Z')
    + R('mt', 20.2, 21.4, 18.4, 3.8, 1.4) + P('mt-d', 'M35 21.8h3.2v3h-3.2Z')
    + R('br', 25.4, 6.6, 8, 14.8, 4) + P('br-d', 'M31 7.6c1.6 1.2 2 2.8 2 4.4v8.8h-2Z') + P('ll', 'M27.2 9.4v8.4'),
    job='#B7791F')

# 173 pizza cutter on a pizza
add('pizza-cutter-obj', 'Pizza cutter', 'Pizza cook',
    P('dg', 'M3.6 36.4c0-6 9.2-10.8 20.4-10.8s20.4 4.8 20.4 10.8-9.2 10.8-20.4 10.8S3.6 42.4 3.6 36.4Z') + P('rd', 'M6.4 36.2c0-4.6 7.8-8.2 17.6-8.2s17.6 3.6 17.6 8.2-7.8 8.2-17.6 8.2S6.4 40.8 6.4 36.2Z')
    + P('fd-n', 'M9 35.4c1.4-3 7.6-5.4 15-5.4s13.6 2.4 15 5.4c-.6 3.6-7.2 6.4-15 6.4S9.6 39 9 35.4Z')
    + O('ch', 14.8, 35.2, 1.8) + O('ch', 21.6, 38.8, 1.8) + O('ch', 30.4, 37.6, 1.8) + O('ol', 17.8, 32.4, .9) + O('ol', 33.2, 33.2, .9)
    + P('ln', 'M7.6 39.4L30.6 31.2')
    + L('ao6', (30.2, 28.6), (42.4, 8.4)) + L('t-kr', (30.2, 28.6), (42.4, 8.4)) + P('kr-d', 'M38.4 13.6l3.4-5.6')
    + O('mt', 29.4, 30.6, 5.4) + O('mt-d', 29.4, 30.6, 3.4) + O('mt', 29.4, 30.6, 1.4) + P('ll', 'M25.4 28.6c.8-1.6 2.2-2.8 4-3.2'),
    job='#B84234')
