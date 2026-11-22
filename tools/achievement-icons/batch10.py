import icons, batch2, batch3, batch4, redo, batch5, batch6, batch7, batch8, batch9, ants
from batch2 import blank, stamp, out
from icons import P
P.update({'S':'#c9a03a','Y':'#9a7a28','e':'#e9d9b0','E':'#c4b48c'})
K={}
ANT3="""r.r
.r.
rrr
.r.
rrr"""
g=blank()
for (x,y,c) in [(2,0,'r'),(10,0,'g'),(2,8,'f'),(10,8,'h')]:
    stamp(g,ANT3,x+1,y,{'r':c}); stamp(g,"ooooo\n.OOO.",x,y+5)
K['posts']=out(g)
K['bridge']="""
................
................
................
................
.....rrrrrr.....
...rrr....rrr...
..rr........rr..
.rr..........rr.
.r............r.
mm............mm
mmm..........mmm
mmmBBBBBBBBBBmmm
mmmBiBBBBBBiBmmm
mmmLLLLLLLLLLmmm
mmmLLLiLLLLLLmmm
dddddddddddddddd"""
K['rumour']="""
................
..CCCCCCCCCCCC..
.CccccccccccccC.
.CcgcccccccgccC.
.CCCCCCCCCCCCCC.
..C..........C..
..CCCCCCCCCCCC..
.CkkkkkkkkkkkkC.
.CkkkkkkkkkkkkC.
.gggggggggggggg.
.CccccccgcccccC.
.CcccccgggcccccC
.CccccccgcccccC.
.CccccccccccccC.
.CCCCCCCCCCCCCC.
................"""
K['rumour']="\n".join(r[:16] for r in K['rumour'].strip('\n').split('\n'))
K['rumour10']="""
................
.bbbbbbbbbb.....
bbbbbbbbbbbb....
bbkbbkbbkbbb....
bbbbbbbbbbbb....
.bbbbbbbbbb.....
..bb............
.b.....tttttttt.
......tttttttttt
......ttOttOttOt
......tttttttttt
.......tttttttt.
.............tt.
..............t.
................
................"""
K['ivory']="""
................
................
............ee..
...........eee..
..........eeE...
.........eeE....
........eeE.....
.......eeE......
......eeeE......
.....eeeE.......
....eeeeE.......
...eeeeE........
..CeeeE.........
..CCeE..........
...CC...........
................"""
TILES=[('f','F'),('S','Y'),('B','L'),('o','O')]
g=blank()
for i,(a,b) in enumerate(TILES):
    x=1+(i%2)*8; y=1+(i//2)*8
    for yy in range(6):
        for xx in range(6): g[y+yy][x+xx]=a
    g[y+1][x+1]=b; g[y+3][x+4]=b; g[y+4][x+2]=b
K['grounds']=out(g)
K['campaign']="""
..c.............
..cssssssssss...
..csssssssssss..
..cssgggsssss...
..csgssgssssss..
..cssgggsssss...
..cssssssssssss.
..cssssssssss...
..c.............
..c.............
..c.............
..c.............
..c.............
..c.............
.ccc............
................"""
K['spider']="""
................
.S...........S..
..S....S....S...
...S..SSS..S....
.SS.SSSSSSS.SS..
S....SSSSS....S.
...SSSYSYSSS....
..S..SSSSS..S...
.S...SSSSS...S..
S...SSSSSSS...S.
...S.SSSSS.S....
..S...SSS...S...
..S....S....S...
.S...........S..
................
................"""
K['warband']="""
.oo..oo..oo..oo.
.oo..oo..oo..oo.
oooooooooooooooo
oOooooOoooooOooo
ooooCCCCCCCooooo
oooCCcCcCcCCoooo
oOoCcCcCcCcCoOoo
oooCCcCcCcCCoooo
ooOCcCcCcCcCoooo
oooCCcCcCcCCoOoo
oooCcCcCcCcCoooo
oOoCCcCcCcCCoooo
oooCcCcCcCcCoooo
oooCCCCCCCCCoooo
mmmmmmmmmmmmmmmm
dddddddddddddddd"""
K['warband']="\n".join(r[:16] for r in K['warband'].strip('\n').split('\n'))
K['night']="""
......uuu.......
....uuu.........
...uuu..........
...uu...........
..uuu.......u...
..uuu...........
..uuu...........
...uuu.....u....
...uuuu.........
....uuuuuu......
......uuu.......
................
.oo..oo..oo..oo.
oooooooooooooooo
oOooooOoooooOooo
oooooooooooooooo"""
SK=""".bb.
bbbb
kbbk
bbbb
b.b."""
g=blank()
for x in (1,6,11): stamp(g,SK,x,6)
for x in range(16): g[11][x]='C'
g[12][1]='C'; g[12][14]='C'
K['skulls']=out(g)
K['hold1']="""
.......crr......
.......crrr.....
.......crr......
.......c........
.......cc.......
......cCCc......
......cCCc......
.....cCCcCc.....
.....cCkkCc.....
....cCCkkCCc....
....cCcCCCCc....
...cCCCCcCCCc...
...cCCkCCCkCc...
..cCCCCCCCCCCc..
dddddddddddddddd
ddmdddddmdddddmd"""
K['hold3']="""
..rr......rr....
..c.......c.....
.cCc.....cCc....
.cCc..rr.cCc....
cCCCc.c.cCCCc...
cCkCccCccCkCc...
cCCCcCCCcCCCc...
cCCCcCkCcCCCc...
cCkCcCCCcCkCc...
cCCCcCCCcCCCc...
dddddddddddddddd
................
................
................
................
................"""
K['hold3']="""
................
................
..rr...........r
..c.....rr....rc
.cCc....c.....cC
.cCc...cCc...cCc
cCCCc..cCc...cCc
cCkCc.cCCCc.cCCC
cCCCc.cCkCc.cCkC
cCCCccCCCCcccCCC
cCkCcCCCkCCcCCCC
cCCCcCCCCCCcCkCC
dddddddddddddddd
ddmdddddmdddddmd
................
................"""
K['hold3']="""
................
................
..rr......rr....
..c.......c.....
.cCc.....cCc....
.cCc..rr.cCc....
cCCCc.c.cCCCc...
cCkCccCccCkCc...
cCCCcCCCcCCCc...
"""
g=blank()
SP=""".rr..
.c...
.cc..
cCCc.
cCCc.
cCkCc
cCCCc
cCCCc"""
SPIRE=["c.rr.","c....","Cc...","CCc..","CkCc.","CCCc."]
SP2=""".crr
.c..
cCc.
cCc.
cCCc
CkCc
CCCc
CCCc"""
for x,y in [(0,5),(6,2),(12,5)]:
    stamp(g,""".crr
.c..
cCc.
cCc.
cCCc
CkCc
CCCc
CCCc""".replace('.c..','.c..'),x,y)
for x in range(16): g[13][x]='d'; g[14][x]='d'
g[14][2]='m'; g[14][9]='m'
K['hold3']=out(g)
K['garrison']="""
................
................
..r..r....r..r..
...rr......rr...
..rrrr....rrrr..
..rrrr....rrrr..
.oo..oo..oo..oo.
.oo..oo..oo..oo.
oooooooooooooooo
oOooooOoooooOooo
oooooooooooooooo
ooOooooooOoooooo
oooooooooooooooo
oooooOoooooooOoo
mmmmmmmmmmmmmmmm
dddddddddddddddd"""
icons.ICONS.update({k:v.strip('\n') for k,v in K.items()})
g=blank()
SP3="""..rr
.cr.
.c..
.cc.
cCCc
cCkc
cCCc
CCCC"""
SP3=""".crr
.cr.
.c..
cCc.
cCc.
cCCc
CkCc
CCCc"""
for x,y in [(0,6),(6,3),(11,6)]:
    stamp(g,""".c.rr
.c.r.
.c...
.cC..
cCCc.
cCkc.
cCCCc
cCCCc""".replace('.c.rr','.crr.').replace('.c.r.','.cr..'),x,y)
for x in range(16): g[14][x]='d'; g[15][x]='d'
g[15][2]='m'; g[15][9]='m'
K['hold3']=out(g)
HEAD5="""r...r
.r.r.
.rrr.
rkrkr
.rrr."""
g=[list(r) for r in K['garrison'].strip('\n').split('\n')]
for y in range(0,6):
    for x in range(16): g[y][x]='.'
stamp(g,HEAD5,1,1); stamp(g,HEAD5,10,1)
K['garrison']=out(g)
icons.ICONS.update({k:v.strip('\n') for k,v in K.items()})
MND="""..crr
..c..
..c..
.cCc.
.cCc.
cCkCc
cCCCc
cCCCc"""
g=blank()
for x,y in [(0,6),(6,2),(11,6)]: stamp(g,MND,x,y)
for x in range(16): g[14][x]='d'; g[15][x]='d'
g[15][2]='m'; g[15][9]='m'
K['hold3']=out(g)
g=blank()
stamp(g,batch3.ANT7,2,0); stamp(g,batch3.ANT7,9,0)
stamp(g,""".oo..oo..oo..oo.
.oo..oo..oo..oo.
oooooooooooooooo
oOooooOoooooOooo
oooooooooooooooo
oooooOoooooooOoo
oooooooooooooooo""",0,7)
for x in range(16): g[14][x]='m'; g[15][x]='d'
K['garrison']=out(g)
icons.ICONS.update({k:v.strip('\n') for k,v in K.items()})
g=[list(r) for r in K['hold3'].split('\n')]
for y in range(10,14): stamp(g,"cCCCc",6,y)
g[11][8]='k'
K['hold3']=out(g)
icons.ICONS.update({k:v.strip('\n') for k,v in K.items()})
