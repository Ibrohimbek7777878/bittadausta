# TZ — Matnli AI chatga amal bajarish (tool-calling) qo'shish

Sana: 2026-09-11. Foydalanuvchi so'rovi: "chatbot hamma narsa qila olish kere,
to'liq tizimni boshqara ham olish kere" (skrinshot: `#/orders/458`, matnli
chatga "zamer va kelishuv etapini tugatib qo'y" deyilgan, lekin AI faqat
QO'LDA QANDAY QILISHNI tushuntirgan, o'zi bajarmagan).
Aniqlashtirish javobi: "90% boshqara olsin, token sarfiga ham ehtiyot bo'l".

## 1. Hozirgi holat (tasdiqlangan, kod o'qib)

Ikki BUTUNLAY ALOHIDA AI yo'li bor:

| | **Matnli chat** (✨ tugma, yozishma) | **Ovozli (Gemini Live)** |
|---|---|---|
| Fayl | `client_erp/services/ai_chat.py` | `rc-glive.js` (mikrofon rejimi) + `rc-actions.js` |
| Ishlash tarzi | Savol → FAQAT O'QIYDIGAN tool (`ai_tools.py`, 6 ta: diagnose/explain_metric/my_debtors/contract_detail/orders_without_contract/unlinked_records) → AI faktlarni gapiradi | Savol → `GEMINI_TOOLS` (16 ta, `rc-actions.js`) → **AMAL BAJARADI** (masalan `complete_stage`, `create_order`, `add_customer`, `navigate`) |
| Yozadimi | **YO'Q** — qat'iy "FAQAT O'QIYDI" qoidasi bilan qurilgan | **HA** — allaqachon mavjud, sinovdan o'tgan |

**Muhim kashfiyot**: foydalanuvchi so'ragan imkoniyat (masalan "etapni tugat")
— **allaqachon mavjud va ishlaydi**, lekin faqat OVOZLI rejimda (🎤).
Matnli chat esa hali shu registrga ulanmagan — shuning uchun skrinshotdagi
holatda AI "o'zi qilib qo'yish" o'rniga "qanday qilishni" tushuntirdi.

`rc-actions.js`dagi 16 ta mavjud amal: `navigate`, `open_order`, `open_page`,
**`complete_stage`**, `check_item`, `add_stage`, `change_status`, `add_income`,
`add_expense`, `go_back`, `create_order`, `open_tab`, `add_customer`,
`order_info`, `finance_summary`, `current_context`.

## 2. Eng oson va xavfsiz yechim — mavjud registrni matnli chatga ulash

Yozish infratuzilmasini QAYTADAN qurish shart EMAS — u allaqachon bor va
sinalgan (ovozli rejimda ishlatilib turibdi). Kerak bo'lgan narsa: matnli
chatga (`ai_chat.py::answer`) ham xuddi shu `GEMINI_TOOLS`/`RcActions.run`
zanjirini ulash — provayder function-calling qaytarsa, frontend
`RcActions.run(name, args)` orqali bajarsin (xuddi ovozli rejimdagi kabi).

## 3. Xavf darajasi bo'yicha amallar tasnifi (foydalanuvchi javobiga ko'ra)

Foydalanuvchi "90% boshqarsin" dedi — ya'ni deyarli barcha 16 ta amal kiradi.
Lekin xavf darajasi bo'yicha ochiq savol:

- **Past xavf (12 ta)**: `navigate`, `open_order`, `open_page`, `go_back`,
  `open_tab`, `order_info`, `finance_summary`, `current_context`, `check_item`,
  `add_stage` (oyna ochadi, o'zi yozmaydi), `change_status` (oyna ochadi),
  `create_order` (bo'sh nom bilan, moliyaga tegmaydi) — bular allaqachon
  ovozda ishlatilib, muammo chiqmagan.
- **O'rta xavf**: `complete_stage` (etapni tugatilgan belgilaydi — qaytarish
  mumkin, lekin ish jarayoniga ta'sir qiladi), `add_customer` (yangi yozuv,
  lekin zararsiz).
- **Yuqori xavf**: `add_income`/`add_expense` — bular ⚠️ HOZIR HAM faqat
  OYNA OCHADI (o'zi pul yozmaydi, foydalanuvchi oynada tasdiqlashi kerak) —
  kodda shunday qurilgan, bu YAXSHI xavfsizlik chegarasi, o'zgartirilmasin.

## 4. Token sarfi (foydalanuvchi alohida ta'kidlagan)

- Matnli chatga 16 ta tool e'loni qo'shilsa, har so'rovda promptga qo'shimcha
  ~800-1200 token ketadi (tool tavsiflari) — `ai_usage` kunlik limit
  (30 xabar/50000 token) buni allaqachon nazorat qiladi, o'zgartirish
  shart emas.
- Tejash: `_detect_tools`dagi kabi, savol matniga qarab FAQAT tegishli
  tool'larni promptga qo'shish (barcha 16 tasini har doim emas) — masalan
  "tugat"/"belgila" so'zi bo'lsa faqat `complete_stage`/`check_item` beriladi.

## 5. Qarorlar (foydalanuvchi tasdiqladi, 2026-09-11)

1. **Qamrov**: barcha 16 ta amal ulanadi (to'liq — "90%").
2. **Tasdiqlash**: HAR amal bajarilishidan oldin AI bitta aniqlovchi savol
   beradi ("Zamer va Kelishuv etapini tugatay dеyilmi?" kabi) va
   foydalanuvchi "ha"/"tasdiqlayman" desagina bajaradi. Darhol bajarish YO'Q.
3. **Sahifa mosligi**: AI kerakli sahifa/buyurtma ochiq emasligini
   aniqlasa, avval `navigate`/`open_order` bilan o'zi ochadi, keyin
   asosiy amalni bajaradi (2 bosqichli zanjir bitta foydalanuvchi
   xabari ichida, qo'shimcha savolsiz — faqat YAKUNIY xavfli amal
   tasdiq so'raydi, oraliq navigatsiya emas).

## 6. Implementatsiya rejasi (bosqichma-bosqich)

### F0 — Backend: tool e'lonlarini matnli chatga ko'chirish
- `ai_chat.py::answer()` ichida `get_ai_providers()`ga `tools=GEMINI_TOOLS`
  uzatish (provayder function-calling qo'llab-quvvatlasa).
- **Muammo**: `rc-actions.js`dagi `GEMINI_TOOLS` — frontend JS massivi,
  backend Python promptga to'g'ridan-to'g'ri qo'sha olmaydi. Ikki yechim:
  (a) backendda bir xil 16 ta tool tavsifini Python ro'yxati sifatida
  ko'chirib yozish (ikki joyda saqlash — yangi amal qo'shilganda ikkalasi
  ham yangilanishi kerak, xato ehtimoli bor), (b) frontend `chatSend()`
  o'zi `GEMINI_TOOLS`ni WS xabari bilan birga yuborishi (`ai.chat` payload
  ichida `tools: window.GEMINI_TOOLS`) — DINAMIK, ikki joyda saqlanmaydi.
  **Tavsiya: (b)** — DRY, rc-actions.js o'zgarishi avtomatik ikkalasida
  ham ko'rinadi.
- Token tejash: `_detect_tools()`dagi kalit-so'z mantig'iga o'xshab, savol
  matniga qarab faqat mos tool'larni yuborish (masalan "tugat"/"belgila"
  so'zi bo'lsa `complete_stage`/`check_item`, "yarat"/"qo'sh" bo'lsa
  `create_order`/`add_customer`) — barcha 16 tasini har doim yubormaslik.

### F1 — Backend: AI javobida `tool_call` bo'lsa qaytarish
- `answer()` provayderdan `tool_call` (name+args) kelsa, buni
  `handle_ai_chat` javobiga qo'shib qaytarish: `{'ok': true, 'data':
  {'text': '...', 'tool_call': {'name': 'complete_stage', 'args': {...},
  'needs_confirm': true}}}`.
- `needs_confirm` — YUQORIDA qaror qilingan qoidaga ko'ra HAR doim `true`
  (F0da soddalik uchun barcha amal uchun bir xil, farqlash keyinroq).

### F2 — Frontend: tasdiq va bajarish
- `rc-glive.js::chatSend()` javobda `tool_call` bo'lsa: (1) AI matnini
  chatga chiqaradi ("Zamer va Kelishuv etapini tugataymi?"), (2) chat
  ichida 2 ta tugma chiqadi — "✅ Ha, bajar" / "❌ Yo'q" — xuddi mavjud
  boshqa tasdiq-modallar uslubida.
- "Ha" bosilsa — `RcActions.run(tool_call.name, tool_call.args)` chaqiriladi
  (ovozli rejimdagi bilan AYNAN BIR XIL funksiya, qayta yozilmaydi).
- Natija (masalan "✅ Etap tugatildi") chatga qo'shiladi.

### F3 — Sinov
- Playwright orqali jonli sinov: "Zamer va Kelishuv etapini tugat" →
  tasdiq tugmasi chiqishi → bosilgach real DB'da etap holati
  o'zgarganini tekshirish.

## 7. Hali BOSHLANMAGAN

Bu TZ — reja va tasdiqlangan qarorlar. Kod yozish uchun yakuniy
"boshla" so'zi kutilmoqda (loyihaning umumiy qoidasiga ko'ra —
TZ → savol → ruxsat → kod).
