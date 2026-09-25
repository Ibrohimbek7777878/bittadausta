"""client_erp/services/server_error.py — server xatosini jurnalga yozish (2026-09-04).

Istalgan try/except blokidan bir qatorda chaqiriladi:

    from client_erp.services.server_error import log_server_error
    try:
        ...
    except Exception as e:
        log_server_error('render', 'b3d_render.b3d_to_png', e)
        return None, "Render vaqtida xatolik"

HECH QACHON o'zi xato bermaydi — jurnalning o'zi ishni to'xtatmasin
(ClientErrorLog / client_erp/views/errlog.py bilan bir xil tamoyil).
"""
import logging
import traceback as _tb_mod

logger = logging.getLogger('client_erp.server_error')


def log_server_error(kind, source, exc=None, message=None, username='', request_path='', extra=None):
    """Server xatosini `ServerErrorLog`ga yozadi (deduplikatsiya bilan).

    `kind`: ServerErrorLog.KIND dan biri (masalan 'render', 'parser').
    `source`: modul.funksiya nomi (masalan 'b3d_render.b3d_to_png').
    `exc`: Exception obyekti (bo'lsa, `message`/`traceback` shundan olinadi).
    `message`: exc berilmasa, xabar shu yerdan olinadi.
    """
    try:
        from tenant_manager.middleware import get_current_db_alias
        from client_erp.models import ServerErrorLog
        from django.utils import timezone

        db = get_current_db_alias()
        msg = message or (str(exc) if exc else 'Noma\'lum xato')
        tb = _tb_mod.format_exc() if exc else ''
        fp = ServerErrorLog.make_fingerprint(kind, msg, source)

        row = ServerErrorLog.objects.using(db).filter(
            fingerprint=fp, is_resolved=False).first()
        if row:
            ServerErrorLog.objects.using(db).filter(pk=row.pk).update(
                count=row.count + 1, last_seen=timezone.now())
            return

        ServerErrorLog.objects.using(db).create(
            kind=kind, message=msg[:2000], traceback=tb[:6000],
            source=source[:300], username=username[:64] or '',
            request_path=request_path[:300] or '',
            extra=extra if isinstance(extra, dict) else None,
            fingerprint=fp,
        )
    except Exception:
        logger.warning('[server-error-log] yozib bo\'lmadi', exc_info=True)
