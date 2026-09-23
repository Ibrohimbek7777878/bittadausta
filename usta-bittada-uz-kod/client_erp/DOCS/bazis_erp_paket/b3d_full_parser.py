#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
  BAZIS .B3D TO'LIQ PARSER v5 — BPJ + rasmiy Bazis Script API tasdiqlangan
=============================================================================
  GRAMMATIKA (to'liq ochilgan):
    <nom_idx:4 LE> <flag:4 LE> <tip:1> <qiymat>
      0x03 = int8        0x04 = int32 LE      0x05 = double LE
      0x06 = wstring     <len:4><UTF-16LE*len>
      0x07 = BLOB        <len:4><payload>     <- kontur/mesh shu yerda!

  KONTUR BLOB (schema nomi 'FurnList' = TContour3D):
    <count:4> keyin har element:
      tag 0x10 = T2DLine: p1.x p1.y p2.x p2.y           (32 bayt)
      tag 0x12 = T2DArc : c.x c.y p1.x p1.y p2.x p2.y dir(1)  (49 bayt)

  MAYDON XARITASI (BPJ + rasmiy API bilan tasdiqlangan):
    Rx,Ry,Rz             -> TTransformation.vector (pozitsiya)
    Anim,Axis,Butt,Vis   -> TTransformation.quaternion (qx,qy,qz,qw)
    Data                 -> material / kromka nomi
    NavPos               -> qalinlik (dp)
    Fixed                -> obyekt nomi      Var -> ID
    Model (i32)          -> obyekt turi: 4002=TFurnPanel
    FurnList (0x07)      -> TContour3D (dl/dw shu yerdan!)
    Index+Objs           -> TFurnButt (kromka, chet 0..3)

  TASDIQLAR (2021_1_shkaf.b3d <-> 123.bpj):
    Фронтальная1: Rz=573.84 == BPJ z=573.841;  kontur x[16..854] y[0..84]
                  -> dl=838 dw=84 == BPJ dimensions AYNAN
    Горизонтальная4: pos(0,1051,603) + kvat(-.707,0,0,.707) == BPJ axisY=(0,0,-1)
                  kontur dl=838 dw=530 == BPJ dl=838 dw=530 AYNAN

  CHIQARADI: .glb (kontur ekstruziya + rotatsiya + rang) va .json
  (rasmiy tiplar: TFurnPanel, TTransformation, TContour3D, TFurnButtList...)
=============================================================================
"""
import json, struct, zlib, sys, os, math
from collections import Counter, defaultdict

# ---------------------------------------------------------------- inflate
def inflate_biggest(raw):
    # panel kodi (4002) bor blokni tanlaymiz (eng katta = junk bo'lishi mumkin)
    best=None;best_score=-1;best_big=None;i=0;L=len(raw)
    while i<L-2:
        if raw[i]==0x78 and raw[i+1] in (0x9c,0x01,0xda):
            try:
                o=zlib.decompressobj().decompress(raw[i:])
                if len(o)>500:
                    score=o.count(b'\xa2\x0f\x00\x00')
                    if best_big is None or len(o)>len(best_big): best_big=o
                    if score>0 and (score>best_score or (score==best_score and best and len(o)>len(best))):
                        best=o;best_score=score
            except Exception: pass
        i+=1
    return best if best is not None else best_big

def _block_entropy(b):
    import collections, math
    n=min(len(b),65536)
    if n<256: return 0.0
    c=collections.Counter(b[:n])
    return -sum((v/n)*math.log2(v/n) for v in c.values())

def _count_strings(b):
    cnt=0;i=0;n=min(len(b),200000)
    while i<n-2:
        if 0x20<=b[i]<0x80 and b[i+1]==0:
            j=i;ln=0
            while j<n-1 and ((0x20<=b[j]<0x80 and b[j+1]==0) or (0x400<=((b[j+1]<<8)|b[j])<0x460)): j+=2;ln+=1
            if ln>=5: cnt+=1
            i=j+2
        else: i+=1
    return cnt

def looks_encrypted(model):
    if model is None: return True
    if model.count(b'\xa2\x0f\x00\x00')>=3: return False
    return _block_entropy(model)>7.0 or _count_strings(model)<3

def _rc4(key, data):
    S=list(range(256));j=0;kb=key if isinstance(key,bytes) else key.encode('utf-8')
    for i in range(256):
        j=(j+S[i]+kb[i%len(kb)])&0xff; S[i],S[j]=S[j],S[i]
    out=bytearray();i=j=0
    for ch in data:
        i=(i+1)&0xff; j=(j+S[i])&0xff; S[i],S[j]=S[j],S[i]
        out.append(ch ^ S[(S[i]+S[j])&0xff])
    return bytes(out)

def _xor(key, data):
    kb=key if isinstance(key,bytes) else key.encode('utf-8')
    return bytes(b ^ kb[i%len(kb)] for i,b in enumerate(data))

def decrypt_attempt(raw, key):
    """Parol bilan deshifrlashga urinish (algoritm hali rasmiy tasdiqlanmagan).
       Bir nechta keng tarqalgan sxemani sinaydi: butun fayl RC4/XOR, keyin zlib.
       Muvaffaqiyat = natijada o'qiladigan model chiqishi."""
    for name,fn in [('RC4',_rc4),('XOR',_xor)]:
        try:
            dec=fn(key,raw)
            mdl=inflate_biggest(dec)
            if mdl and not looks_encrypted(mdl):
                return dec, name
        except Exception: pass
    # faqat model blokini deshifrlash (zlib avval bo'lsa)
    return None, None

ENCRYPT_GUIDE=(
  "Bu .b3d fayli SHIFRLANGAN (Bazis 24 'Encrypt' xizmati).\n"
  "O'qish uchun litsenziya parolingiz kerak (Bazis-Center bergan, mas. '3Km8JdPZ').\n"
  "  Python: python3 b3d_full_parser.py fayl.b3d --key=PAROL\n"
  "  Brauzer: faylни tashlang, so'ralganda kalitni kiriting.\n"
  "Eslatma: shifr algoritmi (RC4/XOR/AES/GOST) bitta shifrlangan namuna bilan "
  "aniq tasdiqlanadi. Agar parol ishlamasa, bir loyihani SHIFRLI va SHIFRSIZ "
  "saqlab, ikkalasini yuboring — sxema aniqlanadi."
)

# ---------------------------------------------------------------- schema
def read_schema(model):
    start=-1
    for probe in range(40,400):
        if probe+4>len(model): break
        ln=struct.unpack('<I',model[probe:probe+4])[0]
        if 2<=ln<=6 and all(65<=b<=122 for b in model[probe+4:probe+4+ln]):
            p2=probe+4+ln
            if p2+4<=len(model):
                ln2=struct.unpack('<I',model[p2:p2+4])[0]
                if 1<=ln2<=24 and all(32<=b<127 for b in model[p2+4:p2+4+ln2]):
                    start=probe; break
    if start<0: start=53
    names=[];p=start
    while p+4<=len(model):
        ln=struct.unpack('<I',model[p:p+4])[0]
        if not(1<=ln<=24): break
        raw=model[p+4:p+4+ln]
        if not all(32<=b<127 for b in raw): break
        names.append(raw.decode('latin1')); p+=4+ln
    return names, start, p

# ---------------------------------------------------------------- stream
def decode_stream(model, start, names):
    """To'liq TLV oqimi, 0x07 blob bilan. (nom, tip, qiymat) ro'yxati."""
    pos=start;nn=len(names);out=[]
    L=len(model)
    while pos<L-9:
        idx=struct.unpack('<I',model[pos:pos+4])[0]
        if idx>=nn: pos+=1; continue
        marker=model[pos+8];vp=pos+9
        if marker==0x05:
            if vp+8>L: break
            out.append((names[idx],'d',struct.unpack('<d',model[vp:vp+8])[0])); pos=vp+8
        elif marker==0x04:
            if vp+4>L: break
            out.append((names[idx],'i32',struct.unpack('<i',model[vp:vp+4])[0])); pos=vp+4
        elif marker==0x03:
            out.append((names[idx],'i8',model[vp])); pos=vp+1
        elif marker==0x06:
            ln=struct.unpack('<I',model[vp:vp+4])[0]
            if ln>2000 or vp+4+ln*2>L: pos+=1; continue
            out.append((names[idx],'str',model[vp+4:vp+4+ln*2].decode('utf-16-le','replace'))); pos=vp+4+ln*2
        elif marker==0x07:
            ln=struct.unpack('<I',model[vp:vp+4])[0]
            if 0<ln<5_000_000 and vp+4+ln<=L:
                out.append((names[idx],'blob',model[vp+4:vp+4+ln])); pos=vp+4+ln
            else: pos+=1
        else: pos+=1
    return out

def decode_stream_nameless(model, start=0):
    """Bazis 24 schema-siz format: nom lug'ati yo'q, lekin TLV bir xil
       <idx:4><flag:4><tip:1><qiymat>. Resync bilan binar headerni o'tkazadi.
       Qaytaradi (str(idx), tip, qiymat) — universal parse_objects ishlaydi."""
    out=[];pos=start;L=len(model)
    while pos<L-9:
        idx=struct.unpack('<I',model[pos:pos+4])[0];marker=model[pos+8];vp=pos+9;ok=False
        if idx<100000:
            if marker==0x05 and vp+8<=L:
                out.append((str(idx),'d',struct.unpack('<d',model[vp:vp+8])[0]));pos=vp+8;ok=True
            elif marker==0x04 and vp+4<=L:
                out.append((str(idx),'i32',struct.unpack('<i',model[vp:vp+4])[0]));pos=vp+4;ok=True
            elif marker==0x03 and vp+1<=L:
                out.append((str(idx),'i8',model[vp]));pos=vp+1;ok=True
            elif marker==0x06:
                ln=struct.unpack('<I',model[vp:vp+4])[0]
                if 0<=ln<=2000 and vp+4+ln*2<=L:
                    out.append((str(idx),'str',model[vp+4:vp+4+ln*2].decode('utf-16-le','replace')));pos=vp+4+ln*2;ok=True
            elif marker==0x07:
                ln=struct.unpack('<I',model[vp:vp+4])[0]
                if 0<ln<5_000_000 and vp+4+ln<=L:
                    out.append((str(idx),'blob',model[vp+4:vp+4+ln]));pos=vp+4+ln;ok=True
        if not ok: pos+=1
    return out

# ---------------------------------------------------------------- kontur
def decode_contour(payload):
    """TContour3D blob -> elementlar. QATTIQ validator: tag 0x10 chiziq (32b),
       0x12 yoy (49b); umumiy uzunlik ANIQ mos kelishi shart. Bu har qanday
       nomdagi blobni xavfsiz tekshirish imkonini beradi (nomlar faylga qarab
       o'zgaradi: FurnList/Estimate/...)."""
    if len(payload)<4+33: return None
    cnt=struct.unpack('<I',payload[:4])[0]
    if not (0<cnt<2000): return None
    els=[];o=4
    for e in range(cnt):
        if o>=len(payload): return None
        tag=payload[o];o+=1
        if tag==0x10:
            if o+32>len(payload): return None
            x1,y1,x2,y2=struct.unpack('<4d',payload[o:o+32]);o+=32
            if max(abs(x1),abs(y1),abs(x2),abs(y2))>1e6: return None
            els.append({'type':'line','p1':[x1,y1],'p2':[x2,y2]})
        elif tag==0x12:
            if o+49>len(payload): return None
            cx,cy,x1,y1,x2,y2=struct.unpack('<6d',payload[o:o+48])
            if max(abs(cx),abs(cy),abs(x1),abs(y1))>1e6: return None
            adir=payload[o+48];o+=49
            els.append({'type':'arc','center':[cx,cy],'p1':[x1,y1],'p2':[x2,y2],'dir':bool(adir)})
        else:
            return None
    if o!=len(payload): return None
    return els if els else None

def contour_polygon(els, arc_segs=10):
    """Elementlardan yopiq ko'pburchak nuqtalar (yoylar segmentlanadi)."""
    pts=[]
    for el in els:
        if el['type']=='line':
            pts.append(tuple(el['p1']))
        else:  # arc
            cx,cy=el['center'];x1,y1=el['p1'];x2,y2=el['p2']
            a1=math.atan2(y1-cy,x1-cx);a2=math.atan2(y2-cy,x2-cx)
            r=math.hypot(x1-cx,y1-cy)
            if el['dir']:               # soat strelkasiga qarshi
                while a2<=a1: a2+=2*math.pi
            else:
                while a2>=a1: a2-=2*math.pi
            for k in range(arc_segs):
                a=a1+(a2-a1)*k/arc_segs
                pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    # dublikatlarni olib tashlash
    out=[]
    for p in pts:
        if not out or abs(p[0]-out[-1][0])>1e-6 or abs(p[1]-out[-1][1])>1e-6:
            out.append(p)
    if len(out)>2 and abs(out[0][0]-out[-1][0])<1e-6 and abs(out[0][1]-out[-1][1])<1e-6:
        out.pop()
    return out

# ---------------------------------------------------------------- uchburchaklash
def triangulate(poly):
    """Ear-clipping. poly = [(x,y)..] yopiq emas. Indeks uchliklari."""
    n=len(poly)
    if n<3: return []
    if n==3: return [(0,1,2)]
    # yo'nalish
    area=sum(poly[i][0]*poly[(i+1)%n][1]-poly[(i+1)%n][0]*poly[i][1] for i in range(n))
    idxs=list(range(n))
    if area<0: idxs.reverse()
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    def inside(p,a,b,c):
        d1=cross(a,b,p);d2=cross(b,c,p);d3=cross(c,a,p)
        neg=(d1<0)or(d2<0)or(d3<0);pos=(d1>0)or(d2>0)or(d3>0)
        return not(neg and pos)
    tris=[];guard=0
    while len(idxs)>3 and guard<10000:
        guard+=1;ear=False
        for k in range(len(idxs)):
            i0,i1,i2=idxs[k-1],idxs[k],idxs[(k+1)%len(idxs)]
            a,b,c=poly[i0],poly[i1],poly[i2]
            if cross(a,b,c)<=1e-12: continue
            ok=True
            for j in idxs:
                if j in (i0,i1,i2): continue
                if inside(poly[j],a,b,c): ok=False;break
            if ok:
                tris.append((i0,i1,i2));idxs.pop(k);ear=True;break
        if not ear: break
    if len(idxs)==3: tris.append(tuple(idxs))
    return tris

# ---------------------------------------------------------------- matematika
def quat_to_matrix(qx,qy,qz,qw):
    n=qx*qx+qy*qy+qz*qz+qw*qw
    if n<1e-9: return [(1,0,0),(0,1,0),(0,0,1)]
    s=2.0/n
    return [
        (1-s*(qy*qy+qz*qz), s*(qx*qy+qz*qw),   s*(qx*qz-qy*qw)),
        (s*(qx*qy-qz*qw),   1-s*(qx*qx+qz*qz), s*(qy*qz+qx*qw)),
        (s*(qx*qz+qy*qw),   s*(qy*qz-qx*qw),   1-s*(qx*qx+qy*qy)),
    ]

def material_color(name):
    n=(name or '').lower()
    if 'дуб' in n or 'золот' in n: return [0.72,0.58,0.36]
    if 'венге' in n or 'чёрн' in n or 'черн' in n: return [0.25,0.20,0.18]
    if 'орех' in n: return [0.55,0.40,0.28]
    if 'бук' in n: return [0.82,0.68,0.50]
    if 'сер' in n: return [0.62,0.62,0.62]
    if 'красн' in n: return [0.70,0.25,0.22]
    if 'син' in n: return [0.30,0.40,0.65]
    if 'зел' in n: return [0.35,0.55,0.35]
    if 'лхдф' in n: return [0.85,0.83,0.80]
    if 'лмдф' in n or 'мдф' in n: return [0.90,0.88,0.84]
    if 'белый' in n or 'белая' in n or 'бел' in n: return [0.93,0.92,0.89]
    return [0.80,0.75,0.68]

MATERIAL_KEYS=('ЛДСП','ЛМДФ','ЛХДФ','МДФ','ДСП','ХДФ','Стекло','Зеркало','massiv','Массив',
               'Акрил','Acryl','акрил','Эмаль','Шпон','Пластик','Постформинг','Фанера','ДВП',
               'Egger','Эггер','Kronospan','Кроношпан','Ламарти','Lamarty','Schattdecor','AGT',
               'Frente','Каштан','Столешниц','Союз','Кварц','Агломерат','Компакт','Алюмин','ПЭТ',
    'XDF','LDSP','LMDF','LHDF','MDF','DSP','HDF','steklo','zerkalo','akril','plastik','LDVP','MASSIV','STEKLO')
import re as _MRE
_MAT_PATTERN=_MRE.compile(r'\d+\s*мм|\d+\s*[mм][mм]|\d{3,}\s*[*xх×/]\s*\d{3,}|\d+\s*кв', _MRE.IGNORECASE)
def _is_material_like(vs):
    low=vs.lower()
    if 'кромка' in low or 'принадлеж' in low or 'присадк' in low: return False
    if len(vs)<5: return False
    return bool(_MAT_PATTERN.search(vs))
HIST_PREFIX=('Удаление','Создание','Установка','Редактирование','Перемещение',
             'Копирование','Вставка','Поворот','Замена','Изменение','Разбиение','Группировка')

# ---------------------------------------------------------------- panel yig'ish
PANEL_CODE=4002
OBJECT_CODES={4002,1001,1005,3001,6000,2004,4004,2001,5001,1002,2002,3002}

def find_quat_run(seg):
    """Segmentdagi birinchi 7-ketma-ket-double zanjirini topadi,
       oxirgi 4 tasining normasi ~1 (kvaternion testi)."""
    run=[]
    for k,(nm,t,v) in enumerate(seg):
        if t=='d':
            run.append(v)
            if len(run)>=7:
                d=run[-7:]
                nq=d[3]*d[3]+d[4]*d[4]+d[5]*d[5]+d[6]*d[6]
                if abs(nq-1.0)<0.02 and max(abs(d[0]),abs(d[1]),abs(d[2]))<1e6:
                    return (d[0],d[1],d[2]),(d[3],d[4],d[5],d[6])
        else:
            run=[]
    return None,None

def parse_objects(stream):
    """UNIVERSAL: nomga bog'liq emas. Panel = i32 qiymati 4002.
       MUHIM: segment chegarasi = HAR QANDAY obyekt-header (Model/Index maydoni),
       faqat 4002 emas — aks holda blok ichidagi furnitura panelга qo'shilib ketadi."""
    # marker maydon nomini aniqlash (4002 qiymatini eng ko'p ko'targan i32 maydon)
    from collections import Counter as _C
    cbn=_C()
    for nm,t,v in stream:
        if t=='i32' and v==PANEL_CODE: cbn[nm]+=1
    if not cbn: return []
    marker_name=cbn.most_common(1)[0][0]
    headers=[k for k,(nm,t,v) in enumerate(stream) if t=='i32' and nm==marker_name]
    objs=[]
    n=len(stream)
    for hi,k in enumerate(headers):
        code=stream[k][2]
        end=headers[hi+1] if hi+1<len(headers) else n
        seg=stream[k:end]
        rec={'modelCode':code}
        if code!=PANEL_CODE:
            # furnitura/qurilish obyekti: nom + (bo'lsa) transform
            nmv=next((v.strip() for nm2,t2,v in seg if t2=='str' and v.strip()),None)
            if nmv: rec['name']=nmv
            tr=find_quat_run(seg)
            if tr[0]:
                rec['tf']={'Rx':tr[0][0],'Ry':tr[0][1],'Rz':tr[0][2],
                           'Anim':tr[1][0],'Axis':tr[1][1],'Butt':tr[1][2],'Vis':tr[1][3]}
            objs.append(rec); continue
        butts=[];cuts=[];contours=[]
        cur_butt=None;after_mat=False;mat_fallback=None
        pos,quat=find_quat_run(seg)
        if pos:
            rec['tf']={'Rx':pos[0],'Ry':pos[1],'Rz':pos[2],
                       'Anim':quat[0],'Axis':quat[1],'Butt':quat[2],'Vis':quat[3]}
        for j,(nm,t,v) in enumerate(seg):
            if t=='str':
                vs=v.strip()
                if not vs: continue
                low=vs.lower()
                if 'кромка' in low:
                    fb=cur_butt['TFurnButt'] if cur_butt is not None else None
                    if fb is not None and 'thickness' in fb and 'edgeIndex' in fb and 'butt_name' not in fb:
                        fb['butt_name']=vs; cur_butt=None
                    else:
                        cur_butt={'TFurnButt':{'name':vs}}; butts.append(cur_butt)
                    continue
                if any(mk in vs for mk in MATERIAL_KEYS):
                    if 'material' not in rec:
                        rec['material']=vs;after_mat=True
                    continue
                if mat_fallback is None and _is_material_like(vs):
                    mat_fallback=vs
                if 'name' not in rec and len(vs)>1 and not vs.replace('.','').replace(',','').isdigit():
                    rec['name']=vs
            elif t=='d':
                if cur_butt is not None and 'thickness' not in cur_butt['TFurnButt'] and 0<v<=20:
                    cur_butt['TFurnButt']['thickness']=v
                elif after_mat and 'thickness' not in rec and 1<=v<=100:
                    rec['thickness']=v;after_mat=False
            elif t=='i8':
                if cur_butt is not None and 'thickness' in cur_butt['TFurnButt'] and 'edgeIndex' not in cur_butt['TFurnButt'] and v<=7:
                    cur_butt['TFurnButt']['edgeIndex']=v
            elif t=='blob':
                els=decode_contour(v)
                if els: contours.append(els)
        if 'material' not in rec and mat_fallback:
            rec['material']=mat_fallback
            _mm=_MRE.search(r'(\d+)\s*мм',mat_fallback)
            if _mm and 'thickness' not in rec:
                _tv=int(_mm.group(1))
                if 1<=_tv<=100: rec['thickness']=float(_tv)
        # dedupe: xossali (qalinlik/chet) kromkalar ustun; nom-nusxalar tashlanadi
        fb=[b for b in butts if 'thickness' in b['TFurnButt'] or 'edgeIndex' in b['TFurnButt']]
        if not fb: fb=butts
        if fb: rec['butts']=fb
        if cuts: rec['cuts']=cuts
        if contours:
            rec['contour_outer']=contours[0]
            if len(contours)>1: rec['contour_inner']=contours[1:]
        objs.append(rec)
    # boshqa kodlar statistikasi uchun: barcha i32 OBJECT_CODES
    return objs

# ---------------------------------------------------------------- GLB
BOX_TRIS=[(0,1,3),(0,3,2),(4,6,7),(4,7,5),(0,4,5),(0,5,1),(2,3,7),(2,7,6),(0,2,6),(0,6,4),(1,5,7),(1,7,3)]

def build_panel_mesh(rec, scale=0.001):
    """Panel: kontur ekstruziya (qalinlik bo'ylab) + TTransformation.
       Qaytaradi (positions floats, indices) global koordinatada."""
    tf=rec.get('tf',{})
    px,py,pz=tf.get('Rx',0),tf.get('Ry',0),tf.get('Rz',0)
    q=(tf.get('Anim',0),tf.get('Axis',0),tf.get('Butt',0),tf.get('Vis',1))
    ax,ay,az=quat_to_matrix(*q)
    dp=rec.get('thickness',16.0) or 16.0
    els=rec.get('contour_outer')
    if els:
        poly=contour_polygon(els)
        if len(poly)<3: els=None
    if not els:
        return None
    tris=triangulate(poly)
    if not tris: 
        # konveks bo'lmasa oddiy bbox
        xs=[p[0] for p in poly];ys=[p[1] for p in poly]
        poly=[(min(xs),min(ys)),(max(xs),min(ys)),(max(xs),max(ys)),(min(xs),max(ys))]
        tris=[(0,1,2),(0,2,3)]
    nv=len(poly)
    def G(x,y,z):
        gx=px+x*ax[0]+y*ay[0]+z*az[0]
        gy=py+x*ax[1]+y*ay[1]+z*az[1]
        gz=pz+x*ax[2]+y*ay[2]+z*az[2]
        return (gx*scale,gy*scale,gz*scale)
    verts=[]
    for (x,y) in poly: verts.append(G(x,y,0.0))      # past
    for (x,y) in poly: verts.append(G(x,y,dp))       # ust
    idx=[]
    for (a,b,c) in tris: idx+=[a,c,b]                # past (teskari)
    for (a,b,c) in tris: idx+=[nv+a,nv+b,nv+c]       # ust
    for k in range(nv):                               # yon devorlar
        k2=(k+1)%nv
        idx+=[k,k2,nv+k2, k,nv+k2,nv+k]
    return verts, idx

def build_glb(objs, out_path):
    def a4(n): return (n+3)&~3
    binp=[];binlen=0;bv=[];acc=[];meshes=[];nodes=[];mats=[];mc={}
    def push(buf,tgt):
        nonlocal binlen
        pad=a4(binlen)-binlen
        if pad: binp.append(b'\x00'*pad);binlen+=pad
        e={'buffer':0,'byteOffset':binlen,'byteLength':len(buf)}
        if tgt: e['target']=tgt
        bv.append(e);binp.append(buf);binlen+=len(buf);return len(bv)-1
    def getmat(c):
        k=tuple(round(x,3) for x in c)
        if k in mc: return mc[k]
        mats.append({'pbrMetallicRoughness':{'baseColorFactor':[c[0],c[1],c[2],1.0],'metallicFactor':0.0,'roughnessFactor':0.75},'doubleSided':True})
        mc[k]=len(mats)-1;return mc[k]
    cnt=0
    for rec in objs:
        if rec.get('modelCode')!=4002: continue
        bm=build_panel_mesh(rec)
        if not bm: continue
        verts,idx=bm
        pos=bytearray();mn=[1e18]*3;mx=[-1e18]*3
        for v in verts:
            for a in range(3):
                pos+=struct.pack('<f',v[a])
                if v[a]<mn[a]:mn[a]=v[a]
                if v[a]>mx[a]:mx[a]=v[a]
        pa=push(bytes(pos),34962)
        acc.append({'bufferView':pa,'componentType':5126,'count':len(verts),'type':'VEC3','min':mn,'max':mx})
        posacc=len(acc)-1
        ib=bytearray()
        for v in idx: ib+=struct.pack('<I',v)
        ia=push(bytes(ib),34963)
        acc.append({'bufferView':ia,'componentType':5125,'count':len(idx),'type':'SCALAR'})
        col=material_color(rec.get('material',''))
        meshes.append({'name':rec.get('name','panel'),'primitives':[{'attributes':{'POSITION':posacc},'indices':len(acc)-1,'material':getmat(col),'mode':4}]})
        nodes.append({'name':rec.get('name','panel'),'mesh':len(meshes)-1});cnt+=1
    gltf={'asset':{'version':'2.0','generator':'BazisB3D-v5-full'},'scene':0,
          'scenes':[{'nodes':list(range(len(nodes)))}],
          'nodes':nodes,'meshes':meshes,'materials':mats,
          'buffers':[{'byteLength':a4(binlen)}],'bufferViews':bv,'accessors':acc}
    js=json.dumps(gltf).encode('utf-8')
    jp=a4(len(js))-len(js)
    if jp: js+=b' '*jp
    binb=b''.join(binp)
    bp=a4(len(binb))-len(binb)
    if bp: binb+=b'\x00'*bp
    total=12+8+len(js)+8+len(binb)
    with open(out_path,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,total))
        f.write(struct.pack('<II',len(js),0x4E4F534A));f.write(js)
        f.write(struct.pack('<II',len(binb),0x004E4942));f.write(binb)
    return cnt

# ---------------------------------------------------------------- JSON (rasmiy tiplar)
def contour_dims(els):
    poly=contour_polygon(els) if els else []
    if not poly: return None,None,None
    xs=[p[0] for p in poly];ys=[p[1] for p in poly]
    return round(max(xs)-min(xs),3), round(max(ys)-min(ys),3), poly

CODE_TYPE={4002:'TFurnPanel',1005:'TFurnFitting',2004:'TFurnFitting',3001:'TFurnFitting',
           4004:'TFurnFitting',1001:'TConstruction',6000:'TConstructionLine'}
def obj_to_json(rec):
    code=rec.get('modelCode')
    if code!=PANEL_CODE:
        o={'type':CODE_TYPE.get(code,f'TObject3D(code={code})'),'Name':rec.get('name')}
        tf=rec.get('tf')
        if tf:
            q=[tf.get('Anim',0),tf.get('Axis',0),tf.get('Butt',0),tf.get('Vis',1)]
            o['TTransformation']={'vector':[round(tf.get('Rx',0),3),round(tf.get('Ry',0),3),round(tf.get('Rz',0),3)],
                                  'quaternion':[round(x,5) for x in q]}
        return o
    tf=rec.get('tf',{})
    q=[tf.get('Anim',0),tf.get('Axis',0),tf.get('Butt',0),tf.get('Vis',1)]
    ax,ay,az=quat_to_matrix(*q)
    out={
        'type':'TFurnPanel' if rec.get('modelCode')==4002 else f"TObject3D(code={rec.get('modelCode')})",
        'Name':rec.get('name'),
        'ID':rec.get('id'),
        'TTransformation':{
            'vector':[round(tf.get('Rx',0),4),round(tf.get('Ry',0),4),round(tf.get('Rz',0),4)],
            'quaternion':[round(x,6) for x in q],
            'AxisX':[round(x,4) for x in ax],
            'AxisY':[round(x,4) for x in ay],
            'AxisZ':[round(x,4) for x in az],
        },
        'MaterialName':rec.get('material'),
        'Thickness':rec.get('thickness'),
    }
    if rec.get('contour_outer'):
        dl,dw,poly=contour_dims(rec['contour_outer'])
        out['ContourWidth']=dl; out['ContourHeight']=dw
        out['TContour3D']={'elementCount':len(rec['contour_outer']),
                           'elements':rec['contour_outer']}
        if rec.get('contour_inner'):
            out['TContour3D']['inner']=[{'elementCount':len(c),'elements':c} for c in rec['contour_inner']]
    if rec.get('butts'):
        out['TFurnButtList']=rec['butts']
    if rec.get('cuts'):
        out['TFurnCutList']=rec['cuts']
    return out

# Mahkamlagich (kreplej) kalit so'zlari
FASTENER_KEYS=('винт','vint','шкант','shkant','саморез','samorez','эксцентрик','конфирмат',
               'минификс','стяжк','уголок','us3','евро','евро','алкан','alkan','7х','7x',
               'футорка','дюбель','гвоздь')
# Furnitura (hardware) kalit so'zlari
HARDWARE_KEYS=('петл','petl','ручк','ruchk','направл','napravl','держател','derjatel',
               'доводчик','dovodchik','газлифт','gazlift','опора','ножк','магнит','samet',
               'tandem','тандем','blum','hettich','салазк','salazk','навес','завес',
               'amortizator','menteşe','полозья','профиль')
def _poly_area(els):
    poly=contour_polygon(els);a=0.0;npq=len(poly)
    for i in range(npq):
        j=(i+1)%npq; a+=poly[i][0]*poly[j][1]-poly[j][0]*poly[i][1]
    return abs(a)/2.0
def _elem_len(el):
    if el['type']=='line':
        return math.hypot(el['p2'][0]-el['p1'][0],el['p2'][1]-el['p1'][1])
    cx,cy=el['center'];r=math.hypot(el['p1'][0]-cx,el['p1'][1]-cy)
    a1=math.atan2(el['p1'][1]-cy,el['p1'][0]-cx);a2=math.atan2(el['p2'][1]-cy,el['p2'][0]-cx)
    return r*abs(a2-a1)
# Guruh/blok/operatsiya nomlari (furnitura EMAS) — qora ro'yxat
# Guruh/blok/qurilish so'zlari (substring xavfsiz — hardware ichida uchramaydi)
GROUP_KEYS=('korpus','корпус','shkaf','шкаф','stoyka','стойк','блок','block','рамка','ramka',
            'анимац','animation','каркас','секц','sektsiya','metka','метка','перегородк',
            'fasad','фасад','столешниц','цоколь','tsokol','planka','стенка','перемычк',
            'основание','подложк','заполнен','царг','полупол','конструкц','konstr','дверь',
            'dver','eshik','эшик','стенк','пол кадр','задняя стенк')
# polka/pol/bok/dno — faqat ALOHIDA so'z (polkaderjatel/полкодержатель EMAS!)
import re as _RE
_GROUP_WORD=_RE.compile(r'(^|[\s\-_])(polka|полка|pol|пол|dno|дно|bok|бок|past|tepa|chap|primoy|polgorbat)([\s\-_\d]|$)')
def _classify_fitting(nm, panel_names):
    low=nm.lower().strip()
    if _RE.match(r'^[\d\s.,x×\-+/]+$', low): return None      # raqam/o'lcham (3000, 3x2,5)
    if _RE.match(r'^\d', low): return None                      # raqam bilan boshlanadi
    if _GROUP_WORD.search(low): return None                     # polka/pol/bok alohida so'z
    for pn in panel_names:
        if pn and len(pn)>2 and (low==pn or low.startswith(pn+' ')): return None  # panel nomi
    if any(k in low for k in GROUP_KEYS): return None           # qurilish/guruh
    if any(k in low for k in FASTENER_KEYS): return 'fast'      # mahkamlagich
    return 'furn'                                               # qolgani = furnitura
import re as _UR
def _furn_with_unit(furn):
    for k in list(furn.keys()):
        kl=k.lower()
        if 'направляющая лев' in kl or 'направляющая прав' in kl:
            base=_UR.sub(r'\s*направляющая\s+(лев\w*|прав\w*)\s*$','',k,flags=_UR.I).strip()
            if base in furn: del furn[k]
    def u(nm):
        l=nm.lower()
        return 'komplekt' if ('направля' in l or 'salazk' in l or 'салазк' in l or 'тандем' in l or 'tandem' in l) else 'dona'
    return [{'name':k,'count':v,'unit':u(k)} for k,v in sorted(furn.items(),key=lambda x:-x[1])]
def compute_bom(objs):
    import re as _re
    from collections import defaultdict as _dd
    mats=_dd(lambda:[0,0.0]); edges=_dd(lambda:[0,0.0]); furn=_dd(int); fast=_dd(int)
    panel_names=set()
    for o in objs:
        if o.get('modelCode')==PANEL_CODE and o.get('name'):
            panel_names.add(o['name'].replace('\r',' ').strip().lower())
    for o in objs:
        c=o.get('modelCode')
        if c==PANEL_CODE:
            mt=o.get('material')
            if mt:
                mats[mt][0]+=1
                if o.get('contour_outer'): mats[mt][1]+=_poly_area(o['contour_outer'])/1e6
            els=o.get('contour_outer')
            for b in o.get('butts',[]):
                fb=b['TFurnButt'];nm=fb.get('name','?').strip();ei=fb.get('edgeIndex')
                edges[nm][0]+=1
                if els is not None and ei is not None and ei<len(els): edges[nm][1]+=_elem_len(els[ei])/1000.0
        elif c in (1005,2004,3001,4004) and o.get('name'):
            nm=_re.sub(r'\s+',' ',o['name'].replace('\r',' ')).strip()
            cls=_classify_fitting(nm, panel_names)
            if cls=='fast': fast[nm]+=1
            elif cls=='furn': furn[nm]+=1
    return {
        'materials':[{'name':k,'panelCount':v[0],'totalArea_m2':round(v[1],3)} for k,v in sorted(mats.items(),key=lambda x:-x[1][1])],
        'edgeBands':[{'name':k,'edgeCount':v[0],'totalLength_m':round(v[1],2)} for k,v in sorted(edges.items(),key=lambda x:-x[1][1])],
        'fittings':_furn_with_unit(furn),
        'fasteners':[{'name':k,'count':v,'unit':'dona'} for k,v in sorted(fast.items(),key=lambda x:-x[1])],
    }

def parse(path, outdir=None, key=None):
    raw=open(path,'rb').read()
    model=inflate_biggest(raw)
    # --- SHIFRLASH tekshiruvi ---
    if looks_encrypted(model):
        if not key:
            base=os.path.basename(path).rsplit('.',1)[0]
            od=outdir or os.path.dirname(path) or '.'
            res={'source':os.path.basename(path),'encrypted':True,
                 'message':"SHIFRLANGAN — kalit kerak",'guide':ENCRYPT_GUIDE}
            json.dump(res,open(os.path.join(od,base+'_b3d.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
            print(f"[{os.path.basename(path)}] SHIFRLANGAN — kalit kerak (--key=PAROL)")
            return res
        dec,algo=decrypt_attempt(raw,key)
        if dec is None:
            print(f"[{os.path.basename(path)}] kalit bilan deshifr bo'lmadi — algoritm aniqlanmagan (shifrlangan namuna kerak)")
            return {'source':os.path.basename(path),'encrypted':True,'keyTried':True,
                    'message':"Kalit bilan ochilmadi — algoritm noma'lum",'guide':ENCRYPT_GUIDE}
        print(f"[{os.path.basename(path)}] {algo} bilan deshifrlandi!")
        raw=dec; model=inflate_biggest(raw)
    if not model: raise RuntimeError("zlib blok yo'q")
    names,sstart,vstart=read_schema(model)
    stream=decode_stream(model,vstart,names)
    objs=parse_objects(stream)
    panels=[o for o in objs if o.get('modelCode')==4002]
    fmt='Bazis B3D (schema-li, TLV v6)'
    if len(panels)==0:
        # Bazis 24 schema-siz format: nom-siz walker
        stream=decode_stream_nameless(model)
        objs=parse_objects(stream)
        panels=[o for o in objs if o.get('modelCode')==4002]
        names=[]; fmt='Bazis 24 B3D (schema-siz, nom-siz TLV)'
    with_contour=sum(1 for o in panels if o.get('contour_outer'))
    fittings=sum(1 for o in objs if o.get('modelCode') in (1005,2004,3001,4004))
    base=os.path.basename(path).rsplit('.',1)[0]
    od=outdir or os.path.dirname(path) or '.'
    glb=os.path.join(od,base+'_b3d.glb')
    ng=build_glb(objs,glb)
    # hierarchy: T3DObjectList - obyektlarni fayl tartibida, kod bilan
    type_counts=Counter(o.get('modelCode') for o in objs)
    res={
        'source':os.path.basename(path),
        'generator':'BazisB3D-parser-v6',
        'format':fmt,
        'schema_fields':len(names),
        'stream_values':len(stream),
        'T3DObjectList':{
            'Count':len(objs),
            'typeCounts':{str(k):v for k,v in type_counts.most_common()},
            'Objects':[obj_to_json(o) for o in objs],
        },
        'objectCount':len(objs),
        'objectCount':len(objs),
        'panelCount':len(panels),
        'panelsWithContour':with_contour,
        'fittingCount':fittings,
        'glbPanels':ng,
        'BOM':compute_bom(objs),
    }
    jpath=os.path.join(od,base+'_b3d.json')
    json.dump(res,open(jpath,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f"[{os.path.basename(path)}] panel={len(panels)} kontur={with_contour} GLB={ng} -> {os.path.basename(glb)}")
    return res

if __name__=='__main__':
    args=[a for a in sys.argv[1:] if not a.startswith('-')]
    outdir=None
    for a in sys.argv[1:]:
        if a.startswith('--out='): outdir=a[6:]
    key=None
    for a in sys.argv[1:]:
        if a.startswith('--key='): key=a[6:]
    for p in args: 
        try: parse(p,outdir,key)
        except Exception as e: print(f"[{os.path.basename(p)}] XATO: {e}")
