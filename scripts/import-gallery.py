#!/usr/bin/env python3
"""Import gallery photos from iCloud Drive into the website.

Source layout (one folder per reel on the gallery page):

    iCloud Drive/PMR Website Gallery/
        1 On track/            <- leading number sets the order, it is not shown
            caption.txt        <- optional one-line caption under the reel title
            IMG_0412.HEIC
            02-silverstone-pitlane.jpg   <- a leading number sets the order within a reel
        2 In the paddock/
        ...

Each photo is converted to JPEG, resized to at most 1600 px on the long edge
with macOS `sips`, and written to assets/gallery/<group>/. The script then
rewrites assets/gallery/gallery.json, replacing whatever was there.

Alt text comes from the file name when it is descriptive
("silverstone-pitlane.jpg" -> "Silverstone pitlane"); camera names such as
IMG_0412 fall back to "<group> photo <n>". Rename files in iCloud to improve it.

Usage:  python3 scripts/import-gallery.py [--source DIR] [--dry-run]
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = pathlib.Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/PMR Website Gallery"
OUT_DIR = REPO / "assets/gallery"
EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
CAMERA_NAME = re.compile(r"^(img|dsc|dscn|pxl|photo|image|screenshot)?[\s_-]*\d+", re.I)
MAX_EDGE = "1600"


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def group_title(folder_name):
    return re.sub(r"^\d+[\s._-]*", "", folder_name).strip() or folder_name


def alt_from_name(stem, title, n):
    # "03-rider-cornering" -> "rider-cornering": a leading number only sets the order
    stem = re.sub(r"^\d{1,3}[\s._-]+(?=[a-zA-Z])", "", stem)
    if CAMERA_NAME.match(stem):
        return f"{title} photo {n}"
    words = re.sub(r"[_-]+", " ", stem).strip()
    return words[:1].upper() + words[1:]


def long_edge(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return max(int(n) for n in re.findall(r"pixel(?:Width|Height): (\d+)", out))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=pathlib.Path, default=DEFAULT_SOURCE)
    ap.add_argument("--dry-run", action="store_true", help="list what would be imported and change nothing")
    args = ap.parse_args()

    if not args.source.is_dir():
        sys.exit(f"Source folder not found: {args.source}")

    folders = sorted((p for p in args.source.iterdir() if p.is_dir() and not p.name.startswith(".")),
                     key=lambda p: p.name.lower())
    groups = []
    for folder in folders:
        photos = sorted((p for p in folder.iterdir() if p.suffix.lower() in EXTS and not p.name.startswith(".")),
                        key=lambda p: p.name.lower())
        if not photos:
            print(f"skip  {folder.name}: no photos")
            continue
        title = group_title(folder.name)
        caption_file = folder / "caption.txt"
        caption = caption_file.read_text().strip() if caption_file.exists() else ""
        groups.append((folder, title, caption, photos))
        print(f"group {title}: {len(photos)} photo(s)")

    if not groups:
        sys.exit("No photos found; gallery.json left unchanged.")
    if args.dry_run:
        return

    # Rebuild group folders from scratch so deleted iCloud photos disappear from the site.
    for child in OUT_DIR.iterdir() if OUT_DIR.exists() else []:
        if child.is_dir():
            shutil.rmtree(child)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {"groups": []}
    for folder, title, caption, photos in groups:
        slug = slugify(title)
        dest_dir = OUT_DIR / slug
        dest_dir.mkdir()
        entries = []
        for n, src in enumerate(photos, 1):
            dest = dest_dir / f"{slug}-{n:02d}.jpg"
            # shrink large photos only; sips -Z would also enlarge small ones
            resize = ["-Z", MAX_EDGE] if long_edge(src) > int(MAX_EDGE) else []
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", *resize,
                 str(src), "--out", str(dest)],
                check=True, stdout=subprocess.DEVNULL)
            entries.append({"src": dest.relative_to(REPO).as_posix(), "alt": alt_from_name(src.stem, title, n)})
        manifest["groups"].append({"title": title, "caption": caption, "photos": entries})

    (OUT_DIR / "gallery.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    total = sum(len(g["photos"]) for g in manifest["groups"])
    print(f"Wrote {total} photo(s) in {len(manifest['groups'])} reel(s) to {OUT_DIR.relative_to(REPO)}")


if __name__ == "__main__":
    main()
