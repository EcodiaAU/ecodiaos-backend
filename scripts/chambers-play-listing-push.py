#!/usr/bin/env python3
"""Push the full Chambers store listing to Play Console via the API.

What this lands programmatically:
- en-AU listing: title, shortDescription, fullDescription
- hi-res icon (512x512)
- feature graphic (1024x500, generated from brand teal)
- phone screenshots (1290x2796 iPhone shots, Play accepts the dims)

Anything Play still requires (content rating questionnaire, data safety
form, target audience, pricing, app access) is documented at the end.
"""

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

KEY = r"D:/PRIVATE/ecodia-creds/play/play-uploader-key.json"
PACKAGE = "au.ecodia.chambers"
LANG = "en-AU"

ICON_PATH = Path(r"D:/.code/chambers-frontend-uxfix/public/icon-512.png")
SHOTS_DIR = Path(
    r"D:/.code/EcodiaOS/backend/drafts/chambers-launch-screenshots-2026-05-28"
)
FEATURE_GRAPHIC_PATH = Path(
    r"D:/.code/EcodiaOS/backend/drafts/chambers-feature-graphic-1024x500.png"
)

SHORT_DESCRIPTION = "Run members, events, dues and comms for your chamber of commerce."
FULL_DESCRIPTION = """Chambers is a membership platform built for chambers of commerce and the people who run them: presidents, executive officers, committee chairs, volunteers, and members.

Members and dues
Keep your member directory current, track membership status, and collect dues with GST-correct tax invoices, card payments, and direct debit. Renewal reminders go out automatically.

Events
Create ticketed events with member and non-member pricing, free entry for members, and voucher codes. Members RSVP and pay in a few taps.

Communications
Draft newsletters and event recaps with AI assistance, segment your audience, and see opens and clicks. New members get welcomed automatically.

Committees and working groups
Organise committees, assign chairs, and run focus-group chat threads for the conversations that happen between meetings.

For officers
A clean admin for approvals, dues, events, newsletters, branding and reporting, all from your phone.

Built in Australia, with Australian data residency and Xero integration for your treasurer."""

# Screenshot order (Play shows the first one most prominently)
SHOT_ORDER = [
    "01-home-feed.png",
    "02-events-feed.png",
    "02b-event-detail-pricing-voucher.png",
    "03-officer-dues-admin.png",
    "04-focus-group-chat.png",
    "05-members-directory.png",
    "06-member-profile-dues.png",
]


def generate_feature_graphic(path: Path) -> None:
    """Make a simple 1024x500 brand-teal gradient with the Chambers wordmark."""
    if path.exists():
        return
    w, h = 1024, 500
    img = Image.new("RGB", (w, h), color=(61, 143, 153))
    # Vertical-ish gradient from #3D8F99 to #2A6770
    top = (61, 143, 153)
    bot = (42, 103, 112)
    for y in range(h):
        t = y / (h - 1)
        col = (
            int(top[0] + (bot[0] - top[0]) * t),
            int(top[1] + (bot[1] - top[1]) * t),
            int(top[2] + (bot[2] - top[2]) * t),
        )
        for x in range(w):
            img.putpixel((x, y), col)
    draw = ImageDraw.Draw(img)
    # Try a system font; fall back to default if missing
    try:
        font_big = ImageFont.truetype("arial.ttf", 110)
        font_small = ImageFont.truetype("arial.ttf", 28)
    except Exception:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()
    title = "Chambers"
    tagline = "The app for chambers of commerce"
    tw, th = draw.textbbox((0, 0), title, font=font_big)[2:]
    sw, sh = draw.textbbox((0, 0), tagline, font=font_small)[2:]
    draw.text(
        ((w - tw) // 2, (h - th) // 2 - 25), title, font=font_big, fill=(255, 255, 255)
    )
    draw.text(
        ((w - sw) // 2, (h + th) // 2 - 5),
        tagline,
        font=font_small,
        fill=(255, 255, 255, 200),
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"[gen] feature graphic -> {path} ({path.stat().st_size} bytes)")


def upload_image(edits, edit_id: str, image_path: Path, image_type: str) -> dict:
    if not image_path.is_file():
        raise FileNotFoundError(image_path)
    with open(image_path, "rb") as fh:
        media = MediaIoBaseUpload(
            io.BytesIO(fh.read()), mimetype="image/png", resumable=True
        )
    return (
        edits.images()
        .upload(
            packageName=PACKAGE,
            editId=edit_id,
            language=LANG,
            imageType=image_type,
            media_body=media,
        )
        .execute()
    )


def main() -> int:
    if not ICON_PATH.is_file():
        print(f"icon missing: {ICON_PATH}", file=sys.stderr)
        return 2
    missing = [n for n in SHOT_ORDER if not (SHOTS_DIR / n).is_file()]
    if missing:
        print(f"screenshots missing: {missing}", file=sys.stderr)
        return 2

    generate_feature_graphic(FEATURE_GRAPHIC_PATH)

    creds = service_account.Credentials.from_service_account_file(
        KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    edit_id = edits.insert(packageName=PACKAGE, body={}).execute()["id"]
    print(f"[edit] {edit_id}")

    # 1. en-AU listing copy
    listing = (
        edits.listings()
        .update(
            packageName=PACKAGE,
            editId=edit_id,
            language=LANG,
            body={
                "language": LANG,
                "title": "Chambers",
                "shortDescription": SHORT_DESCRIPTION,
                "fullDescription": FULL_DESCRIPTION,
            },
        )
        .execute()
    )
    print(f"[listing] {LANG} updated (title={listing.get('title')})")

    # 2. Wipe any existing assets for this language (idempotent re-runs)
    for typ in ("phoneScreenshots", "icon", "featureGraphic"):
        try:
            edits.images().deleteall(
                packageName=PACKAGE, editId=edit_id, language=LANG, imageType=typ
            ).execute()
            print(f"[clear] {typ}")
        except Exception as e:
            # First-time runs have nothing to delete
            print(f"[clear] {typ} skip: {str(e)[:80]}")

    # 3. Upload hi-res icon
    upload_image(edits, edit_id, ICON_PATH, "icon")
    print(f"[icon] uploaded {ICON_PATH.name}")

    # 4. Upload feature graphic
    upload_image(edits, edit_id, FEATURE_GRAPHIC_PATH, "featureGraphic")
    print(f"[featureGraphic] uploaded {FEATURE_GRAPHIC_PATH.name}")

    # 5. Upload phone screenshots
    for name in SHOT_ORDER:
        upload_image(edits, edit_id, SHOTS_DIR / name, "phoneScreenshots")
        print(f"[phoneScreenshots] uploaded {name}")

    # 6. Commit
    commit = edits.commit(packageName=PACKAGE, editId=edit_id).execute()
    print(f"[commit] {commit.get('id')}")
    print(
        "DONE. Listing copy + icon + feature graphic + 7 screenshots live in Play Console (en-AU)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
