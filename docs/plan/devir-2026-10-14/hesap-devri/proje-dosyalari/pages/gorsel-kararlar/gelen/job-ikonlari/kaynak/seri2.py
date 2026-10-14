"""Series round 2/5 (overall round 5), 2026-10-14: drawn with kit.py.
Mert 08:24Z: better craftsmanship; his roles (manager, salad prep, receiver, supervisor,
stocker, polisher, mixologist) mixed in, and now and then an object without a person
(martini glass, shaker, old fashioned, handlebar-mustache silhouette)."""
from kit import *

S2, COL2 = [], {}
def add(slug, name, role, body, **col):
    S2.append((slug, name, role, body)); COL2[slug] = col

# 79 cocktail server: drink tray held high
cx, top = 17, 27
add('cocktail-server-ill', 'Cocktail server with a drink tray', 'Cocktail server, server',
    torso(cx, 'sh') + vest(cx, 'bk', depth=11) + shirt_collar(cx) + bowtie(cx, 31.6, 'bk') + head(cx, hair='pony', earring=True)
    + arm((28.5, 32.5), (35.5, 37.5), (35, 25.2), 'sh') + hand(34.6, 24.6, -20, 'flat')
    + E('mt', 36, 21.6, 9.4, 1.9) + P('mt-d', 'M27.2 22.2c5.8 1.6 11.8 1.6 17.6 0v.6c-5.8 1.7-11.8 1.7-17.6 0Z')
    # martini glass: olive on a pick
    + P('lq', 'M27.6 11.8h7.8l-3.9 5Z') + P('pd', 'M27 10.2h9l-4.5 6.4Z') + P('lq-n', 'M28.2 11.8h6.6l-3.3 4.2Z')
    + L('ln', (31.5, 16.6), (31.5, 20.6)) + L('ln', (29.6, 20.9), (33.4, 20.9)) + L('lt', (29.6, 8.6), (33.2, 13.4)) + O('ol', 32.2, 12.2, 1.2)
    # highball with ice, lime and a straw
    + L('ln', (41.4, 9.2), (39.8, 13.8)) + R('pd', 37.6, 12.4, 6, 8.4, .8) + R('rs-n', 38.4, 14.4, 4.4, 5.6, .4)
    + R('ic', 38.8, 14.8, 2.2, 2.2, .4) + R('ic', 40.4, 16.8, 2.2, 2.2, .4) + P('lf', 'M43.6 12.2a2.4 2.4 0 0 1-3.4 2.6Z') + glint(38.6, 13.4, 3),
    hr='#5a3825', sk='#f1cfb4', job='#4478A8')

# 80 manager with the schedule on a tablet
cx, top = 17, 27
add('manager-tablet-ill', 'Manager with the schedule on a tablet', 'Manager, assistant manager',
    torso(cx, 'sh') + shirt_collar(cx) + necktie(cx, 'nv', length=14) + head(cx, hair='short')
    + L('lt', (cx - 3.6, 28.4), (cx - 7.4, 38.6)) + R('wh', cx - 9.8, 38.4, 4.8, 6.2, .8) + R('bl-n', cx - 9, 39.3, 3.2, 1.5, .3)
    + arm((28.5, 32.5), (39.5, 46), (43.4, 37.4), 'sh')
    + G(R('bk', 0, 0, 15.4, 20.6, 2) + R('wh-n', 1.5, 1.7, 12.4, 17.2, .6) + R('sl-n', 1.5, 1.7, 12.4, 3, .6)
        + R('gn-n', 2.8, 6.2, 6.6, 2.2, 1.1) + R('bl-n', 5.6, 9.6, 7.2, 2.2, 1.1) + R('yl-n', 3.6, 13, 6, 2.2, 1.1) + R('gn-n', 6.4, 16.2, 6.2, 2.2, 1.1)
        + R('st-n', 2.8, 2.6, 4, 1.2, .6), 25.6, 24.6, -7)
    + hand(41.2, 35.4, 0, 'thumb'),
    hr='#3a2b22', sk='#c68a62', job='#176954')

# redo 72: sommelier pouring wine (Mert: the tie must be clear, the pour readable)
cx, top = 13, 27
import math
def bottle(x, y, rot):
    return G(P('gl', 'M0 -2.9h9.8c1.8 0 2.6 1.9 3.4 2.2h4.6v1.4h-4.6c-.8.3-1.6 2.2-3.4 2.2H0a.8.8 0 0 1-.8-.8v-4.2a.8.8 0 0 1 .8-.8Z')
             + R('cm-n', 2.2, -2.9, 5.6, 5.8) + R('mn-n', 3.2, -.7, 3.6, 1.4, .3) + P('ln', 'M2.2 -2.9v5.8M7.8 -2.9v5.8')
             + R('gd-n', 16.6, -.9, 1.2, 1.8) + P('ll', 'M.8 -1.8h8.4'), x, y, rot)
a_ = math.radians(34); bx, by = 21.4, 9.6; mx, my = bx + 18 * math.cos(a_), by + 18 * math.sin(a_)
SOMM = (torso(cx, 'sh') + vest(cx, 'bk', depth=15) + shirt_collar(cx) + necktie(cx, 'mn', length=15)
    + head(cx, hair='slick') + O('gd', cx - 8, 35.6, 1.2) + O('lf-n', cx - 7.2, 34.8, .6)
    + counter('wd', 42.5)
    + P('pd', 'M33.6 28.4h10.4c.3 4.4-1.7 7.4-5.2 7.6-3.5-.2-5.5-3.2-5.2-7.6Z') + P('mn-n', 'M34.3 31.6h9c-.8 2.3-2.5 3.6-4.5 3.6s-3.7-1.3-4.5-3.6Z')
    + L('ln', (38.8, 36), (38.8, 41.6)) + L('ln', (35.6, 42), (42, 42)) + glint(35.2, 29.4, 2.6)
    + P('lw', f'M{g(mx+.6)} {g(my+.8)}c.7 1.6 1.2 4 1.1 {g(31.4-my-1)}')
    + arm((24, 32.5), (30.8, 30.2), (25.6, 19.4), 'sh')
    + bottle(bx, by, 34)
    + hand(25.4, 17.6, -100, 'grip'))
add('sommelier-pour-ill', 'Sommelier pouring wine', 'Sommelier', SOMM, hr='#2c2420', sk='#f1cfb4', job='#6E56A8')

# 81 salad prep: tongs in a big salad bowl
cx, top = 15, 27
add('salad-prep-ill', 'Salad prep tossing a salad', 'Salad prep, prep cook',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'gn') + head(cx, hair='bun', hat='skull', hatc='bk')
    + arm((26, 32.5), (31, 40), (36.6, 23.6), 'wh', 'sk')
    + P('mt', 'M36.4 19.4h3l.4 3.4 1.2 8.4c.2.8-.2 1.4-1 1.4-.6 0-1-.4-1.1-1l-1.3-7.8-2.4 7.6c-.2.6-.7 1-1.3.9-.8-.1-1.2-.8-1-1.5l3-8.2Z')
    + hand(37.4, 22.6, -80, 'fist')
    + P('lf', 'M23.6 33.4c-.6-2.6 1-4.4 3.2-3.8.4-2.6 3.6-3.4 5-1.4 1.4-2.2 4.6-2 5.6.4 2.2-1 4.8.6 4.4 3.2 1.8.2 2.6 1.4 2.4 2.4Z')
    + P('lf-l', 'M27 31.2c1-.8 2.2-.9 3.2-.2M34.4 30.2c1.2-.6 2.4-.5 3.4.4')
    + O('rd', 28.4, 31.6, 1.7) + P('rd-l', 'M27.6 30.8a1 1 0 0 1 1-.6') + O('ol', 41, 31.8, 1.5) + O('cm-n', 41, 31.8, .7) + O('rd', 35.8, 32.4, 1.4)
    + P('mt', 'M21.8 33h24.4c0 7.2-5.4 11.8-12.2 11.8S21.8 40.2 21.8 33Z') + P('mt-d', 'M42.8 36.2c-1 3.8-3.6 6.2-7 7.2 3.6-.2 7.4-2.6 8.6-7.2Z') + P('ll', 'M24.6 35.6c.6 2 1.8 3.6 3.4 4.6')
    + R('mt', 21, 32.2, 26, 2, 1),
    hr='#2c2420', sk='#e0ac85', job='#3C7A68')

# 82 receiver: checking a delivery against the invoice
cx, top = 14, 27
add('receiver-ill', 'Receiver checking a delivery', 'Receiver',
    torso(cx, 'ts') + crew(cx, 'ts') + head(cx, hair='short', hat='cap', hatc='nv')
    + R('bx', 28, 37.4, 18.6, 12, .6) + P('bx-d', 'M28.6 41.8h17.4v1.2H28.6Z') + R('tn-n', 35.6, 37.8, 3.4, 11) + P('lt', 'M42 44.6v-3.2m-1.2 1.2 1.2-1.2 1.2 1.2')
    + R('bx', 30.4, 26.6, 14.4, 10.8, .6) + R('tn-n', 36, 27, 3.2, 10) + P('bx-d', 'M31 30.4h13.2v1H31Z') + P('lt', 'M41.6 34.6v-3m-1.1 1.1 1.1-1.1 1.1 1.1')
    + arm((4, 33), (8.6, 42), (14.4, 38.4), 'ts')
    + G(R('wd', 0, 0, 12.4, 15.6, 1) + R('pd-n', 1.2, 2.6, 10, 12, .4) + R('mt', 3.6, -1, 5.2, 2.6, .8)
        + P('gn-n', 'M2.2 5.6l1 1 1.8-2 .6.5-2.4 2.6-1.6-1.6Z') + R('st-n', 6, 5, 4.4, 1, .5)
        + P('gn-n', 'M2.2 9.4l1 1 1.8-2 .6.5-2.4 2.6-1.6-1.6Z') + R('st-n', 6, 8.8, 4.4, 1, .5) + R('st-n', 6, 12.4, 3.4, 1, .5)
        + O('pd', 3.4, 13, 1) , 13.2, 31.4, 4)
    + hand(15, 38.8, 0, 'thumb'),
    hr='#1f1a17', sk='#8d5a3c', job='#6E56A8')

# 83 martini glass with an olive (bartender object)
add('martini-glass-obj', 'Martini glass with an olive', 'Bartender, mixologist',
    P('pd', 'M6.5 8.5h35L24 27Z') + P('lq', 'M10 12h28L24 26.6Z') + P('lq-l', 'M12.4 12.8h8.4l-4.2 4.4Z') + P('ll', 'M10.6 9.8h12')
    + L('ln', (24, 27), (24, 40.6)) + P('pd', 'M15 42.4c2.4-1.6 15.6-1.6 18 0 .2.9-.3 1.6-1.2 1.6H16.2c-.9 0-1.4-.7-1.2-1.6Z')
    + L('ln', (33.6, 2.8), (21.2, 18.4)) + O('ol', 26, 12.6, 3.2) + O('ac-n', 27, 11.8, 1.1) + P('ol-l', 'M24 11.4a2 2 0 0 1 1.2-1.4')
    + P('ys-n', 'M40 2.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z'),
    hr='#000000', job='#B7791F')

# 84 baker: basket of fresh bread
cx, top = 16, 27
add('baker-bread-ill', 'Baker with a basket of bread', 'Baker',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'tn') + O('wh-l', cx - 4, 38, .8) + O('wh-l', cx + 3, 42, .7)
    + head(cx, hair='short', hat='skull', hatc='wh') + P('lt', f'M{cx-6.2} 12.4h12.4')
    + G(R('bx', -2.3, 0, 4.6, 18, 2.3) + P('dg-n', 'M-1.2 3.2l2.4 1.8v.9l-2.4-1.8ZM-1.2 7.8l2.4 1.8v.9l-2.4-1.8ZM-1.2 12.4l2.4 1.8v.9l-2.4-1.8Z'), 30.6, 17.6, -16)
    + G(R('bx', -2.3, 0, 4.6, 17, 2.3) + P('dg-n', 'M-1.2 3.2l2.4 1.8v.9l-2.4-1.8ZM-1.2 7.8l2.4 1.8v.9l-2.4-1.8ZM-1.2 12.4l2.4 1.8v.9l-2.4-1.8Z'), 36.8, 18.6, 12)
    + P('bx', 'M37 33.4c0-4.4 3.2-7 6-7s4.6 2.6 4.6 7Z') + P('br-n', 'M41.4 29.2l2.4 2.4M43.8 28.8l1.6 2')
    + P('bg', 'M22.4 33h25l-3 15.6H25.4Z') + P('bg-d', 'M24 37.4h22M24.8 41.6h20.4M25.4 45.8h19.2').replace('bg-d', 'lt')
    + R('bg', 21.4, 32, 27, 3, 1.4) + hand(23.6, 35.6, -90, 'thumb') + hand(46.2, 35.6, -90, 'thumb'),
    hr='#b0703c', sk='#f3c9a8', job='#B7791F')

# 85 sushi chef: knife and nigiri on the board
cx, top = 16, 27
add('sushi-chef-ill', 'Sushi chef with nigiri', 'Sushi chef',
    torso(cx, 'wh') + P('nv', f'M{cx-3} 28L{cx+7.6} 44.6l2.4-1.6L{cx+2.6} 28Z') + P('nv', f'M{cx+3} 28l-2.2 7.6 1.8 2.8L{cx+4.4} 28.4Z')
    + head(cx, hair='buzz', hat='band', hatc='wh') + O('ac-n', cx - 3.6, 12.8, .9)
    + arm((27, 32.5), (34.6, 38.6), (38.4, 29.4), 'wh', 'sk')
    + G(R('wd', -5.2, -1.3, 6, 2.6, .9) + P('mt', 'M.8 -1.3h12.6c1.6 0 2.6.6 2.4 1.2-.5 1.1-2.6 1.4-4.4 1.4H.8Z') + P('ll', 'M2 -.3h10.4'), 39.2, 27.2, -62)
    + hand(39, 27.6, -62, 'fist')
    + R('wd', 16.6, 41.6, 30.8, 5, 1) + P('wd-d', 'M17.6 44.6h28.8v1H17.6Z')
    + R('cm', 19.4, 37.6, 6.4, 4, 2) + P('og', 'M19 38.4c.6-2.4 6.6-2.4 7.2 0-.4.6-1.2.8-1.8.6-1.2-.6-2.4-.6-3.6 0-.6.2-1.4 0-1.8-.6Z') + P('cm-n', 'M20.8 37.4l1 1.2M23 37.2l1 1.2')
    + R('cm', 27.6, 37.6, 6.4, 4, 2) + P('rd', 'M27.2 38.4c.6-2.4 6.6-2.4 7.2 0-2.4.8-4.8.8-7.2 0Z')
    + R('cm', 35.8, 37.6, 6.4, 4, 2) + R('yl', 35.6, 35.6, 6.8, 3, .8) + R('bk-n', 38, 35.4, 2, 6.4),
    hr='#1f1a17', sk='#e8b896', job='#B84234')

# 86 supervisor: headset and walkie-talkie
cx, top = 18, 27
add('supervisor-ill', 'Supervisor with headset and radio', 'Supervisor, floor manager',
    torso(cx, 'bz') + P('bz', f'M{cx-3.4} 27.8l3.4 3.8 3.4-3.8-1-1.2h-4.8Z') + P('lt', f'M{cx} 31.6v4') + O('wh', cx, 33.2, .5)
    + badge(cx - 10, 33.4) + head(cx, hair='curly')
    + P('ln', f'M{cx-7} 15.6C{cx-7.6} 6.6 {cx+7.6} 6.6 {cx+7} 15.6') + R('bk', cx - 8.6, 13.2, 3.4, 5.4, 1.4) + R('bk', cx + 5.2, 13.2, 3.4, 5.4, 1.4)
    + P('ln', f'M{cx-6.6} 18.4c.4 3.2 2 4.6 4.4 4.8') + O('bk', cx - 2, 23.2, 1)
    + arm((29, 32.5), (36, 42), (37.2, 31.4), 'bz')
    + R('bk', 33.4, 21.4, 7.4, 12.6, 1.6) + R('bk', 38.6, 15.4, 1.6, 6.6, .8) + R('gy-n', 34.8, 23.2, 4.6, 3, .6) + P('lt', 'M35 28.4h4.2M35 30.4h4.2')
    + O('gn-n', 35.6, 22.4, .5) + hand(37.4, 31.8, -90, 'grip'),
    hr='#2c2420', sk='#8d5a3c', job='#176954')

# 87 stocker: putting a can on the shelf
cx, top = 15, 27
add('stocker-shelf-ill', 'Stocker filling a shelf', 'Stocker, prep',
    R('mt', 29, 5, 18.6, 1.8, .6) + R('mt', 29, 22.6, 18.6, 1.8, .6) + R('mt', 29, 40.2, 18.6, 1.8, .6) + R('st', 46, 4, 1.8, 45, .6)
    + R('rd', 37, 13.6, 4.4, 9, 1) + R('cm-n', 37, 16.4, 4.4, 3.2) + R('rd', 42, 13.6, 4.4, 9, 1) + R('cm-n', 42, 16.4, 4.4, 3.2)
    + R('bx', 31, 31.2, 8, 9, .6) + R('tn-n', 33.8, 31.6, 2.4, 8.4) + R('yl', 40, 33, 6, 7.2, 1) + R('gn-n', 40, 35.2, 6, 2.4)
    + torso(cx, 'ts2') + crew(cx, 'ts2') + head(cx, hair='short', hat='beanie', hatc='og')
    + arm((25.8, 32.6), (33.4, 28.6), (32.6, 18), 'ts2', 'sk')
    + R('rd', 30.4, 9.4, 4.6, 9.4, 1) + R('cm-n', 30.4, 12.4, 4.6, 3.2) + P('ll', 'M31.4 10.8v6')
    + hand(32.8, 17.2, -90, 'grip'),
    hr='#1f1a17', sk='#c68a62', job='#3C7A68')

# 88 cocktail shaker (bartender object)
add('shaker-obj', 'Cocktail shaker', 'Bartender, mixologist',
    P('ln', 'M9.4 14.6c-1.6 2.6-1.6 5.6 0 8.2M6 12.6c-2.6 4-2.6 8.2 0 12.2M38.6 14.6c1.6 2.6 1.6 5.6 0 8.2M42 12.6c2.6 4 2.6 8.2 0 12.2')
    + P('mt', 'M14.6 22.4h18.8l-2.6 21.4c-.1 1.2-1.1 2-2.3 2h-9c-1.2 0-2.2-.8-2.3-2Z') + P('mt-d', 'M28.6 23.2h3.6l-2.6 21.2c-.1.6-.5 1-1 1.2Z')
    + P('ll', 'M18 25.4l1.6 16.4') + R('mt', 13.6, 20.4, 20.8, 3.4, 1.2)
    + P('mt', 'M16.4 20.4l2.8-8.4h9.6l2.8 8.4Z') + P('mt-d', 'M26.6 12.4h2.2l2.6 7.8h-2.2Z') + R('mt', 18.4, 10.4, 11.2, 2.4, 1)
    + P('mt', 'M20.6 10.4c0-3.4 1.6-5.6 3.4-5.6s3.4 2.2 3.4 5.6Z') + O('mt', 24, 4.6, 1.2) + P('ll', 'M22.4 8.8c.2-1.4.6-2.4 1.2-3')
    + P('lf', 'M34.4 46.4a6 6 0 0 1 8.8-8.2Z') + P('lf-l', 'M35.8 44.8l5.6-5.2') + P('bb-n', 'M12 44.6a1.4 1.4 0 0 1-2.8 0c0-1 1.4-2.8 1.4-2.8s1.4 1.8 1.4 2.8Z'),
    hr='#000000', job='#B7791F')

# 89 polisher: glass up to the light with a towel
cx, top = 15, 27
add('glass-polisher-ill', 'Polishing a wine glass', 'Polisher, busser, barback',
    torso(cx, 'bk') + shirt_collar(cx, 'bk') + head(cx, hair='slick')
    + arm((26, 32.6), (33, 41.4), (35.2, 29), 'bk')
    + P('wh', 'M31.2 32.4c2.2-.6 4.8-.2 7 1.2l.8 10c-2.4.9-5.2.9-7.8 0Z') + P('bl-n', 'M31.6 38.4l7 .3.1 1-7.1-.3ZM31.7 40.6l7.2.3.1 1-7.3-.3Z')
    + P('pd', 'M29.2 6.8h12.2c.4 6.2-2 10.2-6.1 10.4-4.1-.2-6.5-4.2-6.1-10.4Z') + P('ll', 'M31 8.6c0 2.8.7 5 2 6.6') + L('ln', (35.3, 17.2), (35.3, 26.4)) + P('ln', 'M32 27h6.6')
    + hand(35.2, 27.6, -90, 'grip')
    + P('ys-n', 'M27 2.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7ZM44 6.6l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5ZM42.6 1.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z'),
    hr='#6b3e26', sk='#f3c9a8', job='#3C7A68')

# 90 mixologist: tweezers, a garnish and a coupe
cx, top = 13, 27
add('mixologist-ill', 'Mixologist garnishing a cocktail', 'Mixologist, bartender',
    torso(cx, 'sh') + P('br', f'M{cx-7.6} 29.4l2.2-.6 2.6 20.2h-2.4ZM{cx+7.6} 29.4l-2.2-.6-2.6 20.2h2.4Z') + shirt_collar(cx) + bowtie(cx, 31.2, 'bk')
    + head(cx, hair='slick', beard=True)
    + counter('wd', 42.5)
    + P('pd', 'M30 29.4h12.4c-.4 3.6-2.8 5.6-6.2 5.6s-5.8-2-6.2-5.6Z') + P('og', 'M31 30.6h10.4c-.8 2.2-2.6 3.4-5.2 3.4s-4.4-1.2-5.2-3.4Z') + P('ll', 'M31.6 31.4c.6 1 1.4 1.6 2.4 1.8')
    + L('ln', (36.2, 35), (36.2, 41.6)) + P('ln', 'M33 42h6.4')
    + arm((23.6, 32.4), (31.4, 35), (32.2, 22.6), 'sh', 'sk')
    + G(R('br', 0, -2.4, 7, 4.8, 1.2) + R('cm-n', 1.4, -2.4, 3.6, 4.8) + R('br', 6.6, -1.1, 2.2, 2.2, .4) + R('bk', 8.6, -1.5, 3.4, 3, 1.2) + P('ll', 'M.8 -1.4h5'), 30.2, 13.4, 68)
    + hand(32.6, 20, -84, 'grip')
    + O('og-n', 34.6, 27.2, .7) + O('og-n', 34.9, 29, .6) + P('og', 'M40 29.6c1.4-1.4 3.4-1.4 4.4.2l-1 .6c-.8-.8-1.6-.8-2.4 0Z'),
    hr='#3a2b22', sk='#f3c9a8', job='#B7791F')

# 91 butcher: cleaver and a T-bone on the block
cx, top = 15, 27
add('butcher-ill', 'Butcher with a cleaver', 'Butcher',
    torso(cx, 'wh') + crew(cx, 'wh') + P('nv', f'M{cx-8} 49V34h16v15Z') + P('wh-n', f'M{cx-5.6} 34.8h1.4V49h-1.4ZM{cx-1.6} 34.8h1.4V49h-1.4ZM{cx+2.4} 34.8h1.4V49h-1.4Z')
    + P('lt', f'M{cx-7} 34L{cx-3} 28.2M{cx+7} 34L{cx+3} 28.2') + head(cx, hair='short', stache='plain', hat='skull', hatc='wh')
    + arm((26.2, 32.6), (34.6, 36), (35.4, 25.2), 'wh', 'sk')
    + R('wd', 33.6, 18, 3.2, 9, 1.4)
    + P('mt', 'M31.6 7.4h12.2c.8 0 1.4.6 1.4 1.4v9c0 .8-.6 1.4-1.4 1.4H31.6Z') + P('mt-d', 'M31.6 17.4h13.6v.4c0 .8-.6 1.4-1.4 1.4H31.6Z') + O('pd', 41.6, 10.6, 1.4) + P('ll', 'M33.2 9.4v7.6')
    + hand(35.2, 24.2, -90, 'fist')
    + R('wd', 19, 40.4, 28.6, 9, 1.4) + P('wd-d', 'M20 43h26.6v1H20Z')
    + P('rs', 'M23.6 39.6c-.6-3.6 2.2-6.2 6-6.4 3.2-.2 6 .8 8.4 0 2.6-.8 4.6.6 4.6 3 0 3-3 4.2-6.2 4.2h-9.6c-1.6 0-2.8-.4-3.2-.8Z') + P('cm-n', 'M25.6 38.2c1.6.6 4 .6 5.8-.2M38.4 35.4c1.2.4 2.4.2 3.2-.4')
    + P('cm', 'M32.8 33.8l1.6 6.2h1.8l-1.6-6.4Z'),
    hr='#2c2420', sk='#f1cfb4', job='#B84234')

# 92 valet: car key and claim ticket, the car behind
cx, top = 14, 27
add('valet-key-ill', 'Valet with a car key', 'Valet',
    P('bl', 'M27.6 49V40.8c0-1.6.8-2.8 2-3.4l2.6-5.8c.6-1.2 1.8-2 3.2-2h8.6c1.4 0 2.6.8 3.2 2l2.6 5.8c1.2.6 2 1.8 2 3.4V49Z')
    + P('lb', 'M32.6 37.2l2.2-5c.3-.6.9-1 1.6-1h7.8c.7 0 1.3.4 1.6 1l2.2 5Z') + P('ll', 'M36.4 32.6l-1.6 3.4')
    + O('yl', 32, 42.4, 1.8) + R('bk-n', 36.4, 41.6, 7.6, 2.2, 1) + R('bk-n', 37.4, 45, 5.6, 1.2, .6) + R('bl-d', 29.6, 47, 21, 2)
    + torso(cx, 'sh') + vest(cx, 'ac', depth=11) + shirt_collar(cx) + bowtie(cx, 31.6, 'bk')
    + head(cx, hair='short', hat='cap', hatc='bk') + R('gd-n', cx - 1.2, 7.2, 2.4, 1.6, .4)
    + arm((25, 32.6), (29.4, 40), (30.8, 25.6), 'sh')
    + G(R('yl', 0, 0, 4.4, 6, .6) + O('wh', 2.2, 1.2, .6) + R('bk-n', 1, 3, 2.4, .7) + R('bk-n', 1, 4.3, 2.4, .7), 33.6, 12.4, 22)
    + P('ln', 'M31.4 10.6a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 0 1 0-3.4') + R('bk', 29.2, 14, 4.4, 7.4, 1.8) + O('rd-n', 31.4, 16, .8) + O('gy-n', 31.4, 18.4, .8) + P('ll', 'M30.2 15v3')
    + hand(30.8, 23.4, -90, 'grip'),
    hr='#6b4430', sk='#e0ac85', job='#4478A8')

# 93 old fashioned glass (bartender object)
add('old-fashioned-obj', 'Old fashioned with a big ice cube', 'Bartender, mixologist',
    P('pd', 'M9.4 13.4h29.2l-1.8 28.2c-.1 1.6-1.4 2.8-3 2.8H14.2c-1.6 0-2.9-1.2-3-2.8Z')
    + P('wk', 'M10.6 22.8h26.8l-1.1 15.4H11.7Z') + P('wk-d', 'M33.6 23.2h3.6l-1 14.6h-3.4Z')
    + G(R('ic', -6, -6, 12, 12, 1.8) + P('ic-l', 'M-4.4 -4.2h5.6v1.4h-4.2v4.2h-1.4Z'), 22.4, 23.6, 12)
    + P('bb-n', 'M11.8 38.6h24.4l-.3 3c-.1 1-.9 1.6-1.9 1.6H14c-1 0-1.8-.6-1.9-1.6Z') + P('ll', 'M13.8 16.4l.9 19.6M35 16.8l-.4 4')
    + P('og', 'M31.4 9.4c2.8-1 5.4.2 6 2.6l.9 3.8c.6 2.8-.4 5.4-2.6 6.4l-1.1-2c1.3-.8 1.8-2.4 1.4-4.2l-.9-3.4c-.4-1.6-1.8-2.2-3.2-1.8Z')
    + O('ch', 17, 11.2, 2) + P('lt', 'M17.6 9.4c.8-2 2.2-3.6 4-4.4'),
    hr='#000000', job='#B7791F')

# 94 security at the velvet rope
cx, top = 17, 27
add('security-rope-ill', 'Security at the velvet rope', 'Security, doorman',
    torso(cx, 'sh') + jacket(cx, 'bk', depth=12) + shirt_collar(cx) + necktie(cx, 'bk', length=12)
    + head(cx, hair='buzz', beard=True) + P('lt', f'M{cx-6.6} 18.6c-1.4 1.6.8 2.4-.4 4s.8 2.4-.4 4l-.8 2.6')
    + R('gd', 37.4, 25.6, 2.8, 19.6, 1.2) + O('gd', 38.8, 24.2, 2.4) + P('gd', 'M33.4 48.6c0-2 2.4-3.4 5.4-3.4s5.4 1.4 5.4 3.4Z') + P('ll', 'M38.2 27.4v15')
    + P('ao6', 'M37.4 29.4C29.6 41 11.4 41.6 -1 31.4') + P('t-kr', 'M37.4 29.4C29.6 41 11.4 41.6 -1 31.4') + O('gd', 37.8, 29.4, 1.3),
    hr='#3a2b22', sk='#c68a62', job='#111827')

# 95 to-go specialist handing over a bag
cx, top = 15, 27
add('togo-bag-ill', 'To-go order handed over', 'To-go specialist, cashier',
    torso(cx, 'rd') + P('rd', f'M{cx-3.4} 27.8l3.4 3.8 3.4-3.8-1-1.2h-4.8Z') + P('lt', f'M{cx} 31.6v4') + badge(cx - 10, 33.4, 'wh')
    + head(cx, hair='long', hat='visor', hatc='rd')
    + arm((26, 32.6), (29.8, 41), (33.6, 28.6), 'rd', 'sk')
    + P('bg', 'M26.4 29.4h17.2l-1 19H27.4Z') + P('bg-d', 'M40.4 29.8h3.2l-1 18.6h-2.8Z') + P('bg', 'M26.4 29.4l1.2-3.6h14.8l1.2 3.6Z')
    + R('pd', 37, 30.4, 5, 7.6, .4) + R('st-n', 38, 32.2, 3, .7) + R('st-n', 38, 33.8, 3, .7) + R('st-n', 38, 35.4, 2, .7)
    + O('ac', 31.4, 40, 2.8) + P('wh-n', 'M31.4 41.6l-1.6-1.6a.9.9 0 0 1 1.6-1.1.9.9 0 0 1 1.6 1.1Z')
    + hand(33.4, 27.6, -90, 'fist'),
    hr='#2c2420', sk='#c68a62', job='#4478A8')

# 96 banquet server at the chafing dish
cx, top = 13, 27
add('banquet-server-ill', 'Banquet server at the buffet', 'Banquet server, catering',
    torso(cx, 'wh') + shirt_collar(cx) + bowtie(cx, 31.6, 'bk') + O('gd-n', cx + 5, 37, .8) + O('gd-n', cx + 5, 41.4, .8)
    + head(cx, hair='slick')
    + P('mt', 'M21.2 34.6c0-7.2 5.4-11.4 12-11.4s12 4.2 12 11.4Z') + P('mt-d', 'M38.8 24.4c3.6 1.8 6 5.4 6.2 10.2h-2.6c-.2-4.6-1.4-8-3.6-10.2Z') + P('ll', 'M24.6 30c.8-2.2 2.2-3.8 4.2-4.8')
    + arm((24, 32.6), (29.4, 39), (31, 27.4), 'wh')
    + G(R('mt', 0, -.7, 9.4, 1.4, .7) + E('mt', 10.4, 0, 2.2, 1.6), 31.8, 26.6, 42)
    + P('fd', 'M22.6 34.6c.8-2.6 3-3.8 5.2-3.2 1.4-1.8 4.2-2 5.8-.2 1.6-1.6 4.4-1.4 5.6.6 2-.6 3.8.6 4.2 2.8Z') + O('lf-n', 27.6, 32.4, .6) + O('lf-n', 33.4, 31.6, .6) + O('lf-n', 39, 32.6, .6) + O('rd-n', 30.6, 32.8, .6)
    + hand(31.2, 25.8, -60, 'fist')
    + R('mt', 20, 34, 26.4, 6, 1.2) + P('mt-d', 'M20.8 37.6h24.8v1.4H20.8Z')
    + P('ln', 'M23.4 40v6.6M43 40v6.6M22 46.6h22.4')
    + P('og', 'M30 46.2c-1.8 0-2.6-1.4-2.2-2.8.4-1.4 1.6-2.2 2.2-3.8.8 1.4 2.4 2.4 2.4 4.2 0 1.4-1 2.4-2.4 2.4Z') + P('yl-n', 'M30 45.6c-.7 0-1-.6-.8-1.2l.8-1.4.8 1.4c.2.6-.1 1.2-.8 1.2Z')
    + P('og', 'M36.6 46.2c-1.8 0-2.6-1.4-2.2-2.8.4-1.4 1.6-2.2 2.2-3.8.8 1.4 2.4 2.4 2.4 4.2 0 1.4-1 2.4-2.4 2.4Z') + P('yl-n', 'M36.6 45.6c-.7 0-1-.6-.8-1.2l.8-1.4.8 1.4c.2.6-.1 1.2-.8 1.2Z'),
    hr='#3a2b22', sk='#f3c9a8', job='#6E56A8')

# 97 owner: turning the sign to OPEN
cx, top = 15, 27
add('owner-open-ill', 'Owner turning the sign to Open', 'Owner, general manager',
    torso(cx, 'wh') + jacket(cx, 'bn', depth=13) + head(cx, hair='short', beard=True)
    + P('ln', 'M38 13.4l-7.4 7.6M38 13.4l7.4 7.6') + O('gd', 38, 13.2, 1.1)
    + arm((25.8, 32.6), (31.6, 41.6), (31.4, 30.6), 'bn')
    + R('gn', 28.6, 20.6, 18.4, 11, 1.6) + R('gn-d', 30, 22, 15.6, 8.2, 1)
    + '<text x="37.8" y="28.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="4.6" fill="#ffffff">OPEN</text>'
    + hand(29.4, 27.6, 0, 'thumb'),
    hr='#a7adb3', sk='#f1cfb4', job='#111827')

# 98 the classic waiter: handlebar mustache, profile silhouette (server object)
W, Wd = '#2b3135', 'fill="#2b3135" stroke="#ffffff" stroke-width="1.1" stroke-linejoin="round"'
add('waiter-silhouette-obj', 'Classic waiter silhouette, handlebar mustache', 'Server, waiter',
    f'<path fill="{W}" d="M15.8 25.4C12.2 21.6 11.8 11.6 17.4 7.6c4.2-3 9.6-1.8 10.8 3l.2 2.6 2.4 3.6-2 .6.4 1.8-.6.8.4 1c0 2.6-1.4 4-3.4 4l-1.2 2.6.2 1.4c4 1 6.8 4 7.4 9l.4 9.4H9.4c0-9.6.6-16.6 3.6-19.4Z"/>'
    + '<path fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" d="M27.4 9.4c-3-1.4-6.8-.8-9.2 1.8"/>'
    + f'<path {Wd} d="M28.4 18.4c1.8 1 4.2 1 5.6-.1 1-.8 1-2.1-.1-2.6 2.6-.1 3.8 2 2.6 3.8-1.4 2-5.2 2.4-8.2 1Z"/>'
    + f'<path fill="#ffffff" d="M24.4 28.8c2.6.6 4.8 2.2 6 4.4l-3.4 1.8-3-5Z"/><path {Wd} d="M25.6 30.6l-2.6-1.8v3.6ZM25.6 30.6l2.6-1.8v3.6Z"/>'
    + f'<path {Wd} d="M15.4 33.6c4 3.8 8.8 5.8 14 5.4l3-8.8 2.6.6-2.4 11c-6.8 1.4-13.6-1-18.8-6.4Z"/>'
    + f'<path {Wd} d="M29.6 28.4h17.4v1.8H29.6Z"/><path {Wd} d="M31.8 28.4c0-5.8 3.6-9 6.6-9s6.6 3.2 6.6 9Z"/><circle {Wd} cx="38.4" cy="18.4" r="1.3"/>',
    hr='#000000', job='#4478A8')

# redo 60: host at the host stand (Mert: the stand must read as a host stand)
cx, top = 21, 27
add('host-stand-ill', 'Host at the host stand', 'Host',
    torso(cx, 'sh') + jacket(cx, 'bz', depth=11) + shirt_collar(cx) + necktie(cx, 'mn', length=11) + badge(cx + 6, 33.2)
    + head(cx, hair='slick')
    + arm((10, 33), (6.4, 41), (8.6, 33.6), 'bz')
    + G(R('mn', 0, 0, 8.6, 13, 1) + R('mn-d', 1.2, 1.2, 6.2, 10.6, .6) + P('lg', 'M2.4 4.6h3.8') + R('mn', 1.6, -1.6, 8.6, 13, 1), 3.4, 22.6, -8)
    + hand(11.6, 30.4, 0, 'thumb')
    + E('gd', 38.4, 33.4, 3.4, 1.1) + R('gd', 37.8, 25.4, 1.2, 8) + P('gn', 'M32.6 27.6c0-2.8 2.4-4.4 5.8-4.4s5.8 1.6 5.8 4.4Z') + P('ll', 'M34.8 25.4c.8-.6 1.8-1 2.8-1')
    + P('fy-n', 'M34 28h8.8l1.8 4.4H32.2Z').replace('fy-n', 'yl-l')
    + P('wd', 'M8.4 36.6h32l-2.6-4H11Z') + P('wd', 'M9.6 36.6h29.6l-2.6 12.4H12.2Z') + P('wd-d', 'M14.2 39.2h20.4l-1.6 7.6H15.8Z') + R('gd', 21.4, 40.6, 6, 2.2, .6)
    + P('pd', 'M14.4 35.8l1.4-3.4c2.6-.8 5.4-.6 8.2.6 2.8-1.2 5.6-1.4 8.2-.6l1.4 3.4c-3-.8-6.4-.6-9.6.8-3.2-1.4-6.6-1.6-9.6-.8Z')
    + P('lt', 'M24 33v3.4') + P('st-n', 'M16.6 33.6l5.6.4v.6l-5.8-.4ZM16.2 34.8l5.8.4v.6l-6-.4ZM25.6 34l5.8-.4.2.6-5.8.4Z'),
    hr='#8a5a3a', sk='#f3c9a8', job='#6E56A8')

# redo 74: pizza cook spinning dough (Mert: body and arm were out of proportion)
cx, top = 15, 27
add('pizza-toss-ill', 'Pizza cook tossing dough', 'Pizza cook',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'rd') + head(cx, hair='short', stache='plain', hat='skull', hatc='wh') + R('rd-n', cx - 6.9, 12.1, 13.8, 1.2)
    + arm((26, 32.6), (34.4, 31.6), (34.8, 18.8), 'wh', 'sk')
    + hand(34.8, 17.6, -90, 'flat')
    + P('lt', 'M23.4 7.6c-1.4 1.6-1.4 3.4 0 5M46.2 7.6c1.4 1.6 1.4 3.4 0 5')
    + E('dg', 34.8, 10.6, 9.8, 2.8) + E('dg-d', 34.8, 10.2, 6.8, 1.4) + O('dg-d', 27.6, 5.6, .5) + O('dg-d', 41.4, 4.8, .6) + O('dg-d', 35.4, 3.8, .5)
    + counter('wd', 42.8)
    + E('bx', 37.6, 43.4, 9, 2.6) + E('rd', 37.6, 43.2, 7.4, 1.9) + E('og-l', 37.6, 43.1, 6, 1.4) + E('rd-d', 34.6, 43, 1.2, .5) + E('rd-d', 39.8, 43.4, 1.2, .5) + E('rd-d', 37.4, 42.4, 1, .4),
    hr='#1f1a17', sk='#e0ac85', job='#B84234')
