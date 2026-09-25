"""client_erp/auth_backend.py — JWT token based auth."""
import jwt
from datetime import datetime, timedelta
from django.conf import settings


TOKEN_COOKIE = 'client_erp_token'
TOKEN_EXPIRY_DAYS = 30


def generate_token(user):
    """ClientUser uchun JWT token yaratadi."""
    payload = {
        'user_id': user.id,
        'phone': user.phone,
        'username': user.username,
        'type': 'client_erp',
        'exp': datetime.utcnow() + timedelta(days=TOKEN_EXPIRY_DAYS),
        'iat': datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')


def decode_token(token):
    """JWT tokenni decode qiladi. Xatoda None qaytaradi."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') != 'client_erp':
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_client_user(request):
    """Request dan ClientUser oladi (cookie dan JWT)."""
    token = request.COOKIES.get(TOKEN_COOKIE)
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    from .models import ClientUser
    try:
        user = ClientUser.objects.get(pk=payload['user_id'], is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return None
    # ── Demo muddati (2026-09-23, additive): muddat o'tgan demo kirishi
    # bilan user + BARCHA datasi o'chadi, sessiya yopiladi (login'ga qaytadi).
    try:
        if getattr(user, 'is_demo', False) and user.demo_expires_at:
            from django.utils import timezone
            if user.demo_expires_at <= timezone.now():
                from client_erp.services.team_invites import _delete_demo_files
                try:
                    _delete_demo_files(user)
                except Exception:
                    pass
                try:
                    user.delete()
                except Exception:
                    pass
                return None
    except Exception:
        pass
    return user
