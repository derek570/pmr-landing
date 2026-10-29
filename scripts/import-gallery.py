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
with macOS `sips`, and written to assets/gallery/<group>/. A 600 px thumbnail
goes to assets/gallery/<group>/thumbs/ for the reels and album grids; the
full-size copy is only loaded in the lightbox. The script then rewrites
assets/gallery/gallery.json, replacing whatever was there.

Alt text comes from the file name when it is descriptive
("silverstone-pitlane.jpg" -> "Silverstone pitlane"); camera names such as
IMG_0412 fall back to "<group> photo <n>". Rename files in iCloud to improve it.

Videos (.mp4, .mov, .m4v) go in the same folders. Each one is cut to its first
20 seconds, scaled to 720 px on the short edge, stripped of sound and written
as an H.264 MP4 with ffmpeg (brew install ffmpeg). A frame from one second in
becomes its poster and thumbnail. Keep clips short and few: GitHub Pages
serves them straight from the repository.

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
PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v"}
EXTS = PHOTO_EXTS | VIDEO_EXTS
CAMERA_NAME = re.compile(r"^(img|dsc|dscn|pxl|photo|image|screenshot)?[\s_-]*\d+", re.I)
MAX_EDGE = "1600"
THUMB_EDGE = "600"
VIDEO_SECONDS = "20"
VIDEO_SHORT_EDGE = 720


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


def import_video(src, dest, poster):
    """Write a small, silent web copy of src to dest and a poster frame to poster."""
    e = VIDEO_SHORT_EDGE
    scale = f"scale='if(gt(iw,ih),-2,min({e},iw))':'if(gt(iw,ih),min({e},ih),-2)'"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-t", VIDEO_SECONDS, "-an",
         "-vf", f"{scale},fps=30", "-c:v", "libx264", "-crf", "30", "-preset", "slow",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dest)],
        check=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(dest), "-frames:v", "1",
         "-q:v", "3", str(poster)],
        check=True)


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
        print(f"group {title}: {len(photos)} item(s)")

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
        (dest_dir / "thumbs").mkdir()
        entries = []
        for n, src in enumerate(photos, 1):
            dest = dest_dir / f"{slug}-{n:02d}.jpg"
            video = None
            name = src.stem
            if src.suffix.lower() in VIDEO_EXTS:
                video = dest.with_suffix(".mp4")
                import_video(src, video, dest)
                src = dest
            # shrink large photos only; sips -Z would also enlarge small ones
            resize = ["-Z", MAX_EDGE] if long_edge(src) > int(MAX_EDGE) else []
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", *resize,
                 str(src), "--out", str(dest)],
                check=True, stdout=subprocess.DEVNULL)
            thumb = dest_dir / "thumbs" / dest.name
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72", "-Z", THUMB_EDGE,
                 str(dest), "--out", str(thumb)],
                check=True, stdout=subprocess.DEVNULL)
            entry = {
                "src": dest.relative_to(REPO).as_posix(),
                "thumb": thumb.relative_to(REPO).as_posix(),
                "alt": alt_from_name(name, title, n),
            }
            if video:
                entry["video"] = video.relative_to(REPO).as_posix()
            entries.append(entry)
        manifest["groups"].append({"slug": slug, "title": title, "caption": caption, "photos": entries})

    (OUT_DIR / "gallery.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    total = sum(len(g["photos"]) for g in manifest["groups"])
    print(f"Wrote {total} photo(s) in {len(manifest['groups'])} reel(s) to {OUT_DIR.relative_to(REPO)}")


if __name__ == "__main__":
    main()
