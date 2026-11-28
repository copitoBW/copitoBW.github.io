"""Builds the doodle background tiles (css/bg/*.svg). Each icon is drawn in a 48x48 box."""
import os, sys

ICONS = {
    # ---- trips ----
    "pin": '<path d="M24 44s-13-13.500-13-23a13 13 0 0 1 26 0c0 9.500-13 23-13 23z"/><circle cx="24" cy="21" r="4.500"/>',
    "camera": '<rect x="5" y="15" width="38" height="25" rx="4"/><path d="M16 15l3-5h10l3 5"/><circle cx="24" cy="27.500" r="7.500"/><circle cx="24" cy="27.500" r="3"/><path d="M36 20.500h2"/>',
    "plane": '<path d="M5 22L43 6 31 42l-8-14z"/><path d="M23 28L43 6"/>',
    "compass": '<circle cx="24" cy="24" r="19"/><path d="M31 17l-4 10-10 4 4-10z"/><path d="M24 5v3M24 40v3M5 24h3M40 24h3"/>',
    "mountain": '<path d="M3 40l14-23 8 12 5-7 15 18z"/><path d="M13 23.500l4 3 3.500-3.500"/><circle cx="37" cy="11" r="4"/>',
    "suitcase": '<rect x="7" y="16" width="34" height="25" rx="4"/><path d="M18 16v-6h12v6"/><path d="M15 16v25M33 16v25"/>',
    "torii": '<path d="M5 13q19 5 38 0"/><path d="M9 21h30"/><path d="M14 15v28M34 15v28M24 15.500v5.500"/>',
    "map": '<path d="M5 12l12-4 14 4 12-4v28l-12 4-14-4-12 4z"/><path d="M17 8v28M31 12v28"/>',
    # ---- food ----
    "ramen": '<path d="M5 24h38a19 19 0 0 1-38 0z"/><path d="M17 43h14"/><path d="M27 23L41 5M32 23.500L45 8"/><path d="M12 18q-3-3.500 0-7t0-7M20 18q-3-3.500 0-7"/>',
    "onigiri": '<path d="M24 7q5 0 9 8l8 15q3 9-7 9H14q-10 0-7-9l8-15q4-8 9-8z"/><path d="M17 39V29h14v10"/>',
    "cup": '<path d="M8 17h26v12a13 13 0 0 1-26 0z"/><path d="M34 20h4a5 5 0 0 1 0 10h-4.500"/><path d="M6 44h30"/><path d="M16 11q-2.500-3 0-6M25 11q-2.500-3 0-6"/>',
    "dango": '<circle cx="24" cy="10" r="6.500"/><circle cx="24" cy="23" r="6.500"/><circle cx="24" cy="36" r="6.500"/><path d="M24 42.500V47"/>',
    "sushi": '<path d="M7 31q0-6 17-6t17 6v5q0 4-4 4H11q-4 0-4-4z"/><path d="M5 27q19-15 38 0"/><path d="M16 20.500l3 4M24 19v4.500M32 20.500l-3 4"/>',
    "cone": '<path d="M13 22l11 23 11-23"/><path d="M11 22a13 13 0 0 1 26 0z"/><path d="M17.500 31l10 6M30.500 31l-10 6"/>',
    "chopsticks": '<path d="M8 44L36 4M16 45L42 7"/>',
    "naruto": '<path d="M24 5l4.500 3 5.500-1 2 5 5 2-1 5.500 3 4.500-3 4.500 1 5.500-5 2-2 5-5.500-1-4.500 3-4.500-3-5.500 1-2-5-5-2 1-5.500-3-4.500 3-4.500-1-5.500 5-2 2-5 5.500 1z"/><path d="M24 24a2.500 2.500 0 1 1 2.500 2.500 5.500 5.500 0 1 1-5.500-5.500 8.500 8.500 0 1 1 8.500 8.500"/>',
    # ---- events ----
    "lantern": '<path d="M19 6h10v5H19z"/><path d="M17 11h14q9 12.500 0 25H17q-9-12.500 0-25z"/><path d="M24 11v25M13 19.500h22M13 27.500h22"/><path d="M20 36h8v4h-8zM24 40v6"/>',
    "firework": '<path d="M24 19V5M24 29v14M19 24H5M29 24h14M20.500 20.500L10.500 10.500M27.500 27.500l10 10M27.500 20.500l10-10M20.500 27.500l-10 10"/>',
    "sakura": '<g id="p"><path d="M24 21q-8-6-3-15l3 2 3-2q5 9-3 15z"/></g><use href="#p" transform="rotate(72 24 24)"/><use href="#p" transform="rotate(144 24 24)"/><use href="#p" transform="rotate(216 24 24)"/><use href="#p" transform="rotate(288 24 24)"/><circle cx="24" cy="24" r="1.500"/>',
    "maple": '<path d="M24 46V33"/><path d="M24 33l-11 3 2.500-7L6 24l8-3-2-9 7.500 3.500L24 4l4.500 11.500L36 12l-2 9 8 3-9.500 5 2.500 7z"/>',
    "sparkle": '<path d="M24 5l3.500 15.500L43 24l-15.500 3.500L24 43l-3.500-15.500L5 24l15.500-3.500z"/>',
    "tree": '<path d="M24 5l-9 12h5l-9 11h6l-9 11h32l-9-11h6l-9-11h5z"/><path d="M24 39v6"/>',
    "ticket": '<path d="M5 15h38v6a4 4 0 0 0 0 8v6H5v-6a4 4 0 0 0 0-8z"/><path d="M31 18v2.500M31 23.500v2.500M31 29v2.500"/><path d="M12 22h12M12 28h8"/>',
    "ball": '<circle cx="24" cy="24" r="19"/><path d="M24 16l7.500 5.500-3 8.500h-9l-3-8.500z"/><path d="M24 16V5.500M31.500 21.500l10-3.500M28.500 30l6 8.500M19.500 30l-6 8.500M16.500 21.500l-10-3.500"/>',
    # ---- music ----
    "vinyl": '<circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="13.500"/><circle cx="24" cy="24" r="6.500"/><circle cx="24" cy="24" r="1"/>',
    "notes": '<path d="M17 37V12l20-5v25"/><path d="M17 19l20-5"/><ellipse cx="12" cy="37" rx="5.500" ry="4.500"/><ellipse cx="32" cy="32" rx="5.500" ry="4.500"/>',
    "note": '<ellipse cx="19" cy="38" rx="6.500" ry="5"/><path d="M25.500 38V6q2 9 11 11"/>',
    "headphones": '<path d="M8 30v-5a16 16 0 0 1 32 0v5"/><rect x="5" y="29" width="9" height="14" rx="3.500"/><rect x="34" y="29" width="9" height="14" rx="3.500"/>',
    "cassette": '<rect x="4" y="11" width="40" height="27" rx="4"/><rect x="10" y="16" width="28" height="12" rx="3"/><circle cx="18" cy="22" r="2.500"/><circle cx="30" cy="22" r="2.500"/><path d="M13 38l3-6h16l3 6"/>',
    "bars": '<path d="M9 30v-8M16.500 36V14M24 32V18M31.500 41V9M39 30v-8"/>',
    "mic": '<rect x="18" y="5" width="12" height="23" rx="6"/><path d="M11 22a13 13 0 0 0 26 0M24 35v8M16 43h16"/>',
    "guitar": '<path d="M30 18l12-12M38 4l6 6"/><path d="M27 15q5-1 6 4t-3 6q-2 2-1 6 1 9-9 11T6 34q-3-9 6-13 4-1 6-3t3-3q3-1 6 0z"/><circle cx="19" cy="29" r="3.500"/>',
    # ---- about ----
    "pencil": '<path d="M7 41l3-11L32 8l8 8-22 22z"/><path d="M27.500 12.500l8 8M10 30l8 8"/>',
    "book": '<path d="M24 14q-8-5-19-3v27q11-2 19 3 8-5 19-3V11q-11-2-19 3z"/><path d="M24 14v27"/>',
    "heart": '<path d="M24 41S7 31 7 19.500a8.500 8.500 0 0 1 17-3 8.500 8.500 0 0 1 17 3C41 31 24 41 24 41z"/>',
    "bubble": '<path d="M9 8h30a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5H23l-9 9v-9H9a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5z"/><path d="M15 21h.500M24 21h.500M33 21h.500"/>',
    "globe": '<circle cx="24" cy="24" r="19"/><ellipse cx="24" cy="24" rx="8.500" ry="19"/><path d="M5 24h38M8 14.500h32M8 33.500h32"/>',
    "pad": '<path d="M15 14h18a11 11 0 0 1 11 11v3a7.500 7.500 0 0 1-13.500 4.500L29 30H19l-1.500 2.500A7.500 7.500 0 0 1 4 28v-3a11 11 0 0 1 11-11z"/><path d="M14 19.500v8M10 23.500h8"/><path d="M32 21h.500M36 25.500h.500"/>',
}
# A few dots and tiny crosses scattered between the icons so the tile doesn't read as a grid.
FILL = [(150, 22), (308, 108), (62, 152), (236, 300), (420, 316), (160, 398), (300, 440), (452, 60), (20, 268)]

# Slots in a 480x480 tile: (x, y, rotation, scale). Nothing crosses the tile edge.
SLOTS = [(28, 34, -12, 1.0), (192, 66, 10, 1.05), (356, 26, -6, .95), (100, 196, 8, 1.0),
         (270, 186, -14, 1.1), (406, 172, 12, .9), (34, 336, 14, 1.05), (190, 322, -8, .95),
         (346, 348, 6, 1.0), (116, 420, -10, .9)]

SETS = {
    "trips": ["pin", "camera", "plane", "mountain", "compass", "torii", "suitcase", "map", "pin", "plane"],
    "food": ["ramen", "onigiri", "cup", "dango", "sushi", "naruto", "cone", "ramen", "chopsticks", "onigiri"],
    "events": ["lantern", "firework", "sakura", "maple", "tree", "sparkle", "ticket", "sakura", "ball", "maple"],
    "music": ["vinyl", "notes", "headphones", "note", "cassette", "bars", "guitar", "notes", "mic", "note"],
    "about": ["pencil", "book", "heart", "globe", "bubble", "pad", "camera", "ramen", "plane", "notes"],
}

def tile(names):
    out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="480" height="480" viewBox="0 0 480 480">',
           '<g fill="none" stroke="#000" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">']
    for i, (name, (x, y, rot, sc)) in enumerate(zip(names, SLOTS)):
        body = ICONS[name].replace("-.", "-0.")
        # unique ids for the sakura petal when it appears twice
        body = body.replace('id="p"', f'id="p{i}"').replace('href="#p"', f'href="#p{i}"')
        out.append(f'<g transform="translate({x} {y}) rotate({rot} 24 24) scale({sc})">{body}</g>')
    for j, (x, y) in enumerate(FILL):
        if j % 3 == 0:
            out.append(f'<path d="M{x-4} {y}h8M{x} {y-4}v8"/>')
        elif j % 3 == 1:
            out.append(f'<circle cx="{x}" cy="{y}" r="2.500"/>')
        else:
            out.append(f'<path d="M{x-5} {y+2}q2.500-5 5 0t5 0"/>')
    out.append("</g></svg>")
    return "\n".join(out).replace(".500", ".5").replace(".700", ".7")

dest = sys.argv[1]
os.makedirs(dest, exist_ok=True)
for name, icons in SETS.items():
    with open(os.path.join(dest, name + ".svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(tile(icons) + "\n")
    print(name, "ok")
