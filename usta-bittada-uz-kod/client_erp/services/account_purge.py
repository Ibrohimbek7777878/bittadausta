"""
client_erp/services/account_purge.py — Mini ERP akkountni BUTUNLAY o'chirish.

purge_client_account(user_pk, db) — bitta ClientUser + unga tegishli BARCHA ichki
client_erp ma'lumotini (buyurtma, moliya, mijoz, jamoa, gamifikatsiya, fayl...) va
diskdagi fayllarni butunlay o'chiradi.

KATTA ERP XAVFSIZ: o'chirish faqat Django ORM (.delete()) orqali. Barcha katta-ERP
teskari-FK'lar SET_NULL (manfacturing.Zamer.client_user, widget_zamer.Zamer.
client_user, clients.Client, widget_panorama.PanoramaGallery.erp_client) — ular
o'chmaydi, faqat FK NULL bo'ladi. manfacturing.Order hech qachon teginilmaydi.

PANORAMA SAQLANADI (foydalanuvchi talabi 2026-07-09): PanoramaGallery.erp_client
SET_NULL bo'lgani uchun galereyalar avtomatik tirik qoladi — purge ularga tegmaydi.

Raw SQL ISHLATMANG: DB-level ON DELETE o'rnatilmagan, ORM collector SET_NULL/CASCADE'ni
o'zi bajaradi. Raw SQL FK-violation berardi.
"""
import logging
import os

logger = logging.getLogger('client_erp.account_purge')


def _abs_path_from_url(url):
    """Media URL (/media/...) → diskdagi absolute path. MEDIA_URL tashqarisidagi
    yoki tashqi (http) URL uchun None."""
    from django.conf import settings
    if not url or not isinstance(url, str):
        return None
    media_url = getattr(settings, 'MEDIA_URL', '/media/')
    media_root = getattr(settings, 'MEDIA_ROOT', '')
    if not media_root:
        return None
    # Faqat mahalliy media URL'larini qabul qilamiz
    if url.startswith(media_url):
        rel = url[len(media_url):]
    elif url.startswith('/media/'):
        rel = url[len('/media/'):]
    else:
        return None
    rel = rel.lstrip('/')
    if not rel:
        return None
    return os.path.join(media_root, rel)


def _collect_file_paths(user, db):
    """O'chishdan OLDIN diskdagi barcha fayl yo'llarini yig'adi.
    PANORAMA fayllari YIG'ILMAYDI (panoramalar o'chirilmaydi)."""
    from client_erp.models import (
        ClientOrder, ClientOrderFile, ClientOrderPhoto, ClientZamer,
        ClientPortfolioItem,
    )
    paths = []

    def _add_field(fieldfile):
        try:
            if fieldfile and fieldfile.name:
                paths.append(fieldfile.path)
        except Exception:  # noqa: BLE001 — path xatosi purge'ni to'xtatmasin
            pass

    # Avatar
    _add_field(getattr(user, 'avatar', None))

    order_ids = list(ClientOrder.objects.using(db).filter(owner=user).values_list('pk', flat=True))
    if order_ids:
        for f in ClientOrderFile.objects.using(db).filter(order_id__in=order_ids):
            _add_field(f.file)
            _add_field(f.thumbnail)
        for p in ClientOrderPhoto.objects.using(db).filter(order_id__in=order_ids):
            _add_field(p.image)

    # ClientZamer.photos — JSON URL ro'yxati (owner bo'yicha)
    for z in ClientZamer.objects.using(db).filter(owner=user):
        for u in (z.photos or []):
            ap = _abs_path_from_url(u if isinstance(u, str) else (u.get('url') if isinstance(u, dict) else None))
            if ap:
                paths.append(ap)

    # ClientPortfolioItem.images — JSON ro'yxati (owner bo'yicha)
    for item in ClientPortfolioItem.objects.using(db).filter(owner=user):
        for u in (item.images or []):
            ap = _abs_path_from_url(u if isinstance(u, str) else (u.get('url') if isinstance(u, dict) else None))
            if ap:
                paths.append(ap)

    return paths


def _orm_delete_tenant_safe(user, db):
    """ClientUser'ni ORM collector orqali o'chiradi, LEKIN maqsad DB'da jadvali
    MAVJUD BO'LMAGAN modellarni cascade/update'dan chiqarib tashlaydi.

    Sabab: `client_erp` ikkala DB'da (default + tenant) migratsiya qilingan, lekin
    `voicebot` (AIPermissionOverride, CASCADE FK → ClientUser) FAQAT default DB'da.
    Tenant ClientUser o'chirilganda oddiy `user.delete(using=tenant)` collectori
    tenant DB'da mavjud bo'lmagan `voicebot_aipermissionoverride`ni o'chirmoqchi
    bo'lib "relation does not exist" beradi. Bu funksiya shu cross-DB modellarni
    (maqsad DB'da jadvali yo'q) filtrlaydi — voicebot kodiga TEGMAY. default DB'da
    esa jadval mavjud bo'lgani uchun filtrlanmaydi (cascade normal ishlaydi)."""
    from django.db import connections
    from django.db.models.deletion import Collector

    existing = set(connections[db].introspection.table_names())

    collector = Collector(using=db)
    collector.collect([user])

    # fast_deletes: querysetlar — jadvali yo'qlarini olib tashlaymiz
    collector.fast_deletes = [
        qs for qs in collector.fast_deletes
        if qs.model._meta.db_table in existing
    ]
    # data: {model: instances} — CASCADE
    for model in list(collector.data.keys()):
        if model._meta.db_table not in existing:
            del collector.data[model]
    # field_updates: {(field, value): instances} — SET_NULL (himoya uchun)
    if hasattr(collector, 'field_updates'):
        for key in list(collector.field_updates.keys()):
            field = key[0]
            if field.model._meta.db_table not in existing:
                del collector.field_updates[key]

    return collector.delete()


def purge_client_account(user_pk, db='default'):
    """ClientUser (pk) va unga tegishli barcha ma'lumot + disk fayllarini butunlay
    o'chiradi. Katta ERP + panoramalar xavfsiz. Idempotent-safe (user topilmasa
    jimgina qaytadi).

    Returns: {'ok': bool, 'user_pk': int, 'files_deleted': int, 'error'?: str}
    """
    from client_erp.models import ClientUser

    user = ClientUser.objects.using(db).filter(pk=user_pk).first()
    if not user:
        logger.info('purge: user pk=%s topilmadi (allaqachon o\'chirilgan?)', user_pk)
        return {'ok': True, 'user_pk': user_pk, 'files_deleted': 0}

    username = user.username
    # 1) Fayl yo'llarini yig'ish (yozuv o'chishidan OLDIN)
    try:
        file_paths = _collect_file_paths(user, db)
    except Exception as e:  # noqa: BLE001
        logger.warning('purge: fayl yig\'ishda xato (user=%s): %s', username, e)
        file_paths = []

    # 2) ORM delete — CASCADE (ichki) + SET_NULL (katta ERP + panorama xavfsiz)
    try:
        _orm_delete_tenant_safe(user, db)
    except Exception as e:  # noqa: BLE001
        logger.exception('purge: ORM delete xato (user=%s): %s', username, e)
        return {'ok': False, 'user_pk': user_pk, 'files_deleted': 0, 'error': str(e)}

    # 3) Disk fayllarini o'chirish (har biri alohida — biri xato bo'lsa davom)
    deleted = 0
    for p in file_paths:
        try:
            if p and os.path.isfile(p):
                os.remove(p)
                deleted += 1
        except Exception as e:  # noqa: BLE001
            logger.warning('purge: fayl o\'chirishda xato (%s): %s', p, e)

    logger.info('purge: akkaunt butunlay o\'chirildi — user=%s pk=%s, %s fayl o\'chirildi',
                username, user_pk, deleted)
    return {'ok': True, 'user_pk': user_pk, 'files_deleted': deleted}
