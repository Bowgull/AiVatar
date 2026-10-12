# The address-bar shield, mirror-perfect (his call, 2026-10-12): the left half is built, then copied to the right
# exactly, so both sides match pixel for pixel. Emblem: Aang's own arrow (mirror-symmetric by nature), pointing down.
from shield import *
import sys
PAL.update({'B0': (24, 34, 92), 'B1': (98, 140, 226), 'B2': (176, 204, 255)})
top=[10,13,14,15]; mid=14; taper=[16,16,15,15,15,14,14,13,13,12,11,10,9,8,7,5,3,1]
spec=dict(rim=[2,3],rimramp=[('G4','G3','G2'),('G3','G2','G1')],rope=[4,5],ropepat=['G3','G2','G1'],ropeskew=1,groove=[6],groovecol='K')
g,d=build(32,36,top,mid,taper,spec)
W,H=32,36
def rivet(x,y):
    for (dx,dy),c in zip(((0,0),(1,0),(0,1),(1,1)),('G4','G1','G1','G0')): g[y+dy][x+dx]=c
def rim_left(y):
    for x in range(W):
        if d[y][x]==2: return x
for y in (5,15): rivet(rim_left(y),y)
# Aang's arrow, left half only (columns up to 15); the mirror makes the right half.
# shaft: 2 wide in the middle (cols 15,16) from the field's top down to the head; light core, blue, dark edge.
for y in range(9,18):
    g[y][14]='B0'; g[y][15]='B2'
# head: a downward chevron. Each row: dark edge, blue body, light centre.
for i,half in enumerate((7,6,5,4,3,2,1)):
    y=17+i
    for x in range(16-half,16):
        g[y][x]='B1'
    g[y][16-half]='B0'
    g[y][15]='B2' if half>1 else 'B1'
    g[y+1][16-half]='B0' if half>1 else g[y+1][16-half]
g[24][15]="B0"
# THE MIRROR: right half = left half flipped. Exact symmetry, by construction.
for y in range(H):
    for x in range(W//2):
        g[y][W-1-x]=g[y][x]
import pickle; pickle.dump(g,open('bar_arrow.pkl','wb'))
# prove it
assert all(g[y][x]==g[y][W-1-x] for y in range(H) for x in range(W)), 'not symmetric'
render(g,12,sys.argv[1] if len(sys.argv)>1 else 'bar_arrow.png')
im=Image.new('RGBA',(W,H),(0,0,0,0))
for y in range(H):
    for x in range(W):
        if g[y][x]: im.putpixel((x,y),PAL[g[y][x]]+(255,))
im.save('bar_arrow_1x.png'); print('symmetric: yes')
