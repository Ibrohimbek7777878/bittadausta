# B3D PARSER — TO'LIQ TEXNIK BILIM (ERP integratsiyasi uchun)

> Bu hujjat Bazis-Mebelshik `.b3d` formati va parser haqida **hamma narsani** o'z ichiga oladi:
> nima ishlaydi (tasdiqlangan), nima sinalган, va nima HALI OCHILMAGAN (cheklovlar).
> 918+ haqiqiy faylда sinalган. Manba: reverse-engineering + rasmiy BPJ eksport + Bazis Script API hujjati bilan solishtirib tasdiqlangan.

---

## 0. QISQA XULOSA
- `.b3d` = Bazis mebel loyihasi (binar, zlib-siqilgan, ba'zan shifrlangan).
- Parser DLL/litsenziyasiz o'qiydi: panellar (geometriya+material+kromka), furnitura, mahkamlagich.
- Chiqadi: **BOM (спецификация)** — material (m²), kromka (m), furnitura/mahkamlagich (dona/komplekt), kesim ro'yxati (detallar).
- Tayyor vositalar paketда: `bazis_bom.js` (Node/brauzer), `b3d_full_parser.py` (Python), `bazis_batch.py` (minglab fayl).

---

## 1. FAYL STRUKTURASI (container)
```
[BZ85 magic, 5 bayt]                  # "BZ85" + 1 versiya bayti
  bayt[5]=0x0e -> eski format (schema-li)
  bayt[5]=0x13 -> Bazis 24 (schema-siz)   (lekin ISHONCHLI EMAS — pastга qarang)
[PNG thumbnail]                       # ko'rish rasmi
[bir nechta zlib blok]                # 0x78 0x9c/0x01/0xda bilan boshlanadi
  -> eng kattasi MODEL EMAS bo'lishi mumkin (pastga qarang!)
```

### ⚠ MUHIM TUZATISH: MODEL BLOKINI TANLASH
Ko'p faylда eng katta zlib blok = **196864 baytlik NOL-bufer (junk)**, haqiqiy model kichikroq blokda.
**Yechim:** har zlib blokни ochib, ichида **panel kodi 4002** (`b'\xa2\x0f\x00\x00'` = i32 LE) eng ko'p uchragan blokни tanlash. Eng KATTA emas.
```python
score = decompressed.count(b'\xa2\x0f\x00\x00')   # 4002 soni
# score>0 bo'lgan, eng yuqori scoreли blokни ol; hech qaysida bo'lmasa — eng kattasini
```
Bu xato 918 faylда ~40 faylни noto'g'ri "shifrlangan" deb belgilagandi.

---

## 2. TLV GRAMMATIKA (qiymat oqimi)
Model bloki ichida har yozuv:
```
<idx:4 LE> <flag:4 LE> <type:1> <value>
```
**type bayti:**
| type | turi        | value formati |
|------|-------------|---------------|
| 0x03 | int8        | 1 bayt |
| 0x04 | int32       | 4 bayt LE |
| 0x05 | double      | 8 bayt LE (IEEE754) |
| 0x06 | wstring     | `<len:4 LE>` keyin `len*2` bayt UTF-16LE |
| 0x07 | blob        | `<len:4 LE>` keyin `len` bayt (kontur shu yerda) |

### Ikki format
- **schema-li (eski):** model boshida NOM lug'ati bor (`<len:4><ASCII nom>...`). `idx` shu lug'atga ishora qiladi.
- **schema-siz (Bazis 24):** nom lug'ati YO'Q. `idx` shunchaki raqam. Resync bilan o'qiladi (`decode_stream_nameless`).
- Parser AVTOMATIK aniqlaydi: avval schema-li o'qiydi; agar 4002 topilmasa → schema-siz walkerга o'tadi. (bayt[5] versiyasiga ISHONMA — ishonchli emas.)

---

## 3. OBYEKT KODLARI (i32 qiymat)
| kod | obyekt | izoh |
|-----|--------|------|
| **4002** | TFurnPanel | **PANEL** — geometriya, global transform, kontur, material, kromka |
| 1005, 2004, 3001, 4004 | furnitura/mahkamlagich | aralash — pastga qarang |
| 1001 | Габаритная рамка / Линия стыка | qurilish chizig'i (BOMда emas) |
| 6000 | Параллельная линия | yordamchi chiziq |
| 1000 | Model | ildiz |

Panel marker: stream ichida 4002 qiymatини eng ko'p ko'targan `idx` (nom) — segmentatsiya markeri.

---

## 4. KONTUR (TContour3D) — blob 0x07 ichida
```
<count:4 LE>                          # element soni
keyin har element:
  tag 0x10 = T2DLine:  <p1.x,p1.y,p2.x,p2.y : 4×double = 32 bayt>
  tag 0x12 = T2DArc:   <center.x,center.y, p1.x,p1.y, p2.x,p2.y : 6×double=48 bayt> <dir:1 bayt> = 49 bayt
                        # MARKAZ BIRINCHI keladi!
```
- Qattiq validator: `offset == len(payload)` aniq mos bo'lsa — to'g'ri kontur.
- Detal o'lchami: `dl=max(x)-min(x)`, `dw=max(y)-min(y)` (mm).
- Yuza: shoelace formula → m² (×1e-6).
- **Oval/yoy kromka uzunligi:** `r × burchak` (yoy uzunligi). r=hypot(p1-center).
- Qalinlik (dp): material stringidagi "Nмм" yoki transformdan; yo'q bo'lsa default 16mm.

---

## 5. TRANSFORM (TTransformation) = vektor + kvaternion
- Panel segmentида **7 ketma-ket double**: `pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w`.
- Oxirgi 4 ta — kvaternion (norm ≈ 1, tolerantlik 0.02). `find_quat_run` shu naqshni qidiradi.
- Kvaternion → aylanish matritsasi (ustun o'qlar):
```
s = 2/norm
AxisX = (1-s(qy²+qz²),  s(qxqy+qzqw),  s(qxqz-qyqw))
AxisY = (s(qxqy-qzqw),  1-s(qx²+qz²),  s(qyqz+qxqw))
AxisZ = (s(qxqz+qyqw),  s(qyqz-qxqw),  1-s(qx²+qy²))
global = pos + x·AxisX + y·AxisY + z·AxisZ
```
- Panel GLB = kontur ekstruziya (z ∈ [0..qalinlik]) + transform.
- **SCALE = 0.001** (mm → metr).
- ✅ Rasmiy BPJ eksport bilan tekshirilган: 77/77 panel pozitsiya + AxisX/Y/Z **aynan** (xato 0.0).

---

## 6. MATERIAL ANIQLASH
1. **Kalit so'z** (katta-kichik harfга befarq): ЛДСП, ЛМДФ, ЛХДФ, МДФ, ХДФ, Стекло, Зеркало, Акрил, Acryline, Эмаль, Шпон, Пластик, Постформинг, Egger, Kronospan, Schattdecor, AGT, Frente, Каштан, Столешница, Союз, Кварц, Алюмин, ПЭТ + **lotin:** XDF, LDSP, LMDF, LHDF, MDF, HDF, steklo, akril...
2. **Naqsh fallback:** brend nomi yo'q bo'lsa ham, qalinlik (`18мм`/`18mm`) yoki o'lcham (`2800*1220`, `2750/1830`) bor string = material (kromka/izoh mustasno). Lotin "MM" va "/" ham tushadi.
3. **Tier-3 (dekor):** "Дуб Белый" kabi yalang dekor nomi — agar kromka nomида ham bo'lsa ("Кромка ... Дуб Белый") → material dekori.
- Yuza = shoelace × soni. Material bo'yicha jamlanadi.
- ⚠ ~3% detal hali materialsiz qoladi (import-mesh yoki noma'lum dekor).

---

## 7. KROMKA (TFurnButt)
- Panel segmentida "кромка" so'zli string topilsa → kromka. Keyin: `double` (qalinlik 0<v≤20), `int8` (edgeIndex, chet raqami ≤7), takror string (butt nomi).
- edgeIndex → konturning qaysi qirrasiga tegishli → uzunlik = elem_len(kontur[edgeIndex]).
- Oval (yoy) chet uzunligi = r×burchak.
- Kromka bo'yicha jamlanadi: jami uzunlik (m), oval qirralar soni + oval uzunligi.

---

## 8. FURNITURA / MAHKAMLAGICH (gibrid klassifikatsiya)
Kod 1005/2004/3001/4004 — furnitura BILAN birga GURUH nomlari (Дверь, polka, korpus) ham bor. Ajratish:
1. Raqam/o'lcham kodi (3000, 3x2,5) → chiqarib tashlanadi.
2. `polka`/`pol`/`bok` ALOHIDA so'z (so'z-chegarasi!) → detal/guruh. LEKIN `polkaderjatel` (ichida "polka" bor) → SAQLANADI.
3. Panel nomi bilan boshlansa (Дверь, eshik 2x) → guruh.
4. Qurilish so'zlari (korpus, shkaf, рамка, конструкция, анимация) → chiqariladi.
5. Mahkamlagich kalit so'zi (винт, шкант, эксцентрик, евро, алкан, конфирмат) → **mahkamlagich**.
6. **Qolgan hammasi = furnitura** (noma'lum brendlar ham: Крепление, Ножка, GTV Штанга, Направляющие).

### O'lchov birligi
- `komplekt` — Направляющие, Тандем, Салазка (juft/to'plam).
- `dona` — qolgan hamma furnitura va barcha mahkamlagич.

### ⚠ Направляющие dedup
"Направляющие ... Направляющая левая" + "... правая" = bitta komplektning chap/o'ng reykasi. Asosiy "Направляющие ..." bor bo'lsa, chap/o'ng qatorlar olib tashlanadi (uch baravar sanash xato). `верхняя`/`нижняя` (kupe yuqori/past) — alohida saqlanadi.

---

## 9. KESIM RO'YXATI (detallar)
- Faqat kod 4002 + konturli panellar.
- Bir xil detallar guruhlanadi: kalit = `(nom, dl, dw, dp, material)`.
- Har guruh: soni, yuza (m²), jami yuza, oval (ha/yo'q).
- "Materialда detal" = material bo'yicha guruhlangan detal soni + yuza.

---

## 10. SHIFRLASH
- **Aniqlash:** model 3+ panel kodi (4002) tutsa → SHIFRLANMAGAN (katta mesh entropiyani oshirsa ham). Aks holda: entropiya>7.0 yoki o'qiladigan string<3 → shifrlangan.
- ⚠ Bu tuzatishdan oldin ~40 fayl noto'g'ri "shifrlangan" edi (yuqoriga qarang).

---

## ❌ HALI OCHILMAGAN / CHEKLOVLAR (MUHIM — Claude Code shularni bilsin)

### 11.1 Haqiqiy shifrlash (Encrypt=1) — OCHILMAGAN
Bir nechta fayl haqiqatan shifrlangan (panel kodi yo'q, entropiya ~8). RC4/XOR sinaб ko'rilди, lekin **algoritm tasdiqlanmagan** — ishlamadi. Parollar bor (`3Km8JdPZ`=BIG ONE EXPORT, `8CoP3TlI`=Mebel City), lekin deshifr usuli noma'lum.
**KERAK:** bitta loyihani Bazisда SHIFRLI va SHIFRSIZ saqlab, ikkalasini solishtirish → algoritmni teskari muhandislik. Hozircha shifrlanган fayllar parse qilinmaydi (faqat belgilanadi).

### 11.2 "Boshqa format" / 4002 markeri yo'q fayllar — QISMAN
Ba'zi fayllarда (mas. eski Bazis 9/10) kontur bor (143 ta) lekin **4002 panel kodi YO'Q** — boshqa record layout, TLV resync buziladi. ~0.5% fayl. Bunday fayllar `boshqa_format_konturN` deb belgilanadi (bo'sh emas), lekin to'liq parse qilinmaydi.
**KERAK:** o'sha versiyaning record strukturasini alohida o'rganish (bir nechta namuna kerak).

### 11.3 Embedded mesh (TImportedMesh) — QISMAN
Import qilinган furnitura (mas. Boyard) binar mesh blob sifatida saqlanadi (~1.2MB): count + nom + transform doubles + float massiv. Qisman ochilган (@76 transform, @205 float zona) lekin TO'LIQ EMAS. Shuning uchun bunday furnitura 3D geometriyasi GLBда yo'q. (Ko'p faylда furnitura parametrik — bu muammo emas; faqat import-mesh holatда.)

### 11.4 ~3% detal materialsiz
Yalang dekor nomlari yoki import-mesh detallari. Yuza/soni to'g'ri, faqat material yorlig'i yo'q. ERPда "qo'lда biriktirish" ro'yxatiga tushsin.

### 11.5 THole / TFurnCut (teshik/kesim) — OCHILMAGAN
Teshiklar va ichki kesimlar parametri to'liq dekod qilinmagan. BOM yuzasiga sezilarli ta'sir qilmaydi (teshiklar kichik), lekin aniq присадка/teshik ro'yxati uchun kerak bo'lsa — ochilmagan.

### 11.6 TAnimBlock3D (animatsiya) — OCHILMAGAN
Tortmalar/eshiklar ochiq holatда saqlanishi mumkin (animatsiya pozitsiyasi, mas. tortma z=-400). Bu BPJ bilan AYNAN mos (parser xatosi emas), lekin "yopiq" holat geometriyasini tiklash uchun animatsiya blokini dekod qilish kerak. BOM uchun muammo emas (yuza/o'lcham to'g'ri).

### 11.7 Ichma-ich ierarxiya (T3DObjectList) — soddalashtirilган
Obyektlar ota-bola ierarxiyasi tekislangan. Panellar GLOBAL transformга ega bo'lganи uchun BOM/geometriya uchun muammo emas, lekin "qaysi panel qaysi blokda" tuzilmasi to'liq tiklanmagan.

---

## 12. TASDIQLANGAN NATIJALAR (sinov)
- **918 fayl:** 0 parse xatosi (crash yo'q). ~875 to'liq parse.
- BPJ eksport bilan: 77/77 panel pozitsiya/o'lcham/o'q **aynan** (xato 0.0); ЛХДФ yuza 4.249 m² == BPJ.
- WRL bilan: gabarit aynan (6.86×2.59×1.01m).
- Oval: Столешница r=13mm, "tom" r=925mm — yoy uzunligi to'g'ri.
- Furnitura/detal: polka(detal) vs polkaderjatel(furnitura) to'g'ri ajraladi; 0 chalkashlik.

---

## 13. PARSER INTERFEYSI (kodни qanday chaqirish)

### JavaScript / Node (`bazis_bom.js`)
```js
const { parseBazisB3D, generateSpecification } = require('./bazis_bom.js'); // pako kerak
const result = parseBazisB3D(uint8arrayBytes /*, {key:'PAROL'}*/);
if (result.encrypted) { /* shifrlangan — belgilab qo'y */ }
else {
  const spec = generateSpecification(result.objects);
  // spec.materials  [{name, panelCount, totalArea_m2}]
  // spec.edgeBands  [{name, edgeCount, totalLength_m, ovalEdges, ovalLength_m}]
  // spec.fittings   [{name, count, unit}]   unit: 'dona'|'komplekt'
  // spec.fasteners  [{name, count, unit}]
  // spec.parts      [{no,name,dl,dw,dp,material,count,area_m2,totalArea_m2,oval}]
  // spec.byMaterial [{material, partTypes, detailCount, totalArea_m2}]
  // spec.summary    {totalDetails, uniquePartTypes, ovalParts, totalArea_m2, ...}
}
```

### Python (`b3d_full_parser.py`)
```python
import b3d_full_parser as P
raw = open(path,'rb').read()
model = P.inflate_biggest(raw)
if P.looks_encrypted(model): ...   # shifrlangan
names,_,vs = P.read_schema(model)
stream = P.decode_stream(model, vs, names)
objs = P.parse_objects(stream)
if not any(o.get('modelCode')==4002 for o in objs):
    stream = P.decode_stream_nameless(model); objs = P.parse_objects(stream)
bom = P.compute_bom(objs)   # materials/edgeBands/fittings/fasteners
# kesim ro'yxati: generate_spec uslubida (bazis_batch.py da to'liq bor)
```

### Partiyali (`bazis_batch.py`) — minglab fayl
```
python3 bazis_batch.py /papka/yo'li [--key=PAROL]
# -> bazis_natija/logs/*.txt, master_*.csv, HISOBOT_CLAUDE.json/txt
```

---

## 14. ERP UCHUN MUHIM ESLATMALAR
- Material nomlari TURLICHA yoziladi (kirill/lotin, qisqartma): ERP katalogiga **normalizatsiya + fuzzy match** kerak.
- Material narxi odatda **m² yoki list (lист)** bo'yicha; **chiqindi koeffitsienti** (~10-15%) qo'shiladi.
- Kromka narxi — **погонный метр (m)** bo'yicha.
- Furnitura/mahkamlagich — **dona/komplekt** bo'yicha.
- Materialsiz va shifrlangan/boshqa-format fayllar → "qo'lда tekshirish" ro'yxatiga.
