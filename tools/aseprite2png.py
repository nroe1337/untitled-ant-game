"""Convert .aseprite files (RGBA, first frame, all visible layers) to PNG.

Usage: python3 tools/aseprite2png.py OUT_DIR file1.aseprite [file2 ...]
Output name = input name minus any "xxxxxxxx-" upload prefix, with .png.
"""
import re
import struct
import sys
import zlib
from pathlib import Path

from PIL import Image


def convert(path: Path) -> Image.Image:
    d = path.read_bytes()
    _, magic, frames, w, h, depth = struct.unpack('<IHHHHH', d[:14])
    if magic != 0xA5E0:
        raise ValueError('not an aseprite file')
    if depth != 32:
        raise ValueError(f'only RGBA (32-bit) files supported, got {depth}')
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    layers = []
    pos = 128
    # first frame only
    fsize, fmagic, old_chunks, _dur = struct.unpack('<IHHH', d[pos:pos + 10])
    new_chunks = struct.unpack('<I', d[pos + 12:pos + 16])[0]
    n = new_chunks or old_chunks
    cpos = pos + 16
    for _ in range(n):
        csize, ctype = struct.unpack('<IH', d[cpos:cpos + 6])
        body = d[cpos + 6:cpos + csize]
        if ctype == 0x2004:  # layer
            flags = struct.unpack('<H', body[:2])[0]
            layers.append(bool(flags & 1))
        elif ctype == 0x2005:  # cel
            li, x, y, opacity, celtype = struct.unpack('<HhhBH', body[:9])
            visible = layers[li] if li < len(layers) else True
            if visible and celtype in (0, 2):
                cw, ch = struct.unpack('<HH', body[16:20])
                px = body[20:]
                if celtype == 2:
                    px = zlib.decompress(px)
                cel = Image.frombytes('RGBA', (cw, ch), px[:cw * ch * 4])
                if opacity < 255:
                    a = cel.getchannel('A').point(lambda v: v * opacity // 255)
                    cel.putalpha(a)
                img.alpha_composite(cel, (x, y))
        cpos += csize
    return img


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for f in sys.argv[2:]:
        p = Path(f)
        name = re.sub(r'^[0-9a-f]{8}-', '', p.stem) + '.png'
        convert(p).save(out / name)
        print('wrote', out / name)
