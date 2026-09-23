"""Default etap shablonlarini generatsiya qilish."""
from django.core.management.base import BaseCommand
from client_erp.models import ClientOrderStageTemplate, ClientOrderStageTemplateItem


TEMPLATES = [
    {
        'name': 'Umumiy mebel',
        'is_default': True,
        'items': [
            {'title': 'Dizayn va o\'lchov', 'icon': '📐', 'color': '#6366f1', 'is_mebelcity': False,
             'checklist': ['Zamer olish', 'Chizma tayyorlash', 'Mijoz tasdiqlash']},
            {'title': 'Material olish', 'icon': '🧱', 'color': '#f59e0b', 'is_mebelcity': False,
             'checklist': ['ЛДСП sotib olish', 'Furnitura olish', 'Aksessuarlar']},
            {'title': 'Kesish', 'icon': '✂️', 'color': '#ef4444', 'is_mebelcity': False,
             'checklist': ['Materiallarni kesish', 'Krom yapish']},
            {'title': 'Yig\'ish', 'icon': '🔨', 'color': '#10b981', 'is_mebelcity': False,
             'checklist': ['Korpusni yig\'ish', 'Eshiklarni o\'rnatish']},
            {'title': 'MebelCity zakaz', 'icon': '🏢', 'color': '#8b5cf6', 'is_mebelcity': True,
             'checklist': []},
            {'title': 'Bo\'yash / Ishlov', 'icon': '🎨', 'color': '#ec4899', 'is_mebelcity': False,
             'checklist': ['Sirtni tayyorlash', 'Bo\'yash', 'Quritish']},
            {'title': 'Yetkazish va o\'rnatish', 'icon': '🚛', 'color': '#3b82f6', 'is_mebelcity': False,
             'checklist': ['Transportga yuklash', 'Yetkazish', 'O\'rnatish', 'Mijoz qabul']},
        ],
    },
    {
        'name': 'Oshxona mebel',
        'is_default': False,
        'items': [
            {'title': 'Loyiha', 'icon': '📐', 'color': '#6366f1', 'is_mebelcity': False,
             'checklist': ['3D loyiha', 'Mijoz tasdiqlash']},
            {'title': 'Material', 'icon': '🧱', 'color': '#f59e0b', 'is_mebelcity': False,
             'checklist': ['ЛДСП', 'Stoleshnitsa', 'Moskovka', 'Furnitura']},
            {'title': 'MebelCity', 'icon': '🏢', 'color': '#8b5cf6', 'is_mebelcity': True,
             'checklist': []},
            {'title': 'Korpus yig\'ish', 'icon': '🔨', 'color': '#10b981', 'is_mebelcity': False,
             'checklist': ['Pastki shkaflar', 'Ustki shkaflar']},
            {'title': 'O\'rnatish', 'icon': '🚛', 'color': '#3b82f6', 'is_mebelcity': False,
             'checklist': ['Yetkazish', 'O\'rnatish', 'Texnika ulash', 'Topshirish']},
        ],
    },
    {
        'name': 'Shkaf-kupe',
        'is_default': False,
        'items': [
            {'title': 'O\'lchov', 'icon': '📐', 'color': '#6366f1', 'is_mebelcity': False,
             'checklist': ['Zamer', 'Chizma']},
            {'title': 'Material', 'icon': '🧱', 'color': '#f59e0b', 'is_mebelcity': False,
             'checklist': ['ЛДСП', 'Oyna/Ko\'zgu', 'Profil', 'Roliklar']},
            {'title': 'Kesish va yig\'ish', 'icon': '✂️', 'color': '#ef4444', 'is_mebelcity': False,
             'checklist': ['ЛДСП kesish', 'Korpus yig\'ish']},
            {'title': 'Eshiklar', 'icon': '🪟', 'color': '#8b5cf6', 'is_mebelcity': False,
             'checklist': ['Profil kesish', 'Oyna o\'rnatish', 'Yig\'ish']},
            {'title': 'O\'rnatish', 'icon': '🚛', 'color': '#3b82f6', 'is_mebelcity': False,
             'checklist': ['Yetkazish', 'O\'rnatish', 'Topshirish']},
        ],
    },
]


class Command(BaseCommand):
    help = 'Default etap shablonlarini yaratish (global, owner=None)'

    def handle(self, *args, **options):
        for tdata in TEMPLATES:
            tmpl, created = ClientOrderStageTemplate.objects.get_or_create(
                owner=None, name=tdata['name'],
                defaults={'is_default': tdata['is_default']},
            )
            if not created:
                self.stdout.write(f"  MAVJUD: {tdata['name']}")
                continue

            for i, item in enumerate(tdata['items']):
                ClientOrderStageTemplateItem.objects.create(
                    template=tmpl,
                    title=item['title'],
                    icon=item['icon'],
                    color=item['color'],
                    sort_order=i + 1,
                    is_mebelcity=item['is_mebelcity'],
                    checklist_json=item['checklist'],
                )

            self.stdout.write(self.style.SUCCESS(
                f"  YARATILDI: {tdata['name']} ({len(tdata['items'])} etap)"
            ))

        self.stdout.write(self.style.SUCCESS('Tayyor!'))
