"""client_erp/services/catalog_category.py — Mahsulot vitrinasi uchun 3 ta
QAT'IY guruh: Кромка, Zapchast (фурнитура), List (plita/list materiallar —
ЛДСП/ЛХДФ/МДФ/ДСП/ОСП/HPL). Boshqa hamma narsa (Акрил, Столешницы, Yechim,
Услуги va h.k.) vitrinaga UMUMAN chiqmaydi (foydalanuvchi so'rovi: faqat shu
3 ta filter bo'lsin).

Ishlatiladi: client_erp/consumers.py (handle_page_catalog) va
client_erp/management/commands/refresh_featured_products.py — ikkalasi HAM
BIR XIL guruhlash mantig'iga tayanishi SHART (aks holda vitrina tanlagan
guruh nomi ekranda ko'rsatilgan guruh bilan mos kelmay qoladi)."""

LIST_KEYWORDS = ('дсп', 'хдф', 'мдф', 'осп', 'hpl')
# Zapchast = furnitura jihozlari. "фурнитур" so'zi KO'P kategoriyada yo'q (Петли,
# Направляющие, Дверные ручки, Винты/Саморезы, Заглушки, Подъёмные механизмы,
# Баскеты...) — shuning uchun aniq hardware kalitlari qo'shildi. Test (2026-07-15,
# BARCHA kategoriya): Zapchast 2→110, +108 kategoriya, Кромка/List regressiyasi 0.
# DIQQAT: "комплект"/"INFINITY" kabi keng so'zlar QO'SHILMAYDI (namuna-kit/panelni
# qamrab List'ni buzardi).
ZAPCHAST_KEYWORDS = (
    'фурнитур', 'петл', 'направля', 'ручк', 'винт', 'саморез', 'крепеж', 'крепл',
    'заглушк', 'механизм', 'подъёмник', 'подъемник', 'подъёмн', 'подъемн', 'доводчик',
    'газлифт', 'баскет', 'опор', 'ножк', 'шкант', 'конфирмат', 'минификс', 'эксцентрик',
    'стяжк', 'уголок',
)


def root_category_name(category, _cache=None):
    """`category` (products.ProductCategory yoki None) → 'Кромка' | 'Zapchast'
    | 'List' | None (None = shu 3 guruhga kirmaydi, vitrinadan chiqarib
    tashlanadi — chaqiruvchi buni tekshirishi SHART)."""
    if not category:
        return None
    cache = _cache if _cache is not None else {}
    if category.id in cache:
        return cache[category.id]

    from products.models import ProductCategory

    # Butun ajdodlar zanjiridagi HAR bir nomni tekshiramiz (faqat ildizni
    # emas) — masalan "Прочая фурнитура" ildizi "Прочее" bo'lsa ham,
    # zanjirning o'zida "фурнитура" so'zi bor.
    c, seen, result = category, 0, None
    while True:
        n = c.name.lower()
        if any(k in n for k in ZAPCHAST_KEYWORDS):
            result = 'Zapchast'
            break
        if 'кромк' in n:
            result = 'Кромка'
            break
        if any(k in n for k in LIST_KEYWORDS):
            result = 'List'
            break
        if not c.parent_id or seen >= 10:
            break
        try:
            c = ProductCategory.objects.get(pk=c.parent_id)
        except ProductCategory.DoesNotExist:
            break
        seen += 1

    cache[category.id] = result
    return result
