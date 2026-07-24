from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "logo.png"
OUTPUT = ROOT / "build"
SIZE = 1024
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def to_square(image: Image.Image) -> Image.Image:
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing logo source: {SOURCE}")

    OUTPUT.mkdir(exist_ok=True)
    image = to_square(Image.open(SOURCE).convert("RGBA")).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    image.save(OUTPUT / "icon.png")
    image.save(OUTPUT / "icon.ico", sizes=ICO_SIZES)


if __name__ == "__main__":
    main()
