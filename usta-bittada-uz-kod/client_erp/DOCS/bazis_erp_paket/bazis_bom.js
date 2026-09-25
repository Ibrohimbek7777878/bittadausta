/* =====================================================================
   bazis_bom.js  —  Bazis .b3d professional parser + spetsifikatsiya (BOM)
   ---------------------------------------------------------------------
   Imkoniyatlar:
     • Ikkala B3D format: eski (schema-li) va Bazis 24 (schema-siz)
     • Shifrlangan faylni aniqlash (entropiya) — kalit so'rovi
     • TContour3D dekod (chiziq 0x10 + yoy/oval 0x12)
     • Kvaternion transform → global geometriya
     • SPETSIFIKATSIYA:
         - parts: kesim ro'yxati (bir xil detal guruhlangan, soni bilan)
         - byMaterial: qaysi materialda qancha detal + maydon
         - edgeBands: kromka (oval/yoy uzunligi bilan)
         - fittings / fasteners: furnitura va mahkamlagich soni
         - summary: jami/noyob detal soni, oval soni, maydon
   Talab: pako (zlib). Node:  const pako=require('pako')
          Brauzer: <script src="pako.min.js"></script> (global pako)
   ===================================================================== */
(function(global){
'use strict';
const PANEL_CODE=4002;
const FITTING_CODES=[1005,2004,3001,4004];
const MATKEYS=/ЛДСП|ЛМДФ|ЛХДФ|МДФ|ДСП|ХДФ|Стекло|Зеркало|Массив|Акрил|Acryl|акрил|Эмаль|Шпон|Пластик|Постформинг|Фанера|ДВП|Egger|Эггер|Kronospan|Кроношпан|Ламарти|Lamarty|Schattdecor|AGT|Frente|Каштан|Столешниц|Союз|Кварц|Агломерат|Компакт|Алюмин|ПЭТ|XDF|LDSP|LMDF|LHDF|MDF|DSP|HDF|steklo|zerkalo|akril|plastik|LDVP/;
const MAT_PATTERN=/\d+\s*мм|\d+\s*[mм][mм]|\d{3,}\s*[*xх×\/]\s*\d{3,}|\d+\s*кв/i;
function isMaterialLike(vs){const low=vs.toLowerCase();if(low.indexOf('кромка')>=0||low.indexOf('принадлеж')>=0||low.indexOf('присадк')>=0)return false;if(vs.length<5)return false;return MAT_PATTERN.test(vs);}
const FASTENER=/винт|vint|шкант|shkant|саморез|samorez|эксцентрик|конфирмат|минификс|стяжк|уголок|us3|евро|алкан|alkan|7х|7x|футорка|дюбель|гвоздь/i;
// Guruh/qurilish so'zlari (furnitura EMAS — substring xavfsiz)
const GROUP_KEYS=['korpus','корпус','shkaf','шкаф','stoyka','стойк','блок','block','рамка','ramka','анимац','каркас','секц','metka','метка','перегородк','fasad','фасад','столешниц','цоколь','planka','стенк','перемычк','основание','подложк','царг','конструкц','konstr','дверь','dver','eshik','эшик'];
// polka/pol/bok/dno — faqat ALOHIDA so'z (polkaderjatel detal ushlagich — saqlanadi!)
const GROUP_WORD=/(^|[\s\-_])(polka|полка|pol|пол|dno|дно|bok|бок|past|tepa|chap|primoy|polgorbat)([\s\-_\d]|$)/;
function classifyFitting(nm, panelNames){
  const low=nm.toLowerCase().trim();
  if(/^[\d\s.,x×\-+/]+$/.test(low))return null;       // raqam/o'lcham
  if(/^\d/.test(low))return null;                       // raqam bilan boshlanadi
  if(GROUP_WORD.test(low))return null;                  // polka/pol alohida so'z = detal/guruh
  for(const pn of panelNames){if(pn&&pn.length>2&&(low===pn||low.startsWith(pn+' ')))return null;}
  if(GROUP_KEYS.some(k=>low.indexOf(k)>=0))return null; // qurilish/guruh
  if(FASTENER.test(low))return 'fast';                  // mahkamlagich
  return 'furn';                                        // qolgani = furnitura (polkaderjatel ham!)
}
const r=(x,n)=>{const f=Math.pow(10,n);return Math.round(x*f)/f;};

/* ---------- zlib: eng katta blokni ochish ---------- */
function inflateBiggest(bytes){
  const pako=global.pako||(typeof require!=='undefined'&&require('pako'));
  if(!pako)throw new Error('pako (zlib) kerak');
  let best=null,bestScore=-1,bestBig=null;
  const needle=[0xa2,0x0f,0x00,0x00];
  function cnt4002(o){let c=0;for(let i=0;i<o.length-3;i++){if(o[i]===0xa2&&o[i+1]===0x0f&&o[i+2]===0&&o[i+3]===0)c++;}return c;}
  for(let i=0;i<bytes.length-2;i++){
    if(bytes[i]===0x78&&(bytes[i+1]===0x9c||bytes[i+1]===0x01||bytes[i+1]===0xda)){
      try{const o=pako.inflate(bytes.subarray(i));if(o.length>500){const sc=cnt4002(o);if(!bestBig||o.length>bestBig.length)bestBig=o;if(sc>0&&(sc>bestScore||(sc===bestScore&&best&&o.length>best.length))){best=o;bestScore=sc;}}}catch(e){}
    }
  }
  return best||bestBig;
}
const rU32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;
const rI32=(b,o)=>b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24);

/* ---------- shifrlash aniqlash ---------- */
function blockEntropy(b){const n=Math.min(b.length,65536);if(n<256)return 0;const c=new Array(256).fill(0);for(let i=0;i<n;i++)c[b[i]]++;let e=0;for(let i=0;i<256;i++){if(c[i]){const p=c[i]/n;e-=p*Math.log2(p);}}return e;}
function countStrings(b){let cnt=0,i=0;const n=Math.min(b.length,200000);while(i<n-2){if(b[i]>=0x20&&b[i]<0x80&&b[i+1]===0){let j=i,ln=0;while(j<n-1&&((b[j]>=0x20&&b[j]<0x80&&b[j+1]===0)||(((b[j+1]<<8)|b[j])>=0x400&&((b[j+1]<<8)|b[j])<0x460))){j+=2;ln++;}if(ln>=5)cnt++;i=j+2;}else i++;}return cnt;}
function looksEncrypted(model){if(!model)return true;let c=0;for(let i=0;i<model.length-3;i++){if(model[i]===0xa2&&model[i+1]===0x0f&&model[i+2]===0&&model[i+3]===0)c++;}if(c>=3)return false;return blockEntropy(model)>7.0||countStrings(model)<3;}

/* ---------- schema (eski format) ---------- */
function readSchema(model){
  let start=-1;
  for(let p=40;p<400;p++){if(p+4>model.length)break;const ln=rU32(model,p);
    if(ln>=2&&ln<=6){let ok=true;for(let k=0;k<ln;k++){const c=model[p+4+k];if(c<65||c>122){ok=false;break;}}
      if(ok){const p2=p+4+ln;if(p2+4<=model.length){const l2=rU32(model,p2);
        if(l2>=1&&l2<=24){let o2=true;for(let k=0;k<l2;k++){const c=model[p2+4+k];if(c<32||c>126){o2=false;break;}}if(o2){start=p;break;}}}}}}
  if(start<0)start=53;
  const names=[];let p=start;
  while(p+4<=model.length){const ln=rU32(model,p);if(ln<1||ln>24)break;let ok=true,s='';
    for(let k=0;k<ln;k++){const c=model[p+4+k];if(c<32||c>126){ok=false;break;}s+=String.fromCharCode(c);}
    if(!ok)break;names.push(s);p+=4+ln;}
  return {names,valuesStart:p};
}

/* ---------- qiymat oqimi: TLV <idx:4><flag:4><tip:1><qiymat> ---------- */
function decodeStream(model,start,names){
  const dv=new DataView(model.buffer,model.byteOffset,model.byteLength);
  const dec=new TextDecoder('utf-16le');const out=[];let i=start;const nn=names.length,L=model.length;
  while(i<L-9){const idx=rU32(model,i);if(idx>=nn){i++;continue;}const m=model[i+8],vp=i+9;
    if(m===0x05){if(vp+8>L)break;out.push({name:names[idx],type:'d',val:dv.getFloat64(vp,true)});i=vp+8;}
    else if(m===0x04){if(vp+4>L)break;out.push({name:names[idx],type:'i32',val:rI32(model,vp)});i=vp+4;}
    else if(m===0x03){out.push({name:names[idx],type:'i8',val:model[vp]});i=vp+1;}
    else if(m===0x06){const ln=rU32(model,vp);if(ln>2000||vp+4+ln*2>L){i++;continue;}out.push({name:names[idx],type:'str',val:dec.decode(model.subarray(vp+4,vp+4+ln*2))});i=vp+4+ln*2;}
    else if(m===0x07){const ln=rU32(model,vp);if(ln>0&&ln<5e6&&vp+4+ln<=L){out.push({name:names[idx],type:'blob',val:model.subarray(vp+4,vp+4+ln)});i=vp+4+ln;}else i++;}
    else i++;}
  return out;
}
/* Bazis 24 schema-siz: nom yo'q, resync bilan */
function decodeStreamNameless(model){
  const dv=new DataView(model.buffer,model.byteOffset,model.byteLength);
  const dec=new TextDecoder('utf-16le');const out=[];let pos=0;const L=model.length;
  while(pos<L-9){const idx=rU32(model,pos),m=model[pos+8],vp=pos+9;let ok=false;
    if(idx<100000){
      if(m===0x05&&vp+8<=L){out.push({name:''+idx,type:'d',val:dv.getFloat64(vp,true)});pos=vp+8;ok=true;}
      else if(m===0x04&&vp+4<=L){out.push({name:''+idx,type:'i32',val:rI32(model,vp)});pos=vp+4;ok=true;}
      else if(m===0x03&&vp+1<=L){out.push({name:''+idx,type:'i8',val:model[vp]});pos=vp+1;ok=true;}
      else if(m===0x06){const ln=rU32(model,vp);if(ln>=0&&ln<=2000&&vp+4+ln*2<=L){out.push({name:''+idx,type:'str',val:dec.decode(model.subarray(vp+4,vp+4+ln*2))});pos=vp+4+ln*2;ok=true;}}
      else if(m===0x07){const ln=rU32(model,vp);if(ln>0&&ln<5e6&&vp+4+ln<=L){out.push({name:''+idx,type:'blob',val:model.subarray(vp+4,vp+4+ln)});pos=vp+4+ln;ok=true;}}
    }
    if(!ok)pos++;
  }
  return out;
}

/* ---------- TContour3D blob: chiziq 0x10 / yoy(oval) 0x12 ---------- */
function decodeContour(payload){
  if(payload.length<37)return null;
  const dv=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
  const cnt=dv.getUint32(0,true);if(cnt<1||cnt>2000)return null;
  const els=[];let o=4;
  for(let e=0;e<cnt;e++){if(o>=payload.length)return null;const tag=payload[o];o++;
    if(tag===0x10){if(o+32>payload.length)return null;
      const x1=dv.getFloat64(o,true),y1=dv.getFloat64(o+8,true),x2=dv.getFloat64(o+16,true),y2=dv.getFloat64(o+24,true);o+=32;
      if(Math.max(Math.abs(x1),Math.abs(y1),Math.abs(x2),Math.abs(y2))>1e6)return null;
      els.push({type:'line',p1:[x1,y1],p2:[x2,y2]});}
    else if(tag===0x12){if(o+49>payload.length)return null;
      const cx=dv.getFloat64(o,true),cy=dv.getFloat64(o+8,true),x1=dv.getFloat64(o+16,true),y1=dv.getFloat64(o+24,true),x2=dv.getFloat64(o+32,true),y2=dv.getFloat64(o+40,true);
      const dir=payload[o+48];o+=49;
      if(Math.max(Math.abs(cx),Math.abs(cy),Math.abs(x1),Math.abs(y1))>1e6)return null;
      els.push({type:'arc',center:[cx,cy],p1:[x1,y1],p2:[x2,y2],dir:!!dir});}
    else return null;}
  if(o!==payload.length)return null;
  return els;
}
function contourPolygon(els,segs){segs=segs||10;const pts=[];
  for(const el of els){if(el.type==='line')pts.push([el.p1[0],el.p1[1]]);
    else{const cx=el.center[0],cy=el.center[1];let a1=Math.atan2(el.p1[1]-cy,el.p1[0]-cx),a2=Math.atan2(el.p2[1]-cy,el.p2[0]-cx);const rr=Math.hypot(el.p1[0]-cx,el.p1[1]-cy);
      if(el.dir){while(a2<=a1)a2+=Math.PI*2;}else{while(a2>=a1)a2-=Math.PI*2;}
      for(let k=0;k<segs;k++){const a=a1+(a2-a1)*k/segs;pts.push([cx+rr*Math.cos(a),cy+rr*Math.sin(a)]);}}}
  return pts;}
function polyArea(els){const poly=contourPolygon(els);let a=0;const N=poly.length;for(let i=0;i<N;i++){const j=(i+1)%N;a+=poly[i][0]*poly[j][1]-poly[j][0]*poly[i][1];}return Math.abs(a)/2;}
function contourBBox(els){const poly=contourPolygon(els);let mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;for(const p of poly){if(p[0]<mnx)mnx=p[0];if(p[0]>mxx)mxx=p[0];if(p[1]<mny)mny=p[1];if(p[1]>mxy)mxy=p[1];}return {dl:mxx-mnx,dw:mxy-mny};}
function elemLen(el){if(el.type==='line')return Math.hypot(el.p2[0]-el.p1[0],el.p2[1]-el.p1[1]);const cx=el.center[0],cy=el.center[1],rr=Math.hypot(el.p1[0]-cx,el.p1[1]-cy);const a1=Math.atan2(el.p1[1]-cy,el.p1[0]-cx),a2=Math.atan2(el.p2[1]-cy,el.p2[0]-cx);return rr*Math.abs(a2-a1);}

/* ---------- transform: 7 ketma-ket double (oxirgi 4 norm=1 kvaternion) ---------- */
function findQuatRun(seg){let run=[];for(const it of seg){if(it.type==='d'){run.push(it.val);if(run.length>=7){const d=run.slice(-7);const nq=d[3]*d[3]+d[4]*d[4]+d[5]*d[5]+d[6]*d[6];if(Math.abs(nq-1)<0.02&&Math.max(Math.abs(d[0]),Math.abs(d[1]),Math.abs(d[2]))<1e6)return{pos:[d[0],d[1],d[2]],quat:[d[3],d[4],d[5],d[6]]};}}else run=[];}return null;}

/* ---------- obyektlarni yig'ish (universal, nomga bog'liq emas) ---------- */
function assemble(stream){
  const cbn={};for(const it of stream){if(it.type==='i32'&&it.val===PANEL_CODE)cbn[it.name]=(cbn[it.name]||0)+1;}
  let marker=null,best=-1;for(const k in cbn){if(cbn[k]>best){best=cbn[k];marker=k;}}
  if(marker===null)return [];
  const headers=[];for(let k=0;k<stream.length;k++){const it=stream[k];if(it.type==='i32'&&it.name===marker)headers.push(k);}
  const objs=[];
  for(let hi=0;hi<headers.length;hi++){const k=headers[hi],code=stream[k].val,end=(hi+1<headers.length)?headers[hi+1]:stream.length;const seg=stream.slice(k,end);
    if(code!==PANEL_CODE){const rec={modelCode:code};const nv=seg.find(it=>it.type==='str'&&it.val.trim());if(nv)rec.name=nv.val.trim();const tr=findQuatRun(seg);if(tr)rec.tf=tr;objs.push(rec);continue;}
    const rec={modelCode:PANEL_CODE};const butts=[],contours=[];let curB=null,afterMat=false,matFallback=null;const tr=findQuatRun(seg);if(tr)rec.tf=tr;
    for(const it of seg){
      if(it.type==='str'){const vs=it.val.trim();if(!vs)continue;const low=vs.toLowerCase();
        if(low.indexOf('кромка')>=0){if(curB&&curB.thickness!==undefined&&curB.edgeIndex!==undefined&&curB.butt_name===undefined){curB.butt_name=vs;curB=null;}else{curB={name:vs};butts.push(curB);}continue;}
        if(MATKEYS.test(vs)){if(!rec.material){rec.material=vs;afterMat=true;}continue;}
        if(matFallback===null&&isMaterialLike(vs))matFallback=vs;
        if(!rec.name&&vs.length>1&&!/^[\d.,\s]+$/.test(vs))rec.name=vs;}
      else if(it.type==='d'){if(curB&&curB.thickness===undefined&&it.val>0&&it.val<=20)curB.thickness=it.val;else if(afterMat&&rec.thickness===undefined&&it.val>=1&&it.val<=100){rec.thickness=it.val;afterMat=false;}}
      else if(it.type==='i8'){if(curB&&curB.thickness!==undefined&&curB.edgeIndex===undefined&&it.val<=7)curB.edgeIndex=it.val;}
      else if(it.type==='blob'){const els=decodeContour(it.val);if(els)contours.push(els);}}
    if(!rec.material&&matFallback){rec.material=matFallback;const mm=matFallback.match(/(\d+)\s*мм/);if(mm&&rec.thickness===undefined){const tv=+mm[1];if(tv>=1&&tv<=100)rec.thickness=tv;}}
    let fb=butts.filter(b=>b.thickness!==undefined||b.edgeIndex!==undefined);if(!fb.length)fb=butts;if(fb.length)rec.butts=fb;
    if(contours.length){rec.contour_outer=contours[0];if(contours.length>1)rec.contour_inner=contours.slice(1);}
    objs.push(rec);}
  return objs;
}

/* ====================== ASOSIY: parse ====================== */
function parseBazisB3D(bytes, opts){
  opts=opts||{};
  let model=inflateBiggest(bytes);
  if(looksEncrypted(model)){
    if(!opts.key)return {encrypted:true, message:'Fayl shifrlangan — kalit kerak (opts.key)'};
    // deshifr karkasi (RC4/XOR) — rasmiy algoritm namuna bilan tasdiqlanadi
    const dec=decryptAttempt(bytes,opts.key);
    if(!dec)return {encrypted:true, keyTried:true, message:"Kalit ishlamadi — algoritm noma'lum"};
    bytes=dec.data;model=inflateBiggest(bytes);
  }
  if(!model)throw new Error('zlib model bloki topilmadi');
  let stream,format;
  const sc=readSchema(model);
  stream=decodeStream(model,sc.valuesStart,sc.names);
  if(stream.some(it=>it.type==='i32'&&it.val===PANEL_CODE)){format='Bazis B3D (schema-li)';}
  else{stream=decodeStreamNameless(model);format='Bazis 24 B3D (schema-siz)';}
  const objects=assemble(stream);
  return {format, objects};
}
function decryptAttempt(bytes,key){
  const rc4=(k,d)=>{const S=[];for(let i=0;i<256;i++)S[i]=i;const kb=Array.from(new TextEncoder().encode(k));let j=0;for(let i=0;i<256;i++){j=(j+S[i]+kb[i%kb.length])&255;const t=S[i];S[i]=S[j];S[j]=t;}const o=new Uint8Array(d.length);let a=0;j=0;for(let n=0;n<d.length;n++){a=(a+1)&255;j=(j+S[a])&255;const t=S[a];S[a]=S[j];S[j]=t;o[n]=d[n]^S[(S[a]+S[j])&255];}return o;};
  const xor=(k,d)=>{const kb=Array.from(new TextEncoder().encode(k));const o=new Uint8Array(d.length);for(let i=0;i<d.length;i++)o[i]=d[i]^kb[i%kb.length];return o;};
  for(const fn of [rc4,xor]){try{const dec=fn(key,bytes);const m=inflateBiggest(dec);if(m&&!looksEncrypted(m))return {data:dec};}catch(e){}}
  return null;
}

/* ====================== SPETSIFIKATSIYA (BOM) ====================== */
function generateSpecification(objects){
  const panels=objects.filter(o=>o.modelCode===PANEL_CODE&&o.contour_outer);
  /* --- 1. KESIM RO'YXATI (detallar, bir xil guruhlangan) --- */
  const pmap=new Map();
  for(const o of panels){
    const bb=contourBBox(o.contour_outer);
    const dl=Math.round(bb.dl),dw=Math.round(bb.dw),dp=Math.round(o.thickness||16);
    const isOval=o.contour_outer.some(e=>e.type==='arc');
    const area=polyArea(o.contour_outer)/1e6;
    const mat=o.material||'(material yo‘q)';
    const key=[o.name||'?',dl,dw,dp,mat].join('|');
    if(!pmap.has(key)){
      // chet uzunliklari (oval/yoy bilan)
      const edges=(o.butts||[]).map(b=>{const ei=b.edgeIndex;let len=0,arc=false;
        if(ei!==undefined&&ei<o.contour_outer.length){len=elemLen(o.contour_outer[ei]);arc=o.contour_outer[ei].type==='arc';}
        return {name:(b.name||'?').trim(),length_mm:r(len,1),isArc:arc};});
      pmap.set(key,{name:o.name||'?',dl,dw,dp,material:mat,count:0,area_m2:r(area,4),isOval,edges});
    }
    pmap.get(key).count++;
  }
  const parts=[...pmap.values()].sort((a,b)=>b.count-a.count||b.area_m2-a.area_m2);
  let no=1;parts.forEach(p=>{p.no=no++;p.totalArea_m2=r(p.area_m2*p.count,3);});
  /* --- 2. MATERIALDA QANCHA DETAL --- */
  const mmap=new Map();
  for(const p of parts){if(!mmap.has(p.material))mmap.set(p.material,{material:p.material,thickness:p.dp,partTypes:0,detailCount:0,totalArea_m2:0,parts:[]});
    const m=mmap.get(p.material);m.partTypes++;m.detailCount+=p.count;m.totalArea_m2=r(m.totalArea_m2+p.totalArea_m2,3);
    m.parts.push({name:p.name,size:`${p.dl}×${p.dw}×${p.dp}`,count:p.count});}
  const byMaterial=[...mmap.values()].sort((a,b)=>b.detailCount-a.detailCount);
  /* --- 3. KROMKA (oval/yoy uzunligi bilan) --- */
  const emap=new Map();
  for(const o of panels){const els=o.contour_outer;
    for(const b of (o.butts||[])){const nm=(b.name||'?').trim();const ei=b.edgeIndex;
      if(!emap.has(nm))emap.set(nm,{name:nm,edgeCount:0,totalLength_m:0,arcCount:0,arcLength_m:0});
      const E=emap.get(nm);E.edgeCount++;
      if(els&&ei!==undefined&&ei<els.length){const el=els[ei];const L=elemLen(el)/1000;E.totalLength_m+=L;if(el.type==='arc'){E.arcCount++;E.arcLength_m+=L;}}}}
  const edgeBands=[...emap.values()].map(e=>({name:e.name,edgeCount:e.edgeCount,totalLength_m:r(e.totalLength_m,2),ovalEdges:e.arcCount,ovalLength_m:r(e.arcLength_m,2)})).sort((a,b)=>b.totalLength_m-a.totalLength_m);
  /* --- 4. FURNITURA / MAHKAMLAGICH --- */
  const fmap=new Map(),smap=new Map();
  const panelNames=new Set(objects.filter(o=>o.modelCode===PANEL_CODE&&o.name).map(o=>o.name.replace(/\r/g,' ').trim().toLowerCase()));
  for(const o of objects){if(FITTING_CODES.indexOf(o.modelCode)>=0&&o.name){const nm=o.name.replace(/\r/g,' ').replace(/\s+/g,' ').trim();
    const cls=classifyFitting(nm,panelNames);
    if(cls==='fast')smap.set(nm,(smap.get(nm)||0)+1);
    else if(cls==='furn')fmap.set(nm,(fmap.get(nm)||0)+1);}}
  // Направляющие chap/o'ng = komplekt bo'lagi; asosiy bor bo'lsa tashla
  for(const k of [...fmap.keys()]){const kl=k.toLowerCase();
    if(kl.includes('направляющая лев')||kl.includes('направляющая прав')){
      const base=k.replace(/\s*направляющая\s+(лев\S*|прав\S*)\s*$/i,'').trim();
      if(fmap.has(base))fmap.delete(k);}}
  const _unit=nm=>{const l=nm.toLowerCase();return (l.includes('направля')||l.includes('salazk')||l.includes('салазк')||l.includes('тандем')||l.includes('tandem'))?'komplekt':'dona';};
  const fittings=[...fmap.entries()].map(([name,count])=>({name,count,unit:_unit(name)})).sort((a,b)=>b.count-a.count);
  const fasteners=[...smap.entries()].map(([name,count])=>({name,count,unit:'dona'})).sort((a,b)=>b.count-a.count);
  /* --- 5. XULOSA --- */
  const totalDetails=parts.reduce((s,p)=>s+p.count,0);
  const ovalParts=parts.filter(p=>p.isOval).reduce((s,p)=>s+p.count,0);
  const totalArea=r(parts.reduce((s,p)=>s+p.totalArea_m2,0),3);
  return {
    summary:{
      totalDetails,            // jami detal soni
      uniquePartTypes:parts.length, // noyob detal turi
      ovalParts,               // oval (yoyli) detal soni
      materialCount:byMaterial.length,
      totalArea_m2:totalArea,
      edgeBandTypes:edgeBands.length,
      totalEdgeLength_m:r(edgeBands.reduce((s,e)=>s+e.totalLength_m,0),2),
      fittingTypes:fittings.length,
      fastenerTypes:fasteners.length
    },
    parts, byMaterial, edgeBands, fittings, fasteners
  };
}

const API={parseBazisB3D, generateSpecification, looksEncrypted, _internal:{assemble,decodeContour,contourBBox,polyArea,elemLen}};
if(typeof module!=='undefined'&&module.exports)module.exports=API;
global.BazisBOM=API;
})(typeof window!=='undefined'?window:globalThis);
