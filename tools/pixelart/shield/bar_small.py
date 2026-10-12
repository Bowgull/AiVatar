# The address-bar shield, one size down (his note, 2026-10-12: "a bit smaller"): 24 x 28, same recipe, rebuilt at the
# smaller size (never shrunk): left half built, then mirrored exactly. Rim 1, rope 2, groove 1, Aang's arrow.
from shield import *
import sys
PAL.update({'B0': (24, 34, 92), 'B1': (98, 140, 226), 'B2': (176, 204, 255)})
W,H=24,28
top=[7,10,11]; mid=11; taper=[12,12,11,11,10,10,9,8,7,6,5,3,2,1]
spec=dict(rim=[2],rimramp=[('G4','G3','G2')],rope=[3,4],ropepat=['G3','G2','G1'],ropeskew=1,groove=[5],groovecol='K')
g,d=build(W,H,top,mid,taper,spec)
def rivet(x,y):
    for (dx,dy),c in zip(((0,0),(1,0),(0,1),(1,1)),('G4','G1','G1','G0')): g[y+dy][x+dx]=c
# arrow: shaft 2 wide rows 6..11, head rows 11..15 (left half; the mirror makes the right)
for y in range(5,11):
    g[y][10]='B0'; g[y][11]='B2'
for i,half in enumerate((4,4,3,2,1)):
    y=10+i
    for x in range(12-half,12): g[y][x]='B1'
    g[y][12-half]='B0'
    g[y][11]='B2' if half>1 else 'B1'
g[15][11]='B0'
for y in range(H):
    for x in range(W//2): g[y][W-1-x]=g[y][x]
assert all(g[y][x]==g[y][W-1-x] for y in range(H) for x in range(W))
render(g,14,'bar_small.png')
im=Image.new('RGBA',(W,H),(0,0,0,0))
for y in range(H):
    for x in range(W):
        if g[y][x]: im.putpixel((x,y),PAL[g[y][x]]+(255,))
im.save('bar_small_1x.png'); print('symmetric')
