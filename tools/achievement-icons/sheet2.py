import sys
from PIL import Image, ImageDraw, ImageFont
import icons, batch2
names=sys.argv[2].split(','); outp=sys.argv[1]
T=dict(l.split('|') for l in open('titles.txt').read().strip().split('\n'))
S=10; pad=24; cw=16*S+pad; cols=6
rows=(len(names)+cols-1)//cols; rh=16*S+80
sheet=Image.new('RGB',(cols*cw+pad,rows*rh+pad),'#141210'); d=ImageDraw.Draw(sheet)
bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',12)
for i,n in enumerate(names):
    x0=pad+(i%cols)*cw; y0=pad+(i//cols)*rh
    big=icons.img(n).resize((16*S,16*S),Image.NEAREST); sheet.paste(big,(x0,y0),big)
    d.text((x0,y0+16*S+6),f'{i+1}. '+T[n][:21],fill='#e6dfd3',font=bold)
    for j,s in enumerate([1,2]):
        a=icons.img(n).resize((16*s,16*s),Image.NEAREST); sheet.paste(a,(x0+j*26,y0+16*S+26),a)
    lk=icons.img(n,True).resize((32,32),Image.NEAREST); sheet.paste(lk,(x0+64,y0+16*S+26),lk)
sheet.save(outp)
