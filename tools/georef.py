import math
L0,G0=37.5180,127.1220
KX=111320*math.cos(math.radians(L0)); KY=110574
def en(lat,lon): return ((lon-G0)*KX,(lat-L0)*KY)
def ll(e,n): return (L0+n/KY, G0+e/KX)
def solve(A,b):
    n=len(A[0]); M=[[sum(A[k][i]*A[k][j] for k in range(len(A))) for j in range(n)] for i in range(n)]; v=[sum(A[k][i]*b[k] for k in range(len(A))) for i in range(n)]
    for i in range(n):
        p=max(range(i,n),key=lambda r:abs(M[r][i])); M[i],M[p]=M[p],M[i]; v[i],v[p]=v[p],v[i]
        for r in range(n):
            if r!=i:
                f=M[r][i]/M[i][i]; M[r]=[a-f*c for a,c in zip(M[r],M[i])]; v[r]-=f*v[i]
    return [v[i]/M[i][i] for i in range(n)]
class Model:
    """affine + 가우시안 가중 잔차 보정 (sigma: 픽셀)"""
    def __init__(s,pts,sigma=90):
        s.pts=pts; s.sig=sigma
        A=[[x,y,1] for _,x,y,_,_ in pts]
        s.ce=solve(A,[p[3] for p in pts]); s.cn=solve(A,[p[4] for p in pts])
        s.res=[(p[1],p[2],p[3]-s._aff(p[1],p[2])[0],p[4]-s._aff(p[1],p[2])[1]) for p in pts]
    def _aff(s,x,y): return (s.ce[0]*x+s.ce[1]*y+s.ce[2], s.cn[0]*x+s.cn[1]*y+s.cn[2])
    def en(s,x,y):
        e,n=s._aff(x,y); W=0; de=dn=0
        for px,py,re,rn in s.res:
            w=math.exp(-((x-px)**2+(y-py)**2)/(2*s.sig**2)); W+=w; de+=w*re; dn+=w*rn
        if W>1e-9: k=W/(W+0.35); e+=k*de/W; n+=k*dn/W
        return e,n
    def ll(s,x,y): return ll(*s.en(x,y))
def load(path):
    rows=[l.rstrip("\n").split("\t") for l in open(path,encoding="utf-8") if l.strip()]
    return [(r[0],float(r[1]),float(r[2]),*en(float(r[3]),float(r[4]))) for r in rows]
