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


---

# 7-BO'LIM — Bazis B3D → BOM + Smeta moduli (6.1–6.10 USTIGA quriladi)

> **Maqsad:** Mijoz (mebelchi) Bazis-Mebelshik `.b3d` chizmasini o'z mini-ERP buyurtma sahifasiga yuklaydi va **30 soniyada** spetsifikatsiya (BOM) hamda taxminiy narx ko'radi. Narx KATTA ERP `price_list` dan deterministik olinadi — modul narx **uydirmaydi**.
>
> **Bu bo'lim 6.1–6.10 qoralamasini QAYTARMAYDI, ustiga quradi.** Texnik parser (`bazis_bom.js`) qora quti sifatida o'rab ishlatiladi; B3D'da UUID YO'Q → mavjud `sale_crud.py` ning **nom+qalinlik** moslash namunasi (`_match_by_name`, `_bpj_search_product`, `_bpj_search_with_cache`) takrorlanadi va normalizatsiya + fuzzy + xotira bilan kuchaytiriladi.
>
> **Yakuniy prinsip (mavjud CLAUDE_CODE_PROMPT'dan, qat'iy):** *Aniqlik > to'liqlik. Taxminiy narx QO'YMA — bayroqla. Xato narx qimmatga tushadi. Cost (tannarx) mijozga HECH QACHON ko'rinmaydi.*

---

## 7.0 — Grounding xulosasi (qayta yozilmaydi — shularga ULANADI)

Quyidagi real komponentlar grep bilan tasdiqlangan; modul shularga ulanadi, ularni o'zgartirmaydi:

| Komponent | Yo'l (tasdiqlangan qator) | Ishlatilishi |
|-----------|---------------------------|--------------|
| **Parser** | `client_erp/DOCS/bazis_erp_paket/bazis_bom.js` | Chiqish obyekti (263-qator `return`): `{ parts, byMaterial, edgeBands, fittings, fasteners, summary }`. **`materials` kaliti YO'Q.** |
| **Parser bilim** | `client_erp/DOCS/bazis_erp_paket/B3D_PARSER_BILIM.md` | §11.1 `Encrypt=1` ochilmaydi; §11.4 ~3% materialsiz; §11 (149–150-qator) — shifrlash aniqlash **false-positive** xavfi (~40 fayl noto'g'ri belgilangandi) |
| **Narx** | `price_list/models.py` | `PriceList` (`Розничный`/`Оптовый`, `last_synced_at`@24) + `PriceListItem` (`erp_product_uuid`@48, `cost_price`@58, `price_uzs`@62, `price_usd`@66, FK→`products.Product`@72, `unique_together=(price_list, erp_product_uuid)`@82, `.price` property@90→`price_uzs`) |
| **Ombor/tur** | `warehouse/models/balance.py` | `WarehouseBalance`@28 (`product_type`@58 [panel/kromka/furnitura], `category`@39→`WarehouseCategory`, `warehouse_name`@38, `quantity`@59, `quantity_reserved`@65, `quantity_available`@101, `price`@71, `cost_basis_usd`@73) |
| **Ombor / kategoriya** | `warehouse/models/warehouse.py:17` (`Warehouse`), `warehouse/models/category.py:20` (`WarehouseCategory`) | BOM_turi→Ombor[+Kategoriya] xaritasi FK manbasi |
| **Uslugalar** | `widget_service/models.py` | `Service`@74, `ServicePricing`@216 (`cost_price`@221, `client_price`), `PricingRule`@281: `FROM_PROJECT_M2`@271, `FROM_PROJECT_BAND`@272 (kromka metr), `FROM_PROJECT_LIST`@273 |
| **AI/MCP** | `core/mcp_registry.py` | `mcp_tool(name, description)`@24, `handle_mcp_request(request_data, user, db_alias='default')`@95 — `user`+`db_alias` avtomatik in'ektsiya (@71/135), qolgani typed kwargs, `dict` qaytaradi |
| **Trigger** | `widget_files/signals.py` | `post_save`→`OrderFile`; `project_file_code_check`@178 + `_background()` thread namunasi (@119/214/233). **Diqqat:** mavjud signal `.project` ga bog'langan (@190) va `_CACHE_EXTS`@17 da `.b3d` YO'Q → **yangi `.b3d` filtri qo'shiladi** |
| **Mavjud nom-matching** | `sales/views/sale_crud.py` | `_match_by_name(name, thickness_mm)`@602, `_bpj_search_product(name, thickness)`@1148, `_bpj_search_with_cache(kind, name, thickness)`@1236 — **nom+qalinlik moslash ALLAQACHON BOR**, BOM uchun shu qayta ishlatiladi (UUID-only `sale_parse_project`@506 emas) |
| **Qalinlik ajratuvchi** | `warehouse/scrapers/project_parser.py:51` | `_extract_thickness(name)` — **shu qayta ishlatiladi** (sales/ da emas — qoralama xato joy ko'rsatgan edi) |
| **Mini-ERP sahifa** | `static/client_erp/js/pages/order-detail.js` (`_filesGrid`, `_bindFiles`) | `📎 Fayllar` bloki — BOM kartochka shu yerga ulanadi |
| **Dizayn tokenlari** | `static/client_erp/css/base.css` | `--accent`/`--accent2`/`--warning`/`--danger`/`--radius`; `Toast`/`Skeleton`/`Modal` |
| **Foydalanuvchi** | `dashboard/models.py:62` (`CustomUser`) | `BomMatchMemory.created_by` FK — **`dashboard.CustomUser`** (qoralamada to'g'ri) |

**Parser chiqish strukturasi (AYNAN — moslash kodi shularga tayanadi):**
```
byMaterial[]  : { material, thickness, partTypes, detailCount, totalArea_m2, parts[{name,size,count}] }   // ⚠ "name/panelCount/dp" EMAS
edgeBands[]   : { name, edgeCount, totalLength_m, ovalEdges, ovalLength_m }   // ⚠ "oval" EMAS — ovalEdges + ovalLength_m
fittings[]    : { name, count, unit }            // furnitura
fasteners[]   : { name, count, unit:'dona' }     // mahkamlagich
parts[]       : { no, name, size:"dl×dw×dp", material, count, area_m2, totalArea_m2, isOval, edges }
summary       : { totalParts, uniqueParts, ovalParts, materialCount, totalArea_m2, edgeBandTypes, totalEdgeLength_m, fittingTypes, ... }
encrypted     : true (shifrlanganda — parts/byMaterial chiqmaydi: { encrypted:true, message:... })
```

**Yangi komponentlar (faqat ulanish — qayta yozish YO'Q):**

| Komponent | Joy | Ulanadi |
|-----------|-----|---------|
| `BomSnapshot`, `BomEstimate`, `BomItem`, `BomMatchMemory`, `BomMatchConfig`, `BomTypeWarehouseMap`, `BomDensity` (+ix. `BomCatalogVector`) | yangi `bom/` app, tenant DB | `warehouse`, `products`, `price_list`, `widget_service` |
| `normalize_bom_name()`, `match_pipeline()`, `convert_to_kg()` | `bom/matching.py` | `bazis_bom.js` chiqishi + `project_parser._extract_thickness` + `sale_crud._match_by_name`/`_bpj_search_*` |
| `bom.ai_match_suggest` MCP tool | `bom/mcp.py` | `core.mcp_registry.mcp_tool` (avtodiscover) |
| Smeta saqlash + recompute trigger | `bom/models.py` + signal | `widget_files.OrderFile` `post_save` (`.b3d`), narx `post_save` |
| Eval harness | `bom/tests/golden.jsonl` + `pytest` | CI / har deploy |
| UI komponentlari | `static/client_erp/js/components/bom/` | `order-detail.js` `_filesGrid` |

**Restart (CLAUDE.md):** Python/model → `sudo systemctl restart bittada-manager`; MCP WS orqali → `bittada-manager-ws` ham. Static → `collectstatic` + `spa.html` dagi `?v=N` oshirish. Migratsiya: `makemigrations bom && migrate --database=tenant_mebelcity`. **`bom` app `INSTALLED_APPS` ga + tenant router'ga (`tenant_manager`) qo'shilishi SHART** — aks holda model tenant DB'ga migratsiya bo'lmaydi.

---

# A QISM — MAHSULOT (PRD)

## 7.1 — Vizyon va biznes qiymati

**Vizyon:** Mijoz chizmani tashlaydi → 30 soniyada BOM + taxminiy narx. Hech kim qo'lda detal sanamaydi, narx so'ramaydi, telefon kutmaydi.

**Biznes qiymati:**
- **Ishonch + konversiya:** mijoz real KATTA ERP narxlari bo'yicha o'zini baholaydi → "qora quti" yo'qoladi, smeta→zakaz oshadi.
- **Lead sifati:** chizma yuklagan = issiq lead; narx menejer ishi 20 daqiqadan 2 daqiqaga tushadi.
- **Marketing farqlovchisi:** "Chizmangizni yuklang — narxni o'zingiz ko'ring" — raqobatchilarda yo'q.
- **Operatsion tejam:** menejer faqat **moslanmagan (flagged)** qatorlarni ko'radi, hammasini emas.

## 7.2 — Personalar va JTBD

| Persona | Kim | JTBD | Kutadi |
|---------|-----|------|--------|
| **Mijoz-mebelchi** | client_erp buyurtma sahifasi | "Chizmam materialiga necha pul ketishini o'zim, tez bilay" | Yuklash → ixcham narx kartochka. **Faqat sotuv narxi (cost EMAS).** |
| **ERP admin / katalog menejeri** | `mebelcity.bittada.uz` admin | "BOM nomlari katalogimga ulansin, bir marta moslagach esda qolsin" | BOM_turi→Ombor jadvali, `BomMatchMemory`, AI taklif |
| **Narx menejer** | smeta tasdiqlovchi | "Faqat shubhali qatorlarni ko'rib smeta beray" | Moslanmaganlar ro'yxati, eskirgan narx ogohlantirish, qayta hisoblash |
| **Sotuv menejeri** | leadni yopuvchi | "Mijoz ko'rgan smetani zakazga aylantiray" | Smeta snapshot, "zakazga o'tkazish" (Faza-2/3) |

## 7.3 — User story'lar + qabul mezonlari

### US-1 — Mijoz chizma yuklab narx ko'radi *(MVP yadrosi)*
- [ ] `.b3d` `widget_files`'ga yuklanganda (trigger 6.1), 30 soniyada fayl tagida ixcham kartochka: jami detal, jami m², jami kromka m, **umumiy sotuv narxi (UZS)**.
- [ ] "Batafsil" → BOM jadval: asil nomi, miqdor, birlik, **sotuv narxi**, satr summasi (6.2).
- [ ] Mijoz **`cost_price`/`cost_basis_usd`/`ServicePricing.cost_price` HECH QAYERDA ko'rmaydi** — faqat tanlangan `PriceList` sotuv narxi (`price_uzs`).
- [ ] Narx topilmagan satr "Narx aniqlanmoqda / qo'lda tekshirilmoqda" — **"0 UZS" yoki taxmin YO'Q**.
- [ ] Smeta snapshot saqlanadi; qayta ochilganda qayta parse qilinmaydi (6.8).

### US-2 — Admin BOM_turini omborga moslaydi *(MVP)*
- [ ] `BOM_turi → Warehouse[+Category]` jadvali (`BomTypeWarehouseMap`) sozlanadi (6.3); panel→panel ombori va h.k.
- [ ] Material qatori (`byMaterial[]`) faqat `WarehouseBalance.product_type='panel'` ichidan moslanadi (**kross-tur taqiqlangan**).
- [ ] Ikki tomonlama bog'lanish (`BomItem ↔ WarehouseBalance/Product/PriceListItem`).
- [ ] Qalinlik (`thickness`) mos kelmasa moslash **rad** yoki past-ishonch flag (16мм ≠ 18мм).

### US-3 — Bir marta moslagach avtomatik *(MVP)*
- [ ] Tasdiqlangach `BomMatchMemory`'ga yoziladi: `normalized_name → product/warehouse/type/price_list_item/coeff` (6.9).
- [ ] Keyingi parse'da aynan/normalize mos nom **avtomatik** ulanadi (qo'l aralashuvsiz).
- [ ] Narx o'zgargan bo'lsa, xotira **mahsulotni** ulaydi, narxni `PriceListItem`'dan **yangidan** oladi (eskirgan narx cache QILINMAYDI).

### US-4 — AI bilan top *(MVP)*
- [ ] Tugma `core.mcp_registry` orqali AI'dan **mahsulot taklifi** so'raydi (top-3, ishonch %) (6.10).
- [ ] AI **narx QO'YMAYDI** — faqat `Product/WarehouseBalance` nomzodi; narx doim `PriceListItem`'dan.
- [ ] Tasdiqlansa → `BomMatchMemory` (US-3 oqimi). Rad → moslanmagan qoladi.

### US-5 — Uslugalar smetaga *(MVP)*
- [ ] Kromka uslugasi `FROM_PROJECT_BAND` rejimida `edgeBands[].totalLength_m` (oval uzunligi `ovalLength_m` qo'shilgan) dan (6.5).
- [ ] Arra (Распил) m²/list `FROM_PROJECT_M2`/`FROM_PROJECT_LIST` (`summary.totalArea_m2`), prisadka (ПРИСАДКА) dona/teshik — tegishli `ServicePricing`'dan.
- [ ] Uslugalar **avtomatik qo'shilmaydi** — foydalanuvchi tanlaydi (CLAUDE.md). **Istisno:** project/b3d fayldan yuklangan mahsulotlarda kromka uslugasi majburiy (chek urishdan oldin).
- [ ] Smeta: Material+Kromka+Furnitura+Uslugalar → UMUMIY; moslanmaganlar alohida blok (6.6).

## 7.4 — Roadmap (MVP / Faza-2 / Faza-3)

**MVP — "Yukla, ko'r, ishon":**
1. `.b3d` parse (`bazis_bom.js` o'rami) + saqlash (6.1, 6.8).
2. BOM jadval + sotuv narxi default `PriceList`'dan (6.2).
3. BOM_turi→Ombor moslash + qalinlik tekshiruvi (6.3).
4. Normalizatsiya + aniq match + `BomMatchMemory` (6.9).
5. Material narxlash + chiqindi koeff; moslanmaganlar flag (6.6).
6. Kromka uslugasi `FROM_PROJECT_BAND` (6.5 — eng aniq oqim).
7. Ixcham→batafsil mobil UI (6.7); cost mijozdan yashirin.
8. Qo'lda moslash + AI "bilan top" (6.10) + fuzzy match.

**Faza-2 — "Aniqlikni oshir":**
- Embedding/vektor qidiruv ostona bilan.
- kg↔dona/m² konvertatsiya koeffitsientlari to'liq (6.4).
- Arra + prisadka uslugalari to'liq.
- Eskirgan narx ogohlantirish, valyuta (UZS/USD) tanlash, tezkor x2.

**Faza-3 — "Kengaytir":**
- Shablon kutubxonasi (tipik modul — chizmasiz tez smeta).
- Partiyali baholash (bir nechta `.b3d` → birlashgan smeta).
- "Sotuvga/zakazga o'tkazish" (smeta→mini-ERP buyurtma + KATTA ERP'ga yozish).
- Raskroy (list-nesting) bilan haqiqiy material narxi (koeff o'rniga).

## 7.5 — KPI

| KPI | Ta'rif | Maqsad (3 oy) |
|-----|--------|---------------|
| Avto match-rate | Avtomatik moslangan satr % | ≥ 80% (xotira to'lgach ≥ 90%) |
| Qo'lda moslash | Admin qo'lda moslagan satr/chizma | < 3 satr/chizma |
| Time-to-estimate | Yuklash → smeta ko'rinishi | < 30 soniya |
| AUTO-precision | AUTO zonadagi to'g'ri moslash | ≥ 0.98 (xato narx qimmat) |
| Parse muvaffaqiyati | Crash'siz parse (shifr/0-panel chiqarib) | ≥ 95% |
| Shifr false-positive | Noto'g'ri "shifrlangan" belgilangan fayl % (§11, 149-q.) | ≤ 2% |
| Smeta→zakaz konversiya | Smeta ko'rgan → zakaz % | bazadan +15% |
| AI taklif qabul % | AI tavsiyasi tasdiqlangan % | ≥ 60% |

## 7.6 — Biznes qoidalari (QAT'IY)

1. **Default PriceList:** har tenant uchun bitta `is_active` "Розничный" default; mijoz o'zgartira olmaydi, admin sozlamada belgilaydi.
2. **Cost vs sotuv ko'rish huquqi:**
   - **Mijoz:** faqat `price_uzs`/`price_usd`. `cost_price`/`cost_basis_usd`/`ServicePricing.cost_price`/marja **HECH QACHON** mijoz API javobida va frontda yo'q (serializer'da chiqarib tashlanadi, test bilan qoplanadi).
   - **Admin/narx menejer:** marja uchun cost + sotuv ikkalasini ko'radi.
3. **Chiqindi koeff:** material m²'ga sozlanadigan koeff (default **1.10–1.15**), BOM_turi/material bo'yicha override.
4. **Tezkor x2:** ixtiyoriy "shoshilinch" koeff (default x1, x2 gacha) — faqat admin yoqadi, smetada alohida satr.
5. **Valyuta:** UZS asosiy. USD bo'lsa `price_usd` + joriy kurs → UZS; smeta valyutasi yorliqlanadi.
6. **Eskirgan narx:** `PriceListItem.updated_at`/`PriceList.last_synced_at` N kundan (default 7) eski → "⚠ Narx N kun oldin yangilangan"; smeta bloklanmaydi, flag qo'yiladi.
7. **Taxminiy narx TAQIQ:** topilmasa → flag. **Hech qachon** taxmin/0/o'rtacha QO'YILMAYDI.
8. **Butun son:** quantity/list/dona `Math.ceil()` (CLAUDE.md). m²/m kasr qoladi; faqat dona-birlik butunlanadi.
9. **Kross-tur taqiq:** panel→panel, kromka→kromka, furnitura→furnitura omboridan.
10. **Reserv hisobga olinmaydi:** narx `quantity`'dan mustaqil; "omborda yo'q" badge `quantity_available`@101 (`quantity − defective − reserved`) bo'yicha, lekin narxlash bloklanmaydi.

## 7.7 — Edge-case'lar va failure mode'lar

| Holat | Ko'rsatish |
|-------|-----------|
| **Shifrlangan b3d** (`{encrypted:true}`, §11.1) | "Fayl shifrlangan — qo'lda baholash". Parse/narx yo'q. **Crash YO'Q.** |
| **Noto'g'ri "shifr" deb belgilangan** (§11, 149–150-q.) | False-positive xavf bor; "Qayta urinib ko'rish / qo'lda tekshirish" tugmasi (parserni majburiy ishga tushirish), telemetriyaga `false_encrypted` event. |
| **0-panel / boshqa format** (§11.2) | "Chizma o'qilmadi — qo'lda tekshirish ro'yxatiga qo'shildi." |
| **~3% materialsiz detal** (§11.4) | Detal BOM'da, "material aniqlanmagan" flag → moslanmaganlar bloki, narxlanmaydi. |
| **Moslanmagan satr** | Alohida blok, narxsiz, "AI bilan top" / qo'lda moslash. |
| **Narx o'zgargan** | Snapshot saqlanadi; "qayta hisoblash" yangi narxni oladi; eski/yangi farqi ko'rsatiladi. |
| **Qalinlik mos emas** (16 vs 18мм) | Moslash rad / past-ishonch flag. |
| **Anomaliya** ("Гнутая2", ulkan gabarit, dp>100mm, §11.2) | Bayroq, avtomatik narxlanmaydi. |
| **Katta BOM** (1000+ detal) | Parse `_background()` thread'da; UI skeleton + WS progress; jadval sahifalash/lazy; >60s da "qayta urinib ko'ring". |
| **Ombor qoldig'i 0/manfiy** | Narx qo'yiladi (narx ≠ qoldiq), lekin "omborda yo'q" badge (`quantity_available`). |
| **Bir nomli SKU bir nechta omborda** | Tur-ombor scope (6.3) bilan filtrlanadi; baribir ko'p bo'lsa ambiguity guard (7.13) → TAKLIF. |
| **Bir BOM'da nom 2 marta** (chap/o'ng dublikat) | `bazis_bom.js` dedup + ERP'da norm_name bo'yicha miqdor qo'shiladi, moslash bir marta (7.20). |

## 7.8 — Risklar + yumshatish

| Risk | Ta'sir | Yumshatish |
|------|--------|-----------|
| Noto'g'ri match → xato narx | Yuqori | Qalinlik+tur tekshiruvi, fuzzy ostona, past-ishonch flag, ambiguity guard |
| Eskirgan price_list | O'rta | `last_synced_at` ogohlantirish, qayta hisoblash, faqat faol PriceList |
| AI noto'g'ri taklif | O'rta | AI faqat **taklif**, inson tasdiqi shart, AI narx qo'ymaydi |
| Parser cheklovlari (3%/shifr) | O'rta | Shaffof flag, "qo'lda" ro'yxati, parse-rate KPI |
| Shifr false-positive (§11) | O'rta | "Qayta urinish" tugmasi, `false_encrypted` telemetriya, KPI ostona |
| Mijoz cost ko'rib qolishi | Yuqori | Backend serializer'dan cost butunlay chiqariladi; front'da yo'q; test |
| Katta fayl sekinligi | O'rta | Background thread, kesh, progress UI, delta recompute |
| `bom` app router/INSTALLED_APPS'ga ulanmasligi | Yuqori | Migratsiya tenant DB'ga tushmaydi → deploy checklist (7.0) |

## 7.9 — Non-goal'lar (modul nima QILMAYDI)

- **Narx o'ylab topmaydi** — faqat `PriceListItem`/`ServicePricing`/`WarehouseBalance.price`.
- **3D ko'rsatmaydi** — bu BOM/smeta moduli, viewer emas (alohida `widget_bazis`).
- **Parser mantig'ini o'zgartirmaydi** — `bazis_bom.js` qora quti.
- **Shifrlangan b3d'ni ochmaydi/deshifr qilmaydi** (§11.1 — algoritm noma'lum).
- **Avtomatik raskroy/nesting qilmaydi** (MVP'da koeff, Faza-3'da nesting).
- **Avtomatik zakaz yaratmaydi** (MVP) — faqat smeta.
- **Uslugalarni o'zi qo'shmaydi** — foydalanuvchi tanlaydi (kromka majburiyligi istisno).

## 7.10 — Telemetriya (`BomSnapshot` meta yoki event)

Har parse/smeta bo'yicha: `parse_status` (ok/encrypted/false_encrypted/no_panel/other_format), `parse_ms`, detal soni, m²; `auto_matched/manual_matched/unmatched` → **match-rate**; `memory_hits`; `ai_suggested/ai_accepted/ai_rejected`; `price_stale_flags`; `estimate_viewed → order_created` (voronka); eng ko'p moslanmaydigan nomlar → katalog bo'shliqlari (admin'ga "katalogga qo'sh" hint).

---

# B QISM — AI-MUHANDISLIK (matching va AI quvuri)

## 7.11 — Moslash quvuri (matching pipeline) arxitekturasi

5+1 bosqichli **kaskad** (avvalgi bosqich aniq topsa keyingisi ishlamaydi). 0–3 bosqich DETERMINISTIK (LLM'siz, lokal, mavjud `_bpj_search_*` namunasini kengaytiradi); AI faqat foydalanuvchi tugmasi bilan oxirgi fallback.

```
BOM qatori (xom nom + tur + thickness + dekor)
   │
   ▼
[0] BomMatchMemory lookup (normalized_name + bom_type + warehouse_scope)
   │   topildi & active → AUTO (confidence=1.0, manba='memory') ──────────┐
   ▼ topilmadi                                                            │
[1] Normalizatsiya (7.12) → norm_name, dp, decor, brand, size, unit       │
   ▼                                                                      │
[2] ANIQ moslik:  norm_name == norm(SKU/name) AND dp mos AND tur-ombor    │
   │   1 ta nomzod, score≥0.95 → AUTO ───────────────────────────────────┤
   ▼ yo'q / ko'p nomzod                                                   │
[3] FUZZY:  token-set + trigram + Levenshtein (dp/decor bonus, rapidfuzz) │
   │   score≥0.88 & yagona lider → AUTO                                   │
   │   0.70≤score<0.88 → TAKLIF (qo'lda tasdiq)                           │
   ▼ score<0.70 yoki bir nechta yaqin nomzod                             │
[4] EMBEDDING/vektor qidiruv (7.16, ixtiyoriy — katta katalog)           │
   │   cos≥0.86 & ajralgan lider → TAKLIF                                 │
   ▼ baribir noaniq                                                       │
[5] AI/MCP fallback (7.15): bom.ai_match_suggest                         │
   │   AI faqat NOMZOD + confidence + sabab → har doim TAKLIF            │
   ▼                                                                      │
MATCHED (narx bilan) ──── yoki ──── UNMATCHED (narx 0, bayroq) ◄──────────┘
        │ tasdiqlansa → BomMatchMemory.save() (7.14 active-learning)
```

**Bosqich qachon ishlaydi:**
- **[0] Memory** — har doim BIRINCHI. Eng arzon/aniq; o'rganilgan nom qayta hisoblanmaydi.
- **[1–2] Normalizatsiya + aniq** — har doim. Deterministik, kesh-mumkin. Mavjud `_match_by_name(name, thickness_mm)` (sale_crud@602) shu yerda baza sifatida ishlatiladi.
- **[3] Fuzzy** — aniq topilmasa. `rapidfuzz`, DB so'rovsiz (nomzodlar tur-ombor bo'yicha oldindan yuklangan, `_bpj_search_with_cache`@1236 keshi namunasi).
- **[4] Embedding** — fuzzy noaniq VA katalog >2000 SKU bo'lsa. Ixtiyoriy.
- **[5] AI/MCP** — **faqat foydalanuvchi "AI bilan top" tugmasini bossa** (6.10). Avtomatik chaqirilmaydi (qimmat + sekin + idempotentlik buziladi).

**Tur-scoping (6.3 majburiy):** nomzodlar avval `BomTypeWarehouseMap` (BOM_turi → Warehouse[+Category]) xaritasidan filtrlanadi. `byMaterial[]` → panel ombori (`product_type='panel'`), `edgeBands[]` → kromka, `fittings[]`/`fasteners[]` → furnitura. Boshqa turdagi SKU hech qachon nomzod emas.

## 7.12 — Normalizatsiya qoidalari (deterministik sof funksiya)

`normalize_bom_name(raw, bom_type) -> NormalizedName` — idempotent, kesh-mumkin. Tartib MUHIM:

1. **Quyi registr + Unicode NFKC** — `ё→е`, ko'rinmas belgilar tozalanadi.
2. **Kirill↔lotin translit (ikki kanonik kalit):** har nom uchun kirill-kanonik + lotin-kanonik shakl saqlanadi, moslashda ikkalasi taqqoslanadi. Jadval `bazis_bom.js` `MATKEYS` (22-qator) dan olinadi: `ldsp↔лдсп, lmdf↔лмдф, lhdf↔лхдф, mdf↔мдф, dsp↔дсп, hdf↔хдф, xdf↔xdf, steklo↔стекло, zerkalo↔зеркало, akril↔акрил/acryl, plastik↔пластик, fanera↔фанера, ldvp↔двп, egger↔эггер, kronospan↔кроношпан, lamarty↔ламарти`.
3. **Atribut ajratish (regex, nomdan AJRATIB OLINADI):**
   - `dp` (qalinlik): **`project_parser._extract_thickness` (project_parser.py:51) qayta ishlatiladi**; `(\d+(?:[.,]\d+)?)\s*(мм|mm)` → 16, 18, 0.4 (kromka). Material uchun `byMaterial[].thickness` allaqachon bor — undan ham olinadi.
   - `size`: `\d{3,}\s*[*xх×/]\s*\d{3,}` → `2750×1830`.
   - `decor`: brend so'zlaridan keyingi qoldiq (`Дуб Сонома`, `U999`, `H1334`).
   - `brand`: `Egger|Kronospan|Lamarty|Schattdecor|AGT|Союз|Ламарти|Эггер|Кроношпан` ... (`MATKEYS`'dan).
   - `unit`: BOM qator turidan (`m2|m|dona|komplekt`), nomdan emas.
4. **Shovqin tozalash:** ortiqcha bo'shliq, tinish (`.,-–/()`), `кв.м`, `пог.м`, `арт.`, `sku:` olib tashlanadi.
5. **Token-set:** qolgan so'zlar → tartiblangan, dublikatsiz to'plam. `norm_name = " ".join(sorted(tokens))`.

**Chiqish:** `{norm_name, norm_name_lat, dp, decor, brand, size, unit, raw}`. `dp`/`decor` — moslashda **qattiq filtr/bonus** (16мм Белый ≠ 18мм Дуб, hech qachon birlashtirilmaydi).

## 7.13 — Ishonch ballari (confidence) va ostonalar

Yagona shkala **0.0–1.0**, uch zona:

| Zona | Oraliq | Manba | Harakat | UI |
|------|--------|-------|---------|-----|
| **AUTO** | `≥ 0.88` (memory=1.0) | memory/aniq/fuzzy-lider | avto bog'lanadi, narx qo'yiladi | yashil "moslandi" |
| **TAKLIF** | `0.70–0.879` | fuzzy/embedding/AI | NOMZOD ko'rsatiladi, tasdiqlanadi | sariq "tasdiqlang" + top-3 |
| **QO'LDA** | `< 0.70` | — | moslanmagan, narx 0, bayroq | qizil "qo'lda biriktiring" |

**Guardrail'lar:**
- **Past ishonchda HECH QACHON jim moslashtirma.** `<0.70` → unmatched, narx 0.
- **AUTO faqat yagona lider bo'lsa.** `top1 − top2 < 0.05` → AUTO bekor, TAKLIF (ambiguity guard).
- **dp mos kelmasa AUTO YO'Q** → `min(score, 0.79)` bilan cheklash.
- **Materialsiz (~3%) / shifrlangan / boshqa-format** → to'g'ridan QO'LDA zona, narxlanmaydi.
- Ostonalar `BomMatchConfig` da; default yuqorida; tenant o'zgartira oladi.

Fuzzy skor: `score = 0.55·token_set + 0.25·trigram + 0.20·levenshtein_ratio`, keyin `dp_bonus(+0.05 mos / −0.30 mos emas)`, `decor_bonus(+0.05)`, `[0,1]` clamp.

## 7.14 — Moslik xotirasi (`BomMatchMemory`) + active-learning

```python
class BomMatchMemory(models.Model):
    normalized_name   = models.CharField(max_length=500, db_index=True)   # 7.12 norm_name
    bom_type          = models.CharField(max_length=20)   # material|edge_band|fitting|fastener
    warehouse         = models.ForeignKey('warehouse.Warehouse', null=True, on_delete=SET_NULL)
    category          = models.ForeignKey('warehouse.WarehouseCategory', null=True, on_delete=SET_NULL)
    warehouse_balance = models.ForeignKey('warehouse.WarehouseBalance', null=True, on_delete=SET_NULL)
    product           = models.ForeignKey('products.Product', null=True, on_delete=SET_NULL)
    price_list_item   = models.ForeignKey('price_list.PriceListItem', null=True, on_delete=SET_NULL)
    service           = models.ForeignKey('widget_service.Service', null=True, on_delete=SET_NULL)  # 6.5
    coeff             = models.DecimalField(max_digits=12, decimal_places=6, null=True)  # 6.4 kg konvert
    coeff_kind        = models.CharField(max_length=20, blank=True)   # density|unit_weight|none
    confidence_seed   = models.FloatField(default=1.0)
    hit_count         = models.PositiveIntegerField(default=0)
    reject_count      = models.PositiveIntegerField(default=0)
    last_decision     = models.CharField(max_length=12)   # confirmed|rejected|edited
    source            = models.CharField(max_length=12)   # user|ai|rule
    created_by        = models.ForeignKey('dashboard.CustomUser', null=True, on_delete=SET_NULL)
    created_at / updated_at
    class Meta:
        unique_together = ('normalized_name', 'bom_type', 'warehouse')   # bir nom turli omborda turlicha
        indexes = [Index(fields=['normalized_name', 'bom_type'])]
```

**MUHIM:** `unique_together`'da `warehouse` bor — bir xil nom turli omborda turli mahsulotga bog'lanishi mumkin. Lookup avval (norm_name, bom_type, joriy ombor scope), topilmasa (norm_name, bom_type, warehouse=NULL) global fallback.

**Active-learning feedback loop:**
- **Tasdiq:** `hit_count++`, `last_decision='confirmed'`; yozuv yo'q bo'lsa yangi yoziladi. Keyingi safar → AUTO.
- **Rad** (boshqa mahsulot tanlansa): eski yozuv `reject_count++`; `reject_count ≥ 2` → bog'lanish **deaktiv** (qayta AUTO yo'q); yangi tanlov `source='user'`, `confidence_seed=1.0`.
- **Tahrir** (coeff/price_list o'zgarsa): `last_decision='edited'`, recompute trigger (7.18).
- **AI manbali yozuv (`source='ai'`) HECH QACHON to'g'ridan AUTO emas** — foydalanuvchi tasdiqlamaguncha TAKLIF zonasida; tasdiqdan keyin `source='user'`.

## 7.15 — AI/MCP tool kontrakti (`bom/mcp.py`)

`core.mcp_registry.mcp_tool` konvensiyasiga AYNAN mos (`user`, `db_alias` avtomatik in'ektsiya @71/135, qolgani typed kwargs, `dict` qaytaradi):

```python
# bom/mcp.py
from core.mcp_registry import mcp_tool

@mcp_tool("bom.ai_match_suggest",
          "Moslanmagan BOM qatoriga katalogdan NOMZOD taklif qiladi. "
          "AI faqat nomzod + ishonch + sabab qaytaradi. NARX QO'YMAYDI.")
def ai_match_suggest(user, db_alias='default',
                     bom_name: str = '', bom_type: str = '',
                     dp: float = 0, decor: str = '',
                     candidates: list = None):
    """
    KIRISH:
      bom_name   — BOM xom nom ("ЛДСП 16мм Дуб Сонома")
      bom_type   — material|edge_band|fitting|fastener
      dp, decor  — normalizatsiyadan (qattiq filtr)
      candidates — server tur-ombor bo'yicha OLDINDAN filtrlagan ro'yxat:
                   [{"id","sku","name","dp","warehouse_id"}]  ← faqat shular ichidan
    CHIQISH (qat'iy kontrakt):
      {
        "suggestions": [
          {"candidate_id": <int>, "confidence": 0.0-1.0, "reason": "<o'zbekcha qisqa>"}
        ],                  # ≤3, confidence kamayish tartibida
        "no_match": <bool>,
        "needs_human": <bool>
      }
    """
```

**AI guardrail (kontraktda majburlanadi):**
1. **AI faqat berilgan `candidates` ichidan tanlaydi** (closed-set) — yangi SKU uydirmaydi. Server `candidate_id` ni validatsiya qiladi; ro'yxatda bo'lmasa rad.
2. **AI NARX QO'YMAYDI/hisoblamaydi/koeff bermaydi.** Narx faqat `PriceListItem` dan. AI chiqishida narx maydoni YO'Q (server javobni validatsiya qilib, kutilmagan kalitlarni tashlaydi).
3. AI natijasi **har doim TAKLIF zonasi** (7.13).
4. Server `confidence` ni `min(ai_conf, 0.85)` bilan **cheklaydi** (o'ta-ishonchni bostirish).
5. System-prompt: "Sen entity-matcher'san. Faqat ro'yxatdan tanlaysan. Narx, miqdor, o'lcham TAXMIN QILMA. Ishonchsiz bo'lsang `needs_human: true`." (Provayder-agnostik kontrakt.)
6. **`db_alias` tenant DB bo'lishi shart** — AI tool ichida ham faqat tenant scope'idan o'qiladi (cross-tenant sizish yo'q).

Tasdiqdan so'ng → `BomMatchMemory` (`source='ai'` → tasdiqdan keyin `user`).

## 7.16 — Embedding katalog qidiruvi (ixtiyoriy, Faza-2)

**Qachon:** katalog >2000 faol SKU VA fuzzy ([3]) ko'p noaniq taklif chiqarsa. Kichik katalogda KERAK EMAS.

- Har `PriceListItem`/`WarehouseBalance` uchun `norm_name + decor + brand` matnidan embedding → `BomCatalogVector(item_ref, vec, model_ver, updated_at)` (yoki `pgvector` — loyiha PostgreSQL'da).
- Qidiruv: BOM norm_name embedding → kosinus, top-K, faqat tur-ombor scope ichida.
- **Idempotent indeks:** SKU/price_list sync o'zgarsa vektor qayta hisoblanadi (`model_ver`+`updated_at` stale aniqlash), partiyali re-index.
- Embedding **faqat nomzod topishga** — yakuniy qaror baribir 7.13 ostonalari + dp/decor qattiq filtri.

## 7.17 — kg→dona/m² konvertatsiya (6.4 batafsil)

Deterministik, per-product, sanity-check bilan.

**Zichlik jadvali (kg/m³, sozlanadigan `BomDensity`):**

| Material | Zichlik | Izoh |
|----------|---------|------|
| LDSP/ЛДСП | 650–700 | default 680 |
| MDF/МДФ | 750 | |
| HDF/ХДФ | 850 | |
| ДВП/Фанера | 600/700 | |

**Formulalar:**
- **m² → kg:** `kg = area_m2 × (dp_mm / 1000) × density`.
- **dona → kg:** `kg = count × unit_weight_kg` (furnitura uchun per-product `unit_weight`).
- **Per-product koeff** `BomMatchMemory.coeff` + `coeff_kind` da — bir marta sozlansa avtomatik.

**Sanity-check (anomaliya bayrog'i, narxlamaydi → QO'LDA):**
- `density ∉ [400, 1200]` → bayroq, avto-konvert YO'Q.
- `dp` yo'q yoki `>100mm` → bayroq (manba anomaliyasi; parser dp ni 1–100 oralig'ida cheklaydi @158/161).
- 1 detal > 200kg → bayroq.
- `unit_weight ≤ 0` → konvert YO'Q.

Bayroqli qatorlar "moslanmagan/tekshirish" bloki (6.6)'ga, jami tannarxga **kirmaydi**.

## 7.18 — Idempotentlik va qayta hisoblash (recompute) triggerlari

**Mutlaq guardrail'lar:**
1. **Narx hech qachon uydirilmaydi.** Faqat `PriceListItem.price_uzs/price_usd/cost_price` yoki `WarehouseBalance.price` yoki `ServicePricing`. Topilmasa → narx 0 + bayroq.
2. **Past ishonch → bayroq**, hisobga kirmaydi.
3. **Deterministik joyni LLM'ga berma:** narx, m²/m/dona hisobi, kg konvert, summa — sof Python. LLM faqat nomzod tanlash.
4. **Idempotentlik:** bir xil BOM + katalog holati + memory → bir xil natija. AI chaqiruvi keshlanadi (kirish-hash → natija). Saqlash `unique(order_file + bom_row_hash)` upsert.

**Recompute triggerlari** (delta — faqat o'zgargan qatorlar, butun BOM emas):
- Narx: `PriceListItem`/`WarehouseBalance.price`/`ServicePricing` sync yoki tahrir (`post_save`).
- Chizma: yangi `.b3d` (`widget_files.OrderFile` `post_save`, ext `.b3d` — `project_file_code_check`@178 namunasiga ulanadi, lekin `.b3d` filtri bilan; `_CACHE_EXTS`@17 ga `.b3d` qo'shilmaydi — alohida signal/branch).
- Koeff/dekor: `BomMatchMemory` tahrir.
- Sozlama: chiqindi koeff, fuzzy ostona, valyuta (`BomMatchConfig`).
- Moslash: foydalanuvchi qatorni qayta bog'lasa/rad etsa.

**Thread/DB ehtiyotkorligi (mavjud `_background()` namunasi):** background thread ichida tenant DB alias (`tenant_mebelcity`) aniq uzatiladi — `connection` thread-local, shuning uchun `.using(db_alias)` har so'rovda ko'rsatiladi (mavjud signal namunasidagidek).

## 7.19 — Eval harness (golden set, regressiya)

**Golden set:** real BOM nomlari → to'g'ri SKU juftliklari (qo'lda tasdiqlangan, ≥200 juft, har tur va qiyin holatlar: kirill/lotin, dp-ambiguity, dekor, materialsiz). `bom/tests/golden.jsonl`.

**Metrikalar:** AUTO-zona **Precision ≥ 0.98** (noto'g'ri avto-match = qimmat xato), Recall (AUTO+TAKLIF), Auto-rate, ambiguity/unmatched-rate.

**Regressiya (CI, har deploy):**
- `pytest bom/tests/` — **precision pasaysa deploy bloklanadi** (regression guard).
- Normalizatsiya birlik testlari (translit, dp ajratish — deterministik).
- Konvert sanity testlari (anomaliya bayroqlanishi).
- AI tool kontrakt testi (mock candidates: closed-set tashqaridagi `candidate_id` rad etilishi, narx maydoni yo'qligi, `confidence` clamp).
- **Cost-leak testi:** mijoz API javobida `cost_price`/`cost_basis_usd`/marja YO'Qligini tasdiqlovchi assert (7.6.2 majburiyati).
- **Parser kalit testi:** `bazis_bom.js` chiqishida `byMaterial`/`edgeBands`/`fittings`/`fasteners` kalitlari kutilgan; kod `materials` kalitiga tayanmasligini tasdiqlash (regress qoidasi).

0–4 bosqich deterministik (LLM'siz eval); AI bosqichi alohida suite.

## 7.20 — Ma'lumot sifati va perf

**Ma'lumot sifati (§11):** ~3% materialsiz → QO'LDA; shifrlangan/boshqa-format → `bazis_bom.js` `{encrypted:true}` → butun BOM "tekshirish kerak", qisman ham narxlanmaydi; **shifr false-positive (§11, 149–150-q.)** → "qayta urinish" tugmasi; anomaliyalar → 7.17 sanity; dublikatlar (Направляющие chap/o'ng) `bazis_bom.js`'da dedup + ERP'da bir norm_name 2 marta chiqsa miqdor qo'shiladi, moslash bir marta.

**Perf:** normalizatsiya + nomzod ro'yxati (tur-ombor) request davomida keshlanadi (`_bpj_search_with_cache`@1236 namunasi); AI natijasi kirish-hash keshi; nomzodlar bir marta `select_related('product')` bilan yuklanadi (N+1 yo'q), `rapidfuzz` xotirada; katta BOM moslash `_background()` thread'da + WS toast; delta recompute.

---

# C QISM — UX/UI DIZAYNI (mobile-first, `client_erp` uslubida)

## 7.21 — Dizayn tili (mavjud `base.css` tokenlariga ULANADI — yangi rang KIRITMA)

| Token | Qiymat | BOM da |
|-------|--------|--------|
| `--accent` | `#10b981` emerald | **Moslangan** qator, jami narx urg'usi, primary tugma |
| `--accent2` | `#6366f1` indigo | AI tugma, AI taklif badge |
| `--warning` | `#f59e0b` amber | **Qisman moslangan**, bayroq, "tekshiring" |
| `--danger` | `#ef4444` red | **Moslanmagan**, shifrlangan/xato |
| `--surface`/`--surface2` | oq/`#f5f6f8` | kartochka / ichki blok |
| `--text2` | `#7c8293` | birlik, izoh, manba microcopy |
| `--radius` 14px / `--radius-sm` 10px | — | kartochka / element |

- Tipografiya: **Inter**; narx `font-weight:900; letter-spacing:-.5px` (`.ce-stat-value`).
- Prefiks: yangi `.bom-*` (mavjud `.ce-*`, `.od-*` bilan to'qnashmaydi).
- Mavjud `Toast.success/error/warning/info`, `Skeleton.block(...)`, `Modal` qayta ishlatiladi. Dark mode AVTOMATIK.
- Touch-target ≥44px; qatorlar orasi ≥8px.

## 7.22 — Foydalanuvchi sayohati (mobile-first)

BOM kartochka **fayl OSTIDA** ochiladi (alohida sahifa EMAS — `order-detail.js` `_filesGrid` bilan bir oqimda).

```
1. Mijoz "📎 Fayllar → Yuklash" → .b3d tanlaydi
2. widget_files upload (project_file_code_check namunasi) → fayl kartochkasi + ostida BOM placeholder
3. .b3d aniqlanadi → "Tahlil qilinmoqda…" (skeleton); parser brauzerda (bazis_bom.js, pako) yoki serverda; katta fayl → WS progress
4. parse + matching + pricing tugaydi
5a. TO'LIQ MOSLANGAN → yashil yig'ilgan kartochka: jami narx + "✓ Hammasi moslandi"
5b. QISMAN → amber: jami (qisman) + "⚠ N ta moslanmagan"
5c. MOSLANMAGAN/bayroqli → red/amber: "narx hisoblanmadi — qo'lda tekshiring"
6. Kartochka bosiladi → ochiladi (xulosa, moslanmagan, kategoriyalar, uslugalar, bayroqlar)
7. Moslanmagan qator → "Qo'lda moslash" yoki "AI bilan top" → narx avtomatik tushadi → "Xotiraga saqla" yoniq bo'lsa BomMatchMemory (6.9)
8. "Qayta hisoblash" → BomEstimate yangilanadi, bazaga saqlanadi (6.8)
```

**Muhim:** 5-qadamda mijoz narxni KO'RADI, lekin moslanmagan bo'lsa raqam o'rniga ochiq bayroq — **yolg'on raqam YO'Q**.

## 7.23 — Komponentlarga ajratish (`static/client_erp/js/components/bom/`)

```
bom/
  bom-card.js         → fayl ostidagi yig'ilgan/ochilgan kartochka (asosiy konteyner)
  bom-summary.js      → yig'ilgan: jami narx + match-meter + holat badge
  bom-categories.js   → Material/Kromka/Furnitura/Mahkamlagich akkordeoni
  bom-row.js          → bitta qator (nom, qty, birlik, narx, holat-rang)
  bom-unmatched.js    → moslanmagan bo'lim (qizil, qo'lda moslash trigger)
  bom-services.js     → uslugalar: arra/kromka/prisadka (widget_service)
  bom-match-sheet.js  → pastdan chiqadigan qo'lda moslash sheet
  bom-ai-suggest.js   → "AI bilan top": loading, taklif, confidence, qabul/rad
  bom-unit-toggle.js  → kg⇄dona/m² ikki birlik + koeff tahrirlash
  bom-flags.js        → shifrlangan/anomaliya/materialsiz bayroqlar
  bom-state.js        → holat mashinasi (bitta manba)
```

**Axborot iyerarxiyasi (mijoz uchun):** (1) **JAMI NARX** (eng katta, urg'uli) → (2) **Match holati** → (3) kategoriya jamlari → (4) moslanmagan qatorlar (harakat) → (5) qator tafsilotlari (faqat ochilganda).

## 7.24 — Holatlar (`bom-state.js`)

| Holat | Vizual | Ikona | Microcopy |
|-------|--------|-------|-----------|
| `uploading` | progress, kulrang | ⬆️ | "Chizma yuklanmoqda… {percent}%" |
| `parsing` | skeleton + shimmer | 🔄 | "Bazis chizmasi tahlil qilinmoqda…" (katta: "{N} ta detal o'qildi…") |
| `matched_full` | yashil chiziq + ✓ | ✓ | "Hammasi moslandi — narx tayyor" |
| `matched_partial` | amber chiziq | ⚠ | "{matched}/{total} moslandi · {unmatched} qoldi" |
| `unmatched` | qizil chiziq | ✗ | "Narx hisoblanmadi — mahsulotlarni moslang" |
| `flagged_encrypted` | sariq band | 🔒 | "Chizma shifrlangan — avtomatik o'qib bo'lmadi. Qo'lda tekshiring." + [Qayta urinish] |
| `flagged_anomaly` | sariq band | 🚩 | "Bir nechta detalda g'ayritabiiy o'lcham/materialsiz — tekshiring" |
| `error` | qizil band | ⛔ | "Chizma o'qilmadi (format mos emas). Qayta yuklang yoki qo'lda kiriting." |
| `recalculating` | yashil pulse (`ble-pulse`) | ⟳ | "Qayta hisoblanmoqda…" |
| `empty` | bo'sh holat | 📐 | "Bu buyurtmaga hali Bazis chizmasi yuklanmagan" |

Microcopy qoidasi: **"narx" so'zini taxminiy raqam bilan yozma**; moslanmaganda "—" yoki bayroq. **Cost so'zi mijoz ekranida YO'Q.** State o'tishlari toast bilan: `parsing→matched_full` → `Toast.success("Chizmadan narx tayyor")`; `→flagged_encrypted` → `Toast.warning("Chizma shifrlangan")`; `→error` → `Toast.error(...)`.

## 7.25 — Kartochka: yig'ilgan → ochilgan

**Yig'ilgan (collapsed):** ~88px; chap chetda **4px rang-chiziq** (holat rangi); tepada 📐 + fayl nomi + format badge ("Bazis 24"/"Bazis B3D"); o'rtada **JAMI NARX** (900 vazn, `--accent`) + "so'm"; pastda **match-meter** (yupqa progress) + "{matched}/{total} moslandi"; o'ngda chevron `›` + holat ikona. Moslanmagan bo'lsa narx o'rnida amber "⚠ {N} ta moslanmagan · narx to'liq emas".

**Ochilgan (expanded)** tartibi:
1. **Smeta xulosasi** (sticky tepada): UMUMIY jami + "Material/Kromka/Furnitura/Uslugalar" chip-jamlari.
2. **Moslanmagan bo'lim** (bor bo'lsa — ENG TEPADA): qizil fon, har qator + "Qo'lda moslash"/"AI bilan top".
3. **Kategoriya akkordeonlari:** Material → Kromka → Furnitura → Mahkamlagich → Uslugalar (har biri sub-jami bilan).
4. **Bayroqlar** (bor bo'lsa): sariq panel.
5. Pastda: **"Qayta hisoblash"** (secondary) + **"Smetani saqlash"** (primary, yashil).

**Rang kodlash (qat'iy):** moslangan = yashil nuqta (●) + narx + "KATTA ERP" badge; moslanmagan = qizil nuqta + "Moslanmagan" + "Mosla"; bayroqli = sariq nuqta + 🚩 "tekshiring"; AI-taklif kutilayotgan = indigo (`--accent2`) "AI taklif qildi — tasdiqlang".

## 7.26 — Qator anatomiyasi (`bom-row.js`)

```
● Nomi (asil, BOM dagi)          [manba badge]
  qty × birlik · (ikki birlik agar kg)         narx →  summa
```
- **Nom:** BOM dan asil nom (kirill/lotin), o'zgartmasdan; moslangan bo'lsa ostida `--text2` da ERP product nomi.
- **qty + birlik:** m²/m/dona/komplekt/kg; **dona-birlik butun son** (`Math.ceil`), m²/m kasr.
- **narx:** faqat `price_uzs` (cost YO'Q). **summa:** qty × unit_price, o'ngda urg'uli.
- Bosilsa kengayadi → "narx manbasi: {PriceList nomi} · oxirgi yangilangan {last_synced_at}" + (moslangan bo'lsa) "Qayta moslash".

## 7.27 — Qo'lda moslash (`bom-match-sheet.js`)

Pastdan chiquvchi bottom-sheet (mavjud `Modal` asosida):

```
┌─ "Moslash: «{BOM nomi}»"
│  TUR avto-aniqlangan: [Panel ▾]  (6.3 — panel→panel ombori)
│  🔍 Qidirish (debounce) — FAQAT o'sha TUR omboridan
│     (WarehouseBalance.product_type + category filtri)
│  Natija: product nomi · ombor · qoldiq (quantity_available) · narx (price_uzs)
│  [Preview: narx + koeff (kg↔dona kerak bo'lsa)]
│  🔁 "Xotiraga saqla" TOGGLE (default YONIQ) — BomMatchMemory (6.9)
│  [ Bekor ]            [ Moslash ✓ ]
```
- Eng yuqorida **"Tavsiya"** (BomMatchMemory + fuzzy top-3) — bir bosishda.
- TUR filtri majburiy (kross-tur chalkashlik yo'q). Tanlangach qator real-vaqtda yashilga (optimistik), `Toast("Moslandi")`. "Xotiraga saqla" yoniq → "Endi bu nom avtomatik moslanadi".

## 7.28 — "AI bilan top" (`bom-ai-suggest.js`)

Moslanmagan qator yonida indigo tugma **✨ AI bilan top**:

```
Bosildi → "AI o'ylayapti…" (shimmer ~2–5s; core.mcp_registry → handle_mcp_request)
Taklif kartochkasi (indigo chetli):
   ✨ AI taklifi
   → «{product nomi}» · {ombor} · narx {price_uzs}
   Ishonch ●●●○○ 72%
   Sabab: "BOM «ЛДСП Дуб 16мм» → katalog «ЛДСП Egger Дуб H1145 16мм», qalinlik va dekor mos."
   ⓘ Narx ERP dan — AI faqat mosligini topdi
   [ Rad et ✗ ]                    [ Qabul qilaman ✓ ]
```
- AI faqat **moslash** taklif qiladi (product+ombor+tur+koeff). **Narx QO'YMAYDI** — `PriceListItem` dan (6.10).
- **Confidence:** 5 nuqtali bar + foiz (server `min(ai,0.85)` cheklovi qo'llangan); <60% → amber "Ishonch past — o'zingiz tekshiring."
- **Qabul** → 6.9 xotiraga, qator yashil. **Rad** → AI 2-variant yoki qo'lda moslash.
- Bir nechta bo'lsa "Hammasini AI bilan top" (batch) — har biri **alohida** tasdiqlanadi (avto-qabul YO'Q).

## 7.29 — kg⇄dona/m² ko'rsatish (`bom-unit-toggle.js`)

- Mahsulot kg da sotilsa, BOM dona/m² bersa — qatorda **ikki birlik:** `12 m² ≈ 102 kg` (asosiy katta, kg `--text2` kichik).
- Koeff (zichlik/birlik_vazni) qator tafsilotida tahrirlanadi: input + "koeff: 0.65 g/sm³" → kg va summa real-time. Koeff manbasi badge: "ombor mahsulotidan" / "qo'lda kiritilgan". Mijoz uchun cost emas, faqat miqdor konvertatsiyasi.

## 7.30 — Ishonch belgilari (trust) va a11y/perf

**Trust:** moslangan narx yonida **"KATTA ERP narxi"** badge; qator tafsilotida narx manbasi = "{PriceList.name} (Розничный)" + oxirgi yangilangan = `last_synced_at`; smeta tepasida bir marta "Narxlar MebelCity katta ERP price_list dan. Taxminiy narx ishlatilmaydi." **Cost YASHIRIN:** `cost_price`/`cost_basis_usd`/marja mijoz ekraniga hech qachon render qilinmaydi (front+back); moslanmagan narx — taxmin emas, ochiq "—".

**A11y/perf:** rang YAGONA signal emas — har rangda ikona (✓/⚠/✗/🚩) + matn; `aria-expanded` akkordeonda, `aria-live="polite"` smeta jami uchun, kontrast WCAG AA. Parse brauzerda (serverga yumaloq yo'l shart emas), faqat matching/pricing API; optimistik UI. Katta BOM: akkordeonlar default YOPIQ, qatorlar lazy/virtualizatsiya, summalar serverda oldindan (BomEstimate cache, 6.8). Animatsiya `max-height`+opacity ~200ms + `ble-pulse`; reduced-motion hurmat qilinadi.

## 7.31 — ASCII MOCKUP

### (a) Yig'ilgan BOM kartochka — fayl ostida (mobil, ~360px)

```
┌──────────────────────────────────────────────┐
│ 📎 Fayllar                        [+ Yuklash] │
│ ┌──────────────┐  ┌──────────────┐            │
│ │  [.b3d]  📐  │  │  IMG_204.jpg │            │
│ │ Oshxona.b3d  │  │              │            │
│ └──────────────┘  └──────────────┘            │
│                                                │
│ ┌╴╴ BOM kartochka (fayl ostida) ╴╴╴╴╴╴╴╴╴╴╴╴┐ │
│ ┃▌ 📐 Oshxona.b3d        [Bazis 24]  ✓     › ┃ │  ← chap yashil 4px chiziq
│ ┃▌                                          ┃ │
│ ┃▌   12 480 000 so'm                        ┃ │  ← JAMI (900 vazn, emerald)
│ ┃▌   ━━━━━━━━━━━━━━━━━━━━━━━  47/47 moslandi ┃ │  ← match-meter (to'la yashil)
│ ┃▌   ✓ Hammasi moslandi · narx tayyor       ┃ │
│ └╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┘ │
└──────────────────────────────────────────────┘

   ── Qisman moslangan variant (amber) ──
 ┌╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐
 ┃▌ 📐 Spalnya.b3d      [Bazis B3D]  ⚠     › ┃   ← chap amber chiziq
 ┃▌   ~9 200 000 so'm  (to'liq emas)         ┃
 ┃▌   ━━━━━━━━━━━━━━━░░░░░░  41/47 moslandi  ┃   ← qisman yashil
 ┃▌   ⚠ 6 ta moslanmagan · narxni to'ldiring ┃
 └╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┘
```

### (b) Ochilgan BOM + moslanmagan qator + AI taklif (mobil)

```
┌──────────────────────────────────────────────┐
│ ‹ 📐 Spalnya.b3d                          ✕   │
│ ┌────────────────────────────────────────────┐│  ← sticky smeta xulosa
│ │  JAMI:  9 200 000 so'm   ⚠ to'liq emas     ││
│ │  Mat 6.1M · Kromka 0.4M · Furn 1.9M · Usl 0.8M││  (chip-jamlar)
│ │  ℹ Narxlar KATTA ERP price_list dan         ││
│ └────────────────────────────────────────────┘│
│                                                │
│ ╔═══ ❗ Moslanmagan (6) ════════════ qizil ══╗ │  ← eng tepada (harakat)
│ ║ ● ЛДСП Дуб Сонома 16мм                     ║ │
│ ║   8 dona · 4.2 m²            narx: —        ║ │
│ ║   ┌──────────────┐  ┌────────────────────┐ ║ │
│ ║   │  🔍 Qo'lda    │  │ ✨ AI bilan top    │ ║ │  ← qo'lda(border) / AI(indigo)
│ ║   └──────────────┘  └────────────────────┘ ║ │
│ ║ ──────────────────────────────────────────║ │
│ ║ ● Петля Boyard накладная                   ║ │
│ ║   24 dona                    narx: —        ║ │
│ ║   ┌──────────────┐  ┌────────────────────┐ ║ │
│ ║   │  🔍 Qo'lda    │  │ ✨ AI bilan top    │ ║ │
│ ║   └──────────────┘  └────────────────────┘ ║ │
│ ╚════════════════════════════════════════════╝ │
│                                                │
│ ┌─ ✨ AI taklifi (1-qatorga) ───── indigo ───┐ │  ← AI bosilgandan keyin
│ │ → ЛДСП Egger Дуб Сонома H1334 ST9 16мм      │ │
│ │   Ombor: Panel-1 · qoldiq 12 · 285 000 so'm │ │  (price_list dan)
│ │   Ishonch ●●●●○ 78%                          │ │
│ │   Sabab: dekor «Дуб Сонома» + 16мм mos.      │ │
│ │   ⓘ Narx ERP dan — AI faqat mosligini topdi │ │  ← trust microcopy
│ │   [ Rad et ✗ ]            [ Qabul qilaman ✓ ]│ │
│ └─────────────────────────────────────────────┘ │
│                                                │
│ ▾ Material  (12 tur · 38.4 m²)        6.1M ▸   │  ← akkordeon, sub-jami
│   ● ЛДСП Egger Белый 18мм   [KATTA ERP]        │  ← moslangan (yashil nuqta)
│     14 dona · 18.2 m²        185 000 → 3.36M   │
│     ↳ 218 kg (koeff 0.65 ✎)                    │  ← kg ikkinchi birlik
│   ● ЛДСП Egger Дуб 16мм      [KATTA ERP]        │
│     9 dona · 11.0 m²         165 000 → 1.81M   │
│ ▸ Kromka     (3 tur · 86 m)            0.4M ▸  │
│ ▸ Furnitura  (8 tur)                   1.9M ▸  │
│ ▸ Mahkamlagich (5 tur)                 0.1M ▸  │
│ ▾ Uslugalar  (arra/kromka/prisadka)    0.8M ▸  │  ← widget_service
│   ● Распил (arra)   38.4 m²   → 0.46M           │
│   ● ПВХ кромка      86 м      → 0.34M           │  ← FROM_PROJECT_BAND
│                                                │
│ ┌─ 🚩 Bayroqlar (1) ───────────── sariq ─────┐ │
│ │ 🚩 2 ta detalda material yo'q — tekshiring  │ │
│ └─────────────────────────────────────────────┘ │
│                                                │
│ ┌──────────────┐  ┌───────────────────────────┐│
│ │ ⟳ Qayta hisob │  │   💾 Smetani saqlash      ││  ← secondary / primary(yashil)
│ └──────────────┘  └───────────────────────────┘│
└──────────────────────────────────────────────┘
```

---

## Yakuniy eslatma (Claude Code uchun — qurish ko'rsatmasi)

Bu bo'lim **spetsifikatsiya** — kod yozishdan oldin foydalanuvchidan TZ tasdig'ini oling (loyiha qoidasi: ruxsatsiz kod yozmaslik; o'zgarishdan oldin chuqur integratsiya tahlili SHART). Qurish boshlanganda:

1. Yangi `bom/` app (tenant DB): modellar + `matching.py` + `mcp.py` + `tests/`. **`INSTALLED_APPS` + tenant router (`tenant_manager`) ga qo'shing.** Migratsiya `--database=tenant_mebelcity`.
2. `bazis_bom.js` ni **o'rab** ishlating (qora quti — parser mantig'iga tegmang). Chiqish kalitlari AYNAN: `byMaterial` (`materials` EMAS), `edgeBands` (`ovalEdges`/`ovalLength_m`, `oval` EMAS), `fittings`, `fasteners`, `parts`, `summary`, `encrypted`.
3. Matching mavjud `sale_crud._match_by_name`/`_bpj_search_product`/`_bpj_search_with_cache` (nom+qalinlik) + `project_parser._extract_thickness` (project_parser.py:51) ni qayta ishlatadi — UUID-only `sale_parse_project` emas.
4. Trigger `widget_files/signals.py` `project_file_code_check`@178 + `_background()` thread namunasiga ulanadi, lekin `.b3d` uchun alohida branch/signal (`_CACHE_EXTS` `.project`-only; `.b3d` ni unga QO'SHMANG). Background thread'da tenant DB alias aniq uzatiladi (`.using(...)`).
5. UI komponentlari `static/client_erp/js/components/bom/` da; `order-detail.js` `_filesGrid`/`_bindFiles` ga ulanadi; mavjud `Toast`/`Skeleton`/`Modal` qayta ishlatiladi; `base.css` tokenlaridan foydalaning (yangi rang KIRITMA).
6. **Cost maydonlari (`cost_price`/`cost_basis_usd`/`ServicePricing.cost_price`/marja) mijoz API javobiga umuman kiritilmaydi** (serializer + cost-leak test, 7.19).
7. Static JS/CSS o'zgarsa `collectstatic` + `spa.html` dagi `?v=N` oshirish SHART. Python/model → `bittada-manager` restart; MCP WS → `bittada-manager-ws` ham.

**Takror: Aniqlik > to'liqlik. Taxminiy narx QO'YMA — bayroqla. Cost mijozga ko'rinmaydi. AI narx qo'ymaydi — faqat moslash taklif qiladi.**