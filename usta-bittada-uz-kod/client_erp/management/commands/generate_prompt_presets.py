"""
manage.py generate_prompt_presets --tenant mebelcity [--limit 15] [--days 180] [--apply] [--regenerate]

Eng ko'p sotilgan mahsulotlardan (sales.SaleLine, FAQAT O'QISH) mini ERP uchun
AI-rasm tayyor promptlar (PromptPreset) yaratadi. Prompt matni Claude opus-4-8
orqali yoziladi (client_erp.services.ai_prompt_writer). Default DRY-RUN.

XAVFSIZLIK: sales/products ma'lumotiga HECH NARSA yozilmaydi — faqat o'qiladi.
Yozish faqat client_erp.PromptPreset (yangi, izolyatsiyalangan jadval) ga.
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Eng ko'p sotilgan mahsulotlardan AI-prompt presetlar yaratadi (mini ERP)"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--limit", type=int, default=15, help="Nechta mahsulot uchun (default 15)")
        parser.add_argument("--days", type=int, default=180, help="Nechta kunlik sotuv tarixi (default 180)")
        parser.add_argument("--apply", action="store_true", help="Haqiqatan yozish (default: faqat ko'rsatish)")
        parser.add_argument("--regenerate", action="store_true",
                             help="Mavjud presetlarning prompt_text'ini ham AI bilan qayta yozadi")

    def handle(self, *args, **opts):
        from core.sync_engine import activate_tenant
        try:
            activate_tenant(opts["tenant"])
        except ValueError as e:
            raise CommandError(str(e))

        from tenant_manager.middleware import get_current_db_alias
        from django.db.models import Sum
        from django.utils import timezone
        from datetime import timedelta
        from sales.models import SaleLine
        from client_erp.models import PromptPreset
        from client_erp.services.ai_prompt_writer import write_ai_prompt

        db = get_current_db_alias() or "default"
        apply_ = opts["apply"]
        regenerate = opts["regenerate"]
        cutoff = timezone.now() - timedelta(days=opts["days"])

        # FAQAT O'QISH — sales.SaleLine'ga hech narsa yozilmaydi
        top = (
            SaleLine.objects.using(db)
            .filter(sale__sale_date__gte=cutoff)
            .exclude(product_name="")
            .values("product_name")
            .annotate(total_qty=Sum("quantity"))
            .order_by("-total_qty")[: opts["limit"]]
        )
        rows = list(top)
        if not rows:
            self.stdout.write(self.style.WARNING("Sotuv tarixi topilmadi — presetlar yaratilmadi"))
            return

        self.stdout.write(f"Top {len(rows)} mahsulot ({opts['days']} kunlik sotuv bo'yicha):")
        created = 0
        updated = 0
        skipped = 0
        for i, r in enumerate(rows, 1):
            name = (r["product_name"] or "").strip()
            if not name:
                continue
            self.stdout.write(f"  [{i}/{len(rows)}] {name} — {r['total_qty']} dona sotilgan")
            if not apply_:
                continue

            existing = PromptPreset.objects.using(db).filter(source_product_name=name).first()
            if existing and not regenerate:
                continue

            prompt_text, ok = write_ai_prompt(name, kind="product")
            if existing:
                if not ok and existing.prompt_text:
                    self.stdout.write(self.style.WARNING(
                        "      AI xato — mavjud matn saqlanib qolindi (fallback bilan ustidan yozilmadi)"))
                    skipped += 1
                    continue
                existing.prompt_text = prompt_text
                existing.save(using=db, update_fields=["prompt_text"])
                updated += 1
            else:
                PromptPreset.objects.using(db).create(
                    source_product_name=name,
                    title=name[:200],
                    prompt_text=prompt_text,
                    category="product",
                    is_active=True,
                )
                created += 1

        if apply_:
            self.stdout.write(self.style.SUCCESS(
                f"Yakun: {created} ta yangi, {updated} ta yangilangan, {skipped} ta o'tkazib yuborilgan preset"))
        else:
            self.stdout.write(self.style.WARNING("DRY-RUN — hech narsa yozilmadi. --apply bilan qayta ishga tushiring."))
