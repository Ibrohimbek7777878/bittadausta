from django.utils import timezone
from datetime import timedelta, date as _date


def _to_date(v):
    if v is None:
        return None
    if isinstance(v, _date):
        return v
    return _date.fromisoformat(v)


def _month_bounds(y, m, today):
    """Berilgan yil/oy uchun (start, end). end — joriy oy bo'lsa bugun, aks holda oy oxiri."""
    import calendar
    start = _date(y, m, 1)
    last = calendar.monthrange(y, m)[1]
    end = _date(y, m, last)
    if start > today:
        end = start  # kelajak oy — bo'sh
    elif end > today:
        end = today  # joriy oy — bugungача
    return start, end


def get_period_bounds(period='month', date_from=None, date_to=None, ym=None):
    """Yagona davr-chegara hisoblagichi — Analytics, Finance, Orders, Clients va barcha
    sahifalar shu funksiyadan foydalanadi. Qaytaradi: (start, end, prev_start, prev_end).
    start/end — None bo'lsa cheklovsiz (period='all').
    period='custom' — date_from/date_to majburiy (kalendar/aniq sana oralig'i).
    ym='YYYY-MM' berilsa — AYNAN shu oy (professional 'Aniq oy' filtri)."""
    today = timezone.localdate()

    # Aniq oy (YYYY-MM) — ustuvor
    if ym:
        try:
            y, m = int(ym[:4]), int(ym[5:7])
            start, end = _month_bounds(y, m, today)
            pm = m - 1 or 12
            py = y - 1 if m == 1 else y
            prev_start, prev_end = _month_bounds(py, pm, today)
            return start, end, prev_start, prev_end
        except (ValueError, IndexError):
            pass  # noto'g'ri ym — quyidagi period'ga tushamiz

    if period == 'custom':
        start = _to_date(date_from)
        end = _to_date(date_to) or today
        span = (end - start).days
        prev_end = start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=span)
        return start, end, prev_start, prev_end

    if period == 'last_month':
        pm_end = today.replace(day=1) - timedelta(days=1)  # o'tgan oy oxiri
        start, end = _month_bounds(pm_end.year, pm_end.month, today)
        pm2 = pm_end.replace(day=1) - timedelta(days=1)
        prev_start, prev_end = _month_bounds(pm2.year, pm2.month, today)
        return start, end, prev_start, prev_end

    if period in ('today', 'day'):
        start = end = today
        prev_start = prev_end = today - timedelta(days=1)
    elif period == 'week':
        start, end = today - timedelta(days=6), today
        prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)
    elif period == 'year':
        start, end = today.replace(month=1, day=1), today
        prev_start = start.replace(year=start.year - 1)
        prev_end = start - timedelta(days=1)
    elif period == 'all':
        start = end = None
        prev_start = prev_end = None
    else:  # 'month' (default, also matches any unrecognized value for safety)
        start, end = today.replace(day=1), today
        prev_month_end = start - timedelta(days=1)
        prev_start, prev_end = prev_month_end.replace(day=1), prev_month_end

    return start, end, prev_start, prev_end
