#!/usr/bin/env python3
"""
EcodiaOS iOS branding assets generator.
Worker B sub-fork of fork_motk37ob_7085c2.
Generates icon-1024.png and splash.png.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = "/home/tate/ecodiaos/drafts/ecodia-os-mobile-2026-05-06"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Brand colors
BG_TOP_LEFT = (0x14, 0x14, 0x1A)  # #14141A lighter top-left
BG_BOTTOM_RIGHT = (0x0A, 0x0A, 0x0B)  # #0A0A0B near-black
MARK_COLOR = (0xFA, 0xFA, 0xF8)  # #FAFAF8 warm off-white


def make_diagonal_gradient(size, color_tl, color_br):
    """
    Build a diagonal gradient from top-left -> bottom-right.
    Done via composite: a vertical gradient overlaid with a horizontal gradient
    using 0.5 alpha blend approximates a diagonal.
    """
    w, h = size
    # Build vertical gradient
    vert = Image.new("RGB", (w, h), color_tl)
    pixels = vert.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(color_tl[0] * (1 - t) + color_br[0] * t)
        g = int(color_tl[1] * (1 - t) + color_br[1] * t)
        b = int(color_tl[2] * (1 - t) + color_br[2] * t)
        for x in range(w):
            pixels[x, y] = (r, g, b)
    # Build horizontal gradient
    horiz = Image.new("RGB", (w, h), color_tl)
    p2 = horiz.load()
    for x in range(w):
        t = x / max(w - 1, 1)
        r = int(color_tl[0] * (1 - t) + color_br[0] * t)
        g = int(color_tl[1] * (1 - t) + color_br[1] * t)
        b = int(color_tl[2] * (1 - t) + color_br[2] * t)
        for y in range(h):
            p2[x, y] = (r, g, b)
    # Blend 50/50 -> diagonal
    return Image.blend(vert, horiz, 0.5)


def render_e_centered(canvas, font_size, baseline_lift_pct=0.04):
    """
    Render lowercase 'e' visually centered on canvas.
    Sans-serif lowercase 'e' looks more centered if lifted ~3-5% from geometric center.
    """
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT_PATH, font_size)
    # Measure glyph bbox
    bbox = font.getbbox("e")
    glyph_w = bbox[2] - bbox[0]
    glyph_h = bbox[3] - bbox[1]
    cw, ch = canvas.size
    # Position: subtract bbox offset to align glyph origin
    x = (cw - glyph_w) // 2 - bbox[0]
    y = (ch - glyph_h) // 2 - bbox[1] - int(ch * baseline_lift_pct)
    draw.text((x, y), "e", fill=MARK_COLOR, font=font)
    return canvas


def make_icon():
    size = (1024, 1024)
    img = make_diagonal_gradient(size, BG_TOP_LEFT, BG_BOTTOM_RIGHT)
    # 'e' at ~65% of canvas height -> use font_size that yields cap-height ~65%
    # DejaVu Sans Bold lowercase 'e' x-height ~ 0.55 of font_size, so for 65% of 1024 -> ~665, font ~1200
    # But too tight. Brief says 60-70% icon size for the mark; keep readable headroom.
    # Use font_size 720 -> 'e' visual height ~400-450 px -> ~40-44% of canvas. Looks better as a clean mark.
    img = render_e_centered(img, font_size=720)
    out = os.path.join(OUT_DIR, "icon-1024.png")
    # Ensure NO alpha (Apple rejects icon w/ alpha). PIL "RGB" already has no alpha; explicit save w/o alpha:
    img.convert("RGB").save(out, "PNG")
    return out


def make_splash():
    size = (2732, 2732)
    img = make_diagonal_gradient(size, BG_TOP_LEFT, BG_BOTTOM_RIGHT)
    # ~30% of canvas -> font_size ~ 900 yields 'e' visual ~ 500-560 -> ~20% of 2732. Bump to 1300.
    # Brief says ~30% of canvas size; render mark ~ 820 px tall on 2732 = 30%. font_size ~1500.
    img = render_e_centered(img, font_size=1500)
    out = os.path.join(OUT_DIR, "splash.png")
    img.convert("RGB").save(out, "PNG")
    return out


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    icon_path = make_icon()
    splash_path = make_splash()
    print(f"Icon written: {icon_path}")
    print(f"Splash written: {splash_path}")
