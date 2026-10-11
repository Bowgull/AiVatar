# Round 6: three backings for the bookmarks, in tone A. 12x12 9-slices (slice 4) + fill tiles.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix4', exist_ok=True)
random.seed(5)
T=(0,0,0,0); OUT=(14,8,4,255)
def tile(w,h,base,specks,rate):
    im=Image.new('RGBA',(w,h),base); p=im.load()
    for _ in range(int(w*h*rate)):
        p[random.randrange(w),random.randrange(h)]=random.choice(specks)
    return im
# 1 leather: dark oxblood-brown, mottled, stitched border
LE=[(40,20,14,255),(52,27,18,255),(64,34,22,255),(30,15,10,255)]
tile(32,32,LE[1],[LE[0],LE[2],LE[3]],.35).save('pix4/leather.png')
f=Image.new('RGBA',(12,12),T); q=f.load()
for i in range(12):
    q[i,0]=q[i,11]=q[0,i]=q[11,i]=OUT
    q[i,1]=q[1,i]=(84,48,30,255); q[i,10]=q[10,i]=(26,13,9,255)
for i in range(2,10):
    if i%2==0: q[i,2]=q[2,i]=q[i,9]=q[9,i]=(176,140,92,255)   # stitches
q[0,0]=q[11,0]=q[0,11]=q[11,11]=T
f.save('pix4/leather_frame.png')
# 2 inset panel: a darker carved recess of the same wood (uses tone A wood darkened)
w=Image.open('pix3/a_band_darker_wood.png').convert('RGBA'); px=w.load()
for y in range(w.height):
    for x in range(w.width):
        r,g,b,a=px[x,y]; px[x,y]=(int(r*.62),int(g*.62),int(b*.62),a)
w.save('pix4/inset_wood.png')
# 3 felt: deep plum cloth with a woven pixel texture and a brass-tacked edge
FE=[(40,22,52,255),(48,27,62,255),(56,32,72,255),(34,18,44,255)]
im=Image.new('RGBA',(16,16),FE[1]); p=im.load()
for y in range(16):
    for x in range(16):
        if (x+y)%4==0: p[x,y]=FE[2]
        elif (x-y)%4==0: p[x,y]=FE[3]
im.save('pix4/felt.png')
f=Image.new('RGBA',(12,12),T); q=f.load()
for i in range(12):
    q[i,0]=q[i,11]=q[0,i]=q[11,i]=OUT
    q[i,1]=q[1,i]=(80,50,98,255); q[i,10]=q[10,i]=(24,12,32,255)
for c in ((2,2),(9,2),(2,9),(9,9)): q[c]=(226,186,98,255)
q[0,0]=q[11,0]=q[0,11]=q[11,11]=T
f.save('pix4/felt_frame.png')
print('ok')
