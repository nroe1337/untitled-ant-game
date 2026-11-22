import icons
from icons import P
P.update({'n':'#7e2a3c','o':'#5d5b57','O':'#8a8780','u':'#f6e7a0','h':'#7b6fd0','H':'#544a9e','t':'#d8cfc0','W':'#3d4a2a'})
def blank(): return [['.']*16 for _ in range(16)]
def stamp(g,pat,x,y,recol=None):
    for j,row in enumerate(pat.strip('\n').split('\n')):
        for i,ch in enumerate(row):
            if ch!='.': g[y+j][x+i]= recol.get(ch,ch) if recol else ch
    return g
def out(g): return '\n'.join(''.join(r) for r in g)
ANT5=""".r.r.
..r..
r.r.r
.rrr.
r.r.r
.rrr.
..r.."""
ANT3="""r.r
.r.
rrr
.r.
rrr"""
B={}
g=blank(); stamp(g,ANT5,1,1); stamp(g,ANT5,10,2); stamp(g,ANT5,5,8); B['twenty']=out(g)
g=blank()
for x,y in [(0,0),(5,1),(10,0),(13,5),(2,6),(7,6),(0,11),(5,11),(10,11),(13,10)]: stamp(g,ANT3,x,y)
B['hundred']=out(g)
g=blank(); stamp(g,"""
....mmmmmmmm....
..mmkkkkkkkkmm..
.mkkkkkkkkkkkkm.
mkkkkkkkkkkkkkkm
mkkkkkkkkkkkkkkm
mkkkkkkkkkkkkkkm
mkkkkkkkkkkkkkkm
mkkkkkkkkkkkkkkm
mkkkkkkkkkkkkkkm
.mkkkkkkkkkkkkm.
..mmkkkkkkkkmm..
....mmmmmmmm....""",0,2)
for x,y in [(2,4),(5,3),(8,3),(11,4),(3,8),(6,8),(9,8),(12,8)]: stamp(g,ANT3,x,y)
B['full']=out(g)
B['sky']="""
......y..y......
...y...gg...y...
.....gggggg.....
....gguuuugg....
.y.gguuuuuugg.y.
...gguuuuuugg...
....gggggggg....
..y....gg....y..
WWWWWWW..WWWWWWW
ddddddd..ddddddd
dddmddd..ddddmdd
ddddddkkkddddddd
ddmddddkkddddmdd
dddddddkkkdddddd
ddddmdddkkkddddd
dddddddddkkddddd"""
g=blank(); stamp(g,""".r.r.
..r..
r.r.r
.rrr.
r.r.r
.rrr.
..r..""",1,3)
stamp(g,"""..r..
.rrr.
r.r.r
.rrr.
r.r.r
..r..
.r.r.""",10,6,{'r':'h'})
B['rival']=out(g)
B['deep']="""
WWWWWWW..WWWWWWW
mmmmmmm..mmmmmmm
mmmmmmm..mmmmmmm
mmkkkkk..mmmmmmm
mmkkkkkkkmmmmmmm
mmmmmmmkkmmmmmmm
mmmmmmmkkkkkkmmm
mmmmmmmkkkkkkmmm
mmmmmmmkkmmmmmmm
mmmkkkkkkmmmmmmm
mmmkkkkkkmmmmmmm
mmmmmmmkkmmmmmmm
mmmmmmmkkkkkkkmm
dddddddkkkkkkkdd
ddddddddddkkkddd
dddddddddddddddd"""
B['wave25']="""
................
.OOOOOOOOOOOOOO.
.OttttttttttttO.
.OttttttttttttO.
.OttssttttsstO..
.OtttssttsstttO.
.OttttssssttttO.
.OtttttssttttttO
.OttttssssttttO.
..OtttsttsttttO.
..OttssttssttO..
...OtttttttttO..
....OtttttttO...
.....OtttttO....
......OOOOO.....
................"""
B['flight5']="""
................
................
..vv........vv..
.vwwv......vwwv.
.vwwwv....vwwwv.
..vwwwv..vwwwv..
..vwwwwvvwwwwv..
...vwwwvvwwwv...
....vwwvvwwv....
.....vvvvvv.....
......mmmm......
.....mmmmmm.....
....mmmmmmmm....
dddddddddddddddd
ddmdddddmdddddmd
................"""
B['flight10']="""
................
..vv....vv......
.vwwv..vwwv.....
.vwwwvvwwwv..vv.
..vwwvvwwv..vwwv
...vwwvwv..vwwwv
...vvwvwvvvwwwv.
.vv.vvvvvwwwwv..
vwwvvwwvvwwwv...
vwwwvvwwwvvv....
.vwwwvvwwwv.....
..vvvvvvvvvvv...
...mmmmmmmmmm...
..mmmmmmmmmmmm..
dddddddddddddddd
ddmdddddmdddddmd"""
B['swift']="""
................
................
.........vvvv...
.......vvwwwwv..
.....vvwwwwwwwv.
...vvwwwwwwwwwv.
..vwwwwwwwwwwv..
.vwwwwwwwwwvv...
..vvwwwwwvv.....
....vvvvv.......
................
.vvvvv..vvvvvv..
................
...vvvvvvv..vvv.
................
................"""
B['fed']="""
................
................
.......cc.......
.....ccgcc......
....cgccgcc.....
...ccgcgccgc....
..gcccgccgcccg..
..cgcccgccgccc..
.gccgcgccgccgcc.
.ccgccccgccgccg.
gcgccgccgccgccgc
GGGGGGGGGGGGGGGG
.GGGGGGGGGGGGGG.
..GGGGGGGGGGGG..
................
................"""
B['trophy1']="""
................
..t.........t...
..tt.......tt...
...tt.....tt....
...ttt...ttt....
....tt...tt.....
....ttnnntt.....
.....nnnnn......
....nnnnnnn.....
..CCCCCCCCCCC...
.CcccccccccccC..
.CcccccMcccccC..
.CcccccccccccC..
..CCCCCCCCCCC...
................
................"""
icons.ICONS.update({k:v.strip('\n') for k,v in B.items()})
import ants
ANTS="""r...r
.rrr.
..r..
rrrrr
..r..
.rrr.
rrrrr
.rrr."""
g=blank(); stamp(g,ANTS,0,1); stamp(g,ANTS,11,1); stamp(g,ANTS,5,7); B['twenty']=out(g)
g=blank(); stamp(g,ants.ANT,0,3); stamp(g,ants.ANT,9,3,{'r':'h'}); B['rival']=out(g)
B['hundred']="""
......r.........
.r.......r......
.....mmmmmm..r..
...rmMMkkMMm....
...mMMMMrMMMm...
..mMMrMMMMMrMm..
..mMMMMMMrMMMm..
.mMrMMMrMMMMMMm.
.mMMMMMMMMMrMMm.
mMMMrMMMMrMMMMMm
mMMMMMMrMMMMrMMm
dddddddddddddddd
ddmdrdddmddrddmd
r.......r.......
...r.........r..
................"""
B['full']="""
................
....mmmmmmmm....
..mmrrkrrkrrmm..
.mrkrrkrrkrrkrm.
mkrrkrrkrrkrrkrm
mrrkrrkrrkrrkrrm
mkrrkrrkrrkrrkrm
mrrkrrkrrkrrkrrm
mkrrkrrkrrkrrkrm
mrrkrrkrrkrrkrrm
.mrkrrkrrkrrkrm.
..mmrrkrrkrrmm..
....mmmmmmmm....
dddddddddddddddd
................
................"""
B['flight10']="""
................
.y.....yy.....y.
.gg...gggg...gg.
.ggggggggggggggg
.ggggggggggggggg
.GGGGGGGGGGGGGGG
................
..vv........vv..
.vwwv......vwwv.
.vwwwv....vwwwv.
..vwwwv..vwwwv..
..vwwwwvvwwwwv..
...vwwwvvwwwv...
....vwwvvwwv....
.....vvvvvv.....
................"""
B['swift']="""
................
..............v.
............vvw.
..........vvwwv.
........vvwwwwv.
......vvwwwvwwv.
....vvwwwvwwwv..
...vwwwvwwwwv...
..vwwvwwwwvv....
.vwvwwwwvv......
.vwwwwvv........
..vvvv..........
................
.vvvv..vvvvvvv..
................
................"""
icons.ICONS.update({k:v.strip('\n') for k,v in B.items()})
g=blank(); stamp(g,ANTS,0,0); stamp(g,ANTS,11,0); stamp(g,ANTS,5,8); B['twenty']=out(g)
g=blank()
span={r:(1,14) for r in range(1,10)}; span.update({10:(2,13),11:(3,12),12:(4,11),13:(5,10),14:(6,9)})
for y,(a,b) in span.items():
    for x in range(a,b+1):
        edge = y in(1,14) or x in(a,b) or (y+1 in span and (x<span[y+1][0] or x>span[y+1][1]))
        g[y][x]='O' if edge else 't'
for y in range(3,10):
    x=3+(y-3)
    for xx in (x,x+1,15-x,14-x): g[y][xx]='s'
B['wave25']=out(g)
icons.ICONS.update({k:v.strip('\n') for k,v in B.items()})
