from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build"
SIZE = 1024


def mix(start: tuple[int, int, int], end: tuple[int, int, int], amount: float) -> tuple[int, int, int, int]:
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end)) + (255,)


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gradient = Image.new("RGBA", image.size)
    pixels = gradient.load()
    for y in range(SIZE):
        color = mix((69, 164, 255), (11, 101, 232), y / (SIZE - 1))
        for x in range(SIZE):
            pixels[x, y] = color

    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((52, 52, 972, 972), radius=228, fill=255)
    image.alpha_composite(Image.composite(gradient, Image.new("RGBA", image.size), mask))

    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 510)
    draw.text((SIZE / 2, SIZE / 2 - 14), "L", font=font, fill="white", anchor="mm")

    image.save(OUTPUT / "icon.png")
    image.save(OUTPUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
