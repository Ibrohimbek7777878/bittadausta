# DEPLOY MANIFEST — 2026-09-23 (Taklif + Demo + Admin + Tarif UI)

Server: `/home/user/mebelcity_platform` (Bittada Usta, client_erp)
Manba (OpenCode nusxa): `/home/ibrohim/Desktop/bitada-usta/usta-bittada-uz-kod`

## TARTIB
1. `new-files/` dagi 4 ta YANGI faylni repo ichidagi o‘sha yo‘llarga nusxalang.
2. Quyidagi 11 ta O‘ZGARTIRISHni har bir faylning ko‘rsatilgan joyiga qo‘ying (anchor = prod kodidan topiladi).
3. Migratsiyani qayta nomlang (5-bo‘lim).
4. `migrate` (4 ta DB) → `check_limits_exceeded` → gating → cron → restart.

## YANGI FAYLLAR (`new-files/` → repo ildizidan nusxalash)
- `client_erp/services/team_invites.py`
- `client_erp/management/commands/purge_demos.py`
- `client_erp/management/commands/check_limits_exceeded.py`
- `client_erp/migrations/0069_invite_demo_admin.py` (NOMINI ALMASHTIRING — 5-bo‘lim)

---
## 1. `client_erp/models/team.py` — fayl OXIRIGA qo‘shish (2 ta model)
Anchor: faylning eng oxirgi qatori. Mavjud kodga TEGILMAYDI.
```
class ClientPendingInvite(models.Model):
    """Jamoa taklifi — RO'YXATDAN O'TMAGAN odamga (2026-09-23, additive).

    Oqim: usta ism+nomer kiritadi -> odam topilmasa, a'zo QO'SHILMAYDI,
    o'rniga shu yozuv yaratiladi (status='waiting') + taklif havolasi
    ko'rsatiladi. Odam ro'yxatdan o'tishi bilan (telefon mos kelsa)
    avtomatik jamoaga qo'shiladi, status='registered' bo'ladi.
    Hech qanday mavjud modelga tegilmaydi.
    """
    STATUS_CHOICES = [
        ('waiting', 'Kutilmoqda'),
        ('registered', "Ro'yxatdan o'tdi"),
        ('cancelled', 'Bekor qilingan'),
    ]
    team = models.ForeignKey(ClientTeam, on_delete=models.CASCADE, related_name='pending_invites')
    inviter = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='sent_invites')
    phone = models.CharField(max_length=20, verbose_name="Taklif qilingan nomer")
    name = models.CharField(max_length=200, verbose_name="Taklif qilingan ism")
    role = models.CharField(max_length=10, default='worker')
    profit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='waiting', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    registered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Kutilayotgan taklif"
        verbose_name_plural = "Kutilayotgan takliflar"

    def __str__(self):
        return f"{self.name} ({self.phone}) -> {self.team}"
```

---
## 2. `client_erp/models/user.py` — 3 ta maydon
Anchor: `telegram_username = models.CharField(...)` qatoridan KEYIN, `# ── Gamifikatsiya ──` dan OLDIN qo‘ying:
```
    # ── Demo akkaunt (2026-09-23, additive) ──────────────────────────
    # 24 soatlik vaqtinchalik akkaunt. Muddati o'tgach user + BARCHA
    # datasi to'liq o'chadi (CASCADE + fayl tozalash). Real akkaunt
    # ochilganda shu qator convert qilinadi (data ko'chadi = o'zida qoladi).
    is_demo = models.BooleanField(default=False, verbose_name="Demo akkaunt")
    demo_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Demo tugash vaqti")

    # ── Ilova admini (2026-09-23, additive) ──────────────────────────
    # Bosh admin (+998945876003) kodda zahiralangan; qo'shimcha adminlar
    # shu bayroq bilan belgilanadi (jami max 3 ta). Admin ilova ichidan
    # sozlamalarni o'zgartiradi (AppSetting) va admin tayinlaydi.
    is_app_admin = models.BooleanField(default=False, verbose_name="Ilova admini")
```

---
## 3. `client_erp/models/__init__.py` — import kengaytirish
Toping (`from .team import (...)` ichida):
```
    ClientStandingShare, ClientProfitPerson, ClientMonthEndReminderLog,
    ClientProfitAudit,
```
Almashtiring:
```
    ClientStandingShare, ClientProfitPerson, ClientMonthEndReminderLog,
    ClientProfitAudit, ClientPendingInvite, AppSetting,
```

---
## 4. `client_erp/consumers.py` — 4 ta o‘zgarish

### 4a. `handle_page_team` — `pending` kaliti
Anchor: `return {` ichidagi `'team': {` dict — `'members': active_members, 'invitations': invitations,` qatoridan KEYIN vergul bilan qo‘ying:
```
                    # Kutilayotgan takliflar (ro'yxatdan o'tmaganlarga, 2026-09-23, additive)
                    'pending': [{
                        'id': p.id, 'name': p.name, 'phone': p.phone,
                        'role': p.role,
                    } for p in team_obj.pending_invites.filter(status='waiting').order_by('-created_at')],
                },
                'profit_templates': templates,
```

### 4b. `handle_team_invite` — BUTUN funksiyani almashtiring
Anchor: `async def handle_team_invite` dan `async def handle_team_update_member` GACHA (topilgan yo‘l o‘zgarishsiz, faqat topilmagan yo‘l yangi):
```
    async def handle_team_invite(self, data):
        @database_sync_to_async
        def _invite():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam, ClientTeamMember
            from client_erp.models import ClientUser
            team = self._get_user_team()
            if not team: return None, 'Jamoa topilmadi'
            q = data.get('query', '').strip()
            user = None
            try: user = ClientUser.objects.get(phone=q)
            except ClientUser.DoesNotExist:
                try: user = ClientUser.objects.get(username=q)
                except ClientUser.DoesNotExist: pass
            if not user:
                # ── 2026-09-23 (additive): ro'yxatdan o'tmagan — a'zo
                # QO'SHILMAYDI. O'rniga kutilayotgan taklif yaratiladi +
                # ulashish uchun havolalar qaytariladi.
                from client_erp.models.team import ClientPendingInvite
                from client_erp.services.team_invites import (
                    norm_phone, invite_links, invite_text)
                name = (data.get('name') or q).strip()[:200]
                phone = norm_phone(q)
                if not phone:
                    return None, 'Telefon raqam noto‘g‘ri'
                pend = ClientPendingInvite.objects.filter(
                    team=team, phone=phone, status='waiting').first()
                if not pend:
                    pend = ClientPendingInvite.objects.create(
                        team=team, inviter=self.user, phone=phone, name=name,
                        role=data.get('role', 'worker'),
                        profit_percent=float(data.get('profit_percent', 0)),
                        status='waiting',
                    )
                links = invite_links(self.user)
                owner_name = self.user.full_name or self.user.username
                return {'not_registered': True, 'pending_id': pend.id,
                        'phone': phone, 'name': pend.name,
                        'links': links,
                        'text': invite_text(team.name, owner_name, links)}, None
            if ClientTeamMember.objects.filter(team=team, user=user).exists():
                return None, 'Bu foydalanuvchi allaqachon jamoada'
            # Tarif limiti: jamoa a'zolari soni (limits o'chiq bo'lsa shaffof).
            from client_erp.services import limits
            _ok, _info = limits.guard(self.user, 'team_members')
            if not _ok:
                return None, _info['message']
            ClientTeamMember.objects.create(
                team=team, user=user, role=data.get('role', 'worker'),
                profit_percent=float(data.get('profit_percent', 0)), status='invited',
            )
            from client_erp.services.notifications import notify_team_invite
            owner_name = self.user.full_name or self.user.username
            notify_team_invite(user, team.name, owner_name)
            return user.pk, None
        payload, err = await _invite()
        if err: return {'ok': False, 'error': err}
        if isinstance(payload, dict) and payload.get('not_registered'):
            payload = dict(payload)
            payload.pop('not_registered')
            return {'ok': False, 'code': 'USER_NOT_REGISTERED',
                    'error': 'Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan',
                    'invite': payload}
        return {'ok': True}
```

### 4c. Yangi handlerlar — 4b dan KEYIN, `handle_team_update_member` dan OLDIN qo‘ying
```
    async def handle_team_pending_list(self, data):
        """Kutilayotgan takliflar ro'yxati (2026-09-23, additive)."""
        @database_sync_to_async
        def _get():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientPendingInvite
            team = self._get_user_team()
            if not team: return []
            return [{
                'id': p.id, 'name': p.name, 'phone': p.phone, 'role': p.role,
            } for p in ClientPendingInvite.objects.filter(
                team=team, status='waiting').order_by('-created_at')]
        return {'ok': True, 'data': await _get()}

    async def handle_team_pending_cancel(self, data):
        """Kutilayotgan taklifni bekor qilish (2026-09-23, additive)."""
        @database_sync_to_async
        def _cancel():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientPendingInvite
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            try: pid = int(data.get('pending_id', 0))
            except (TypeError, ValueError): return 'Noto‘g‘ri ID'
            p = ClientPendingInvite.objects.filter(
                id=pid, team=team, status='waiting').first()
            if not p: return 'Taklif topilmadi'
            p.status = 'cancelled'
            p.save(update_fields=['status'])
            return None
        err = await _cancel()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}
```

### 4d. Admin handlerlar — `handle_team_delete_template` dan KEYIN, `handle_team_accept` dan OLDIN qo‘ying
```
    def _require_admin(self):
        from client_erp.services.team_invites import is_admin
        if not is_admin(self.user):
            return 'Ruxsat yo‘q (admin kerak)'
        return None

    async def handle_admin_settings_get(self, data):
        @database_sync_to_async
        def _get():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            err = self._require_admin()
            if err: return None, err
            from client_erp.services.team_invites import (
                get_setting, DEFAULT_PLAY_URL, DEFAULT_BOT_URL)
            return {'invite_play_url': get_setting('invite_play_url', DEFAULT_PLAY_URL),
                    'invite_bot_url': get_setting('invite_bot_url', DEFAULT_BOT_URL)}, None
        payload, err = await _get()
        if err: return {'ok': False, 'error': err}
        return {'ok': True, 'data': payload}

    async def handle_admin_settings_set(self, data):
        @database_sync_to_async
        def _set():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            err = self._require_admin()
            if err: return err
            from client_erp.services.team_invites import set_setting
            allowed = ('invite_play_url', 'invite_bot_url')
            saved = 0
            for k in allowed:
                v = data.get(k)
                if v is not None:
                    set_setting(k, str(v).strip()[:500], self.user)
                    saved += 1
            if not saved: return 'Hech narsa saqlanmadi'
            return None
        err = await _set()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_admin_admins_list(self, data):
        @database_sync_to_async
        def _get():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            err = self._require_admin()
            if err: return None, err
            from client_erp.models import ClientUser
            from client_erp.services.team_invites import (
                CHIEF_ADMIN_PHONE, MAX_ADMINS, norm_phone, admin_count,
                has_platform_admin_field)
            out = []
            try:
                from django.db.models import Q
                _q = Q(is_app_admin=True)
                if has_platform_admin_field():
                    _q = _q | Q(is_platform_admin=True)
                _users = ClientUser.objects.filter(_q).order_by('full_name')
            except Exception:
                _users = ClientUser.objects.filter(is_app_admin=True).order_by('full_name')
            for u in _users:
                out.append({'id': u.id, 'name': u.full_name or u.username,
                            'phone': u.phone or '',
                            'chief': norm_phone(u.phone) == CHIEF_ADMIN_PHONE})
            if not any(o['chief'] for o in out):
                chief = ClientUser.objects.filter(phone=CHIEF_ADMIN_PHONE).first()
                if chief:
                    out.append({'id': chief.id, 'name': chief.full_name or chief.username,
                                'phone': chief.phone or '', 'chief': True})
            return {'admins': out, 'max': MAX_ADMINS,
                    'count': admin_count()}, None
        payload, err = await _get()
        if err: return {'ok': False, 'error': err}
        return {'ok': True, 'data': payload}

    async def handle_admin_admin_add(self, data):
        @database_sync_to_async
        def _add():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            err = self._require_admin()
            if err: return err
            from client_erp.models import ClientUser
            from client_erp.services.team_invites import (
                MAX_ADMINS, CHIEF_ADMIN_PHONE, norm_phone, admin_count,
                set_admin_flags)
            q = (data.get('query') or '').strip()
            if not q: return 'Telefon/username kiritilmagan'
            u = ClientUser.objects.filter(phone=q).first()
            if not u:
                u = ClientUser.objects.filter(username=q).first()
            if not u: return 'Foydalanuvchi topilmadi: ' + q
            if getattr(u, 'is_app_admin', False) or norm_phone(u.phone) == CHIEF_ADMIN_PHONE:
                return 'Bu foydalanuvchi allaqachon admin'
            if admin_count() >= MAX_ADMINS:
                return 'Adminlar soni to‘ldi (max %d)' % MAX_ADMINS
            fields = set_admin_flags(u, True)
            if fields:
                u.save(update_fields=fields)
            else:
                return 'Admin maydoni topilmadi'
            return None
        err = await _add()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_admin_admin_remove(self, data):
        @database_sync_to_async
        def _remove():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            err = self._require_admin()
            if err: return err
            from client_erp.models import ClientUser
            from client_erp.services.team_invites import (
                CHIEF_ADMIN_PHONE, norm_phone, set_admin_flags)
            try: uid = int(data.get('user_id', 0))
            except (TypeError, ValueError): return 'Noto‘g‘ri ID'
            u = ClientUser.objects.filter(pk=uid).first()
            if not u: return 'Foydalanuvchi topilmadi'
            if norm_phone(u.phone) == CHIEF_ADMIN_PHONE:
                return 'Bosh adminni o‘chirib bo‘lmaydi'
            fields = set_admin_flags(u, False)
            if fields:
                u.save(update_fields=fields)
            return None
        err = await _remove()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}
```

---
## 5. `client_erp/views/auth.py` — 3 ta o‘zgarish

### 5a. `mini_register` — demo convert (mavjud `u = ClientUser(` o‘rniga)
Anchor: `username = ClientUser.generate_username(full_name)` dan `u.set_password(password)` GACHA almashtiring:
```
    username = ClientUser.generate_username(full_name)
    password = _secrets.token_urlsafe(9)
    # ── 2026-09-23 (additive): sessiyada demo user bo'lsa — YANGI qator
    # emas, o'sha qator convert qilinadi (datasi ko'chadi = o'zida qoladi).
    demo_user = None
    try:
        me = get_client_user(request)
        if me and getattr(me, 'is_demo', False):
            from django.utils import timezone as _tz
            if not me.demo_expires_at or me.demo_expires_at > _tz.now():
                demo_user = me
    except Exception:
        demo_user = None
    if demo_user is not None:
        u = demo_user
        u.phone = phone
        u.username = username
        u.full_name = full_name[:200]
        u.organization = organization[:200]
        u.is_active = True
        u.is_verified = True
        u.is_demo = False
        u.demo_expires_at = None
        u.oferta_accepted = True
        u.oferta_accepted_at = timezone.now()
    else:
        u = ClientUser(
            phone=phone, username=username, full_name=full_name[:200],
            organization=organization[:200], is_active=True, is_verified=True,
            oferta_accepted=True, oferta_accepted_at=timezone.now(),
        )
```

### 5b. `mini_register` — claim (`_credit_referrer(...)` dan KEYIN qo‘ying)
```
                    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=user)
                    return _do_login(user)
                else:
                    error = "Parol noto'g'ri"
                    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
            except ClientUser.DoesNotExist:
                error = "Bu raqam ro'yxatdan o'tmagan"
                ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
        else:
            error = "Telefon va parolni kiriting"

    return render(request, 'client_erp/auth/login.html', {'error': error})


# ═══════════════════════════════════════════════════════════════════════
#  TELEGRAM GATEWAY OTP — web-login verifikatsiya (rasmiy Telegram Gateway)
#  Telefon → Telegram'ga OTP kod → kod kiritiladi → login. Bot ochish SHART EMAS.
#  Telegrami yo'q / Gateway yetmasa → parol-fallback.
# ═══════════════════════════════════════════════════════════════════════
from django.views.decorators.csrf import csrf_exempt

_LOGIN_KEY = 'ce_login_otp_{}'
_LOGIN_TTL = 360  # 6 daqiqa (kod ttl 300 + zapas)
_GW_URL = 'https://gatewayapi.telegram.org'


def _gw_token():
    from django.conf import settings
    return getattr(settings, 'TELEGRAM_GATEWAY_TOKEN', '') or ''


def _gateway_send(phone):
    """Telegram Gateway orqali OTP kod yuboradi. Returns request_id yoki None.
    phone '+998...' → Gateway raqamni faqat digit ('998...') sifatida kutadi."""
    token = _gw_token()
    if not token:
        return None
    digits = ''.join(c for c in phone if c.isdigit())
    try:
        r = http_requests.post(
            f"{_GW_URL}/sendVerificationMessage",
            headers={"Authorization": f"Bearer {token}"},
            data={"phone_number": digits, "code_length": 6, "ttl": 300},
            timeout=15,
        )
        d = r.json()
        rid = (d.get('result') or {}).get('request_id')
        if d.get('ok') and rid:
            return rid
        logger.warning("Gateway send xato: %s", d)
        return None
    except Exception as e:  # noqa: BLE001
        logger.error("Gateway send istisno: %s", e)
        return None


def _gateway_check(request_id, code):
    """Kiritilgan kodni tekshiradi. Returns True agar 'code_valid'."""
    token = _gw_token()
    if not token:
        return False
    try:
        r = http_requests.post(
            f"{_GW_URL}/checkVerificationStatus",
            headers={"Authorization": f"Bearer {token}"},
            data={"request_id": request_id, "code": code},
            timeout=15,
        )
        d = r.json()
        vs = (d.get('result') or {}).get('verification_status') or {}
        return bool(d.get('ok') and vs.get('status') == 'code_valid')
    except Exception as e:  # noqa: BLE001
        logger.error("Gateway check istisno: %s", e)
        return False


def _send_login_button_via_bot(chat_id, confirm_url):
    """Bot orqali «✅ Kirishni tasdiqlash» URL-tugmasini yuboradi (BEPUL — Bot API).

    Returns True agar yuborilgan bo'lsa. Telegram Gateway (pulli) dan farqli —
    bu bot orqali, balans kerak emas. Faqat chat_id (botdan ro'yxatdan o'tgan)
    borlar uchun ishlaydi."""
    bot_token = _get_bot_token()
    if not bot_token or not chat_id:
        return False
    text = (
        "🔐 <b>Bittada Usta — kirish so'rovi</b>\n\n"
        "Agar bu <b>siz</b> bo'lsangiz, kirishni tasdiqlang. "
        "Agar siz emas bo'lsangiz — bu xabarni e'tiborsiz qoldiring."
    )
    kb = {'inline_keyboard': [[{'text': '✅ Kirishni tasdiqlash', 'url': confirm_url}]]}
    try:
        r = http_requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML', 'reply_markup': kb},
            timeout=10,
        )
        return bool((r.json() or {}).get('ok'))
    except Exception as e:  # noqa: BLE001
        logger.error("Login tugma yuborishda xato: %s", e)
        return False


def _sms_send_code(phone, code):
    """Eskiz orqali tasdiqlash kodini SMS qilib yuboradi. True agar yuborilgan bo'lsa.

    Shablon (Eskiz'da tasdiqlangan bo'lishi kerak):
      «Mebel-City Bittada platformasiga kirish uchun tasdiqlash kodi: XXXX. Kodni hech kimga bermang.»
    """
    try:
        from sms_service.client import send_sms
        msg = ("Mebel-City Bittada platformasiga kirish uchun tasdiqlash kodi: "
               f"{code}. Kodni hech kimga bermang.")
        r = send_sms(phone, msg, source='login') or {}
        if r.get('error'):
            logger.warning("SMS login xato: %s", r.get('error'))
            return False
        return True
    except Exception as e:  # noqa: BLE001
        logger.error("SMS login istisno: %s", e)
        return False


@csrf_exempt
def mini_login_start(request):
    """POST /mini/login/start/ — AJAX. Telefon + `method` (bot|otp|sms) qabul qiladi.

    HYBRID (2026-07-14) — foydalanuvchi USULNI TANLAYDI (qo'lda parol yo'q):
      method='bot' → Telegram BOT «✅ Kirish» tugma (bepul, chat_id kerak) → poll.
      method='otp' → Telegram Gateway OTP kod (pulli).
      method='sms' → Eskiz SMS kod (pulli).
      probe=True   → mavjud usullarni qaytaradi (has_telegram).
    method berilmasa — eski avto-hybrid (bot→otp→parol) saqlanadi (orqaga-mos)."""
    from django.http import JsonResponse
    import secrets
    from django.core.cache import cache

    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    phone = _normalize_phone((body.get('phone') or '').strip())
    password = (body.get('password') or '')
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')

    if not phone:
        return JsonResponse({'ok': False, 'error': 'Telefon raqamini kiriting'})
    if ClientLoginAttempt.is_blocked(phone):
        return JsonResponse({'ok': False, 'error': "Juda ko'p urinish. Keyinroq urining."})

    try:
        user = ClientUser.objects.get(phone=phone)
    except ClientUser.DoesNotExist:
        user = None   # YANGI raqam → ro'yxatdan o'tish oqimiga o'tadi

    if user is not None:
        if not user.is_active:
            return JsonResponse({'ok': False, 'error': 'Hisob faol emas'})
        if user.is_blocked:
            return JsonResponse({'ok': False, 'error': "Hisob bloklangan. Admin bilan bog'laning."})

    # 1) Parol berilgan bo'lsa — parol-login (faqat mavjud user)
    if password and user is not None:
        if not user.is_verified:
            return JsonResponse({'ok': False, 'error': 'Hisob hali tasdiqlanmagan.'})
        if user.check_password(password):
            ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=user)
            return _do_login_json(user)
        ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
        return JsonResponse({'ok': False, 'error': "Parol noto'g'ri"})

    method = (body.get('method') or '').strip().lower()

    def _new_token(payload):
        tk = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(tk), payload, _LOGIN_TTL)
        return tk

    # Probe — frontend usullarni + raqam yangimi biladi (yangi bo'lsa registratsiya)
    if body.get('probe'):
        return JsonResponse({'ok': True, 'register': user is None,
                             'has_telegram': bool(user and getattr(user, 'telegram_chat_id', None))})

    # ── YANGI RAQAM → ro'yxatdan o'tish uchun tasdiqlash kodi (SMS yoki Telegram-kod) ──
    if user is None:
        # Referral kod (do'stning ulashish havolasidan ?ref=) — ro'yxatdan
        # o'tish oxirigacha token orqali ko'chib boradi (mini_register da ishlatiladi).
        ref_code = (body.get('ref') or '').strip()[:20]
        if method == 'sms':
            code = ''.join(secrets.choice('0123456789') for _ in range(4))
            tk = _new_token({'register': True, 'phone': phone, 'mode': 'sms', 'code': code, 'attempts': 0, 'verified': False, 'ref': ref_code})
            if _sms_send_code(phone, code):
                return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'sms', 'register': True})
            cache.delete(_LOGIN_KEY.format(tk))
            return JsonResponse({'ok': False, 'error': "SMS yuborilmadi. Boshqa usulni tanlang."})
        if method == 'otp':
            request_id = _gateway_send(phone)
            if request_id:
                tk = _new_token({'register': True, 'phone': phone, 'mode': 'otp', 'request_id': request_id, 'attempts': 0, 'verified': False, 'ref': ref_code})
                return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'otp', 'register': True})
            return JsonResponse({'ok': False, 'error': "Telegram kod yuborilmadi. SMS tanlang."})
        # method yo'q / bot — SMS yoki OTP tanlashni so'raymiz (yangi raqamda bot yo'q)
        return JsonResponse({'ok': True, 'register': True, 'choose': True})

    # ── Foydalanuvchi TANLAGAN aniq usul ──
    if method == 'sms':
        code = ''.join(secrets.choice('0123456789') for _ in range(4))
        tk = _new_token({'user_id': user.pk, 'phone': phone, 'mode': 'sms', 'code': code, 'attempts': 0})
        if _sms_send_code(phone, code):
            return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'sms'})
        cache.delete(_LOGIN_KEY.format(tk))
        return JsonResponse({'ok': False, 'error': "SMS yuborilmadi. Boshqa usulni tanlang."})

    if method == 'bot':
        chat_id = getattr(user, 'telegram_chat_id', None)
        if not chat_id:
            return JsonResponse({'ok': False, 'error': "Telegram ulanmagan. SMS yoki OTP tanlang."})
        tk = _new_token({'user_id': user.pk, 'phone': phone, 'mode': 'bot', 'confirmed': False})
        confirm_url = request.build_absolute_uri(f'/mini/login/confirm/{tk}/')
        if _send_login_button_via_bot(chat_id, confirm_url):
            return JsonResponse({'ok': True, 'bot_sent': True, 'token': tk})
        cache.delete(_LOGIN_KEY.format(tk))
        return JsonResponse({'ok': False, 'error': "Telegram tugma yuborilmadi."})

    if method == 'otp':
        request_id = _gateway_send(phone)
        if request_id:
            tk = _new_token({'user_id': user.pk, 'request_id': request_id, 'phone': phone, 'attempts': 0, 'mode': 'otp'})
            return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'otp'})
        return JsonResponse({'ok': False, 'error': "Telegram OTP yuborilmadi (balans/raqam)."})

    # 2) BOT «✅ Kirish» tugma (BEPUL — Bot API, balans kerak emas).
    #    telegram_chat_id bor (botdan ro'yxatdan o'tgan) bo'lsa BIRINCHI shu ishlatiladi.
    chat_id = getattr(user, 'telegram_chat_id', None)
    if chat_id:
        token = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(token),
                  {'user_id': user.pk, 'phone': phone, 'mode': 'bot', 'confirmed': False},
                  _LOGIN_TTL)
        confirm_url = request.build_absolute_uri(f'/mini/login/confirm/{token}/')
        if _send_login_button_via_bot(chat_id, confirm_url):
            return JsonResponse({'ok': True, 'bot_sent': True, 'token': token})
        cache.delete(_LOGIN_KEY.format(token))  # bot yubora olmadi → Gateway'ga o'tamiz

    # 3) Telegram Gateway OTP (chat_id yo'q / bot yubora olmadi; PULLI — balans bo'lsa).
    request_id = _gateway_send(phone)
    if request_id:
        token = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(token),
                  {'user_id': user.pk, 'request_id': request_id, 'phone': phone,
                   'attempts': 0, 'mode': 'otp'},
                  _LOGIN_TTL)
        return JsonResponse({'ok': True, 'code_sent': True, 'token': token})

    # 4) Hech biri ishlamadi → parol fallback
    return JsonResponse({'ok': True, 'need_password': True,
                         'error': "Telegram orqali yuborilmadi — parol bilan kiring."})


@csrf_exempt
def mini_login_verify(request):
    """POST /mini/login/verify/ {token, code} — Telegram Gateway OTP kodni tekshiradi → login."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    code = ''.join(c for c in (body.get('code') or '') if c.isdigit())
    key = _LOGIN_KEY.format(token)
    data = cache.get(key) if token else None
    if data is None:
        return JsonResponse({'ok': False, 'error': "Muddat tugagan. Qayta boshlang.", 'expired': True})
    if len(code) < 4:
        return JsonResponse({'ok': False, 'error': "Kodni to'liq kiriting"})
    # Urinishlar cheklovi (5 marta)
    data['attempts'] = data.get('attempts', 0) + 1
    if data['attempts'] > 5:
        cache.delete(key)
        return JsonResponse({'ok': False, 'error': "Juda ko'p urinish. Qayta boshlang.", 'expired': True})
    cache.set(key, data, _LOGIN_TTL)

    mode = data.get('mode', 'otp')
    if mode == 'sms':
        ok = bool(data.get('code')) and str(code) == str(data.get('code'))
    else:
        ok = _gateway_check(data.get('request_id'), code)

    # ── YANGI RAQAM (registratsiya): kod to'g'ri → login QILMAYMIZ, ma'lumot so'raymiz ──
    if data.get('register'):
        if not ok:
            return JsonResponse({'ok': False, 'error': "Kod noto'g'ri"})
        data['verified'] = True
        cache.set(key, data, _LOGIN_TTL)
        return JsonResponse({'ok': True, 'register': True, 'token': token})

    if ok:
        try:
            user = ClientUser.objects.get(pk=data['user_id'])
        except ClientUser.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'Foydalanuvchi topilmadi'})
        cache.delete(key)  # bir martalik
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        ClientLoginAttempt.objects.create(phone=data.get('phone', ''), ip_address=ip, success=True, login_type='web', user=user)
        return _do_login_json(user)
    return JsonResponse({'ok': False, 'error': "Kod noto'g'ri"})


def mini_login_confirm(request, token):
    """GET /mini/login/confirm/<token>/ — bot «✅ Kirish» tugmasi bosilganda.

    Cache token'ni confirmed=True qiladi (login sahifasi poll orqali biladi) VA
    shu brauzerni ham darhol kiritadi (agar foydalanuvchi tugmani shu qurilmada
    bossa — telefonda — to'g'ridan-to'g'ri /spa/ ga o'tadi)."""
    from django.core.cache import cache
    key = _LOGIN_KEY.format((token or '').strip())
    data = cache.get(key)
    if not data or data.get('mode') != 'bot':
        return render(request, 'client_erp/auth/login.html', {
            'error': "Havola eskirgan yoki noto'g'ri. Qaytadan urinib ko'ring.",
        })
    try:
        user = ClientUser.objects.get(pk=data['user_id'], is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return render(request, 'client_erp/auth/login.html', {'error': "Foydalanuvchi topilmadi."})
    # Poll uchun tasdiqlanган deb belgilaymiz (login sahifasi shu orqali kiradi).
    data['confirmed'] = True
    cache.set(key, data, _LOGIN_TTL)
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=data.get('phone', ''), ip_address=ip,
                                      success=True, login_type='web', user=user)
    # Shu brauzerni kiritamiz (bir qurilmali oqim uchun).
    return _do_login(user)


@csrf_exempt
def mini_login_status(request):
    """POST /mini/login/status/ {token} — bot tugma tasdiqini POLL qiladi.

    Boshqa qurilmada (masalan telefon) tugma bosilib confirmed=True bo'lsa —
    shu (login boshlangan) brauzerni ham kiritadi (JWT cookie)."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    key = _LOGIN_KEY.format(token)
    data = cache.get(key) if token else None
    if data is None:
        return JsonResponse({'ok': False, 'error': "Muddat tugadi", 'expired': True})
    if not data.get('confirmed'):
        return JsonResponse({'ok': True, 'pending': True})
    try:
        user = ClientUser.objects.get(pk=data['user_id'], is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Foydalanuvchi topilmadi'})
    cache.delete(key)  # bir martalik
    return _do_login_json(user)


@csrf_exempt
def mini_register(request):
    """POST /mini/login/register/ {token, full_name, organization} — kod tasdiqlangач
    yangi ClientUser yaratadi (telefon o'zgarmaydi) va darhol login qiladi. Oferta
    formada qabul qilinadi → oferta_accepted=True."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    data = cache.get(_LOGIN_KEY.format(token)) if token else None
    if not data or not data.get('register') or not data.get('verified'):
        return JsonResponse({'ok': False, 'error': "Tasdiqlanmagan. Qaytadan boshlang.", 'expired': True})
    phone = data.get('phone') or ''
    full_name = (body.get('full_name') or '').strip()
    if len(full_name) < 2:
        return JsonResponse({'ok': False, 'error': "Ism-familiyani kiriting"})
    organization = (body.get('organization') or '').strip()
    if ClientUser.objects.filter(phone=phone).exists():
        cache.delete(_LOGIN_KEY.format(token))
        return JsonResponse({'ok': False, 'error': "Bu raqam allaqachon ro'yxatdan o'tgan"})

    import secrets as _secrets
    username = ClientUser.generate_username(full_name)
    password = _secrets.token_urlsafe(9)
    # ── 2026-09-23 (additive): sessiyada demo user bo'lsa — YANGI qator
    # emas, o'sha qator convert qilinadi (datasi ko'chadi = o'zida qoladi).
    demo_user = None
    try:
        me = get_client_user(request)
        if me and getattr(me, 'is_demo', False):
            from django.utils import timezone as _tz
            if not me.demo_expires_at or me.demo_expires_at > _tz.now():
                demo_user = me
    except Exception:
        demo_user = None
    if demo_user is not None:
        u = demo_user
        u.phone = phone
        u.username = username
        u.full_name = full_name[:200]
        u.organization = organization[:200]
        u.is_active = True
        u.is_verified = True
        u.is_demo = False
        u.demo_expires_at = None
        u.oferta_accepted = True
        u.oferta_accepted_at = timezone.now()
    else:
        u = ClientUser(
            phone=phone, username=username, full_name=full_name[:200],
            organization=organization[:200], is_active=True, is_verified=True,
            oferta_accepted=True, oferta_accepted_at=timezone.now(),
        )
    u.set_password(password)
    try:
        client_obj = _find_or_link_client(phone)
        if client_obj:
            u.client = client_obj
    except Exception:
        pass
    u.save()
    cache.delete(_LOGIN_KEY.format(token))
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=u)
    _credit_referrer(data.get('ref'), u)
    # ── 2026-09-23 (additive): kutilayotgan jamoa takliflarini bajarish
    try:
        from client_erp.services.team_invites import claim_pending_invites
        claim_pending_invites(u)
    except Exception:
        pass
    return _do_login_json(u)
```

### 5c. `demo_login` — `_credit_referrer` funksiyasidan OLDIN, yangi view sifatida qo‘ying
ESLATMA: `@csrf_exempt` dekoratori SHART (atrofdagi viewlar kabi). `json`, `timezone`, `ClientUser`, `generate_token`, `_do_login_json`, `ClientLoginAttempt` — barchasi faylda bor.
```
@csrf_exempt
def demo_login(request):
    """POST /mini/login/demo/ — 24 soatlik demo akkaunt (2026-09-23, additive).

    Tasodifiy mehmon yaratadi (birovning akkauntiga kirmaydi), 24 soatdan
    keyin user + BARCHA datasi to'liq o'chadi. Hech qanday tasdiqlash
    (SMS/parol) kerak emas.
    """
    from django.http import JsonResponse
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    import secrets as _secrets
    from datetime import timedelta
    for _ in range(5):
        tag = _secrets.token_hex(4)
        phone = 'demo_+%s' % tag
        username = 'demo_' + tag
        if not ClientUser.objects.filter(phone=phone).exists() and \
                not ClientUser.objects.filter(username=username).exists():
            break
    else:
        return JsonResponse({'ok': False, 'error': 'Qayta urining'})
    u = ClientUser(
        phone=phone, username=username, full_name='Mehmon',
        is_active=True, is_verified=True,
        is_demo=True, demo_expires_at=timezone.now() + timedelta(hours=24),
    )
    u.set_password(_secrets.token_urlsafe(16))
    u.save()
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    try:
        ClientLoginAttempt.objects.create(
            phone=phone, ip_address=ip, success=True, login_type='web', user=u)
    except Exception:
        pass
    return _do_login_json(u)
```

### 5d. Telegram register — `new_user.save()` dan keyin, `token = generate_token(new_user)` dan OLDIN
Anchor: `success=True, login_type='telegram', user=new_user,` blokidan keyin qo‘ying:
```
    # ── 2026-09-23 (additive): kutilayotgan jamoa takliflarini bajarish
    try:
        from client_erp.services.team_invites import claim_pending_invites
        claim_pending_invites(u)
    except Exception:
        pass
    return _do_login_json(u)


@csrf_exempt
def demo_login(request):
    """POST /mini/login/demo/ — 24 soatlik demo akkaunt (2026-09-23, additive).

    Tasodifiy mehmon yaratadi (birovning akkauntiga kirmaydi), 24 soatdan
    keyin user + BARCHA datasi to'liq o'chadi. Hech qanday tasdiqlash
    (SMS/parol) kerak emas.
    """
    from django.http import JsonResponse
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    import secrets as _secrets
    from datetime import timedelta
    for _ in range(5):
        tag = _secrets.token_hex(4)
        phone = 'demo_+%s' % tag
        username = 'demo_' + tag
        if not ClientUser.objects.filter(phone=phone).exists() and \
                not ClientUser.objects.filter(username=username).exists():
            break
    else:
        return JsonResponse({'ok': False, 'error': 'Qayta urining'})
    u = ClientUser(
        phone=phone, username=username, full_name='Mehmon',
        is_active=True, is_verified=True,
        is_demo=True, demo_expires_at=timezone.now() + timedelta(hours=24),
    )
    u.set_password(_secrets.token_urlsafe(16))
    u.save()
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    try:
        ClientLoginAttempt.objects.create(
            phone=phone, ip_address=ip, success=True, login_type='web', user=u)
    except Exception:
        pass
    return _do_login_json(u)


def _credit_referrer(ref_code, new_user):
    """Do'stni taklif qilgan foydalanuvchiga (referral_code egasiga) yangi
    a'zo ilovaga kirgach XP+tanga beradi. ref_code bo'sh/topilmasa jim o'tadi."""
    ref_code = (ref_code or '').strip()
    if not ref_code:
        return
    try:
        referrer = ClientUser.objects.filter(referral_code=ref_code).exclude(pk=new_user.pk).first()
        if not referrer:
            return
        referrer.referral_count = (referrer.referral_count or 0) + 1
        referrer.xp += 30
        referrer.coins += 20
        referrer.coins_total_earned += 20
        referrer.save(update_fields=['referral_count', 'xp', 'coins', 'coins_total_earned'])
        from client_erp.services.gamification import _check_level_up
        _check_level_up(referrer)
        from client_erp.services.realtime import push_wallet_update
        push_wallet_update(referrer)
        from client_erp.services.notifications import notify_referral_joined
        notify_referral_joined(referrer, new_user.full_name)
    except Exception:
        logging.getLogger(__name__).exception("Referral credit xato")


def mini_logout(request):
    """GET /mini/logout/"""
    response = redirect('/mini/login/')
    response.set_cookie(TOKEN_COOKIE, '', max_age=0, httponly=True, samesite='Lax')
    return response


def mini_auto_login(request, token):
    """GET /mini/auto/<token>/ — Telegram dan brauzerga avtomatik kirish."""
    from django.core import signing
    try:
        data = signing.loads(token)
    except signing.BadSignature:
        return render(request, 'client_erp/auth/login.html', {
            'error': "Havola eskirgan yoki noto'g'ri. Botdan yangi link oling.",
        })
    chat_id = data.get('cid')
    if not chat_id:
        return render(request, 'client_erp/auth/login.html', {'error': "Noto'g'ri havola."})
    try:
        user = ClientUser.objects.get(telegram_chat_id=chat_id, is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return render(request, 'client_erp/auth/login.html', {
            'error': "Foydalanuvchi topilmadi. Avval Telegram orqali ro'yxatdan o'ting.",
        })
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=user.phone, ip_address=ip, success=True, login_type='qr', user=user)
    # `?tg=1` saqlab qolinadi — Telegram WebApp skripti keyingi SPA
    # sahifasida ham yuklansin (2026-09-03, laylo_handler.py bilan bir xil).
    _redirect = f'/mini/{user.username}/spa/?tg=1' if request.GET.get('tg') == '1' else None
    return _do_login(user, redirect_url=_redirect)


def generate_auto_login_token(telegram_chat_id):
    """Telegram chat_id uchun doimiy signed token yaratadi."""
    from django.core import signing
    return signing.dumps({'cid': telegram_chat_id})


# ===========================================================================
# TELEGRAM WEBAPP AUTH
# ===========================================================================

def _get_bot_token():
    """DB dan birinchi faol bot tokenini oladi."""
    try:
        from telegram_bot.models import Bot
        bot = Bot.objects.filter(is_active=True).first()
        return bot.token if bot else None
    except Exception:
        return None


def validate_telegram_webapp(init_data: str, bot_token: str):
    """Telegram WebApp initData ni HMAC-SHA256 bilan tekshiradi.

    Returns: (is_valid: bool, user_data: dict)
    user_data: {'id': 123, 'first_name': '...', 'last_name': '...', 'username': '...'}
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        received_hash = parsed.get("hash", [""])[0]
        if not received_hash:
            return False, {}

        # hash ni olib tashlab, qolganlarini alifbo tartibida joylash
        data_pairs = []
        for key in sorted(parsed.keys()):
            if key == "hash":
                continue
            data_pairs.append(f"{key}={parsed[key][0]}")
        data_check_string = "\n".join(data_pairs)

        # HMAC-SHA256 tekshiruv
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if calculated_hash != received_hash:
            return False, {}

        # auth_date tekshiruv (24 soat ichida bo'lishi kerak)
        auth_date = int(parsed.get("auth_date", ["0"])[0])
        if abs(time.time() - auth_date) > 86400:
            return False, {}

        # user ma'lumotlarini olish
        user_json = parsed.get("user", ["{}"])[0]
        user_data = json.loads(user_json)
        return True, user_data

    except Exception as e:
        logger.error("Telegram initData validate xato: %s", e)
        return False, {}


def _send_password_via_bot(chat_id, phone, password):
    """Generatsiya qilingan parolni bot orqali Telegram chatga yuboradi."""
    bot_token = _get_bot_token()
    if not bot_token:
        return
    text = (
        f"🔐 <b>Bittada Usta parolingiz</b>\n\n"
        f"📱 Login: <code>{phone}</code>\n"
        f"🔑 Parol: <code>{password}</code>\n\n"
        f"⚠️ Bu parolni xavfsiz joyda saqlang.\n"
        f"Keyinchalik Bittada Usta sozlamalarida o'zgartirishingiz mumkin."
    )
    try:
        http_requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception as e:
        logger.error("Parolni yuborishda xato: %s", e)


def _find_or_link_client(phone):
    """Katta ERP dagi Client ni telefon bo'yicha topadi."""
    try:
        from clients.models import Client
        digits = ''.join(c for c in phone if c.isdigit())[-9:]
        if len(digits) >= 9:
            return Client.objects.using('tenant_mebelcity').filter(
                phone__endswith=digits
            ).first()
    except Exception:
        pass
    return None


def mini_telegram_auth(request):
    """Telegram WebApp dan avtologin yoki ro'yxatdan o'tish.

    GET: initData tekshirish → avtologin yoki so'rovnoma
    POST: so'rovnomani qabul qilish → yangi user yaratish
    """
    bot_token = _get_bot_token()
    if not bot_token:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Bot sozlanmagan. Admin bilan bog\'laning.',
        })

    if request.method == 'POST':
        return _telegram_auth_register(request, bot_token)

    # GET — Telegram WebApp ochilganda
    # initData JS orqali yuboriladi (sahifa o'zi POST qiladi)
    return render(request, 'client_erp/auth/telegram_register.html', {
        'step': 'init',
    })


def _telegram_auth_register(request, bot_token):
    """Telegram auth POST — initData tekshirish + avtologin/register."""
    init_data = request.POST.get('initData', '')
    if not init_data:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram ma\'lumotlari topilmadi. Iltimos, botdan qayta oching.',
        })

    is_valid, tg_user = validate_telegram_webapp(init_data, bot_token)
    if not is_valid:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram tekshiruvi muvaffaqiyatsiz. Qayta urinib ko\'ring.',
        })

    tg_id = tg_user.get('id')
    tg_first = tg_user.get('first_name', '')
    tg_last = tg_user.get('last_name', '')
    tg_username = tg_user.get('username', '')

    if not tg_id:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram foydalanuvchi ID topilmadi.',
        })

    # 1. telegram_chat_id bo'yicha qidirish (avtologin)
    try:
        user = ClientUser.objects.get(telegram_chat_id=tg_id, is_active=True, is_blocked=False)
        if tg_username and not user.telegram_username:
            user.telegram_username = tg_username
            user.save(update_fields=['telegram_username'])
        return _do_login_telegram(user)
    except ClientUser.DoesNotExist:
        pass

    # 2. So'rovnoma POST (register)
    action = request.POST.get('action', '')
    verified_phone = _normalize_phone(_get_phone_from_contact(tg_id))

    if action == 'register':
        full_name = request.POST.get('full_name', '').strip()
        organization = request.POST.get('organization', '').strip()
        phone = verified_phone or _normalize_phone(request.POST.get('phone', '').strip())

        if not full_name:
            return render(request, 'client_erp/auth/telegram_register.html', {
                'step': 'register',
                'tg_user': tg_user,
                'init_data': init_data,
                'phone': phone,
                'phone_verified': bool(verified_phone),
                'error': 'Ism familiyani kiriting.',
            })

        if not phone:
            return render(request, 'client_erp/auth/telegram_register.html', {
                'step': 'register',
                'tg_user': tg_user,
                'init_data': init_data,
                'full_name': full_name,
                'organization': organization,
                'phone_verified': False,
                'error': 'Telefon raqamini kiriting.',
            })

        # Mavjud telefon tekshiruvi
        existing = ClientUser.objects.filter(phone=phone).first()
        if existing:
            existing.telegram_chat_id = tg_id
            existing.telegram_username = tg_username
            existing.save(update_fields=['telegram_chat_id', 'telegram_username'])
            return _do_login_telegram(existing)

        # Yangi user yaratish
        password = str(random.randint(100000, 999999))
        username = ClientUser.generate_username(full_name)
        new_user = ClientUser(
            phone=phone,
            username=username,
            full_name=full_name,
            organization=organization,
            telegram_chat_id=tg_id,
            telegram_username=tg_username,
            is_active=True,
            is_verified=True,
        )
        new_user.set_password(password)
        client_obj = _find_or_link_client(phone)
        if client_obj:
            new_user.client = client_obj
        new_user.save()

        # Parolni bot orqali yuborish (chat_id bo'lsa)
        if tg_id:
            _send_password_via_bot(tg_id, phone, password)

        # Parol EKRANDA ham bir marta ko'rsatiladi — bot yuborilmasa (chat_id
        # yo'q/xato) foydalanuvchi parolsiz qolmasin. "Davom etish" tugmasi
        # SPA'ga olib kiradi; login cookie shu javobning o'zida o'rnatiladi.
        new_user.last_login = timezone.now()
        new_user.save(update_fields=['last_login'])
        ClientLoginAttempt.objects.create(
            phone=new_user.phone, ip_address='0.0.0.0',
            success=True, login_type='telegram', user=new_user,
        )
        # ── 2026-09-23 (additive): kutilayotgan jamoa takliflarini bajarish
        try:
            from client_erp.services.team_invites import claim_pending_invites
            claim_pending_invites(new_user)
        except Exception:
            pass
```

---
## 6. `client_erp/auth_backend.py` — demo muddati
Anchor: `get_client_user` ichida `except ClientUser.DoesNotExist: return None` dan KEYIN, yakuniy `return user` dan OLDIN qo‘ying:
```
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
```

---
## 7. `client_erp/serializers.py` — 2 ta qo‘shimcha
### 7a. Importlardan keyin (modul boshi) helper:
```
def _is_app_admin(u):
    """2026-09-23 (additive): admin tekshiruvi (lazy import — cycle yo'q)."""
    try:
        from client_erp.services.team_invites import is_admin
        return bool(is_admin(u))
    except Exception:
        return bool(getattr(u, 'is_app_admin', False) or False)
```
### 7b. `serialize_user()` return dict oxiriga (`'can_revert_finance'...` dan keyin vergul bilan):
```
        # 2026-09-23 (additive): admin bayrog'i + demo holati (frontend shunga
        # qarab admin bo'limi va demo ogohlantirishini ko'rsatadi).
        # Bosh admin nomeri DB bayroqsiz ham admin sanaladi.
        'is_app_admin': _is_app_admin(u),
        'is_demo': bool(getattr(u, 'is_demo', False) or False),
```

---
## 8. `client_erp/urls.py` — demo route
Anchor: `path('login/register/', ...)` dan KEYIN:
```
    # 24 soatlik demo kirish (2026-09-23, additive)
    path('login/demo/', auth.demo_login, name='login-demo'),
```

---
## 9. `static/client_erp/js/redesign/rc-misc.js` — JONLI Team (3 ta o‘zgarish)
ESLATMA: jonli `/team` sahifa `RcTeam` shu faylda. `pages/team.js` (v1 rezerv) ga tegilmaydi.
### 9a. `_inviteSheet` ni almashtiring + `_inviteResultSheet` ni undan KEYIN qo‘ying
Anchor: `_inviteSheet: function () {` dan `// Rol tanlash kartalari` GACHA:
```
  _inviteSheet: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    RcSheet.open('A\'zo taklif qilish',
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-size:12px;color:var(--mut);line-height:1.7">1️⃣ Sherik avval <b>ro‘yxatdan o‘tsin</b> (ilova/bot)<br>2️⃣ Telefonini kiriting<br>3️⃣ Yuboring</div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Telefon yoki username *</div>' +
      '<input type="text" id="team-inv-q" class="rc-input ce-phone-input" inputmode="tel" placeholder="93 042 15 02"></div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Ism (ro‘yxatdan o‘tmagan bo‘lsa)</div>' +
      '<input type="text" id="team-inv-name" class="rc-input" placeholder="Sherik ismi"></div>' +
      '<div style="font-size:12px;color:var(--mut);font-weight:600;margin-top:2px">Rol va ruxsatlar</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' + RcTeam._rolePicker('worker') + '</div>' +
      '<div style="margin-top:6px"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Foyda foizi (%)</div>' +
      '<input type="number" name="percent" class="rc-input" value="20" min="0" max="100"></div></div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="btn-do-invite">Yuborish</button>' });
    Utils.bindPhoneInputs();
    RcTeam._bindRolePicker();
    var b = document.getElementById('btn-do-invite');
    if (b) b.onclick = function () {
      var qEl = document.getElementById('team-inv-q');
      var nEl = document.getElementById('team-inv-name');
      var raw = (qEl && qEl.value || '').trim();
      if (!raw) return Toast.error('Telefon yoki username kiritilmagan');
      // Raqam bo'lsa → normallashtiramiz (+998...); username bo'lsa o'z holicha.
      var query = /\d/.test(raw) && !/[a-zA-Z]/.test(raw) ? Utils.rawPhone(raw) : raw;
      var role = (document.querySelector('input[name=role]:checked') || {}).value || 'worker';
      var pct = parseFloat((document.querySelector('input[name=percent]') || {}).value) || 0;
      WS.send('team.invite', { query: query, name: (nEl && nEl.value || '').trim(), role: role, profit_percent: pct }, function (msg) {
        if (msg.ok) { RcSheet.close(); Toast.success('Taklif yuborildi!'); RcTeam.render(); return; }
        // Ro'yxatdan o'tmagan — taklif havolasi oynasi (2026-09-23)
        if (msg.code === 'USER_NOT_REGISTERED' && msg.invite) { RcTeam._inviteResultSheet(msg.invite); return; }
        Toast.error(msg.error);
      });
    };
  },

  // Ro'yxatdan o'tmagan odamga taklif havolasi (2026-09-23).
  // Odam QO'SHILMAYDI — faqat havola ulashiladi (SMS/Telegram/bot).
  _inviteResultSheet: function (inv) {
    if (!window.RcSheet || !RcSheet.open) { Toast.error('Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan'); return; }
    var esc = Utils.esc;
    var text = inv.text || '';
    var links = inv.links || {};
    var smsHref = 'sms:?body=' + encodeURIComponent(text);
    var tgHref = 'https://t.me/share/url?url=' + encodeURIComponent(links.play || '') + '&text=' + encodeURIComponent(text);
    RcSheet.open('Do‘stingizni taklif qiling',
      '<div style="text-align:center;padding:4px 0 12px"><div style="font-size:38px;margin-bottom:8px">📩</div>' +
      '<div style="font-size:14px;font-weight:800;margin-bottom:6px;color:var(--pch,#f59e0b)">Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan</div>' +
      '<div style="font-size:12px;color:var(--mut);line-height:1.7">Ro‘yxatdan o‘tmaguncha jamoaga qo‘sha olmaysiz.<br>Taklif havolasini yuboring — ro‘yxatdan o‘tsa,<br>avtomatik jamoangizga qo‘shiladi.</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<a href="' + smsHref + '" class="rc-btn rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px">📩 SMS orqali yuborish</a>' +
      '<a href="' + tgHref + '" target="_blank" class="rc-btn rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px;background:#229ED9">✈️ Telegram orqali yuborish</a>' +
      '<a href="' + esc(links.bot || '') + '" target="_blank" class="rc-btn-ghost rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px">🤖 Botni ochish</a>' +
      '</div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" id="btn-inv-close">Yopish</button>' });
    var c = document.getElementById('btn-inv-close');
    if (c) c.onclick = function () { RcSheet.close(); RcTeam.render(); };
  },

```
### 9b. `_membersTab` ichida invitations blokidan KEYIN pending bo‘limi
Anchor: `Rollar va ruxsatlar legendasi` dan OLDIN:
```
    // ── Ro'yxatdan o'tmaganlarga takliflar (2026-09-23) ──
    if (t.pending && t.pending.length) {
      h += '<div style="font-size:12px;color:var(--mut);font-weight:700;margin:14px 0 8px">⏳ Ro‘yxatdan o‘tishi kutilmoqda</div>';
      t.pending.forEach(function (p) {
        h += '<div class="rc-card" style="margin-bottom:6px;display:flex;align-items:center;gap:10px;padding:10px 14px"><span style="font-size:18px">📩</span>' +
          '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(p.name) + '</div>' +
          '<div style="font-size:11px;color:var(--mut)">' + esc(p.phone) + '</div>' +
          '<div style="font-size:11px;color:var(--pch,#f59e0b)">Sherigingiz hali ham ro‘yxatdan o‘tmadi — kutilmoqda</div></div>' +
          '<button class="btn-pending-del rc-btn-ghost rc-btn-sm" data-id="' + p.id + '" style="color:var(--danger);flex:none">✕</button></div>';
      });
    }

```
### 9c. `bind()` ichida member-del blokidan KEYIN pending o‘chirish
Anchor: `// Jamoadan chiqish` dan OLDIN:
```
    // Kutilayotgan taklifni bekor qilish (2026-09-23)
    document.querySelectorAll('.btn-pending-del').forEach(function (btn) {
      btn.onclick = function () {
        (window.RcSheet ? RcSheet : Modal).confirm('Taklifni bekor qilish', 'Rostdan ham bekor qilasizmi?', function () {
          WS.send('team.pending_cancel', { pending_id: parseInt(btn.dataset.id) }, function (msg) {
            if (!msg.ok) return Toast.error(msg.error);
            Toast.success('Taklif bekor qilindi'); RcTeam.render();
          });
        });
      };
    });

```

## 10. `static/client_erp/js/redesign/rc-settings.js` — JONLI Settings (4 ta o‘zgarish)
ESLATMA: jonli `/settings` sahifa `RcSettings` shu faylda. `pages/settings.js` (v1 rezerv) ga tegilmaydi.
### 10a. `template()` ichida Tanishtiruv kartasidan KEYIN (yakka qator):
```
    // ── Admin bo'limi — faqat adminlarga (2026-09-23, additive) ──
    h += RcSettings._adminCard(u);
```
### 10b. `bind()` boshiga (yakka qator):
```
        // Admin bo'limi (2026-09-23, additive — admin bo'lmasa jim chiqadi)
        try { RcSettings._adminBind(); } catch (e) {}
```
### 10c. Obyekt oxiriga `_adminCard`:
```
  _adminCard: function (u) {
    var esc = Utils.esc;
    if (!u || !u.is_app_admin) return '';
    var h = '<div class="rc-card" id="rc-admin-card" style="border-color:color-mix(in srgb,var(--acc) 45%,var(--brd))">';
    h += '<div style="font-weight:800;font-size:15px;margin-bottom:10px">🛡 Admin</div>';
    h += '<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Taklif havolalari (dinamik)</div>';
    h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--mut)">Play Market</label><input type="text" id="rc-adm-play" class="rc-input" style="margin-top:4px;font-size:12px" placeholder="https://..."></div>';
    h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--mut)">Bot</label><input type="text" id="rc-adm-bot" class="rc-input" style="margin-top:4px;font-size:12px" placeholder="https://t.me/..."></div>';
    h += '<button class="rc-btn rc-btn-sm" id="rc-adm-save" style="width:100%;margin-bottom:14px">Saqlash</button>';
    h += '<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Adminlar (<span id="rc-adm-count">…</span>/3)</div>';
    h += '<div id="rc-adm-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>';
    h += '<div style="display:flex;gap:6px"><input type="text" id="rc-adm-new" class="rc-input" style="flex:1;font-size:12px" placeholder="+998..."><button class="rc-btn rc-btn-sm" id="rc-adm-add" style="flex:none">+ Admin</button></div>';
    h += '<div style="font-size:12px;color:var(--mut);margin:14px 0 6px">💳 Tariflar (narx/limit)</div>';
    h += '<div id="rc-adm-plans" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"><div style="font-size:12px;color:var(--mut)">Yuklanmoqda...</div></div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-plan-new" style="width:100%">+ Yangi tarif</button>';
    h += '</div>';
    return h;
  },
```
### 10d. `_adminCard` dan KEYIN `_adminBind`:
```
  _adminBind: function () {
    if (!document.getElementById('rc-admin-card')) return;
    var esc = Utils.esc;
    WS.send('admin.settings_get', {}, function (msg) {
      if (msg.ok && msg.data) {
        document.getElementById('rc-adm-play').value = msg.data.invite_play_url || '';
        document.getElementById('rc-adm-bot').value = msg.data.invite_bot_url || '';
      }
    });
    function loadAdmins() {
      WS.send('admin.admins_list', {}, function (msg) {
        if (!msg.ok) return;
        var d = msg.data || {};
        document.getElementById('rc-adm-count').textContent = d.count || 0;
        var h = '';
        (d.admins || []).forEach(function (a) {
          h += '<div style="display:flex;align-items:center;gap:8px;background:var(--sfc2);border-radius:12px;padding:8px 10px">';
          h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(a.name) + (a.chief ? ' 👑' : '') + '</div>';
          h += '<div style="font-size:11px;color:var(--mut)">' + esc(a.phone) + '</div></div>';
          if (!a.chief) h += '<button class="rc-btn-ghost rc-btn-sm btn-rc-adm-del" data-id="' + a.id + '" style="color:var(--danger)">✕</button>';
          h += '</div>';
        });
        document.getElementById('rc-adm-list').innerHTML = h || '<div style="font-size:12px;color:var(--mut)">Hali admin yo‘q</div>';
        Array.prototype.forEach.call(document.querySelectorAll('.btn-rc-adm-del'), function (b) {
          b.onclick = function () {
            RcSheet.confirm('Adminlikni olish', 'Rostdan ham olib tashlaysizmi?', function () {
              WS.send('admin.admin_remove', { user_id: parseInt(b.dataset.id) }, function (m2) {
                if (!m2.ok) return Toast.error(m2.error);
                Toast.success('Olib tashlandi'); loadAdmins();
              });
            });
          };
        });
      });
    }
    loadAdmins();
    document.getElementById('rc-adm-save').onclick = function () {
      WS.send('admin.settings_set', {
        invite_play_url: document.getElementById('rc-adm-play').value.trim(),
        invite_bot_url: document.getElementById('rc-adm-bot').value.trim()
      }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        Toast.success('Saqlandi');
      });
    };
    document.getElementById('rc-adm-add').onclick = function () {
      var q = document.getElementById('rc-adm-new').value.trim();
      if (!q) return Toast.error('Telefon/username kiritilmagan');
      WS.send('admin.admin_add', { query: q }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        document.getElementById('rc-adm-new').value = '';
        Toast.success('Admin qo‘shildi'); loadAdmins();
      });
    };
    RcSettings._plansBind();
  },
```
### 10e. `_adminBind` dan KEYIN, fayl oxirigacha (`_plansBind` + `_planEditSheet`):
```
_plansBind: function () {
    var wrap = document.getElementById('rc-adm-plans');
    if (!wrap) return;
    var esc = Utils.esc;
    function money(v) { try { return Number(v || 0).toLocaleString('uz-UZ'); } catch (e) { return v; } }
    function loadPlans() {
      WS.send('admin.plans_list', {}, function (msg) {
        if (!msg.ok) { wrap.innerHTML = '<div style="font-size:12px;color:var(--danger)">' + esc(msg.error || 'Xatolik') + '</div>'; return; }
        var plans = ((msg.data || {}).plans) || [];
        if (!plans.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--mut)">Tarif yo‘q</div>'; return; }
        var h = '';
        plans.forEach(function (p) {
          h += '<div style="display:flex;align-items:center;gap:8px;background:var(--sfc2);border-radius:12px;padding:8px 10px' + (p.is_active ? '' : ';opacity:.55') + '">';
          h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(p.name) + '</div>';
          h += '<div style="font-size:11px;color:var(--mut)">' + money(p.price_uzs) + ' so‘m/oy' + (p.is_free ? ' · bepul' : '') + (p.is_active ? '' : ' · o‘chiq') + '</div></div>';
          h += '<button class="rc-btn-ghost rc-btn-sm btn-rc-plan-edit" data-id="' + p.id + '">✏️</button></div>';
        });
        wrap.innerHTML = h;
        Array.prototype.forEach.call(document.querySelectorAll('.btn-rc-plan-edit'), function (b) {
          b.onclick = function () {
            var found = null;
            plans.forEach(function (p) { if (String(p.id) === String(b.dataset.id)) found = p; });
            if (found) RcSettings._planEditSheet(found, loadPlans);
          };
        });
      });
    }
    loadPlans();
    var nb = document.getElementById('rc-plan-new');
    if (nb) nb.onclick = function () { RcSettings._planEditSheet(null, loadPlans); };
  },

  _planEditSheet: function (p, cb) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    p = p || {};
    var esc = Utils.esc;
    var lim = p.limits || {};
    function numRow(key, label) {
      var v = (lim[key] === undefined || lim[key] === null) ? '' : lim[key];
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;font-size:12px;color:var(--mut)">' + label + '</div>' +
        '<input type="number" class="rc-input rc-plan-lim" data-k="' + key + '" value="' + v + '" placeholder="∞" style="width:90px;padding:6px;text-align:center;font-size:12px"></div>';
    }
    var body =
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Nom *</div><input type="text" id="rc-pl-name" class="rc-input" value="' + esc(p.name || '') + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Narx (so‘m/oy)</div><input type="number" id="rc-pl-price" class="rc-input" value="' + (p.price_uzs === undefined ? '' : p.price_uzs) + '"></div>' +
      '<div style="flex:1"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Muddat (kun)</div><input type="number" id="rc-pl-period" class="rc-input" value="' + (p.period_days === undefined ? '30' : p.period_days) + '"></div></div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Coin grant</div><input type="number" id="rc-pl-coin" class="rc-input" value="' + (p.coin_grant === undefined ? '' : p.coin_grant) + '"></div>' +
      '<div style="font-size:12px;color:var(--mut);font-weight:600">Limitlar (bo‘sh = cheksiz)</div>' +
      numRow('orders_month', 'Oyiga buyurtmalar') +
      numRow('active_orders', 'Faol buyurtmalar') +
      numRow('customers', 'Mijozlar') +
      numRow('team_members', 'Jamoa a’zolari') +
      numRow('ai_autonomous_daily', 'AI amal/kun') +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Feature keys (vergul bilan)</div><input type="text" id="rc-pl-feats" class="rc-input" style="font-size:12px" value="' + esc((p.feature_keys || []).join(', ')) + '" placeholder="bo‘sh = hammasi ochiq"></div>' +
      '<div style="display:flex;gap:14px;font-size:13px">' +
      '<label><input type="checkbox" id="rc-pl-ai" ' + (p.ai_included ? 'checked' : '') + '> AI bor</label>' +
      '<label><input type="checkbox" id="rc-pl-active" ' + (p.is_active === false ? '' : 'checked') + '> Faol</label></div>' +
      '</div>';
    RcSheet.open(p.id ? 'Tarif: ' + esc(p.name || '') : 'Yangi tarif', body,
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="rc-plan-save">Saqlash</button>' });
    document.getElementById('rc-plan-save').onclick = function () {
      var name = document.getElementById('rc-pl-name').value.trim();
      if (!name) return Toast.error('Nom kiritilmagan');
      var limits = {};
      Array.prototype.forEach.call(document.querySelectorAll('.rc-plan-lim'), function (el) {
        var v = el.value.trim();
        if (v !== '') limits[el.dataset.k] = parseInt(v, 10) || 0;
      });
      var feats = document.getElementById('rc-pl-feats').value.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      var payload = {
        name: name,
        price_uzs: parseInt(document.getElementById('rc-pl-price').value, 10) || 0,
        period_days: parseInt(document.getElementById('rc-pl-period').value, 10) || 30,
        coin_grant: parseInt(document.getElementById('rc-pl-coin').value, 10) || 0,
        feature_keys: feats,
        limits: limits,
        ai_included: document.getElementById('rc-pl-ai').checked,
        is_active: document.getElementById('rc-pl-active').checked
      };
      if (p.id) payload.id = p.id;
      WS.send('admin.plans_save', payload, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        RcSheet.close(); Toast.success('Tarif saqlandi');
        if (cb) cb();
      });
    };
  },
};

window.RcSettings = RcSettings;
RC_PAGES['/settings'] = function () { RcSettings.render(); };

```

## 11. `template/client_erp/auth/login.html` — 2 ta o‘zgarish
### 11a. Telefon maydonidan KEYIN (`id="pwd-field"` div dan OLDIN) demo tugma:
```
        <!-- 24 soatlik demo kirish (2026-09-23, additive) — nomer maydoni pastida -->
        <button type="button" class="login-btn" id="demo-btn" style="margin-top:10px;background:transparent;border:1.5px dashed var(--acc);color:var(--acc);box-shadow:none">
            <span class="btn-text"><i class="fas fa-eye"></i> Demo 24 soatlik akkaunt</span>
            <div class="spinner"></div>
        </button>
        <div style="font-size:11px;color:var(--mut);text-align:center;margin-top:6px">Ro‘yxatdan o‘tmasdan sinab ko‘ring — 24 soatdan keyin o‘chadi</div>
        <!-- Demo tushuntirish oynasi (2026-09-23, additive) -->
        <div id="demo-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:20px">
            <div style="background:var(--card,#1B1A20);border:1px solid var(--brd);border-radius:16px;max-width:380px;width:100%;padding:22px 18px;color:var(--txt)">
                <div style="text-align:center;font-size:40px;margin-bottom:6px">⏳</div>
                <div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:12px">24 soatlik demo qanday ishlaydi?</div>
                <div style="font-size:13px;line-height:1.8;color:var(--txt)">
                    <div>✅ Ro‘yxatdan o‘tmasdan <b>barcha funksiyani</b> sinab ko‘rasiz</div>
                    <div>⏰ <b>24 soatdan keyin</b> demo akkaunt va kiritgan barcha ma’lumotlaringiz <b>to‘liq o‘chadi</b></div>
                    <div>🔄 24 soat ichida <b>real akkaunt ochsangiz</b> — ma’lumotlaringiz o‘chmaydi, <b>avtomatik o‘tadi</b></div>
                    <div>🔒 Bu birovning akkaunti emas — faqat sizga tegishli vaqtinchalik akkaunt</div>
                </div>
                <button type="button" class="login-btn" id="demo-start" style="margin-top:14px">
                    <span class="btn-text"><i class="fas fa-play"></i> Demo boshlash</span>
                    <div class="spinner"></div>
                </button>
                <button type="button" id="demo-close" style="width:100%;margin-top:8px;background:none;border:none;color:var(--mut);font-size:13px;cursor:pointer;padding:8px">Yopish</button>
            </div>
        </div>
```
### 11b. Theme-toggle IIFE dan KEYIN demo JS:
```
// ── Demo kirish (2026-09-23, additive): avval tushuntirish, keyin boshlash ──
(function(){
    var db = document.getElementById('demo-btn');
    var modal = document.getElementById('demo-modal');
    var startBtn = document.getElementById('demo-start');
    var closeBtn = document.getElementById('demo-close');
    if (!db || !modal) return;
    db.addEventListener('click', function(){
        modal.style.display = 'flex';
    });
    function closeModal() { modal.style.display = 'none'; }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
    if (!startBtn) return;
    startBtn.addEventListener('click', function(){
        if (startBtn.classList.contains('loading')) return;
        startBtn.classList.add('loading');
        fetch('/mini/login/demo/', {method: 'POST', credentials: 'same-origin'})
            .then(function(r){ return r.json(); })
            .then(function(d){
                if (d && d.ok) { window.location.href = d.redirect || '/'; return; }
                alert((d && d.error) || 'Xatolik');
                startBtn.classList.remove('loading');
            })
            .catch(function(){
                alert('Xatolik. Qayta urining.');
                startBtn.classList.remove('loading');
            });
    });
})();
```

---
## MIGRATSIYA NOMI (MUHIM)
`0069_invite_demo_admin.py` → production dagi eng katta raqam+1 ga ko‘chiring (masalan `0071_...`). Ichidagi `dependencies` ni prod dagi eng oxirgi migratsiyaga to‘g‘rilang. 4 ta DB alias ga `migrate`.

## TO‘QNASHUV YO‘Q (tekshirilgan)
- Serverdagi `handle_admin_plans_list/save` (`is_platform_admin`) — tegilmadi, nomlar har xil.
- `is_admin()` ikkala bayroqni ham tanidi; `admin_add/remove` ikkalasini sinxron yozadi.
- Eski `team.invite` topilgan yo‘li o‘zgarishsiz; eski JS da `name` bo‘lmasa `query` ishlatiladi.
- Deploygacha yangi UI lar jim yashirin (xato bermaydi).

## KEYINGI QADAMLAR (serverda)
1. `migrate` (4 DB) 2. `manage.py check_limits_exceeded` → oshganlarga xabar → gating yoqish
3. Cron: `purge_demos` har soatda 4. collectstatic + `bittada-manager` reload, `bittada-manager-ws` restart

---
## 12. Til tizimi — tur + Salom + statuslar + buyurtma yorliqlari (2026-09-23, kechki)
ESLATMA: barchasi JONLI v2 fayllar. Kalit topilmasa o'zbekcha chiqadi (hech qachon buzilmaydi).

### 12a. `static/client_erp/js/redesign/rc-tour.js` — render hook
Anchor: `box.innerHTML =` (tour oynasi). `s.title` → `T(s.title)`, `s.text` → `T(s.text)`,
tugmalar: `T('Yopish')`, `T('O\'tkazib yuborish')`, `T('Tugatdim')` / `T('Keyingi')`.
```js
'<button id="rc-tour-x" aria-label="' + T('Yopish') + '">&times;</button>'
+ '<h4>' + T(s.title) + '</h4>'
+ '<p>' + T(s.text) + '</p>'
```
### 12b. `static/client_erp/js/redesign/rc-hint.js` — `html()` hook
`esc(hi.title)` → `esc(T(hi.title))`, `hi.body` → `T(hi.body)`,
`>Tushundim<` → `>' + T('Tushundim') + '<`.
### 12c. `static/client_erp/js/redesign/rc-dashboard.js` — 2 hook
- `Salom, ' + esc(...)` → `T('Salom') + ', ' + esc(...)`
- `badge()`: `m[0]` → `T(m[0])` (barcha statuslar app bo'ylab tarjima bo'ladi)
### 12d. `static/client_erp/js/redesign/rc-order-detail.js` — hooklar
- `_stRow`: `m.label` → `T(m.label)` (7 status)
- Sanalar: `Boshlandi:` → `T('Boshlandi')`, `Muddat:` → `T('Muddat')`, `Topshirildi:` → `T('Topshirildi')`, `kun` → `T('kun')`
- Tablar: `Umumiy/Moliya/Etaplar/Fayllar/Jamoa` → `T(...)`
- Tugma: `Buyurtmani topshirish` → `T(...)`; toasts: `Etap tugallandi/o'tkazildi/qayta ochildi/o'chirildi/qo'shildi` + `_fld('Etap'` → `T('Etap')`
### 12e. Lug'atlar — `i18n-pack/apply_i18n.py` ni yurgizing
```bash
python3 DEPLOY-2026-09-23/i18n-pack/apply_i18n.py /home/user/mebelcity_platform
node --check static/client_erp/js/i18n/ru.js static/client_erp/js/i18n/en.js
```
77 ta yangi kalit (tur 56 + hint 12 + Salom/status/buyurtma 9). Bor kalitlar tegilmaydi.
MUHIM: mijoz ismlari, buyurtma nomlari, user kiritgan matnlar — tarjima QILINMAYDI (to'g'ri, shunday bo'lishi kerak).

---
## 13. Til partiya-2 — rasmlardagi qolgan yorliqlar (2026-09-23, kech)
SABAB: prod da T() hooklar + lug'at yo'q → aralash til. `tr()` avtomatik tarjimon plain label'larni o'zi oladi — shuning uchun bu partiya asosan LUG'AT.

### 13a. `static/client_erp/js/redesign/rc-order-detail.js` — 3 hook
1. Ogohlantirish banneri → to'liq gap T() kalitlari (4 ta):
`Chiqim hali kiritilmagan.` / `Shuning uchun foyda ... yozing.` / `Buyurtma hali <b>tugallanmagan</b> — foyda o‘zgarishi mumkin.` / `Moliyadagi <b>Sof foyda</b>ga faqat <b>tugallangan</b> buyurtmalar qo‘shiladi.`
(Eski `<b style="...">` → oddiy `<b>`; matn bir xil, faqat kalit butun gap.)
2. `shartnoma bo‘yicha` fragmenti → `' · 📄 ' + T('shartnoma bo‘yicha')`
3. Ma'lumot qatorlari: `Holat/Mijoz/Telefon/Manzil/Boshlangan sana/Topshirilgan sana/Necha kun davom etdi/Jarayon/Ma'lumot` → `T(...)`; `Muddat (deadline)` → `T('Muddat')`; `kun + ' kun'` → `kun + ' ' + T('kun')`; status qiymati `T(st[0])`
### 13b. `static/client_erp/js/i18n/i18n.js` — PATTERNS
ru + en ro'yxatiga: `/^([\d\s.,\u00a0]+)\s+etap$/` → ru `'$1 этап'`, en `'$1 stages'` (`7 etap` uchun)
### 13c. Lug'atlar — `i18n-pack/apply_i18n.py` ni QAYTA yurgizing
Pack yangilandi (120 kalit): moliya kartalari, Ma'lumot bloki, Viz/Eslatmalar, Sozlamalar sarlavhalari, kategoriyalar (Material/Xizmat/Transport/Furnitura), til izohi.
```bash
python3 DEPLOY-2026-09-23/i18n-pack/apply_i18n.py /home/user/mebelcity_platform
```
ESLATMA: `MebelCity qidiruv so'zlari` kartasi lokal nusxada YO'Q (faqat prod da) — Claude prod dagi faylda topib o'sha andozada T()/kalit qo'shsin. Mijoz ismlari, buyurtma nomlari, user matnlari — tarjima QILINMAYDI.
