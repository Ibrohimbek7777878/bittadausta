#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
  BAZIS .B3D PARTIYALI TEKSHIRUVCHI (batch) — minglab fayl uchun
================================================================================
  ISHLATISH:
      python3 bazis_batch.py                 # shu papkada (rekursiv)
      python3 bazis_batch.py /yo/l/papka     # ko'rsatilган papka
      python3 bazis_batch.py . --key=PAROL   # shifrlangan fayllar uchun kalit

  CHIQADI (natija/ papkasida):
    1) logs/<fayl>.txt        — HAR FAYL uchun batafsil hisob (SIZ tekshirasiz):
                                materiallar (maydon), kromka (uzunlik), furnitura,
                                mahkamlagich, kesim ro'yxati (har detal)
    2) master_detallar.csv    — barcha detallar (Excelда tekshirish uchun)
    3) master_materiallar.csv — material bo'yicha (fayl, material, soni, m²)
    4) master_kromka.csv      — kromka (fayl, nom, soni, uzunlik m)
    5) master_furnitura.csv   — furnitura + mahkamlagich (fayl, nom, soni, tur)
    6) HISOBOT_CLAUDE.txt     — MEN uchun diagnostika (anomaliyalar, statistika)
    7) HISOBOT_CLAUDE.json    — o'sha hisobot mashina o'qiydigan ko'rinishда

  Faqat standart Python (zlib). Qo'shimcha kutubxona KERAK EMAS.
  Heч qachon to'xtamaydi — har fayl xatosi alohida ushlanadi va logланади.
================================================================================
"""
import os, sys, zlib, struct, math, re, csv, json, glob, traceback
from collections import defaultdict, Counter
from datetime import datetime

PANEL_CODE=4002
FITTING_CODES=(1005,2004,3001,4004)

# ---------------- material / furnitura / mahkamlagich kalit so'zlari ----------------
MATERIAL_KEYS=('ЛДСП','ЛМДФ','ЛХДФ','МДФ','ДСП','ХДФ','Стекло','Зеркало','Массив','massiv',
    'Акрил','Acryl','акрил','Эмаль','Шпон','Пластик','Постформинг','Фанера','ДВП','Egger',
    'Эггер','Kronospan','Кроношпан','Ламарти','Lamarty','Schattdecor','AGT','Frente','Каштан',
    'Столешниц','Союз','Кварц','Агломерат','Компакт','Алюмин','ПЭТ',
    # lotin transliteratsiya (XDF BELIY 2800/2070 3MM kabi)
    'XDF','LDSP','LMDF','LHDF','MDF','DSP','HDF','steklo','Steklo','zerkalo','Zerkalo',
    'akril','plastik','Plastik','LDVP','massiv','MASSIV','STEKLO')
FASTENER_KEYS=('винт','vint','шкант','shkant','саморез','samorez','эксцентрик','конфирмат',
    'минификс','стяжк','уголок','us3','евро','алкан','alkan','7х','7x','футорка','дюбель','гвоздь')
GROUP_KEYS=('korpus','корпус','shkaf','шкаф','stoyka','стойк','блок','block','рамка','ramka',
    'анимац','animation','каркас','секц','sektsiya','metka','метка','перегородк','fasad','фасад',
    'столешниц','цоколь','tsokol','planka','стенк','перемычк','основание','подложк','царг',
    'полупол','конструкц','konstr','дверь','dver','eshik','эшик')
_MAT_PATTERN=re.compile(r'\d+\s*мм|\d+\s*[mм][mм]|\d{3,}\s*[*xх×/]\s*\d{3,}|\d+\s*кв', re.IGNORECASE)
_GROUP_WORD=re.compile(r'(^|[\s\-_])(polka|полка|pol|пол|dno|дно|bok|бок|past|tepa|chap|primoy|polgorbat)([\s\-_\d]|$)')

# ================================ PARSER (mustaqil) ================================
def inflate_biggest(raw):
    # Eng KATTA emas — panel kodi (4002) eng ko'p bor blokni tanlaymiz.
    # (ko'p faylda eng katta blok = nol-to'la junk bufer, model kichikroq blokda)
    best=None;best_score=-1;best_big=None;i=0;L=len(raw)
    while i<L-2:
        if raw[i]==0x78 and raw[i+1] in (0x9c,0x01,0xda):
            try:
                o=zlib.decompressobj().decompress(raw[i:])
                if len(o)>500:
                    score=o.count(b'\xa2\x0f\x00\x00')  # 4002 (panel) i32 LE
                    if best_big is None or len(o)>len(best_big): best_big=o
                    if score>0 and (score>best_score or (score==best_score and best and len(o)>len(best))):
                        best=o;best_score=score
            except Exception: pass
        i+=1
    return best if best is not None else best_big

def block_entropy(b):
    n=min(len(b),65536)
    if n<256: return 0.0
    c=Counter(b[:n])
    return -sum((v/n)*math.log2(v/n) for v in c.values())

def count_strings(b):
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
    # Model strukturasi (panel kodi 4002) bo'lsa — shifrlanmagan (katta mesh data
    # entropiyani oshirsa ham model butun bo'lishi mumkin)
    if model.count(b'\xa2\x0f\x00\x00')>=3: return False
    return block_entropy(model)>7.0 or count_strings(model)<3

def _rc4(key,data):
    S=list(range(256));j=0;kb=key.encode('utf-8')
    for i in range(256): j=(j+S[i]+kb[i%len(kb)])&0xff;S[i],S[j]=S[j],S[i]
    out=bytearray();i=j=0
    for ch in data:
        i=(i+1)&0xff;j=(j+S[i])&0xff;S[i],S[j]=S[j],S[i];out.append(ch^S[(S[i]+S[j])&0xff])
    return bytes(out)
def _xor(key,data):
    kb=key.encode('utf-8');return bytes(b^kb[i%len(kb)] for i,b in enumerate(data))
def decrypt_attempt(raw,key):
    for fn in (_rc4,_xor):
        try:
            dec=fn(key,raw);m=inflate_biggest(dec)
            if m and not looks_encrypted(m): return dec
        except Exception: pass
    return None

def read_schema(model):
    start=-1
    for probe in range(40,400):
        if probe+4>len(model): break
        ln=struct.unpack('<I',model[probe:probe+4])[0]
        if 2<=ln<=6 and all(65<=b<=122 for b in model[probe+4:probe+4+ln]):
            p2=probe+4+ln
            if p2+4<=len(model):
                ln2=struct.unpack('<I',model[p2:p2+4])[0]
                if 1<=ln2<=24 and all(32<=b<127 for b in model[p2+4:p2+4+ln2]): start=probe;break
    if start<0: start=53
    names=[];p=start
    while p+4<=len(model):
        ln=struct.unpack('<I',model[p:p+4])[0]
        if not(1<=ln<=24): break
        raw=model[p+4:p+4+ln]
        if not all(32<=b<127 for b in raw): break
        names.append(raw.decode('latin1'));p+=4+ln
    return names,p

def decode_stream(model,start,names):
    pos=start;nn=len(names);out=[];L=len(model)
    while pos<L-9:
        idx=struct.unpack('<I',model[pos:pos+4])[0]
        if idx>=nn: pos+=1;continue
        marker=model[pos+8];vp=pos+9
        if marker==0x05:
            if vp+8>L: break
            out.append((names[idx],'d',struct.unpack('<d',model[vp:vp+8])[0]));pos=vp+8
        elif marker==0x04:
            if vp+4>L: break
            out.append((names[idx],'i32',struct.unpack('<i',model[vp:vp+4])[0]));pos=vp+4
        elif marker==0x03: out.append((names[idx],'i8',model[vp]));pos=vp+1
        elif marker==0x06:
            ln=struct.unpack('<I',model[vp:vp+4])[0]
            if ln>2000 or vp+4+ln*2>L: pos+=1;continue
            out.append((names[idx],'str',model[vp+4:vp+4+ln*2].decode('utf-16-le','replace')));pos=vp+4+ln*2
        elif marker==0x07:
            ln=struct.unpack('<I',model[vp:vp+4])[0]
            if 0<ln<5_000_000 and vp+4+ln<=L: out.append((names[idx],'blob',model[vp+4:vp+4+ln]));pos=vp+4+ln
            else: pos+=1
        else: pos+=1
    return out

def decode_stream_nameless(model):
    out=[];pos=0;L=len(model)
    while pos<L-9:
        idx=struct.unpack('<I',model[pos:pos+4])[0];marker=model[pos+8];vp=pos+9;ok=False
        if idx<100000:
            if marker==0x05 and vp+8<=L: out.append((str(idx),'d',struct.unpack('<d',model[vp:vp+8])[0]));pos=vp+8;ok=True
            elif marker==0x04 and vp+4<=L: out.append((str(idx),'i32',struct.unpack('<i',model[vp:vp+4])[0]));pos=vp+4;ok=True
            elif marker==0x03 and vp+1<=L: out.append((str(idx),'i8',model[vp]));pos=vp+1;ok=True
            elif marker==0x06:
                ln=struct.unpack('<I',model[vp:vp+4])[0]
                if 0<=ln<=2000 and vp+4+ln*2<=L: out.append((str(idx),'str',model[vp+4:vp+4+ln*2].decode('utf-16-le','replace')));pos=vp+4+ln*2;ok=True
            elif marker==0x07:
                ln=struct.unpack('<I',model[vp:vp+4])[0]
                if 0<ln<5_000_000 and vp+4+ln<=L: out.append((str(idx),'blob',model[vp+4:vp+4+ln]));pos=vp+4+ln;ok=True
        if not ok: pos+=1
    return out

def decode_contour(payload):
    if len(payload)<37: return None
    cnt=struct.unpack('<I',payload[:4])[0]
    if not(0<cnt<2000): return None
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
            cx,cy,x1,y1,x2,y2=struct.unpack('<6d',payload[o:o+48]);adir=payload[o+48];o+=49
            if max(abs(cx),abs(cy),abs(x1),abs(y1))>1e6: return None
            els.append({'type':'arc','center':[cx,cy],'p1':[x1,y1],'p2':[x2,y2],'dir':bool(adir)})
        else: return None
    if o!=len(payload): return None
    return els

def contour_polygon(els,segs=10):
    pts=[]
    for el in els:
        if el['type']=='line': pts.append((el['p1'][0],el['p1'][1]))
        else:
            cx,cy=el['center'];x1,y1=el['p1'];x2,y2=el['p2']
            a1=math.atan2(y1-cy,x1-cx);a2=math.atan2(y2-cy,x2-cx);r=math.hypot(x1-cx,y1-cy)
            if el['dir']:
                while a2<=a1: a2+=2*math.pi
            else:
                while a2>=a1: a2-=2*math.pi
            for k in range(segs): a=a1+(a2-a1)*k/segs;pts.append((cx+r*math.cos(a),cy+r*math.sin(a)))
    out=[]
    for p in pts:
        if not out or abs(p[0]-out[-1][0])>1e-6 or abs(p[1]-out[-1][1])>1e-6: out.append(p)
    return out

def poly_area(els):
    poly=contour_polygon(els);a=0.0;n=len(poly)
    for i in range(n): j=(i+1)%n;a+=poly[i][0]*poly[j][1]-poly[j][0]*poly[i][1]
    return abs(a)/2.0
def contour_bbox(els):
    poly=contour_polygon(els)
    if not poly: return 0,0
    xs=[p[0] for p in poly];ys=[p[1] for p in poly]
    return max(xs)-min(xs),max(ys)-min(ys)
def elem_len(el):
    if el['type']=='line': return math.hypot(el['p2'][0]-el['p1'][0],el['p2'][1]-el['p1'][1])
    cx,cy=el['center'];r=math.hypot(el['p1'][0]-cx,el['p1'][1]-cy)
    a1=math.atan2(el['p1'][1]-cy,el['p1'][0]-cx);a2=math.atan2(el['p2'][1]-cy,el['p2'][0]-cx)
    return r*abs(a2-a1)

def find_quat_run(seg):
    run=[]
    for nm,t,v in seg:
        if t=='d':
            run.append(v)
            if len(run)>=7:
                d=run[-7:];nq=d[3]*d[3]+d[4]*d[4]+d[5]*d[5]+d[6]*d[6]
                if abs(nq-1.0)<0.02 and max(abs(d[0]),abs(d[1]),abs(d[2]))<1e6:
                    return (d[0],d[1],d[2]),(d[3],d[4],d[5],d[6])
        else: run=[]
    return None,None

def _is_material_like(vs):
    low=vs.lower()
    if 'кромка' in low or 'принадлеж' in low or 'присадк' in low: return False
    if len(vs)<5: return False
    return bool(_MAT_PATTERN.search(vs))

def parse_objects(stream):
    cbn=Counter()
    for nm,t,v in stream:
        if t=='i32' and v==PANEL_CODE: cbn[nm]+=1
    if not cbn: return []
    marker=cbn.most_common(1)[0][0]
    headers=[k for k,(nm,t,v) in enumerate(stream) if t=='i32' and nm==marker]
    objs=[];n=len(stream)
    for hi,k in enumerate(headers):
        code=stream[k][2];end=headers[hi+1] if hi+1<len(headers) else n;seg=stream[k:end]
        if code!=PANEL_CODE:
            rec={'modelCode':code}
            nmv=next((v.strip() for n2,t2,v in seg if t2=='str' and v.strip()),None)
            if nmv: rec['name']=nmv
            tr=find_quat_run(seg)
            if tr[0]: rec['tf']=tr
            objs.append(rec);continue
        rec={'modelCode':PANEL_CODE};butts=[];contours=[];cur=None;after_mat=False;mat_fb=None
        edge_names=[];other_strs=[]
        pos,quat=find_quat_run(seg)
        if pos: rec['tf']=(pos,quat)
        MK_LOWER=[mk.lower() for mk in MATERIAL_KEYS]
        for nm,t,v in seg:
            if t=='str':
                vs=v.strip()
                if not vs: continue
                low=vs.lower()
                if 'кромка' in low:
                    edge_names.append(vs)
                    fb=cur if cur is not None else None
                    if fb is not None and 'thickness' in fb and 'edgeIndex' in fb and 'butt_name' not in fb:
                        fb['butt_name']=vs;cur=None
                    else: cur={'name':vs};butts.append(cur)
                    continue
                if any(mk in low for mk in MK_LOWER):
                    if 'material' not in rec: rec['material']=vs;after_mat=True
                    continue
                if mat_fb is None and _is_material_like(vs): mat_fb=vs
                if 'name' not in rec and len(vs)>1 and not vs.replace('.','').replace(',','').isdigit(): rec['name']=vs
                elif len(vs)>2 and not vs.replace('.','').replace(',','').replace(' ','').isdigit(): other_strs.append(vs)
            elif t=='d':
                if cur is not None and 'thickness' not in cur and 0<v<=20: cur['thickness']=v
                elif after_mat and 'thickness' not in rec and 1<=v<=100: rec['thickness']=v;after_mat=False
            elif t=='i8':
                if cur is not None and 'thickness' in cur and 'edgeIndex' not in cur and v<=7: cur['edgeIndex']=v
            elif t=='blob':
                els=decode_contour(v)
                if els: contours.append(els)
        if 'material' not in rec and mat_fb:
            rec['material']=mat_fb
            mm=re.search(r'(\d+)\s*[мm][мm]',mat_fb,re.IGNORECASE)
            if mm:
                tv=int(mm.group(1))
                if 1<=tv<=100 and 'thickness' not in rec: rec['thickness']=float(tv)
        # tier-3: kromka nomi ichida uchragan alohida string = material dekori (Дуб Белый)
        if 'material' not in rec and edge_names:
            _STOP=('паз','quadro','присадк','отверст','metka','crepl','паз ','петл','ручк')
            for os_ in other_strs:
                if len(os_)<4 or any(sw in os_.lower() for sw in _STOP): continue
                if any(os_ in en for en in edge_names) and os_!=rec.get('name'):
                    rec['material']=os_; break
        fb=[b for b in butts if 'thickness' in b or 'edgeIndex' in b]
        if not fb: fb=butts
        if fb: rec['butts']=fb
        if contours:
            rec['contour_outer']=contours[0]
            if len(contours)>1: rec['contour_inner']=contours[1:]
        objs.append(rec)
    return objs

def classify_fitting(nm,panel_names):
    low=nm.lower().strip()
    if re.match(r'^[\d\s.,x×\-+/]+$',low): return None
    if re.match(r'^\d',low): return None
    if _GROUP_WORD.search(low): return None
    for pn in panel_names:
        if pn and len(pn)>2 and (low==pn or low.startswith(pn+' ')): return None
    if any(k in low for k in GROUP_KEYS): return None
    if any(k in low for k in FASTENER_KEYS): return 'fast'
    return 'furn'

# ================================ SPETSIFIKATSIYA ================================
def generate_spec(objs):
    panels=[o for o in objs if o.get('modelCode')==PANEL_CODE and o.get('contour_outer')]
    panel_names=set(o['name'].replace('\r',' ').strip().lower() for o in objs
                    if o.get('modelCode')==PANEL_CODE and o.get('name'))
    # materiallar
    mats=defaultdict(lambda:[0,0.0])
    for o in panels:
        mt=o.get('material')
        if mt: mats[mt][0]+=1; mats[mt][1]+=poly_area(o['contour_outer'])/1e6
    materials=[{'name':k,'panelCount':v[0],'totalArea_m2':round(v[1],4)} for k,v in
               sorted(mats.items(),key=lambda x:-x[1][1])]
    # kromka
    edges=defaultdict(lambda:[0,0.0,0,0.0])
    for o in panels:
        els=o['contour_outer']
        for b in o.get('butts',[]):
            nm=b.get('name','?').strip();ei=b.get('edgeIndex')
            edges[nm][0]+=1
            if ei is not None and ei<len(els):
                L=elem_len(els[ei])/1000.0;edges[nm][1]+=L
                if els[ei]['type']=='arc': edges[nm][2]+=1;edges[nm][3]+=L
    edgeBands=[{'name':k,'edgeCount':v[0],'totalLength_m':round(v[1],3),
                'ovalEdges':v[2],'ovalLength_m':round(v[3],3)} for k,v in
               sorted(edges.items(),key=lambda x:-x[1][1])]
    # furnitura / mahkamlagich
    furn=defaultdict(int);fast=defaultdict(int)
    for o in objs:
        if o.get('modelCode') in FITTING_CODES and o.get('name'):
            nm=re.sub(r'\s+',' ',o['name'].replace('\r',' ')).strip()
            c=classify_fitting(nm,panel_names)
            if c=='fast': fast[nm]+=1
            elif c=='furn': furn[nm]+=1
    # Направляющие chap/o'ng reyka = komplektning bo'lagi; asosiy bor bo'lsa tashlanadi
    for k in list(furn.keys()):
        kl=k.lower()
        if 'направляющая левая' in kl or 'направляющая правая' in kl or 'направляющая лев' in kl or 'направляющая прав' in kl:
            base=re.sub(r'\s*направляющая\s+(лев\w*|прав\w*)\s*$','',k,flags=re.I).strip()
            if base in furn: del furn[k]   # asosiy komplekt bor — bolani tashla
    def _unit(nm):
        low=nm.lower()
        if 'направля' in low or 'salazk' in low or 'салазк' in low or 'тандем' in low or 'tandem' in low: return 'komplekt'
        return 'dona'
    fittings=[{'name':k,'count':v,'unit':_unit(k)} for k,v in sorted(furn.items(),key=lambda x:-x[1])]
    fasteners=[{'name':k,'count':v,'unit':'dona'} for k,v in sorted(fast.items(),key=lambda x:-x[1])]
    # kesim ro'yxati (detallar)
    pmap={}
    for o in panels:
        dl,dw=contour_bbox(o['contour_outer'])
        dl=round(dl);dw=round(dw);dp=round(o.get('thickness',16) or 16)
        oval=any(e['type']=='arc' for e in o['contour_outer'])
        area=poly_area(o['contour_outer'])/1e6
        mat=o.get('material','(material yoq)')
        key=(o.get('name','?'),dl,dw,dp,mat)
        if key not in pmap: pmap[key]={'name':o.get('name','?'),'dl':dl,'dw':dw,'dp':dp,
            'material':mat,'count':0,'area_m2':round(area,4),'oval':oval}
        pmap[key]['count']+=1
    parts=sorted(pmap.values(),key=lambda p:(-p['count'],-p['area_m2']))
    for i,p in enumerate(parts): p['no']=i+1;p['totalArea_m2']=round(p['area_m2']*p['count'],3)
    # materialda detal
    bym=defaultdict(lambda:[0,0,0.0])
    for p in parts:
        bym[p['material']][0]+=1;bym[p['material']][1]+=p['count'];bym[p['material']][2]+=p['totalArea_m2']
    byMaterial=[{'material':k,'partTypes':v[0],'detailCount':v[1],'totalArea_m2':round(v[2],3)}
                for k,v in sorted(bym.items(),key=lambda x:-x[1][1])]
    return {
        'panelCount':len([o for o in objs if o.get('modelCode')==PANEL_CODE]),
        'panelsWithContour':len(panels),
        'totalDetails':sum(p['count'] for p in parts),
        'uniquePartTypes':len(parts),
        'ovalParts':sum(p['count'] for p in parts if p['oval']),
        'totalArea_m2':round(sum(p['totalArea_m2'] for p in parts),3),
        'materials':materials,'edgeBands':edgeBands,'fittings':fittings,
        'fasteners':fasteners,'parts':parts,'byMaterial':byMaterial}

# ================================ BITTA FAYLNI ISHLASH ================================
def process_file(path,key=None):
    res={'file':os.path.basename(path),'path':path,'flags':[]}
    raw=open(path,'rb').read()
    res['size']=len(raw)
    model=inflate_biggest(raw)
    if looks_encrypted(model):
        if key:
            dec=decrypt_attempt(raw,key)
            if dec is None:
                res['status']='SHIFRLANGAN';res['flags'].append('encrypted_key_failed');return res
            model=inflate_biggest(dec)
        else:
            res['status']='SHIFRLANGAN';res['flags'].append('encrypted');return res
    if model is None:
        res['status']='ZLIB_YOQ';res['flags'].append('no_zlib');return res
    names,vs=read_schema(model)
    stream=decode_stream(model,vs,names);objs=parse_objects(stream);fmt='schema-li'
    if not any(o.get('modelCode')==PANEL_CODE for o in objs):
        stream=decode_stream_nameless(model);objs=parse_objects(stream);fmt='schema-siz'
    spec=generate_spec(objs)
    res['status']='OK';res['format']=fmt;res['spec']=spec
    # validatsiya bayroqlari
    p=spec
    if p['panelCount']==0:
        # stream'da kontur blob bormi? bor bo'lsa — boshqa format (bo'sh emas)
        ncont=sum(1 for n,t,v in stream if t=='blob' and decode_contour(v))
        if ncont>0: res['flags'].append(f'boshqa_format_kontur{ncont}')
        else: res['flags'].append('0_panel_bosh')
    if p['panelsWithContour']>0:
        nomat=p['panelsWithContour']-sum(m['panelCount'] for m in p['materials'])
        res['nomat']=nomat
        if nomat>0.4*p['panelsWithContour']: res['flags'].append(f'material_kam_{nomat}')
    # furniturada guruh nomi qolдими?
    if any(re.search(r'^eshik$|polka \d|korpus|^\d|^дверь$',f['name'].lower()) for f in p['fittings']):
        res['flags'].append('furn_guruh_shubha')
    # gabarit outlier (juda katta)
    big=[pt for pt in p['parts'] if pt['dl']>50000 or pt['dw']>50000]
    if big: res['flags'].append('gabarit_katta')
    # manfiy maydon/uzunlik
    if any(m['totalArea_m2']<0 for m in p['materials']): res['flags'].append('maydon_manfiy')
    if any(e['totalLength_m']<0 for e in p['edgeBands']): res['flags'].append('kromka_manfiy')
    return res

# ================================ LOG (FOYDALANUVCHI UCHUN) ================================
def write_log(res,logdir):
    safe=re.sub(r'[^\w\-.А-Яа-я ]','_',res['file'])[:120]
    path=os.path.join(logdir,safe+'.txt')
    L=[]
    L.append('='*70);L.append(f"FAYL: {res['file']}");L.append('='*70)
    if res['status']!='OK':
        L.append(f"HOLAT: {res['status']}  {' '.join(res['flags'])}")
        open(path,'w',encoding='utf-8').write('\n'.join(L));return
    s=res['spec']
    L.append(f"Format: {res['format']}   Hajm: {res['size']} bayt")
    L.append(f"Panellar: {s['panelCount']} (konturli: {s['panelsWithContour']})")
    L.append(f"Detallar: {s['totalDetails']} dona ({s['uniquePartTypes']} tur), oval: {s['ovalParts']}")
    L.append(f"Umumiy maydon: {s['totalArea_m2']} m²")
    if res.get('flags'): L.append(f"⚠ BAYROQLAR: {', '.join(res['flags'])}")
    L.append('')
    L.append('--- MATERIALLAR (panel × maydon) ---')
    for m in s['materials']: L.append(f"  {m['panelCount']:4d} panel  {m['totalArea_m2']:8.3f} m²  {m['name']}")
    if res.get('nomat'): L.append(f"  (materialsiz: {res['nomat']} panel — import-mesh/operatsiya bo'lishi mumkin)")
    L.append('')
    L.append('--- KROMKA (chetlar × uzunlik) ---')
    for e in s['edgeBands']:
        ov=f"  [oval: {e['ovalEdges']} yoy = {e['ovalLength_m']} m]" if e['ovalEdges'] else ''
        L.append(f"  {e['edgeCount']:4d} chet  {e['totalLength_m']:8.2f} m  {e['name']}{ov}")
    L.append('')
    L.append('--- FURNITURA (miqdor + birlik) ---')
    for f in s['fittings']: L.append(f"  {f['count']:4d} {f.get('unit','dona'):8s}  {f['name']}")
    L.append('')
    L.append('--- MAHKAMLAGICH (miqdor + birlik) ---')
    for f in s['fasteners']: L.append(f"  {f['count']:4d} {f.get('unit','dona'):8s}  {f['name']}")
    L.append('')
    L.append('--- MATERIALDA DETAL ---')
    for m in s['byMaterial']: L.append(f"  {m['detailCount']:4d} detal ({m['partTypes']} tur)  {m['totalArea_m2']:8.3f} m²  {m['material']}")
    L.append('')
    L.append('--- KESIM RO\'YXATI (har detal) ---')
    L.append(f"  {'#':>3s}  {'soni':>4s}  {'dl×dw×dp':>16s}  {'maydon m²':>9s}  nom [material]")
    for p in s['parts']:
        ov=' ⬭OVAL' if p['oval'] else ''
        L.append(f"  {p['no']:3d}  {p['count']:4d}×  {p['dl']:5d}×{p['dw']:<5d}×{p['dp']:<3d}  {p['totalArea_m2']:9.3f}  {p['name']} [{p['material']}]{ov}")
    open(path,'w',encoding='utf-8').write('\n'.join(L))

# ================================ ASOSIY (BATCH) ================================
def main():
    args=[a for a in sys.argv[1:] if not a.startswith('--')]
    folder=args[0] if args else '.'
    key=None
    for a in sys.argv[1:]:
        if a.startswith('--key='): key=a[6:]
    files=sorted(glob.glob(os.path.join(folder,'**','*.b3d'),recursive=True))
    if not files:
        print(f"'{folder}' papkasida .b3d fayl topilmadi.");return
    outdir=os.path.join(folder,'bazis_natija')
    logdir=os.path.join(outdir,'logs')
    os.makedirs(logdir,exist_ok=True)
    print(f"{len(files)} ta .b3d fayl topildi. Ishlanmoqda...\n")

    results=[]
    det_csv=open(os.path.join(outdir,'master_detallar.csv'),'w',newline='',encoding='utf-8-sig')
    mat_csv=open(os.path.join(outdir,'master_materiallar.csv'),'w',newline='',encoding='utf-8-sig')
    krm_csv=open(os.path.join(outdir,'master_kromka.csv'),'w',newline='',encoding='utf-8-sig')
    fur_csv=open(os.path.join(outdir,'master_furnitura.csv'),'w',newline='',encoding='utf-8-sig')
    dw=csv.writer(det_csv,delimiter=';');dw.writerow(['Fayl','No','Nom','dl','dw','dp','Material','Soni','Maydon_m2','Jami_maydon_m2','Oval'])
    mw=csv.writer(mat_csv,delimiter=';');mw.writerow(['Fayl','Material','Panel_soni','Maydon_m2'])
    kw=csv.writer(krm_csv,delimiter=';');kw.writerow(['Fayl','Kromka','Chetlar','Uzunlik_m','Oval_yoy','Oval_uzunlik_m'])
    fw=csv.writer(fur_csv,delimiter=';');fw.writerow(['Fayl','Tur','Nom','Soni','Birlik'])

    for i,path in enumerate(files,1):
        try:
            r=process_file(path,key)
        except Exception as e:
            r={'file':os.path.basename(path),'path':path,'status':'XATO','flags':['exception'],
               'error':str(e),'trace':traceback.format_exc()[-500:]}
        results.append(r)
        try: write_log(r,logdir)
        except Exception as e: pass
        # CSV
        if r.get('status')=='OK':
            s=r['spec'];fn=r['file']
            for p in s['parts']: dw.writerow([fn,p['no'],p['name'],p['dl'],p['dw'],p['dp'],p['material'],p['count'],p['area_m2'],p['totalArea_m2'],'ha' if p['oval'] else ''])
            for m in s['materials']: mw.writerow([fn,m['name'],m['panelCount'],m['totalArea_m2']])
            for e in s['edgeBands']: kw.writerow([fn,e['name'],e['edgeCount'],e['totalLength_m'],e['ovalEdges'],e['ovalLength_m']])
            for f in s['fittings']: fw.writerow([fn,'furnitura',f['name'],f['count'],f.get('unit','dona')])
            for f in s['fasteners']: fw.writerow([fn,'mahkamlagich',f['name'],f['count'],f.get('unit','dona')])
        if i%50==0 or i==len(files): print(f"  ... {i}/{len(files)}")
    for f in (det_csv,mat_csv,krm_csv,fur_csv): f.close()

    # ===== HISOBOT (CLAUDE uchun) =====
    ok=[r for r in results if r.get('status')=='OK']
    enc=[r for r in results if r.get('status')=='SHIFRLANGAN']
    err=[r for r in results if r.get('status') in ('XATO','ZLIB_YOQ')]
    flagged=[r for r in ok if r.get('flags')]
    fmt_count=Counter(r.get('format') for r in ok)
    tot_panel=sum(r['spec']['panelCount'] for r in ok)
    tot_det=sum(r['spec']['totalDetails'] for r in ok)
    tot_area=round(sum(r['spec']['totalArea_m2'] for r in ok),2)

    rep={'sana':datetime.now().isoformat(timespec='seconds'),'papka':os.path.abspath(folder),
         'jami_fayl':len(files),'ok':len(ok),'shifrlangan':len(enc),'xato':len(err),
         'bayroqli':len(flagged),'format':dict(fmt_count),
         'jami_panel':tot_panel,'jami_detal':tot_det,'jami_maydon_m2':tot_area,
         'xato_fayllar':[{'file':r['file'],'status':r.get('status'),'error':r.get('error')} for r in err],
         'shifrlangan_fayllar':[r['file'] for r in enc],
         'bayroqli_fayllar':[{'file':r['file'],'flags':r['flags'],
             'panel':r['spec']['panelCount'],'detal':r['spec']['totalDetails'],
             'nomat':r.get('nomat',0)} for r in flagged],
         'har_fayl':[{'file':r['file'],'format':r.get('format'),
             'panel':r['spec']['panelCount'],'konturli':r['spec']['panelsWithContour'],
             'detal':r['spec']['totalDetails'],'tur':r['spec']['uniquePartTypes'],
             'oval':r['spec']['ovalParts'],'maydon_m2':r['spec']['totalArea_m2'],
             'material_turi':len(r['spec']['materials']),'kromka_turi':len(r['spec']['edgeBands']),
             'furnitura_turi':len(r['spec']['fittings']),'mahkamlagich_turi':len(r['spec']['fasteners']),
             'nomat':r.get('nomat',0),'flags':r.get('flags',[])} for r in ok]}
    json.dump(rep,open(os.path.join(outdir,'HISOBOT_CLAUDE.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)

    T=[]
    T.append('='*70);T.append('BAZIS B3D PARTIYALI TEKSHIRUV — HISOBOT (Claude uchun)');T.append('='*70)
    T.append(f"Sana: {rep['sana']}");T.append(f"Papka: {rep['papka']}")
    T.append(f"Jami fayl: {rep['jami_fayl']}  |  OK: {rep['ok']}  |  Shifrlangan: {rep['shifrlangan']}  |  Xato: {rep['xato']}  |  Bayroqli: {rep['bayroqli']}")
    T.append(f"Format: {rep['format']}")
    T.append(f"JAMI: {rep['jami_panel']} panel, {rep['jami_detal']} detal, {rep['jami_maydon_m2']} m²")
    T.append('')
    if err:
        T.append('--- ❌ XATO FAYLLAR ---')
        for r in err: T.append(f"  {r['file']}: {r.get('status')} {r.get('error','')}")
        T.append('')
    if enc:
        T.append(f"--- 🔒 SHIFRLANGAN ({len(enc)}) — kalit kerak (--key=PAROL) ---")
        for r in enc[:50]: T.append(f"  {r['file']}")
        T.append('')
    if flagged:
        T.append('--- ⚠ BAYROQLI FAYLLAR (tekshirish kerak) ---')
        for r in flagged: T.append(f"  {r['file']}: {', '.join(r['flags'])}  (panel={r['spec']['panelCount']}, detal={r['spec']['totalDetails']}, nomat={r.get('nomat',0)})")
        T.append('')
    T.append('--- HAR FAYL QISQACHA (panel/detal/material/kromka/furnitura) ---')
    T.append(f"  {'fayl':40s} {'pan':>4s} {'det':>4s} {'tur':>4s} {'oval':>4s} {'m²':>8s} {'mat':>3s} {'krm':>3s} {'fur':>3s} {'krp':>3s} {'nomat':>5s}")
    for r in ok:
        s=r['spec']
        T.append(f"  {r['file'][:40]:40s} {s['panelCount']:4d} {s['totalDetails']:4d} {s['uniquePartTypes']:4d} {s['ovalParts']:4d} {s['totalArea_m2']:8.2f} {len(s['materials']):3d} {len(s['edgeBands']):3d} {len(s['fittings']):3d} {len(s['fasteners']):3d} {r.get('nomat',0):5d}")
    open(os.path.join(outdir,'HISOBOT_CLAUDE.txt'),'w',encoding='utf-8').write('\n'.join(T))

    print(f"\n{'='*55}")
    print(f"TAYYOR: {len(ok)} OK, {len(enc)} shifrlangan, {len(err)} xato, {len(flagged)} bayroqli")
    print(f"Natija papkasi: {outdir}")
    print(f"  • logs/<fayl>.txt    — har fayl batafsil (SIZ tekshirasiz)")
    print(f"  • master_*.csv       — Excelда tekshirish uchun")
    print(f"  • HISOBOT_CLAUDE.txt — MENGA shuни tashlang (tahlil uchun)")

if __name__=='__main__':
    main()
