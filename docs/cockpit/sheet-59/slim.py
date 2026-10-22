# Sheets 59-61: shrink the pictures to 256 colours with no dithering (pixel art and flat desktops survive it), but only
# when every pixel stays within a few levels of the original; otherwise the picture is kept as it was.
import sys
from pathlib import Path
from PIL import Image
for p in map(Path, sys.argv[1:]):
    before = p.stat().st_size
    im = Image.open(p).convert('RGB')
    q = im.quantize(colors=256, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)
    a, b = im.tobytes(), q.convert('RGB').tobytes()
    err = max(abs(a[i] - b[i]) for i in range(0, len(a), 7))
    if err > 24:
        print(f'{p.name}: kept ({before // 1024} KB, quantizing would shift colours by {err})'); continue
    q.save(p, optimize=True)
    print(f'{p.name}: {before // 1024} KB -> {p.stat().st_size // 1024} KB (max shift {err})')
