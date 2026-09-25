"""
manage.py seed_style_presets --tenant mebelcity [--apply]

AI-rasm panelida yuqorida ko'rinadigan 3-4 ta umumiy "uslub" tugmasi uchun
PromptPreset (category='style') yaratadi/yangilaydi. Prompt matni Claude
opus-4-8 orqali yoziladi (client_erp.services.ai_prompt_writer). Default DRY-RUN.
"""
from django.core.management.base import BaseCommand, CommandError

STYLES = [
    "Oshxona uslubi",
    "Ispancha uslub",
    "Zamonaviy (Modern)",
    "Klassik",
    "Yotoqxona uslubi",
    "Bolalar xonasi",
    "Mehmonxona uslubi",
    "O'yin xonasi (Gaming)",
    "Minimalist",
    "Skandinaviya uslubi",
    "Loft uslubi",
    "Ofis uslubi",
]


class Command(BaseCommand):
    help = "AI panelidagi umumiy uslub tugmalari (PromptPreset category=style) yaratadi"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--apply", action="store_true", help="Haqiqatan yozish (default: faqat ko'rsatish)")

    def handle(self, *args, **opts):
        from core.sync_engine import activate_tenant
        try:
            activate_tenant(opts["tenant"])
        except ValueError as e:
            raise CommandError(str(e))

        from tenant_manager.middleware import get_current_db_alias
        from client_erp.models import PromptPreset
        from client_erp.services.ai_prompt_writer import write_ai_prompt

        db = get_current_db_alias() or "default"
        apply_ = opts["apply"]

        self.stdout.write(f"{len(STYLES)} ta umumiy uslub:")
        saved, skipped = 0, 0
        for i, name in enumerate(STYLES, 1):
            self.stdout.write(f"  [{i}/{len(STYLES)}] {name}")
            if not apply_:
                continue
            prompt_text, ok = write_ai_prompt(name, kind="style")

            existing = PromptPreset.objects.using(db).filter(category="style", title=name).first()
            if not ok and existing and existing.prompt_text:
                self.stdout.write(self.style.WARNING(
                    "      AI xato — mavjud matn saqlanib qolindi (fallback bilan ustidan yozilmadi)"))
                skipped += 1
                continue

            PromptPreset.objects.using(db).update_or_create(
                category="style", title=name,
                defaults={
                    "prompt_text": prompt_text,
                    "sort_order": i,
                    "is_active": True,
                },
            )
            saved += 1

        if apply_:
            self.stdout.write(self.style.SUCCESS(f"Yakun: {saved} ta saqlandi, {skipped} ta o'tkazib yuborildi (eski matn qoldi)"))
        else:
            self.stdout.write(self.style.WARNING("DRY-RUN — hech narsa yozilmadi. --apply bilan qayta ishga tushiring."))
