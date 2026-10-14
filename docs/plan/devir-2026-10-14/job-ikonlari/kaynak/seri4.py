"""Series round 4/5 (overall round 7), 2026-10-14: kitchen and bar equipment, with six more
jobs mixed in now and then (fry cook, kitchen manager, drive-thru, trainer, ice cream, bar manager)."""
from kit import *
from seri3 import flame

S4, COL4 = [], {}
def add(slug, name, role, body, job=None, **col):
    if job: col['job'] = job
    col.setdefault('hr', '#000000'); S4.append((slug, name, role, body)); COL4[slug] = col

def steam(*xs, y=10, h=2.4):
    return P('ln3', ''.join(f'M{g(x)} {g(y)}c-1.2-1.2-1.2-{g(h/2)} 0-{g(h)}s1.2-{g(h)} 0-{g(h*1.5)}' for x in xs))

# 119 line cook: the range with two pots
add('range-obj', 'Range with pots on the burners', 'Line cook, cook',
    steam(14, 26, y=12, h=2.6)
    + P('mt', 'M7.6 15.6h14.8v8.6c0 1.2-1 2.2-2.2 2.2H9.8c-1.2 0-2.2-1-2.2-2.2Z') + R('mt', 6.4, 14.2, 17.2, 2.4, 1.2) + P('mt-d', 'M19.6 16.6h2.8v7.6c0 1-.6 1.6-1.4 1.8Z')
    + P('bk', 'M26 19.6h11.4v4.6c0 1.2-1 2.2-2.2 2.2h-7c-1.2 0-2.2-1-2.2-2.2Z') + R('bk', 37, 19.8, 8.4, 2.4, 1.2)
    + R('bk', 4, 26.2, 40, 3.2, 1) + R('mt', 4.6, 29.4, 38.8, 16.6, 2) + P('mt-d', 'M39.4 30h4v14c0 1.2-.8 1.8-1.6 2h-2.4Z')
    + ''.join(O('bk', x, 32.6, 1.6) for x in (10, 17.4, 30.6, 38)) + R('bk', 9.6, 36, 28.8, 7.4, 1.4) + R('ys-n', 12, 38.2, 24, 3, 1) + R('bk', 15, 35, 18, 1.6, .8), '#B84234')

# 120 fry cook: the deep fryer
add('fryer-obj', 'Deep fryer with a basket of fries', 'Fry cook, line cook',
    R('mt', 6.4, 26.4, 35.2, 19.6, 2) + P('mt-d', 'M37.6 27h3.4v17.4c0 1-.6 1.6-1.4 1.6h-2Z') + R('bk', 10, 36.6, 28, 5.4, 1.2) + O('rd-n', 14.4, 39.3, 1.1) + O('gn-n', 18.8, 39.3, 1.1)
    + R('mt', 4.6, 23.6, 38.8, 3.6, 1.8) + E('lq', 24, 25.2, 15.4, 1.6) + O('lq-l', 13.6, 24.8, .7) + O('lq-l', 30.4, 25, .9)
    + P('mt', 'M20.6 9.6h7.4v1.8h-7.4Z') + R('bk', 28, 9.8, 15, 2.4, 1.2)
    + ''.join(R('yl', x, 6.8 + (x % 3), 2, 7.6, .6) for x in (12.4, 15, 17.6, 20.2, 22.8, 25.4))
    + R('mt', 10.4, 12.4, 18.6, 9.4, 1.2) + P('lt', 'M10.4 15.6h18.6M10.4 18.8h18.6M14.4 12.4v9.4M19.6 12.4v9.4M24.8 12.4v9.4')
    + P('lq-n', 'M14.6 22.4c.8 1 .8 1.8 0 2.4-.8-.6-.8-1.4 0-2.4ZM22 22.6c.7.9.7 1.6 0 2.2-.7-.6-.7-1.3 0-2.2Z'), job='#B84234')

# 121 pizza cook: the wood-fired oven
add('pizza-oven-obj', 'Wood-fired pizza oven', 'Pizza cook',
    R('mt', 30.4, 2.6, 5.4, 9, 1) + P('bx', 'M3.6 42V28C3.6 16.4 12.6 8.4 24 8.4S44.4 16.4 44.4 28v14Z') + P('bx-d', 'M36.6 12.8c4.8 3.6 7.8 9 7.8 15.2v14h-3.6V28c0-6-1.6-11.4-4.2-15.2Z')
    + P('cb-n', 'M9 22.6h5M8 30h5M33 20.6h5M35 30h5M17 13.6h4.6M27 12.6h4.6').replace('cb-n', 'lt')
    + P('bk', 'M13.4 42V32.6c0-6 4.6-10.6 10.6-10.6s10.6 4.6 10.6 10.6V42Z') + flame(20.4, 41.8, .85) + flame(27, 42.2, 1) + R('wd', 18.4, 39.4, 12.4, 2.4, 1.2)
    + R('bx', 2, 41.4, 44, 5.6, 1.6) + P('ln', 'M13 42.4h22').replace('ln', 'lt'), job='#B84234')

# 122 barista: the espresso machine
add('espresso-machine-obj', 'Espresso machine pulling a shot', 'Barista',
    R('wh', 11, 6.4, 7, 5, 1) + E('br-n', 14.5, 6.6, 2.6, .7) + R('wh', 20.4, 6.4, 7, 5, 1) + E('br-n', 23.9, 6.6, 2.6, .7)
    + R('mt', 5, 11.4, 38, 27.6, 3) + P('mt-d', 'M39 12c2.2.4 4 2.2 4 4.6V35c0 2-1.4 3.6-3.4 4Z') + R('bk', 5, 11.4, 38, 4.4, 2)
    + O('wh', 35.4, 21.6, 3.6) + P('rd-n', 'M35.4 21.6l1.8-1.8.5.5-1.9 1.9Z') + O('bk-n', 35.4, 21.6, .6)
    + R('bk', 15, 19.2, 10, 3.6, 1) + R('mt', 17, 22.8, 6, 2.8, .6) + R('bk', 23, 23, 11.4, 2.4, 1.2) + R('bk', 3.6, 21, 2.4, 9.4, 1.2)
    + P('br-n', 'M19.6 25.6h.8v5.6h-.8Z') + P('wh', 'M15.6 30.2h9l-.8 6c-.2 1-1 1.6-2 1.6h-3.4c-1 0-1.8-.6-2-1.6Z') + P('ln', 'M24.4 31.6c2 0 2.4 3 .2 3.4')
    + R('bk', 3.4, 38.6, 41.2, 5, 1.6) + P('lt', 'M7 41.2h34'), job='#B7791F')

# 123 dishwasher: rack of clean plates
add('dish-rack-obj', 'Rack of clean plates', 'Dishwasher',
    steam(15, 24, 33, y=9, h=2.6)
    + ''.join(G(E('pd', 0, 0, 2.8, 10.6) + E('sl-n', 0, 0, 1, 7), x, 24.6, 0) for x in (9.6, 15.2, 20.8, 26.4, 32, 37.6))
    + R('pt', 4, 31.6, 40, 11.6, 1.6) + P('pt-d', 'M4.6 38.4h38.8v1.4H4.6Z') + P('lt', 'M10.6 31.6v11.6M17.2 31.6v11.6M23.8 31.6v11.6M30.4 31.6v11.6M37 31.6v11.6')
    + P('ys-n', 'M42.6 8.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z'), job='#4478A8')

# 124 prep / receiver: walk-in cooler
add('walk-in-obj', 'Walk-in cooler door', 'Prep cook, receiver',
    R('sl', 7, 4, 34, 42, 2) + R('wh', 10.4, 7.4, 27.2, 35.2, 1.4) + P('sl-d', 'M33.8 7.8h3.4v34.4h-3.4Z')
    + R('bk', 31, 21, 3, 10, 1.4) + R('mt', 29.4, 23.6, 2.4, 4.8, .6)
    + O('lb', 19, 17, 6.4) + P('wh-n', 'M19 11.6v10.8M14.3 14.3l9.4 5.4M14.3 19.7l9.4-5.4').replace('wh-n', 'ln')
    + R('wh', 14.4, 29, 9.6, 9.6, 2) + R('bl-n', 15.8, 30.4, 6.8, 4.4, .8) + P('wh-n', 'M17 32.2h4.4v.8H17Z') + R('st-n', 15.8, 35.8, 6.8, 1, .5), job='#3C7A68')

# 125 fry cook (person): lifting the basket out of the oil
cx, top = 14, 27
add('fry-cook-ill', 'Fry cook lifting the fry basket', 'Fry cook, line cook',
    torso(cx, 'wh') + crew(cx, 'wh') + apron_bib(cx, 'bk') + head(cx, hair='short', hat='cap', hatc='rd')
    + R('mt', 29, 36, 19, 13, 1.4) + E('lq', 38.4, 36.6, 8.8, 1.4) + O('lq-l', 33, 36.4, .6)
    + arm((25, 32.6), (30.6, 39.4), (30.2, 28.6), 'wh', 'sk')
    + R('bk', 30, 25.4, 8.4, 2.4, 1.2)
    + ''.join(R('yl', x, 17.6 + (x % 2), 1.8, 7, .6) for x in (37.6, 40, 42.4))
    + R('mt', 36.4, 22.6, 9.8, 8.6, 1.2) + P('lt', 'M36.4 25.6h9.8M36.4 28.4h9.8M39.6 22.6v8.6M43 22.6v8.6')
    + P('lq-n', 'M39.6 32.2c.7.9.7 1.6 0 2.2-.7-.6-.7-1.3 0-2.2ZM43.4 32.6c.6.8.6 1.4 0 2-.6-.6-.6-1.2 0-2Z')
    + hand(30.2, 26.4, -90, 'grip'),
    hr='#2c2420', sk='#c68a62', job='#B84234')

# 126 food safety: probe thermometer at 165 F
add('probe-thermometer-obj', 'Probe thermometer at 165°F', 'Chef, line cook, food safety',
    P('bx', 'M5.6 34.6c-1.8-6 2.6-12.4 9.6-13.6 5.4-1 9.6 2 11.4 6.6 1.2 3.2 4.4 4.8 7.6 5.6l-1.4 4c-3.6-.4-6.6 1.2-9.6 2.6-7.4 3.4-15.8.8-17.6-5.2Z')
    + P('bx-l', 'M9.4 29c1.6-2.6 4.4-4.2 7.4-4.4') + P('cm', 'M32.6 32.4c1.6-.8 3.4-.8 4.6.2 1.2-.8 3-.4 3.4 1 .4 1.4-.6 2.6-2 2.8.4 1.4-.6 2.6-2 2.6-1.4 0-2.2-1.2-2-2.4l-1.6-.4Z')
    + P('mt', 'M16.8 30.2l9.4-16.4 1.2.7-9.4 16.4Z')
    + G(R('yl', -7.4, -5.4, 14.8, 10.8, 2.6) + R('wh', -5.4, -3.6, 10.8, 6.2, 1)
        + '<text x="0" y="1.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="4.4" fill="#1d2528">165°</text>', 30.4, 9.6, -30), job='#B84234')

# 127 expo: kitchen display screen
add('kds-screen-obj', 'Kitchen display screen', 'Expo, line cook',
    R('bk', 3, 6, 42, 28.4, 2.6) + R('wh-n', 5.6, 8.6, 36.8, 23.2, .6)
    + R('gn-n', 7, 10, 10.4, 3, .6) + R('yl-n', 18.8, 10, 10.4, 3, .6) + R('rd-n', 30.6, 10, 10.4, 3, .6)
    + ''.join(R('st-n', x, y, w, 1.2, .6) for x in (7.6, 19.4, 31.2) for y, w in ((15.6, 8), (18.6, 6), (21.6, 7.4), (24.6, 5)))
    + P('gn-n', 'M8 27.6l1.2 1.2 2.4-2.6.8.8-3.2 3.4-2-2Z')
    + R('bk', 21.4, 34.4, 5.2, 6.4) + R('bk', 13.4, 40.4, 21.2, 3.2, 1.6), job='#176954')

# 128 kitchen manager (person): black chef coat and the checklist
cx, top = 17, 27
add('kitchen-manager-ill', 'Kitchen manager with the checklist', 'Kitchen manager, chef',
    chef_coat(cx, 'bk', btn='mt') + R('mt', cx - 9.6, 33.8, 1.2, 5.4, .6) + O('rd-n', cx - 9, 33.6, .9)
    + head(cx, hair='slick', beard=True)
    + arm((28.5, 32.5), (39.5, 46), (43.4, 37.4), 'bk')
    + G(R('wd', 0, 0, 13.6, 18, 1.2) + R('pd-n', 1.4, 2.8, 10.8, 13.8, .4) + R('mt', 4, -1.2, 5.6, 3, .8)
        + ''.join(P('gn-n', f'M2.4 {g(y)}l1 1 1.8-2 .6.5-2.4 2.6-1.6-1.6Z') + R('st-n', 6, y - .4, 5, 1, .5) for y in (6.4, 10, 13.6)), 27.4, 24.4, -6)
    + hand(41.2, 35.4, 0, 'thumb'),
    hr='#5d6168', sk='#f1cfb4', job='#B84234')

# 129 pastry chef / baker: sheet pan rack
add('speed-rack-obj', 'Speed rack of sheet pans', 'Baker, pastry chef, prep cook',
    R('mt', 9, 3, 2.4, 40, 1.2) + R('mt', 36.6, 3, 2.4, 40, 1.2)
    + ''.join(R('mt', 8, y, 32, 2, .8) for y in (9.6, 18.6, 27.6, 36.6))
    + ''.join(E('bx', x, 7.6, 2.6, 2) for x in (14.4, 20.4, 26.4, 32.4)) + ''.join(E('bx-l', x, 7, 1.2, .6) for x in (14.4, 20.4, 26.4, 32.4))
    + ''.join(O('pk', x, 16.6, 2.2) for x in (14.4, 20.4, 26.4, 32.4)) + ''.join(R('dg', x - 2.4, 23.4, 4.8, 3.2, 1.2) for x in (14.4, 20.4, 26.4, 32.4))
    + R('mt', 8, 42, 32, 2.6, 1.3) + O('bk', 12, 46, 1.8) + O('bk', 36, 46, 1.8), job='#B7791F')

# 130 pastry chef / baker: stand mixer
add('stand-mixer-obj', 'Stand mixer', 'Pastry chef, baker',
    P('rd', 'M28 44V20h9.6v24Z') + P('rd', 'M8 12.6C8 8.4 11.4 5 15.6 5h21.6c3.4 0 6 2.6 6 6v4.6c0 2.4-2 4.4-4.4 4.4H12.4C10 20 8 18 8 15.6Z')
    + P('rd-d', 'M38.6 5.6c2.6.8 4.6 3 4.6 5.8v4.2c0 2.2-1.6 4-3.6 4.4Z') + P('ll', 'M12.6 9c1.2-1.4 3-2.2 5-2.2') + O('mt', 30, 12.4, 2)
    + R('mt', 15, 20, 2.4, 6, 1) + P('mt', 'M8.4 26h15.6l-1.4 11.6c-.2 1.4-1.4 2.4-2.8 2.4h-7.2c-1.4 0-2.6-1-2.8-2.4Z') + E('ln', 16.2, 27.4, 2.2, 3.6)
    + R('rd', 5, 41.4, 36, 4.4, 2.2) + R('mt', 6, 40, 20.4, 2, 1), job='#B7791F')

# 131 drive-thru (person): headset, window, a drink handed out
cx, top = 15, 27
add('drive-thru-ill', 'Drive-thru window, drink handed out', 'Drive-thru, cashier',
    torso(cx, 'ts') + P('ts', f'M{cx-3.4} 27.8l3.4 3.8 3.4-3.8-1-1.2h-4.8Z') + badge(cx - 10, 33.4, 'wh')
    + head(cx, hair='pony', hat='visor', hatc='rd')
    + P('ln', f'M{cx-7} 15.6C{cx-7.6} 6.6 {cx+7.6} 6.6 {cx+7} 15.6') + R('bk', cx - 8.6, 13.2, 3.4, 5.4, 1.4) + P('ln', f'M{cx-6.6} 18.4c.4 3.2 2 4.6 4.4 4.8') + O('bk', cx - 2, 23.2, 1)
    + R('sl', 30, 2, 3.6, 39, 1.2) + R('sl', 28, 39.6, 20, 4, 1.2)
    + arm((25.6, 32.6), (33.6, 37), (38.4, 30.8), 'ts', 'sk')
    + P('wh', 'M35.6 16.4h9.6l-1.4 16c-.1 1-.9 1.6-1.8 1.6h-3.2c-.9 0-1.7-.6-1.8-1.6Z') + R('rd-n', 36.6, 22.6, 7.4, 3.2) + R('wh', 34.8, 14.6, 11.2, 2.4, 1.2) + P('ln', 'M41.6 14.6l1.6-6.4h2.4')
    + hand(38.6, 29.6, -60, 'grip'),
    hr='#6b3e26', sk='#f1cfb4', job='#4478A8')

# 132 bartender: jigger, bar spoon and strainer
add('bar-tools-obj', 'Jigger, bar spoon and strainer', 'Bartender, mixologist',
    G(P('mt', 'M-2.4 0h4.8l3.6-10.4H-6Z') + P('mt', 'M-2.4 0h4.8l3 8.6H-5.4Z') + R('mt', -3.2, -.9, 6.4, 1.8, .9) + P('ll', 'M-4 -8.4l1.6 6.4'), 13.6, 24, -8)
    + G(P('mt', 'M0 0v36') + P('ln', 'M-1.2 6.6l2.4 1.6M-1.2 9.8l2.4 1.6M-1.2 13l2.4 1.6M-1.2 16.2l2.4 1.6M-1.2 19.4l2.4 1.6M-1.2 22.6l2.4 1.6').replace('ln', 'lt')
        + P('ln', 'M0 4v32').replace('ln', 'ln') + E('mt', 0, 38.6, 2.2, 3.2) + O('mt', 0, 2.6, 1.6), 25.4, 5, 4)
    + G(E('mt', 0, 0, 7.4, 7.4) + E('mt-d', 0, 0, 5, 5) + P('ln', 'M-5.6 0a1.4 1.4 0 0 0 2.8 0 1.4 1.4 0 0 1 2.8 0 1.4 1.4 0 0 0 2.8 0 1.4 1.4 0 0 1 2.8 0') + R('mt', 6.6, -1.6, 9, 3.2, 1.6), 33.6, 32, -24), job='#B7791F')

# 133 sommelier / bar manager: wine rack
add('wine-rack-obj', 'Wine rack', 'Sommelier, bar manager',
    R('wd', 5, 5, 38, 38, 2) + R('wd-d', 8, 8, 32, 32, 1)
    + ''.join(O('gl' if (i + j) % 3 else 'mn', 12.4 + 7.8 * i, 12.4 + 7.8 * j, 3.2) + O('bk-n', 12.4 + 7.8 * i, 12.4 + 7.8 * j, 1.2)
              for i in range(4) for j in range(4) if (i, j) not in ((3, 0), (1, 2)))
    + P('lt', 'M8 8l32 32M40 8L8 40'), job='#6E56A8')

# 134 trainer (person): binder and an idea
cx, top = 14, 27
add('trainer-ill', 'Trainer with the training binder', 'Trainer, shift lead',
    torso(cx, 'bz') + P('bz', f'M{cx-3.4} 27.8l3.4 3.8 3.4-3.8-1-1.2h-4.8Z') + badge(cx + 6, 33.4)
    + head(cx, hair='long')
    + arm((25, 32.6), (31.4, 44), (36.4, 37.6), 'bz')
    + G(R('bl', 0, 0, 13, 16.4, 1.6) + R('bl-d', 0, 0, 2.6, 16.4, 1) + R('wh-n', 4.4, 3.6, 6.8, 3, .6) + O('ys-n', 7.8, 10.6, 2), 23.6, 27.6, -4)
    + hand(36.2, 34.6, 0, 'thumb')
    + P('wh', 'M27.4 3.6h15.4c1.4 0 2.6 1.2 2.6 2.6v8.4c0 1.4-1.2 2.6-2.6 2.6h-8.4l-4 3.4v-3.4h-3c-1.4 0-2.6-1.2-2.6-2.6V6.2c0-1.4 1.2-2.6 2.6-2.6Z')
    + P('yl', 'M35 6.4a3.4 3.4 0 0 1 2 6.2v1.2h-4v-1.2a3.4 3.4 0 0 1 2-6.2Z') + R('mt', 33.2, 13.8, 3.6, 1.6, .6),
    hr='#b5793c', sk='#e0ac85', job='#176954')

# 135 kitchen timer
add('kitchen-timer-obj', 'Kitchen timer ringing', 'Line cook, baker, expo',
    R('mt', 21.4, 7, 5.2, 4.6, 1) + O('rd', 24, 27, 16) + P('rd-d', 'M33.4 14.4c4 2.8 6.6 7.4 6.6 12.6 0 6.6-4 12.2-9.8 14.6 3.6-3.4 5.4-8 5.4-13.4 0-5.2-.8-9.6-2.2-13.8Z')
    + O('wh', 24, 27, 11.6) + ''.join(P('lt', f'M{g(24 + 9.2 * c)} {g(27 + 9.2 * s)}L{g(24 + 11 * c)} {g(27 + 11 * s)}') for c, s in ((0, -1), (1, 0), (0, 1), (-1, 0), (.71, -.71), (.71, .71), (-.71, .71), (-.71, -.71)))
    + P('rd-n', 'M24 27V17.6l1 .2L24.8 27Z') + P('ac', 'M24 27l7.2-3.4.4 1-7 3.4Z').replace('ac', 'bk') + O('bk', 24, 27, 1.6)
    + P('ln', 'M8.4 9.6l-3-2.6M39.6 9.6l3-2.6M6 16.6l-3.6-.8M42 16.6l3.6-.8'), job='#B84234')

# 136 ice cream (person): a triple cone
cx, top = 15, 27
add('ice-cream-ill', 'Ice cream scooper with a cone', 'Ice cream, dessert',
    torso(cx, 'wh') + P('pk-n', f'M{cx-12} 32.6h24v2H{cx-12}ZM{cx-14} 37.4h28v2H{cx-14}ZM{cx-14.6} 42.2h29.2v2H{cx-14.6}Z') + crew(cx, 'pk')
    + head(cx, hair='bun', hat='cap', hatc='pk')
    + arm((26, 32.6), (33, 40), (34.2, 31.2), 'wh', 'sk')
    + P('tn', 'M30.2 25.4h8.4l-4.2 12Z') + P('lt', 'M31.4 27.6l4.6 4.2M33.2 26l4.2 4.2M37.6 27.6 33 31.8M35.6 26l-4.2 4.2')
    + O('cm', 31.6, 23.4, 3.4) + O('pk', 37.2, 23.4, 3.4) + O('br', 34.4, 18.4, 3.6) + P('ll', 'M32.2 16.8a2.4 2.4 0 0 1 1.8-1')
    + O('ch', 35, 13.4, 1.6) + P('lt', 'M35.4 11.8c.4-1.6 1.4-2.6 2.6-3') + hand(34.4, 32.6, -90, 'grip'),
    hr='#3a2b22', sk='#f3c9a8', job='#B7791F')

# 137 porter: mop bucket and wet floor sign
add('mop-bucket-obj', 'Mop bucket and wet floor sign', 'Porter, dishwasher',
    R('wd', 15.6, 2.4, 2.6, 30, 1.3) + P('yl', 'M3.6 26h22.4l-1.6 14.4H5.2Z') + P('yl-d', 'M21.4 26.8h4l-1.4 12.8h-3.6Z') + R('bk', 2.4, 24, 24.8, 3.6, 1.6)
    + R('st', 12, 18.6, 9.6, 5.4, 1) + P('lb-n', 'M6.6 28.4h16.4l-.2 2H6.8Z') + O('bk', 7.6, 43.2, 2) + O('bk', 22, 43.2, 2)
    + P('yl', 'M30.6 44.6l6-34.4h1.6l6 34.4Z') + P('yl-d', 'M38.2 10.2h.4l5.6 34.4h-2Z')
    + P('bk', 'M37.4 22.6l3.4 6H34Z') + P('yl-n', 'M37.2 24.6h.4l.2 2.2h-.8Z') + O('yl-n', 37.4, 27.6, .4), job='#3C7A68')

# 138 bar manager (person): checking the stock on the back bar
cx, top = 14, 27
add('bar-manager-ill', 'Bar manager checking the stock', 'Bar manager',
    R('wd', 26, 14.6, 22, 2, .6) + R('wd', 26, 30.6, 22, 2, .6)
    + ''.join(P(c, f'M{g(x)} 14.6v-6.6c0-1 .6-1.8 1.4-2.4V2.6h1.6v3c.8.6 1.4 1.4 1.4 2.4v6.6Z') for x, c in ((33, 'gl'), (37.6, 'wk'), (42.2, 'bb')))
    + ''.join(P(c, f'M{g(x)} 30.6v-6.6c0-1 .6-1.8 1.4-2.4v-3h1.6v3c.8.6 1.4 1.4 1.4 2.4v6.6Z') for x, c in ((37.6, 'mn'), (42.2, 'gl')))
    + torso(cx, 'sh') + jacket(cx, 'pn', depth=11) + head(cx, hair='quiff' if False else 'short', stache='plain')
    + arm((25, 32.6), (32, 37), (31.6, 25.4), 'pn')
    + P('wk', 'M29 33V22.8c0-1.6 1-2.6 2-3.4v-4.6h2.4v4.6c1 .8 2 1.8 2 3.4V33c0 .8-.6 1.4-1.4 1.4h-3.6c-.8 0-1.4-.6-1.4-1.4Z') + P('wk-l', 'M29.6 27h5.2v1h-5.2Z').replace('wk-l', 'll')
    + hand(31.8, 26.4, -90, 'grip'),
    hr='#2c2420', sk='#e0ac85', job='#B7791F')
