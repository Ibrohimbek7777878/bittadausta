# TZ — Android ilova ↔ Desktop sayt to'liq paritet

**Sana:** 2026-09-14
**Maqsad:** Bittada Usta Android ilovasi desktop sayt (usta.bittada.uz)
bilan **harf-baharf bir xil** bo'lishi — hech bir funksiya, tugma, maydon
qolib ketmasin.

**Metod:** har bir desktop sahifa (`static/client_erp/js/redesign/*.js`)
o'qildi, undagi har bir `WS.send(...)` chaqiruvi (amal) va har bir UI
elementi (tugma, dialog, maydon) ro'yxatga olindi. Android'dagi mos ekran
bilan solishtirildi. Belgilar:

- ✅ — bor va ishlaydi
- ⚠️ — bor, lekin to'liq emas (chala)
- ❌ — umuman yo'q
- ⏸ — foydalanuvchi ataylab PAUZA qilgan (Bazis/SketchUp eksport)

---

## 0. UMUMIY HOLAT (bu safar tekshirilganda topilgan)

**Muhim tan olish:** oldingi "26/29 amal tayyor" hisobotim **noto'g'ri
metrikaga** asoslangan edi — men faqat backendda metod BORLIGINI
tekshirgandim, lekin UI'da haqiqatan CHAQIRILAYOTGANINI har doim
tekshirmagandim. Natijada ko'p joyda "backend bor, UI yo'q" holati
qolib ketgan. Bu TZ shu xatoni tuzatish uchun — endi HAR BIR AMAL uchun
UI'da chaqirilish joyi ANIQ ko'rsatiladi.

---

## 1. BUYURTMA DETALI (`/orders/:id` — eng katta, 3165 qator desktop)

Desktop amallar (`rc-order-detail.js`) va Android holati:

| # | Amal | Desktop funksiyasi | Android holati |
|---|---|---|---|
| 1 | `page.order` | Sahifani yuklash | ✅ `openOrder()` |
| 2 | `order.update` | Sarlavha/tavsif tahrirlash | ❓ tekshirish kerak |
| 3 | `order.delete` | Savatga o'chirish (sabab bilan) | ❌ `deleteOrder` backendda bor, **UI'da chaqirilmaydi** |
| 4 | `order.restore` | Savatdan tiklash | ✅ (OrdersScreen'dagi TrashSheet orqali, bugun qo'shildi) |
| 5 | `order.share` | Jamoaga ulashish (ruxsatlar bilan) | ❌ "Ulashish" tugmasi `SHOW_UNFINISHED` ostida yashirilgan |
| 6 | `order.unshare` | Ulashishni bekor qilish | ❌ UI yo'q |
| 7 | `order.customer_share` | Mijozga ko'rish havolasi | ❌ UI yo'q |
| 8 | `order.customer_unshare` | Mijoz havolasini bekor qilish | ❌ UI yo'q |
| 9 | `order.expense` | Chiqim qo'shish | ✅ `addExpense` |
| 10 | `order.income` | Kirim qo'shish (buyurtma ichida) | ❓ tekshirish — `addIncome` umumiy, shu buyurtmaga tegishlimi? |
| 11 | `finance.revert` | Yozuvni qaytarish | ⏸ ataylab qo'shilmagan (faqat `bigone_cl2` akkaunti uchun ishlaydi) |
| 12 | `stage.create` | Yangi etap | ✅ `createStage` |
| 13 | `stage.delete` | Etapni o'chirish | ✅ `deleteStage` |
| 14 | `stage.skip` | Etapni o'tkazib yuborish | ✅ `skipStage` |
| 15 | `stage.reopen` | Etapni qayta ochish | ✅ `reopenStage` |
| 16 | `stage.check` | Checklist band belgilash | ❓ tekshirish kerak |
| 17 | `stage.complete` | Etapni tugatish | ❓ tekshirish kerak (`completeStage` bormi) |
| 18 | `stage.link_order` | Etapni MebelCity buyurtmasiga bog'lash | ❌ `linkStageOrder` backendda bor, UI yo'q |
| 19 | `template.apply` | Shablonni qo'llash (barcha etaplar) | ❌ `applyTemplate` backendda bor, UI yo'q |
| 20 | `note.create/update/delete` | Eslatma CRUD | ❓ tekshirish kerak |
| 21 | `file.delete` | Fayl o'chirish | ❓ tekshirish kerak (`deleteFile` bormi) |
| 22 | `perm.save` | Ruxsat berish (rol + 3 checkbox) | ❌ `savePerm` backendda bor, UI yo'q |
| 23 | `perm.delete` | Ruxsatni o'chirish | ❌ `deletePerm` backendda bor, UI yo'q |
| 24 | `profit.save` | Foyda ulushini belgilash | ✅ bugun majburiy holatda qo'shildi, lekin **ixtiyoriy tahrirlash tugmasi ham kerak** (faqat yangi buyurtmada emas) |
| 25 | `profit.withdraw` | Pulni yechish | ❌ `withdrawProfit` backendda bor, UI yo'q |
| 26 | `profit.withdraw.reverse` | Yechishni bekor qilish | ❌ `reverseWithdraw` backendda bor, UI yo'q |
| 27 | `profit.accept` | A'zo o'z ulushini qabul/rad qilish | ❌ `acceptProfit` backendda bor, UI yo'q |
| 28 | `contacts.search` / `user.search` | Kontakt/foydalanuvchi qidirish (ulashish uchun) | ❓ |
| 29 | `mebelcity_orders_for_stage` | Etapni bog'lash uchun MC buyurtmalar ro'yxati | ❌ `loadMcOrders` backendda bor, UI yo'q |
| 30 | `team.autoshare_get/set` | Avtoulush (buyurtma darajasida ham bo'lishi mumkin) | ✅ Jamoa sahifasida bor |
| 31 | `standing.list/update/delete` | Doimiy ruxsat | ✅ Jamoa sahifasida bor |

**Xulosa: bu ekranda 31 amaldan ~13 tasi to'liq ishlaydi, ~10 tasi
backendda bor lekin UI yo'q, ~8 tasi hali tekshirilishi kerak.**

---

## 2. MIJOZLAR (`/clients`, `/clients/:id`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.clients` | ✅ |
| 2 | `client.create` | ✅ |
| 3 | `client.update` | ✅ (bugun qo'shildi) |
| 4 | `client.delete` | ✅ |
| 5 | `page.client_detail` | ✅ (bugun to'liqlashtirildi: qo'ng'iroq, tahrirlash, buyurtmaga o'tish) |

**Xulosa: to'liq.**

---

## 3. BUYURTMALAR RO'YXATI (`/orders`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.orders` | ✅ |
| 2 | `order.create` | ⚠️ ishlaydi, lekin desktopdagi "summasiz ochish" tanlovi yo'q (agar mijoz/shablon tanlanmagan bo'lsa maxsus oqim) |
| 3 | `client.create` (tezkor, buyurtma yaratishda) | ❓ tekshirish |
| 4 | `order_link_mebelcity` | ❓ tekshirish (MebelCity bilan bog'lash buyurtma ro'yxatidan) |
| 5 | `orders.deleted` | ✅ (bugun qo'shildi — TrashSheet) |
| 6 | `order.restore` | ✅ (bugun qo'shildi) |

---

## 4. MOLIYA (`/finance`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.finance` | ✅ |
| 2 | `finance.create` | ✅ |
| 3 | `finance.withdrawal` | ✅ |
| 4 | `debt.create` | ❌ backendda bor (`createDebt`), UI yo'q — mijozga qarz yozish alohida tugma yo'q |
| 5 | `debt.pay` | ✅ (Qarzlar tabida "To'lash") |
| 6 | `finance.duplicates` / `.resolve` | ✅ (bugun qo'shildi) |
| 7 | `supplierdebt.create/pay/delete` | ✅ (bugun "Ustalar qarzi" bilan qo'shildi) |
| 8 | `profit.people.list/add/update/delete/archive` | ❌ "Ustalar ro'yxati" (profit people) boshqarish UI'da yo'q |
| 9 | `profit.accept` | ❌ yuqorida ham bor, tasdiqlanadi |
| 10 | `profit.save` | ✅ (buyurtma ichida) |
| 11 | `team.profit.detail` | ✅ (Jamoa > Hisobot, bugun qo'shildi) |

---

## 5. ANALITIKA (`/analytics`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.analytics` | ✅ |
| 2 | `analytics.ai` | ✅ (`runAi`) |
| 3 | `analytics.ai_history` | ✅ (bugun qo'shildi) |

**Xulosa: to'liq.**

---

## 6. BOSH SAHIFA (`/`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.dashboard` | ✅ |
| 2 | `team.accept/decline` | ✅ (bugun qo'shildi) |
| 3 | `notification.read` | ❓ tekshirish — bildirishnoma bosilganda o'qilgan deb belgilanadimi |
| 4 | `dashboard.pending.detail` | ✅ (bugun qo'shildi) |

---

## 7. SOZLAMALAR (`/settings`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.settings` | ✅ |
| 2 | `settings.password` | ✅ |
| 3 | `settings.contact_admin` | ✅ (bugun qo'shildi) |
| 4 | `settings.delete_account` | ✅ |
| 5 | `settings.expense_cat_add/delete` | ✅ (bugun qo'shildi) |
| 6 | `template.list/save/delete` | ⚠️ ro'yxat ko'rsatiladi, lekin CRUD (yaratish/tahrirlash) `SHOW_UNFINISHED` ostida yashirilgan |

---

## 8. TARIF / TANGA (`/tarif`, `/tanga`)

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.tarif` | ✅ |
| 2 | `page.tanga` | ✅ |
| 3 | `pay.start` | ✅ (bugun to'liq to'lov oqimi qo'shildi) |
| 4 | `pay.status` | ✅ |

**Xulosa: to'liq.**

---

## 9. JAMOA / VIZUALIZATSIYA / ZAMERLAR / PORTFOLIO / MEBELCITY / OLDI-BERDI / KATALOG

Bular `rc-misc.js`da (1935 qator). Ro'yxat:

| # | Amal | Android holati |
|---|---|---|
| 1 | `page.team` | ✅ |
| 2 | `team.create/update/invite/leave/remove_member/update_member` | ✅ |
| 3 | `team.save_template/delete_template` | ✅ |
| 4 | `team.autoshare_get/set` | ✅ |
| 5 | `page.vizualizatsiya` | ✅ |
| 6 | `viz.rename/delete` | ✅ |
| 7 | `panorama.link_add` | ✅ (`addVizLink`) |
| 8 | `page.zamers` | ✅ |
| 9 | `page.portfolio` | ✅ |
| 10 | `portfolio.view` | ✅ |
| 11 | `page.mebelcity` | ✅ |
| 12 | `mebelcity_order_detail` | ✅ |
| 13 | `order_link_mebelcity` | ❓ MebelCity bilan bog'lash — buyurtma detalida bormi tekshirish |
| 14 | `page.oldi_berdi` | ✅ |
| 15 | `oldi_berdi.detail` | ✅ |
| 16 | `oldi_berdi.load_more` | ⚠️ backend bor, UI'da "ko'proq yuklash" tugmasi yo'q |
| 17 | `page.catalog` / `catalog.view` | ✅ (bugun to'g'ri joyga — dialogga — ko'chirildi) |
| 18 | `referral.share` | ✅ (bugun quest orqali ulandi) |

---

## 10. GEMINI LIVE (ovozli AI)

| # | Amal | Android holati |
|---|---|---|
| 1 | `glive.start` (token olish) | ✅ backend to'liq |
| 2 | Real-time ovoz oqimi (WebSocket + mikrofon) | ❌ ataylab qoldirilgan — Google Live API xom protokoli, hujjatsiz sinovsiz yozish xavfli deb kelishilgan |

---

## 11. FOYDALANUVCHI ATAYLAB PAUZA QILGAN ISHLAR (⏸ — BOSHLANMAYDI)

- **Bazis/SketchUp eksport** (.obj/.project/.glb Bittada Usta'dan
  chiqarish) — 2026-08-31 PAUZA qilingan, TZ tayyor lekin kod
  yozilmagan. Bu TZ doirasida ham BOSHLANMAYDI, faqat "boshla"
  deyilganda.

**PAUZA EMAS, lekin hali tekshirilmagan / alohida so'ralgan:**
- "Bazis oblaka link" — Bazis loyihasini bulutga yuklab, havola
  kiritish (`/make_files` dagi funksiya). Bu eksport EMAS, alohida
  kichik funksiya — Android'da qo'shsa bo'ladi.
- "Detal QR" (.b3d o'qib 3D+QR yaratish) — bu ham PAUZA EMAS, lekin
  bu funksiya USTA UCHUN emas, ishlab chiqarish (sex/kroy) tarafiga
  tegishli bo'lishi mumkin — Android (usta) ilovasida kerakligini
  aniqlashtirish kerak.
- "VR link yuklash" — `panorama.link_add` sifatida Vizualizatsiya
  ekranida ✅ allaqachon bor.

---

## KEYINGI QADAM

Bu TZ asosida ishlash tartibi (foydalanuvchi tasdig'idan keyin):

1. **Buyurtma detali** — eng ko'p bo'shliq (bo'lim 1), birinchi navbatda
2. **Moliya** — Ustalar ro'yxati (profit people) boshqaruvi
3. Qolgan `❓` belgilangan joylarni birma-bir tekshirish va aniqlashtirish
4. Har bir tuzatishdan keyin: haqiqiy kompilyatsiya + push (bugungi
   tartib bilan bir xil)
