#!/usr/bin/env python3
"""Assemble the numbered development screenshots into a small animated GIF.

Requires Pillow. The original PNGs remain untouched.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent / 'screenshots'
paths = sorted(folder.glob('[0-9][0-9][0-9]-*.png'))
if not paths:
    raise SystemExit('No numbered screenshots found')
frames = []
for path in paths:
    im = Image.open(path).convert('RGB')
    im.thumbnail((900, 660), Image.Resampling.LANCZOS)
    # Captures came from several window sizes; keep one canvas and letterbox
    # them so the GIF does not crop or jump as the aspect ratio changes.
    canvas = Image.new('RGB', (900, 706), '#111d25')
    canvas.paste(im, ((900 - im.width) // 2, (660 - im.height) // 2))
    draw = ImageDraw.Draw(canvas)
    label = path.stem.replace('-', '  ').upper()
    draw.text((18, 674), label, fill='#f0d4bf', font=ImageFont.load_default(size=16))
    frames.append(canvas.quantize(colors=192, method=Image.Quantize.MEDIANCUT))
durations = [1300] * len(frames)
durations[-1] = 2600
output = folder / 'production-timelapse.gif'
frames[0].save(output, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=2)
print(f'Wrote {output} from {len(paths)} screenshots')
