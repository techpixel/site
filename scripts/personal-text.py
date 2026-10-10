#!/usr/bin/env python3
"""
Builds the text field for the Personal Projects overlay from Figma's outlined text column
(node 2423:2416: "MY NAME IS MANITEJ BOORGU AND I DO RANDOM THINGS SOMETIMES", 1425×28px,
48 glyph paths), passed as argv[1].

The column is turned 90° to read top to bottom and repeated 14 times at the design's 36px
pitch across the 411×611 card. Glyphs below the card are dropped, curves are flattened and
simplified (Ramer–Douglas–Peucker, 0.35px) so Warp moves a few thousand points per frame.
Output: src/assets/overlays/personal/text.svg in card coordinates.
"""
import re, sys, math

src = open(sys.argv[1]).read()
paths = re.findall(r'<path[^>]*\sd="([^"]+)"[^>]*/?>', src)
root = re.search(r'<svg[^>]*>', src).group(0)
col_h = float(re.search(r'viewBox="[^"]*?\s([\d.]+)"', root).group(1))   # 28.4: the glyph band's thickness
tok = re.compile(r'[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e-?\d+)?')

CARD_W, CARD_H = 411, 611
COLUMNS = [-57 + 36 * k for k in range(14)]      # the design's column boxes (55px wide)
BAND_X = (55 - col_h) / 2                        # the text band sits centred in its 55px box
TOP = 2.14                                       # where the outlined text started in the frame
MARGIN = 40                                      # keep glyphs a little past the card for the warp
EPS = 0.35


def flatten(d):
    """Absolute M/L/H/V/C/Z → list of polylines (curves flattened)."""
    out, cur, cmd, args = [], [], None, []
    x = y = 0.0

    def cubic(p0, p1, p2, p3):
        length = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
        n = max(2, min(24, int(length / 1.5)))
        for i in range(1, n + 1):
            t = i / n; u = 1 - t
            yield (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                   u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])

    def flush():
        nonlocal cur, x, y, args
        a = args
        if cmd == 'M':
            if cur: out.append(cur)
            cur = []
            for i in range(0, len(a) - 1, 2): x, y = a[i], a[i+1]; cur.append((x, y))
        elif cmd == 'L':
            for i in range(0, len(a) - 1, 2): x, y = a[i], a[i+1]; cur.append((x, y))
        elif cmd == 'H':
            for v in a: x = v; cur.append((x, y))
        elif cmd == 'V':
            for v in a: y = v; cur.append((x, y))
        elif cmd == 'C':
            for i in range(0, len(a) - 5, 6):
                cur.extend(cubic((x, y), (a[i], a[i+1]), (a[i+2], a[i+3]), (a[i+4], a[i+5]))); x, y = a[i+4], a[i+5]
        elif cmd == 'Z':
            if cur: out.append(cur); cur = []
        args = []

    for t in tok.findall(d):
        if t.isalpha():
            flush(); cmd = t.upper()
            if cmd == 'Z': flush()
        else:
            args.append(float(t))
    flush()
    if cur: out.append(cur)
    return out


def rdp(pts, eps):
    if len(pts) < 3: return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = math.hypot(dx, dy)
    best, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        dist = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / norm if norm > 1e-9 else math.dist(pts[i], pts[0])
        if dist > best: best, idx = dist, i
    if best > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def simplify_closed(pts, eps):
    if len(pts) > 1 and math.dist(pts[0], pts[-1]) < 1e-6: pts = pts[:-1]
    if len(pts) < 3: return pts
    far = max(range(len(pts)), key=lambda i: math.dist(pts[0], pts[i]))
    a = rdp(pts[:far + 1], eps); b = rdp(pts[far:] + [pts[0]], eps)
    return a[:-1] + b[:-1]


# One glyph set, simplified, in column coordinates (x along the text, y across it).
glyphs = []
for d in paths:
    loops = [simplify_closed(l, EPS) for l in flatten(d)]
    loops = [l for l in loops if len(l) >= 3]
    if loops: glyphs.append(loops)

fmt = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
out, n_glyphs, n_points = [], 0, 0
for cx in COLUMNS:
    for loops in glyphs:
        # rotate 90° clockwise so the text reads downward, then place the column
        placed = [[(cx + BAND_X + (col_h - y), TOP + x) for x, y in loop] for loop in loops]
        if min(p[1] for loop in placed for p in loop) > CARD_H + MARGIN: continue
        n_glyphs += 1; n_points += sum(len(l) for l in placed)
        out.append(''.join('M' + 'L'.join(f'{fmt(x)} {fmt(y)}' for x, y in loop) + 'Z' for loop in placed))

svg = (f'<svg width="{CARD_W}" height="{CARD_H}" viewBox="0 0 {CARD_W} {CARD_H}" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
       + ''.join(f'<path d="{d}"/>\n' for d in out) + '</svg>\n')
open('src/assets/overlays/personal/text.svg', 'w').write(svg)
print(f'{len(glyphs)} glyphs × {len(COLUMNS)} columns → {n_glyphs} placed | {n_points} points | {len(svg)} bytes')
