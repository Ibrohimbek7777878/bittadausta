# CLAUDE CODE PROMPT — Bazis B3D → ERP narx-hisoblash moduli

> Quyidagi matnni Claude Code'ga (loyihangiz ichida) ko'chiring. Bu paketdagi fayllar:
> `bazis_bom.js`, `b3d_full_parser.py`, `bazis_batch.py`, `B3D_PARSER_BILIM.md` — shu zip ichida.

---

## VAZIFA
Bazis-Mebelshik `.b3d` chizmasidan **avtomatik narx (спецификация + смета)** chiqaradigan modul yoz. Modul bizning **ERP** ichiga ulanadi: ERP bazasida materiallar, kromka, zapchast (furnitura/mahkamlagich) NARXLARI bilan bor. Chizmadan chiqarilган BOM shu katalogga moslanib, har detal/material/furnituraning narxi va loyihaning UMUMIY tannarxi hisoblanadi.

## KIRISH MA'LUMOTI
- Bir yoki bir nechta `.b3d` fayl (Bazisдан eksport, DLL/litsenziyasiz o'qiladi).
- ERP katalogi (bazadan): materiallar (narx m²/list), kromka (narx m), furnitura/mahkamlagич (narx dona/komplekt). Katalog sxemasini loyihadan o'qib moslab ol.

## TAYYOR PARSER (qayta yozma — shularni ishlat)
Paketдa **sinalган, 918+ faylда tasdiqlangan** parser bor. Stack'ga qarab tanla:
- **Node/JS ERP:** `bazis_bom.js` → `parseBazisB3D(bytes)` + `generateSpecification(objs)`. Faqat `pako` (zlib) kerak.
- **Python ERP:** `b3d_full_parser.py` (parser) yoki `bazis_batch.py` (partiyali, mustaqil, faqat stdlib).
- **MUHIM:** parser mantig'ini o'zgartirма. `B3D_PARSER_BILIM.md` da format, ishlaган/sinalган/ocholmagan hamma narsa yozilган — avval SHUNI to'liq o'qi.

## BOM CHIQISHI (parser beradi)
```
materials:  [{name, panelCount, totalArea_m2}]
edgeBands:  [{name, edgeCount, totalLength_m, ovalEdges, ovalLength_m}]
fittings:   [{name, count, unit}]     // unit: 'dona' | 'komplekt'
fasteners:  [{name, count, unit}]
parts:      [{no,name,dl,dw,dp,material,count,area_m2,totalArea_m2,oval}]  // kesim ro'yxati
byMaterial: [{material, partTypes, detailCount, totalArea_m2}]
summary:    {totalDetails, uniquePartTypes, ovalParts, totalArea_m2, ...}
```

## QURISH KERAK BO'LGAN MODUL

### 1. Parse qatlami
- `.b3d` → BOM (yuqoridagi struktura). Tayyor parserни o'rab `parseProject(file)` yoz.
- Shifrlangan / "boshqa_format" / 0-panel fayllarни ALOHIDA bayroqla (xato berma, "qo'lда tekshirish" ro'yxatiga qo'y). Aniqlash mantig'i `B3D_PARSER_BILIM.md` §10, §11.2 da.

### 2. Katalogga moslash (matching) — eng nozik qism
- BOM material/furnitura nomlari TURLICHA yoziladi (kirill/lotin, qisqartma, qalinlik, dekor). ERP katalog SKU'lariga moslash uchun:
  - Nomni normalizatsiya qil (kichik harf, ortiqcha bo'shliq/tinish, kirill↔lotin transliteratsiya, qalinlik/o'lcham ajratib ol).
  - Avval ANIQ moslik, keyin fuzzy (mas. token-set / Levenshtein / trigram) ostona bilan.
  - Moslik topilmasa — "moslanmagan" ro'yxatiga (narx 0, qo'lда biriktirish). HECH QACHON taxminiy narx qo'yма.
- Material qalinligi (dp) va dekorни inobatga ol (16мм Белый ≠ 18мм Дуб).

### 3. Narxlash (pricing)
- **Material:** yuza (m²) × narx/m². **Chiqindi koeffitsienti** qo'sh (sozlanadigan, default 1.10–1.15). Agar ERP listда (лист) sotsa — yuzani list yuzasiga bo'lib, yuqoriga yaxlitlab list soni × list narxi (kesim/раскрой mantig'i; oddiy versiyada koeffitsient yetarli).
- **Kromka:** uzunlik (m) × narx/m (oval uzunligi ham qo'shilган).
- **Furnitura/mahkamlagич:** soni × narx (birlik: dona yoki komplekt — `unit` maydonига qarab).
- Har qatorни hisobla: `qty × unit_price = line_total`. Kategoriya bo'yicha subtotal + UMUMIY jami.

### 4. Chiqish
- Tuzilган spetsifikatsiya (har qator: nom, miqdor, birlik, narx, summa).
- Kategoriya jamlari: material / kromka / furnitura / mahkamlagич.
- Loyiha umumiy tannarxi (+ ixtiyoriy: ish haqi/qo'shimcha koeffitsient ERP sozlamasidan).
- Moslanmagan/bayroqli qatorlar alohida (qo'lда ko'rib chiqish uchun).
- ERP bazasiga yozadigan/JSON qaytaradigan API (loyihaning mavjud uslubiga mos).

### 5. Test
- Paketдаги `.b3d` namunalар bo'lsa shularда sinab ko'r; bo'lmasa mock BOM bilan.
- Chiqindi koeffitsienti, fuzzy ostonasi, valyuta — sozlanadigan bo'lsin.

## CHEKLOVLARNI HISOBGA OL (B3D_PARSER_BILIM.md §11)
- Haqiqiy shifrlangan fayllar (Encrypt=1) hozircha o'qilmaydi → bayroqla, narxlama.
- ~3% detal materialsiz bo'lishi mumkin → "moslanmagan"ga.
- Embedded mesh furnitura geometriyasi yo'q (lekin BOM soni to'g'ri).
- Doston "Гнутая2" kabi manba-anomaliyalari (juda katta gabarit) → bayroqla, avtomatik narxlama.

## PRINSIP
Aniqlik > to'liqlik. Shubhali narsani TAXMIN qilma — bayroqla. Xato narx qimmatga tushadi.
Kod toza, modulli, ERP stackiga mos, testlar bilan bo'lsin.
