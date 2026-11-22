import icons, batch2, batch3, batch4
from batch2 import blank, stamp, out
EGG=""".bb.
bbbb
bbbb
bbbt
.tt."""
g=blank()
for r in range(2):
    for c in range(3): stamp(g,EGG,1+c*5,2+r*7)
icons.ICONS['tendedA']=out(g)
g=blank()
for (x,y) in [(6,0),(3,5),(9,5),(0,10),(6,10),(12,10)]: stamp(g,EGG,x,y)
icons.ICONS['tendedB']=out(g)
g=blank()
for x in (1,6,11): stamp(g,EGG,x,10)
stamp(g,batch3.ANT7,5,1)
icons.ICONS['tendedC']=out(g)
icons.ICONS['tended']=icons.ICONS['tendedB']
