from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "assets" / "logo.png"
OUTPUT = ROOT / "build"
SIZE = 1024
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def to_square(image: Image.Image) -> Image.Image:
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    side = max(image.size)
    padding = max(1, round(side * 0.12))
    side += padding * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def add_tray_background(image: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    radius = round(image.width * 0.18)
    ImageDraw.Draw(canvas).rounded_rectangle(
        (0, 0, image.width - 1, image.height - 1),
        radius=radius,
        fill=(255, 255, 255, 255),
        outline=(55, 89, 63, 30),
        width=max(1, round(image.width * 0.002))
    )
    canvas.alpha_composite(image)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing logo source: {SOURCE}")

    OUTPUT.mkdir(exist_ok=True)
    image = to_square(Image.open(SOURCE).convert("RGBA")).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    image = add_tray_background(image)
    image.save(OUTPUT / "icon.png")
    image.save(OUTPUT / "icon.ico", sizes=ICO_SIZES)


if __name__ == "__main__":
    main()
