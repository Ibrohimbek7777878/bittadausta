"""client_erp/urls.py — Mini ERP URL routing."""
from django.urls import path
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from .views import (
    admin, auth, dashboard, order_print, file_upload, ai_image_edit,
    prompt_preset, panorama_ai, portal, contract_api, payments_api, bom_pdf,
    lazer,
    errlog,
    pwa,
    contract_print,
    detal_qr,
)
from client_erp.payments import payme_merchant
from config import legal_views
from widget_panorama.views import panorama_viewer_view
from bittada_cloud_app.views_scenes import serve_public as room_viewer

app_name = 'client_erp'


def _sotuv_roadmap_view(request):
    """usta.bittada.uz/sotuv-roadmap.html — statik marketing sahifa.

    django.views.static.serve() charset qo'shmasdan Content-Type: text/html
    qaytaradi; nosniff header bilan brauzer UTF-8'ni topolmay, emoji/tire
    belgilar buzuq ko'ringan edi (2026-09-03). Shu sababli faylni o'zimiz
    UTF-8 sifatida o'qib, aniq charset bilan qaytaramiz.
    """
    _path = settings.BASE_DIR / 'static' / 'marketing' / 'sotuv-roadmap.html'
    return HttpResponse(_path.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')


def _android_privacy_view(request):
    """usta.bittada.uz/android-privacy.html — Android ilovasi uchun
    MAXSUS Maxfiylik siyosati (2026-09-12, Google Play Data Safety talabi).

    Nega alohida: mavjud `/privacy/` sahifasi Instagram DM API haqida
    (platformaning boshqa qismi uchun yozilgan) — Android ilova esa telefon
    raqami, parol, buyurtma va moliyaviy yozuvlarni yig'adi. Play Data
    Safety formasi bilan MOS kelishi shart, aks holda релиз rad etiladi.
    Mavjud `/privacy/` sahifasiga TEGILMADI."""
    _path = settings.BASE_DIR / 'static' / 'marketing' / 'android-privacy.html'
    return HttpResponse(_path.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')


def _android_account_deletion_view(request):
    """usta.bittada.uz/android-account-deletion.html — Android ilovasi uchun
    akkauntni o'chirish yo'riqnomasi (2026-09-12).

    Nega alohida: Google Play akkaunt o'chirish siyosati ilovadan TASHQARI,
    veb orqali ham o'chirish yo'lini talab qiladi (Play Console'da
    "Account deletion URL"). Mavjud `/data-deletion/` sahifasi Meta/Instagram
    Data Deletion Callback uchun yozilgan va Bittada Usta foydalanuvchisiga
    mos kelmaydi — unga TEGILMADI."""
    _path = settings.BASE_DIR / 'static' / 'marketing' / 'android-account-deletion.html'
    return HttpResponse(_path.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')


def _sotuv_ssenariysi_view(request):
    """usta.bittada.uz/sotuv-ssenariysi.html — VAQTINCHALIK sahifa
    (2026-09-11, foydalanuvchi so'roviga ko'ra: Artifact link ochilmadi,
    shuning uchun shu yo'l bilan ko'rsatildi). Tasdiqdan keyin O'CHIRILADI
    — bu doimiy funksiya EMAS."""
    _path = settings.BASE_DIR / 'static' / 'marketing' / 'sotuv-ssenariysi.html'
    return HttpResponse(_path.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')


@csrf_exempt
def _sotuv_ssenariysi_save_view(request):
    """usta.bittada.uz/sotuv-ssenariysi/save/ — VAQTINCHALIK sahifaning
    o'zini tahrirlash (2026-09-11, foydalanuvchi so'roviga ko'ra: himoyasiz,
    kim ochsa tahrirlay oladi — sahifaning o'zi ATAYLAB himoyasiz, anonim
    marketing-demo). Faqat shu bitta faylni yozadi, boshqa hech narsaga
    ta'sir qilmaydi. POST body — JSON `{"scenes": [...]}`; faylning ichidagi
    `var SCENES = [...]` bloki shu yangi holat bilan almashtiriladi,
    qolgan HTML/CSS/boshqa JS o'zgarmaydi (kod bilan solishtirilgan holda
    ancha xavfsiz — frontend butun faylni qayta yig'maydi)."""
    import json
    import re
    if request.method != 'POST':
        return HttpResponse(status=405)
    body = request.body or b''
    if len(body) > 2 * 1024 * 1024:
        return HttpResponse('Juda katta', status=413)
    try:
        payload = json.loads(body.decode('utf-8'))
        scenes = payload['scenes']
        if not isinstance(scenes, list) or not scenes:
            raise ValueError('scenes bo\'sh')
    except Exception as e:
        return HttpResponse(f'Notogri format: {e}', status=400)
    _path = settings.BASE_DIR / 'static' / 'marketing' / 'sotuv-ssenariysi.html'
    current = _path.read_text(encoding='utf-8')
    new_scenes_js = (
        'var SCENES = ' + json.dumps(scenes, ensure_ascii=False, indent=2) + ';\n'
        "SCENES.forEach(function(s){ if (s.detailFnName) { s.detailFn = window[s.detailFnName]; delete s.detailFnName; } });\n"
    )
    pattern = re.compile(r'var SCENES = \[.*?\n\];\n', re.DOTALL)
    new_content, n = pattern.subn(new_scenes_js, current, count=1)
    if n != 1:
        return HttpResponse('SCENES blok topilmadi, saqlanmadi', status=500)
    _path.write_text(new_content, encoding='utf-8')
    return HttpResponse('OK')


urlpatterns = [
    path('login/', auth.mini_login, name='login'),
    path('login/start/', auth.mini_login_start, name='login-start'),
    path('login/verify/', auth.mini_login_verify, name='login-verify'),
    path('login/status/', auth.mini_login_status, name='login-status'),
    path('login/register/', auth.mini_register, name='login-register'),
    # 24 soatlik demo kirish (2026-09-23, additive)
    path('login/demo/', auth.demo_login, name='login-demo'),
    path('login/confirm/<str:token>/', auth.mini_login_confirm, name='login-confirm'),

    # ── Huquqiy public sahifalar — usta.bittada.uz/oferta/ (nginx → /mini/oferta/) ──
    # Anonim ochiladi (ClientERPMiddleware whitelist'da). Payme moderatsiyasi uchun.
    path('oferta/',        legal_views.oferta,        name='mini-oferta'),
    path('terms/',         legal_views.terms,         name='mini-terms'),
    path('return-policy/', legal_views.return_policy, name='mini-return-policy'),
    path('contacts/',      legal_views.contacts,      name='mini-contacts'),
    path('privacy/',       legal_views.privacy,       name='mini-privacy'),
    path('data-deletion/', legal_views.data_deletion, name='mini-data-deletion'),
    # 2026-09-12: Android ilova uchun MAXSUS maxfiylik siyosati (Play Data Safety).
    path('android-privacy.html', _android_privacy_view, name='mini-android-privacy'),
    path('android-account-deletion.html', _android_account_deletion_view, name='mini-android-account-deletion'),
    path('robots.txt',     legal_views.robots_txt,    name='mini-robots'),
    # 2026-09-03: sotuv taqdimoti — usta.bittada.uz/sotuv-roadmap.html
    # (nginx → /mini/sotuv-roadmap.html). Anonim ochiladi (middleware.py
    # whitelist'da). ⚠️ django.views.static.serve() Content-Type'da
    # charset qo'shmaydi — natijada emoji/tire belgilar buzuq chiqqan edi
    # (X-Content-Type-Options:nosniff bilan brauzer UTF-8'ni "topolmadi").
    # Shu sababli o'qib, explicit charset bilan qaytaramiz.
    path('sotuv-roadmap.html', _sotuv_roadmap_view, name='mini-sotuv-roadmap'),
    # 2026-09-11 VAQTINCHALIK — tasdiqdan keyin O'CHIRILADI (izoh: _sotuv_ssenariysi_view).
    path('sotuv-ssenariysi.html', _sotuv_ssenariysi_view, name='mini-sotuv-ssenariysi'),
    path('sotuv-ssenariysi/save/', _sotuv_ssenariysi_save_view, name='mini-sotuv-ssenariysi-save'),
    path('logout/', auth.mini_logout, name='logout'),
    path('telegram-auth/', auth.mini_telegram_auth, name='telegram-auth'),
    path('auto/<str:token>/', auth.mini_auto_login, name='auto-login'),

    # ── PWA — ilovani bosh ekranga qo'yish (2026-08-24) ────────────────
    # usta.bittada.uz da nginx `/manifest.json` → `/mini/manifest.json`,
    # `/sw.js` → `/mini/sw.js` qiladi, ya'ni qamrov (scope) butun sayt.
    path('manifest.json', pwa.manifest_json, name='pwa-manifest'),
    path('sw.js', pwa.service_worker, name='pwa-sw'),
    path('api/pwa/open-link/', pwa.open_link, name='pwa-open-link'),

    # ── Shartnoma varaqasi (2026-08-25) — QR + Bittada-ERP brendi ──────
    # Etap shabloniga qarab DINAMIK: o'ng ustun zakazning haqiqiy
    # bosqichlaridan quriladi («Blanka BigOne» → 9 ta, «Umumiy mebel» → 7).
    path('<str:username>/orders/<int:order_id>/contract/',
         contract_print.contract_print, name='contract-print'),

    # Admin (katta ERP staff uchun)
    path('admin/', admin.mini_admin_dashboard, name='admin'),
    path('admin/export-users/', admin.mini_admin_export_users, name='admin-export-users'),
    path('admin/create-user/', admin.mini_admin_create_user, name='admin-create'),
    path('admin/password/<int:user_id>/', admin.mini_admin_generate_password, name='admin-password'),
    path('admin/toggle/<int:user_id>/', admin.mini_admin_toggle, name='admin-toggle'),
    path('admin/delete-user/<int:user_id>/', admin.mini_admin_delete_user, name='admin-delete-user'),
    path('admin/impersonate/<int:user_id>/', admin.mini_admin_impersonate, name='admin-impersonate'),
    path('admin/stop-impersonate/', admin.mini_admin_stop_impersonate, name='admin-stop-impersonate'),
    # Gamification
    path('admin/save-rule/', admin.mini_admin_save_rule, name='admin-save-rule'),
    path('admin/delete-rule/<int:pk>/', admin.mini_admin_delete_rule, name='admin-delete-rule'),
    path('admin/save-level/', admin.mini_admin_save_level, name='admin-save-level'),
    # Buyurtma statuslari
    path('admin/save-status/', admin.mini_admin_save_status, name='admin-save-status'),
    path('admin/delete-status/<int:pk>/', admin.mini_admin_delete_status, name='admin-delete-status'),
    # Announcements
    path('admin/save-announcement/', admin.mini_admin_save_announcement, name='admin-save-announcement'),
    path('admin/delete-announcement/<int:pk>/', admin.mini_admin_delete_announcement, name='admin-delete-announcement'),
    # Events
    path('admin/save-event/', admin.mini_admin_save_event, name='admin-save-event'),
    path('admin/delete-event/<int:pk>/', admin.mini_admin_delete_event, name='admin-delete-event'),
    # Rewards
    path('admin/save-reward/', admin.mini_admin_save_reward, name='admin-save-reward'),
    path('admin/claim/<int:pk>/', admin.mini_admin_claim_action, name='admin-claim-action'),
    # Quests
    path('admin/save-quest/', admin.mini_admin_save_quest, name='admin-save-quest'),
    path('admin/delete-quest/<int:pk>/', admin.mini_admin_delete_quest, name='admin-delete-quest'),
    # Rewards delete
    path('admin/delete-reward/<int:pk>/', admin.mini_admin_delete_reward, name='admin-delete-reward'),
    # Analitika
    path('admin/analytics/', admin.mini_admin_analytics, name='admin-analytics'),
    # Visit Cards
    path('admin/bulk-check/', admin.mini_admin_bulk_check, name='admin-bulk-check'),
    path('admin/bulk-create/', admin.mini_admin_bulk_create, name='admin-bulk-create'),
    path('admin/card-users/', admin.mini_admin_card_users, name='admin-card-users'),
    # Tariflar (ClientPlan)
    path('admin/plans/', admin.mini_admin_plans_data, name='admin-plans'),
    path('admin/save-plan/', admin.mini_admin_save_plan, name='admin-save-plan'),
    path('admin/delete-plan/<int:pk>/', admin.mini_admin_delete_plan, name='admin-delete-plan'),
    path('admin/assign-plan/', admin.mini_admin_assign_plan, name='admin-assign-plan'),
    # 🪙 Tanga (CoinPack + AI narx + qo'lda berish)
    path('admin/coins/', admin.mini_admin_coins_data, name='admin-coins'),
    path('admin/save-pack/', admin.mini_admin_save_pack, name='admin-save-pack'),
    path('admin/delete-pack/<int:pk>/', admin.mini_admin_delete_pack, name='admin-delete-pack'),
    path('admin/save-aiprice/', admin.mini_admin_save_aiprice, name='admin-save-aiprice'),
    path('admin/grant-coins/', admin.mini_admin_grant_coins, name='admin-grant-coins'),
    # 💸 To'lovlar (ClientPayment — faqat o'qish + sandbox qo'lda tasdiq)
    path('admin/payments/', admin.mini_admin_payments_data, name='admin-payments'),
    path('admin/confirm-payment/', admin.mini_admin_confirm_payment, name='admin-confirm-payment'),

    # Zamer (embed iframe)
    path('api/zamer-new/', dashboard.mini_zamer_new, name='zamer-new'),
    # 📡 Lazer ko'prigi — Chrome'da ochiladi, o'lchovni bot oynasiga uzatadi.
    # `?k=` kalit bilan login SHART EMAS (client_erp/views/lazer.py izohiga qara).
    path('api/lazer-push/', lazer.lazer_push, name='lazer-push'),
    # ── Brauzer xatolari jurnali (2026-08-24) ─────────────────────────────
    # Auth SHART EMAS: xato aynan sessiya buzilganda ham yozilishi kerak.
    path('api/client-error/', errlog.client_error, name='client-error'),
    path('<str:username>/lazer/', lazer.lazer_page, name='lazer'),
    path('<str:username>/lazer-key/', lazer.lazer_key, name='lazer-key'),
    # ── BLE lazer drayverlari (2026-08-15) ────────────────────────────────
    # usta.bittada.uz da nginx HAMMA yo'lni `/mini/...` ga o'tkazadi, shu
    # sababli root'dagi `api/v2/widget-zamer/...` topilmay, panelda
    # «Driverlar yuklanmadi» chiqardi. Nginx'ga tegilmaydi (infratuzilma
    # qoidasi) — o'sha view shu yerga ham ulanadi. FAQAT O'QISH.
    path('api/v2/widget-zamer/ble-drivers/',
         __import__('widget_zamer.api', fromlist=['BleDriverListView']).BleDriverListView.as_view(),
         name='mini-ble-drivers'),

    # File upload
    path('api/file-upload/', file_upload.file_upload, name='file-upload'),
    path('api/chunk-upload/', file_upload.chunk_upload, name='chunk-upload'),
    path('api/link-add/', file_upload.link_add, name='link-add'),
    path('api/detal-qr-create/', file_upload.detal_qr_create, name='detal-qr-create'),
    path('api/detal-qr-update/', file_upload.detal_qr_update, name='detal-qr-update'),
    path('api/detal-qr-delete/', file_upload.detal_qr_delete, name='detal-qr-delete'),

    # AI rasm tahrirlash (galereya ✨ tugmasi, fal.ai)
    path('api/ai-image-edit/', ai_image_edit.ai_image_edit, name='ai-image-edit'),
    path('api/prompt-presets/', prompt_preset.prompt_preset_list, name='prompt-presets'),
    path('api/panorama-generate/', panorama_ai.panorama_generate, name='panorama-generate'),
    path('api/pay/<str:provider>/callback/', payments_api.pay_callback, name='pay-callback'),
    path('api/contracts/', contract_api.create_contract, name='contract-create'),
    path('api/contracts/<uuid:contract_uuid>/send-sms/', contract_api.send_contract_sms, name='contract-send-sms'),

    # Order print
    path('order/<int:order_id>/print/', order_print.order_print, name='order-print'),

    # Bazis smeta (BOM) PDF — mini foydalanuvchi uchun (usta: /bom/... → /mini/bom/...)
    path('bom/snapshot/<int:snapshot_id>/pdf/', bom_pdf.bom_pdf_mini, name='bom-pdf'),

    # ── Payme Merchant API callback (KASSA) — usta.bittada.uz/api/payments/payme/ ──
    # Payme BIZGA JSON-RPC yuboradi. Cookie yo'q — Basic auth (middleware'да whitelist).
    path('api/payments/payme/', payme_merchant.payme_callback, name='payme-callback'),

    # BOM Narx standarti — GLOBAL standart, faqat admin (is_staff), username catch-all'dan OLDIN
    path('bom-settings/', admin.bom_settings_page, name='bom-settings'),

    # Mijoz portali — OCHIQ (login talab qilmaydi), username catch-all'dan OLDIN
    path('portal/<uuid:contract_uuid>/', portal.portal_view, name='portal'),
    path('portal/<uuid:contract_uuid>/confirm/', portal.portal_confirm, name='portal-confirm'),
    path('portal/<uuid:contract_uuid>/reject/', portal.portal_reject, name='portal-reject'),
    path('portal/<uuid:contract_uuid>/qr/', portal.portal_qr, name='portal-qr'),

    # Detal QR — OCHIQ (login talab qilmaydi), TZ-Detal-QR-2026-09.md. username catch-all'dan OLDIN.
    path('detal/<str:short_code>/', detal_qr.detal_qr_view, name='detal-qr'),
    path('detal/<str:short_code>/qr/', detal_qr.detal_qr_png, name='detal-qr-png'),

    # Mijozga OCHIQ panorama viewer — usta.bittada.uz/panorama/<uuid>/ (authsiz).
    # Share sahifasidagi 🥽 vizualizatsiyalar shu yerga ochiladi. username'dan OLDIN.
    path('panorama/<uuid:gallery_uuid>/', panorama_viewer_view, name='mini-panorama-public'),

    # Mijozga OCHIQ Room 3D viewer (authsiz).
    path('room/s/<uuid:public_id>/', room_viewer, name='mini-room-public'),
    path('room/s/<uuid:public_id>/<path:path>', room_viewer, name='mini-room-public-path'),

    # Mijozga OCHIQ buyurtma-holati sahifasi — usta.bittada.uz/<uuid>/ (authsiz)
    # username catch-all'dan OLDIN: <uuid> faqat haqiqiy UUID'ga mos keladi.
    path('<uuid:share_uuid>/', dashboard.order_share_view, name='order-share'),

    # ESKI dizayn — REZERV (v1) · Redesign alias (v2) — catch-all'dan OLDIN
    path('<str:username>/v1/', dashboard.mini_spa_v1, name='spa-v1'),
    path('<str:username>/v1/<path:path>', dashboard.mini_spa_v1, name='spa-v1-catch'),
    path('<str:username>/v2/', dashboard.mini_spa_redesign, name='spa-v2'),
    path('<str:username>/v2/<path:path>', dashboard.mini_spa_redesign, name='spa-v2-catch'),

    # SPA shell — ASOSIY (redesign)
    path('<str:username>/', dashboard.mini_spa, name='spa'),
    path('<str:username>/spa/', dashboard.mini_spa, name='spa-alt'),
    path('<str:username>/spa/<path:path>', dashboard.mini_spa, name='spa-catch'),
]
