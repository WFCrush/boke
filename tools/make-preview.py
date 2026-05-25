import json
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont


def font(size):
    for name in ("msyh.ttc", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def watermark(image, text):
    image = image.convert("RGBA")
    layer = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(layer)
    fnt = font(max(22, image.width // 18))
    step_x = max(260, image.width // 2)
    step_y = max(180, image.height // 4)
    for y in range(-step_y, image.height + step_y, step_y):
        for x in range(-step_x, image.width + step_x, step_x):
            draw.text((x, y), text, fill=(20, 20, 20, 54), font=fnt)
    return Image.alpha_composite(image, layer).convert("RGB")


def pdf_preview(src, out_dir, text):
    doc = fitz.open(src)
    count = min(len(doc), 6)
    paths = []
    for i in range(count):
        page = doc[i]
        pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        img = watermark(img, text)
        out = out_dir / f"page-{i + 1}.jpg"
        img.save(out, quality=82)
        paths.append(out.name)
    return paths


def image_preview(src, out_dir, text):
    img = Image.open(src)
    img.thumbnail((1400, 1800))
    img = watermark(img, text)
    out = out_dir / "page-1.jpg"
    img.save(out, quality=84)
    return [out.name]


def main():
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    text = sys.argv[3]
    ext = sys.argv[4].lower() if len(sys.argv) > 4 else src.suffix.lower()
    out_dir.mkdir(parents=True, exist_ok=True)
    if ext == ".pdf":
        pages = pdf_preview(src, out_dir, text)
    else:
        pages = image_preview(src, out_dir, text)
    print(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
