# TZ v2 — bigone_cl2: eski oylar arxivi + Balans 2026-08-01dan "kesim"

**✅ BAJARILDI (2026-08-12).** Migratsiya 0048, `archive_finance_months`,
kesim (`balance_cutover_date=2026-08-01`, `amount=28715000`) yozildi va
tekshirildi (§6 pastda natijalar). `bittada-manager` reload qilindi —
**`bittada-manager-ws` FOYDALANUVCHI tomonidan restart qilinishi kerak**
(mini ERP butun ma'lumoti WS orqali keladi, [[feedback_no-ws-restart-only-manager-reload]]).
v1: 2026-08-12 (dastlabki savollar). v2: 2026-08-12 (Balans-kesim aniqlashtirildi,
barcha ochiq savollar javob oldi).

## 0. Nega kerak

Iyun/iyul (va undan oldingi) oylarning moliyaviy hisob-kitobi bir necha marta
qayta ishlangan (Sof-foyda F5/F6 sana-bazasi tuzatishi, shartnoma-asosli foyda
formulasi, "arvoh pul" H8 tuzatishi va h.k.). Har safar formula tuzatilganda
eski oylarning ko'rsatilgan raqamlari ORQAGA QARAB o'zgarib ketgan — bu
ishonchsizlik tug'diradi. Foydalanuvchi (bigone_cl2 egasi): eski oylarni
**hozirgi holatida "muzlatib"**, kelajakda **Dashboard'ning Balansi ham
qo'shilgan holda** faqat **avgust va undan keyingi** LIVE hisoblansin
deb so'radi.

## 1. Qabul qilingan qarorlar (AskUserQuestion, 2026-08-12, ikki tur savol)

| Savol | Qaror |
|---|---|
| Qamrov | **FAQAT bigone_cl2** (ClientUser id=3). Boshqa 72 Mini ERP akkauntga TEGILMAYDI. |
| Ko'rinish | Avgustdan oldingi oylar oy-tanlash ro'yxatidan **butunlay olib tashlanadi**. Alohida "Arxiv" sahifa/UI **KERAK EMAS** — faqat bazada saqlanadi. |
| Qamrov (oylar) | May 2026 ham "avgustdan oldingi" hisoblanadi — arxivlanadi, dropdown'dan olib tashlanadi. |
| Eski `ym=` to'g'ridan-to'g'ri so'ralsa | LIVE qayta hisoblanmaydi — arxivdagi MUZLATILGAN natija qaytariladi ("eskidan oyidan olinmasin"). |
| **Dashboard "Balans"** | **HA — Balans ham FAQAT avgustdan hisoblanadi.** Bu B-variant (qattiq kesim): 2026-08-01 uchun bitta qulflangan "ochilish balansi" belgilanadi, undan keyin FAQAT avgustdan keyingi real yozuvlar qo'shiladi/ayiriladi. Avgustdan oldingi xom yozuvlar boshqa HECH QANDAY live hisobga (Dashboard, Moliya Kassa-opening, Analitika totals) ta'sir qilmaydi. |

### ⚠️ TASDIQLASH KERAK BO'LGAN YAGONA RAQAM — OCHILISH BALANSI

Hozir (2026-08-12, jonli bazadan hisoblab ko'rdim) 2026-08-01 kuni boshidagi
haqiqiy kassa qoldig'i:

```
Kirim (2026-08-01dan OLDIN, bekor qilinganlarsiz):    679 091 000
Chiqim (2026-08-01dan OLDIN):                          550 814 300
Yechim/taqsimot (2026-08-01dan OLDIN):                  99 561 700
──────────────────────────────────────────────────────────────────
OCHILISH BALANSI (2026-08-01, 00:00):                   28 715 000
```

Bu — hozir ham Moliya sahifasining "Kassa → oy boshi qoldig'i" (avgust)
qatorida ko'rinayotgan AYNAN shu raqam (uzluksizlik: kesim joriy vaqtda
hech qanday "sakrash" qilmaydi — bugungi joriy Balans, 46 337 000 atrofida,
kesimdan KEYIN HAM bir xil chiqadi, chunki 28 715 000 + avgust oyi real
harakati = joriy balans).

**Bu raqam DB'ga qulflab yoziladi va shundan keyin boshqa HECH QACHON
qayta hisoblanmaydi** (kelajakda iyun/iyul yozuvlarida xato topilsa ham).
Shuning uchun ruxsat berishdan oldin shu raqamni tasdiqlang.

## 2. Texnik dizayn (taklif)

### 2.1 Balans-kesim (cutover) — `ClientUser`ga 2 ta yangi maydon
Migratsiya `0048`:
```python
balance_cutover_date = models.DateField(null=True, blank=True)      # 2026-08-01
balance_cutover_amount = models.DecimalField(max_digits=20, decimal_places=2,
                                              null=True, blank=True)  # 28715000.00
```
`null` bo'lsa — eski xatti-harakat (to'liq tarixiy yig'indi), boshqa 72
akkauntga TA'SIR QILMAYDI. bigone_cl2 uchun bitta qo'lda `manage.py shell`
yozuvi bilan o'rnatiladi (kod emas, bir martalik ma'lumot yozuvi — ruxsatdan
keyin, sizga ko'rsatib).

### 2.2 Balans/Kirim/Chiqim hisoblovchi joylar — cutover'ni hisobga olish
`client_erp/serializers.py`dagi quyidagi joylarga **faqat
`user.balance_cutover_date` bo'lsa** qo'shimcha filtr kiritiladi
(`date__gte=cutover_date`), va yig'indiga `cutover_amount` qo'shiladi:
- `serialize_dashboard` — `total_income`/`total_expense`/`_dash_profit`
  (753-787-qatorlar atrofi)
- `serialize_finance_page` — `all_income`/`all_expense`/`all_withdrawal`
  (Balans, 1447-1464 atrofi) va `_cash_before()` (1494-1503, Kassa oy-boshi
  qoldig'i — cutover sanasidan oldingi oy so'ralsa endi arxivdan javob
  beriladi, §2.4ga qarang, shuning uchun bu funksiya amalda faqat
  avgust+ uchun chaqiriladi)
- `serialize_analytics` — `all_income`/`all_expense`/`all_withdrawal`/
  `balance_cash` (1729-1750 atrofi) va `totals` bloki

Bitta yordamchi funksiya (`services/scope.py`ga) — `cutover_bounds(user)` →
`(cutover_date, cutover_amount)` yoki `(None, 0)` — barcha joyda TAKRORLANMASIN
degan qoidaga rioya qilib (`contract_profit` yagona-manba tamoyili bilan bir xil).

### 2.3 Yangi model — `ClientFinanceMonthArchive`
```python
class ClientFinanceMonthArchive(models.Model):
    owner = models.ForeignKey(ClientUser, on_delete=models.CASCADE,
                               related_name='finance_month_archives')
    ym = models.CharField(max_length=7)             # 'YYYY-MM'
    finance_snapshot = models.JSONField()             # serialize_finance_page(...) natijasi
    analytics_snapshot = models.JSONField()           # serialize_analytics(...) natijasi
    frozen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('owner', 'ym')
```
Faqat O'QISH uchun — hech qachon UPDATE qilinmaydi.

### 2.4 Bir martalik buyruq — `manage.py archive_finance_months`
```
manage.py archive_finance_months --user bigone_cl2 --before 2026-08
```
- Mavjud oylarni aniqlaydi (2026-05, 06, 07), cutover **QO'YISHDAN OLDIN**
  ishga tushiriladi (shunda "hozirgi holatidagi to'liq" haqiqiy tarixiy
  formula bilan muzlatiladi, cutover-filtridan TA'SIRLANMAYDI).
- Har oy uchun `serialize_finance_page`/`serialize_analytics`ni chaqirib,
  natijani JSON qilib yozadi. FAQAT O'QIYDI.
- Yakunida konsolga jadval chiqaradi — ishga tushirilgach sizga ko'rsataman.

### 2.5 Backend — eski `ym=` so'ralganda arxivdan javob
`serialize_finance_page`/`serialize_analytics` boshida: agar
`user.username == 'bigone_cl2'` va so'ralgan `ym < '2026-08'` bo'lsa —
`ClientFinanceMonthArchive`dan mos yozuvni topib, uning JSON'ini
to'g'ridan-to'g'ri qaytaradi (xom jadvallarga umuman so'rov yubormaydi).
Agar arxiv yozuvi topilmasa (masalan `archive_finance_months` hali
ishlamagan oy) — bo'sh/None qaytaradi, frontend "Bu oy uchun ma'lumot yo'q"
ko'rsatadi (500 xato emas).

### 2.6 Backend — oy-tanlash ro'yxatini qisqartirish
`month_counts` (Moliya, ~1485) va `_an_months` (Analitika, ~2019) —
**faqat `bigone_cl2` uchun** `{k: v for k, v in months.items() if k >= '2026-08'}`.

### 2.7 Frontend
O'zgarish shart EMAS — dropdown backend dict'idan avtomatik quriladi.

## 3. Xavf va rollback
- Yangi maydonlar (`balance_cutover_*`) `null` bo'lsa eski xatti-harakat —
  boshqa 72 akkauntga **umuman tegmaydi**.
- `ClientFinanceMonthArchive` — additive, boshqa hech narsaga ta'sir qilmaydi.
- **Eng katta xavf: OCHILISH BALANSI raqami xato bo'lsa** — bu keyin
  QAYTA HISOBLANMAYDI (ataylab shunday, "arxivlanganlar o'zgarmasin"
  talabiga ko'ra), shuning uchun §1dagi 28 715 000 raqamini yozishdan oldin
  sinchiklab tasdiqlash SHART. Xato topilsa — faqat qo'lda, alohida ruxsat
  bilan tuzatiladi (avtomatik qayta hisoblanmaydi).
- Rollback: `balance_cutover_date=None` qilish yetarli (formulalar avtomatik
  eski — to'liq tarixiy — rejimga qaytadi); dropdown-filtri va §2.5 shart
  bitta joyda (`if user.username == 'bigone_cl2'`) — olib tashlash oson.

## 4. Test rejasi
1. `archive_finance_months` — 3 ta yozuv (05/06/07), JSON raqamlari joriy
   hisob-kitob bilan bir xilligini tekshirish.
2. Cutover o'rnatilgach: Dashboard/Moliya/Analitika Balansi **kesimdan OLDIN
   va KEYIN bir xil** ekanini tasdiqlash (28 715 000 + avgust harakati =
   joriy balans — sakrash BO'LMASLIGI kerak).
3. Moliya/Analitika oy-dropdown FAQAT "Avgust 2026"+ ko'rsatishini tekshirish.
4. `ym=2026-06` to'g'ridan-to'g'ri (masalan eski tab) so'ralsa — arxivdan
   JSON qaytishini, xom jadvalga so'rov ketmasligini tasdiqlash.
5. Boshqa akkaunt (masalan tg_1586130864) — HECH NARSA o'zgarmaganini
   (`balance_cutover_date=None`, eski to'liq tarixiy Balans) tasdiqlash.
6. `finance_selfcheck` qayta ishga tushirib, bigone_cl2da yangi invariant
   buzilish yo'qligini tekshirish.

## 5. Ishlash tartibi (ruxsat berilgach)
1. Migratsiya `0048` (`balance_cutover_*` + `ClientFinanceMonthArchive`) —
   sizga ko'rsataman.
2. `archive_finance_months --before 2026-08` ishga tushirib, natija
   jadvalini (05/06/07 oy raqamlari) sizga ko'rsataman — TASDIQLASHINGIZNI
   kutaman.
3. Faqat shundan keyin `balance_cutover_amount=28715000` (yoki siz
   tasdiqlagan boshqa raqam) yozilib, serializer-filtrlar va dropdown-filtri
   qo'shiladi.
4. Oxirida bigone_cl2 + boshqa 1 ta akkaunt bilan to'liq qayta tekshirib,
   natijani ko'rsataman.

**Hozir kod yozilmagan. Faqat §1dagi OCHILISH BALANSI raqamini (28 715 000)
tasdiqlab, "boshla"/"ruxsat" desangiz — 1-qadamdan boshlayman.**

## 6. Bajarilish natijasi (2026-08-12)

**Xavfsizlik:** ishni boshlashdan OLDIN to'liq DB backup olindi:
`backups/bigone-cl2-moliya-arxiv-2026-08-12/tenant_mebelcity_FULL_before.dump`
(132MB, `pg_dump -F c`). Tiklash: `pg_restore -h localhost -U bittada_manager
-d tenant_mebelcity --clean <fayl>`. Bundan tashqari, DB darajasida hech qanday
DELETE/UPDATE qilinmadi — faqat qo'shimcha (additive) ustun/jadval, shuning
uchun rollback DB tiklashsiz ham mumkin (pastga qarang).

1. Migratsiya `0048` — barcha 3 ta tenant bazasiga (`migrate_tenants --app client_erp`) qo'llandi.
2. `archive_finance_months --user bigone_cl2 --before 2026-08` — 3 oy (05/06/07) arxivlandi:

   | Oy | Kirim | Chiqim | Foyda(KPI) | Sof foyda |
   |---|---|---|---|---|
   | 2026-05 | 57 500 000 | 43 858 000 | 13 642 000 | 10 302 000 |
   | 2026-06 | 286 855 000 | 250 198 000 | 36 657 000 | 54 761 000 |
   | 2026-07 | 211 136 000 | 156 960 000 | 54 176 000 | 36 618 245 |

3. Kod: `services/scope.py::cutover_bounds()`, `serialize_dashboard`/
   `serialize_finance_page`/`serialize_analytics` — kesim-filtri + arxiv-
   qaytarish. Regressiya: kesim `None`likda avvalgi natijalar 1:1 mos
   ekani tasdiqlandi (avgust balans 46 337 000 — o'zgarishsiz).
4. Kesim yozildi: `balance_cutover_date=2026-08-01`,
   `balance_cutover_amount=28715000.00` (faqat bigone_cl2).
5. Tekshiruv (barchasi ✅):
   - Avgust Balans kesimdan OLDIN va KEYIN AYNAN bir xil (46 337 000) — sakrash yo'q.
   - Moliya/Analitika oy-dropdown endi FAQAT `['2026-08']`.
   - `ym=2026-06` to'g'ridan-to'g'ri so'ralganda — arxivdan (286 855 000, live emas).
   - Boshqa akkaunt (tg_1586130864) — balans/dropdown butunlay o'zgarishsiz.
   - `finance_selfcheck` — yangi invariant buzilish yo'q (barcha 73 akkaunt).

**Rollback (agar kerak bo'lsa):** `ClientUser.objects.filter(username='bigone_cl2').update(balance_cutover_date=None, balance_cutover_amount=None)` — bitta qator, formulalar avtomatik eski (to'liq tarixiy) rejimga qaytadi. Xom ma'lumot (`ClientFinanceRecord`/`ClientOrder`) hech qachon tegilmagan.

**✅ `bittada-manager-ws` ham restart qilindi (2026-08-12, user ruxsati bilan).**
Restartdan oldin barcha yangi/o'zgargan modul (`serializers.py`, `services/
scope.py`, `models/`) import-tekshiruvdan o'tdi (xatosiz). Restartdan keyin:
xizmat holati `active`, jurnalda xato/traceback yo'q, va Avgust oyi live
qayta hisoblab tekshirildi — natija bir xil qoldi (balans 46 337 000,
dropdown faqat `['2026-08']`). Vazifa to'liq tugadi.
