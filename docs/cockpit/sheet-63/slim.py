# Sheet 63: sheet 59's slim.py (256 colours, no dithering, only when every pixel stays within a few levels), plus the
# see-through cut-outs (s-*.png), which keep their alpha: those are quantized with alpha as a fourth channel.
import sys
from pathlib import Path
from PIL import Image
for p in map(Path, sys.argv[1:]):
    before = p.stat().st_size
    src = Image.open(p)
    clear = src.mode == 'RGBA' and src.getextrema()[3][0] < 255
    im = src.convert('RGBA' if clear else 'RGB')
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE if clear else Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)
    a, b = im.tobytes(), q.convert(im.mode).tobytes()
    err = max(abs(a[i] - b[i]) for i in range(0, len(a), 7))
    if err > 24:
        print(f'{p.name}: kept ({before // 1024} KB, quantizing would shift colours by {err})'); continue
    q.save(p, optimize=True)
    print(f'{p.name}: {before // 1024} KB -> {p.stat().st_size // 1024} KB (max shift {err})')
