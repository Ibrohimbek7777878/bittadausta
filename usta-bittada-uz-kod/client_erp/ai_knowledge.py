"""client_erp/ai_knowledge.py — Bittada Usta AI bilim bazasi.

TZ: client_erp/TZ-AI-Tushuntiruvchi-Tashxischi.md

NIMA UCHUN KERAK
    Gemini Live system-prompt'i ilgari ~10 qator edi va moliya mantiqi
    UMUMAN yo'q edi. Natijada «Balans nima?», «nega foydam kam?» degan
    savolga AI O'ZIDAN TO'QIRDI — moliyaviy masalada bu xavfli.

QAT'IY QOIDA
    Bu yerda faqat QOIDA va FORMULA. RAQAM YO'Q.
    Foydalanuvchining haqiqiy raqamlari HAR DOIM tool orqali olinadi
    (`ai_diagnose.diagnose`, `finance_summary`, ...). AI raqam to'qimaydi.

IKKI QAVAT (token tejash uchun)
    CORE       — har sessiyada yuboriladi (~1 KB)
    SECTIONS   — savolga qarab KERAKLISI qo'shiladi (~1-2 KB)
    Savol turini `pick_sections()` kalit so'z bo'yicha aniqlaydi.
"""

# ─────────────────────────────────────────────────────────────────────────────
# CORE — har doim yuboriladi
# ─────────────────────────────────────────────────────────────────────────────
CORE = """
BITTADA USTA — mebelchi ustalar uchun mini ERP (usta.bittada.uz).
Usta buyurtmalarni yuritadi, pulini hisoblaydi, jamoasi bilan foyda bo'lishadi.

ENG MUHIM 3 TA RAQAM — ular BOSHQA-BOSHQA narsa:
  • BALANS      — hozir qo'lda turgan pul (hamyon)
  • SOF FOYDA   — shu oyda ishlab topilgan (mehnat natijasi)
  • QARZ        — mijozlar bermagan pul (kelajakda keladigan)
Uchtasi har xil bo'lishi NORMAL. Usta ko'pincha shundan chalkashadi.

SEN QANDAY JAVOB BERASAN:
  • Raqam kerak bo'lsa — HAR DOIM tool chaqir. O'zingdan raqam AYTMA.
  • «Nega foydam kam?», «xatoyim bor» — `diagnose_my_finance` tool'ini chaqir,
    u topgan muammolarni sodda til bilan tushuntir.
  • Tool qaytargan sabab va raqamdan CHETGA CHIQMA. Taxmin qilma.
  • Usta — oddiy mebelchi. Buxgalteriya atamasi ishlatma. Sodda gapir.
  • Javob qisqa bo'lsin, lekin savol tushuntirish talab qilsa — tushuntir.
"""

# ─────────────────────────────────────────────────────────────────────────────
# SECTIONS — savolga qarab qo'shiladi
# ─────────────────────────────────────────────────────────────────────────────
SECTIONS = {}

SECTIONS['balans'] = """
BALANS = hozir qo'lda turgan pul.
  Formula:  barcha KIRIM − barcha CHIQIM − barcha PUL YECHISH
  • Oy filtriga BO'YSUNMAYDI — «Shu oy»/«Yil» tanlansa ham bir xil turadi.
    Chunki bu oqim emas, HOZIRGI HOLAT.
  • Balansga KIRMAYDI: shartnoma summasi, mijoz qarzi, sof foyda,
    boshqa akkauntdagi kutilayotgan ulush. Faqat HAQIQIY pul.
  Misol: 10 mln zaklad keldi → 6 mln material → 1 mln o'ziga yechdi
         = hamyonda 3 mln. Mijoz yana 15 mln berishi kerak bo'lsa ham
         Balans o'zgarmaydi — pul kelmaguncha.

KASSA BLOKI — Balansning shu oyga ajratilgani:
  oy boshi qoldiq + kirim − chiqim − pul yechish = oy oxiri qoldiq
  «Oy oxiri qoldiq» va «Balans» BIR XIL raqam bo'lishi shart.
"""

SECTIONS['foyda'] = """
IKKI XIL «FOYDA» BOR — chalkashtirmaslik SHART:

1) PUL O'ZGARISHI = Kirim − Chiqim (shu oy)
   (ekranda shu nom; ilgari «Kassa foyda» deb atalgan)
   Bu HAQIQIY foyda EMAS — pul oqimi.
   Nega aldamchi: material iyulda olinib, pul avgustda kelsa —
   avgustda katta ko'rinadi, aslida unday emas.
   Jonli misol (bigone_cl2): iyunda 10 mln ko'rsatgan, haqiqiy foyda
   54 mln edi; iyulda 72 mln ko'rsatgan, haqiqiy 46 mln.

2) SOF FOYDA = Shartnoma summasi − Chiqim
   Bu HAQIQIY foyda. FAQAT shu oyda TOPSHIRILGAN buyurtmalar sanaladi.
   Pul kelishini KUTMAYDI — ish topshirilsa foyda to'liq yoziladi.
   Agar shu oyda hech nima topshirilmagan bo'lsa — Sof foyda 0 bo'ladi.
   Bu xato emas; davr filtrini «Hammasi» ga o'zgartirib ko'rish kerak.

FOYDA SHARTNOMADAN HISOBLANADI, KELGAN PULDAN EMAS:
   Misol: shartnoma 24 mln, mijoz 20 mln bergan, xarajat 13 mln.
     Foyda = 24 − 13 = 11 mln   (shartnomadan)
     EMAS  = 20 − 13 = 7 mln    (kelgan puldan)
   Qolgan 4 mln — qarz, alohida turadi.
   Sabab: ish bajarilgan bo'lsa daromad tan olinadi (jahon standarti).

SHARTNOMA SUMMASI KIRITILMAGAN BO'LSA — FOYDA 0 CHIQADI.
   Bu eng ko'p uchraydigan sabab. Buyurtmaga kelishilgan summa
   kiritilishi shart.
"""

SECTIONS['qarz'] = """
IKKI XIL QARZ BOR:

1) HISOBLANGAN QARZ (norasmiy) — tizim O'ZI hisoblaydi
   Formula: Kelishdik − Oldik
   Muddat yo'q, mijoz shart emas, yozuv yaratilmaydi. Bu shunchaki FAKT:
   «mijoz shuncha bermagan». Moliya → Qarzlar tabida qizil rangda.

2) MUDDATLI QARZ (rasmiy) — ustaning O'ZI yozadi
   Mijoz + summa + muddat (kalendar). Qisman to'lash kuzatiladi.
   Qarzlar tabida sariq rangda.

Farqi: birinchisi — hisob-kitob, ikkinchisi — kelishuv va nazorat.
Qarzlar ro'yxati oy filtriga bo'ysunmaydi (qarz — hozirgi holat).
"""

SECTIONS['ulush'] = """
JAMOA ULUSHI (foyda taqsimoti):
  • Buyurtma egasi foydani jamoa a'zolari bilan bo'lishadi (foizda).
  • Ulush FAQAT ro'yxatdan o'tgan kontaktlarga beriladi (erkin ism emas).
  • «Pul yechish» qilinganda a'zoga bildirishnoma boradi, u qabul qiladi.
  • A'zoga tegadigan pul u yechilmaguncha EGASINING kassasida turadi —
    shuning uchun a'zoning Balansiga qo'shilmaydi. U «Kutilayotgan foyda»
    kartasida alohida ko'rinadi.
  • Bekor qilingan taqsimot: pul kassaga QAYTADI (bekor yozuvi bilan).
    Bunday qaytish TUSHUM emas — foyda hisobiga qo'shilmaydi.
  • Ulushlar yig'indisi 100% dan oshmasligi kerak.
"""

SECTIONS['shartnoma'] = """
SHARTNOMALAR TABI (Moliya sahifasida):
  Har shartnoma ALOHIDA hisoblanadi, qo'shilmaydi. Chek ko'rinishida:
    Kelishdik → Oldik → Mijoz qarzi → Sarfladik → FOYDA
  Raqamlar shartnoma BOSHIDAN BERI (oy filtriga bog'liq emas), chunki
  shartnoma oylar bo'ylab cho'ziladi.

  Holat belgilari:
    ✅ mijoz tasdiqlagan shartnoma bor
    🟡 yuborilgan, mijoz hali tasdiqlamagan
    ⚪ rasmiy shartnomasiz (summa zakladdan olingan)
    ⚠️ summa umuman kiritilmagan → foyda 0

  «Boshqaning zakazi» bo'limi — boshqa usta egaligidagi buyurtmalar,
  ulardan sizga faqat ULUSH tegadi, pul ularning kassasida.
"""

SECTIONS['tranzaksiya'] = """
TRANZAKSIYALAR TABI — pul daftari. Har pul harakati sana bo'yicha.
  Uch xil yozuv:
    ↓ Kirim       — pul keldi (mijozdan, zakladdan)
    ↑ Chiqim      — pul ketdi (material, transport, ish haqi)
    💰 Pul yechish — foyda bo'lindi (ustaga ulush yoki o'ziga)

  Nega kerak:
    1. Balans shu yozuvlardan hisoblanadi
    2. «Sarfladik 30 mln» ning tafsiloti shu yerda
    3. Kirim/Chiqim shu yerga yoziladi
    4. Qidiruv: izoh, mijoz, buyurtma, kategoriya bo'yicha

  ⚠️ Yozuv buyurtmaga BOG'LANMASA — u hech qaysi buyurtmaning
  xarajatiga/daromadiga kirmaydi. Balans o'zgaradi, foyda esa
  noto'g'ri ko'rinadi. Bu eng ko'p uchraydigan xato.
"""

SECTIONS['sahifa'] = """
SAHIFALAR:
  Bosh sahifa   — umumiy holat, bugungi ishlar
  Buyurtmalar   — barcha zakazlar, etaplari bilan
  Mijozlarim    — mijoz bazasi, tarixi
  Moliya        — kassa, foyda, 3 ta tab (Tranzaksiyalar/Shartnomalar/Qarzlar)
  Analitika     — grafiklar, davr taqqoslash
  Jamoa         — a'zolar, ulush taqsimoti
  Tarif/Tanga   — obuna va AI xarajati

BUYURTMA YO'LI (etaplar): shablon tanlanadi → har etap bajariladi →
  checklist belgilanadi → «Topshirildi» bosiladi → foyda yoziladi.
  «Topshirildi» uchun shartnoma summasi kiritilgan bo'lishi SHART.
"""

# Kalit so'z → bo'lim
_KEYWORDS = {
    'balans': ('balans', 'qoldiq', 'hamyon', 'kassa', 'pul qayerda', 'qancha pul'),
    'foyda': ('foyda', 'sof', 'daromad', 'ishlab topdim', 'kam', 'zarar', 'foiz'),
    'qarz': ('qarz', 'qarzdor', 'bermagan', 'to\'lamagan', 'muddat', 'qaytarish'),
    'ulush': ('ulush', 'jamoa', 'taqsimot', 'sherik', 'bo\'lish', 'usta foydasi', 'a\'zo'),
    'shartnoma': ('shartnoma', 'kelishdik', 'kelishuv', 'summa', 'zaklad'),
    'tranzaksiya': ('tranzaksiya', 'kirim', 'chiqim', 'yozuv', 'daftar', 'harakat'),
    'sahifa': ('sahifa', 'tugma', 'qayerda', 'qanday ochaman', 'etap', 'buyurtma yo\'li'),
}


def pick_sections(question, limit=3):
    """Savolga mos bo'limlarni tanlaydi (token tejash uchun).

    Hech biri mos kelmasa — eng ko'p so'raladigan 3 tasi qaytariladi.
    """
    q = (question or '').lower()
    hits = []
    for key, words in _KEYWORDS.items():
        score = sum(1 for w in words if w in q)
        if score:
            hits.append((score, key))
    if not hits:
        return ['balans', 'foyda', 'qarz']
    hits.sort(reverse=True)
    return [k for _, k in hits[:limit]]


def build(question=None, full=False):
    """System-prompt uchun bilim matni.

    full=True — hamma bo'lim (matnli chat uchun; u yerda token unchalik
    qimmat emas va savol oldindan noma'lum).
    """
    parts = [CORE.strip()]
    keys = list(SECTIONS.keys()) if full else pick_sections(question)
    for k in keys:
        sec = SECTIONS.get(k)
        if sec:
            parts.append(sec.strip())
    return '\n\n'.join(parts)
