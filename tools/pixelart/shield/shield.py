import math, sys
from PIL import Image
HEX={'K':'1a0f14','G0':'4a2216','G1':'7d4422','G2':'b27a2c','G3':'e0b24e','G4':'fff0a8',
     'P0':'2a1129','P1':'47203f','P2':'643055','C0':'b99a74','C1':'f1e2bf'}
PAL={k:tuple(int(v[i:i+2],16) for i in (0,2,4)) for k,v in HEX.items()}

def silhouette(W,H,top,mid,taper):
    half=top+[W//2]*mid+taper
    assert len(half)==H,(len(half),H)
    m=[[False]*W for _ in range(H)]
    for y,h in enumerate(half):
        for x in range(W//2-h, W//2+h): m[y][x]=True
    return m

def layers(m):
    H=len(m);W=len(m[0]); d=[[0]*W for _ in range(H)]
    cur=[r[:] for r in m]; k=1
    while any(any(r) for r in cur):
        rem=[]
        for y in range(H):
            for x in range(W):
                if not cur[y][x]: continue
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    X,Y=x+dx,y+dy
                    if not(0<=X<W and 0<=Y<H) or not cur[Y][X]:
                        rem.append((x,y));break
        for x,y in rem: d[y][x]=k; cur[y][x]=False
        k+=1
    return d

def trace(d,level):
    pts=[(x,y) for y in range(len(d)) for x in range(len(d[0])) if d[y][x]==level]
    # order by angle-free nearest walk starting at top-centre-left
    start=min(pts,key=lambda p:(p[1],abs(p[0]-len(d[0])/2)))
    order=[start]; left=set(pts); left.remove(start)
    while left:
        x,y=order[-1]
        nb=[p for p in left if abs(p[0]-x)<=1 and abs(p[1]-y)<=1]
        if not nb: nb=sorted(left,key=lambda p:(p[0]-x)**2+(p[1]-y)**2)[:1]
        # prefer 4-neighbours, and clockwise (x increasing on top)
        nb.sort(key=lambda p:(abs(p[0]-x)+abs(p[1]-y), -(p[0]-x) if len(order)==1 else 0))
        p=nb[0]; order.append(p); left.remove(p)
    return {p:i for i,p in enumerate(order)}

def build(W,H,top,mid,taper,spec):
    m=silhouette(W,H,top,mid,taper); d=layers(m)
    cx=W/2-0.5; cy=H*0.42
    g=[[None]*W for _ in range(H)]
    rim=spec['rim']; rope=spec['rope']
    ropet={}
    for lv in rope:
        ropet[lv]=trace(d,lv)
    Lx,Ly=-0.6,-0.8
    for y in range(H):
        for x in range(W):
            k=d[y][x]
            if k==0: continue
            nx,ny=x-cx,(y-cy)*0.9; n=math.hypot(nx,ny) or 1
            lit=(nx*Lx+ny*Ly)/n
            if k==1: g[y][x]='K'
            elif k in rim:
                i=rim.index(k)
                # bevel: outer rows catch light on lit side, inner rows shadow on dark side
                ramp=spec['rimramp'][i]
                g[y][x]= ramp[0] if lit>0.3 else ramp[2] if lit<-0.3 else ramp[1]
            elif k in rope:
                i=rope.index(k); t=ropet[k][(x,y)]
                pat=spec['ropepat']
                g[y][x]=pat[(t+i*spec['ropeskew'])%len(pat)]
            elif k in spec.get('groove',[]): g[y][x]=spec['groovecol']
            else: g[y][x]='P1'
    return g,d

def render(g,scale,path):
    H=len(g);W=len(g[0]); im=Image.new('RGBA',(W,H),(0,0,0,0))
    for y in range(H):
        for x in range(W):
            if g[y][x]: im.putpixel((x,y),PAL[g[y][x]]+(255,))
    bg=(58,40,30,255)
    big=im.resize((W*scale,H*scale),Image.NEAREST)
    c=Image.new('RGBA',(W*scale+W*3+40,max(H*scale,H*2)+10),bg)
    c.alpha_composite(big,(0,0)); c.alpha_composite(im,(W*scale+10,0)); c.alpha_composite(im.resize((W*2,H*2),Image.NEAREST),(W*scale+20+W,0))
    c.save(path)
