"""client_erp/management/commands/refresh_featured_products.py — Mini ERP
"Mahsulotlar" vitrinasini haftalik yangilaydi.

Manba: sales.SaleLine (so'nggi 30 kunlik sotuv, miqdor bo'yicha reyting) +
GURUH-XILMA-XILLIGI: har bir keng kategoriya guruhi (Кромка, ЛДСП, Фурнитура,
...) adolatli ulush olishi uchun round-robin taqsimlanadi — aks holda hajmi
katta guruhlar (Кромка/ЛДСП) butun vitrinani egallab, kichikroq guruhlar
(masalan Фурнитура) umuman ko'rinmay qolardi.

Agar biror guruhda so'nggi 30 kunda sotuv umuman bo'lmasa (masalan hozircha
Фурнитура) — TIER2 zaxira: shu guruhning ombordagi eng ko'p qoldiqli
mahsulotlari olinadi (rasm SHART EMAS — frontend rasmsiz ham fallback
ikonka bilan ko'rsatadi, aks holda rasm talabi butun guruhni chetlab
o'tardi).

Qoida: doim 50 ta mahsulot; birinchi ishga tushganda 50 tagacha to'ldiradi,
keyingi ishga tushishlarda ENG ESKI 6 tasini ENG YANGI (hali vitrinada yo'q,
guruh-muvozanatli) 6 tasi bilan almashtiradi — vitrina hech qachon eskirib
qolmaydi VA bitta-ikkita guruhga qorishtirib ketmaydi.

Cron: manage.py refresh_featured_products --tenant mebelcity (haftada 1 marta).
"""
from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta

TARGET_SIZE = 50
ROTATE_COUNT = 6
WINDOW_DAYS = 30


class Command(BaseCommand):
    help = "Mini ERP mahsulotlar vitrinasini eng ko'p sotilganlar bilan, guruh-muvozanatli yangilaydi (haftalik)"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant nomi, masalan: mebelcity")

    def handle(self, *args, **opts):
        db = f"tenant_{opts['tenant']}"
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = db
        try:
            self._run(db)
        finally:
            _thread_local.db_alias = "default"
            from django.db import connections
            connections.close_all()

    def _grouped_candidates(self, db):
        """Qaytaradi: {guruh_nomi: [product_id, ...]} — har guruh ICHIDA eng
        yaxshi (tier1: sotilgan, tier2: ombordagi qoldiq) tartibda saralangan,
        ALLAQACHON vitrinada bo'lmagan mahsulotlar (chaqiruvchi filtrlaydi)."""
        from client_erp.services.catalog_category import root_category_name
        from products.models import Product
        from sales.models import SaleLine

        window_start = timezone.now() - timedelta(days=WINDOW_DAYS)

        from django.db.models import Exists, OuterRef
        from products.models import ProductImage
        has_img = Exists(ProductImage.objects.using(db).filter(product_id=OuterRef('pk')))
        has_img_sale = Exists(ProductImage.objects.using(db).filter(product_id=OuterRef('product_id')))

        # Tier1 — so'nggi 30 kunlik sotuv (miqdor bo'yicha), rasmi BORLAR ustun
        # (aks holda rasmsiz mahsulot ko'p sotilgani uchun rasmlisini bosib
        # qo'yardi — vitrinada "quti" ikonkasi ko'payib ketardi).
        tier1_rows = list(
            SaleLine.objects.using(db)
            .filter(
                sale__sale_date__gte=window_start,
                product__isnull=False, product__is_active=True,
                product__price__gt=0, product__total_stock__gt=0,
            )
            .filter(has_img_sale)   # RASM MAJBURIY — rasmsiz mahsulot vitrinaga chiqmaydi
            .values('product_id', 'product__category_id')
            .annotate(qty=Sum('quantity'), has_image=has_img_sale)
            .order_by('-has_image', '-qty')[:2000]
        )
        tier1_ids = {r['product_id'] for r in tier1_rows}

        # Tier2 — sotuvi bo'lmasa ham ombordagi eng ko'p qoldiqli. RASM MAJBURIY
        # (2026-07-15 foydalanuvchi talabi: "rasm bo'lish shart"). Furnitura/zapchast
        # guruhida 201 ta rasm+narx+stok mahsulot bor — rasm majburiy bo'lsa ham to'la.
        tier2_qs = (
            Product.objects.using(db)
            .filter(is_active=True, price__gt=0, total_stock__gt=0)
            .filter(has_img)        # RASM MAJBURIY
            .exclude(pk__in=tier1_ids)
            .annotate(has_image=has_img)
            .order_by('-has_image', '-total_stock')
            .values('id', 'category_id', 'total_stock')[:3000]
        )

        cat_cache = {}
        groups = {}

        def _cat_obj(cat_id):
            from products.models import ProductCategory
            if cat_id is None:
                return None
            try:
                return ProductCategory.objects.using(db).get(pk=cat_id)
            except ProductCategory.DoesNotExist:
                return None

        for row in tier1_rows:
            cat = _cat_obj(row['product__category_id'])
            g = root_category_name(cat, cat_cache)
            if not g:
                continue  # faqat Кромка/Zapchast/List
            groups.setdefault(g, []).append(row['product_id'])

        for row in tier2_qs:
            cat = _cat_obj(row['category_id'])
            g = root_category_name(cat, cat_cache)
            if not g:
                continue
            groups.setdefault(g, []).append(row['id'])

        return groups

    def _round_robin_pick(self, groups, existing_ids, need):
        """Guruhlar bo'yicha navbat bilan (round-robin) `need` ta yangi
        product_id tanlaydi — hech bir guruh boshqasini bosib qolmasin."""
        # Guruhlarni "talab" (nomzodlar soni) bo'yicha kamayish tartibida —
        # katta guruh birinchi navbatda ko'proq tur oladi, lekin har round'da
        # BARCHA guruh birdek 1 tadan oladi (adolatli).
        queues = {g: [pid for pid in ids if pid not in existing_ids] for g, ids in groups.items()}
        queues = {g: ids for g, ids in queues.items() if ids}
        order = sorted(queues.keys(), key=lambda g: -len(queues[g]))

        picked = []
        while len(picked) < need and any(queues.values()):
            for g in order:
                if len(picked) >= need:
                    break
                if queues.get(g):
                    picked.append(queues[g].pop(0))
        return picked

    def _run(self, db):
        from client_erp.models import ClientFeaturedProduct
        from django.db.models import Sum as _Sum
        from sales.models import SaleLine
        from django.utils import timezone as _tz
        from datetime import timedelta as _td

        groups = self._grouped_candidates(db)
        if not groups:
            self.stdout.write(self.style.WARNING("Mos mahsulot topilmadi — vitrina o'zgarmadi"))
            return

        self.stdout.write("Guruhlar: " + ", ".join(f"{g}({len(ids)})" for g, ids in sorted(groups.items(), key=lambda x: -len(x[1]))))

        existing_ids = set(
            ClientFeaturedProduct.objects.using(db).values_list('product_id', flat=True)
        )
        current_count = len(existing_ids)

        if current_count < TARGET_SIZE:
            need = TARGET_SIZE - current_count
            to_add = self._round_robin_pick(groups, existing_ids, need)
        else:
            to_add = self._round_robin_pick(groups, existing_ids, ROTATE_COUNT)
            if to_add:
                oldest = list(
                    ClientFeaturedProduct.objects.using(db).order_by('added_at')[:len(to_add)]
                )
                ClientFeaturedProduct.objects.using(db).filter(
                    pk__in=[o.pk for o in oldest]
                ).delete()

        window_start = _tz.now() - _td(days=WINDOW_DAYS)
        qty_map = {
            r['product_id']: float(r['qty'] or 0)
            for r in SaleLine.objects.using(db).filter(
                product_id__in=to_add, sale__sale_date__gte=window_start,
            ).values('product_id').annotate(qty=_Sum('quantity'))
        }

        for pid in to_add:
            ClientFeaturedProduct.objects.using(db).create(
                product_id=pid, sold_qty_30d=qty_map.get(pid, 0),
            )

        self.stdout.write(self.style.SUCCESS(
            f"Vitrina yangilandi: +{len(to_add)} ta, jami {ClientFeaturedProduct.objects.using(db).count()} ta"
        ))
