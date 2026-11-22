# Writes every achievement icon to src/assets/achievements/<id>.png.
# Each icon is a 16x16 text grid (one letter per colour, '.' is clear) in icons.py and the batch files;
# later files override earlier ones. Run from this folder: python3 export.py  (needs Pillow)
import re, os
import icons, batch2, batch3, batch4, redo, batch5, batch6, batch7, batch8, batch9, batch10, batch11  # noqa: F401
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, '../../src/systems/stats/index.ts')).read()
body = src[src.index('const FEATS'):src.index('];', src.index('const FEATS'))]
ids = re.findall(r"\{ id: '([a-z0-9]+)'", body)
missing = [i for i in ids if i not in icons.ICONS]
if missing: raise SystemExit('No icon drawn for: ' + ', '.join(missing))
for i in ids: icons.img(i).save(os.path.join(here, '../../src/assets/achievements', i + '.png'), optimize=True)
print(f'wrote {len(ids)} icons')
