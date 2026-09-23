# TZ — Bittada Usta Android: saytga to'liq paritet

**Sana:** 2026-09-12
**Holat:** TZ — tasdiqlash kutilmoqda. **Kod BOSHLANMAGAN.**
**Maqsad:** Android ilova `usta.bittada.uz` sayti bilan **funksional jihatdan bir xil** bo'lsin.

---

## 1. Hozirgi holat (o'lchangan, taxmin emas)

| Ko'rsatkich | Server/Sayt | Ilova | Qamrov |
|---|---|---|---|
| WebSocket amallari | **125** | 17 | **14%** |
| Sahifalar | **17** | 7 | 41% |

Ya'ni ilova serverning **oltidan bir qismini** ishlatadi.

### Sahifalar bo'yicha farq

| Sahifa (sayt route) | Ilovada | Izoh |
|---|---|---|
| `/` Bosh sahifa | ✅ chala | Statistika bor, `dashboard.pending_detail` yo'q |
| `/clients` Mijozlarim | ⚠️ faqat o'qish | Qo'shish/tahrirlash/o'chirish YO'Q |
| `/clients/:id` Mijoz kartasi | ❌ | Butunlay yo'q |
| `/orders` Buyurtmalar | ✅ chala | Savat (o'chirilganlar) yo'q |
| `/orders/:id` Buyurtma | ⚠️ chala | Chiqim, o'chirish, ulashish, MebelCity yo'q |
| `/finance` Moliya | ⚠️ faqat o'qish | Tranzaksiya yaratish, yechish, qarz YO'Q |
| `/analytics` Analitika | ✅ chala | AI tarixi yo'q |
| `/settings` Sozlamalar | ⚠️ chala | Kategoriya, til, shablon yo'q |
| `/team` **Jamoa** | ❌ | Butunlay yo'q |
| `/vizualizatsiya` | ❌ | Butunlay yo'q |
| `/portfolio` Portfolio | ❌ | Butunlay yo'q |
| `/zamers` 3D Zamerlar | ❌ | Butunlay yo'q |
| `/oldi-berdi` Oldi-Berdi | ❌ | Butunlay yo'q |
| `/mebelcity` Buyurtmalarim | ❌ | Butunlay yo'q |
| `/tarif` Tarif | ❌ | Butunlay yo'q |
| `/tanga` Tanga hamyoni | ❌ | Butunlay yo'q |
| `/yangi` Yangi imkoniyatlar | 🚫 | **TEGILMAYDI** (amaldagi qoida) |

---

## 2. Umumiy qoidalar (barcha bloklarga tegishli)

1. **Server o'zgartirilmaydi.** Barcha 91 amal serverda tayyor va ishlayapti. Django, consumers.py, serializers.py — tegilmaydi. Faqat Android kodi yoziladi.
2. **Pul amallari sinov uchun ishlatilmaydi.** `pay.start` prod'da real karta yechadi. Sinov faqat `BILLING_LIVE=0` muhitida.
3. **O'chirish amallari** — har birida tasdiq dialogi MAJBURIY, oqibati matnda aniq yozilsin.
4. **Dizayn saytdagidek**: Plus Jakarta Sans, lime `#DCF262`, karta radiusi 22dp, bottom-sheet dialoglar.
5. **Ruxsat (permission)** har bir amalda server tomonda tekshiriladi — ilova UI'ni ham shunga moslashi kerak (tugma ko'rinmasin, xato chiqmasin).
6. **Tarif chegarasi**: `{upgrade:true}` javobi kelsa — tarifni yangilash taklifi ko'rsatilsin, xato emas.
7. Har blok tugagach **APK beriladi**, siz sinaysiz, keyin keyingisi boshlanadi.

---

## 3. Bloklar — qisqa jadval

| # | Blok | Amal | Hajm | Xavf |
|---|---|---|---|---|
| 1 | Mijozlar | 6 | ~1000 qator | 🔴 o'chirish (qarz kaskad) |
| 2 | Buyurtma to'liq | 11 | ~2100 qator | 🔴 pul + o'chirish |
| 3 | Etaplar va shablonlar | 9 | ~1500 qator | 🟡 hard delete |
| 4 | Moliya | 13 | ~2500 qator | 🔴 real pul |
| 5 | Jamoa va foyda | 13 | ~2500 qator | 🔴 real pul |
| 6 | Fayl, vizualizatsiya | 10 | ~2100 qator | 🔴 fayl o'chirish |
| 7 | Eslatma, bildirishnoma | 8 | ~900 qator | 🟡 o'chirish |
| 8 | Laylo AI | 7 | ~2500 qator | 🔴 AI pul yozadi |
| 9 | Katalog, tanga, to'lov | 10 | ~3000 qator | 🔴 real to'lov |
| 10 | Sozlamalar | 4 | ~400 qator | 🟢 past |
| | **JAMI** | **91** | **~18 600 qator** | |

**Baho:** Bu ~3-4 hafta ish (kuniga 1 blok emas — bloklar katta).

---

## 1-blok. Mijozlar

**Tavsif:** Usta (mini ERP) ning shaxsiy mijozlar bazasi: ClientCustomer modeli ustida yaratish/tahrirlash/o'chirish + mijoz detali (uning buyurtmalari ro'yxati bilan) + ikki xil odam qidirish (contacts.search — foyda ulushi uchun Bittada foydalanuvchilari; user.search — buyurtmaga ruxsat berish uchun). Barcha yozuvlar qat'iy owner=self.user bo'yicha izolyatsiya qilingan, boshqa usta mijoziga hech qanday yo'l bilan tegib bo'lmaydi.

**Hajm:** O'rta. Kotlin/Compose da taxminan 900-1200 qator: ClientsScreen ni qayta yozish (davr filtri + '+' tugma + trash, ~350 qator), yangi ClientDetailScreen (~300 qator), 2 ta bottom-sheet (qo'shish/tahrir

### Amallar (6 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `client.create` | Yangi mijoz (ClientCustomer) yaratadi | Bottom-sheet dialog 'Yangi mijoz': 3 maydon — Ism* (text, autofocus), Telefon (tel klaviatura,  |
| 2 | `client.update` | Mavjud mijozning FAQAT ismi va telefonini tahrirlaydi (save(update_fields=['full_name','phone'])) | Mijoz detali ekranida qalam (pen) ikonkasi → bottom-sheet 'Mijozni tahrirlash': Ism* + Telefon  |
| 3 | `client.delete` | Mijozni bazadan BUTUNLAY o'chiradi (hard delete, soft-delete EMAS) | Ro'yxat kartochkasida qizil 'chiqindi' (trash) ikonkasi (bosilganda kartaga o'tish bekor qilina |
| 4 | `page.client_detail` | Bitta mijozning kartasi + shu mijozga tegishli o'chirilmagan buyurtmalar ro'yxati + statistikani ber | Alohida EKRAN (/clients/{id}) |
| 5 | `contacts.search` | BUTUN Bittada platformasi bo'ylab ro'yxatdan o'tgan foydalanuvchilarni (ClientUser) qidiradi — foyda | Yangi ekran EMAS — mavjud 'Foyda ulushi / odam tanlash' bottom-sheet ichidagi qidiruv maydoni |
| 6 | `user.search` | Buyurtmaga RUXSAT berish (perm | Yangi ekran EMAS — 'Ruxsat berish' bottom-sheet ichidagi qidiruv maydoni (300ms debounce) |

**⚠️ Xavf:**

> YUQORI — MA'LUMOT O'CHIRISH BOR, PUL HARAKATI YO'Q.
> 1) ENG JIDDIY: client.delete = HARD DELETE + KASKAD. ClientCustomer.delete() chaqirilganda Django kaskadi bo'yicha ClientDebt yozuvlari HAM O'CHADI (client_erp/models/finance.py:100 — customer FK on_delete=models.CASCADE). Ya'ni mijozni o'chirish uning QARZ TARIXINI ham yo'q qiladi — moliyaviy ma'lumot yo'qoladi. Serverda hech qanday ogohlantirish yoki 'qarzi bor' tekshiruvi YO'Q.
> 2) Buyurtmalar va zamerlar o'chmaydi lekin ETIM QOLADI: ClientOrder.customer va ClientZamer.customer, ClientFinanceRecord.customer — hammasi SET_NULL. Natijada buyurtma 'mijozsiz' bo'lib qoladi, page.client_detail orqali qayta bog'lab bo'lmaydi.
> 3) Tiklash YO'Q: order.delete da is_deleted soft-delete + order.restore bor, mijozda esa YO'Q. O'chirilgan mijozni qaytarishning yagona yo'li — DB backup.
> 4) Bu bir bosqichli: tugma → tasdiq sheet → o'chdi. Saytda tasd

**Saytda qanday ko'rinadi:**

SAYTDA (rc-clients.js, redesign SPA, hash-router):  1) MIJOZLAR RO'YXATI — /clients (RC_PAGES['/clients']):    - Yuqori qator: kengaytiriladigan qidiruv maydoni ('Mijoz qidirish...', lupa ikonkasi) + o'ngda 44x44 kvadrat '+' tugmasi (Yangi mijoz).    - Ostida DAVR FILTRI (RcPeriod): Shu oy / O'tgan oy / Yil / Hammasi / aniq oy dropdown / custom sana. MUHIM: bu filtr TO'LIQ CLIENT-SIDE — page.clients davr parametrini QABUL QILMAYDI, barcha mijozlar bir marta yuklanadi va JS order_months[] + created_month bo'yicha ajratadi. Ochilganda default 'Hammasi' (2026-08-26 da 'Shu oy' dan o'zgartirilgan — bosh sahifadagi mijozlar soni bilan mos kelmagani uchun).    - Sarhisob qatori: 'Mijozlarim' + dav


---

## 2-blok. Buyurtma (chiqim, o'chirish, ulashish, MebelCity)

**Tavsif:** Bu blok buyurtma ustidagi 4 xil amalni birlashtiradi: (1) chiqim (rasxod) yozish — HAQIQIY PUL harakati, (2) buyurtmani soft-delete qilish va savatdan tiklash, (3) mijozga ochiq (authsiz) UUID-havola berish/bekor qilish, (4) usta zakazini MebelCity ishlab chiqarish buyurtmasiga ulash/uzish va MC buyurtma tafsilotini ilova ichida ko'rish. Barcha amallar WS orqali, handler nomi `handle_<action nuqtasiz>` (consumers.py:42 — `msg_type.replace('.', '_')`), ya'ni `order.expense` va `order_expense` bir xil handlerga tushadi.

**Hajm:** O'rta-katta. Kotlin/Compose tahminan 1900-2400 qator: Repo+model qatlami ~450 (10 amal, 4 yangi data-class: Transaction, DeletedOrder, McOrderBrief, McOrderDetail); ExpenseSheet ~300 (pul-maska, 2 dro

### Amallar (11 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `order.expense` | Buyurtmaga chiqim (rasxod) moliyaviy yozuvi qo'shadi | Dialog/BottomSheet "Chiqim qo'shish": Summa* (pul-maska, faqat raqam), Izoh, Kategoriya (dropdo |
| 2 | `order.delete` | Buyurtmani SOFT-DELETE qiladi: is_deleted=True, deleted_at=now, delete_note=<sabab> | Dialog: "Buyurtmani o'chirish" — matn + majburiy ko'p qatorli sabab maydoni (placeholder "O'chi |
| 3 | `orders.deleted` | O'chirilgan (savatdagi) buyurtmalar ro'yxatini qaytaradi | "🗑 O'chirilgan buyurtmalar" ekrani/sheet: yuqorida qidiruv maydoni (nom + mijoz bo'yicha lokal  |
| 4 | `order.restore` | (blokning ajralmas jufti) Savatdagi buyurtmani qaytaradi: is_deleted=False, deleted_at=None | Savat ro'yxatidagi har qatordagi "Tiklash" tugmasi; bosilganda spinner, muvaffaqiyatda sheet yo |
| 5 | `order.customer_share` | Buyurtma uchun MIJOZGA ochiq (login talab qilmaydigan) havola yaratadi yoki mavjudini qaytaradi: Cli | Alohida ekran KERAK EMAS — «Ulashish» sheet ichidagi kartochka: sarlavha "Mijozga ulashish" + i |
| 6 | `order.customer_unshare` | Mijoz havolasini bekor qiladi — share_uuid=None yoziladi, eski havola darhol ishlamay qoladi (order_ | Alohida ekran kerak emas |
| 7 | `order.link_mebelcity` | Usta zakazini (ClientOrder) MebelCity ishlab chiqarish buyurtmasiga (manfacturing | BottomSheet "🔗 Qaysi buyurtmaga ulaymiz?" — MC buyurtmalar ro'yxati (mebelcity |
| 8 | `order.unlink_mebelcity` | Uzish — bu ALOHIDA WS amali EMAS | Sheet "🔗 MebelCity bilan bog'lanish" — 2 ta katta tugma: "⇄ Boshqasiga ulash" (MC tanlash sheet |
| 9 | `mebelcity.orders_for_stage` | Ustaning telefon raqami (va client nomi / owner_user_id) bo'yicha unga tegishli MebelCity buyurtmala | Ulash-tanlash ekranida (sheet) ro'yxat + 2 ta tab: "Ro'yxat" va "Kalendar" (sanaga qarab filtr) |
| 10 | `mebelcity.order_detail` | Bitta MebelCity buyurtmaning TO'LIQ ishlab chiqarish tafsiloti — bosqichlar, holat, sana, ishchi ism | Sheet/ekran "🏭 MebelCity buyurtma": yuqorida loyiha nomi + holat + 🏁 muddat, keyin progress-bar |
| 11 | `mc.order_detail` | Yuqoridagidan BOSHQA amal: MC buyurtmani HIMOYALANGAN KOD (secure code) orqali ochadi — id emas, HMA | Bu amal hozir sayt frontendida (rc-* |

**⚠️ Xavf:**

> YUQORI — blokda ham PUL HARAKATI, ham MA'LUMOT O'CHIRISH bor:
> 1) PUL: `order.expense` — HAQIQIY moliyaviy yozuv. ClientFinanceRecord yaratiladi, order.total_expense va foyda hisobiga darhol ta'sir qiladi, kassa/hamyon hisobotlariga tushadi. Qaytarib olish oddiy foydalanuvchida YO'Q: `finance_revert` FAQAT username='bigone_cl2' ga ruxsat (FINANCE_REVERT_ALLOWED_USERNAME, consumers.py:2809). Ya'ni noto'g'ri yozilgan chiqimni oddiy usta O'CHIRA OLMAYDI. Ehtiyot chorasi: ilovada summa tasdiqlash qadami (yozilgan summani so'z bilan/kattalashtirib ko'rsatish), double-tap/ikki marta yuborishdan himoya (tugmani darhol disable qilish — WS javobi kechiksa foydalanuvchi qayta bosishi mumkin, backendda idempotentlik YO'Q → ikki marta chiqim yoziladi), offline navbatga qo'yish MAN ETILSIN.
> 2) O'CHIRISH: `order.delete` — soft-delete (is_deleted=True), jismonan o'chirmaydi, order.restore bilan tiklanad

**Saytda qanday ko'rinadi:**

SAYTDA (usta.bittada.uz, redesign SPA — hash-router, RC_PAGES):  1) BUYURTMA TAFSILOTI EKRANI (rc-order-detail.js) — 5 ta tab: [Umumiy] [Moliya] [Etaplar] [Fayllar] [Jamoa].    • «Umumiy» tab pastida: Eslatmalar → Tarix (timeline) → eng oxirida qizil "🗑 Buyurtmani o'chirish" tugmasi (faqat is_owner). Bosilsa sheet: matn + majburiy sabab textarea + qizil "O'chirish". Muvaffaqiyat → Router.go('/orders').    • «Moliya» tab: yuqorida stat-kartochkalar (Shartnoma/Kirim/Chiqim/Foyda), keyin amal tugmalari gridi: [+ Kirim] [− Chiqim] [Shartnoma] [Ulashish] [Foyda yechish] [Kirim qaytarish] [Chiqim qaytarish]. "− Chiqim" → "Chiqim qo'shish" sheet (Summa*/Izoh/Kategoriya/Etap/To'lov turi (+Kim to'lad


---

## 3-blok. Etaplar va shablonlar

**Tavsif:** Buyurtma ichidagi ish bosqichlarini (etap) yaratish, o'chirish, tartiblash, qayta ochish, o'tkazish, MebelCity zakaziga ulash va tayyor etap-shablonlarini saqlash/qo'llash bloki. Barcha amal `client_erp/consumers.py` dagi WS handlerlar orqali ishlaydi (`handle_<nom>`, dispatcher: `msg_type.replace('.','_')`), natija `_broadcast_order` bilan `mini_order_<id>` tenant-guruhiga real-time tarqatiladi.

**Hajm:** O'rta-katta. Kotlin/Compose: ~1300-1700 qator. Taqsimot: 9 ta WS amal uchun Repo/Live funksiyalari ~200 qator; StageTab (karta, checklist, status badge, amal tugmalari, MC cyan karta) ~400 qator; «Yan

### Amallar (9 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `stage.create` | Buyurtmaga yangi etap (bosqich) qo'shadi | Dialog/BottomSheet «✨ Yangi etap»: Nom (majburiy) + emoji grid (40 ta emoji, saytda RcOrderDeta |
| 2 | `stage.delete` | Etapni butunlay o'chiradi (DB dan DELETE, soft-delete YO'Q) | Etap kartasidagi 🗑 (qizil) tugma + tasdiq dialogi («Ushbu etapni o'chirasizmi?») |
| 3 | `stage.reorder` | Etaplar tartibini (sort_order) qayta belgilaydi: yuborilgan ID ro'yxati bo'yicha index=0,1,2 | Etaplar ro'yxatida drag-and-drop (uzun bosib sudrash) yoki ▲▼ tugmalar |
| 4 | `stage.reopen` | Tugallangan yoki o'tkazilgan etapni qayta 'active' holatga qaytaradi | Tugallangan/o'tkazilgan etap kartasida «↩ Qayta ochish» tugmasi + tasdiq dialogi |
| 5 | `stage.skip` | Etapni bajarmasdan 'skipped' holatiga o'tkazadi va progressni qayta hisoblaydi | Faol etap kartasida «⏭ O'tkazish» tugmasi (saytda ikonka-only rc-btn-ghost) + tasdiq dialogi |
| 6 | `stage.link_order` | Etapni MebelCity katta ERP buyurtmasiga bog'laydi yoki bog'lanishni uzadi (mebelcity_order_id=null) | Sheet «🔗 MebelCity buyurtma»: 2 ta tab — 📋 Ro'yxat / 📅 Kalendar, qidiruv maydoni (hash/nom/loyi |
| 7 | `template.apply` | Tanlangan shablondagi barcha etaplarni buyurtmaga QO'SHADI (views/stages | Etaplar tabi bo'sh bo'lganda «Shablon qo'llash» tugmasi → sheet «Shablon tanlang»: har shablon  |
| 8 | `template.save` | Etap shablonini yaratadi yoki yangilaydi | Sozlamalar ekranida «📋 Etap shablonlari» bo'limi + «➕ Yangi» |
| 9 | `template.delete` | Shablonni va uning barcha elementlarini (CASCADE) o'chiradi | Shablon ro'yxati qatoridagi 🗑 tugma + tasdiq («Shablonni o'chirasizmi?») |

**⚠️ Xavf:**

> PUL HARAKATI: YO'Q — bu blokda hech qanday to'lov, kirim/chiqim yaratilmaydi yoki o'zgartirilmaydi. Lekin 4 ta jiddiy nuqta bor:
> 1) 🔴 **HARD DELETE**: `stage.delete` — `stage.delete()`, DB dan butunlay o'chadi, soft-delete ham, tiklash ham YO'Q. Checklist bandlari (ClientOrderStageItem) CASCADE bilan o'chadi. Ilovada tasdiq dialogi MAJBURIY.
> 2) 🟡 **Moliya bog'lanishi uziladi**: ClientFinanceRecord.stage = SET_NULL — etap o'chirilsa chiqim yozuvlari YO'QOLMAYDI (pul saqlanadi), lekin qaysi etapga tegishli ekani ABADIY yo'qoladi. «Etap bo'yicha chiqim» hisoboti buziladi. Foydalanuvchini ogohlantirish tavsiya: «Bu etapga yozilgan chiqimlar saqlanadi, lekin etapga bog'lanishi yo'qoladi».
> 3) 🟡 **template.save = to'liq almashtirish**: tahrirlashda `tmpl.items.all().delete()` — eski elementlar o'chib, yangi ro'yxat yoziladi. Yarim to'ldirilgan forma yuborilsa shablon elementlari yo'qoladi.
> 4) 🟡

**Saytda qanday ko'rinadi:**

SAYTDA (rc-*.js, mini ERP redesign):  1) Buyurtma detali — `static/client_erp/js/redesign/rc-order-detail.js`. Tepada 5 ta tab: **Umumiy · Moliya · Etaplar · Fayllar · Jamoa** (tab almashish WS so'rov yubormaydi, `_tabContentHtml` lokal qayta chizadi).  2) **«Etaplar» tabi** (`_tabEtap`, rc-order-detail.js:2829): - Tepada (agar etap bor va canEdit) — «+ Yangi etap» keng tugma. - Har etap = karta: chapda etap rangidagi 6px vertikal chiziq, emoji + nom, o'ngda status badge (Bajarildi = acc rang / O'tkazildi = xira / Jarayonda = cyan). Tugallangan va o'tkazilganlar opacity .72. - Karta ichida: 👤 tayinlangan xodim, 💰 «Chiqim: X / estimated_cost», checklist bandlari (⬜/✅, faqat BELGILANMAGANini b


---

## 4-blok. Moliya

**Tavsif:** Mini ERP (client_erp) Moliya bloki — kassa kirim/chiqim yozuvlari, pul yechish (withdrawal), mijoz qarzlari (debitor), ustalar/do'kon qarzi (kreditor), takror yozuvlarni topish-hal qilish va buyurtma ichida kirim/chiqimni qaytarish. Hammasi bitta WebSocket consumer orqali (MiniERPConsumer, client_erp/consumers.py), dispatch: msg_type.replace('.','_') -> handle_<nom>. Javob konverti doim {type:'<nom>.result', request_id, ok, data, error}.

**Hajm:** Katta. Taxminan: Kotlin/Compose UI ~2200-2800 qator (Moliya ekrani + 5 sheet + dublikat ekrani + qarz kartalari + davr filtri), data/model qatlami (12 amal DTO + serialize_transaction/creditor/debt mo

### Amallar (13 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `finance.create` | Kassaga qo'lda Kirim yoki Chiqim yozuvi qo'shish (ClientFinanceRecord) | BottomSheet (dialog): Summa* (money-mask input), Kategoriya (faqat chiqimda — ikonkali chip-gri |
| 2 | `finance.revert` | Buyurtma ichidagi bitta kirim yoki chiqimni QAYTARISH — teskari belgili yangi yozuv yaratadi (kirim  | Buyurtma detali > Moliya tabidagi '↩ Kirim qaytarish' / '↩ Chiqim qaytarish' tugmasi — faqat ca |
| 3 | `finance.withdrawal` | Kassadan pul YECHISH — record_type='withdrawal' yozuv yaratadi | Moliya sahifasidagi 'Yechish' tugmasi -> BottomSheet: (a) agar last_profit_shares bor bo'lsa —  |
| 4 | `finance.duplicates` | Ehtimoliy TAKROR yozuvlar ro'yxatini olish | Moliya sahifasida ogohlantirish-karta (agar count>0): '⚠️ N ta shubhali takror yozuv · Ortiqcha |
| 5 | `finance.duplicate_resolve` | Takror yozuv bo'yicha foydalanuvchi qarori | Takror yozuvlar ekrani/sheet: har guruh karta — risk belgisi (🔴/🟡/⚪ + matn), summa, buyurtma no |
| 6 | `debt.create` | MIJOZ bizga qarzdor — muddatli (rasmiy) qarz yozuvi yaratish (ClientDebt) | Moliya > 'Dagovordan qolgan qarzlar' tabidagi 'Muddatli qarz yozish' tugmasi -> BottomSheet: mi |
| 7 | `debt.pay` | Mijoz qarzini to'lash — ClientDebtPayment yaratadi, ClientDebt | Qarz kartasidagi 'To'lash' tugmasi -> kichik sheet: faqat Summa* + 'To'lash' tugmasi |
| 8 | `supplierdebt.create` | USTALAR/DO'KON QARZI (kreditor) — BIZ kimga qarzdormiz (ClientSupplierDebt) | Moliya > '🧰 Ustalar qarzi' tabi > 'Qarz qo'shish' -> BottomSheet: Kimdan?* (matn), Turi (4 ta t |
| 9 | `supplierdebt.pay` | Ustalar/do'kon qarzini to'lash — paid oshiriladi; paid >= amount bo'lsa paid=amount va is_closed=Tru | Kreditor kartasidagi 'To'lash' -> kichik sheet: yuqorida 'Nom — qoldiq X so'm' matni + Summa* + |
| 10 | `supplierdebt.delete` | Ustalar/do'kon qarzi yozuvini BUTUNLAY o'chirish (hard delete,  | Kreditor kartasidagi ✕/🗑 tugmasi + MAJBURIY tasdiq dialogi ("<nom> — o'chirilsinmi?") |
| 11 | `standing.list` | 'Har doim ulashiladiganlar' (ClientStandingShare) ro'yxati + jamoalarning avto-ulashish sozlamalari | Buyurtma detali > Ruxsat modali ichidagi '🔁 Har doim ulashiladiganlar' bo'limi — har a'zo qator |
| 12 | `standing.update` | 'Har doim' yozuvni tahrirlash: rol va 3 ta ruxsat bayrog'i | Har a'zo qatorining ichida ochiladigan tahrir paneli: rol tanlash (dropdown: 👁 Ko'ruvchi / 🔨 Is |
| 13 | `standing.delete` | 'Har doim ulashish'ni to'xtatish — ClientStandingShare yozuvini butunlay o'chirish (hard delete) | A'zo qatoridagi ✕ tugma |

**⚠️ Xavf:**

> YUQORI — bu blok REAL PUL HARAKATI va MA'LUMOT O'CHIRISHNI o'z ichiga oladi.
> PUL HARAKATI:
> - finance.create — kassaga kirim/chiqim yozadi (balans o'zgaradi).
> - finance.withdrawal — kassadan pul yechadi. 'Barchasini yechish' tugmasi bitta tasdiqdan keyin N ta alohida WS so'rovini KETMA-KET yuboradi — tarmoq uzilsa qisman bajarilishi mumkin (ba'zilari o'tadi, ba'zilari yo'q), va sayt frontendi bu holatda xatoni umuman ko'rsatmaydi (callback'da ok tekshirilmaydi). Ilovada har qatorning natijasi alohida tekshirilishi SHART.
> - finance.revert — teskari moliyaviy yozuv yaratadi.
> - debt.pay / supplierdebt.pay — qarz qoldig'ini kamaytiradi.
> MA'LUMOT O'CHIRISH:
> - supplierdebt.delete — HARD DELETE (.delete()), qayta tiklab bo'lmaydi, javobda hatto error matni ham yo'q. Tasdiq dialogi MAJBURIY.
> - standing.delete — HARD DELETE. Sayt frontendida tasdiq YO'Q.
> - finance.duplicate_resolve action='delete'

**Saytda qanday ko'rinadi:**

SAYTDA (static/client_erp/js/redesign/rc-finance.js, ~2728 qator; sahifa marshruti #/finance, WS: page.finance + RcPeriod.query):  1) YUQORI QISM — davr filtri (RcPeriod: kun/hafta/oy/yil/oraliq + oy dropdown), KPI kartalari (stats: total_income, total_expense, profit, balance), Kassa bloki (opening/income/expense/withdrawal/closing), 'Sof foyda', 'WIP', '💰 Kutilayotgan foyda' (pending_profit), 'Sherikli hisob' kartalari. Bosilsa pastda 'fin-breakdown' paneli ochiladi. 2) DUBLIKAT SLOTI (#fin-dup-slot) — sahifa yuklangach finance.duplicates chaqiriladi; count>0 bo'lsa sariq ogohlantirish-karta: 'N ta shubhali takror yozuv · Ortiqcha X so'm · M tasi juda shubhali'. Bosilsa to'liq sheet. 3) TA


---

## 5-blok. Jamoa va foyda taqsimlash

**Tavsif:** Bu blok foydalanuvchiga jamoa yaratish, a'zolarni taklif qilish/qabul qilish, buyurtma bo'yicha ruxsat (ClientOrderPermission) berish/olib tashlash, yangi buyurtmalarni jamoaga avto-ulashish sozlamalari va foyda ulushini a'zo tomonidan qabul qilish/rad etish imkonini beradi. Shuningdek "ustalar ro'yxati" (ClientProfitPerson) — foyda taqsimotida ishlatiladigan erkin ism-ro'yxatini boshqaradi. MUHIM: so'ralgan `team.delete_team` amali kodda UMUMAN YO'Q — haqiqiy handler `team.delete_template` (handle_team_delete_template, consumers.py:3997) va u foyda SHABLONINI o'chiradi, jamoani emas; jamoani o'chirish funksiyasi butun loyihada mavjud emas (faqat `team.leave` — a'zo o'zi chiqadi).

**Hajm:** O'rta-katta. Taxminan 2200-2900 qator Kotlin/Compose: TeamScreen (5 tab, a'zo/shablon/buyurtma/a'zo-jamolar kartalari) ~900; PermissionSheet (qidiruv+rol+toggle+standing ro'yxati) ~450; AutoShareCard 

### Amallar (13 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `team.create` | Yangi jamoa yaratadi va yaratuvchini owner roli bilan a'zo qilib qo'shadi (profit_percent=35 qat'iy  | Dialog (bottom sheet) |
| 2 | `team.accept` | Kirgan jamoa taklifini QABUL qiladi: ClientTeamMember | Alohida ekran KERAK EMAS |
| 3 | `team.decline` | Jamoa taklifini RAD etadi | Dashboard kartasidagi 'Rad etish' tugmasi (accept bilan yonma-yon) |
| 4 | `team.delete_team — KODDA YO'Q` | ⚠️ `team | Jamoa ekrani → 'Foyda shabloni' tab → har shablon kartasida 🗑 tugmasi → tasdiq dialogi ("Foyda  |
| 5 | `team.autoshare_get` | Owner egalik qilgan jamoalarning avto-ulashish sozlamalarini va faol a'zolar ro'yxatini o'qiydi | Alohida ekran emas — ikki joyda karta sifatida: (1) Jamoa ekrani → 'Sozlamalar' tab → '🔁 Yangi  |
| 6 | `team.autoshare_set` | Jamoaning avto-ulashish bayrog'i va auto_* ruxsatlarini saqlaydi | Yuqoridagi avto-ulashish kartasi + 'Saqlash' tugmasi |
| 7 | `profit.accept` | Foyda ulushini a'zo QABUL QILADI yoki RAD ETADI | Alohida ekran emas — Moliya ekranidagi kutish kartasi: summa + zakaz nomi + 2 tugma '✅ Qabul qi |
| 8 | `profit.people.add` | Foyda taqsimoti uchun 'usta' ismini ro'yxatga qo'shadi | Moliya ekrani → 'Ustalar foydasi' paneli → "USTALAR RO'YXATI" bloki → '+ Usta qo'shish' tugmasi |
| 9 | `profit.people.list` | Akkauntning usta ro'yxatini qaytaradi | Alohida ekran emas — Moliya ichidagi ro'yxat bloki: FAOL qismi (har qatorda ism + ✏️ tahrir + 🗑 |
| 10 | `profit.people.delete` | Ustani butunlay o'chiradi | Usta qatoridagi 🗑 tugmasi + tasdiq dialogi |
| 11 | `profit.people.archive` | Ustani arxivga olish yoki arxivdan TIKLASH | Arxiv ro'yxatidagi ↩︎ ('Ro'yxatga qaytarish') tugmasi — saytda faqat restore:true varianti chaq |
| 12 | `perm.save` | Bitta buyurtma uchun bitta foydalanuvchiga ruxsat beradi/yangilaydi (ClientOrderPermission update_or | Dialog/sheet: "A'zo qo'shish / Ruxsat" — 2 segment ('👤 Shaxs' / '👥 Jamoa'); Shaxs tomonida: use |
| 13 | `perm.delete` | Buyurtma ruxsatini butunlay o'chiradi (ClientOrderPermission | Buyurtma detali → 'Jamoa' tab → ruxsat kartasidagi 🗑/✕ tugmasi + tasdiq dialogi ("Ruxsatni olib |

**⚠️ Xavf:**

> YUQORI — bu blokda HAM real pul harakati, HAM qaytarilmas o'chirish bor.
> 1) PUL HARAKATI — profit.accept (consumers.py:4357). accept=true bo'lsa a'zoning hisobiga ClientFinanceRecord(record_type='income', amount=line.amount, order=None) YOZILADI; accept=false bo'lsa egaga teskari kirim (is_reversal=True) yoziladi. Ya'ni ilovadagi bitta tugma bosish real kassa raqamini o'zgartiradi. Ehtiyot choralari: (a) har ikki tugmada tasdiq dialogi (hozir saytda faqat 'Olmadim' da bor — 'Qabul' tasdiqsiz), (b) double-tap bloki majburiy (busy flag + disabled + spinner) — saytdagi kabi, (c) timeout 30 sek, timeout da AVTOMATIK QAYTA YUBORMASLIK (idempotentlik faqat confirmed flag bilan, client_request_id profit.accept da YO'Q), (d) tarmoq uzilganda 'holat noma'lum' deb ko'rsatish va Moliyani qayta yuklash.
> 2) O'CHIRISH — 3 ta joyda:
>   • team.decline — ClientTeamMember...filter(status='invited').delete(

**Saytda qanday ko'rinadi:**

SAYTDA (Mini ERP redesign SPA, rc-*.js):  A) /team sahifasi — RcTeam (static/client_erp/js/redesign/rc-misc.js:1512-1830). WS: page.team → {team{id,name,description,is_owner,members[],invitations[]}, team_orders[], profit_templates[], member_teams[]}.   • Jamoa yo'q holat: bo'sh ekran '👥 Jamoa yaratilmagan' + 'Jamoa yaratish' tugmasi.   • Bor holat: sarlavha '👥 <nom>' + o'ng tomonda '👤+ Taklif' tugmasi, ostida "<N> a'zo".   • 5 TAB (RcTeam.TABS): ["A'zolar"] ["📦 Buyurtmalar" +son] ["Foyda shabloni"] ["Sozlamalar"] ["A'zo jamolar" +son]. Tab almashtirish page.team ni QAYTA so'raydi (RcTeam.render()).     1) A'zolar: yuqorida "Foyda taqsimoti" kartasi — jami % va "Qolgan %" (100% oshsa qizil '


---

## 6-blok. Fayllar, vizualizatsiya, zamer

**Tavsif:** Bu blok mijoz/usta ilovasining "media va o'lchov" qismi: buyurtmaga biriktirilgan fayllarni o'chirish, 360° VR galereyalar (yuklangan panorama yoki tashqi ShapeSpark havolasi) ro'yxati va ularni tahrirlash/o'chirish/buyurtmaga bog'lash, 3D zamerlarni buyurtmaga bog'lash, Portfolio (barcha buyurtmalardagi rasmlar galereyasi) va Bluetooth lazer-ruletka ko'prigi (Telegram WebView'da Web Bluetooth yo'qligi sababli o'lchov Chrome'dagi alohida sahifadan WS orqali ilovaga uzatiladi). Fayl yuklashning O'ZI WS emas — REST (/mini/api/file-upload/, /mini/api/chunk-upload/, /mini/api/link-add/), WS'da faqat o'chirish bor.

**Hajm:** O'rta. Android tomonda taxminan 1800-2400 qator Kotlin/Compose: • VizualizatsiyaScreen (grid + 4 holat kartochka + 5s repoll + rename/delete dialoglar + link-add sheet) ~500 qator • ZamerlarScreen (gr

### Amallar (10 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `file.delete` | Buyurtmaga biriktirilgan faylni (rasm/video/hujjat/havola) BUTUNLAY o'chiradi — DB yozuvi, disk fayl | Yangi ekran EMAS |
| 2 | `viz.rename` | Mijozning O'ZI mini-ERP orqali yaratgan 360° galereya nomini tahrirlaydi | Dialog (matn kiritish) |
| 3 | `viz.delete` | Mijozning O'ZI yaratgan 360° galereyani va uning ICHIDAGI BARCHA panorama yozuvlarini o'chiradi (g | Tasdiq dialogi MAJBURIY (qaytarib bo'lmaydi) |
| 4 | `panorama.link` | Mavjud 360° galereyani ClientOrder (mijoz buyurtmasi) ga bog'laydi yoki bog'lanishni uzadi | Bottom-sheet 'Buyurtmaga bog'lash' — saytdagi RcLink komponenti: qidiruv maydoni + buyurtmalar  |
| 5 | `panorama.link_add` | Tashqi VR/3D havolani (masalan ShapeSpark) vizualizatsiya ro'yxatiga qo'shish — haqiqiy panorama fay | Bottom-sheet '🔗 VR havola qo'shish': 2 ta input (Nomi — masalan 'VR 3D model'; Havola — https:/ |
| 6 | `zamer.link` | 3D zamerni (manfacturing | Aynan panorama |
| 7 | `lazer.link` | Bluetooth lazer-ruletka uchun TASHQI BRAUZERDA ochiladigan imzolangan havola oladi | Tugma — 'Qurilmaga ulanish' / 'Lazerni ulash' |
| 8 | `ble.push` | Lazer-ruletkadan olingan o'lchovni (mm) foydalanuvchining WS guruhiga uzatadi — barcha ochiq oynalar | PUSH QABUL QILISH ekrani kerak: WS'dan kelgan 'ble |
| 9 | `portfolio.view` | Portfolio'dagi rasm ochilganini qayd qiladi — 'Katalogdan mahsulot ko'r' kunlik topshirig'i (gamific | Ekran EMAS — fon chaqiruvi |
| 10 | `page.portfolio` | Portfolio ekrani ma'lumoti — foydalanuvchi EGASI bo'lgan barcha buyurtmalarga yuklangan RASMLAR gale | Alohida ekran '/portfolio' — '🖼️ Portfolio' sarlavhasi, 2 ustunli grid (aspect-ratio 1:1 rasm + |

**⚠️ Xavf:**

> 🔴 YUQORI — MA'LUMOT O'CHIRISH BOR, PUL HARAKATI YO'Q.
> Pul: bu blokda moliyaviy amal YO'Q (to'lov, qarz, narx o'zgarishi yo'q). Faqat bilvosita: 360° VR AI generatsiyasi (REST /mini/api/panorama-generate/, PanoPulse/Fal) pulli provayder — lekin u bu blokdagi WS amallari ro'yxatiga kirmaydi.
> Qaytarib bo'lmaydigan o'chirish — 2 ta:
> 1. file.delete — DB yozuvi + DISK fayli + thumbnail fayli o'chadi (f.file.delete(save=False)). Qayta tiklash IMKONSIZ, backup yo'q, "hide" emas — HAQIQIY o'chirish. Usta mijozning yagona chizmasi/o'lchov rasmini bosib yuborsa — yo'qoladi.
> 2. viz.delete — galereya + ICHIDAGI BARCHA panorama yozuvlari (g.panoramas.all().delete()). Qaytarib bo'lmaydi.
> ⚠️ XAVFSIZLIK KAMCHILIGI (kodda TASDIQLANGAN, TUZATILMAGAN — faqat xabar beraman, tegmadim):
> • file.delete (consumers.py:1900) — HECH QANDAY ruxsat tekshiruvi yo'q. order.owner ham, ClientOrderPermission ham tekshirilm

**Saytda qanday ko'rinadi:**

SAYTDA (usta.bittada.uz mini-ERP SPA, redesign) bu blok 3 ta ALOHIDA ekran + buyurtma detali ichidagi fayl bo'limi sifatida ko'rinadi:  1) /vizualizatsiya — RcVizual (static/client_erp/js/redesign/rc-misc.js:618-797).    • Sarlavha '🌐 Vizualizatsiya', o'ngda 2 tugma: [🔗 Havola] (ghost) va [+ Yuklash] (asosiy).    • 2 ustunli grid, har kartochka: kvadrat (aspect-ratio:1) thumbnail + burchakda badge.    • 4 xil kartochka holati: (a) NORMAL — panorama thumbnail rasmi + ko'k '360°' badge; (b) HAVOLA (is_link) — VR-cardboard ikonkasi lavanda fonda + '🔗 Havola' badge; (c) PENDING — skeleton doira + 'Yaratilmoqda...' (AI panorama generatsiyasi ketmoqda, bosib bo'lmaydi, kursor default); (d) thumbna


---

## 7-blok. Eslatma, bildirishnoma

**Tavsif:** Buyurtma ichidagi matnli eslatmalar (CRUD), Bosh sahifadagi o'qilmagan ilova-ichi bildirishnomalar (o'qildi belgilash), birinchi kirishdagi oferta+ism onboarding modali, hamda 3 ta yordamchi amal: «Kutilmoqda» kartasi detali, USD kursi, do'stga ulash topshirig'i. Handlerlar /home/user/mebelcity_platform/client_erp/consumers.py da, serializerlar /home/user/mebelcity_platform/client_erp/serializers.py da.

**Hajm:** O'RTA. Taxminiy hajm (Kotlin/Compose, mavjud app/src/main/java/com/bittada/bittadausta tuzilishiga mos): Onboarding ekrani/modali ~250 qator; Bildirishnoma kartalari + bosilish mantig'i (link parsing,

### Amallar (8 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `note.create` | Buyurtmaga yangi matnli eslatma qo'shadi (ClientOrderNote) | Yangi ekran EMAS |
| 2 | `note.update` | Mavjud eslatma matnini o'zgartiradi | Dialog (BottomSheet) — «Eslatmani tahrirlash»: mavjud matn bilan to'ldirilgan TextField + «Saql |
| 3 | `note.delete` | Eslatmani BUTUNLAY o'chiradi (DB dan hard delete, soft-delete YO'Q) | Buyurtma detalidagi har eslatma qatoridagi 🗑 (trash) tugmasi → tasdiq dialogi («O'chirish» / «E |
| 4 | `notification.read` | Ilova-ichi bildirishnomani (ClientNotification, channel='in_app') «o'qildi» deb belgilaydi — bittasi | Yangi ekran EMAS — Bosh sahifa (Dashboard) ro'yxatidagi bildirishnoma kartalari |
| 5 | `onboarding.accept` | Birinchi kirishda ommaviy oferta/foydalanish shartlari/maxfiylik siyosatini qabul qilish + Ism Famil | Yangi TO'LIQ EKRAN yoki modal dialog (saytda: dismiss qilib bo'lmaydigan, pastdan chiquvchi to' |
| 6 | `dashboard.pending_detail` | Bosh sahifadagi «💰 Kutilmoqda» (pending_profit) kartasi bosilganda — qaysi buyurtma(lar)dan qancha u | Dialog/BottomSheet «👥 Sheriklikdagi foyda» |
| 7 | `rate.get` | Joriy USD→UZS kursini qaytaradi — pul kiritish maydonlari ostida «≈ $X» ko'rsatkichi uchun | Alohida ekran EMAS |
| 8 | `referral.share` | «Do'stingga ulash» KUNLIK TOPSHIRIG'I progressini oshiradi (gamifikatsiya) | Alohida ekran EMAS |

**⚠️ Xavf:**

> YUQORI — ikki xil xavf bor:
> 1) ⚠️ MA'LUMOT O'CHIRISH BOR: `note.delete` (consumers.py:1882) ClientOrderNote yozuvini DB dan BUTUNLAY o'chiradi — soft-delete yo'q, tiklash imkoni yo'q, timeline/audit izi qoldirilmaydi. Qo'shimcha: handler o'chirish muvaffaqiyatsiz bo'lsa ham (yozuv topilmasa) HAR DOIM {ok:true} qaytaradi — ilova ishonch bilan «o'chdi» deb ko'rsatmasligi, reload qilib tekshirishi kerak.
> 2) 🔴 RUXSAT BO'SHLIG'I (kodda TASDIQLANGAN, tuzatilmagan): note.create / note.update / note.delete uchtasida ham HECH QANDAY ruxsat tekshiruvi yo'q — na owner_id, na ClientOrderPermission, na ClientOrderShare. Faqat autentifikatsiya bor. Ya'ni shu tenant ichidagi istalgan foydalanuvchi istalgan `order_id` ga eslatma yozishi, istalgan `note_id` ni tahrirlashi va o'chirishi mumkin. Hozirgi yagona to'siq — FRONTEND (rc-order-detail.js:2591 `mine = d.is_owner || n.created_by_id === meId` bayrog

**Saytda qanday ko'rinadi:**

SAYTDA (SPA, /mini/<username>/, template/client_erp/spa_redesign.html + static/client_erp/js/redesign/):  1) ONBOARDING — spa_redesign.html:120-166 dagi inline IIFE. Alohida sahifa emas: `__USER_DATA__.oferta_accepted == false` bo'lsa sahifa ustiga fixed overlay (rgba(0,0,0,.62) + blur(6px), z-index 9999) qo'yiladi, ichida pastdan chiquvchi sheet (border-radius 24px 24px 0 0, max-width 480px, rc-sheetup animatsiya). Tarkibi: 👋 + «Xush kelibsiz!» + Ism Familiya inputi + oferta/terms/privacy havolali checkbox + bitta katta tugma. Tugma disabled, faollashadi checkbox+ism(>=2) bo'lganda. Yopish tugmasi YO'Q. Muvaffaqiyat → overlay remove + Toast.  2) BILDIRISHNOMALAR — alohida tab/ekran YO'Q. Bo


---

## 8-blok. Laylo AI

**Tavsif:** Bu blok Bittada Usta (client_erp) ichidagi 3 ta MUSTAQIL AI yo'lini qamraydi: (1) Laylo AI — Claude + MCP tool'lar bilan ishlaydigan chat popup (matn/ovoz/TTS, ruxsatga qarab tool filtri, VA HAQIQIY yozuv amallari — pul yozuvi yaratadi); (2) `ai.chat` — arzon provayder-zanjiri asosidagi matnli yordamchi, faqat TAKLIF qiladi (`action`), o'zi bajarmaydi; (3) `analytics.ai` / `analytics.ai_history` — Analitika sahifasidagi 50-tangalik AI biznes tahlili (stream orqali) va tarixi; `glive.start` esa Gemini Live uchun ephemeral token beradi (lekin hozirgi sayt frontendi buni ISHLATMAYDI — alohida `/ws/mini/<user>/glive/` proxy consumer orqali boradi).

**Hajm:** O'rta-katta. Taxminan 2200-2800 qator Kotlin/Compose: - Laylo chat ekrani + HTML render + audio yozish/ijro: ~700 qator - ai.chat chat paneli + action tasdiq bloki + usage qatori: ~500 qator - Analiti

### Amallar (7 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `laylo.chat` | Laylo AI bilan suhbat | Chat ekrani/BottomSheet (saytda FAB -> popup) |
| 2 | `laylo.tts` | Tayyor matnni ovozga aylantirish (Yandex SpeechKit TTS, ovoz settings | Alohida ekran KERAK EMAS |
| 3 | `laylo.permissions` | Joriy foydalanuvchining AI ruxsatlari ro'yxatini olish | Ekran kerak emas |
| 4 | `ai.chat` | ARZON matnli AI yordamchi (Laylo'dan ALOHIDA yo'l, client_erp/services/ai_chat | Chat ekrani/panel (saytda ✨ FAB -> 'AI yordamchi' oynasi) |
| 5 | `analytics.ai` | Analitika sahifasidagi «AI Biznes Tahlil» — davr ma'lumotlari (serialize_analytics) asosida Claude/p | Analitika ekranida 'AI Biznes Tahlil' kartasi: [✨ Tahlil 50🪙] tugmasi, bosilganda progress ('La |
| 6 | `analytics.ai_history` | Oxirgi 10 ta saqlangan AI tahlilni qaytaradi (ClientAIAnalysis, created_at bo'yicha kamayish tartibi | 'Oldingi tahlillar' yig'iladigan (collapsible) ro'yxat: har qator — '🤖 Oy tahlili', sana · N bo |
| 7 | `glive.start` | Gemini Live (real-time ovozli boshqaruv) uchun QISQA MUDDATLI (ephemeral) token beradi — GEMINI_API_ | Ovozli rejim ekrani/overlay |

**⚠️ Xavf:**

> XAVF DARAJASI: YUQORI (faqat Laylo tomonida). Aniq topilganlar:
> 1) PUL HARAKATI — HA, Laylo AI HAQIQIY moliyaviy yozuv YARATADI. voicebot/mcp_tools/client_erp.py da yozuvchi tool'lar bor: `client_finance_add` (ClientFinanceRecord — kirim/chiqim yaratadi, saqlaydi), `client_order_payment` (buyurtmaga to'lov yozuvi + timeline), `client_add_customer` (yangi mijoz), `client_complete_stages` (etapni tugatgan deb belgilaydi). Bular client fallback ruxsatlarida (finance.write, orders.write, clients.write) STANDART OCHIQ. Ya'ni foydalanuvchi Laylo'ga "150 ming kirim yoz" desa — TASDIQSIZ, darhol yoziladi. Ilovada shu yo'l ochilsa, har bir yozuvchi tool uchun MAJBURIY tasdiq oynasi qo'yilishi kerak (hozir saytda ham yo'q).
> 2) `ai.chat` tomonida pul harakati YO'Q — server hech narsa bajarmaydi, faqat `action` taklif qiladi va bajarish foydalanuvchi "✅ Ha, bajar" bosgandan keyin frontendda bo'ladi.

**Saytda qanday ko'rinadi:**

Saytda bu blok UCHTA joyda ko'rinadi, alohida ekran yo'q — hammasi mavjud sahifalar ustidagi suzuvchi element yoki karta.  1) LAYLO POPUP (static/client_erp/js/components/laylo-popup.js, eski v1 shell):    O'ng pastda dumaloq FAB (#laylo-fab, robot ikonkasi). Bosilganda popup ochiladi:    - Header: robot avatar + "Laylo AI" + holat qatori (nuqta + Tayyor/o'ylayapti/yozmoqda/gapirmoqda), o'ngda 🔊 TTS toggle va ✕ yopish.    - Chat maydoni: salomlashuv xabari, keyin user/bot xabarlari; bot xabari HTML sifatida render qilinadi, ostida tool badge'lari (⚙️ tool nomi).    - Quick-actions qatori: laylo.permissions natijasiga qarab 2-4 ta tugma (Buyurtmalarim / Qarz holati / Moliya / Mahsulotlar). Bi


---

## 9-blok. Katalog, tanga, to'lov, Oldi-Berdi

**Tavsif:** Bu blok ustaning MebelCity bilan pul munosabati (Oldi-Berdi: sotuv/qaytarish/qarz/to'lov faqat-o'qish), fabrika buyurtmalari ro'yxati (page.mebelcity), mahsulot vitrinasi (page.catalog — Top-50 eng ko'p sotilgan mahsulot, faqat-o'qish) va SaaS monetizatsiyasi (tanga hamyoni + Payme orqali REAL to'lov: pay.start/pay.status/pay.sandbox_confirm) dan iborat. Barcha handlerlar /home/user/mebelcity_platform/client_erp/consumers.py (MiniERPConsumer) ichida, serializerlar /home/user/mebelcity_platform/client_erp/serializers.py da.

**Hajm:** O'RTA-KATTA. Taxminan 2600-3400 qator Kotlin/Compose (mavjud ilova umumiy 5402 qator — bu blok uni ~60% kattalashtiradi). Taqsimot: OldiBerdiScreen + tafsilot dialogi ~900-1100 qator (4 tab, 4 xil kar

### Amallar (10 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `page.catalog` | Mahsulotlar vitrinasi: katta ERP katalogidan eng ko'p sotilgan/trend mahsulotlar (ClientFeaturedProd | YANGI ekran EMAS — saytda bu bottom-sheet (RcSheet, '🛍️ Top mahsulotlar') |
| 2 | `catalog.view` | Vitrina mahsulotini ochganini serverga xabar qilish — 'Katalogdan mahsulot ko'r' kunlik topshirig'i  | UI kerak EMAS — bu fon (fire-and-forget) so'rov |
| 3 | `page.tanga` | Tanga hamyoni sahifasi: joriy tanga balansi + sotib olish uchun tanga paketlari (CoinPack) + oxirgi  | YANGI ekran (WalletScreen, marshrut '/tanga') |
| 4 | `pay.start` | To'lov boshlash — ClientPayment yozuvi yaratiladi (status='created'→'pending') va provayderdan check | Ekran EMAS — dialog/oqim (saytda RcPay helperi, rc-pay |
| 5 | `pay.status` | To'lov holatini tekshirish (polling) | UI ekrani kerak EMAS — fon polling |
| 6 | `pay.sandbox_confirm` | Sandbox (test) to'lovini qo'lda tasdiqlash — REAL PUL YO'Q, faqat sinov uchun | Ilovada bu ekran KERAK EMAS (prod'da o'chiq) |
| 7 | `page.oldi_berdi` | Oldi-Berdi (MebelCity bilan hisob-kitob) sahifasi — FAQAT O'QISH | YANGI ekran (OldiBerdiScreen, marshrut '/oldi-berdi', pastki menyuda 'Oldi-Berdi' 🔁 ikoni) |
| 8 | `oldi.berdi_detail` | Bitta sotuv tafsiloti — «nima uchun va NEGA qarz bo'lgan» | Dialog (markazda ochiladigan modal, saytda 2026-08-25 dan bottom-sheet emas markaziy modal) |
| 9 | `oldi.berdi_load_more` | Oldi-Berdi ro'yxatini sahifalab davom ettirish ('Ko'proq yuklash') | Alohida ekran EMAS |
| 10 | `page.mebelcity` | MebelCity fabrika buyurtmalari ro'yxati — ustaning telefoni VA firma nomiga bog'langan barcha ERP bu | YANGI ekran (MebelcityScreen, marshrut '/mebelcity', menyuda '🏭 MebelCity buyurtmalar') |

**⚠️ Xavf:**

> YUQORI XAVF — bu blokda REAL PUL HARAKATI BOR:
> 1) pay.start — prod .env da BILLING_LIVE=1, ya'ni Payme'ning HAQIQIY merchant kassasiga invoice yuboriladi va foydalanuvchi kartasidan REAL pul yechiladi. Bu sinov uchun ishlatilmasin (xotira qoidasi: 'Real pul=sinov emas'). Test faqat BILLING_LIVE=0 muhitda.
> 2) pay.status — nomi 'status' bo'lsa ham FAQAT O'QIMAYDI: service.poll_status() → Payme receipts.check → to'langan bo'lsa confirm() → _fulfill() balansga tanga qo'shadi / tarif tayinlaydi. Ya'ni polling DB ni o'zgartiradi. Yaxshi tomoni: idempotent (fulfilled tekshiruvi + select_for_update lock), shuning uchun agressiv polling dublikat grant bermaydi. Lekin Android'da bir nechta parallel polling coroutine ochilmasin — bittasi bilan cheklang.
> 3) pay.sandbox_confirm — prod'da O'CHIQ (PAYMENTS_SANDBOX=0 va BILLING_LIVE=1), \"Sandbox tasdiq o'chirilgan\" qaytaradi. Release build'da bu kod y

**Saytda qanday ko'rinadi:**

Saytda (usta.bittada.uz, client_erp SPA — hash-marshrutli, redesign-app.js) bu blok TO'RT joyda ko'rinadi:  1) KATALOG — alohida sahifa EMAS. Bosh sahifadagi (Dashboard) kunlik topshiriqlar ro'yxatida 'Katalogdan mahsulot ko'r' qatori bosilganda ochiladigan bottom-sheet (RcSheet, sarlavha '🛍️ Top mahsulotlar'). Kod: rc-dashboard.js:88 → RcCatalog.open() (rc-misc.js:865). Sheet ichida: qidiruv input → gorizontal kategoriya chiplari ('Barchasi (N)' + har kategoriya soni) → kategoriya bo'yicha guruhlangan 2 ustunli grid kartalar (kvadrat rasm + '🔥 Ko'p sotilgan' / 'Bor'/'Yo'q' badgelar + nom + narx/birlik). Max balandlik 56vh, ichida scroll. Menyuda bu bo'lim YO'Q.  2) TANGA — to'liq sahifa #/t


---

## 10-blok. Sozlamalar

**Tavsif:** Mini ERP «Sozlamalar» sahifasining 3 ta kichik bloki: (1) foydalanuvchi o'z chiqim kategoriyalarini qo'shadi/o'chiradi — ular ClientUser.expense_categories JSON maydonida saqlanadi va Moliya «Chiqim qo'shish» oynasida karta bo'lib chiqadi; (2) interfeys tilini (uz/ru/en) serverga saqlaydi; (3) «Admin bilan bog'lanish» — matn Telegram admin guruhiga yuboriladi. Hammasi FAQAT o'z akkaunti doirasida ishlaydi (self.user), pul harakati yo'q.

**Hajm:** Kichik–o'rta. Kotlin/Compose: SettingsScreen.kt ga 3 ta yangi SectionCard (~250-300 qator) + kategoriya qo'shish BottomSheet (emoji grid + rang tanlash, ~150 qator) + tasdiq dialogi (~40) + WS model/d

### Amallar (4 ta)

| # | WS amali | Nima qiladi | Ilovada UI |
|---|---|---|---|
| 1 | `settings.expense_cat_add` | Foydalanuvchi o'zining yangi chiqim kategoriyasini qo'shadi (built-in 6 tadan tashqari) | Sozlamalar ekranidagi «🏷 Chiqim kategoriyalari» kartasi + o'ng yuqoridagi «+ Yangi» tugmasi → B |
| 2 | `settings.expense_cat_delete` | Foydalanuvchi O'ZI qo'shgan chiqim kategoriyasini o'chiradi | Chip ro'yxatidagi custom kategoriya chipining o'ng chetidagi × belgisi (built-in chiplarda × KO |
| 3 | `settings.contact_admin` | «Admin bilan bog'lanish» — foydalanuvchi matnini Telegram admin guruhiga yuboradi | Sozlamalar ekranida «🆘 Admin bilan bog'lanish» kartasi: tavsif matni («Savol yoki muammo bo'lsa |
| 4 | `user.set_language` | Interfeys tilini SERVER tomonda saqlaydi (ClientUser | Sozlamalar ekranida «🌐 Til» kartasi: 3 ta yonma-yon tugma (bayroq + til nomi, min kenglik ~96dp |

**⚠️ Xavf:**

> PUL HARAKATI YO'Q — bu 4 ta amalning hech biri summa yozmaydi, o'zgartirmaydi yoki hamyonga tegmaydi.
> MA'LUMOT O'CHIRISH: BOR, lekin YENGIL — settings.expense_cat_delete ClientUser.expense_categories JSON ro'yxatidan bitta elementni o'chiradi. Moliya YOZUVLARI (ClientFinanceRecord) o'chirilMAYDI va tegilMAYDI. Qaytarish (undo) YO'Q — o'chirilgan kategoriyani qayta qo'shsa, key boshqacha bo'lishi mumkin (c-ijara → c-ijara-2), shuning uchun eski yozuvlar yangi kategoriyaga bog'lanmaydi.
> Kodda ko'rilgan aniq xavflar/kamchiliklar (taxmin emas):
> 1. expense_cat_delete da key umuman validatsiya qilinmaydi — key yuborilmasa ham {ok:true} qaytadi (jim muvaffaqiyatsizlik). Ilovada foydalanuvchiga «o'chdi» deb ko'rsatib, aslida hech nima o'chmasligi mumkin — javobdagi categories ro'yxatini solishtirib tekshirish kerak.
> 2. O'chirilgan kategoriya key i eski ClientFinanceRecord.category da qolib ketad

**Saytda qanday ko'rinadi:**

Saytda bu blok ALOHIDA ekran emas — bitta uzun «Sozlamalar» sahifasining (#/settings, RC_PAGES['/settings'], fayl static/client_erp/js/redesign/rc-settings.js, 512 qator) kartalaridan iborat. Tab YO'Q — hamma narsa vertikal scroll kartalar.  Sahifa ochilishi: WS 'page.settings' {} → serialize_user(user) qaytadi (consumers.py:2188), ichida expense_categories ham bor; keyin WS 'template.list' → shundan so'ng HTML quriladi.  Kartalar TARTIBI (yuqoridan pastga, rc-settings.js template()): 1. Profil kartasi — avatar/VIP ikon, ism, @username, chiplar (👑 VIP, ⭐ XP, 🪙 tanga, 🔥 streak), telefon, tashkilot. 2. 🌐 TIL — 3 ta tugma (I18n.LANGS: bayroq + nom), tanlangani accent. → user.set_language. Tagid

---

## 4. Ish tartibi (taklif)

Bloklar bir-biriga bog'liq, shuning uchun tartib muhim:

| Navbat | Blok | Nega shu tartibda |
|---|---|---|
| 1 | **Mijozlar** (1) | Buyurtma mijozsiz yaratilmaydi — asos |
| 2 | **Buyurtma to'liq** (2) | Kundalik ish shu yerda; chiqim eng ko'p so'raladigan funksiya |
| 3 | **Etaplar** (3) | Buyurtma ichida, 2-blokdan keyin mantiqiy |
| 4 | **Moliya** (4) | Katta, pul bilan — ehtiyot bilan, alohida sinov |
| 5 | **Eslatma + Sozlamalar** (7, 10) | Kichik, tez tugaydi, boshqa bloklarga yordam beradi |
| 6 | **Fayl, vizualizatsiya** (6) | Mustaqil |
| 7 | **Jamoa va foyda** (5) | Pul bilan, murakkab ruxsat mantiqi |
| 8 | **Katalog, tanga, to'lov** (9) | Real to'lov — oxirida, sinov muhitida |
| 9 | **Laylo AI** (8) | Eng murakkab, AI pul yozadi |

---

## 5. Tasdiqlash uchun savollar

TZ ni boshlashdan oldin quyidagilar aniq bo'lishi kerak:

1. **Tartib to'g'rimi?** Yuqoridagi 9 navbat sizga mos keladimi yoki boshqa tartib kerakmi?
2. **Laylo AI kerakmi?** U eng murakkab blok (~2500 qator) va AI real moliyaviy yozuv yaratadi. Hozir kerakmi yoki keyinga qoldiramizmi?
3. **To'lov (Payme) kerakmi?** Ilovada to'lov bo'lsa, Google Play o'z komissiyasini talab qilishi mumkin (raqamli tovar bo'lsa). Buni tekshirish kerak.
4. **Sinov akkaunti** — pul amallarini sinash uchun alohida akkaunt kerak. Sizniki bilan sinamaymiz.
5. **Har blokdan keyin APK** — shunday qilamizmi yoki 2-3 blokdan keyin?

---

## 6. Nima QILINMAYDI

- **Server kodi o'zgartirilmaydi** — Django, consumers.py, serializers.py tegilmaydi
- **`/yangi` sahifasi** — amaldagi qoida bo'yicha tegilmaydi
- **Moliya/buyurtma ma'lumotlari** — hech qanday sinov yozuvi yaratilmaydi
- **Media fayllar xavfsizligi** — alohida masala, alohida ruxsat kerak
  (156 fayl auth'siz ochiq — 2026-09-12 topilgan, TUZATILMAGAN)

---

*TZ 10 ta tadqiqot agenti tomonidan server kodi, serializerlar va sayt
frontendini to'g'ridan-to'g'ri o'qib tuzildi. Har bir amal uchun
so'rov/javob maydonlari, ruxsat shartlari va xavflar tekshirilgan.*
