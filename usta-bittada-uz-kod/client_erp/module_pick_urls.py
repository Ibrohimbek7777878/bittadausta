"""client_erp/module_pick_urls.py — TZ-Usta-Bittada-Modul-Tanlash.md.

BUTUNLAY YANGI, ALOHIDA route-fayl — client_erp/urls.py'ga BIR QATOR ham
tegilmaydi. config/urls.py'da SEPARATE include() bilan 'mini/' prefiksiga
qo'shiladi (bitta qo'shimcha qator, boshqa hech narsa o'zgarmaydi).
"""
from django.urls import path

from . import module_pick_views as v

app_name = 'module_pick'

urlpatterns = [
    # ID siz kirish — o'z zameriga o'zi olib boradi (yo'q bo'lsa yaratadi)
    path('<str:username>/modules-pick/', v.module_pick_entry, name='entry'),
    path('<str:username>/modules-pick/<int:zamer_id>/', v.module_pick_page, name='page'),
    path('<str:username>/modules-pick/<int:zamer_id>/list/', v.module_pick_list_api, name='list'),
    path('<str:username>/modules-pick/mesh/<int:module_id>/', v.module_pick_mesh_api, name='mesh'),
    path('<str:username>/modules-pick/<int:zamer_id>/upload/', v.module_pick_file_upload, name='upload'),
    path('<str:username>/modules-review/list/', v.modules_review_list_api, name='review-list'),
    path('<str:username>/modules-review/<int:module_id>/action/', v.modules_review_action_api, name='review-action'),

    path('<str:username>/room-capture/<int:zamer_id>/start/', v.room_capture_start, name='room-start'),
    path('<str:username>/room-capture/<int:zamer_id>/list/', v.room_list_api, name='room-list'),
    path('<str:username>/room-capture/<int:zamer_id>/create/', v.room_create_api, name='room-create'),
    path('<str:username>/room-capture/<int:zamer_id>/preset/', v.room_preset_api, name='room-preset'),
    path('<str:username>/room-types/', v.room_types_api, name='room-types'),
    path('<str:username>/room-capture/<int:room_id>/rename/', v.room_rename_api, name='room-rename'),
    path('<str:username>/room-capture/<int:room_id>/delete/', v.room_capture_delete, name='room-delete'),
    # Chizmadan xona (§F2) — rasm/PDF yuklash va holatni so'rash
    path('<str:username>/room-plan/<int:zamer_id>/upload/', v.room_plan_upload, name='plan-upload'),
    path('<str:username>/room-plan/status/<int:import_id>/', v.room_plan_status, name='plan-status'),
    path('<str:username>/room-capture/<int:room_id>/', v.room_capture_get, name='room-get'),
    path('<str:username>/room-capture/<int:room_id>/segment/', v.room_capture_add_segment, name='room-segment'),
    path('<str:username>/room-capture/<int:room_id>/save/', v.room_capture_save_state, name='room-save'),
]
