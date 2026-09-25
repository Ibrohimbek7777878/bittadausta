"""
client_erp/services/scope.py — ULASHILGAN buyurtmalar qamrovi.

TZ: `TZ-Ulashilgan-Zakaz-Hisobot.md`

╔══════════════════════════════════════════════════════════════════════════════╗
║  QAT'IY QOIDA — nima uchun ishlatiladi va nima uchun ISHLATILMAYDI          ║
║                                                                              ║
║  ✅ ISHLATILADI (foyda/ulush ko'rsatkichlari):                              ║
║       • Ustalar foydasi   • Sof foyda   • Analitika foyda/zakaz KPI          ║
║                                                                              ║
║  ❌ ISHLATILMAYDI (fizik pul):                                              ║
║       • Kassa bloki (oy boshi/oxiri)   • Balans   • Kirim/chiqim jami        ║
║                                                                              ║
║  SABAB: ulashilgan zakazning puli BOSHQA odamning kassasida. Uni balansga    ║
║  qo'shsak — kassada bo'lmagan pul ko'rinadi va butun moliya buziladi.        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""
import logging

logger = logging.getLogger(__name__)


def shared_order_ids(user):
    """Foydalanuvchiga ULASHILGAN (o'zi EGA BO'LMAGAN) zakaz id'lari — set.

    Manba: `ClientOrderShare` (zakaz → jamoa) + `ClientTeamMember` (jamoa → user).
    O'z zakazlari chiqarib tashlanadi (ular allaqachon `owner=user` bilan keladi).
    Xato bo'lsa bo'sh set qaytaradi — chaqiruvchi hisoboti buzilmaydi.
    """
    try:
        from client_erp.models.team import ClientOrderShare, ClientTeamMember
        team_ids = list(
            ClientTeamMember.objects.filter(user=user, status='active')
            .values_list('team_id', flat=True)
        )
        if not team_ids:
            return set()
        return set(
            ClientOrderShare.objects.filter(team_id__in=team_ids)
            .exclude(order__owner=user)
            .exclude(order__is_deleted=True)
            .values_list('order_id', flat=True)
        )
    except Exception as e:                                        # noqa: BLE001
        logger.warning("[scope] ulashilgan zakazlarni o'qishda xato: %s", e)
        return set()


def shared_visibility_map(user):
    """{order_id: visibility} — ulashilgan zakazning ko'rinish darajasi.

    `full`           — zakaz foydasi ham, o'z ulushi ham ko'rinadi
    `finance_hidden` — FAQAT o'z ulushi (zakaz foydasi va boshqa ustalar YASHIRIN)
    """
    try:
        from client_erp.models.team import ClientOrderShare, ClientTeamMember
        team_ids = list(
            ClientTeamMember.objects.filter(user=user, status='active')
            .values_list('team_id', flat=True)
        )
        if not team_ids:
            return {}
        out = {}
        for oid, vis in (ClientOrderShare.objects
                         .filter(team_id__in=team_ids)
                         .exclude(order__owner=user)
                         .values_list('order_id', 'visibility')):
            # Bir zakaz bir necha jamoaga ulashilgan bo'lsa — ENG TOR ruxsat
            if out.get(oid) == 'finance_hidden':
                continue
            out[oid] = vis or 'full'
        return out
    except Exception as e:                                        # noqa: BLE001
        logger.warning("[scope] visibility o'qishda xato: %s", e)
        return {}


def owned_or_shared_q(user):
    """`Q` — o'z zakazlari YOKI unga ulashilganlar (ClientOrder uchun)."""
    from django.db.models import Q
    ids = shared_order_ids(user)
    q = Q(owner=user)
    if ids:
        q |= Q(pk__in=ids)
    return q


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  BARCHA FAOL AKKAUNTLARGA YOYILDI (2026-08-04)                            ║
# ║                                                                            ║
# ║  Ilgari FAQAT artom_cl(2) ↔ ibrohim_cl(82) sinov jufti uchun edi.          ║
# ║  2026-08-04: snapshot bilan tasdiqlangach (0 farq, faqat ibrohim_cl'da)   ║
# ║  foydalanuvchi qarori bilan barcha 73 FAOL akkauntga ochildi. Ism-       ║
# ║  moslashtirish endi ANIQ BIR moslik topilmasa hech kimga bog'lanmaydi    ║
# ║  (`consumers.py:handle_profit_withdraw` — 2+ moslik = jim rad javob,     ║
# ║  ma'lumot noto'g'ri odamga oqib ketmasligi uchun).                       ║
# ║                                                                            ║
# ║  ⚠️  HALI YO'Q (keyingi navbat, TZ §0.8): H5 (reversal FK), H6 (bekor     ║
# ║  qilish), H7 (a'zo Telegram roziligi), F4 (shartnomalar hisoboti).       ║
# ║  Yangi akkaunt qo'shilsa — shu ro'yxatga QO'LDA qo'shiladi (avtomatik    ║
# ║  emas, H9 asta-kengaytirish tamoyili bo'yicha).                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
# ✅ 73 FAOL AKKAUNTGA YOYILDI (2026-08-04, 2-urinish — xavfsizlik to'ri bilan)
# 1-urinishda order#132'da manfiy foyda chiqqan edi (rollback qilingan,
# tarix yuqorida saqlangan). Ildiz sabab: `zaklad_amount` va tasdiqlangan
# `ClientContract.contract_amount` farq qilganda grandfathering himoya
# qilmasdi. TUZATILDI: `models/order.py:contract_profit` endi yangi formula
# MANFIYga tushib, eski formula musbat bo'lsa — avtomatik eski formulaga
# qaytadi (`ClientOrder.contract_profit` xavfsizlik to'ri) + log yozadi.
# Qayta tekshiruv: barcha 67ta topshirilgan buyurtma bo'yicha 0 ta yangi
# manfiy-regressiya qoldi (bitta oldindan-ma'lum, TZ'da qayd etilgan
# #259 «Office» bundan mustasno — u eski formula bilan ham manfiy edi).
TEAM_FINANCE_BETA_USER_IDS = {
    2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41,
    42, 43, 44, 45, 46, 47, 48, 52, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
    66, 67, 68, 69, 70, 72, 73, 74, 75, 76, 78, 80, 81, 82, 83, 84, 85,
}


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  MOLIYA v2 — BARCHA FAOL AKKAUNTLARGA YOYILDI (2026-08-04)               ║
# ║                                                                          ║
# ║  Shartnoma-asosli foyda va yangi jamoa-moliya oqimi — 2026-08-03 FAQAT   ║
# ║  ibrohim_cl(82)da sinalgan, 2026-08-04 snapshot bilan (0 farq)          ║
# ║  tasdiqlangach barcha 73 FAOL akkauntga ochildi (TZ §H9).               ║
# ║                                                                          ║
# ║  ⚠️  BU YERGA FAQAT XATTI-HARAKATNI O'ZGARTIRADIGAN narsalar bog'lanadi: ║
# ║      • shartnoma-asosli foyda formulasi                                  ║
# ║      • «Topshirildi» uchun shartnoma majburiyligi                        ║
# ║      • etap shabloni majburiyligi                                        ║
# ║      • Kirim shartnoma limiti                                            ║
# ║                                                                          ║
# ║  ❌ BU YERGA BOG'LANMAYDI (hamma uchun global qoladi):                   ║
# ║      • transaction.atomic (yarim yozuv oldini olish)                     ║
# ║      • takror-yechish to'sig'i                                           ║
# ║      • ism o'zgartirish qulfi                                            ║
# ║    SABAB: bular xatti-harakat emas — TO'G'RILIK/XAVFSIZLIK tuzatishlari. ║
# ╚══════════════════════════════════════════════════════════════════════════╝
FINANCE_V2_USER_IDS = set(TEAM_FINANCE_BETA_USER_IDS)   # 73 akkaunt (2026-08-04, 2-urinish)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  SHARTNOMA MAJBURIY — KIRIMDAN OLDIN (2026-08-04)                        ║
# ║                                                                          ║
# ║  Bu — foydalanuvchi HARAKATINI TO'SADIGAN qoida (ko'rsatkich emas):      ║
# ║  shartnoma summasi kiritilmaguncha buyurtmaga kirim qo'shib bo'lmaydi.   ║
# ║                                                                          ║
# ║  Shu sabab avval `{82}` (ibrohim_cl) da alohida sinalgan, keyin —       ║
# ║  foydalanuvchi qarori bilan (2026-08-04) BARCHA akkauntlarga yoyilgan.   ║
# ║                                                                          ║
# ║  📊 Yoyishdan OLDIN o'lchangan ta'sir (jonli baza):                      ║
# ║      • 82 ta faol buyurtmadan 36 tasida shartnoma summasi yo'q           ║
# ║      • 25 ta foydalanuvchiga tegadi                                      ║
# ║      • ulardan 13 tasida allaqachon kirim bor (ishlayotgan buyurtma)     ║
# ║    Ma'lumot YO'QOLMAYDI — egasi shartnoma summasini bir marta kiritsa,   ║
# ║    hammasi avvalgidek davom etadi. UI to'g'ridan-to'g'ri shu oynani      ║
# ║    ochib beradi (`rc-order-detail.js:_needContract`).                    ║
# ╚══════════════════════════════════════════════════════════════════════════╝
CONTRACT_REQUIRED_USER_IDS = set(TEAM_FINANCE_BETA_USER_IDS)   # GLOBAL (2026-08-04)


def contract_required(user):
    """True — `user`da kirim qo'shishdan oldin shartnoma summasi majburiymi.

    2026-08-05: ID ro'yxati o'rniga `_feature_on` — yangi akkauntlar ham
    avtomatik qamrab olinadi (yuqoridagi izohga qarang).
    """
    return _feature_on(user)


def finance_v2(user):
    """True — `user` shartnoma-asosli moliya mantiqidami.

    2026-08-05: ID ro'yxati o'rniga `_feature_on`. Yangi akkaunt darhol
    to'g'ri mantiq bilan boshlaydi — keyin ko'chirish muammosi bo'lmaydi.
    """
    return _feature_on(user)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  MOLIYA — «SHARTNOMALAR KESIMI» TABI (2026-08-04)                        ║
# ║  TZ: client_erp/TZ-Moliya-Shartnoma-Kesimi.md                            ║
# ║                                                                          ║
# ║  Nima: /finance sahifasida 3-chi tab — pul zakaz/shartnoma kesimida.     ║
# ║  FAQAT O'QIYDI: bitta ham yozuv yaratilmaydi/o'zgartirilmaydi.           ║
# ║  Bayroq o'chiq bo'lsa `contracts` kaliti javobda UMUMAN bo'lmaydi —      ║
# ║  ya'ni eski UI bir bayt ham ortiqcha payload olmaydi.                    ║
# ║                                                                          ║
# ║  2026-08-05: ibrohim_cl'da sinovdan o'tdi → GLOBAL joriy qilindi.        ║
# ║  Xavf past: faqat O'QIYDI, migratsiya yo'q, mavjud kalitlar tegilmagan.  ║
# ║  O'lchandi (53 shartnomali akkaunt): 11 so'rov, 21 ms — zakaz soniga     ║
# ║  bog'liq emas. UI 5 tadan sahifalaydi.                                   ║
# ╚══════════════════════════════════════════════════════════════════════════╝
CONTRACT_SLICE_USER_IDS = set(TEAM_FINANCE_BETA_USER_IDS)   # GLOBAL (73 akkaunt)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  SINALGAN FUNKSIYALAR — HAMMAGA AVTOMATIK (2026-08-05)                   ║
# ║                                                                          ║
# ║  MUAMMO: yuqoridagi ro'yxatlar QO'LDA yozilgan 73 ta ID edi. 2026-08-05  ║
# ║  da `hojiakbar_cl` (id=86) ro'yxatdan o'tdi va HECH QAYSI ro'yxatda      ║
# ║  yo'q edi — u uchun shartnoma-asosli foyda, «Shartnomalar» tabi va       ║
# ║  shartnoma majburiyligi ISHLAMASDI. Har yangi mijozda takrorlanardi.     ║
# ║                                                                          ║
# ║  QAROR (foydalanuvchi, 2026-08-05): sinovdan o'tgan funksiyalar          ║
# ║  HAMMAGA ochiladi. Yangi mijoz darhol to'g'ri mantiq bilan boshlaydi —   ║
# ║  keyin eski mantiqdan ko'chirish muammosi bo'lmaydi.                     ║
# ║                                                                          ║
# ║  ⚠️ KELAJAKDAGI YANGI funksiyalar avvalgidek RO'YXAT bilan sinaladi.     ║
# ║  Ya'ni: «sinalgan narsa — hammaga, sinalmagan narsa — ro'yxat bilan».    ║
# ║                                                                          ║
# ║  FAVQULODDA TO'XTATISH: muammo chiqsa foydalanuvchi ID'sini quyidagi     ║
# ║  ro'yxatga qo'shish yetarli — u eski mantiqqa qaytadi.                   ║
# ╚══════════════════════════════════════════════════════════════════════════╝
FEATURE_OPT_OUT_USER_IDS = set()        # bo'sh = hamma yangi mantiqda


def _feature_on(user):
    """Sinalgan funksiya shu foydalanuvchida yoqilganmi.

    Standart YOQIQ. Faqat `FEATURE_OPT_OUT_USER_IDS` dagilar o'chiq
    (favqulodda to'xtatish uchun). Xato bo'lsa — False (eski, sinalgan yo'l).
    """
    try:
        uid = getattr(user, 'id', None)
        if uid is None:
            return False
        return uid not in FEATURE_OPT_OUT_USER_IDS
    except Exception:                                             # noqa: BLE001
        return False


def contract_slice_enabled(user):
    """True — `user`ga Moliya sahifasida «Shartnomalar» tabi ko'rinadimi.

    2026-08-05: ID ro'yxati o'rniga `_feature_on`.
    """
    return _feature_on(user)


def profit_claim_map(user):
    """{order_id: percent} — `user` EGA BO'LMAGAN, lekin unga aniq ruxsat
    (`ClientOrderPermission`, pul ko'rinadigan) berilgan va o'sha zakazda
    nomi mos keladigan `ClientOrderProfitShare` topilgan zakazlar.

    Bu `ClientTeam`/`ClientOrderShare` orqali RASMIY ulashilmagan, lekin
    egasi shaxsan "shu odamga X% beraman" deb yozib qo'ygan holatlar uchun
    (masalan alohida akkauntdan ochilgan zakazga sherikni nom bilan qo'shish).

    FAQAT `TEAM_FINANCE_BETA_USER_IDS` uchun ishlaydi — aks holda bo'sh.
    """
    if not _feature_on(user):
        return {}
    try:
        from client_erp.models.permission import ClientOrderPermission
        from client_erp.models.team import ClientOrderProfitShare

        order_ids = set(
            ClientOrderPermission.objects.filter(user=user, can_see_money=True)
            .exclude(order__owner=user)
            .exclude(order__is_deleted=True)
            .values_list('order_id', flat=True)
        )
        # ── 2026-08-06: JAMOA orqali ulashilgan zakazlar ham ────────────
        # Ilgari faqat `ClientOrderPermission` sanalardi. Natijada jamoaga
        # ulashilgan zakazda a'zoning ULUSH FOIZI qo'llanmasdi va u
        # zakazning TO'LIQ foydasini ko'rardi (o'lchandi: Oybek 25 zakaz
        # ulashilgach 78 mln ko'rsatdi — aslida ~34% ulushi bor).
        # Endi ko'radigan HAR QANDAY begona zakazda ulush foizi qo'llanadi.
        order_ids |= shared_order_ids(user)
        if not order_ids:
            return {}
        order_ids = list(order_ids)

        candidates = {(user.full_name or '').strip().lower(), (user.username or '').strip().lower()}
        candidates.discard('')

        # ── 2026-08-06: `user` FK ham hisobga olinadi ────────────────────
        # Ilgari FAQAT ism solishtirilardi. Natijada `oybek_cl`
        # («Oybek Niyazov») ulushdagi «Oybek aka» bilan MOS KELMASDI va
        # uning ulushi umuman topilmasdi — Moliyada 0 turardi, ulashilgan
        # zakazlarda esa ulush foizi qo'llanmay TO'LIQ foyda ko'rinardi.
        # Endi: `user` FK bo'lsa — ism qanday yozilganidan qat'i nazar
        # ishlaydi (aniq va ishonchli). Ism-moslik ESKI yozuvlar uchun
        # zaxira sifatida qoladi.
        out = {}
        for oid, name, pct, uid in ClientOrderProfitShare.objects.filter(
            order_id__in=order_ids,
        ).values_list('order_id', 'name', 'percent', 'user_id'):
            match = (uid == user.id) if uid else ((name or '').strip().lower() in candidates)
            if match:
                out[oid] = out.get(oid, 0) + float(pct or 0)
        return out
    except Exception as e:                                        # noqa: BLE001
        logger.warning("[scope] profit_claim_map xato: %s", e)
        return {}


def profit_claim_withdrawn(user):
    """{order_id: summa} — `profit_claim_map()`dagi zakazlar bo'yicha `user`ga
    ALLAQACHON yechilgan (`ClientProfitWithdrawalLine`, nom mos kelgan) summa.

    Real pul o'tganda (`handle_profit_withdraw`) shu miqdor "pending"dan
    ayiriladi — virtual claim va real `ClientFinanceRecord` ikki marta
    hisoblanmasin.
    """
    if not _feature_on(user):
        return {}
    try:
        from client_erp.models.team import ClientProfitWithdrawalLine

        order_ids = list(profit_claim_map(user).keys())
        if not order_ids:
            return {}
        candidates = {(user.full_name or '').strip().lower(), (user.username or '').strip().lower()}
        candidates.discard('')
        if not candidates:
            return {}
        out = {}
        for oid, name, amt in ClientProfitWithdrawalLine.objects.filter(
            withdrawal__order_id__in=order_ids,
        ).values_list('withdrawal__order_id', 'name', 'amount'):
            if (name or '').strip().lower() in candidates:
                out[oid] = out.get(oid, 0) + float(amt or 0)
        return out
    except Exception as e:                                        # noqa: BLE001
        logger.warning("[scope] profit_claim_withdrawn xato: %s", e)
        return {}


def profit_claim_pending(user):
    """[(order_id, pending_Decimal, delivered_date|None), ...] — `user`ning
    ulashilgan zakazlardan HALI TO'LIQ yechilmagan ulushi (claimed − withdrawn).

    `Kirim`/`Balans`/`Kassa` kabi FIZIK-PUL ko'rsatkichlarga real vaqtda
    qo'shish uchun (BETA qaror, 2026-08-01: foydalanuvchi "pul hali
    yechilmagan bo'lsa ham darhol ko'rsatsin" tanladi). Withdraw qilingach
    real `ClientFinanceRecord(owner=partner, order=None)` yaratiladi va shu
    yerdagi "pending" xuddi shu miqdorga kamayadi — jami YIG'INDI o'zgarmaydi.
    """
    if not _feature_on(user):
        return []
    try:
        from decimal import Decimal
        from django.db.models import Sum, Q
        from client_erp.models.order import ClientOrder

        claim_map = profit_claim_map(user)
        if not claim_map:
            return []
        withdrawn_map = profit_claim_withdrawn(user)

        out = []
        for o in ClientOrder.objects.filter(pk__in=claim_map.keys()).annotate(
            _inc=Sum('finance_records__amount', filter=Q(finance_records__record_type='income', finance_records__is_deleted=False)),
            _exp=Sum('finance_records__amount', filter=Q(finance_records__record_type='expense', finance_records__is_deleted=False)),
        ).values('id', '_inc', '_exp', 'delivered_at'):
            full_p = Decimal(str(o['_inc'] or 0)) - Decimal(str(o['_exp'] or 0))
            pct = Decimal(str(claim_map[o['id']]))
            claimed = full_p * pct / 100
            withdrawn = Decimal(str(withdrawn_map.get(o['id'], 0)))
            pending = claimed - withdrawn
            if pending > 0:
                out.append((o['id'], pending, o['delivered_at'].date() if o['delivered_at'] else None))
        return out
    except Exception as e:                                        # noqa: BLE001
        logger.warning("[scope] profit_claim_pending xato: %s", e)
        return []


def cutover_bounds(user):
    """Balans-kesim (2026-08-12, TZ-Moliya-Tarix-Arxiv-Avgust-Boshlanish.md).

    `user.balance_cutover_date` bo'lmasa — eski xatti-harakat: cheklovsiz
    (None, 0) qaytadi, chaqiruvchi hech narsani filtrlamaydi. O'rnatilgan
    bo'lsa — (cutover_date, cutover_amount) qaytadi: chaqiruvchi
    `date__gte=cutover_date` filtri qo'shishi VA yig'indiga
    `cutover_amount`ni qo'shishi SHART (bittasi bo'lmasa raqam noto'g'ri
    chiqadi — yo ikki marta hisoblanadi, yo umuman yo'qoladi).

    Yagona manba — Dashboard/Moliya/Analitika BIR XIL joydan o'qishi shart
    (aks holda `contract_profit`dagi kabi sahifalar-aro farq paydo bo'ladi).
    """
    from decimal import Decimal
    d = getattr(user, 'balance_cutover_date', None)
    a = getattr(user, 'balance_cutover_amount', None)
    if not d:
        return None, Decimal('0')
    return d, Decimal(str(a or 0))
