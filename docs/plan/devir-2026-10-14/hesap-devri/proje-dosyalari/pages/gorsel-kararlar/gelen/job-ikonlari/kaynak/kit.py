"""Figure kit for the 100-drawing series, from series round 2 (2026-10-14).

Mert asked for better craftsmanship: real proportions, elbows and hands instead of
tubes and dots, a clearly visible tie, readable props. 48x48 grid, light from the
top left. Class grammar, painted by render():
  X      fill X + dark outline          X-d  shadow: darker X, no outline
  X-l    highlight: lighter X, no line  X-n  fill X, no outline
  s-X    upper arm sleeve (stroke X)    t-X  forearm (stroke X, thinner)
  ao7    upper arm outline              ao6  forearm outline
  ln     detail line                    lt   thin detail line
  ll     white highlight line           ln2  dots, ln3 pleats, lg gold, lw wine
Colours come from the character first (COLORS[slug]), then from RK."""
import re

INK = '#1d2528'
RK = dict(sk='#f3c9a8', sh='#e8eef3', vs='#4b555b', ac='#c8323c', mt='#d9dfe4', gl='#5d8f6b', fd='#f2b65a', pd='#ffffff', wd='#b9855a',
  pt='#a9b4bc', nv='#2f4163', wh='#ffffff', bz='#3f6f66', mn='#7a2e3a', gd='#e0b04a', ts='#5b7fa6', ts2='#5f8f6e', bn='#4a5d6e', bx='#c99a62',
  jk='#e8a33d', pn='#3b4248', fi='#f28c28', fy='#ffd25a', cr='#ef8a2c', lf='#6aa84f', hd='#2f3437', ap='#9fb8c8', sp='#f4c430', bb='#dff1fb',
  pk='#f4a6b8', dg='#f3dfb2', br='#7a4a2e', ys='#f4c430',
  bk='#2b3135', gy='#8a949b', ol='#8db14a', og='#f08a24', ic='#e3f3fb', lq='#e9b44c', rd='#d8453b', bl='#3d6fb6', cm='#f7efe2',
  sl='#c7ced3', st='#9aa5ad', rs='#e86a6a', fs='#f1d9c6', tn='#d8b07a', yl='#f2c94c', pu='#6e56a8', tl='#2f8f83', lb='#9ec9e8',
  bg='#c9a27a', kr='#b23a48', sm='#e9e4dc', ch='#b8202c', gn='#4f9a5b', cb='#8c5a3c', wk='#d4892a',
  s2='#c68a62', s3='#8d5a3c', h2='#b5793c', h3='#1f1a17')

def _hex(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
def shade(c, f=.82): return '#%02x%02x%02x' % tuple(round(v * f) for v in _hex(c))
def tint(c, f=.45): return '#%02x%02x%02x' % tuple(round(v + (255 - v) * f) for v in _hex(c))

def render(body, col, mode='renkli'):
    def colour(k):
        if k == 'hr': return col['hr']
        if k == 'sk': return col.get('sk', RK['sk'])
        return col.get(k, RK[k])
    def sub(m):
        c = m.group(1); ink = 'currentColor' if mode == 'cizgi' else INK
        if c in ('ln', 'ln2'): return f'fill="none" stroke="{ink}" stroke-width="{2 if c == "ln2" else 1.6}"'
        if c == 'lt': return f'fill="none" stroke="{ink}" stroke-width="1.1"'
        if c == 'll': return 'fill="none" stroke="#ffffff" stroke-width="1.1" stroke-opacity=".9"'
        if c == 'ln3': return f'fill="none" stroke="{ink if mode == "cizgi" else "#c3ccd2"}" stroke-width="1.4"'
        if c == 'lg': return f'fill="none" stroke="{RK["gd"]}" stroke-width="1.4"'
        if c == 'lw': return f'fill="none" stroke="{RK["mn"]}" stroke-width="1.6"'
        if c == 'ao': return f'fill="none" stroke="{ink}" stroke-width="6.4"'
        if c == 'ao7': return f'fill="none" stroke="{ink}" stroke-width="7"'
        if c == 'ao6': return f'fill="none" stroke="{ink}" stroke-width="6.2"'
        if c == 'aw': return f'fill="none" stroke="{col.get("arm", "#ffffff")}" stroke-width="3.2"'
        if c.startswith('s-'): return f'fill="none" stroke="{colour(c[2:])}" stroke-width="3.8"'
        if c.startswith('t-'): return f'fill="none" stroke="{colour(c[2:])}" stroke-width="3"'
        if mode == 'cizgi':
            return 'fill="none" stroke="none"' if c[-2:] in ('-d', '-l', '-n') else f'fill="#ffffff" stroke="{ink}" stroke-width="1.6"'
        if c.endswith('-d'): return f'fill="{shade(colour(c[:-2]))}"'
        if c.endswith('-l'): return f'fill="{tint(colour(c[:-2]))}"'
        if c.endswith('-n'): return f'fill="{colour(c[:-2])}"'
        return f'fill="{colour(c)}" stroke="{ink}" stroke-width="1.6"'
    return re.sub(r'class="([\w-]+)"', sub, body)

# ---------- primitives ----------
def g(v): return format(round(v, 2), 'g')
def P(c, d): return f'<path class="{c}" d="{d}"/>'
def R(c, x, y, w, h, r=0): return f'<rect class="{c}" x="{g(x)}" y="{g(y)}" width="{g(w)}" height="{g(h)}" rx="{g(r)}"/>'
def O(c, x, y, r): return f'<circle class="{c}" cx="{g(x)}" cy="{g(y)}" r="{g(r)}"/>'
def E(c, x, y, rx, ry, rot=0):
    t = f' transform="rotate({g(rot)} {g(x)} {g(y)})"' if rot else ''
    return f'<ellipse class="{c}" cx="{g(x)}" cy="{g(y)}" rx="{g(rx)}" ry="{g(ry)}"{t}/>'
def L(c, *pts):
    return P(c, 'M' + ' '.join(f'{g(x)} {g(y)}' for x, y in pts))
def G(inner, x=0, y=0, rot=0, s=1):
    t = f'translate({g(x)} {g(y)})' + (f' rotate({g(rot)})' if rot else '') + (f' scale({g(s)})' if s != 1 else '')
    return f'<g transform="{t}">{inner}</g>'

# ---------- head ----------
def head(cx, cy=16, hair='short', hat=None, hatc='wh', stache=None, beard=False, earring=False):
    """Faceless head: face centre (cx, cy), crown at cy-7.4, chin at cy+7.2, neck base at cy+11."""
    o = []
    if hair == 'long':
        o.append(P('hr', f'M{g(cx-7)} {g(cy+12)}C{g(cx-9.4)} {g(cy+1)} {g(cx-6.6)} {g(cy-8.6)} {g(cx)} {g(cy-8.6)}S{g(cx+9.4)} {g(cy+1)} {g(cx+7)} {g(cy+12)}c-2 .9-4.4 1-6-.4h-2c-1.6 1.4-4 1.3-6 .4Z'))
    if hair == 'pony':
        o.append(P('hr', f'M{g(cx+3.4)} {g(cy-6.4)}c5.4-1 8.2 2.6 7.4 7.6-.4 2.8-1.6 5-1.2 8-3-1.4-4.4-4.2-4-7.6Z'))
    if hair == 'bun':
        o.append(O('hr', cx + .6, cy - 9.2, 3.1))
    # neck with the chin shadow
    o.append(P('sk', f'M{g(cx-2.7)} {g(cy+4)}V{g(cy+11.6)}h5.4V{g(cy+4)}Z'))
    o.append(P('sk-d', f'M{g(cx-2)} {g(cy+6.4)}c1.3 1.2 2.7 1.2 4 0v1.9c-1.3.9-2.7.9-4 0Z'))
    o.append(E('sk', cx - 5.9, cy + .8, 1.4, 2.1) + E('sk', cx + 5.9, cy + .8, 1.4, 2.1))
    o.append(P('sk', f'M{g(cx-6)} {g(cy-1)}C{g(cx-6)} {g(cy-5)} {g(cx-3.4)} {g(cy-7.4)} {g(cx)} {g(cy-7.4)}S{g(cx+6)} {g(cy-5)} {g(cx+6)} {g(cy-1)}v1.6C{g(cx+6)} {g(cy+4.4)} {g(cx+3.2)} {g(cy+7.2)} {g(cx)} {g(cy+7.2)}S{g(cx-6)} {g(cy+4.4)} {g(cx-6)} {g(cy+.6)}Z'))
    o.append(P('sk-d', f'M{g(cx+5.2)} {g(cy+3)}c-.9 2.4-2.8 3.9-5.2 4v-.1c2.6-.6 4.2-2.2 5.2-3.9Z'))
    if earring:
        o.append(O('gd', cx - 6.2, cy + 3.2, .8))
    if beard:
        o.append(P('hr', f'M{g(cx-6)} {g(cy+.4)}C{g(cx-6)} {g(cy+5.8)} {g(cx-3.2)} {g(cy+8.8)} {g(cx)} {g(cy+8.8)}S{g(cx+6)} {g(cy+5.8)} {g(cx+6)} {g(cy+.4)}C{g(cx+4.8)} {g(cy+3.4)} {g(cx+2.6)} {g(cy+4.4)} {g(cx)} {g(cy+4.4)}S{g(cx-4.8)} {g(cy+3.4)} {g(cx-6)} {g(cy+.4)}Z'))
    if stache == 'handlebar':
        y = cy + 3.2
        o.append(P('hr', f'M{g(cx)} {g(y)}c-1.3-1.1-3.3-1.2-4.5.1-.6.6-1.4.7-1.9.2-.5-.5-.3-1.3.3-1.5-1.3-.5-2.5.8-2 2.2.6 1.7 3 2.2 4.6 1.1l3.5-1.4 3.5 1.4c1.6 1.1 4 .6 4.6-1.1.5-1.4-.7-2.7-2-2.2.6.2.8 1 .3 1.5-.5.5-1.3.4-1.9-.2-1.2-1.3-3.2-1.2-4.5-.1Z'))
    elif stache == 'plain':
        o.append(P('hr', f'M{g(cx-3.4)} {g(cy+3.6)}c1.2-1.4 2.4-1.6 3.4-.8 1-.8 2.2-.6 3.4.8-2.2.8-4.6.8-6.8 0Z'))
    # front hair
    if hair in ('short', 'long'):
        bot = cy + (4.4 if hair == 'long' else 0)
        o.append(P('hr', f'M{g(cx-6.4)} {g(bot)}C{g(cx-7.4)} {g(cy-5.6)} {g(cx-4)} {g(cy-8.8)} {g(cx)} {g(cy-8.8)}S{g(cx+7.4)} {g(cy-5.6)} {g(cx+6.4)} {g(bot)}'
                       f'C{g(cx+5.9)} {g(cy-1.8)} {g(cx+4.6)} {g(cy-3.8)} {g(cx+2.8)} {g(cy-4.8)}C{g(cx+.6)} {g(cy-2.4)} {g(cx-3)} {g(cy-1.2)} {g(cx-5.6)} {g(cy-1)}C{g(cx-5.9)} {g(cy+1)} {g(cx-6.1)} {g(bot-1.4)} {g(cx-6.4)} {g(bot)}Z'))
        o.append(P('hr-l', f'M{g(cx-2.6)} {g(cy-7.2)}c1.6-.7 3.6-.6 5 .3-.6.5-1.2.9-1.8 1.2-1-.5-2.1-.8-3.2-1.5Z'))
    elif hair in ('slick', 'bun', 'pony'):
        o.append(P('hr', f'M{g(cx-6.3)} {g(cy+.2)}C{g(cx-7)} {g(cy-5.6)} {g(cx-3.8)} {g(cy-8.6)} {g(cx)} {g(cy-8.6)}S{g(cx+7)} {g(cy-5.6)} {g(cx+6.3)} {g(cy+.2)}C{g(cx+5.8)} {g(cy-2.4)} {g(cx+4.6)} {g(cy-4)} {g(cx+2.6)} {g(cy-4.4)}H{g(cx-2.6)}C{g(cx-4.6)} {g(cy-4)} {g(cx-5.8)} {g(cy-2.4)} {g(cx-6.3)} {g(cy+.2)}Z'))
        o.append(P('lt', f'M{g(cx-1.6)} {g(cy-8.4)}c-.5 1.2-.6 2.6-.4 4'))
        o.append(P('hr-l', f'M{g(cx+.6)} {g(cy-7.6)}c1.4-.2 2.8.3 3.8 1.2-.6.3-1.2.5-1.8.5-.6-.7-1.3-1.2-2-1.7Z'))
    elif hair == 'curly':
        pts = [(-6.4, .4), (-6.9, -3.6), (-5.1, -7.4), (-1.8, -9.5), (1.8, -9.5), (5.1, -7.4), (6.9, -3.6), (6.4, .4)]
        d = f'M{g(cx+pts[0][0])} {g(cy+pts[0][1])}'
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            d += f'A2.3 2.3 0 0 1 {g(cx+x1)} {g(cy+y1)}'
        d += f'C{g(cx+5.6)} {g(cy-3)} {g(cx+3.4)} {g(cy-4.6)} {g(cx)} {g(cy-4.6)}S{g(cx-5.6)} {g(cy-3)} {g(cx-6.4)} {g(cy+.4)}Z'
        o.append(P('hr', d))
    elif hair == 'buzz':
        o.append(P('hr', f'M{g(cx-6.1)} {g(cy-1)}C{g(cx-6.3)} {g(cy-6.4)} {g(cx-3.4)} {g(cy-8.2)} {g(cx)} {g(cy-8.2)}S{g(cx+6.3)} {g(cy-6.4)} {g(cx+6.1)} {g(cy-1)}C{g(cx+5)} {g(cy-4)} {g(cx+3)} {g(cy-5.2)} {g(cx)} {g(cy-5.2)}S{g(cx-5)} {g(cy-4)} {g(cx-6.1)} {g(cy-1)}Z'))
    # hats
    if hat == 'toque':
        o.append(P(hatc, f'M{g(cx-6.4)} {g(cy-7.6)}c-3.4-.4-4.2-4.8-1.2-6.2.4-3.8 4.6-5 6.6-2.8 2-2.6 6.2-2.2 7.2.8 3-.8 5.4 2.2 3.4 5 1.4 1.8.2 3.6-1.6 3.2Z'))
        o.append(P('ln3', f'M{g(cx-2.6)} {g(cy-7.6)}l-.6-3.6M{g(cx+.6)} {g(cy-7.6)}v-4M{g(cx+3.6)} {g(cy-7.6)}l.6-3.4'))
        o.append(R(hatc, cx - 6.7, cy - 8.4, 13.4, 4, 1.2))
    elif hat == 'skull':
        o.append(P(hatc, f'M{g(cx-6.7)} {g(cy-2.4)}C{g(cx-7.1)} {g(cy-7.8)} {g(cx-3.8)} {g(cy-10)} {g(cx)} {g(cy-10)}S{g(cx+7.1)} {g(cy-7.8)} {g(cx+6.7)} {g(cy-2.4)}Z'))
        o.append(R(hatc, cx - 7, cy - 4, 14, 2.8, 1.3))
    elif hat == 'cap':
        o.append(P(hatc, f'M{g(cx-6.6)} {g(cy-2.6)}C{g(cx-6.9)} {g(cy-8)} {g(cx-3.7)} {g(cy-10.3)} {g(cx)} {g(cy-10.3)}S{g(cx+6.9)} {g(cy-8)} {g(cx+6.6)} {g(cy-2.6)}Z'))
        o.append(P(f'{hatc}-d', f'M{g(cx+2.4)} {g(cy-9.8)}c2.6 1 4.2 3.6 4.2 7.2h-2.6c0-3-.6-5.4-1.6-7.2Z'))
        o.append(P(hatc, f'M{g(cx-8)} {g(cy-2.8)}c4.8-1.4 11.2-1.4 16 0 .3 1.6-.6 2.6-2 2.4-4-.7-8-.7-12 0-1.4.2-2.3-.8-2-2.4Z'))
        o.append(O(hatc, cx, cy - 10.3, .9))
    elif hat == 'band':
        o.append(R(hatc, cx - 6.8, cy - 4.6, 13.6, 2.8, 1.2))
        o.append(P(hatc, f'M{g(cx+6.2)} {g(cy-3.8)}l3.6-1.6.2 2.6Z'))
    elif hat == 'visor':
        o.append(R(hatc, cx - 6.7, cy - 5.6, 13.4, 3, 1.3))
        o.append(P(hatc, f'M{g(cx-7.6)} {g(cy-3)}c5-1.4 10.2-1.4 15.2 0 .2 1.5-.6 2.4-1.9 2.2-3.8-.7-7.6-.7-11.4 0-1.3.2-2.1-.7-1.9-2.2Z'))
    elif hat == 'beanie':
        o.append(P(hatc, f'M{g(cx-6.8)} {g(cy-3.6)}C{g(cx-7)} {g(cy-8.8)} {g(cx-3.8)} {g(cy-11)} {g(cx)} {g(cy-11)}S{g(cx+7)} {g(cy-8.8)} {g(cx+6.8)} {g(cy-3.6)}Z'))
        o.append(R(hatc, cx - 7.2, cy - 4.6, 14.4, 3.8, 1.4))
    return ''.join(o)

# ---------- body ----------
def torso(cx, c='sh', top=27, shadow=True):
    """Shoulders and chest down past the frame; neck opening at top."""
    o = P(c, f'M{g(cx-15)} 49V{g(top+11.5)}C{g(cx-15)} {g(top+6.4)} {g(cx-11.8)} {g(top+3.2)} {g(cx-7.4)} {g(top+2.1)}L{g(cx-3)} {g(top+1)}h6l4.4 1.1C{g(cx+11.8)} {g(top+3.2)} {g(cx+15)} {g(top+6.4)} {g(cx+15)} {g(top+11.5)}V49Z')
    if shadow:
        o += P(f'{c}-d', f'M{g(cx+14.2)} 49V{g(top+11.5)}c0-3.6-1.6-6.2-4.4-7.8 1.4 2.8 2 5.6 2 8.6V49Z')
    return o

def vneck(cx, c='sk', top=27, depth=5):
    """Open collar showing skin (or a shirt) under a jacket or polo."""
    return P(c, f'M{g(cx-3)} {g(top+1)}L{g(cx)} {g(top+1+depth)}L{g(cx+3)} {g(top+1)}Z')

def crew(cx, c, top=27):
    return P(c, f'M{g(cx-3.6)} {g(top+.6)}c.8 2.8 6.4 2.8 7.2 0l1.1.3c-1 4-8.4 4-9.4 0Z')

def shirt_collar(cx, c='sh', top=27):
    return (P(c, f'M{g(cx-3.2)} {g(top+.4)}L{g(cx-4.6)} {g(top+3.6)}L{g(cx-.2)} {g(top+4.6)}Z')
            + P(c, f'M{g(cx+3.2)} {g(top+.4)}L{g(cx+4.6)} {g(top+3.6)}L{g(cx+.2)} {g(top+4.6)}Z'))

def necktie(cx, c='ac', top=27, length=13):
    y = top + 3.4
    return (P(c, f'M{g(cx-1.9)} {g(y)}h3.8l-.8 2.8h-2.2Z')
            + P(c, f'M{g(cx-1.2)} {g(y+2.8)}h2.4l1.8 {g(length-5)}-3 3.2-3-3.2Z')
            + P(f'{c}-d', f'M{g(cx-.9)} {g(y+5.6)}l2.2 2.2v1.6l-2.6-2.6ZM{g(cx-1.6)} {g(y+9.6)}l3.4 3.4-.5.6-3.1-3.1Z'))

def bowtie(cx, y, c='ac'):
    return (P(c, f'M{g(cx)} {g(y)}L{g(cx-4.8)} {g(y-2.8)}c-.7 1.9-.7 3.7 0 5.6Z')
            + P(c, f'M{g(cx)} {g(y)}l4.8-2.8c.7 1.9.7 3.7 0 5.6Z')
            + R(c, cx - 1.3, y - 1.5, 2.6, 3, 1))

def vest(cx, c='vs', top=27, depth=12):
    """Waistcoat: open armholes, so the shirt shows on the shoulders."""
    b = top + 1 + depth
    return (P(c, f'M{g(cx-12)} 49V{g(top+13)}C{g(cx-12)} {g(top+8.6)} {g(cx-10.6)} {g(top+5.6)} {g(cx-7.8)} {g(top+3.4)}L{g(cx-5.4)} {g(top+2)}L{g(cx)} {g(b)}L{g(cx+5.4)} {g(top+2)}L{g(cx+7.8)} {g(top+3.4)}C{g(cx+10.6)} {g(top+5.6)} {g(cx+12)} {g(top+8.6)} {g(cx+12)} {g(top+13)}V49Z')
            + P(f'{c}-d', f'M{g(cx+11.2)} 49V{g(top+13)}c0-2.6-.6-4.8-1.8-6.6.4 2.4.6 4.6.6 7V49Z')
            + P('lt', f'M{g(cx)} {g(b)}V49') + O('gd', cx + .1, b + 3, .7) + O('gd', cx + .1, b + 6.4, .7))

def jacket(cx, c='nv', top=27, depth=11):
    """Suit jacket with lapels over a shirt V."""
    b = top + 1 + depth
    return (P(c, f'M{g(cx-15)} 49V{g(top+11.5)}C{g(cx-15)} {g(top+6.4)} {g(cx-11.8)} {g(top+3.2)} {g(cx-7.4)} {g(top+2.1)}L{g(cx-3.6)} {g(top+1)}L{g(cx)} {g(b)}L{g(cx+3.6)} {g(top+1)}L{g(cx+7.4)} {g(top+2.1)}C{g(cx+11.8)} {g(top+3.2)} {g(cx+15)} {g(top+6.4)} {g(cx+15)} {g(top+11.5)}V49Z')
            + P(f'{c}-d', f'M{g(cx+14.2)} 49V{g(top+11.5)}c0-3.6-1.6-6.2-4.4-7.8 1.4 2.8 2 5.6 2 8.6V49Z')
            + P(c, f'M{g(cx-3.6)} {g(top+1)}L{g(cx-6.8)} {g(top+4.6)}l2.4 1.4-1.6 1.6L{g(cx-.6)} {g(b+.6)}Z')
            + P(c, f'M{g(cx+3.6)} {g(top+1)}L{g(cx+6.8)} {g(top+4.6)}l-2.4 1.4 1.6 1.6L{g(cx+.6)} {g(b+.6)}Z')
            + O('pn', cx, b + 3.6, .8))

def chef_coat(cx, c='wh', top=27, btn='pn'):
    """Double-breasted chef coat: mandarin collar, overlap edge, two rows of buttons."""
    return (torso(cx, c, top)
            + P(c, f'M{g(cx-3.8)} {g(top+.6)}h7.6v2.2c-2.4 1.2-5.2 1.2-7.6 0Z')
            + P('lt', f'M{g(cx+3.8)} {g(top+3)}c.2 3.4-.6 6.8-2.6 9.4V49')
            + ''.join(O(btn, cx + dx, top + y, .75) for y in (7, 11.4, 15.8) for dx in (-4, 5)))

def apron_bib(cx, c='ap', top=27, w=7):
    return (P('lt', f'M{g(cx-w+1)} {g(top+7)}L{g(cx-3)} {g(top+1.2)}M{g(cx+w-1)} {g(top+7)}L{g(cx+3)} {g(top+1.2)}')
            + P(c, f'M{g(cx-w)} 49V{g(top+7)}h{g(2*w)}V49Z')
            + P(f'{c}-d', f'M{g(cx+w-1.4)} 49V{g(top+7.8)}h.6V49Z'))

def apron_waist(cx, c='bk', y=41):
    return P(c, f'M{g(cx-11)} 49V{g(y)}h22V49Z') + P('lt', f'M{g(cx-12)} {g(y)}h24')

def badge(x, y, c='gd'):
    return R(c, x, y, 4.4, 2, .6)

# ---------- arms ----------
def arm(sh, el, wr, sleeve='sh', fore=None):
    """Shoulder -> elbow -> wrist. fore: colour of the forearm (sk for rolled sleeves)."""
    fore = fore or sleeve
    o = L('ao7', sh, el) + L(f's-{sleeve}', sh, el)
    o += L('ao6', el, wr) + L(f't-{fore}', el, wr)
    if fore != sleeve:
        ex, ey = el; wx, wy = wr
        k = 1.6 / max(((wx - ex) ** 2 + (wy - ey) ** 2) ** .5, .1)
        o += L('ao6', el, (ex + (wx - ex) * k, ey + (wy - ey) * k)) + L(f't-{sleeve}', el, (ex + (wx - ex) * k, ey + (wy - ey) * k))
    return o

def hand(x, y, rot=0, kind='fist', c='sk'):
    """Hand at (x, y) pointing along rot degrees (0 = right). Creases are darker skin, not ink,
    so they stay fine at small sizes. 'thumb' is only the thumb tip over the edge of a flat
    object (tablet, clipboard, menu), the fingers being behind it."""
    if kind == 'flat':    # palm up under a tray or plate
        s = P(c, 'M-1 -1.5h5.2a1.5 1.5 0 0 1 0 3H-1Z') + P(c, 'M.4 -1.3c.3-1.5 1.6-2.2 3-1.6')
    elif kind == 'grip':  # fingers wrapped round a neck, handle or bottle
        s = P(c, 'M-1 -3.5h3.4a3.2 3.2 0 0 1 3.2 3.2v.6a3.2 3.2 0 0 1-3.2 3.2H-1Z') + P(f'{c}-d', 'M1.2 -3.1h.7v6.2h-.7ZM3 -3.2h.7v6.4H3Z')
    elif kind == 'thumb':
        s = E(c, 0, 0, 1.3, 2.4)
    elif kind == 'point':
        s = P(c, 'M-1 -2.2h3.2a2.2 2.2 0 0 1 0 4.4H-1Z') + P(c, 'M3 -2.1h3.2a1 1 0 0 1 0 2H3Z')
    else:                 # fist: curled fingers seen from the front, thumb across
        s = (P(c, 'M-1 -3.5h3.4a3.2 3.2 0 0 1 3.2 3.2v.6a3.2 3.2 0 0 1-3.2 3.2H-1Z') + P(f'{c}-d', 'M1.2 -3.1h.7v6.2h-.7ZM3 -3.2h.7v6.4H3Z')
             + P(c, 'M-.6 -3.6c1.8-.3 3 .4 3.2 1.6.1.8-.5 1.2-1.3 1-.7-.2-1.3-.5-1.9-.5Z'))
    return G(s, x, y, rot)

# ---------- props ----------
def counter(c='wd', y=41.5, x0=1.5, x1=46.5):
    return R(c, x0, y, x1 - x0, 8, 1.4) + P(f'{c}-d', f'M{g(x0+.8)} {g(y+2.4)}H{g(x1-.8)}v1.2H{g(x0+.8)}Z')

def glint(x, y, h=4):
    return P('ll', f'M{g(x)} {g(y)}v{g(h)}')
