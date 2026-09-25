"""client_erp/services/name_match.py — erkin matnli mijoz/loyiha nomlarini
taxminiy (fuzzy) solishtirish.

Nega kerak: usta o'z zakazini ("Sardor aka") va MebelCity xodimi buyurtmani
("Биг Оне SARDOR OSHXONA") bir-biridan mustaqil, erkin matn bilan yozadi —
aniq umumiy ID/telefon yo'q. Bu modul ikki matnni solishtirib 0..1 oralig'ida
o'xshashlik balli qaytaradi, TAXMIN — hech qachon avtomatik bog'lamaydi,
faqat taklif tartiblash uchun ishlatiladi (usta o'zi tasdiqlaydi).
"""
import difflib
import re

_CYRILLIC_TO_LATIN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
    'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'қ': 'q', 'ғ': 'g', 'ў': 'o', 'ҳ': 'h',
}

# Firma/umumiy so'zlar — solishtirishga xalaqit beradi ("Big One" har bir
# buyurtmada takrorlanadi, mijozni ajratmaydi).
_STOPWORDS = {
    'big', 'one', 'biг', '0299', 'oshxona', 'ака', 'aka', 'опа', 'opa',
}


def _normalize(text):
    """Kirillni lotinga o'tkazadi, kichik harfga tushiradi, so'zlarga ajratadi."""
    text = (text or '').lower()
    text = ''.join(_CYRILLIC_TO_LATIN.get(ch, ch) for ch in text)
    words = re.findall(r'[a-z0-9]+', text)
    return [w for w in words if w not in _STOPWORDS and len(w) > 1]


def match_score(a, b):
    """Ikki erkin-matn nomni solishtiradi, 0.0 (mos emas) .. 1.0 (aynan mos).

    So'zlar-kesishuvi (Jaccard) va umumiy matn-o'xshashlik (SequenceMatcher)
    ning o'rtachasi — qisqa/uzun nomlar, so'z tartibi farqiga chidamli.
    """
    words_a, words_b = _normalize(a), _normalize(b)
    if not words_a or not words_b:
        return 0.0
    set_a, set_b = set(words_a), set(words_b)
    jaccard = len(set_a & set_b) / len(set_a | set_b)
    ratio = difflib.SequenceMatcher(None, ' '.join(words_a), ' '.join(words_b)).ratio()
    return (jaccard + ratio) / 2


def get_mc_client_ids(phone, client_full_name=None, db_alias=None, owner_user_id=None):
    """Usta telefoniga VA/YOKI firma nomiga tegishli MebelCity `Client` ID'lari.
    Qaytaradi: (client_ids: set, extra_mc_order_ids: set) — ikkinchisi faqat
    `owner_user_id` berilganda to'ladi, aks holda bo'sh set.

    Nega ikkalasi kerak: 2026-08-28 aniqlangan — MebelCity tomonda bitta
    firma ("Big One") uchun 7 xil dublikat Client yozuvi bor, va ular orasida
    telefon raqami HAR XIL (xodim xato tergan: 911040299 / 911040298 /
    910140299 / hatto butunlay boshqa 998971690101). Faqat telefon bo'yicha
    qidirish (`client__phone__endswith`) kamida 2 ta Client'ni (17+1 ta
    buyurtma) butunlay ko'rib chiqmasdan qoldirar edi — foydalanuvchi buni
    "avgustda 3 ta bo'lishi kerak emas, ko'proq" deb topib berdi.

    Shuning uchun endi IKKALA yo'l bilan qidiriladi va birlashtiriladi:
      1. Telefon oxirgi 9 raqami mos keladigan Client'lar (eski, aniq usul).
      2. Firma nomi (masalan "Big One") bilan BOSHLANADIGAN Client'lar
         (`full_name__istartswith`) — nom o'zgarmas, telefon xato terilgan
         bo'lsa ham ushlab qoladi.

    `client_full_name` berilmasa (yoki bo'sh) — faqat telefon bo'yicha.

    2026-09-11 QO'SHIMCHA (`owner_user_id` berilsa) — qaytarish qiymati endi
    (client_ids, extra_mc_order_ids):
    Ba'zi MC buyurtmalar XODIM XATOSI bilan BUTUNLAY BOSHQA (ism-o'xshashligi
    yo'q) `Client`ga bog'langan bo'lishi mumkin (tasdiqlangan holat: 5 ta
    sentyabr buyurtmasi "Big One..." nomli bo'lsa ham `client_id=18`
    "Nursulton"ga — boshqa ko'p mijozlar ham ishlatadigan umumiy/aralash
    Client'ga — bog'langan edi). Shu Client'ning HAMMA buyurtmalarini olish
    XAVFLI (boshqa mijozlarni aralashtirib yuboradi) — shuning uchun faqat
    ustaning O'ZI qo'lda ulagan (`ClientOrder`/`ClientOrderStage.
    mebelcity_order_id`) ANIQ MC buyurtma ID'lari alohida qaytariladi
    (client_id orqali emas), chaqiruvchi ularni to'g'ridan-to'g'ri
    `Order.id__in` bilan qo'shadi.
    """
    from clients.models import Client
    qs = Client.objects.using(db_alias) if db_alias else Client.objects
    ids = set()
    if phone:
        digits = re.sub(r'\D', '', phone)
        if digits.startswith('998') and len(digits) > 9:
            digits = digits[3:]
        if digits:
            ids |= set(qs.filter(phone__endswith=digits).values_list('id', flat=True))
    if client_full_name:
        # Faqat birinchi so'z (masalan "Big One" dan "Big") — turli
        # qo'shimchali variantlarni ("Big One 0299", "Big one 0299 0870")
        # ham qamrab olish uchun, lekin butunlay boshqa firma bilan
        # chalkashmasin deb kamida 2 so'zni ("Big One") ishlatamiz.
        prefix = ' '.join(client_full_name.strip().split()[:2])
        if prefix:
            ids |= set(qs.filter(full_name__istartswith=prefix).values_list('id', flat=True))
    extra_mc_order_ids = set()
    if owner_user_id:
        try:
            from client_erp.models import ClientOrder as _ClientOrder, ClientOrderStage as _ClientOrderStage
            _com = _ClientOrder.objects.using(db_alias) if db_alias else _ClientOrder.objects
            _cos = _ClientOrderStage.objects.using(db_alias) if db_alias else _ClientOrderStage.objects
            extra_mc_order_ids |= set(_com.filter(
                owner_id=owner_user_id, is_deleted=False, mebelcity_order_id__isnull=False,
            ).values_list('mebelcity_order_id', flat=True))
            extra_mc_order_ids |= set(_cos.filter(
                order__owner_id=owner_user_id, mebelcity_order_id__isnull=False,
            ).values_list('mebelcity_order_id', flat=True))
        except Exception:
            pass
    return ids, extra_mc_order_ids
