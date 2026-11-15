"""Copy phone photos from inbox/ into photos/, ready for the web.

For each photo it:
  * reads the date it was taken (EXIF, or the phone's file name as a fallback),
  * rotates it upright and resizes it (1600 px long side, plus a 640 px thumbnail),
  * drops ALL metadata (GPS, camera, dates) so nothing private is published,
  * saves it as photos/<prefecture>/<place>/<YYYY-MM-DD>/<YYYYMMDD_HHMMSS>.jpg
    with the thumbnail in the same folder under thumbs/.

Repeat visits to the same place simply land in another date folder.
Originals dropped loose in inbox/ are then filed (untouched) under
inbox/originals/<prefecture>/<place>/<YYYY-MM-DD>/, so whatever is still loose
in inbox/ is always "not done yet". inbox/ is gitignored: originals never get published.

Usage:
  python tools/add_photos.py <prefecture> <place> <photo> [<photo> ...]
  python tools/add_photos.py --archive <prefecture> <place> <photo> [...]
      file originals you decided NOT to publish, without making web copies
  python tools/add_photos.py --check          # scan photos/ for leftover metadata
  python tools/add_photos.py --blur <photo> <x1,y1,x2,y2> [...]
      blur areas (e.g. strangers' faces) in a photo AND its thumbnail.
      Boxes are fractions of the width/height (0 = left/top, 1 = right/bottom),
      so the same box works for both sizes. Example: 0.21,0.50,0.33,0.58

Example:
  python tools/add_photos.py tokyo akihabara inbox/20230114_174938.jpg

It prints the JSON entries to paste into a visit in data/japan.json.
Needs Pillow (pip install pillow). iPhone .HEIC files also need pillow-heif.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
INBOX = ROOT / "inbox"
ORIGINALS = INBOX / "originals"
FULL_SIZE, THUMB_SIZE = 1600, 640
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

try:  # optional HEIC support
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass


def taken_at(path: Path, im: Image.Image) -> tuple[datetime, bool]:
    """When the photo was taken, and whether the time of day is known."""
    exif = im.getexif()
    raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
    if raw:
        return datetime.strptime(str(raw).strip()[:19], "%Y:%m:%d %H:%M:%S"), True
    m = re.search(r"(20\d{6})[_-](\d{6})(?!\d)", path.name)
    if m:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S"), True
    # WhatsApp & co. strip the photo data; their names (IMG-20230131-WA0002) keep only the day.
    m = re.search(r"(20\d{6})", path.name)
    if m:
        return datetime.strptime(m.group(1), "%Y%m%d"), False
    sys.exit(f"Can't find the date for {path.name}. Rename it like 20230114_174938.jpg and retry.")


def web_name(src: Path, when: datetime, has_time: bool) -> str:
    if has_time:
        return when.strftime("%Y%m%d_%H%M%S") + ".jpg"
    # No time of day: keep the app's own counter (e.g. WA0002) so names stay unique.
    tail = re.sub(r"[^a-z0-9]+", "-", src.stem.lower().split(when.strftime("%Y%m%d"), 1)[-1]).strip("-")
    return when.strftime("%Y%m%d") + (f"_{tail}" if tail else "") + ".jpg"


def save_clean(im: Image.Image, dest: Path, size: int, quality: int) -> None:
    copy = im.copy()
    copy.thumbnail((size, size), Image.LANCZOS)
    # Rebuild from raw pixels so no EXIF/XMP/GPS block survives.
    clean = Image.new("RGB", copy.size)
    clean.paste(copy)
    dest.parent.mkdir(parents=True, exist_ok=True)
    clean.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)


def has_metadata(path: Path) -> bool:
    with Image.open(path) as im:
        return bool(im.getexif()) or "xmp" in im.info or "exif" in im.info


def file_original(src: Path, prefecture: str, place: str, when: datetime) -> None:
    """Move a loose inbox photo into inbox/originals/<pref>/<place>/<date>/."""
    src = src.resolve()
    if src.parent != INBOX:
        return  # already filed, or not from the inbox: leave it where it is
    dest = ORIGINALS / prefecture / place / when.strftime("%Y-%m-%d") / src.name
    if dest.exists():
        sys.exit(f"{dest} already exists; not overwriting.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dest)


def check_slugs(*names: str) -> None:
    for s in names:
        if not SLUG.match(s):
            sys.exit(f"'{s}' should be lowercase words joined by '-', like 'tokyo' or 'expo-center'.")


def archive(prefecture: str, place: str, files: list[str]) -> None:
    check_slugs(prefecture, place)
    for f in files:
        src = Path(f)
        with Image.open(src) as im:
            when, _ = taken_at(src, im)
        file_original(src, prefecture, place, when)
        print(f"filed {src.name} (not published)", file=sys.stderr)


def add(prefecture: str, place: str, files: list[str]) -> None:
    check_slugs(prefecture, place)
    entries = []
    for f in files:
        src = Path(f)
        with Image.open(src) as im:
            when, has_time = taken_at(src, im)
            upright = ImageOps.exif_transpose(im).convert("RGB")
        file_original(src, prefecture, place, when)
        name = web_name(src, when, has_time)
        folder = PHOTOS / prefecture / place / when.strftime("%Y-%m-%d")
        full, thumb = folder / name, folder / "thumbs" / name
        if full.exists():
            print(f"skip  {src.name} (already at {full.relative_to(ROOT).as_posix()})", file=sys.stderr)
        else:
            save_clean(upright, full, FULL_SIZE, 82)
            save_clean(upright, thumb, THUMB_SIZE, 78)
            for p in (full, thumb):
                if has_metadata(p):
                    sys.exit(f"Metadata left in {p}; stopping.")
            kb = (full.stat().st_size + thumb.stat().st_size) // 1024
            print(f"ok    {src.name} -> {full.relative_to(ROOT).as_posix()} ({kb} KB)", file=sys.stderr)
        entries.append({
            "date": when.strftime("%Y-%m-%d"),
            "src": full.relative_to(ROOT).as_posix(),
            "thumb": thumb.relative_to(ROOT).as_posix(),
            "time": when.strftime("%H:%M") if has_time else None,
        })
    print(json.dumps(entries, ensure_ascii=False, indent=2))


def blur(photo: str, boxes: list[str]) -> None:
    full = Path(photo).resolve()
    if PHOTOS not in full.parents or not full.exists():
        sys.exit(f"{photo} is not a photo inside photos/.")
    regions = []
    for b in boxes:
        try:
            x1, y1, x2, y2 = (float(v) for v in b.split(","))
        except ValueError:
            sys.exit(f"Bad box '{b}'. Use four fractions like 0.21,0.50,0.33,0.58")
        if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
            sys.exit(f"Box '{b}' must stay between 0 and 1, with x1 < x2 and y1 < y2.")
        regions.append((x1, y1, x2, y2))
    for target in (full, full.parent / "thumbs" / full.name):
        if not target.exists():
            continue
        with Image.open(target) as im:
            im = im.convert("RGB")
        w, h = im.size
        for x1, y1, x2, y2 in regions:
            box = (int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h))
            bw, bh = box[2] - box[0], box[3] - box[1]
            # Pixelate, then soften, so faces can't be recognised but it still looks natural.
            area = im.crop(box)
            small = area.resize((max(1, bw // 12), max(1, bh // 12)), Image.BILINEAR)
            area = small.resize((bw, bh), Image.NEAREST).filter(ImageFilter.GaussianBlur(max(2, min(bw, bh) // 10)))
            mask = Image.new("L", (bw, bh), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, bw - 1, bh - 1), fill=255)
            im.paste(area, box, mask.filter(ImageFilter.GaussianBlur(max(1, min(bw, bh) // 12))))
        im.save(target, "JPEG", quality=82 if target == full else 78, optimize=True, progressive=True)
        print(f"blurred {len(regions)} area(s) in {target.relative_to(ROOT).as_posix()}", file=sys.stderr)


def check() -> None:
    bad = [p for p in PHOTOS.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and has_metadata(p)]
    for p in bad:
        print("metadata:", p.relative_to(ROOT).as_posix())
    print("All photos are clean." if not bad else f"{len(bad)} photo(s) still have metadata.")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--check"]:
        check()
    elif len(args) >= 3 and args[0] == "--blur":
        blur(args[1], args[2:])
    elif len(args) >= 4 and args[0] == "--archive":
        archive(args[1], args[2], args[3:])
    elif len(args) >= 3:
        add(args[0], args[1], args[2:])
    else:
        print(__doc__)
        sys.exit(2)
