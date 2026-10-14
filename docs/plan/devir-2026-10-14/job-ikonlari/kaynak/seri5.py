"""Series round 5/5 (overall round 8), 2026-10-14: restaurant scenarios, a few of them the
moments this app is about (clock in, swap a shift, time off, first day)."""
from kit import *
from seri3 import flame

S5, COL5 = [], {}
def add(slug, name, role, body, job, **col):
    col.update(job=job); col.setdefault('hr', '#000000'); S5.append((slug, name, role, body)); COL5[slug] = col

def ticket(x, y, h, rot=0, hd='st'):
    return G(P('pd', f'M0 0h9v{g(h)}l-1.5-1.2-1.5 1.2-1.5-1.2-1.5 1.2-1.5-1.2L0 {g(h)}Z') + R(f'{hd}-n', 1.4, 2, 6.2, 1.8, .5)
             + ''.join(R('st-n', 1.4, 5 + 2.6 * i, 6.2 - 1.4 * (i % 2), 1, .5) for i in range(int((h - 6) / 2.6))), x, y, rot)

def card(x, y, w, h, c='wh'):
    return R(c, x, y, w, h, 2.4)

# 139 lunch rush: tickets piling up, the clock at noon
add('rush-hour-obj', 'Lunch rush, tickets piling up', 'Expo, line cook, server',
    ticket(4, 12, 24, -14, 'rd') + ticket(13, 8, 28, -4, 'yl') + ticket(22.4, 9.6, 26, 8, 'gn') + ticket(30, 14, 22, 18, 'rd')
    + O('wh', 36.6, 33.4, 9.4) + O('ac-n', 36.6, 33.4, 7.2).replace('ac-n', 'wh') + P('ln', 'M36.6 33.4v-5.4M36.6 33.4l3.6 2') + O('bk', 36.6, 33.4, 1)
    + P('ln', 'M28 22.6l-2.4-1.8M45.2 22.6l2.4-1.8'), '#B84234')

# 140 table set for two
add('table-for-two-obj', 'Table set for two', 'Server, host',
    O('yl-l', 24, 9.6, 3.4) + P('fi', 'M24 12.4c-1.4-1.4-.8-3.4 0-4.8.8 1.4 1.4 3.4 0 4.8Z') + R('cm', 22.6, 12.4, 2.8, 8, .6)
    + P('pd', 'M10.4 13h7.6c.3 4.6-1.4 7.6-3.8 7.8-2.4-.2-4.1-3.2-3.8-7.8Z') + P('mn-n', 'M10.9 16.2h6.6c-.4 2.2-1.6 3.8-3.3 3.8s-2.9-1.6-3.3-3.8Z') + L('ln', (14.2, 20.8), (14.2, 26)) + P('ln', 'M11.6 26.4h5.2')
    + P('pd', 'M30 13h7.6c.3 4.6-1.4 7.6-3.8 7.8-2.4-.2-4.1-3.2-3.8-7.8Z') + P('mn-n', 'M30.5 16.2h6.6c-.4 2.2-1.6 3.8-3.3 3.8s-2.9-1.6-3.3-3.8Z') + L('ln', (33.8, 20.8), (33.8, 26)) + P('ln', 'M31.2 26.4h5.2')
    + P('wh', 'M2.4 27h43.2v4.4c0 .8-.6 1.4-1.4 1.4H3.8c-.8 0-1.4-.6-1.4-1.4Z') + P('wh', 'M4 32.8h40l-2 10.6H6Z') + P('sm-n', 'M38 33.6h5l-1.6 9H37.4Z')
    + E('pd', 15, 26.6, 6.6, 1.2) + E('pd', 33, 26.6, 6.6, 1.2) + P('lt', 'M8.6 32.8v10M39.4 32.8v10').replace('lt', 'ln3'), '#4478A8')

# 141 birthday cake with candles
add('birthday-cake-obj', 'Birthday cake with candles', 'Server, pastry chef',
    ''.join(R(c, x, 9, 2.2, 8, .6) + P('fi', f'M{g(x+1.1)} 8.6c-1.4-1.2-1-3.2 0-4.6 1 1.4 1.4 3.4 0 4.6Z') for x, c in ((15, 'bl'), (22.9, 'pk'), (30.8, 'yl')))
    + P('pk', 'M8 17h32v8H8Z') + P('wh', 'M8 17h32v3.2c-2 2.6-4 2.6-5.4 0-1.4 2.6-3.6 2.6-5.4 0-1.4 2.6-3.6 2.6-5.4 0-1.4 2.6-3.6 2.6-5.4 0-1.4 2.6-3.4 2.6-5.4 0Z')
    + P('dg', 'M5 25h38v13H5Z') + P('pk', 'M5 25h38v3.6c-2.4 2.8-4.6 2.8-6.4 0-1.6 2.8-4.2 2.8-6.4 0-1.6 2.8-4.2 2.8-6.4 0-1.6 2.8-4.2 2.8-6.4 0-1.6 2.8-4 2.8-6.4 0Z')
    + ''.join(O(c, x, 33.6, .8) for x, c in ((11, 'bl-n'), (17, 'yl-n'), (23, 'gn-n'), (29, 'rd-n'), (35, 'bl-n')))
    + E('pd', 24, 39.6, 22, 3.6) + P('ys-n', 'M42 6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6ZM5.6 9.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z'), '#B7791F')

# 142 clock in on the phone
add('clock-in-obj', 'Clock in on the phone', 'Every employee',
    R('bk', 12, 3, 24, 42, 4) + R('wh-n', 14.2, 7.4, 19.6, 33.2, 1.4) + R('bk-n', 20.6, 4.6, 6.8, 1.4, .7)
    + O('wh', 24, 18.4, 7.4) + P('ln', 'M24 18.4v-4.2M24 18.4l3 1.8') + O('bk', 24, 18.4, .9)
    + R('gn', 15, 30, 18, 6, 3) + '<text x="24" y="34.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="2.7" fill="#ffffff">CLOCK IN</text>'
    + R('st-n', 18.4, 38, 11.2, 1, .5), '#176954')

# 143 coffee break
add('coffee-break-obj', 'Coffee break', 'Every employee',
    P('ln3', 'M15 13.6c-1.4-1.4-1.4-2.8 0-4.2s1.4-2.8 0-4.2M22 13.6c-1.4-1.4-1.4-2.8 0-4.2s1.4-2.8 0-4.2')
    + P('ln', 'M29.4 22.4a5.4 5.4 0 0 1 0 10.8h-1.6') + P('rd', 'M7 17.6h22.6v17.2c0 3.2-2.6 5.8-5.8 5.8h-11c-3.2 0-5.8-2.6-5.8-5.8Z') + P('rd-d', 'M25 18.4h4v16.4c0 2.4-1.6 4.4-3.8 5Z')
    + E('br', 18.3, 17.8, 11, 1.8) + R('wh', 12.6, 25, 4, 9, 1) + R('wh', 19.4, 25, 4, 9, 1)
    + O('wh', 38.4, 14.4, 7.4) + P('gn-n', 'M38.4 14.4v-4.6l.9.2-.1 4.4Z').replace('gn-n', 'bk-n') + P('ln', 'M38.4 14.4l3 1.6') + P('ac', 'M33 26.6l10.8 0 .6 2.2H32.4Z').replace('ac', 'wd') + P('pd', 'M32.6 28.8h12.4l-1.6 12.4H34.2Z').replace('pd', 'dg') + P('lf-n', 'M33.6 31.4h10.6v1.4H33.6Z') + P('rd-n', 'M33.8 34h10.2v1.4H33.8Z'), '#3C7A68')

# 144 inventory count
add('inventory-count-obj', 'Inventory count', 'Manager, receiver, kitchen manager',
    R('bx', 22, 26, 22, 18, 1) + R('tn-n', 31.4, 26.4, 3.2, 17.2) + R('bx', 25, 12.4, 16, 13.6, 1) + R('tn-n', 31.6, 12.8, 2.8, 12.8)
    + R('rd', 37, 6, 6, 7, 1) + R('cm-n', 37, 8, 6, 2.6)
    + R('wd', 4, 14, 16.4, 22, 1.4) + R('pd-n', 5.6, 17.2, 13.2, 17.4, .4) + R('mt', 8.6, 12.6, 7.2, 3, .8)
    + P('ln', 'M7.6 20.6v5M9.8 20.6v5M12 20.6v5M14.2 20.6v5M6.6 25l9.2-4M7.6 28.6v4.4M9.8 28.6v4.4').replace('ln', 'lt'), '#176954')

# 145 delivery truck with fresh produce
add('delivery-truck-obj', 'Produce delivery truck', 'Receiver, prep cook',
    R('wh', 2, 12, 28, 22, 1.6) + P('sl-n', 'M27.4 12.8h2v20.4h-2Z') + P('lf', 'M8 22c-1.2-3 1-5.6 4-5.2 1-2.4 4.4-2.6 5.6-.4 2.4-.6 4.4 1.4 3.6 3.8Z')
    + O('rd', 10.6, 21.6, 2) + O('og', 19.4, 21.4, 1.6) + P('gn-n', 'M5 25h20v1.4H5Z')
    + P('gn', 'M30 17h8.4c1 0 1.8.4 2.4 1.2l4.2 6.2c.4.6.6 1.2.6 1.8V34H30Z') + P('lb', 'M33 19.6h5l3.4 5H33Z')
    + R('bk', 2, 33.4, 44, 3, 1) + O('bk', 11, 37.6, 4) + O('mt', 11, 37.6, 1.6) + O('bk', 36.6, 37.6, 4) + O('mt', 36.6, 37.6, 1.6)
    + P('ln', 'M2 42.6h6M12.6 42.6h4'), '#3C7A68')

# 146 handwashing, food safety
add('handwash-obj', 'Handwashing under the tap', 'Every kitchen employee',
    R('mt', 14, 4, 20, 4.4, 2.2) + R('mt', 30, 4, 4, 9.6, 2) + R('mt', 29.6, 13, 4.8, 2.4, .8) + P('lb-n', 'M31 16h2.2v6.4H31Z')
    + P('sk', 'M8.4 33.4c.2-4.6 3.6-8.6 8.4-9.6l9.8-2c1.4-.3 2.4.8 2 2.1-.3 1-1.2 1.6-2.2 1.8l-4.6 1 9.6.6c1.4.1 2.4 1.2 2.2 2.6-.2 1.2-1.2 2-2.4 2l-2.6-.2c1.2.4 1.8 1.6 1.4 2.8-.4 1-1.4 1.6-2.4 1.4 1 .6 1.4 1.8.8 2.8-.4.8-1.4 1.2-2.2 1H16.6c-4.6 0-8.4-3.4-8.2-6.2Z')
    + P('sk-d', 'M18 36.6c3.4.6 6.4.6 9.6.2') + O('bb', 34.6, 26.8, 2) + O('bb', 39.4, 31.2, 2.8) + O('bb', 36.4, 36.4, 1.6) + O('bb', 12, 21.4, 1.6) + O('bb', 41.6, 22.4, 1.2)
    + P('ll', 'M38.4 30.2a1.4 1.4 0 0 1 1.2-.6').replace('ll', 'lt') + R('mt', 6, 43, 36, 3, 1.5), '#3C7A68')

# 147 cash drawer at close
add('cash-drawer-obj', 'Cash drawer count', 'Cashier, manager',
    R('bk', 3, 20, 42, 6, 1.6) + P('mt', 'M3 26h42l-2 14.6c-.2 1.2-1.2 2-2.4 2H7.4c-1.2 0-2.2-.8-2.4-2Z') + P('mt-d', 'M5.4 32h37.2v1.2H5.4Z')
    + ''.join(R('gn', x, 9.6, 7, 12, .8) + O('gn-d', x + 3.5, 15.6, 1.8) for x in (7, 15.6, 24.2))
    + ''.join(O('gd', x, 18.6, 2.6) + P('gd-d', f'M{g(x-1.4)} 18.6h2.8') for x in (36.6,)) + O('gd', 38.6, 15, 2.6) + O('mt', 40.6, 19.6, 2.2)
    + R('bk-n', 20, 36, 8, 2, 1), '#4478A8')

# 148 today's specials on the chalkboard
add('specials-board-obj', "Today's specials board", 'Server, chef, host',
    P('wd', 'M8 46L15 4h18l7 42h-3.4L31 9.4H17L11.4 46Z') + R('wd', 9.6, 6.4, 28.8, 30, 2) + R('hd', 12.2, 9, 23.6, 24.8, 1)
    + '<text x="24" y="15" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="4" fill="#ffffff">Specials</text>'
    + P('ll', 'M15.6 19.6h10.4M15.6 23.6h12.8M15.6 27.6h8.6') + O('yl-n', 31.4, 19.6, .9) + O('yl-n', 32.4, 23.6, .9) + O('yl-n', 30.4, 27.6, .9)
    + P('rd-n', 'M14 34h20v1.4H14Z').replace('rd-n', 'wd-d'), '#4478A8')

# 149 pre-shift huddle
add('team-huddle-obj', 'Pre-shift huddle', 'Shift lead, manager, team',
    P('wh', 'M13.2 2.6h21.6c1.4 0 2.4 1 2.4 2.4v7c0 1.4-1 2.4-2.4 2.4H27l-3 3.2-3-3.2h-7.8c-1.4 0-2.4-1-2.4-2.4V5c0-1.4 1-2.4 2.4-2.4Z')
    + P('gn-n', 'M18.8 8.6l2.4 2.4 5.4-5.6 1.4 1.4-6.8 7-3.8-3.8Z')
    + G(torso(0, 'ts', 27, False) + head(0, 16, hair='short'), 8.6, 20, 0, .58)
    + G((torso(0, 'bz', 27, False) + head(0, 16, hair='pony')).replace('class="sk', 'class="s2').replace('class="hr', 'class="h2'), 39.4, 20, 0, .58)
    + G((torso(0, 'ac', 27, False) + head(0, 16, hair='curly')).replace('class="sk', 'class="s3').replace('class="hr', 'class="h3'), 24, 24, 0, .62), '#176954', hr='#3a2b22')

# 150 reservation call
add('reservation-call-obj', 'Reservation call', 'Host, hostess',
    P('bk', 'M6 18.4c0-4.6 7.6-8 18-8s18 3.4 18 8c0 1.8-1.4 3-3.2 2.6l-4.2-.8c-1.4-.3-2.2-1.4-2.2-2.8v-1.4c-2.4-.8-5.4-1.2-8.4-1.2s-6 .4-8.4 1.2v1.4c0 1.4-.8 2.5-2.2 2.8l-4.2.8C7.4 21.4 6 20.2 6 18.4Z')
    + P('bk', 'M11.4 24.6c.4-1.8 1.8-3 3.6-3h18c1.8 0 3.2 1.2 3.6 3l3 14.4c.4 1.8-1 3.4-2.8 3.4H11.2c-1.8 0-3.2-1.6-2.8-3.4Z')
    + O('wh', 24, 32, 5.6) + ''.join(O('bk-n', 24 + 3.4 * c, 32 + 3.4 * s, .7) for c, s in ((0, -1), (.87, -.5), (.87, .5), (0, 1), (-.87, .5), (-.87, -.5)))
    + P('ln', 'M4.6 6.8c-1.4 1.6-1.4 3.4 0 5M43.4 6.8c1.4 1.6 1.4 3.4 0 5M8 3.8c-.8.8-1 1.6-.8 2.6M40 3.8c.8.8 1 1.6.8 2.6').replace('ln', 'ln'), '#6E56A8')

# 151 the storefront, open
add('storefront-obj', 'Restaurant storefront, open', 'Owner, general manager, host',
    R('cm', 4, 14, 40, 32, 1) + P('rd', 'M2 6h44l-2 10H4Z') + P('wh-n', 'M9.4 6h5.8l-.8 10H8.6ZM21 6h6l-.2 10h-5.6ZM32.8 6h5.8l.8 10h-5.8Z')
    + ''.join(P('rd', f'M{g(x)} 16a2.75 2.75 0 0 0 5.5 0Z') for x in (4, 9.5, 15, 20.5, 26, 31.5, 37, 42.5)).replace('42.5 16a2.75 2.75 0 0 0 5.5 0Z', '42.5 16a1.75 2.75 0 0 0 1.5 0Z')
    + R('lb', 7.4, 23, 14, 12, 1) + P('ll', 'M9.4 25.6l4-2.6M9.4 30l7.6-5')
    + R('wd', 26, 23, 14, 23, 1) + R('lb', 28.6, 25.6, 8.8, 8.6, .8) + O('gd', 37.4, 36.6, 1)
    + R('gn', 28.8, 27.8, 8.4, 4.6, .8) + '<text x="33" y="31.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="2.9" fill="#ffffff">OPEN</text>'
    + R('wd', 6, 36.6, 17, 2.2, .8) + R('mt', 2, 45.4, 44, 2, 1), '#111827')

# 152 closing time: sign turned to closed, keys
add('closing-time-obj', 'Closing time, keys and the closed sign', 'Manager, shift lead, owner',
    P('yl', 'M41 4.6a6.4 6.4 0 1 0 2.8 11.6 5.4 5.4 0 1 1-2.8-11.6Z')
    + P('ln', 'M19.4 6.4l-7.4 7.6M19.4 6.4l7.4 7.6') + O('gd', 19.4, 6.2, 1.1)
    + R('ac', 6.6, 13.6, 25.6, 12.4, 1.8) + R('ac-d', 8.2, 15.2, 22.4, 9.2, 1)
    + '<text x="19.4" y="22.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="5" fill="#ffffff">CLOSED</text>'
    + P('ln', 'M30.6 30.4a3 3 0 1 1 0 6a3 3 0 0 1 0-6')
    + G(O('gd', 0, 0, 3.4) + O('bg-n', 0, 0, 1.2).replace('bg-n', 'pd') + R('gd', 3, -1.1, 9.6, 2.2, .6) + P('gd', 'M8.4 1.1v2.6h1.4V1.1M10.6 1.1v1.8h1.4V1.1'), 33.2, 37.2, 18)
    + G(O('mt', 0, 0, 3.2) + O('pd', 0, 0, 1.1) + R('mt', 2.8, -1, 8.8, 2, .6) + P('mt', 'M7.6 1v2.4h1.4V1M9.8 1v1.6h1.4V1'), 28.8, 38.8, 120)
    + R('bk', 4, 44, 40, 2.4, 1.2), '#111827')

# 153 tip jar
add('tip-jar-obj', 'Tip jar', 'Server, bartender, barista',
    R('gn', 15.4, 9.4, 7.4, 12, .8) + O('gn-d', 19.1, 15.4, 1.8) + G(R('gn', 0, 0, 7.4, 12, .8) + O('gn-d', 3.7, 6, 1.8), 25, 8.6, 18)
    + P('bb', 'M11 15.4h26v25c0 2.4-2 4.4-4.4 4.4H15.4c-2.4 0-4.4-2-4.4-4.4Z') + R('bb', 9.6, 13, 28.8, 3.6, 1.6)
    + O('gd', 17.6, 39.4, 3) + O('gd', 24.4, 40.4, 3) + O('gd', 30.4, 38.8, 3) + O('gd', 21, 34.6, 3) + O('gd', 27.6, 34, 3)
    + R('wh', 13.6, 22.4, 20.8, 8.4, 1.4) + P('ac-n', 'M24 29.4l-2.8-2.8a1.6 1.6 0 0 1 2.8-1.8 1.6 1.6 0 0 1 2.8 1.8Z') + P('ll', 'M14 19v20.4'), '#B7791F')

# 154 the pass: plates under the heat lamps
add('pass-window-obj', 'Order up at the pass', 'Expo, food runner',
    P('ln', 'M14 2v6M34 2v6') + P('mt', 'M7 13.6c0-3.6 3.2-6 7-6s7 2.4 7 6Z') + P('mt', 'M27 13.6c0-3.6 3.2-6 7-6s7 2.4 7 6Z')
    + P('og-l', 'M8 14.4h12l3 12H5Z').replace('og-l', 'yl-l') + P('og-l', 'M28 14.4h12l3 12H25Z').replace('og-l', 'yl-l')
    + E('pd', 14, 29, 8.4, 2.2) + P('fd', 'M9.4 28.4c.8-2.6 3-3.6 4.6-3.6s3.8 1 4.6 3.6Z') + O('lf-n', 12.4, 26.6, .6) + O('rd-n', 15, 26.2, .6)
    + E('pd', 34, 29, 8.4, 2.2) + P('br', 'M29.6 28.4c0-2.2 2-3.4 4.4-3.4s4.4 1.2 4.4 3.4Z') + P('lf', 'M36 25.6c.6-1.2 1.8-1.6 2.6-1.2-.4 1-1.4 1.6-2.6 1.2Z')
    + R('mt', 2, 31.2, 44, 3.4, 1.4) + P('mt-d', 'M2.6 33.2h42.8v1H2.6Z') + ticket(21, 34.6, 11, 0, 'gn'), '#176954')

# 155 food truck
add('food-truck-obj', 'Food truck', 'Cook, cashier, owner',
    R('yl', 2, 10, 38, 26, 2) + P('yl', 'M40 18h3.4c1 0 1.8.6 2.2 1.4l1.4 3.6c.2.4.2.8.2 1.2V36h-7.2Z') + P('lb', 'M40.8 20.2h2.4l1.6 4H40.8Z')
    + R('bk', 7, 15, 22, 11, 1) + P('rd', 'M5 12.6h26v3.2H5Z') + P('wh-n', 'M8.6 12.6h3v3.2h-3ZM16.6 12.6h3v3.2h-3ZM24.6 12.6h3v3.2h-3Z')
    + P('og', 'M11 26c.4-2.4 2.4-3.6 4.4-3.6s4 1.2 4.4 3.6Z') + R('mt', 5.6, 26, 24.8, 2.4, 1)
    + R('bk', 2, 35, 45, 3, 1) + O('bk', 10, 39, 4) + O('mt', 10, 39, 1.6) + O('bk', 37.6, 39, 4) + O('mt', 37.6, 39, 1.6)
    + R('rd', 31.6, 12.4, 6, 10, 1) + R('wh-n', 32.6, 14, 4, 1, .5) + R('wh-n', 32.6, 16.4, 4, 1, .5), '#B84234')

# 156 swap a shift
add('shift-swap-obj', 'Swap a shift', 'Every employee',
    card(3, 6, 24, 15.6) + R('bl', 3, 6, 24, 4.6, 2.4) + R('bl-n', 3, 8.6, 24, 2) + R('st-n', 6.4, 13.6, 10, 1.4, .7) + R('bl-n', 6.4, 16.6, 16.4, 2.4, 1.2)
    + card(21, 26.4, 24, 15.6) + R('og', 21, 26.4, 24, 4.6, 2.4) + R('og-n', 21, 29, 24, 2) + R('st-n', 24.4, 34, 10, 1.4, .7) + R('og-n', 24.4, 37, 16.4, 2.4, 1.2)
    + P('ln', 'M33.6 9.6c4.2 0 7.2 3 7.2 7.6v4.6M38 18.8l2.8 3 2.8-3M14.4 38.2c-4.2 0-7.2-3-7.2-7.6V26M4.4 29l2.8-3 2.8 3'), '#4478A8')

# 157 time off: calendar and the sun
add('time-off-obj', 'Time off', 'Every employee',
    R('wh', 4, 10, 30, 30, 2.6) + P('rd', 'M4 18V12.6c0-1.4 1.2-2.6 2.6-2.6h24.8c1.4 0 2.6 1.2 2.6 2.6V18Z') + R('mt', 10, 6.4, 2.4, 6, 1.2) + R('mt', 25.6, 6.4, 2.4, 6, 1.2)
    + ''.join(R('st-n', 7.6 + 5.6 * c, 21.4 + 5.2 * r, 3.4, 2.6, .6) for r in range(3) for c in range(4) if (r, c) not in ((1, 1), (1, 2)))
    + R('gn-n', 13.2, 26.6, 9, 2.6, 1.3)
    + O('yl', 37.4, 34.2, 5.4) + P('ln', 'M37.4 25.8v-2.4M37.4 45v-2.4M29 34.2h-2.4M48.2 34.2h-2.4M31.4 28.2l-1.6-1.6M43.4 28.2l1.6-1.6M31.4 40.2l-1.6 1.6M43.4 40.2l1.6 1.6').replace('ln', 'ln'), '#3C7A68')

# 158 first day: hello my name is
add('hello-name-tag-obj', 'First day, name tag', 'New hire, trainer',
    R('rd', 4, 9, 40, 30, 4) + R('wh', 7, 20.6, 34, 15, 1.4)
    + '<text x="24" y="15.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="5.2" fill="#ffffff">HELLO</text>'
    + '<text x="24" y="19.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="2.6" fill="#ffffff">my name is</text>'
    + P('ln', 'M11.4 29.6c1.6-3.4 3-4.6 4-3.2 1 1.4-1.8 4-.6 4.6 1.2.6 2.6-3 3.6-2.6 1 .4-.4 2.6.6 2.8 1.2.2 2.4-2.6 3.6-2.2 1 .4 0 2.2 1 2.4 1.4.2 3-2 4.4-1.4 1.2.6.2 2 1.4 2.2l2.6-.2')
    + P('ys-n', 'M42 3l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7ZM6 40.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z'), '#176954')
