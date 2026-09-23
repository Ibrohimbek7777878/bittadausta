"""client_erp/views/errlog.py — brauzer xatolarini qabul qilish (2026-08-24).

`POST /mini/api/client-error/` — brauzerdagi `errlog.js` to'plagan
xatolarni paket (batch) qilib yuboradi.

Xavfsizlik va barqarorlik:
  · Faqat POST, JSON. Auth SHART EMAS — xato aynan login/sessiya
    buzilganda ham yozilishi kerak (aks holda eng muhim xatolar yo'qoladi).
  · Bitta so'rovda ko'pi bilan 20 ta xato, har biri kesiladi.
  · Deduplikatsiya: bir xil xato takrorlansa `count` oshadi.
  · Sekundiga cheklov: bitta IP dan 60 so'rov/daqiqa (spam bo'lmasin).
  · HECH QACHON 500 qaytarmaydi — xato jurnalining o'zi xato bermasin.
"""
import json
import logging

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)

MAX_BATCH = 20
_RATE = {}          # {ip: [vaqt, soni]}


def _rate_ok(ip):
    now = timezone.now().timestamp()
    row = _RATE.get(ip)
    if not row or now - row[0] > 60:
        _RATE[ip] = [now, 1]
        return True
    row[1] += 1
    if len(_RATE) > 500:                       # xotira o'smasin
        for k in [k for k, v in _RATE.items() if now - v[0] > 300][:200]:
            _RATE.pop(k, None)
    return row[1] <= 60


def _s(v, n):
    return (str(v) if v is not None else '')[:n]


@csrf_exempt
@require_POST
def client_error(request):
    try:
        ip = (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
              or request.META.get('REMOTE_ADDR', '') or '?')
        if not _rate_ok(ip):
            return JsonResponse({'ok': True, 'skipped': 'rate'})

        try:
            body = json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return JsonResponse({'ok': False}, status=400)

        items = body.get('items')
        if not isinstance(items, list):
            items = [body]

        from client_erp.models import ClientErrorLog
        from tenant_manager.middleware import get_current_db_alias
        db = get_current_db_alias()

        user = getattr(request, 'client_user', None)
        uname = _s(body.get('username') or (user.username if user else ''), 64)
        ua = _s(request.META.get('HTTP_USER_AGENT', ''), 300)

        saved = 0
        for it in items[:MAX_BATCH]:
            if not isinstance(it, dict):
                continue
            msg = _s(it.get('message'), 2000)
            if not msg:
                continue
            kind = _s(it.get('kind') or 'js', 12)
            source = _s(it.get('source'), 300)
            fp = ClientErrorLog.make_fingerprint(kind, msg, source)

            row = ClientErrorLog.objects.using(db).filter(
                fingerprint=fp, is_resolved=False).first()
            if row:
                # Takror — faqat hisoblagich va vaqt yangilanadi
                ClientErrorLog.objects.using(db).filter(pk=row.pk).update(
                    count=row.count + 1, last_seen=timezone.now())
                saved += 1
                continue

            ClientErrorLog.objects.using(db).create(
                client_user=user if user else None,
                username=uname,
                kind=kind,
                message=msg,
                stack=_s(it.get('stack'), 4000),
                page=_s(it.get('page'), 300),
                source=source,
                req_url=_s(it.get('req_url'), 300),
                req_status=(it.get('req_status') if isinstance(it.get('req_status'), int) else None),
                user_agent=ua,
                platform=_s(it.get('platform'), 60),
                screen=_s(it.get('screen'), 32),
                extra=(it.get('extra') if isinstance(it.get('extra'), dict) else None),
                fingerprint=fp,
            )
            saved += 1
        return JsonResponse({'ok': True, 'saved': saved})
    except Exception:                                          # noqa: BLE001
        # Jurnalning O'ZI hech qachon xato bermasin
        logger.warning('[client-error] yozib bo\'lmadi', exc_info=True)
        return JsonResponse({'ok': False})
