"""client_erp/consumers.py — Mini ERP WebSocket consumer."""
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.db import models

logger = logging.getLogger(__name__)


class MiniERPConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.username = self.scope['url_route']['kwargs'].get('username', '')
        self.user = await self._authenticate()
        if not self.user:
            await self.close(code=4001)
            return
        if self.user.username != self.username:
            await self.close(code=4003)
            return
        # TENANT-SCOPED guruhlar — mini_user/mini_order pk tenantlar aro
        # takrorlanadi (cross-tenant hamyon/XP/order leak, 2026-07-22 audit).
        from tenant_manager.ws_groups import tgroup
        self.db_alias = self.scope.get('db_alias', 'default')
        self.user_group = tgroup(self.db_alias, f"mini_user_{self.user.pk}")
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        self.order_groups = set()

    async def disconnect(self, code):
        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if hasattr(self, 'order_groups'):
            for g in list(self.order_groups):
                await self.channel_layer.group_discard(g, self.channel_name)

    async def receive_json(self, content):
        msg_type = content.get('type', '')
        if msg_type == 'ping':
            await self._reply(content, data='pong')
            return
        handler_name = 'handle_' + msg_type.replace('.', '_')
        handler = getattr(self, handler_name, None)
        if not handler:
            await self._error(content, 'Noma\'lum operatsiya')
            return
        # ── Tarif gating (F1 SaaS poydevor; standart O'CHIQ — CLIENT_FEATURE_GATING) ──
        from client_erp.services.features import gating_enabled, feature_for_type, user_can
        if gating_enabled():
            feat = feature_for_type(msg_type)
            if feat and self.user and not await database_sync_to_async(user_can)(self.user, feat):
                await self._reply(content, ok=False, error="Bu funksiya tarifingizda yo'q",
                                  data={'upgrade': True, 'feature': feat})
                return
        try:
            self._msg = content
            result = await handler(content.get('data', {}))
            if result is not None:
                await self._reply(content, **self._normalize_result(result))
        except Exception as e:
            logger.exception(f"WS handler error: {handler_name}")
            await self._error(content, str(e))

    # ── Reply helpers ──

    #: `_reply()` faqat shu uchta kalitni qabul qiladi.
    _REPLY_KEYS = ('ok', 'data', 'error')

    @classmethod
    def _normalize_result(cls, result):
        """Handler natijasini `_reply()` qabul qiladigan shaklga keltiradi.

        MUAMMO (2026-09-12 aniqlangan): 125 handlerdan 116 tasi to'g'ri
        `{'ok': True, 'data': {...}}` qaytaradi, 9 tasi esa maydonni
        to'g'ridan-to'g'ri yozadi — `{'ok': True, 'people': [...]}`.
        Dispatcher `_reply(content, **result)` deb chaqirgani uchun bunday
        natija `TypeError: _reply() got an unexpected keyword argument
        'people'` beradi va handler HECH QACHON ishlamaydi. Ta'sirlangan:
        profit.people_list/add/update/delete, supplierdebt.create/pay,
        finance.duplicate_resolve, ble.push, lazer.link.

        YECHIM: begona kalitlar `data` ichiga ko'chiriladi VA eski joyida
        ham qoldiriladi. Sabab — sayt frontendi `msg.people`, `msg.mode`,
        `msg.url` ni to'g'ridan-to'g'ri o'qiydi (rc-finance.js:2507/2570,
        ble-adapter.js:143). Ikkala shakl ham qaytsa sayt buzilmaydi,
        yangi mijozlar (Android ilova) esa `data` dan o'qiy oladi.

        ⚠️ To'g'ri yozilgan 116 handler bu yerdan O'ZGARISHSIZ o'tadi.
        """
        if not isinstance(result, dict):
            return result
        extra = {k: v for k, v in result.items() if k not in cls._REPLY_KEYS}
        if not extra:
            return result                      # to'g'ri yozilgan — tegilmaydi
        clean = {k: v for k, v in result.items() if k in cls._REPLY_KEYS}
        data = clean.get('data')
        if isinstance(data, dict):
            merged = dict(extra)
            merged.update(data)                # mavjud `data` ustun turadi
            clean['data'] = merged
        elif data is None:
            clean['data'] = extra
        # `data` dict emas (masalan 'pong') — `data` tegilmaydi, begona
        # kalitlar faqat top-level'ga (orqaga moslik uchun) chiqadi.
        clean['_flat'] = extra
        return clean

    async def _reply(self, original, ok=True, data=None, error=None, _flat=None):
        payload = {
            'type': original.get('type', '') + '.result',
            'request_id': original.get('request_id'),
            'ok': ok,
            'data': data,
            'error': error,
        }
        # ORQAGA MOSLIK: `_normalize_result` ko'chirgan kalitlar top-level'da
        # ham qoladi — sayt frontendi `msg.people` / `msg.mode` / `msg.url`
        # deb o'qiydi (rc-finance.js, ble-adapter.js). Ular yangilangach bu
        # qism olib tashlanishi mumkin.
        if _flat:
            for k, v in _flat.items():
                if k not in payload:           # 'type'/'ok'/'data' ustidan yozilmasin
                    payload[k] = v
        await self.send_json(payload)

    async def _error(self, original, error):
        await self._reply(original, ok=False, error=error)

    # ── Auth ──

    @database_sync_to_async
    def _authenticate(self):
        from client_erp.auth_backend import decode_token, TOKEN_COOKIE
        from client_erp.models import ClientUser
        cookies = self.scope.get('cookies', {})
        token = cookies.get(TOKEN_COOKIE)
        if not token:
            return None
        payload = decode_token(token)
        if not payload:
            return None
        try:
            return ClientUser.objects.get(pk=payload['user_id'], is_active=True, is_blocked=False)
        except ClientUser.DoesNotExist:
            return None

    # ── Order group management ──

    async def _subscribe_order(self, order_id):
        from tenant_manager.ws_groups import tgroup
        group = tgroup(self.db_alias, f"mini_order_{order_id}")
        if group not in self.order_groups:
            await self.channel_layer.group_add(group, self.channel_name)
            self.order_groups.add(group)

    async def _unsubscribe_all_orders(self):
        for group in list(self.order_groups):
            await self.channel_layer.group_discard(group, self.channel_name)
        self.order_groups.clear()

    async def _broadcast_order(self, order_id, action, payload):
        from tenant_manager.ws_groups import tgroup
        await self.channel_layer.group_send(
            tgroup(self.db_alias, f"mini_order_{order_id}"),
            {
                'type': 'order.broadcast',
                'order_id': order_id,
                'message': {
                    'type': 'broadcast',
                    'action': action,
                    'data': payload,
                    'by': self.user.full_name,
                },
                'sender_channel': self.channel_name,
            },
        )

    # ═══════════════════════════════════════════════════════════════════
    #  📡 LAZER KO'PRIGI (2026-08-17)
    #  MUAMMO: barcha ustalar ilovaga BOT ichidan (Telegram Mini App) kiradi,
    #  Telegram esa Android WebView'da ochiladi va WebView'da Web Bluetooth
    #  API UMUMAN YO'Q (Google qo'shmagan). Ya'ni bot oynasining ICHIDA
    #  lazerga ulanish jismonan imkonsiz.
    #  YECHIM: lazer Chrome'dagi kichik sahifada (`/mini/<user>/lazer/`)
    #  ulanadi, har o'lchov shu WS orqali FOYDALANUVCHINING guruhiga
    #  yuboriladi, bot ichidagi oyna esa uni qabul qilib maydonga yozadi.
    #  Ya'ni ulanish Chrome'da, ISHLASH bot ichida.
    #  Guruh tenant-scoped (`tgroup`) — akkauntlar aro o'tmaydi.
    # ═══════════════════════════════════════════════════════════════════
    async def handle_ble_push(self, data):
        try:
            mm = int(round(float(data.get('mm') or 0)))
        except (TypeError, ValueError):
            return {'ok': False, 'error': 'mm noto\'g\'ri'}
        if mm <= 0:
            return {'ok': False, 'error': 'mm 0'}
        await self.channel_layer.group_send(self.user_group, {
            'type': 'ble.measure',
            'data': {'mm': mm, 'source': (data.get('source') or 'lazer')[:40]},
        })
        return {'ok': True, 'mm': mm}

    async def handle_lazer_link(self, data):
        """📡 Lazer sahifasi uchun KALITLI havola (2026-08-17).

        Tashqi brauzerda sessiya bo'lmagani uchun havolaga qisqa muddatli
        imzolangan kalit qo'shiladi (`views/lazer.py` izohiga qara) — aks
        holda Chrome'da login sahifasi chiqardi.
        """
        @database_sync_to_async
        def _make():
            from client_erp.views.lazer import make_key
            return make_key(self.user)
        key = await _make()
        host = None
        for h in (self.scope.get('headers') or []):
            if h[0] == b'host':
                host = h[1].decode()
                break
        base = 'https://' + (host or 'usta.bittada.uz')
        return {'ok': True, 'url': f"{base}/mini/{self.user.username}/lazer/?k={key}"}

    async def ble_measure(self, event):
        """Chrome'dagi lazer sahifasidan kelgan o'lchov — barcha ochiq oynalarga."""
        await self.send_json({'type': 'ble.measure', 'data': event['data']})

    async def wallet_push(self, event):
        """Tanga/XP o'zgarganda (quest, mukofot, to'lov...) — jonli, reload shart emas."""
        await self.send_json({'type': 'wallet.push', 'data': event['data']})

    async def xp_awarded(self, event):
        """Quest/mukofot mukofoti — CoinBurst animatsiya + toast (barcha ochiq tab'larda)."""
        await self.send_json({'type': 'xp.awarded', 'data': event['data']})

    async def order_broadcast(self, event):
        if event.get('sender_channel') == self.channel_name:
            return
        message = event['message']
        # 💰 Pul ko'rish ruxsati bo'lmagan a'zoga broadcast'dagi moliyaviy
        # maydonlarni yashiramiz (per-connection). FAIL-SAFE: xatoda asl xabar.
        try:
            action = (message or {}).get('action') or ''
            if action.startswith('perm.'):
                # Ruxsatlar o'zgardi — keshni tozalaymiz
                self._money_perm_cache = {}
            order_id = event.get('order_id')
            if order_id and not await self._can_see_money_cached(order_id):
                from client_erp.serializers import scrub_money_data
                import copy
                message = copy.deepcopy(message)
                message['data'] = scrub_money_data(message.get('data'))
        except Exception:
            logger.exception("order_broadcast money-scrub xato — asl xabar yuborildi")
            message = event['message']
        await self.send_json(message)

    async def _can_see_money_cached(self, order_id):
        cache = getattr(self, '_money_perm_cache', None)
        if cache is None:
            cache = self._money_perm_cache = {}
        if order_id in cache:
            return cache[order_id]
        val = await self._check_can_see_money(order_id)
        cache[order_id] = val
        return val

    @database_sync_to_async
    def _check_can_see_money(self, order_id):
        """Joriy user shu order'da pulni ko'ra oladimi (owner/perm/team-share)."""
        from client_erp.models import ClientOrder, ClientOrderPermission
        try:
            owner_id = ClientOrder.objects.values_list(
                'owner_id', flat=True,
            ).get(pk=order_id)
        except ClientOrder.DoesNotExist:
            return True
        if owner_id == self.user.pk:
            return True
        perm = ClientOrderPermission.objects.filter(
            order_id=order_id, user=self.user,
        ).only('can_see_money').first()
        if perm:
            return bool(perm.can_see_money)
        from client_erp.models.team import ClientTeamMember, ClientOrderShare
        membership = ClientTeamMember.objects.filter(
            user=self.user, status='active',
        ).first()
        if membership:
            share = ClientOrderShare.objects.filter(
                order_id=order_id, team_id=membership.team_id,
            ).only('visibility').first()
            if share:
                return share.visibility != 'finance_hidden'
        return False

    # ── Gamification helper ──

    async def _award_xp(self, rule_code, description=''):
        @database_sync_to_async
        def _do():
            from client_erp.services.gamification import award_xp
            self.user.refresh_from_db()
            return award_xp(self.user, rule_code, description)
        xp, coins = await _do()
        if xp > 0 or coins > 0:
            await self.send_json({
                'type': 'xp.awarded',
                'data': {'xp': xp, 'coins': coins, 'rule': rule_code},
            })
        return xp, coins

    # ── Helper ──

    @database_sync_to_async
    def _get_order_id_from_stage(self, stage_id):
        from client_erp.models import ClientOrderStage
        try:
            return ClientOrderStage.objects.values_list('order_id', flat=True).get(pk=stage_id)
        except ClientOrderStage.DoesNotExist:
            return None

    # ═══════════════════════════════════════════════════════════
    #  PAGE DATA HANDLERS
    # ═══════════════════════════════════════════════════════════

    async def handle_page_tarif(self, data):
        """#/tarif — mavjud tariflar + joriy tarif (F1 SaaS poydevor)."""
        @database_sync_to_async
        def _get():
            from client_erp.models import ClientPlan
            from client_erp.services.features import FEATURES
            from client_erp.services import limits as L

            def _plan_limits(p):
                # Har tarif limitlari -> ko'rsatish uchun ro'yxat (registr tartibida).
                raw = p.limits if isinstance(p.limits, dict) else {}
                out = []
                for key, spec in L.LIMITS.items():
                    if key not in raw:
                        continue  # kalit yo'q = cheksiz, ko'rsatmaymiz
                    try:
                        v = int(raw[key])
                    except (TypeError, ValueError):
                        continue
                    unlimited = v < 0
                    out.append({'key': key, 'label': spec['label'], 'unit': spec['unit'],
                                'limit': (L.UNLIMITED if unlimited else v), 'unlimited': unlimited})
                return out

            plans = []
            for p in ClientPlan.objects.filter(is_active=True).order_by('sort', 'id'):
                plans.append({
                    'id': p.id, 'name': p.name, 'slug': p.slug,
                    'price_uzs': int(p.price_uzs), 'period_days': p.period_days,
                    'coin_grant': p.coin_grant, 'ai_included': p.ai_included,
                    'is_free': p.is_free, 'color': p.color, 'icon': p.icon,
                    'description': p.description,
                    'features': [FEATURES.get(k, {}).get('label', k) for k in (p.feature_keys or [])],
                    'limits': _plan_limits(p),
                })
            u = self.user
            current = None
            if u and getattr(u, 'plan_id', None):
                current = {'name': u.plan.name, 'slug': u.plan.slug,
                           'expires': u.plan_expires_at.isoformat() if u.plan_expires_at else None}
            # Joriy foydalanuvchining har limit bo'yicha foydalanishi (progress panel).
            usage = L.all_status(u) if u else []
            return {'plans': plans, 'current': current, 'usage': usage}
        return {'ok': True, 'data': await _get()}

    async def handle_page_tanga(self, data):
        """#/tanga — tanga hamyoni: balans + paketlar + tarix (F2)."""
        @database_sync_to_async
        def _get():
            from client_erp.models import CoinPack, CoinLedger
            packs = [{
                'id': p.id, 'name': p.name, 'coins': p.coins, 'bonus_coins': p.bonus_coins,
                'total_coins': p.total_coins, 'price_uzs': int(p.price_uzs), 'color': p.color,
            } for p in CoinPack.objects.filter(is_active=True).order_by('sort', 'id')]
            u = self.user
            if u:
                u.refresh_from_db()
            bal = (u.coins if u else 0) or 0
            ledger = []
            if u:
                for l in CoinLedger.objects.filter(user=u).order_by('-created_at')[:10]:
                    ledger.append({'kind': l.kind, 'amount': l.amount, 'reason': l.reason,
                                   'created_at': l.created_at.isoformat()})
            return {'packs': packs, 'balance': bal, 'coins': bal, 'ledger': ledger}
        return {'ok': True, 'data': await _get()}

    async def handle_pay_start(self, data):
        """To'lov boshlash — provider checkout yaratadi (sandbox: /mini/pay/sandbox/<id>/). F3."""
        @database_sync_to_async
        def _start():
            from client_erp.payments import service
            provider = (data.get('provider') or 'sandbox')
            purpose = data.get('purpose')
            target_id = int(data.get('target_id') or 0)
            if purpose not in ('coin_topup', 'plan_purchase'):
                return None, "Noto'g'ri maqsad"
            # Narxi 0 (masalan "Bepul" tarif) — to'lov YARATILMAYDI. Payme 0 summani
            # rad etadi ("Сумма платежа меньше допустимой").
            try:
                _amt = int(service.amount_for(purpose, target_id) or 0)
            except Exception:
                _amt = 0
            if _amt <= 0:
                return None, "Bu tarif bepul — to'lov talab qilinmaydi"
            try:
                p = service.create_payment(self.user, provider, purpose, target_id)
            except Exception as e:
                return None, str(e)
            # Real provayder (sandbox emas) checkout havola bermasa — endpoint/account
            # xatosi. Foydalanuvchiga xom RPC xatosi o'rniga tushunarli xabar.
            if not p.checkout_url and (p.provider or '') != 'sandbox':
                ierr = ''
                try:
                    ierr = str((p.raw or {}).get('invoice_error') or '')
                except Exception:
                    ierr = ''
                logger.warning('pay.start: %s checkout_url bo\'sh qaytdi — %s', p.provider, ierr[:300])
                names = {'payme': 'Payme', 'click': 'Click', 'octobank': 'Octobank', 'multicard': 'Multicard'}
                pname = names.get(p.provider, p.provider or 'To\'lov tizimi')
                msg = f"{pname} test-muhiti hozir band, boshqa to'lov usulini tanlang"
                return None, msg
            return {'payment_id': p.id, 'checkout_url': p.checkout_url,
                    'amount': int(p.amount_uzs), 'provider': p.provider, 'status': p.status}, None
        res, err = await _start()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'data': res}

    async def handle_pay_sandbox_confirm(self, data):
        """Sandbox to'lovni tasdiqlash — TEST rejim (real pul YO'Q). Faqat BILLING_LIVE=0. F3."""
        @database_sync_to_async
        def _confirm():
            from client_erp.payments import service, billing_live
            from client_erp.models import ClientPayment
            from django.conf import settings
            if billing_live() or not getattr(settings, 'PAYMENTS_SANDBOX', True):
                return None, 'Sandbox tasdiq o\'chirilgan'
            pid = int(data.get('payment_id') or 0)
            p = ClientPayment.objects.filter(id=pid, user=self.user).first()
            if not p:
                return None, "To'lov topilmadi"
            before = self.user.coins or 0
            service.confirm(p, external_id=(p.external_id or ('sbx_' + str(p.id))))
            self.user.refresh_from_db()
            u = self.user
            return {'balance': u.coins, 'coins': u.coins, 'status': 'paid',
                    'coins_added': max(0, (u.coins or 0) - before)}, None
        res, err = await _confirm()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'data': res}

    async def handle_pay_status(self, data):
        """To'lov holati (polling) — provayderdan FAOL tekshiradi (receipts.check). F3."""
        @database_sync_to_async
        def _st():
            from client_erp.payments import service
            from client_erp.models import ClientPayment, ClientUser
            p = ClientPayment.objects.filter(id=int(data.get('payment_id') or 0), user=self.user).first()
            if not p:
                return None
            # Payme kabi provayderlarda receipts.check chaqirilib, state=4 bo'lsa
            # confirm/_fulfill bajariladi (tanga/tarif beriladi). Sandbox: o'zgarmaydi.
            p = service.poll_status(p) or p
            u = ClientUser.objects.get(pk=self.user.pk)
            return {'status': p.status, 'fulfilled': p.fulfilled,
                    'balance': u.coins, 'coins': u.coins}
        r = await _st()
        if r is None:
            return {'ok': False, 'error': "To'lov topilmadi"}
        return {'ok': True, 'data': r}

    async def handle_onboarding_accept(self, data):
        """1-marta ro'yxatdan o'tish: ommaviy ofertani qabul + ism (Payme rozilik).

        ⚠️ H2 (2026-08-03) — ISM FAQAT BIR MARTA yoziladi.
        Ilgari gate yo'q edi: istalgan foydalanuvchi istalgan paytda shu
        handlerni qayta chaqirib (`WS.send('onboarding.accept', {full_name})`)
        ismini xohlagancha o'zgartira olardi. Bu — moliyaviy hujum vektori:
        foyda ulushi ISM bo'yicha moslashtirilgani uchun (`ClientOrderProfitShare
        .name`, 144/144 yozuvda `member` FK bo'sh), a'zo o'z ismini boshqa
        ustanikiga o'zgartirib, keyingi «Pul yechish»da uning ulushini o'z
        balansiga oldirishi mumkin edi (audit: DOCS/TZ-Shartnoma-Foyda-Jamoa-
        Moliya.md §0.4-D).

        Endi: onboarding allaqachon qabul qilingan bo'lsa — ism O'ZGARMAYDI
        (oferta qayta tasdiqlansa ham). Ism o'zgartirish kerak bo'lsa — admin
        orqali (audit izi qoladi).
        """
        @database_sync_to_async
        def _accept():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientUser
            from django.utils import timezone
            u = ClientUser.objects.get(pk=self.user.pk)
            name = (data.get('full_name') or '').strip()
            fields = ['oferta_accepted', 'oferta_accepted_at']
            # H2: ism faqat BIRINCHI marta (onboarding hali qabul qilinmaganda)
            _first_time = not u.oferta_accepted
            u.oferta_accepted = True
            u.oferta_accepted_at = timezone.now()
            if name and _first_time:
                u.full_name = name[:200]
                fields.append('full_name')
            u.save(update_fields=fields)
            return {'full_name': u.full_name, 'name_locked': not _first_time}
        res = await _accept()
        return {'ok': True, 'data': res}

    async def handle_glive_start(self, data):
        """Gemini Live ephemeral token — real-time ovozli boshqaruv. F4.
        Gate: feature 'gemini_live' + tanga (ikkalasi ham STANDART o'chiq → hamma uchun ochiq/bepul)."""
        @database_sync_to_async
        def _start():
            from client_erp import gemini_live
            from client_erp.services import coins
            allowed, affordable = gemini_live.can_use_live(self.user)
            if not allowed:
                return None, {'error': 'plan', 'upgrade': True, 'feature': 'gemini_live'}
            if not affordable:
                return None, {'error': 'coins', 'need': coins.ai_price('gemini_live'),
                              'balance': (self.user.coins or 0)}
            # Avval token — muvaffaqiyatli bo'lsagina tanga yechamiz (refund-gap yo'q).
            tok = gemini_live.mint_ephemeral_token()
            if tok.get('error'):
                return None, {'error': tok['error'], 'detail': tok.get('detail', '')}
            try:
                coins.charge(self.user, 'gemini_live', ref_id='glive')  # o'chiq bo'lsa 0
            except coins.InsufficientCoins as e:
                return None, {'error': 'coins', 'need': e.need, 'balance': e.balance}
            system = gemini_live.system_context(self.user.full_name, data.get('page') or '')
            return {'token': tok['token'], 'model': tok['model'], 'system': system,
                    'coins': (self.user.coins or 0)}, None
        res, err = await _start()
        if err:
            return {'ok': False, 'error': err.get('error'), 'data': err}
        return {'ok': True, 'data': res}

    async def handle_page_dashboard(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_dashboard
            self.user.refresh_from_db()
            return serialize_dashboard(self.user)

        return {'ok': True, 'data': await _get()}

    async def handle_dashboard_pending_detail(self, data):
        """'💰 Kutilmoqda' kartasi bosilganda — qaysi zakaz(lar)dan qancha
        kutilayotgani (2026-08-12). FAQAT O'QIYDI. `profit_claim_pending`
        (services/scope.py) bilan bir xil manba — Dashboard'dagi raqam va bu
        ro'yxat yig'indisi HAR DOIM mos kelishi shart."""
        @database_sync_to_async
        def _detail():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from decimal import Decimal
            from client_erp.models import ClientOrder
            from client_erp.services.scope import profit_claim_pending

            pending = profit_claim_pending(self.user)
            if not pending:
                return {'total': '0', 'orders': []}
            orders = {
                o.id: o for o in ClientOrder.objects.filter(
                    pk__in=[p[0] for p in pending],
                ).select_related('customer', 'owner')
            }
            rows = []
            total = Decimal('0')
            for oid, amount, delivered_date in pending:
                o = orders.get(oid)
                if not o:
                    continue
                total += amount
                rows.append({
                    'order_id': oid,
                    'title': o.title,
                    'customer': o.customer.full_name if o.customer_id else '',
                    'owner_name': o.owner.full_name if o.owner_id else '',
                    'amount': str(int(amount)),
                    'delivered_at': delivered_date.isoformat() if delivered_date else None,
                })
            rows.sort(key=lambda r: r['delivered_at'] or '', reverse=True)
            return {'total': str(int(total)), 'orders': rows}

        return {'ok': True, 'data': await _detail()}

    async def handle_page_clients(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.models import ClientCustomer, ClientOrder
            from client_erp.serializers import serialize_customer
            clients = ClientCustomer.objects.filter(owner=self.user).annotate(
                order_count=models.Count('orders', filter=models.Q(orders__owner=self.user, orders__is_deleted=False)),
            ).order_by('-created_at')
            # Har mijoz uchun buyurtma bergan OYLARI (YYYY-MM) + oxirgi buyurtma sanasi —
            # "shu oyda buyurtma berganlar" davr filtri uchun (frontend client-side).
            omonths = {}
            olast = {}
            for cid, ca in ClientOrder.objects.filter(
                owner=self.user, is_deleted=False, customer__isnull=False,
            ).values_list('customer_id', 'created_at'):
                if not ca:
                    continue
                omonths.setdefault(cid, set()).add(ca.strftime('%Y-%m'))
                if cid not in olast or ca > olast[cid]:
                    olast[cid] = ca
            result = []
            for c in clients:
                d = serialize_customer(c)
                d['order_count'] = c.order_count
                d['order_months'] = sorted(omonths.get(c.pk, []), reverse=True)
                d['last_order_at'] = olast[c.pk].isoformat() if c.pk in olast else None
                # Mijoz QO'SHILGAN oyi — buyurtmasiz yangi mijoz ham davr filtrida ko'rinsin.
                d['created_month'] = c.created_at.strftime('%Y-%m') if getattr(c, 'created_at', None) else None
                result.append(d)
            # Saralash: OXIRGI buyurtma bergan mijoz TEPADA (last_order_at desc).
            # Buyurtmasiz mijozlar pastda; teng bo'lsa yaratilgan sana (queryset -created_at) saqlanadi.
            result.sort(key=lambda d: d['last_order_at'] or '', reverse=True)
            return result

        return {'ok': True, 'data': {'clients': await _get()}}

    async def handle_page_client_detail(self, data):
        await self._unsubscribe_all_orders()
        client_id = data.get('id')
        if not client_id:
            return {'ok': False, 'error': 'id kerak'}

        @database_sync_to_async
        def _get():
            from client_erp.models import ClientCustomer, ClientOrder
            from client_erp.serializers import serialize_customer, serialize_order_brief
            try:
                customer = ClientCustomer.objects.get(pk=client_id, owner=self.user)
            except ClientCustomer.DoesNotExist:
                return None, 'Mijoz topilmadi'
            orders = list(ClientOrder.objects.filter(
                owner=self.user, customer_id=customer.pk, is_deleted=False,
            ).select_related('customer').order_by('-created_at'))
            orders_data = [serialize_order_brief(o) for o in orders]
            return {
                'customer': serialize_customer(customer),
                'orders': orders_data,
                'stats': {'count': len(orders_data)},
            }, None

        result, error = await _get()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': result}

    async def handle_page_orders(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import (
                ClientOrder, ClientOrderPermission, ClientOrderStageTemplate,
                ClientCustomer,
            )
            from client_erp.serializers import serialize_order_brief, serialize_template, serialize_customer

            orders = list(ClientOrder.objects.filter(
                owner=self.user, is_deleted=False,
            ).select_related('customer').order_by('-created_at'))

            # is_linked uchun: MebelCity etapi ulangan order id'lar (N+1 siz)
            from client_erp.models import ClientOrderStage
            _stage_linked = set(ClientOrderStage.objects.filter(
                order_id__in=[o.pk for o in orders], mebelcity_order_id__isnull=False,
            ).values_list('order_id', flat=True))

            # Zamer holati: ulangan MC zakaz(lar)ida zamer bormi (batch, N+1 siz)
            _zamer_orders = set()
            try:
                _mc_map = {}
                for o in orders:
                    if o.mebelcity_order_id:
                        _mc_map.setdefault(o.pk, set()).add(o.mebelcity_order_id)
                for _oid, _mcid in ClientOrderStage.objects.filter(
                    order_id__in=[o.pk for o in orders],
                    mebelcity_order_id__isnull=False,
                ).values_list('order_id', 'mebelcity_order_id'):
                    _mc_map.setdefault(_oid, set()).add(_mcid)
                _all_mc = set().union(*_mc_map.values()) if _mc_map else set()
                if _all_mc:
                    from manfacturing.models import Zamer
                    _zamer_mc = set(Zamer.objects.filter(
                        order_id__in=_all_mc,
                    ).values_list('order_id', flat=True))
                    _zamer_orders = {
                        _oid for _oid, _mcs in _mc_map.items() if _mcs & _zamer_mc
                    }
            except Exception:
                _zamer_orders = set()

            # Ulangan MebelCity buyurtma(lar)ning ishlab chiqarish progressi —
            # ro'yxat kartasida "🔗 Ulangan" chip endi foiz/bosqich bilan birga
            # ko'rinsin (bitta zakazga bir nechta bosqich ulangan bo'lsa — ENG
            # KAM tugagan/eng past progressli asosiy deb olinadi, chunki
            # "hali tugamagan" narsa ustaga muhimroq).
            _mc_progress = {}
            try:
                if _mc_map:
                    from manfacturing.models import Order, OrderStep
                    _all_mc_list = list(_all_mc)
                    _mc_orders = {o.pk: o for o in Order.objects.filter(pk__in=_all_mc_list)}
                    _steps_total = {}
                    _steps_done = {}
                    for _mid, _st in OrderStep.objects.filter(order_id__in=_all_mc_list).values_list('order_id', 'state'):
                        _steps_total[_mid] = _steps_total.get(_mid, 0) + 1
                        if _st == 'done':
                            _steps_done[_mid] = _steps_done.get(_mid, 0) + 1
                    _cur_step = {}
                    for _mid, _name in (OrderStep.objects.filter(
                        order_id__in=_all_mc_list, state='in_progress',
                    ).select_related('step_type').order_by('order_id', 'sequence', 'id')
                            .values_list('order_id', 'step_type__name')):
                        if _mid not in _cur_step:
                            _cur_step[_mid] = _name
                    for _oid, _mcs in _mc_map.items():
                        best = None
                        for _mid in _mcs:
                            _mo = _mc_orders.get(_mid)
                            if not _mo:
                                continue
                            _tot = _steps_total.get(_mid, 0)
                            _done = _steps_done.get(_mid, 0)
                            _pct = int(_done * 100 / _tot) if _tot else 0
                            cand = {'progress': _pct, 'current_step': _cur_step.get(_mid), 'state': _mo.state}
                            if best is None or _pct < best['progress']:
                                best = cand
                        if best:
                            _mc_progress[_oid] = best
            except Exception:
                logger.exception("MC progress (orders list) hisoblashda xato")
                _mc_progress = {}

            # "Kutilmoqda" sababini karta uchun bulk olish (N+1 siz — bitta so'rov)
            from client_erp.models.order import ClientOrderTimeline
            _waiting_ids = [o.pk for o in orders if o.status == 'waiting']
            waiting_notes = {}
            if _waiting_ids:
                _tl_rows = ClientOrderTimeline.objects.filter(
                    order_id__in=_waiting_ids, action='status_change',
                    note__icontains='→ Kutilmoqda',
                ).order_by('order_id', '-created_at').values_list('order_id', 'note')
                for _oid, _note in _tl_rows:
                    if _oid in waiting_notes:
                        continue  # eng oxirgisi (created_at bo'yicha) allaqachon olindi
                    _reason = None
                    if _note and ' — ' in _note:
                        _reason = _note.rsplit(' — ', 1)[-1].strip() or None
                    waiting_notes[_oid] = _reason

            shared_perms = ClientOrderPermission.objects.filter(
                user=self.user, order__is_deleted=False,
            ).select_related('order', 'order__customer')

            templates = ClientOrderStageTemplate.objects.filter(
                models.Q(owner=self.user) | models.Q(is_default=True),
            ).prefetch_related('items')

            clients = ClientCustomer.objects.filter(owner=self.user).order_by('-created_at')

            from client_erp.models import ClientOrderStatusDef
            statuses = list(ClientOrderStatusDef.objects.filter(is_active=True).order_by('sort_order', 'id').values(
                'key', 'label', 'color', 'is_system',
            ))

            # Ulanmagan MebelCity buyurtmalar — usta telefoniga bog'liq, lekin
            # hech qaysi zakazga (order YOKI stage darajasida) ulanmagan.
            # "MebelCity bilan bog'lash" bo'limida ko'rsatish uchun (2026-08-28 TZ).
            unlinked_mc = []
            try:
                phone = self.user.phone
                if phone:
                    from manfacturing.models import Order as _MCOrder
                    from hashids import Hashids as _Hashids
                    from client_erp.services.name_match import get_mc_client_ids as _get_mc_client_ids
                    from tenant_manager.middleware import get_current_db_alias as _get_current_db_alias
                    _hid = _Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                    _db = _get_current_db_alias()
                    _client_name = None
                    if self.user.client_id:
                        from clients.models import Client as _Client
                        _c = _Client.objects.using(_db).filter(pk=self.user.client_id).first()
                        _client_name = _c.full_name if _c else None
                    _mc_client_ids, _mc_extra_ids = _get_mc_client_ids(phone, _client_name, db_alias=_db, owner_user_id=self.user.id)
                    from django.db.models import Q as _Q2
                    _all_orders = _MCOrder.objects.filter(
                        _Q2(client_id__in=_mc_client_ids) | _Q2(id__in=_mc_extra_ids),
                    ).select_related('client').order_by('-order_date')[:200]
                    _linked_mc_ids = set()
                    for o in orders:
                        if o.mebelcity_order_id:
                            _linked_mc_ids.add(o.mebelcity_order_id)
                    _linked_mc_ids |= set(ClientOrderStage.objects.filter(
                        order__owner=self.user, mebelcity_order_id__isnull=False,
                    ).values_list('mebelcity_order_id', flat=True))
                    for o in _all_orders:
                        if o.pk in _linked_mc_ids:
                            continue
                        unlinked_mc.append({
                            'id': o.pk,
                            'order_hash': _hid.encode(o.pk),
                            'project_name': o.project_name or '',
                            'state': o.state,
                            'created_at': o.order_date.isoformat() if o.order_date else None,
                        })
            except Exception:
                logger.exception("Unlinked MC orders (page.orders) xato")
                unlinked_mc = []

            # Eslatma: "Jamoa buyurtmalari" endi bu yerda emas — Jamoa bo'limida (handle_page_team)

            # Bazis oblaka / VR havolalari — ro'yxat kartochkasida ikonka
            # ko'rsatish uchun (2026-09-08, foydalanuvchi: "zakazni ichiga
            # kirmasdan ham ko'rish kere"). Bulk, N+1 siz — bitta so'rov,
            # `file_type='link'` yozuvlar `file_name`iga qarab VR/Bazis'ga
            # ajratiladi (xuddi frontend `rc-order-detail.js`dagi isVr bilan
            # BIR XIL qoida: nomda "vr"/"3d" bo'lsa VR, aks holda Bazis).
            from client_erp.models.order import ClientOrderFile
            import re as _re
            _bazis_link_url, _vr_link_url = {}, {}
            for _oid, _fname, _url in ClientOrderFile.objects.filter(
                order_id__in=[o.pk for o in orders], file_type='link',
            ).values_list('order_id', 'file_name', 'external_url'):
                if not _url:
                    continue
                if _re.search(r'vr|3d', _fname or '', _re.I):
                    _vr_link_url.setdefault(_oid, _url)
                else:
                    _bazis_link_url.setdefault(_oid, _url)

            return {
                'orders': [serialize_order_brief(
                    o, _stage_linked, waiting_note=waiting_notes.get(o.pk),
                    zamer_order_ids=_zamer_orders, mc_progress=_mc_progress.get(o.pk),
                    bazis_link_url=_bazis_link_url.get(o.pk), vr_link_url=_vr_link_url.get(o.pk),
                ) for o in orders],
                'unlinked_mc_orders': unlinked_mc,
                'shared_orders': [{
                    'order': serialize_order_brief(p.order),
                    'role': p.role,
                } for p in shared_perms],
                'templates': [serialize_template(t) for t in templates],
                'clients': [serialize_customer(c) for c in clients],
                'statuses': statuses,
            }

        return {'ok': True, 'data': await _get()}

    async def handle_page_order(self, data):
        order_id = data.get('id')
        if not order_id:
            return {'ok': False, 'error': 'id kerak'}

        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.models import (
                ClientOrder, ClientOrderPermission, ClientOrderStageTemplate,
            )
            from client_erp.serializers import serialize_order_full, serialize_template

            try:
                order = ClientOrder.objects.select_related('customer', 'owner').get(pk=order_id)
            except ClientOrder.DoesNotExist:
                return None, 'Buyurtma topilmadi'

            is_owner = (order.owner_id == self.user.pk)
            user_role = 'owner'
            can_add_expense = True
            can_complete_stage = True
            can_see_money = True
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user,
                ).first()
                if perm:
                    user_role = perm.role
                    can_add_expense = perm.can_add_expense
                    can_complete_stage = perm.can_complete_stage
                    can_see_money = perm.can_see_money
                else:
                    from client_erp.models.team import ClientTeamMember, ClientOrderShare
                    membership = ClientTeamMember.objects.filter(user=self.user, status='active').select_related('team').first()
                    share = None
                    if membership:
                        share = ClientOrderShare.objects.filter(order=order, team=membership.team).first()
                    if not share:
                        return None, 'Ruxsat yo\'q'
                    user_role = 'viewer' if share.visibility == 'limited' else 'worker'
                    can_add_expense = share.can_add_expense
                    can_complete_stage = share.can_complete
                    # Jamoa ulashishida moliya faqat 'finance_hidden' bo'lmasa ko'rinadi
                    can_see_money = (share.visibility != 'finance_hidden')

            templates = ClientOrderStageTemplate.objects.filter(
                models.Q(owner=self.user) | models.Q(is_default=True),
            ).prefetch_related('items')

            result = serialize_order_full(
                order, user_role=user_role, is_owner=is_owner,
                can_see_money=can_see_money,
            )
            result['templates'] = [serialize_template(t) for t in templates]
            result['can_add_expense'] = can_add_expense
            result['can_complete_stage'] = can_complete_stage
            return result, None

        result, error = await _get()
        if error:
            return {'ok': False, 'error': error}

        await self._subscribe_order(order_id)
        return {'ok': True, 'data': result}

    async def handle_page_analytics(self, data):
        await self._unsubscribe_all_orders()
        period = (data.get('period') or 'month')
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        ym = data.get('ym')

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_analytics
            return serialize_analytics(self.user, period, date_from=date_from, date_to=date_to, ym=ym)

        return {'ok': True, 'data': await _get()}

    async def handle_analytics_ai(self, data):
        period = data.get('period') or 'month'
        request_id = self._msg.get('request_id')

        @database_sync_to_async
        def _prepare():
            from django.conf import settings as conf
            from django.utils import timezone
            from client_erp.serializers import serialize_analytics
            from client_erp.models import ClientAIAnalysis
            cost = getattr(conf, 'AI_ANALYSIS_COIN_COST', 50)
            self.user.refresh_from_db()
            # Kunlik limit — har foydalanuvchi kuniga N marta AI tahlildan foydalanadi.
            # Sabab: hozir tanga sotib olinmayapti, xarajat bizdan — limit bilan nazorat.
            # Faqat MUVAFFAQIYATLI (saqlangan) tahlillar sanaladi; xato bo'lsa sanalmaydi.
            daily_limit = getattr(conf, 'AI_ANALYSIS_DAILY_LIMIT', 2)
            used_today = ClientAIAnalysis.objects.filter(
                owner=self.user, created_at__date=timezone.localdate(),
            ).count()
            if used_today >= daily_limit:
                return None, cost, (
                    f"Kunlik limit tugadi — AI tahlildan kuniga {daily_limit} marta "
                    "foydalanish mumkin. Ertaga qayta urinib ko'ring."
                )
            if self.user.coins < cost:
                return None, cost, f"Tangalar yetarli emas. Kerak: {cost}, Sizda: {self.user.coins}"
            analytics_data = serialize_analytics(self.user, period)
            return analytics_data, cost, None

        analytics_data, cost, error = await _prepare()
        if error:
            return {'ok': False, 'error': error}

        await self.send_json({
            'type': 'analytics.ai.result',
            'request_id': request_id,
            'ok': True,
            'data': {'status': 'streaming'},
        })

        try:
            full_text = await self._stream_ai_response(analytics_data, period)

            @database_sync_to_async
            def _save():
                from client_erp.models import ClientAIAnalysis, XPTransaction
                from client_erp.services.ai_analysis import (
                    _extract_recommendations, _extract_sections,
                )
                self.user.refresh_from_db()
                self.user.coins -= cost
                self.user.save(update_fields=['coins'])
                XPTransaction.objects.create(
                    user=self.user, rule=None, xp_change=0,
                    coin_change=-cost, description=f"AI tahlil ({period})",
                )
                recommendations = _extract_recommendations(full_text)
                sections = _extract_sections(full_text)
                analysis = ClientAIAnalysis.objects.create(
                    owner=self.user, period=period,
                    analysis_text=full_text,
                    recommendations=recommendations,
                    coins_spent=cost, analytics_snapshot=analytics_data,
                )
                return {
                    'id': analysis.pk,
                    'text': full_text,
                    'recommendations': recommendations,
                    'sections': sections,
                    'coins_spent': cost,
                    'coins_remaining': self.user.coins,
                    'created_at': analysis.created_at.isoformat(),
                }

            result = await _save()
            await self.send_json({'type': 'ai.done', 'data': result})

        except Exception as e:
            logger.exception("AI stream error")
            await self.send_json({
                'type': 'ai.error',
                'data': {'error': f"AI tahlil xatosi: {str(e)[:200]}"},
            })

        return None

    async def _stream_ai_response(self, analytics_data, period):
        import time as _time
        from client_erp.services.ai_analysis import (
            _build_detailed_prompt, get_ai_providers,
        )

        prompt = await database_sync_to_async(_build_detailed_prompt)(self.user, analytics_data, period)

        # Provayder zanjiri — get_ai_providers() (ai_analysis bilan YAGONA joy):
        # fal → GitHub Models → Cohere → Gemini → OpenRouter → Anthropic.
        # Bittasining limiti tugasa AVTOMATIK keyingisiga o'tadi. OpenAI-mos yo'l
        # token-token stream qilmaydi — natija bitta bo'lakda yuboriladi.
        def _do():
            last = None
            for name, _mdl, fn in get_ai_providers():
                try:
                    text, _i, _o = fn(prompt)
                    if text:
                        return text, name
                except Exception as e:
                    last = e
                    continue
            raise RuntimeError(f"Barcha AI provayderlar ishlamadi. Oxirgi xato: {last}")

        _t0 = _time.monotonic()
        full_text, prov = await database_sync_to_async(_do)()
        # OpenAI-mos yo'l token-token stream qilmaydi — to'liq matnни bir bo'lakда beramiz
        await self.send_json({'type': 'ai.chunk', 'data': {'text': full_text}})
        _dur = int((_time.monotonic() - _t0) * 1000)

        try:
            from voicebot.ai_logger import log_ai_call
            await database_sync_to_async(log_ai_call)(
                provider=prov, model='(provider-chain)', action='analytics',
                endpoint='_stream_ai_response', duration_ms=_dur,
                prompt_preview=prompt[:200], response_preview=full_text[:200],
                request_meta={'period': period, 'provider': prov},
                user=self.user,
            )
        except Exception:
            pass

        return full_text

    async def handle_analytics_ai_history(self, data):
        @database_sync_to_async
        def _get():
            from client_erp.models import ClientAIAnalysis
            from client_erp.services.ai_analysis import _extract_sections
            analyses = ClientAIAnalysis.objects.filter(
                owner=self.user,
            ).order_by('-created_at')[:10]
            result = []
            for a in analyses:
                result.append({
                    'id': a.pk,
                    'period': a.period,
                    'text': a.analysis_text,
                    'recommendations': a.recommendations,
                    'sections': _extract_sections(a.analysis_text),
                    'coins_spent': a.coins_spent,
                    'created_at': a.created_at.isoformat(),
                })
            return result

        return {'ok': True, 'data': await _get()}

    async def handle_rate_get(self, data):
        """Joriy USD→UZS kurs (pul inputlari ostidagi dollar hisob-kitobi uchun)."""
        @database_sync_to_async
        def _get():
            try:
                from core.services.rates import current_rate
                return float(current_rate('finance'))
            except Exception:
                return 11900.0
        return {'ok': True, 'data': {'rate': await _get()}}

    async def handle_page_finance(self, data):
        await self._unsubscribe_all_orders()
        data = data or {}
        period = data.get('period') or 'month'
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        ym = data.get('ym')

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_finance_page
            return serialize_finance_page(self.user, period=period, date_from=date_from, date_to=date_to, ym=ym)

        return {'ok': True, 'data': await _get()}

    @staticmethod
    def _mc_secure_code(order_id):
        import hmac, hashlib, base64
        from django.conf import settings
        key = settings.SECRET_KEY.encode()[:32]
        sig = hmac.new(key, str(order_id).encode(), hashlib.sha256).hexdigest()[:6].upper()
        id_b = base64.urlsafe_b64encode(str(order_id).encode()).decode().rstrip('=')
        return f"{id_b}-{sig}"

    @staticmethod
    def _mc_decode_code(code):
        import hmac, hashlib, base64
        from django.conf import settings
        parts = code.rsplit('-', 1)
        if len(parts) != 2:
            return None
        id_b, sig = parts
        padding = 4 - len(id_b) % 4
        if padding != 4:
            id_b += '=' * padding
        try:
            order_id = int(base64.urlsafe_b64decode(id_b).decode())
        except Exception:
            return None
        key = settings.SECRET_KEY.encode()[:32]
        expected = hmac.new(key, str(order_id).encode(), hashlib.sha256).hexdigest()[:6].upper()
        if not hmac.compare_digest(sig, expected):
            return None
        return order_id

    async def handle_page_mebelcity(self, data):
        await self._unsubscribe_all_orders()
        # ── Davr filtri (2026-08-25) — Moliya sahifasidagi `RcPeriod` bilan
        # BIR XIL parametrlar va hisoblagich (`get_period_bounds`). Faqat
        # `order_date` bo'yicha filtr qo'shildi — boshqa hech narsa
        # o'zgartirilmadi.
        data = data or {}
        _period = data.get('period') or 'month'
        _date_from = data.get('date_from')
        _date_to = data.get('date_to')
        _ym = data.get('ym')

        @database_sync_to_async
        def _get():
            phone = self.user.phone
            if not phone:
                return []
            try:
                from manfacturing.models import Order, OrderStep
                from hashids import Hashids
                from client_erp.services.periods import get_period_bounds
                from client_erp.services.name_match import get_mc_client_ids
                from tenant_manager.middleware import get_current_db_alias
                _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                _db = get_current_db_alias()
                # Telefon VA firma nomi bo'yicha — MebelCity'da bitta firma
                # uchun bir necha dublikat Client bor, telefonlari har xil
                # (xato terilgan) bo'lishi mumkin (2026-08-28, foydalanuvchi
                # topdi: faqat telefon bilan 17+ ta buyurtma ko'rinmay qolgan
                # edi). client_erp.models.ClientUser.client FK orqali firma
                # nomini olamiz (bor bo'lsa).
                _client_name = None
                if self.user.client_id:
                    from clients.models import Client as _Client
                    _c = _Client.objects.using(_db).filter(pk=self.user.client_id).first()
                    _client_name = _c.full_name if _c else None
                # 2026-09-11: `owner_user_id` — ustaning o'zi allaqachon ulagan
                # MC buyurtmalarni (`_mc_extra_ids`) ham qamrab oladi (xodim
                # xatosi bilan boshqa Client'ga bog'langan holatlar uchun —
                # Client'ning HAMMA buyurtmasini emas, faqat shu ANIQ
                # ulangan buyurtma ID'larini, boshqa mijoz aralashmasin).
                _mc_client_ids, _mc_extra_ids = get_mc_client_ids(phone, _client_name, db_alias=_db, owner_user_id=self.user.id)
                if not _mc_client_ids and not _mc_extra_ids:
                    return []
                _start, _end, _, _ = get_period_bounds(_period, _date_from, _date_to, _ym)
                from django.db.models import Q as _Q
                orders = Order.objects.filter(
                    _Q(client_id__in=_mc_client_ids) | _Q(id__in=_mc_extra_ids),
                )
                if _start:
                    orders = orders.filter(order_date__date__gte=_start, order_date__date__lte=_end)
                orders = orders.select_related('client', 'create_user').order_by('-order_date')[:200]
                delivery_labels = dict(Order.DELIVERY_STATE_CHOICES)
                state_labels = dict(Order.state_choices)

                # Ulanganmi (usta o'z zakaziga bog'lagan bo'lsa) — batch, N+1 siz.
                # Ulangan bo'lsa, bog'langan usta-zakazning NOMI va STATUSI shu
                # yerda ko'rsatiladi (2026-08-28 TZ: "#/mebelcity" ham ulangan/
                # ulanmaganni ajratsin, "Zakaz" sahifasidagi kabi).
                from client_erp.models import ClientOrder, ClientOrderStage
                _mc_ids = [o.pk for o in orders]
                _linked_by_order = {}
                for _oid, _cid, _title, _status in ClientOrder.objects.filter(
                    owner=self.user, mebelcity_order_id__in=_mc_ids, is_deleted=False,
                ).values_list('mebelcity_order_id', 'id', 'title', 'status'):
                    _linked_by_order[_oid] = {'id': _cid, 'title': _title, 'status': _status}
                for _mid, _cid, _title, _status in ClientOrderStage.objects.filter(
                    order__owner=self.user, mebelcity_order_id__in=_mc_ids,
                ).values_list('mebelcity_order_id', 'order_id', 'order__title', 'order__status'):
                    if _mid not in _linked_by_order:
                        _linked_by_order[_mid] = {'id': _cid, 'title': _title, 'status': _status}

                # ── "Ehtimol shu?" taklif (2026-09-02 TZ) ────────────────────
                # Faqat 2026-09-01dan keyingi zakazlar uchun: xodim (create_user)
                # bo'yicha — agar shu xodim yaratgan BOSHQA MC buyurtma allaqachon
                # ustaning biror ClientOrder'iga ulangan bo'lsa, ulanmagan
                # buyurtmaga o'sha ClientOrder'ni taklif sifatida ko'rsatamiz.
                # Hech qachon avtomatik ULAMAYDI — faqat taklif, usta tasdiqlaydi.
                from datetime import date as _date
                _SCOPE_FROM = _date(2026, 9, 1)
                _creator_to_linked = {}
                for o in orders:
                    if o.pk in _linked_by_order and o.create_user_id:
                        _creator_to_linked.setdefault(o.create_user_id, _linked_by_order[o.pk])

                result = []
                for o in orders:
                    total_steps = OrderStep.objects.filter(order=o).count()
                    done_steps = OrderStep.objects.filter(order=o, state='done').count()
                    progress = int(done_steps * 100 / total_steps) if total_steps else 0

                    # Ishlab chiqarish bosqichlari — step_type bo'yicha GURUHLANGAN
                    # (Kesish/Kromka/Yig'ish...) — "qaysi etapga yetgan" ko'rsatish uchun.
                    from collections import OrderedDict
                    _groups = OrderedDict()
                    for s in (OrderStep.objects.filter(order=o).exclude(state='cancel')
                              .select_related('step_type').order_by('sequence', 'id')):
                        nm = s.step_type.name if s.step_type_id and s.step_type else 'Bosqich'
                        g = _groups.get(nm)
                        if not g:
                            g = {'name': nm, 'total': 0, 'done': 0, 'active': False}
                            _groups[nm] = g
                        g['total'] += 1
                        if s.state == 'done':
                            g['done'] += 1
                        elif s.state in ('in_progress', 'partial', 'check', 'fix'):
                            g['active'] = True
                    steps_list = []
                    for g in _groups.values():
                        all_done = g['total'] > 0 and g['done'] >= g['total']
                        steps_list.append({
                            'name': g['name'], 'done': all_done,
                            'active': bool(g['active']) and not all_done,
                            'count': g['total'], 'done_count': g['done'],
                        })
                    current_step = ''
                    for s in reversed(steps_list):
                        if s['active']:
                            current_step = s['name']; break
                    if not current_step:
                        for s in reversed(steps_list):
                            if s['done']:
                                current_step = s['name']; break
                    # ── SUMMA (2026-08-08 TUZATILDI) ─────────────────────────────
                    # BUG: xizmat qatorida `price_uzs` so'ralardi, lekin
                    # `SaleServiceItem` da bu maydon YO'Q (to'g'risi `unit_price`).
                    # FieldError butun `try` ni uzib, `except: pass` uni yutardi.
                    # Natija: (1) `sale_brief` HECH QACHON to'lmasdi — mahsulot/
                    # xizmat tafsiloti ko'rinmasdi; (2) yig'indi YARIM YO'LDA
                    # to'xtardi — birinchi sotuvdan keyingilari qo'shilmasdi.
                    # Misol: buyurtma #1820 da 2 ta sotuv (103 800 + 1 151 000),
                    # ekranda esa 103 800 turardi. Mijoz «chekdagi summa boshqa»
                    # deb haqli e'tiroz bildirgan.
                    #
                    # QOIDA (xotira: aggregate-all-linked-sales): ulangan sotuv
                    # bir nechta bo'lsa — HAMMASI qo'shiladi, hech qachon .first() emas.
                    total_sum = 0
                    sale_brief = None
                    _all_lines, _all_svcs, _sale_ids = [], [], []
                    for link in o.sale_links.select_related('sale').all():
                        _s = link.sale
                        if not _s:
                            continue
                        # ── CHEK BILAN BIR XIL QOIDA (2026-08-08) ─────────────
                        # `widget_check` (haqiqiy chek) BEKOR QILINGAN sotuvni
                        # chiqarib tashlaydi (`_countable`: 'Отмен' bo'lmasin).
                        # «Проведен» + «Новый» + «Возвращен» KIRADI.
                        # Bu yerda ham AYNAN shu qoida — aks holda mijoz
                        # «sahifadagi summa chekdan boshqa» deb haqli e'tiroz
                        # bildiradi (2 ta buyurtmada 14 162 600 farq bor edi).
                        if 'Отмен' in (getattr(_s, 'status', '') or ''):
                            continue
                        # Yig'indi ALOHIDA try ichida — tafsilot yiqilsa ham summa to'g'ri qoladi
                        try:
                            total_sum += float(_s.total_uzs or 0)
                            _sale_ids.append(_s.id)
                        except (TypeError, ValueError):
                            pass
                        try:
                            _all_lines += list(_s.lines.all().values(
                                'product_name', 'quantity', 'unit', 'price_uzs', 'total_uzs'))
                        except Exception:                     # noqa: BLE001
                            pass
                        try:
                            # ⚠️ `unit_price` — `price_uzs` EMAS (SaleServiceItem)
                            _all_svcs += list(_s.service_items.all().values(
                                'service_name', 'quantity', 'unit', 'unit_price', 'total_uzs'))
                        except Exception:                     # noqa: BLE001
                            pass
                    if _all_lines or _all_svcs:
                        sale_brief = {
                            'id': _sale_ids[0] if _sale_ids else None,
                            'sale_ids': _sale_ids,          # nechta chek — ekranda ko'rsatiladi
                            'total': float(total_sum),
                            # MAVJUD narx ko'rsatiladi (chegirma/bonus/foizga TEGILMAYDI)
                            'lines': [{'name': l['product_name'], 'qty': float(l['quantity'] or 0),
                                       'unit': l['unit'] or 'dona', 'price': float(l['price_uzs'] or 0),
                                       'total': float(l['total_uzs'] or 0)} for l in _all_lines],
                            'services': [{'name': v['service_name'], 'qty': float(v['quantity'] or 0),
                                          'unit': v['unit'] or 'dona', 'price': float(v['unit_price'] or 0),
                                          'total': float(v['total_uzs'] or 0)} for v in _all_svcs],
                        }
                    import json as _json
                    try:
                        files_info = _json.loads(o.files_cache or '[]')
                    except Exception:
                        files_info = []
                    # "Qayerdan yaratilgan" — Bazis dasturidan (o.bazis_projects
                    # bog'liq bo'lsa) yoki xodim tomonidan qo'lda kiritilgan.
                    # 2026-08-28, foydalanuvchi: mijoz ismi + firma nomi + yaratgan
                    # xodim + manba (Bazis/qo'lda) hammasi aniq ko'rinishi kerak.
                    try:
                        from_bazis = o.bazis_projects.exists()
                    except Exception:
                        from_bazis = False
                    _is_new_scope = bool(o.order_date and o.order_date.date() >= _SCOPE_FROM)
                    _is_linked_now = o.pk in _linked_by_order
                    _suggested = None
                    if _is_new_scope and not _is_linked_now and o.create_user_id:
                        _suggested = _creator_to_linked.get(o.create_user_id)
                    result.append({
                        'id': o.pk,
                        'order_hash': _hashids.encode(o.pk),
                        'code': getattr(o, 'order_token', '') or '',
                        'project_name': o.project_name or '',
                        'partner_name': o.client.name if o.client else '',
                        'owner_name': (f"{o.create_user.first_name} {o.create_user.last_name}".strip() or o.create_user.username) if o.create_user else '',
                        'source_label': 'Bazis dasturidan' if from_bazis else 'Qo\'lda kiritilgan',
                        'deadline': o.deadline_at.isoformat() if getattr(o, 'deadline_at', None) else None,
                        'state': getattr(o, 'state', ''),
                        'state_label': state_labels.get(o.state, o.state),
                        'delivery_state': getattr(o, 'delivery_state', ''),
                        'delivery_label': delivery_labels.get(o.delivery_state, ''),
                        'total_sum': total_sum,
                        'progress': progress,
                        'is_urgent': getattr(o, 'is_urgent', False),
                        'created_at': o.order_date.isoformat() if getattr(o, 'order_date', None) else None,
                        'sale_brief': sale_brief,
                        'files_info': files_info,
                        'steps': steps_list,
                        'current_step': current_step,
                        'total_steps': total_steps,
                        'done_steps': done_steps,
                        # Usta zakaziga ulanganmi — ulangan bo'lsa, o'sha zakazning
                        # nomi/statusi (2026-08-28 TZ: "Zakaz" sahifasidagi kabi).
                        'is_linked': _is_linked_now,
                        'linked_order': _linked_by_order.get(o.pk),
                        # 2026-09-02 TZ: faqat 2026-09-01dan keyingi zakazlar uchun
                        # "Ehtimol shu?" taklif + bekor qilish belgisi ishlaydi.
                        'is_new_scope': _is_new_scope,
                        'suggested_link': _suggested,
                    })
                return result
            except Exception as e:
                logger.exception("MebelCity orders error")
                return []

        @database_sync_to_async
        def _get_months():
            # «Aniq oy…» dropdown uchun — barcha vaqt, davr filtriga
            # bog'liq emas (Moliya sahifasidagi `months` bilan bir xil naqsh).
            from collections import OrderedDict
            from django.db.models.functions import TruncMonth
            from django.db.models import Count as _Count
            phone = self.user.phone
            if not phone:
                return {}
            try:
                from manfacturing.models import Order
                from client_erp.services.name_match import get_mc_client_ids
                from tenant_manager.middleware import get_current_db_alias
                _db = get_current_db_alias()
                _client_name = None
                if self.user.client_id:
                    from clients.models import Client as _Client
                    _c = _Client.objects.using(_db).filter(pk=self.user.client_id).first()
                    _client_name = _c.full_name if _c else None
                # 2026-09-11: `owner_user_id` — ustaning o'zi allaqachon ulagan
                # MC buyurtmalarni ham qamrab oladi (xodim xatosi bilan
                # boshqa Client'ga bog'langan holatlar uchun).
                _mc_client_ids, _mc_extra_ids = get_mc_client_ids(phone, _client_name, db_alias=_db, owner_user_id=self.user.id)
                from django.db.models import Q as _Q3
                rows = (Order.objects.filter(_Q3(client_id__in=_mc_client_ids) | _Q3(id__in=_mc_extra_ids))
                        .annotate(_m=TruncMonth('order_date')).values('_m')
                        .annotate(n=_Count('id')).order_by('-_m'))
                out = OrderedDict()
                for row in rows:
                    if row['_m']:
                        out[row['_m'].strftime('%Y-%m')] = row['n']
                return out
            except Exception:                                  # noqa: BLE001
                return {}

        orders, months = await _get(), await _get_months()
        return {'ok': True, 'data': {'orders': orders, 'months': months}}

    async def handle_mebelcity_order_detail(self, data):
        """Bitta MebelCity buyurtmaning TO'LIQ tafsiloti — screenshot'dagi
        katta ERP sahifasiga o'xshash (bosqich holati/sana/ishchi), lekin
        usta.bittada.uz ICHIDA render qilinadi (2026-08-28 TZ: iframe orqali
        mebelcity.bittada.uz'ni ochish DNS/Private-Network-Access sabab
        bloklanadi — bu yechim server/DNS'ga TEGMAYDI, faqat DB'dan o'qib
        client_erp'ning o'z ko'rinishida chizadi).

        Xavfsizlik: usta faqat O'ZINING telefon raqamiga bog'liq (allaqachon
        handle_page_mebelcity/handle_mebelcity_orders_for_stage'da ishlatilgan
        filtr bilan bir xil) MebelCity buyurtmasini ko'ra oladi."""
        mc_id = data.get('id')
        if not mc_id:
            return {'ok': False, 'error': 'id kerak'}

        @database_sync_to_async
        def _get():
            phone = self.user.phone
            if not phone:
                return None, "Telefon raqam yo'q"
            from manfacturing.models import Order, OrderStep
            from client_erp.services.name_match import get_mc_client_ids
            from tenant_manager.middleware import get_current_db_alias
            _db = get_current_db_alias()
            _client_name = None
            if self.user.client_id:
                from clients.models import Client as _Client
                _c = _Client.objects.using(_db).filter(pk=self.user.client_id).first()
                _client_name = _c.full_name if _c else None
            _mc_client_ids, _mc_extra_ids = get_mc_client_ids(phone, _client_name, db_alias=_db, owner_user_id=self.user.id)
            try:
                if mc_id in _mc_extra_ids:
                    o = Order.objects.select_related('client').get(pk=mc_id)
                else:
                    o = Order.objects.select_related('client').get(
                        pk=mc_id, client_id__in=_mc_client_ids,
                    )
            except Order.DoesNotExist:
                return None, "Ruxsat yo'q yoki topilmadi"
            state_labels = dict(Order.state_choices)
            step_labels = {
                'pending': 'Kutilmoqda', 'in_progress': 'Bajarilmoqda',
                'done': 'Tugallandi', 'check': 'Tekshirilmoqda',
                'error': "Tekshiruvdan o'tmadi", 'cancel': 'Bekor qilindi',
                'fix': 'Tuzatilmoqda', 'paused': "To'xtatildi",
            }
            steps = []
            for s in (OrderStep.objects.filter(order=o).exclude(state='cancel')
                      .select_related('step_type', 'completed_by', 'assigned_user')
                      .order_by('sequence', 'id')):
                worker = s.completed_by or s.assigned_user
                steps.append({
                    'id': s.pk,
                    'name': s.step_type.name if s.step_type else 'Bosqich',
                    'state': s.state,
                    'state_label': step_labels.get(s.state, s.state),
                    'start_date': s.start_date.isoformat() if s.start_date else None,
                    'end_date': s.end_date.isoformat() if s.end_date else None,
                    'worker_name': (worker.get_full_name() or worker.username) if worker else None,
                })
            import json as _json
            try:
                files_info = _json.loads(o.files_cache or '[]')
            except Exception:
                files_info = []
            return {
                'id': o.pk,
                'project_name': o.project_name or '',
                'partner_name': o.client.full_name if o.client else '',
                'state': o.state,
                'state_label': state_labels.get(o.state, o.state),
                'created_at': o.order_date.isoformat() if o.order_date else None,
                'deadline': o.deadline_at.isoformat() if getattr(o, 'deadline_at', None) else None,
                'steps': steps,
                'files_info': files_info,
            }, None

        result, error = await _get()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': result}

    @staticmethod
    def _resolve_client_orders_by_mc(mc_order_ids):
        """MC order_id lar uchun ichki buyurtma (ClientOrder) topadi."""
        if not mc_order_ids:
            return {}
        from client_erp.models import ClientOrderStage, ClientOrder
        mapping = {}
        stages = ClientOrderStage.objects.filter(
            mebelcity_order_id__in=mc_order_ids,
        ).select_related('order').only('mebelcity_order_id', 'order__id', 'order__title')
        for s in stages:
            if s.mebelcity_order_id not in mapping:
                mapping[s.mebelcity_order_id] = {
                    'id': s.order_id,
                    'title': s.order.title,
                }
        return mapping

    async def handle_page_vizualizatsiya(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            import re
            from django.db.models import Q
            from django.utils import timezone
            try:
                from widget_panorama.models import PanoramaGallery
                from hashids import Hashids
                _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                now = timezone.now()

                q_filter = Q(erp_client=self.user)

                phone = self.user.phone
                if phone:
                    digits = re.sub(r'\D', '', phone)
                    if digits.startswith('998') and len(digits) > 9:
                        digits = digits[3:]
                    q_filter = q_filter | Q(order__client__phone__endswith=digits)

                galleries = list(PanoramaGallery.objects.filter(
                    q_filter,
                ).select_related('order', 'order__client', 'uploaded_by').prefetch_related('panoramas').distinct().order_by('-created_at')[:50])

                mc_ids = [g.order_id for g in galleries if g.order_id and not g.client_order_id]
                mc_map = MiniERPConsumer._resolve_client_orders_by_mc(mc_ids)

                co_cache = {}
                result = []
                for g in galleries:
                    panos = list(g.panoramas.all())
                    thumb = None
                    if panos:
                        for p in panos:
                            if p.thumbnail:
                                try:
                                    thumb = p.thumbnail.url
                                except Exception:
                                    pass
                                break

                    # AI-generatsiya (panorama_ai.py) gallery'ni DARHOL yaratadi
                    # (natijadan oldin) — shu bilan bu yerda "Yaratilmoqda..."
                    # kartasi sifatida chiqadi. 10 daqiqadan keyin ham hali
                    # 0 panorama bo'lsa — muvaffaqiyatsiz/tashlab ketilgan urinish,
                    # ro'yxatdan yashiriladi (ko'rinmas ghost-karta bo'lib qolmasin).
                    # ⚠️ Havola-turi galereyada (external_url to'ldirilgan, 2026-09-04)
                    # `panos` HAR DOIM bo'sh — fayl fizik yuklanmaydi, shuning uchun
                    # bu "pending"/timeout mantig'idan MUSTASNO (aks holda 10 daqiqadan
                    # keyin ro'yxatdan yo'qolib qolardi).
                    is_link = bool(g.external_url)
                    age_seconds = (now - g.created_at).total_seconds() if g.created_at else 9999
                    if not is_link and not panos and age_seconds > 600:
                        continue
                    pending = (not panos) and not is_link

                    co_id = g.client_order_id
                    co_title = ''
                    if co_id:
                        if co_id not in co_cache:
                            from client_erp.models import ClientOrder
                            _o = ClientOrder.objects.filter(pk=co_id, is_deleted=False).first()
                            co_cache[co_id] = _o.title if _o else None  # None = o'chirilgan/mavjud emas
                        co_title = co_cache[co_id]
                        # Ulangan buyurtma o'chirilgan bo'lsa — ULANMAGAN deb ko'rsatamiz
                        # (foydalanuvchi qayta bog'lay olishi uchun "Bog'lash" chiqadi).
                        if co_title is None:
                            co_id = None
                            co_title = ''
                    elif g.order_id and g.order_id in mc_map:
                        co_id = mc_map[g.order_id]['id']
                        co_title = mc_map[g.order_id]['title']

                    result.append({
                        'uuid': str(g.uuid),
                        'name': g.name or '',
                        'order_hash': _hashids.encode(g.order_id) if g.order_id else '',
                        'order_id': g.order_id,
                        'client_order_id': co_id,
                        'client_order_title': co_title,
                        'panorama_count': len(panos),
                        'thumbnail': thumb,
                        'pending': pending,
                        'designer_name': (g.uploaded_by.get_full_name() if g.uploaded_by else '') or '',
                        'created_at': g.created_at.isoformat() if g.created_at else None,
                        # Faqat o'zi (mini ERP orqali) yaratgan galereyani o'chirish/
                        # tahrirlash mumkin — telefon-mos ishlab chiqarish galereyasi EMAS.
                        'is_own': g.erp_client_id == self.user.pk,
                        # Tashqi VR/3D havola (2026-09-04) — to'ldirilgan bo'lsa
                        # frontend ichki panorama-viewer o'rniga to'g'ridan-to'g'ri
                        # shu URLga o'tadi (window.location.href).
                        'external_url': g.external_url or '',
                        'is_link': is_link,
                    })
                return result
            except Exception as e:
                logger.exception("Vizualizatsiya error")
                return []

        return {'ok': True, 'data': {'galleries': await _get()}}

    async def handle_panorama_link(self, data):
        gallery_uuid = data.get('gallery_uuid')
        client_order_id = data.get('client_order_id')

        @database_sync_to_async
        def _link():
            from widget_panorama.models import PanoramaGallery
            try:
                g = PanoramaGallery.objects.get(uuid=gallery_uuid)
                g.client_order_id = client_order_id or None
                g.save(update_fields=['client_order_id'])
                return True
            except PanoramaGallery.DoesNotExist:
                return False

        ok = await _link()
        return {'ok': ok}

    async def handle_panorama_link_add(self, data):
        """Vizualizatsiya ro'yxatiga tashqi VR/3D havola qo'shish (2026-09-04)
        — masalan ShapeSpark. Haqiqiy panorama fayl yuklanmaydi, faqat URL
        saqlanadi; ro'yxatda alohida "🔗 havola" kartochkasi sifatida chiqadi
        (frontend: RcVizual, is_link=true bo'lsa openViewer o'rniga
        window.location.href = external_url)."""
        url = (data.get('url') or '').strip()
        if not url:
            return {'ok': False, 'error': 'Havola kerak'}
        if not (url.startswith('http://') or url.startswith('https://')):
            return {'ok': False, 'error': 'Havola http:// yoki https:// bilan boshlanishi kerak'}
        if len(url) > 500:
            return {'ok': False, 'error': 'Havola juda uzun'}
        name = (data.get('name') or '').strip() or url

        @database_sync_to_async
        def _create():
            from widget_panorama.models import PanoramaGallery
            g = PanoramaGallery.objects.create(
                name=name,
                external_url=url,
                erp_client=self.user,
            )
            return str(g.uuid)

        uuid_str = await _create()
        return {'ok': True, 'data': {'uuid': uuid_str}}

    async def handle_page_catalog(self, data):
        """🛍️ Mahsulotlar vitrinasi — katta ERP katalogidan eng ko'p sotilgan/trend
        50 mahsulot (haftalik avtomatik yangilanadi, refresh_featured_products).

        Product.price (ERP kirim/tannarx) EMAS — so'nggi 30 kunlik haqiqiy
        SOTUV narxi (SaleLine.price_uzs o'rtachasi) ko'rsatiladi. Ombordagi
        qoldiq (total_stock) ham qaytariladi — "bor/yo'q" ko'rsatish uchun."""
        @database_sync_to_async
        def _get():
            from django.db.models import Avg, Sum
            from django.utils import timezone
            from datetime import timedelta
            from client_erp.models import ClientFeaturedProduct
            from sales.models import SaleLine

            entries = list(ClientFeaturedProduct.objects.select_related(
                'product', 'product__category',
            ).prefetch_related('product__images').order_by('-sold_qty_30d'))
            product_ids = [e.product_id for e in entries if e.product_id]

            # Har mahsulotning keng guruh nomi (masalan "Кромка ПВХ 19/1 ..." →
            # "Кромка") — mijozga aniq guruhlar ko'rinishi uchun (management
            # command bilan BIR XIL mantiq — client_erp/services/catalog_category.py).
            from client_erp.services.catalog_category import root_category_name
            _cat_cache = {}

            def _root_category_name(cat):
                return root_category_name(cat, _cat_cache)

            window_start = timezone.now() - timedelta(days=30)
            price_rows = (
                SaleLine.objects.filter(
                    product_id__in=product_ids, sale__sale_date__gte=window_start,
                    price_uzs__gt=0,
                )
                .values('product_id')
                .annotate(avg_price=Avg('price_uzs'), qty=Sum('quantity'))
            )
            price_map = {r['product_id']: r for r in price_rows}

            result = []
            for i, e in enumerate(entries):
                p = e.product
                if not p:
                    continue
                cat_name = _root_category_name(p.category)
                if not cat_name:
                    continue  # faqat Кромка/Zapchast/List — boshqasi vitrinada chiqmaydi
                img = None
                main_img = next((im for im in p.images.all() if im.is_main), None) or next(iter(p.images.all()), None)
                if main_img:
                    try:
                        img = (main_img.thumbnail.url if main_img.thumbnail else main_img.image.url)
                    except Exception:
                        img = None
                if not img:
                    continue  # RASM MAJBURIY — rasmsiz/buzuq-rasmli mahsulot vitrinada ko'rsatilmaydi
                pr = price_map.get(p.id)
                sale_price = float(pr['avg_price']) if pr and pr['avg_price'] else (float(p.price) if p.price else 0)
                sold_qty = float(pr['qty']) if pr and pr['qty'] else float(e.sold_qty_30d or 0)
                total_stock = float(p.total_stock or 0)
                result.append({
                    'id': p.id,
                    'name': p.name,
                    'sale_price': round(sale_price),
                    'unit': p.unit or '',
                    'image': img,
                    'category': cat_name,
                    'in_stock': total_stock > 0,
                    'total_stock': total_stock,
                    'sold_qty_30d': sold_qty,
                    'top_seller': i < 10,
                })
            result.sort(key=lambda r: r['sold_qty_30d'], reverse=True)
            return result

        items = await _get()

        # Vitrina ochilib, mahsulotlar ko'rinishi bilanoq "3 tasini ko'r" hisoblanadi
        # (alohida bosish shart emas — oldin har kartaga bosishni talab qilardi,
        # aksariyat foydalanuvchi shunchaki ko'zdan kechirib chiqadi, bosmaydi).
        if items:
            @database_sync_to_async
            def _mark_viewed():
                from client_erp.services.gamification import check_quest_progress
                self.user.refresh_from_db()
                check_quest_progress(self.user, 'view_products', count=3)
            await _mark_viewed()

        return {'ok': True, 'data': {'items': items}}

    async def handle_catalog_view(self, data):
        """Vitrina mahsulotini ochish — "Katalogdan mahsulot ko'r" kunlik topshirig'i."""
        @database_sync_to_async
        def _do():
            from client_erp.services.gamification import check_quest_progress
            self.user.refresh_from_db()
            check_quest_progress(self.user, 'view_products')

        await _do()
        return {'ok': True, 'data': None}

    async def handle_page_portfolio(self, data):
        """Portfolio — mijozning o'z buyurtmalariga yuklangan rasmlari (namunalar
        galereyasi). "Katalogdan mahsulot ko'r" kunlik topshirig'i shu yerga bog'liq
        (client_erp'da mijozga mo'ljallangan alohida mahsulot katalogi yo'q —
        Product modeli fabrika ombori, mijozga ko'rsatilmaydi)."""
        @database_sync_to_async
        def _get():
            from client_erp.models import ClientOrder, ClientOrderFile
            order_ids = list(ClientOrder.objects.filter(
                owner=self.user, is_deleted=False,
            ).values_list('id', flat=True))
            files = ClientOrderFile.objects.filter(
                order_id__in=order_ids, file_type='image',
            ).select_related('order').order_by('-created_at')[:60]
            result = []
            for f in files:
                try:
                    url = f.file.url if f.file else None
                except Exception:
                    url = None
                try:
                    thumb = f.thumbnail.url if f.thumbnail else url
                except Exception:
                    thumb = url
                result.append({
                    'id': f.id,
                    'url': url,
                    'thumbnail': thumb,
                    'order_id': f.order_id,
                    'order_title': f.order.title if f.order else '',
                    'caption': f.caption or '',
                    'created_at': f.created_at.isoformat() if f.created_at else None,
                })
            return result

        items = await _get()
        return {'ok': True, 'data': {'items': items}}

    async def handle_portfolio_view(self, data):
        """Portfolio elementini ochish — "Katalogdan mahsulot ko'r" topshirig'i uchun hisoblanadi."""
        @database_sync_to_async
        def _do():
            from client_erp.services.gamification import check_quest_progress
            self.user.refresh_from_db()
            check_quest_progress(self.user, 'view_products')

        await _do()
        return {'ok': True, 'data': None}

    async def handle_viz_delete(self, data):
        """Mijoz o'zi (mini ERP orqali) yaratgan 360° galereyani o'chiradi.
        Ishlab chiqarish buyurtmasiga bog'liq (telefon-mos) galereyaga TEGINMAYDI."""
        gallery_uuid = data.get('gallery_uuid')

        @database_sync_to_async
        def _delete():
            from widget_panorama.models import PanoramaGallery
            try:
                g = PanoramaGallery.objects.get(uuid=gallery_uuid)
            except PanoramaGallery.DoesNotExist:
                return False, 'Galereya topilmadi'
            if g.erp_client_id != self.user.pk:
                return False, "Bu galereyani o'chirish huquqingiz yo'q"
            g.panoramas.all().delete()
            g.delete()
            return True, None

        ok, error = await _delete()
        if not ok:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': None}

    async def handle_viz_rename(self, data):
        """Mijoz o'zi yaratgan galereya nomini tahrirlaydi."""
        gallery_uuid = data.get('gallery_uuid')
        name = str(data.get('name') or '').strip()[:200]
        if not name:
            return {'ok': False, 'error': "Nom bo'sh bo'lmasin"}

        @database_sync_to_async
        def _rename():
            from widget_panorama.models import PanoramaGallery
            try:
                g = PanoramaGallery.objects.get(uuid=gallery_uuid)
            except PanoramaGallery.DoesNotExist:
                return False, 'Galereya topilmadi'
            if g.erp_client_id != self.user.pk:
                return False, "Bu galereyani tahrirlash huquqingiz yo'q"
            g.name = name
            g.save(update_fields=['name'])
            return True, None

        ok, error = await _rename()
        if not ok:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': {'name': name}}

    async def handle_note_create(self, data):
        order_id = data.get('order_id')
        text = (data.get('text') or '').strip()
        if not order_id or not text:
            return {'ok': False, 'error': 'Matn kerak'}

        @database_sync_to_async
        def _create():
            from client_erp.models import ClientOrder, ClientOrderNote
            from client_erp.serializers import serialize_note
            try:
                order = ClientOrder.objects.get(pk=order_id)
            except ClientOrder.DoesNotExist:
                return None, 'Buyurtma topilmadi'
            note = ClientOrderNote.objects.create(
                order=order, text=text, created_by=self.user,
            )
            return serialize_note(note), None

        result, error = await _create()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': {'note': result}}

    async def handle_note_update(self, data):
        note_id = data.get('note_id')
        text = (data.get('text') or '').strip()
        if not note_id or not text:
            return {'ok': False, 'error': 'Matn kerak'}

        @database_sync_to_async
        def _update():
            from client_erp.models import ClientOrderNote
            from client_erp.serializers import serialize_note
            try:
                note = ClientOrderNote.objects.get(pk=note_id)
            except ClientOrderNote.DoesNotExist:
                return None, 'Eslatma topilmadi'
            note.text = text
            note.save(update_fields=['text', 'updated_at'])
            return serialize_note(note), None

        result, error = await _update()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': {'note': result}}

    async def handle_note_delete(self, data):
        note_id = data.get('note_id')
        if not note_id:
            return {'ok': False, 'error': 'note_id kerak'}

        @database_sync_to_async
        def _delete():
            from client_erp.models import ClientOrderNote
            try:
                note = ClientOrderNote.objects.get(pk=note_id)
                note.delete()
                return True
            except ClientOrderNote.DoesNotExist:
                return False

        await _delete()
        return {'ok': True}

    async def handle_file_delete(self, data):
        file_id = data.get('file_id')
        if not file_id:
            return {'ok': False, 'error': 'file_id kerak'}

        @database_sync_to_async
        def _delete():
            from client_erp.models import ClientOrderFile
            try:
                f = ClientOrderFile.objects.get(pk=file_id)
                f.file.delete(save=False)
                if f.thumbnail:
                    f.thumbnail.delete(save=False)
                f.delete()
                return True
            except ClientOrderFile.DoesNotExist:
                return False

        await _delete()
        return {'ok': True}

    async def handle_page_oldi_berdi(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_oldi_berdi_page
            self.user.refresh_from_db()
            return serialize_oldi_berdi_page(self.user, data)

        return {'ok': True, 'data': await _get()}

    async def handle_user_set_language(self, data):
        """Interfeys tilini saqlash (i18n, 2026-08-07).

        Frontend `localStorage` da ham saqlaydi — bu yerdagi qiymat SERVER
        tomoni uchun (Telegram xabarlari, PDF, server matnlari). Xato bo'lsa
        ilova ishlayveradi: til baribir brauzerda qoldi."""
        lang = (data.get('language') or '').strip().lower()
        if lang not in ('uz', 'ru', 'en'):
            return {'ok': False, 'error': "Noto'g'ri til"}

        @database_sync_to_async
        def _save():
            db = self.db_alias
            type(self.user).objects.using(db).filter(pk=self.user.pk).update(language=lang)
            return True

        try:
            await _save()
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:120]}
        return {'ok': True, 'data': {'language': lang}}

    async def handle_finance_duplicates(self, data):
        """Ehtimoliy takror yozuvlar ro'yxati (2026-08-06). FAQAT O'QIYDI."""
        @database_sync_to_async
        def _load():
            from client_erp.serializers import serialize_duplicate_check
            return serialize_duplicate_check(self.user)

        try:
            return {'ok': True, 'data': await _load()}
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:150]}

    async def handle_finance_duplicate_resolve(self, data):
        """Foydalanuvchi qarori: takror yozuvni o'chirish YOKI «haqiqiy» deb belgilash.

        action='delete' → berilgan `record_id` yumshoq o'chiriladi (is_deleted=True),
                          guruhning qolgani `dup_reviewed=True` bo'ladi
        action='keep'   → guruhning HAMMASI `dup_reviewed=True` (qayta chiqmaydi)

        ⚠️ Yozuv BAZADAN o'chirilmaydi — `is_deleted` bayrog'i qo'yiladi,
        shuning uchun orqaga qaytarish mumkin. Har qaror auditga yoziladi.
        """
        action = (data.get('action') or '').strip()
        rid = data.get('record_id')
        ids = data.get('group_ids') or []
        if action not in ('delete', 'keep'):
            return {'ok': False, 'error': "Noto'g'ri amal"}

        @database_sync_to_async
        def _do():
            from django.db import transaction
            from client_erp.models import ClientFinanceRecord
            from client_erp.models.team import ClientProfitAudit
            db = self.db_alias
            # ⚠️ FAQAT O'Z yozuvlari — boshqa odamnikiga tegib bo'lmaydi
            qs = ClientFinanceRecord.objects.filter(owner=self.user, pk__in=ids)
            found = list(qs)
            if not found:
                return {'ok': False, 'error': 'Yozuv topilmadi'}
            with transaction.atomic(using=db):
                if action == 'delete':
                    tgt = next((r for r in found if r.pk == rid), None)
                    if tgt is None:
                        return {'ok': False, 'error': "O'chiriladigan yozuv topilmadi"}
                    tgt.is_deleted = True
                    tgt.dup_reviewed = True
                    tgt.save(using=db, update_fields=['is_deleted', 'dup_reviewed'])
                    # Sherikli rasxod bo'lsa — ulushlar va avtomatik qarzlar
                    # ham olib tashlanadi (2026-08-15 §F3): aks holda
                    # o'chirilgan rasxod uchun qarz osilib qolardi.
                    try:
                        from client_erp.services.expense_split import unsplit_expense
                        unsplit_expense(tgt)
                    except Exception:
                        pass
                    ClientProfitAudit.objects.using(db).create(
                        order_id=tgt.order_id, share_id=None, action='delete',
                        actor=self.user, target_name=(tgt.description or '')[:200],
                        old_value=f'{tgt.record_type} {tgt.amount}',
                        new_value='o\'chirildi (dublikat)',
                        reason='Foydalanuvchi takror yozuv deb belgiladi (2026-08-06 tekshiruvi)')
                    for r in found:
                        if r.pk != rid and not r.dup_reviewed:
                            r.dup_reviewed = True
                            r.save(using=db, update_fields=['dup_reviewed'])
                    return {'ok': True, 'deleted': tgt.pk}
                # keep — hammasi haqiqiy
                for r in found:
                    r.dup_reviewed = True
                    r.save(using=db, update_fields=['dup_reviewed'])
                ClientProfitAudit.objects.using(db).create(
                    order_id=found[0].order_id, share_id=None, action='update',
                    actor=self.user, target_name='dublikat tekshiruvi',
                    old_value=f'{len(found)} ta shubhali yozuv',
                    new_value='haqiqiy deb belgilandi',
                    reason='Foydalanuvchi «dublikat emas» dedi (2026-08-06 tekshiruvi)')
                return {'ok': True, 'kept': len(found)}

        try:
            res = await _do()
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:150]}
        if not res.get('ok'):
            return res
        return {'ok': True, 'data': res}

    async def handle_profit_proof(self, data):
        """«Hisob qanday chiqdi?» — foyda zanjirining to'liq isboti (2026-08-06).

        FAQAT O'QIYDI. Ruxsat serializer ichida tekshiriladi.
        """
        @database_sync_to_async
        def _load():
            from client_erp.serializers import serialize_profit_proof
            return serialize_profit_proof(self.user, data.get('order_id'))

        try:
            res = await _load()
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:150]}
        if not res.get('ok'):
            return {'ok': False, 'error': res.get('error') or 'Topilmadi'}
        return {'ok': True, 'data': res}

    async def handle_oldi_berdi_detail(self, data):
        """Bitta sotuv tafsiloti — «nega qarz bo'lgan» (2026-08-06).

        FAQAT O'QIYDI. Mijoz bo'yicha cheklangan (serializer ichida).
        """
        sale_id = data.get('sale_id')

        @database_sync_to_async
        def _load():
            from client_erp.serializers import serialize_oldi_berdi_sale_detail
            return serialize_oldi_berdi_sale_detail(self.user, sale_id)

        try:
            res = await _load()
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:150]}
        if not res.get('ok'):
            return {'ok': False, 'error': res.get('error') or 'Topilmadi'}
        return {'ok': True, 'data': res}

    async def handle_oldi_berdi_load_more(self, data):
        section = data.get('section', '')
        offset = data.get('offset', 0)
        limit = data.get('limit', 20)
        period = data.get('period') or 'all'

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_oldi_berdi_section
            self.user.refresh_from_db()
            return serialize_oldi_berdi_section(self.user, section, offset, limit, period)

        return {'ok': True, 'data': await _get()}

    async def handle_mc_order_detail(self, data):
        code = (data.get('code') or '').strip().upper()
        if not code:
            return {'ok': False, 'error': 'Kod kerak'}

        @database_sync_to_async
        def _get():
            import re
            from manfacturing.models import Order, OrderStep, OrderStateHistory

            order_id = self._mc_decode_code(code)
            if not order_id:
                return None, 'Buyurtma topilmadi'

            try:
                order = Order.objects.select_related('client', 'create_user').get(pk=order_id)
            except Order.DoesNotExist:
                return None, 'Buyurtma topilmadi'

            phone = self.user.phone
            if not phone:
                return None, 'Ruxsat yo\'q'
            digits = re.sub(r'\D', '', phone)
            if digits.startswith('998') and len(digits) > 9:
                digits = digits[3:]
            client_phone = re.sub(r'\D', '', order.client.phone or '') if order.client else ''
            if not client_phone.endswith(digits):
                return None, 'Ruxsat yo\'q'

            steps = OrderStep.objects.filter(order=order).select_related(
                'step_type', 'assigned_user', 'completed_by',
            ).order_by('sequence', 'pk')
            total_steps = steps.count()
            done_steps = steps.filter(state='done').count()
            progress = int(done_steps * 100 / total_steps) if total_steps else 0

            steps_data = []
            for s in steps:
                worker = None
                if s.state == 'done' and s.completed_by:
                    worker = f"{s.completed_by.first_name} {s.completed_by.last_name}".strip() or s.completed_by.username
                elif s.assigned_user:
                    worker = f"{s.assigned_user.first_name} {s.assigned_user.last_name}".strip() or s.assigned_user.username
                steps_data.append({
                    'title': s.step_type.name if s.step_type else '—',
                    'state': s.state,
                    'worker': worker,
                    'start_date': s.start_date.isoformat() if s.start_date else None,
                    'end_date': s.end_date.isoformat() if s.end_date else None,
                })

            history = OrderStateHistory.objects.filter(order=order).select_related('changed_by').order_by('-changed_at')[:30]
            history_data = []
            for h in history:
                by_name = ''
                if h.changed_by:
                    by_name = f"{h.changed_by.first_name} {h.changed_by.last_name}".strip() or h.changed_by.username
                history_data.append({
                    'date': h.changed_at.isoformat(),
                    'field': h.field_name,
                    'old_value': h.old_value,
                    'new_value': h.new_value,
                    'by': by_name,
                    'note': h.note or '',
                })

            delivery_labels = dict(Order.DELIVERY_STATE_CHOICES)
            state_labels = dict(Order.state_choices)
            owner_name = ''
            if order.create_user:
                owner_name = f"{order.create_user.first_name} {order.create_user.last_name}".strip() or order.create_user.username

            return {
                'secure_code': code,
                'code': order.order_token or '',
                'partner_name': order.client.name if order.client else '',
                'owner_name': owner_name,
                'state': order.state,
                'state_label': state_labels.get(order.state, order.state),
                'delivery_state': order.delivery_state,
                'delivery_label': delivery_labels.get(order.delivery_state, order.delivery_state),
                'deadline': order.deadline_at.isoformat() if order.deadline_at else None,
                'is_urgent': order.is_urgent,
                'is_overdue': order.is_overdue,
                'created_at': order.order_date.isoformat() if order.order_date else None,
                'finished_at': order.order_finsh_date.isoformat() if order.order_finsh_date else None,
                'progress': progress,
                'steps': steps_data,
                'history': history_data,
            }, None

        result, error = await _get()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': result}

    async def handle_page_settings(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.serializers import serialize_user
            self.user.refresh_from_db()
            return serialize_user(self.user)

        return {'ok': True, 'data': await _get()}

    async def handle_settings_expense_cat_add(self, data):
        """Yangi chiqim kategoriyasi qo'shish (foydalanuvchi sozlamasi)."""
        name = (data.get('name') or '').strip()
        icon = (data.get('icon') or '📦').strip()[:4] or '📦'
        color = (data.get('color') or '#C3C9D4').strip()[:9]
        if not name:
            return {'ok': False, 'error': 'Nom kiriting'}

        @database_sync_to_async
        def _add():
            import re
            from client_erp.serializers import expense_categories_for, _BUILTIN_KEYS
            cats = list(self.user.expense_categories or [])
            base = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:14] or 'cat'
            key = 'c-' + base
            existing = {c.get('key') for c in cats if isinstance(c, dict)}
            i = 1
            while key in existing or key in _BUILTIN_KEYS:
                i += 1
                key = ('c-' + base + '-' + str(i))[:20]
            cats.append({'key': key, 'name': name[:40], 'icon': icon, 'color': color})
            self.user.expense_categories = cats
            self.user.save(update_fields=['expense_categories'])
            return expense_categories_for(self.user)

        return {'ok': True, 'data': {'categories': await _add()}}

    async def handle_settings_expense_cat_delete(self, data):
        """Foydalanuvchi qo'shgan chiqim kategoriyasini o'chirish (built-in emas)."""
        key = data.get('key')

        @database_sync_to_async
        def _del():
            from client_erp.serializers import expense_categories_for
            cats = [c for c in (self.user.expense_categories or [])
                    if isinstance(c, dict) and c.get('key') != key]
            self.user.expense_categories = cats
            self.user.save(update_fields=['expense_categories'])
            return expense_categories_for(self.user)

        return {'ok': True, 'data': {'categories': await _del()}}

    # ═══════════════════════════════════════════════════════════
    #  CLIENT CRUD
    # ═══════════════════════════════════════════════════════════

    async def handle_client_create(self, data):
        name = (data.get('name') or '').strip()
        phone = (data.get('phone') or '').strip()
        address = (data.get('address') or '').strip()
        if not name:
            return {'ok': False, 'error': 'Ism kiritilmagan'}

        @database_sync_to_async
        def _create():
            from client_erp.services import limits
            ok, info = limits.guard(self.user, 'customers')
            if not ok:
                return {'__limit__': info}
            from client_erp.models import ClientCustomer
            from client_erp.serializers import serialize_customer
            c = ClientCustomer.objects.create(
                owner=self.user, full_name=name, phone=phone, address=address,
            )
            return serialize_customer(c)

        customer = await _create()
        if isinstance(customer, dict) and customer.get('__limit__'):
            info = customer['__limit__']
            return {'ok': False, 'error': info['message'], 'upgrade': True, 'limit': info['key']}
        await self._award_xp('add_customer')
        return {'ok': True, 'data': customer}

    async def handle_client_delete(self, data):
        client_id = data.get('id')

        @database_sync_to_async
        def _delete():
            from client_erp.models import ClientCustomer
            try:
                c = ClientCustomer.objects.get(pk=client_id, owner=self.user)
                c.delete()
                return True
            except ClientCustomer.DoesNotExist:
                return False

        if not await _delete():
            return {'ok': False, 'error': 'Mijoz topilmadi'}
        return {'ok': True, 'data': None}

    async def handle_client_update(self, data):
        """Mijoz ism/telefonini tahrirlash (faqat egasi)."""
        client_id = data.get('id')
        name = (data.get('name') or '').strip()
        phone = (data.get('phone') or '').strip()
        if not name:
            return {'ok': False, 'error': 'Ism kiritilmagan'}

        @database_sync_to_async
        def _update():
            from client_erp.models import ClientCustomer
            from client_erp.serializers import serialize_customer
            try:
                c = ClientCustomer.objects.get(pk=client_id, owner=self.user)
            except ClientCustomer.DoesNotExist:
                return None
            c.full_name = name
            c.phone = phone
            c.save(update_fields=['full_name', 'phone'])
            return serialize_customer(c)

        customer = await _update()
        if customer is None:
            return {'ok': False, 'error': 'Mijoz topilmadi'}
        return {'ok': True, 'data': customer}

    # ═══════════════════════════════════════════════════════════
    #  ORDER CRUD
    # ═══════════════════════════════════════════════════════════

    async def handle_order_create(self, data):
        title = (data.get('title') or '').strip()
        customer_id = data.get('customer_id')
        template_id = data.get('template_id')
        if not title:
            return {'ok': False, 'error': 'Sarlavha kiritilmagan'}

        @database_sync_to_async
        def _create():
            from client_erp.services import limits
            # Ikki limit: oyiga yaratilgan buyurtmalar + faol buyurtmalar soni.
            for _lk in ('orders_month', 'active_orders'):
                ok, info = limits.guard(self.user, _lk)
                if not ok:
                    return {'__limit__': info}
            from client_erp.models import ClientOrder, ClientOrderStageTemplate
            from client_erp.serializers import serialize_order_brief
            from client_erp.views.stages import _apply_template

            # ── ETAP SHABLONI MAJBURIY (2026-08-03, FINANCE_V2) ──────────────
            # Barcha keyingi hisobotlar (bajarilgan bosqichlar, muddat nazorati,
            # bosqich-bo'yicha xarajat) etaplarga tayanadi. Shablonsiz zakazda
            # etap umuman bo'lmaydi va u hisobotlardan tushib qoladi.
            from client_erp.services.scope import finance_v2 as _fin_v2
            if _fin_v2(self.user) and not template_id:
                return {'__err__': (
                    "Etap shablonini tanlang — buyurtma bosqichlarisiz "
                    "hisobotlar to'liq bo'lmaydi."
                )}

            # ── SHARTNOMA SUMMASI (2026-08-15, TZ-Zakaz-Ochishda-Foiz…) ──────
            # UI da MAJBURIY. Backend'da esa yumshoq: `order.create` ni boshqa
            # yo'llar ham chaqiradi (Telegram bot, zamer, klon) — ular summasiz
            # kelsa buyurtma baribir ochiladi, aks holda eski oqim buzilardi
            # (feedback_integration-no-collateral-damage).
            from decimal import Decimal, InvalidOperation
            try:
                _zak = Decimal(str(data.get('zaklad_amount') or 0))
            except (InvalidOperation, TypeError):
                _zak = Decimal('0')
            if _zak < 0:
                _zak = Decimal('0')

            order = ClientOrder.objects.create(
                owner=self.user,
                title=title,
                customer_id=customer_id if customer_id else None,
                zaklad_amount=_zak,
                description=(data.get('description') or '').strip(),
            )
            if template_id:
                try:
                    tmpl = ClientOrderStageTemplate.objects.get(pk=template_id)
                    _apply_template(order, tmpl)
                    order.use_stages = True
                    order.save(update_fields=['use_stages'])
                except ClientOrderStageTemplate.DoesNotExist:
                    pass
            from client_erp.services.notifications import notify_order_created
            notify_order_created(self.user, order.title)
            # "Har doim" doimiy a'zolarga avto-ulashish + bildirishnoma (fail-safe)
            from client_erp.services.standing_share import apply_standing_shares
            apply_standing_shares(order)
            return serialize_order_brief(order)

        order_data = await _create()
        if isinstance(order_data, dict) and order_data.get('__limit__'):
            info = order_data['__limit__']
            return {'ok': False, 'error': info['message'], 'upgrade': True, 'limit': info['key']}
        if isinstance(order_data, dict) and order_data.get('__err__'):
            return {'ok': False, 'error': order_data['__err__']}
        await self._award_xp('create_order')
        return {'ok': True, 'data': order_data}

    async def handle_order_update(self, data):
        order_id = data.get('id')
        fields = data.get('fields', {})
        status_note = (data.get('status_note') or '').strip()

        @database_sync_to_async
        def _update():
            from client_erp.models import ClientOrder
            from client_erp.models.order import ClientOrderTimeline
            from client_erp.serializers import serialize_order_brief
            try:
                order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            except ClientOrder.DoesNotExist:
                return None, 'Buyurtma topilmadi'
            old_status = order.status
            new_status = fields.get('status')
            if new_status == 'waiting' and old_status != 'waiting' and not status_note:
                return None, "Kutilmoqda sababini yozing"

            # ── SHARTNOMA MAJBURIY (2026-08-03, FINANCE_V2) ──────────────────
            # «Topshirildi» — foyda tan olinadigan lahza (completed-contract
            # usuli). Shartnoma summasi bo'lmasa foydani hisoblab bo'lmaydi:
            # `contract_profit` grandfathering bo'yicha eski formulaga tushib
            # ketardi va hisobot aralashib qolardi. Shuning uchun bloklaymiz.
            # ⚠️ `fields`da yangi zaklad ham kelayotgan bo'lishi mumkin (bir
            # so'rovda) — shuni ham hisobga olamiz.
            from client_erp.services.scope import finance_v2 as _fin_v2
            if new_status == 'delivered' and old_status != 'delivered' and _fin_v2(self.user):
                _z = fields.get('zaklad_amount', order.zaklad_amount)
                try:
                    _z = float(_z or 0)
                except (TypeError, ValueError):
                    _z = 0
                _has_contract = _z > 0 or float(order.contract_amount or 0) > 0
                if not _has_contract:
                    return None, (
                        "Avval shartnoma summasini kiriting — "
                        "Moliya tabi → «Shartnoma» tugmasi. "
                        "Foyda shartnoma summasidan hisoblanadi."
                    )

            allowed = ['title', 'status', 'description', 'zaklad_amount']
            update_fields = []
            for f in allowed:
                if f in fields:
                    setattr(order, f, fields[f])
                    update_fields.append(f)
            # Topshirish sanasi: 'deadline' → model maydoni deadline_at (+ validatsiya).
            if 'deadline' in fields:
                from django.utils.dateparse import parse_date, parse_datetime
                from datetime import timedelta
                from django.utils import timezone
                raw = fields.get('deadline')
                if raw:
                    dv = parse_date(raw)
                    if not dv:
                        _pdt = parse_datetime(raw)
                        dv = _pdt.date() if _pdt else None
                    if not dv:
                        return None, "Sana formati noto'g'ri"
                    _today = timezone.localdate()
                    if dv < _today:
                        return None, "O'tgan sanani belgilab bo'lmaydi"
                    if dv > _today + timedelta(days=300):
                        return None, "300 kundan ortiq sana belgilab bo'lmaydi"
                    order.deadline = dv
                else:
                    order.deadline = None
                update_fields.append('deadline')
            # Topshirilgan sana — foyda AYNAN shu oyga tan olinadi (oylik moliya modeli).
            # 'delivered' bo'lganda avto-to'ladi; boshqa statusga qaytsa tozalanadi.
            if 'status' in fields and new_status != old_status:
                from django.utils import timezone as _tz
                if new_status == 'delivered' and not order.delivered_at:
                    order.delivered_at = _tz.now()
                    update_fields.append('delivered_at')
                elif old_status == 'delivered' and new_status != 'delivered' and order.delivered_at:
                    order.delivered_at = None
                    update_fields.append('delivered_at')
                # Tayyor bo'lgan sana — 'ready' bo'lganda avto-to'ladi (2026-09-04,
                # xuddi delivered_at naqshi). Kirim/Chiqim/Foyda 'ready' buyurtmada
                # delivered_at hali yo'q bo'lsa shu sanaga tan olinadi.
                if new_status == 'ready' and not order.ready_at:
                    order.ready_at = _tz.now()
                    update_fields.append('ready_at')
                elif old_status == 'ready' and new_status != 'ready' and new_status != 'delivered' and order.ready_at:
                    order.ready_at = None
                    update_fields.append('ready_at')
            if update_fields:
                order.save(update_fields=update_fields)

            if 'status' in fields and new_status != old_status:
                labels = dict(ClientOrder.STATUS_CHOICES)
                old_label = labels.get(old_status, old_status)
                new_label = labels.get(new_status, new_status)
                note = f"Status: {old_label} → {new_label}"
                if status_note:
                    note += f" — {status_note}"
                ClientOrderTimeline.objects.create(
                    order=order, action='status_change', note=note,
                )
            return serialize_order_brief(order), None

        try:
            result, error = await _update()
        except Exception:
            # Haqiqiy sabab (masalan Postgres "too many clients") yashirinmasin —
            # log qilamiz, foydalanuvchiga esa aniq xabar (topilmadi EMAS).
            logger.exception("handle_order_update failed")
            return {'ok': False, 'error': "Server band — biroz kutib, qayta urinib ko'ring"}

        if error:
            return {'ok': False, 'error': error}

        await self._broadcast_order(order_id, 'order.updated', result)
        return {'ok': True, 'data': result}

    async def handle_order_customer_share(self, data):
        """Buyurtmani MIJOZGA ochiq ulashish — public UUID sahifasi (eslatmasiz).
        Yoqadi (UUID beradi) yoki qaytaradi mavjud UUID'ni. Faqat egasi/menejer."""
        @database_sync_to_async
        def _share():
            import uuid as _uuid
            from client_erp.models import ClientOrder, ClientOrderPermission
            order = ClientOrder.objects.filter(pk=data.get('order_id')).first()
            if not order:
                return None, 'Buyurtma topilmadi'
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(order=order, user=self.user, role='manager').first()
                if not perm:
                    return None, "Ruxsat yo'q"
            if not order.share_uuid:
                order.share_uuid = _uuid.uuid4()
                order.save(update_fields=['share_uuid'])
            return {'uuid': str(order.share_uuid)}, None
        res, err = await _share()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'data': res}

    async def handle_order_customer_unshare(self, data):
        """Mijoz ulashishini bekor qilish (UUID o'chiriladi → havola ishlamaydi)."""
        @database_sync_to_async
        def _un():
            from client_erp.models import ClientOrder
            order = ClientOrder.objects.filter(pk=data.get('order_id'), owner=self.user).first()
            if not order:
                return 'Buyurtma topilmadi'
            order.share_uuid = None
            order.save(update_fields=['share_uuid'])
            return None
        err = await _un()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_order_delete(self, data):
        order_id = data.get('id')
        note = (data.get('note') or '').strip()
        if not order_id:
            return {'ok': False, 'error': 'id kerak'}
        if not note:
            return {'ok': False, 'error': "O'chirish sababini yozish majburiy"}

        @database_sync_to_async
        def _delete():
            from django.utils import timezone
            from client_erp.models import ClientOrder
            try:
                order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            except ClientOrder.DoesNotExist:
                return 'Buyurtma topilmadi'
            order.is_deleted = True
            order.deleted_at = timezone.now()
            order.delete_note = note
            order.save(update_fields=['is_deleted', 'deleted_at', 'delete_note'])
            return None

        error = await _delete()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': {'id': order_id}}

    async def handle_order_restore(self, data):
        order_id = data.get('id')
        if not order_id:
            return {'ok': False, 'error': 'id kerak'}

        @database_sync_to_async
        def _restore():
            from client_erp.models import ClientOrder
            from client_erp.serializers import serialize_order_brief
            try:
                order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            except ClientOrder.DoesNotExist:
                return None, 'Buyurtma topilmadi'
            order.is_deleted = False
            order.deleted_at = None
            order.save(update_fields=['is_deleted', 'deleted_at'])
            return serialize_order_brief(order), None

        result, error = await _restore()
        if error:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': result}

    async def handle_orders_deleted(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            from client_erp.models import ClientOrder
            from client_erp.serializers import serialize_order_brief
            orders = ClientOrder.objects.filter(
                owner=self.user, is_deleted=True,
            ).select_related('customer').order_by('-deleted_at', '-created_at')
            result = []
            for o in orders:
                b = serialize_order_brief(o)
                b['deleted_at'] = o.deleted_at.isoformat() if o.deleted_at else None
                b['delete_note'] = o.delete_note or ''
                result.append(b)
            return result

        return {'ok': True, 'data': {'orders': await _get()}}

    async def handle_order_income(self, data):
        order_id = data.get('order_id')
        amount = data.get('amount', 0)
        description = data.get('description', '')
        payment_method = data.get('payment_method', 'cash')
        customer_id = data.get('customer_id')

        if not amount or float(amount) <= 0:
            return {'ok': False, 'error': 'Summa noto\'g\'ri'}

        @database_sync_to_async
        def _create():
            from client_erp.models import ClientOrder, ClientFinanceRecord, ClientOrderTimeline
            from client_erp.serializers import serialize_transaction
            from django.utils import timezone

            order = ClientOrder.objects.get(pk=order_id)
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                from client_erp.models import ClientOrderPermission
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user, role='manager',
                ).first()
                if not perm:
                    return None, 'Ruxsat yo\'q'

            # ── SHARTNOMA MAJBURIY — KIRIMDAN OLDIN (2026-08-04) ─────────────
            # Foydalanuvchi qarori: shartnoma summasi kiritilmaguncha pul
            # umumiy moliyaga QO'SHILMASIN. Sabab: foyda shartnoma summasidan
            # hisoblanadi; shartnomasiz kelgan pul hisobotni chalkashtiradi
            # (kirim bor, lekin nimaga nisbatan foyda hisoblashini bilmaymiz).
            # Frontend bu xatoni ushlab, shartnoma oynasini o'zi ochadi.
            from client_erp.services.scope import contract_required as _need_contract
            if _need_contract(order.owner) and float(order.contract_amount or 0) <= 0:
                return None, '__NEED_CONTRACT__'

            # ── SHARTNOMA LIMITI (2026-08-04) + QO'SHIMCHA ISH (2026-08-08) ──
            # Ilgari limitdan oshgan kirim QAT'IY rad etilardi. Amalda esa
            # mijoz ko'pincha qo'shimcha ish uchun qo'shimcha pul beradi va
            # usta uni HECH QAYERGA yoza olmasdi (189 buyurtmadan 62 tasi
            # limitga to'lgan edi — 2026-08-08 tekshiruvi).
            #
            # Endi rad etmaymiz — SO'RAYMIZ. Foydalanuvchi `allow_extra=True`
            # yuborsa pul o'tadi va `ClientOrder.extra_income` uni AVTOMATIK
            # «Qo'shimcha daromad» deb ajratadi (real_income − contract_amount).
            # ⚠️ FOYDA O'ZGARMAYDI — u faqat shartnoma summasidan hisoblanadi.
            zaklad = float(order.zaklad_amount or 0)
            if zaklad > 0 and not data.get('allow_extra'):
                # ⚠️ 2026-08-24: QAYTARISH yozuvlari hisobga OLINMAYDI.
                # «Chiqim qaytarish» `record_type='income'` bo'lib
                # saqlanadi — ilgari u ham kirim deb sanalib, limit
                # noto'g'ri ishga tushardi (#278: mijoz 2 mln bergan,
                # tizim 5.7 mln deb hisoblardi).
                # `order.total_income` allaqachon shu mantiqni bajaradi.
                existing = float(order.total_income or 0)
                if float(existing) + float(amount) > zaklad:
                    qolgan = max(0, zaklad - float(existing))
                    return None, {
                        '__over_contract__': True,
                        'contract': zaklad,
                        'already': float(existing),
                        'remaining': qolgan,
                        'amount': float(amount),
                        'extra': float(existing) + float(amount) - zaklad,
                    }

            record = ClientFinanceRecord.objects.create(
                owner=order.owner,
                order=order,
                customer_id=customer_id or order.customer_id,
                record_type='income',
                amount=amount,
                description=description,
                payment_method=payment_method,
                date=timezone.localdate(),
            )
            ClientOrderTimeline.objects.create(
                order=order, action='income',
                note=f"Kirim: {int(float(amount)):,} so'm",
            )
            # Avto-status: kirim tushsa «Yangi» → «Jarayonda»
            if order.status == 'new':
                order.status = 'in_progress'
                order.save(update_fields=['status'])
            return serialize_transaction(record), None

        result, error = await _create()
        if error:
            # Limitdan oshgan kirim — bloklamaymiz, tuzilgan javob qaytaramiz;
            # frontend savol beradi, foydalanuvchi `allow_extra` bilan qayta yuboradi.
            if isinstance(error, dict) and error.get('__over_contract__'):
                return {'ok': False, 'over_contract': error,
                        'error': 'Shartnoma summasi to\'lib bo\'lgan'}
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'order.income', result)
        await self._award_xp('add_income')
        return {'ok': True, 'data': result}

    async def handle_order_expense(self, data):
        order_id = data.get('order_id')
        amount = data.get('amount', 0)
        description = data.get('description', '')
        payment_method = data.get('payment_method', 'cash')
        stage_id = data.get('stage_id')
        category = data.get('category', 'other')

        if not amount or float(amount) <= 0:
            return {'ok': False, 'error': 'Summa noto\'g\'ri'}

        @database_sync_to_async
        def _create():
            from client_erp.models import (
                ClientOrder, ClientFinanceRecord, ClientOrderTimeline,
                ClientOrderPermission, ClientOrderStage,
            )
            from client_erp.serializers import serialize_transaction
            from django.utils import timezone

            order = ClientOrder.objects.get(pk=order_id)
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user,
                ).first()
                if not perm or not perm.can_add_expense:
                    return None, 'Chiqim qo\'shish ruxsati yo\'q'

            # ── KIM TO'LADI (2026-08-15, TZ-Zakaz-Ochishda-Foiz… §F3) ────────
            # Standart — buyurtma egasi (eski xatti-harakat, o'zgarmagan).
            # `payer_id` berilsa: u buyurtma egasi YOKI foyda ulushidagi
            # sheriklardan biri bo'lishi shart (begona odam kassasiga chiqim
            # yozib bo'lmaydi).
            from client_erp.models.team import ClientOrderProfitShare
            payer = order.owner
            _pid = data.get('payer_id')
            if _pid and int(_pid) != order.owner_id:
                _allowed = set(ClientOrderProfitShare.objects
                               .filter(order=order, user_id__isnull=False)
                               .values_list('user_id', flat=True))
                if int(_pid) not in _allowed:
                    return None, "To'lovchi bu buyurtma sheriklari orasida yo'q"
                from client_erp.models import ClientUser
                payer = ClientUser.objects.filter(pk=int(_pid)).first() or order.owner

            record = ClientFinanceRecord.objects.create(
                owner=payer,
                order=order,
                record_type='expense',
                amount=amount,
                description=description,
                payment_method=payment_method,
                category=category,
                stage_id=stage_id if stage_id else None,
                date=timezone.localdate(),
            )

            # ── RASXOD ULUSHI — AVTOMATIK QARZ BEKOR QILINDI (2026-08-28) ──
            # Ilgari (2026-08-15 §F3) sherikli buyurtmada chiqim sheriklar
            # foyda-foiziga bo'linib, to'lamagan har biriga avtomatik "qarz"
            # (ClientSupplierDebt) yozilardi. Foydalanuvchi: bu noto'g'ri —
            # "Big One bitta, kassa bitta", pul bitta umumiy manbadan chiqadi,
            # sheriklar orasida qarz hisob-kitobi kerak emas (hatto buyurtma
            # EGASINING o'ziga ham qarz yozilib qolgan holat topilgan edi).
            # `split_expense`/`ClientOrderExpenseShare` chaqirilmaydi endi —
            # chiqim faqat oddiy ClientFinanceRecord sifatida yoziladi.

            stage_name = ''
            if stage_id:
                try:
                    stage_name = ClientOrderStage.objects.get(pk=stage_id).title
                except ClientOrderStage.DoesNotExist:
                    pass

            ClientOrderTimeline.objects.create(
                order=order, action='expense',
                note=f"Chiqim: {int(float(amount)):,} so'm" + (f" ({stage_name})" if stage_name else ''),
            )
            return serialize_transaction(record), None

        result, error = await _create()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'order.expense', result)
        return {'ok': True, 'data': result}

    # Kirim/Chiqim qaytarish — FAQAT bigone_cl2 (BigOne Export). Order egasi ham,
    # boshqa hech kim ham qaytara olmaydi. Yozilgan summa aynan shu summada
    # TESKARI yozuv sifatida qo'shiladi (kirim qaytarilsa chiqim, chiqim qaytarilsa
    # kirim) — mavjud total_income/total_expense jamlash joyi O'ZGARMAYDI, chunki
    # ular allaqachon oddiy record_type='income'/'expense' yig'indisi.
    FINANCE_REVERT_ALLOWED_USERNAME = 'bigone_cl2'

    async def handle_finance_revert(self, data):
        if (self.user.username or '') != self.FINANCE_REVERT_ALLOWED_USERNAME:
            return {'ok': False, 'error': 'Ruxsat yo\'q'}

        order_id = data.get('order_id')
        revert_type = data.get('type')
        try:
            amount = float(data.get('amount', 0))
        except (TypeError, ValueError):
            amount = 0
        if revert_type not in ('income', 'expense'):
            return {'ok': False, 'error': 'Noto\'g\'ri tur'}
        if amount <= 0:
            return {'ok': False, 'error': 'Summa noto\'g\'ri'}

        @database_sync_to_async
        def _revert():
            from client_erp.models import ClientOrder, ClientFinanceRecord, ClientOrderTimeline
            from client_erp.serializers import serialize_transaction
            from django.utils import timezone

            order = ClientOrder.objects.filter(pk=order_id).first()
            if not order:
                return None, 'Topilmadi'

            if revert_type == 'income':
                new_type, category, label = 'expense', 'income_return', 'Kirim'
            else:
                new_type, category, label = 'income', 'expense_return', 'Chiqim'

            # ── QAYSI YOZUV QAYTARILDI (2026-08-15) ──────────────────────────
            # Ilgari faqat summa yozilardi va «qaysi chiqim qaytarilgan?»
            # degan savolga javob yo'q edi. Endi UI ro'yxatdan aniq yozuvni
            # tanlaydi, izohga `#<id>` yoziladi va qaytarilganlar UI'da
            # ✅ bilan belgilanadi (bir yozuv ikki marta qaytarilmasin).
            src_id = data.get('record_id')
            src_note = ''
            if src_id:
                src = ClientFinanceRecord.objects.filter(
                    pk=src_id, order=order, record_type=revert_type, is_deleted=False).first()
                if not src:
                    return None, 'Qaytariladigan yozuv topilmadi'
                from django.db.models import Sum as _Sum
                _already = (ClientFinanceRecord.objects.filter(
                    order=order, category=category, is_deleted=False,
                    description__contains=f"#{src_id}")
                    .aggregate(s=_Sum('amount'))['s'] or 0)
                if float(_already) + float(amount) > float(src.amount) + 0.01:
                    _left = float(src.amount) - float(_already)
                    return None, (f"Bu yozuvdan faqat {int(_left):,} so'm qaytarish mumkin"
                                  .replace(',', ' '))
                src_note = f" #{src_id} {(src.description or '')[:60]}"

            record = ClientFinanceRecord.objects.create(
                owner=order.owner, order=order, customer=order.customer,
                record_type=new_type, category=category,
                amount=amount, description=f"↩ {label} qaytarish{src_note}",
                date=timezone.localdate(),
                # ⚠️ 2026-08-24: BAYROQ QO'YILADI. Ilgari qo'yilmasdi va
                # qaytarish oddiy kirim/chiqim kabi sanalardi — zakaz
                # kartasida kirim shishib ketardi (#278: 2 mln o'rniga
                # 5.7 mln). `record_type` o'zgarmaydi — kassa tegilmaydi.
                # TZ: TZ-Qaytarish-va-Shartnoma-Chegarasi.md
                is_reversal=True,
            )
            ClientOrderTimeline.objects.create(
                order=order, action='finance_revert',
                note=f"↩ {label} qaytarildi: {int(amount):,} so'm{src_note}",
            )
            return serialize_transaction(record), None

        result, error = await _revert()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'order.updated', result)
        return {'ok': True, 'data': result}

    async def handle_order_send_mc(self, data):
        order_id = data.get('id')

        @database_sync_to_async
        def _send():
            from client_erp.models import ClientOrder
            order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            return {'mc_order_id': order.mebelcity_order_id or None}

        try:
            result = await _send()
        except Exception as e:
            return {'ok': False, 'error': str(e)}
        return {'ok': True, 'data': result}

    # ═══════════════════════════════════════════════════════════
    #  STAGE CRUD
    # ═══════════════════════════════════════════════════════════

    async def handle_stage_create(self, data):
        order_id = data.get('order_id')
        title = (data.get('title') or '').strip()
        icon = data.get('icon', '📋')
        color = data.get('color', '#6366f1')
        note = data.get('note', '')
        estimated_cost = data.get('estimated_cost', 0)
        is_mebelcity = data.get('is_mebelcity', False)
        mebelcity_order_id = data.get('mebelcity_order_id') or None
        checklist = data.get('checklist', [])

        if not title:
            return {'ok': False, 'error': 'Nom kiritilmagan'}

        @database_sync_to_async
        def _create():
            from client_erp.models import (
                ClientOrder, ClientOrderStage, ClientOrderStageItem,
                ClientOrderPermission,
            )
            from client_erp.serializers import serialize_stage

            order = ClientOrder.objects.get(pk=order_id)
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user, role='manager',
                ).first()
                if not perm:
                    return None, None, 'Ruxsat yo\'q'

            max_sort = order.stages.aggregate(m=models.Max('sort_order'))['m'] or 0
            stage = ClientOrderStage.objects.create(
                order=order, title=title, icon=icon, color=color,
                note=note, estimated_cost=estimated_cost or 0,
                is_mebelcity=is_mebelcity,
                mebelcity_order_id=mebelcity_order_id if is_mebelcity else None,
                sort_order=max_sort + 1,
            )
            for idx, item_title in enumerate(checklist):
                if isinstance(item_title, str) and item_title.strip():
                    ClientOrderStageItem.objects.create(
                        stage=stage, title=item_title.strip(), sort_order=idx,
                    )
            if not order.use_stages:
                order.use_stages = True
                order.save(update_fields=['use_stages'])
            order.update_progress()
            return serialize_stage(stage), order.overall_progress, None

        result, progress, error = await _create()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'stage.created', {'stage': result, 'progress': progress})
        return {'ok': True, 'data': {'stage': result, 'progress': progress}}

    async def handle_stage_link_order(self, data):
        stage_id = data.get('stage_id')
        mebelcity_order_id = data.get('mebelcity_order_id')

        @database_sync_to_async
        def _link():
            from client_erp.models import ClientOrder, ClientOrderStage, ClientOrderPermission
            from client_erp.serializers import serialize_stage
            stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
            order = stage.order
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user, role='manager',
                ).first()
                if not perm:
                    return None, None, 'Ruxsat yo\'q'
            stage.mebelcity_order_id = mebelcity_order_id or None
            stage.save(update_fields=['mebelcity_order_id'])
            return serialize_stage(stage), order.pk, None

        result, order_id, error = await _link()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'stage.linked', {'stage': result})
        return {'ok': True, 'data': {'stage': result}}

    async def handle_order_link_mebelcity(self, data):
        """Zakaz (order) darajasida MebelCity buyurtmaga ulash/uzish —
        "Ulanmagan MebelCity buyurtmalar" bo'limidan (2026-08-28 TZ).
        `stage.link_order` dan farqi: bosqichga emas, to'g'ridan-to'g'ri
        ClientOrder.mebelcity_order_id ga yozadi (usta bosqichlarsiz oddiy
        zakazni ham ulay olsin). mebelcity_order_id=null → UZISH (2026-08-28,
        foydalanuvchi: ulangan buyurtmani uzib, boshqasiga ulay olish kerak)."""
        order_id = data.get('order_id')
        mebelcity_order_id = data.get('mebelcity_order_id') or None
        if not order_id:
            return {'ok': False, 'error': 'order_id kerak'}

        @database_sync_to_async
        def _link():
            from client_erp.models import ClientOrder, ClientOrderPermission, ClientOrderStage
            from client_erp.serializers import serialize_order_brief
            try:
                order = ClientOrder.objects.get(pk=order_id, is_deleted=False)
            except ClientOrder.DoesNotExist:
                return None, 'Buyurtma topilmadi'
            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user, role='manager',
                ).first()
                if not perm:
                    return None, 'Ruxsat yo\'q'
            order.mebelcity_order_id = mebelcity_order_id
            order.mebelcity_tenant = self.scope.get('db_alias', 'default') if mebelcity_order_id else ''
            order.save(update_fields=['mebelcity_order_id', 'mebelcity_tenant'])
            # UZISH (mebelcity_order_id=None) bo'lsa — bog'lanish order-level
            # EMAS, stage-level (ClientOrderStage.mebelcity_order_id) orqali
            # ham bo'lishi mumkin (linkMc/stage.link_order oqimi) — shularni
            # ham tozalaymiz, aks holda "Uzish" ko'rinishda ishlab, aslida
            # eskicha ulangan qolib ketardi (2026-08-28, foydalanuvchi topdi).
            if mebelcity_order_id is None:
                ClientOrderStage.objects.filter(
                    order=order, mebelcity_order_id__isnull=False,
                ).update(mebelcity_order_id=None)
            return serialize_order_brief(order), None

        result, error = await _link()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'order.updated', result)
        return {'ok': True, 'data': result}

    async def handle_mebelcity_orders_for_stage(self, data):
        data = data or {}
        query_title = (data.get('order_title') or '').strip()

        @database_sync_to_async
        def _get():
            phone = self.user.phone
            if not phone:
                return []
            try:
                from manfacturing.models import Order, OrderStep
                from client_erp.models import ClientOrderStage
                from client_erp.services.name_match import match_score, get_mc_client_ids
                from tenant_manager.middleware import get_current_db_alias
                from hashids import Hashids
                _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
                _db = get_current_db_alias()
                _client_name = None
                if self.user.client_id:
                    from clients.models import Client as _Client
                    _c = _Client.objects.using(_db).filter(pk=self.user.client_id).first()
                    _client_name = _c.full_name if _c else None
                # 2026-09-11: `owner_user_id` — ustaning o'zi allaqachon ulagan
                # MC buyurtmalarni ham qamrab oladi (xodim xatosi bilan
                # boshqa Client'ga bog'langan holatlar uchun).
                _mc_client_ids, _mc_extra_ids = get_mc_client_ids(phone, _client_name, db_alias=_db, owner_user_id=self.user.id)
                # ⚠️ 2026-09-05: sana-filtr (08-15dan oldingi buyurtmalarni
                # yashirish) QO'SHILGAN VA DARHOL BEKOR QILINGAN — u haqiqiy
                # mos keladigan eski buyurtmani ("Rustam Bosimov shkav",
                # 07-09, 68% mos) ham yashirib, faqat mos kelmaydigan yangi
                # buyurtmalar qolib ketishiga sabab bo'ldi. Foydalanuvchi
                # qarori: sana bo'yicha CHEKLAMASLIK, faqat moslik balli
                # (match_score, pastda) bo'yicha saralash — bu allaqachon
                # mavjud edi (asl holatga qaytarildi).
                from django.db.models import Q as _Q4
                orders = Order.objects.filter(
                    _Q4(client_id__in=_mc_client_ids) | _Q4(id__in=_mc_extra_ids),
                ).select_related('client', 'create_user').order_by('-order_date')
                delivery_labels = dict(Order.DELIVERY_STATE_CHOICES)
                linked_map = {}
                linked_stages = ClientOrderStage.objects.filter(
                    mebelcity_order_id__isnull=False,
                    order__owner=self.user,
                ).select_related('order').values_list('mebelcity_order_id', 'order__title')
                for mc_id, order_title in linked_stages:
                    linked_map[mc_id] = order_title
                # Zamer bor-yo'qligi — batch (buyurtma ichiga kirmasdan bilish uchun)
                try:
                    from manfacturing.models import Zamer
                    zamer_ids = set(Zamer.objects.filter(
                        order__in=orders,
                    ).values_list('order_id', flat=True))
                except Exception:
                    zamer_ids = set()
                result = []
                for o in orders:
                    total_steps = OrderStep.objects.filter(order=o).count()
                    done_steps = OrderStep.objects.filter(order=o, state='done').count()
                    progress = int(done_steps * 100 / total_steps) if total_steps else 0
                    current_step = OrderStep.objects.filter(
                        order=o, state='in_progress',
                    ).select_related('step_type').first()
                    # Yaratuvchi (zakaz ochgan xodim) to'liq ismi
                    creator = ''
                    if getattr(o, 'create_user', None):
                        creator = (f"{o.create_user.first_name} {o.create_user.last_name}".strip()
                                   or o.create_user.username)
                    score = match_score(query_title, o.project_name or '') if query_title else 0.0
                    result.append({
                        'id': o.pk,
                        'order_hash': _hashids.encode(o.pk),
                        # Mijoz ismi (masalan "Big One 0299" ko'rinishida — telefon oxiri bilan)
                        'partner_name': (
                            f"{o.client.full_name} {o.client.phone[-4:] if o.client.phone else ''}".strip()
                            if o.client else (o.partner_name or '')
                        ),
                        # 2026-09-05: TO'LIQ telefon raqam — foydalanuvchi so'rovi
                        # ("nomer yozsa chiqarib berish kerak"), UI'da ko'rsatilmaydi,
                        # faqat frontend qidiruv filtrida ishlatiladi (partner_name
                        # faqat oxirgi 4 raqamni o'z ichiga oladi).
                        'partner_phone': (o.client.phone or '') if o.client else '',
                        # Loyiha nomi — zakaz yaratishda kiritilgan (odatda mijoz ismi)
                        'project_name': o.project_name or '',
                        # Zamer bor-yo'qligi (ro'yxatda status ko'rsatish uchun)
                        'has_zamer': o.pk in zamer_ids,
                        # Yaratuvchi — zakazni ochgan xodim
                        'creator_name': creator,
                        'state': o.state,
                        'delivery_state': o.delivery_state,
                        'delivery_label': delivery_labels.get(o.delivery_state, ''),
                        # Pul (total_sum) ATAYLAB olib tashlandi — TZ (2026-07-09)
                        'progress': progress,
                        'is_urgent': getattr(o, 'is_urgent', False),
                        'created_at': o.order_date.isoformat() if getattr(o, 'order_date', None) else None,
                        'deadline': o.deadline_at.isoformat() if getattr(o, 'deadline_at', None) else None,
                        'current_step': current_step.step_type.name if current_step and current_step.step_type else None,
                        'linked_to': linked_map.get(o.pk),
                        # Nom-o'xshashlik balli (0-1) — zakaz nomi bilan MebelCity loyiha
                        # nomi taqqoslanadi (usta qidirib topmasin, tizim taklif qilsin).
                        'match_score': round(score, 3),
                    })
                # Eng o'xshashlar tepada — usta tezroq topsin. Balli 0 bo'lsa
                # (qidiruv nomi berilmagan yoki umuman mos kelmagan) — sana
                # tartibi (eski xulq) saqlanadi, chunki `sorted` turg'un (stable).
                if query_title:
                    result.sort(key=lambda r: r['match_score'], reverse=True)
                return result
            except Exception as e:
                logger.exception("MC orders for stage error")
                return []
        return {'ok': True, 'data': {'orders': await _get()}}

    async def handle_stage_complete(self, data):
        stage_id = data.get('id')

        @database_sync_to_async
        def _complete():
            from client_erp.models import (
                ClientOrderStage, ClientOrderTimeline, ClientOrderPermission,
            )
            from client_erp.serializers import serialize_stage
            from client_erp.services.gamification import award_xp, check_quest_progress
            from django.utils import timezone

            stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
            order = stage.order

            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user,
                ).first()
                if not perm or not perm.can_complete_stage:
                    return None, 'Ruxsat yo\'q'

            stage.status = 'completed'
            stage.completed_by = self.user
            stage.completed_at = timezone.now()
            stage.save(update_fields=['status', 'completed_by', 'completed_at'])

            next_stage = order.stages.filter(
                sort_order__gt=stage.sort_order, status='pending',
            ).first()
            if next_stage:
                next_stage.status = 'active'
                next_stage.save(update_fields=['status'])

            order.update_progress()

            if order.status == 'new':
                order.status = 'in_progress'
                order.save(update_fields=['status'])

            who = self.user.full_name or self.user.username
            ClientOrderTimeline.objects.create(
                order=order, action='stage_complete',
                note=f"Etap tugallandi: {stage.title} — {who}",
            )

            xp, coins = award_xp(self.user, 'complete_stage', f"Etap: {stage.title}", stage=stage, order=order)
            check_quest_progress(self.user, 'complete_stage')

            from client_erp.services.notifications import notify_stage_completed, notify_order_completed
            if order.owner_id != self.user.pk:
                notify_stage_completed(order.owner, order.title, stage.title, who)

            all_done = not order.stages.exclude(status__in=['completed', 'skipped']).exists()
            if all_done:
                order.status = 'ready'
                order.save(update_fields=['status'])
                xp2, coins2 = award_xp(self.user, 'complete_order', f"Buyurtma: {order.title}")
                xp += xp2
                coins += coins2
                notify_order_completed(order.owner, order.title)

            return {
                'stage': serialize_stage(stage),
                'progress': order.overall_progress,
                'xp': xp, 'coins': coins,
                'all_done': all_done,
                'order_id': order.pk,
            }, None

        result, error = await _complete()
        if error:
            return {'ok': False, 'error': error}

        await self._broadcast_order(result['order_id'], 'stage.completed', result)
        if result['xp'] > 0 or result['coins'] > 0:
            await self.send_json({
                'type': 'xp.awarded',
                'data': {'xp': result['xp'], 'coins': result['coins']},
            })
        return {'ok': True, 'data': result}

    async def handle_stage_skip(self, data):
        stage_id = data.get('id')

        @database_sync_to_async
        def _skip():
            from client_erp.models import ClientOrderStage
            from client_erp.serializers import serialize_stage
            stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
            order = stage.order
            if order.owner_id != self.user.pk:
                return None, 'Faqat egasi o\'tkazishi mumkin'
            stage.status = 'skipped'
            stage.save(update_fields=['status'])
            order.update_progress()
            return {
                'stage': serialize_stage(stage),
                'progress': order.overall_progress,
                'order_id': order.pk,
            }, None

        result, error = await _skip()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(result['order_id'], 'stage.skipped', result)
        return {'ok': True, 'data': result}

    async def handle_stage_reopen(self, data):
        stage_id = data.get('id')

        @database_sync_to_async
        def _reopen():
            from client_erp.models import (
                ClientOrderStage, ClientOrderTimeline, ClientOrderPermission,
            )
            from client_erp.serializers import serialize_stage

            stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
            order = stage.order

            if stage.status not in ('completed', 'skipped'):
                return None, 'Etap tugallanmagan'

            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user,
                ).first()
                if not perm:
                    return None, 'Ruxsat yo\'q'

            # XP/tanga clawback — etap tugallanganda berilgan mukofotlarni qaytarib olish
            from client_erp.models import XPTransaction
            revoked_xp, revoked_coins = 0, 0
            txs = XPTransaction.objects.filter(stage=stage, is_reversed=False)
            if txs.exists():
                revoked_xp = sum(t.xp_change for t in txs)
                revoked_coins = sum(t.coin_change for t in txs)
                txs.update(is_reversed=True)
                if revoked_xp or revoked_coins:
                    XPTransaction.objects.create(
                        user=self.user,
                        xp_change=-revoked_xp,
                        coin_change=-revoked_coins,
                        description=f"Bekor qilindi: {stage.title}",
                        stage=stage, order=order,
                    )
                    self.user.xp = max(0, self.user.xp - revoked_xp)
                    self.user.coins = max(0, self.user.coins - revoked_coins)
                    self.user.save(update_fields=['xp', 'coins'])

            stage.status = 'active'
            stage.completed_at = None
            stage.completed_by = None
            stage.save(update_fields=['status', 'completed_at', 'completed_by'])

            if order.status == 'ready':
                order.status = 'in_progress'
                order.save(update_fields=['status'])
            order.update_progress()

            who = self.user.full_name or self.user.username
            ClientOrderTimeline.objects.create(
                order=order, action='stage_reopen',
                note=f"Etap qayta ochildi: {stage.title} — {who}",
            )

            return {
                'stage': serialize_stage(stage),
                'progress': order.overall_progress,
                'order_id': order.pk,
                'revoked_xp': revoked_xp,
                'revoked_coins': revoked_coins,
            }, None

        result, error = await _reopen()
        if error:
            return {'ok': False, 'error': error}

        await self._broadcast_order(result['order_id'], 'stage.reopened', result)
        if result.get('revoked_xp') or result.get('revoked_coins'):
            await self.send_json({
                'type': 'xp.revoked',
                'data': {'xp': result['revoked_xp'], 'coins': result['revoked_coins']},
            })
        return {'ok': True, 'data': result}

    async def handle_stage_delete(self, data):
        stage_id = data.get('id')

        @database_sync_to_async
        def _delete():
            from client_erp.models import ClientOrderStage
            stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
            order = stage.order
            if order.owner_id != self.user.pk:
                return None, 'Faqat egasi o\'chirishi mumkin'
            stage.delete()
            order.update_progress()
            return {'progress': order.overall_progress, 'stage_id': stage_id, 'order_id': order.pk}, None

        result, error = await _delete()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(result['order_id'], 'stage.deleted', result)
        return {'ok': True, 'data': result}

    async def handle_stage_reorder(self, data):
        order_id = data.get('order_id')
        stage_ids = data.get('ids', [])

        @database_sync_to_async
        def _reorder():
            from client_erp.models import ClientOrder, ClientOrderStage
            order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            for idx, sid in enumerate(stage_ids):
                ClientOrderStage.objects.filter(pk=sid, order=order).update(sort_order=idx)

        await _reorder()
        await self._broadcast_order(order_id, 'stage.reordered', {'order_id': order_id})
        return {'ok': True, 'data': None}

    async def handle_stage_check(self, data):
        stage_id = data.get('stage_id')
        item_id = data.get('item_id')

        @database_sync_to_async
        def _toggle():
            from client_erp.models import ClientOrderStageItem, ClientOrderPermission
            from client_erp.services.gamification import award_xp
            from django.utils import timezone

            item = ClientOrderStageItem.objects.select_related(
                'stage', 'stage__order',
            ).get(pk=item_id, stage_id=stage_id)
            order = item.stage.order

            is_owner = (order.owner_id == self.user.pk)
            if not is_owner:
                perm = ClientOrderPermission.objects.filter(
                    order=order, user=self.user,
                ).first()
                if not perm:
                    return None, 'Ruxsat yo\'q'

            item.is_done = not item.is_done
            if item.is_done:
                item.done_by = self.user
                item.done_at = timezone.now()
            else:
                item.done_by = None
                item.done_at = None
            item.save()

            # Avto-status: birinchi checklist belgilanсa «Yangi» → «Jarayonda»
            new_status = None
            if item.is_done and order.status == 'new':
                order.status = 'in_progress'
                order.save(update_fields=['status'])
                new_status = 'in_progress'

            xp, coins = 0, 0
            if item.is_done:
                total_done = ClientOrderStageItem.objects.filter(
                    stage__order=order, is_done=True,
                ).count()
                if total_done % 5 == 0:
                    xp, coins = award_xp(self.user, 'checklist_streak')

            return {
                'item_id': item.pk,
                'stage_id': stage_id,
                'is_done': item.is_done,
                'done_by': self.user.full_name if item.is_done else None,
                'xp': xp, 'coins': coins,
                'order_id': order.pk,
                'new_status': new_status,
            }, None

        result, error = await _toggle()
        if error:
            return {'ok': False, 'error': error}

        await self._broadcast_order(result['order_id'], 'stage.checked', result)
        if result['xp'] > 0:
            await self.send_json({
                'type': 'xp.awarded',
                'data': {'xp': result['xp'], 'coins': result['coins']},
            })
        return {'ok': True, 'data': result}

    # ═══════════════════════════════════════════════════════════
    #  TEMPLATE HANDLERS
    # ═══════════════════════════════════════════════════════════

    async def handle_template_list(self, data):
        @database_sync_to_async
        def _list():
            from client_erp.models import ClientOrderStageTemplate
            from client_erp.serializers import serialize_template
            templates = ClientOrderStageTemplate.objects.filter(
                models.Q(owner=self.user) | models.Q(is_default=True),
            ).prefetch_related('items')
            return [serialize_template(t) for t in templates]

        return {'ok': True, 'data': {'templates': await _list()}}

    async def handle_template_save(self, data):
        @database_sync_to_async
        def _save():
            from client_erp.models import ClientOrderStageTemplate, ClientOrderStageTemplateItem
            from client_erp.serializers import serialize_template
            tmpl_id = data.get('id')
            name = (data.get('name') or '').strip()
            items = data.get('items', [])
            if not name:
                return None, 'Nomi kiritilmagan'
            if tmpl_id:
                tmpl = ClientOrderStageTemplate.objects.get(pk=tmpl_id, owner=self.user)
                tmpl.name = name
                tmpl.save(update_fields=['name'])
            else:
                tmpl = ClientOrderStageTemplate.objects.create(owner=self.user, name=name)
            tmpl.items.all().delete()
            for i, item in enumerate(items):
                ClientOrderStageTemplateItem.objects.create(
                    template=tmpl,
                    title=(item.get('title') or '').strip() or f'Etap {i+1}',
                    icon=item.get('icon', '📋'),
                    color=item.get('color', '#6366f1'),
                    sort_order=i,
                    is_mebelcity=bool(item.get('is_mebelcity')),
                    note=(item.get('note') or '').strip(),
                    estimated_cost=int(item.get('estimated_cost') or 0),
                    checklist_json=item.get('checklist', []),
                )
            return serialize_template(tmpl), None
        try:
            result, error = await _save()
            if error:
                return {'ok': False, 'error': error}
            return {'ok': True, 'data': result}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    async def handle_template_delete(self, data):
        @database_sync_to_async
        def _del():
            from client_erp.models import ClientOrderStageTemplate
            tmpl = ClientOrderStageTemplate.objects.get(pk=data.get('id'), owner=self.user)
            tmpl.delete()
        try:
            await _del()
            return {'ok': True}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    async def handle_template_apply(self, data):
        template_id = data.get('template_id')
        order_id = data.get('order_id')

        @database_sync_to_async
        def _apply():
            from client_erp.models import ClientOrder, ClientOrderStageTemplate
            from client_erp.views.stages import _apply_template
            from client_erp.serializers import serialize_order_full

            order = ClientOrder.objects.select_related('customer').get(pk=order_id, owner=self.user)
            tmpl = ClientOrderStageTemplate.objects.get(pk=template_id)
            _apply_template(order, tmpl)
            order.use_stages = True
            order.save(update_fields=['use_stages'])
            order.update_progress()
            return serialize_order_full(order, user_role='owner', is_owner=True)

        try:
            result = await _apply()
        except Exception as e:
            return {'ok': False, 'error': str(e)}

        await self._broadcast_order(order_id, 'template.applied', {'order_id': order_id})
        return {'ok': True, 'data': result}

    # ═══════════════════════════════════════════════════════════
    #  PERMISSION HANDLERS
    # ═══════════════════════════════════════════════════════════

    async def handle_perm_save(self, data):
        order_id = data.get('order_id')
        user_id = data.get('user_id')
        role = data.get('role', 'viewer')
        stage_ids = data.get('stages', [])
        can_add_expense = data.get('can_add_expense', False)
        can_complete_stage = data.get('can_complete_stage', False)
        can_see_money = data.get('can_see_money', None)  # None = tegilmasin (eski JS mosligi)
        always = bool(data.get('always', False))  # "Har doim" — doimiy a'zolik

        @database_sync_to_async
        def _save():
            from client_erp.models import ClientOrder, ClientOrderPermission
            from client_erp.serializers import serialize_permission
            from client_erp.services.gamification import award_xp

            order = ClientOrder.objects.get(pk=order_id, owner=self.user)
            defaults = {
                'role': role,
                'can_add_expense': can_add_expense,
                'can_complete_stage': can_complete_stage,
            }
            if can_see_money is not None:
                defaults['can_see_money'] = bool(can_see_money)
            perm, created = ClientOrderPermission.objects.update_or_create(
                order=order, user_id=user_id,
                defaults=defaults,
            )
            perm.stages.set(stage_ids)
            if created:
                award_xp(self.user, 'share_order')

            # "Har doim" — doimiy a'zolik: har yangi buyurtma avto-ulashiladi
            if always:
                try:
                    from client_erp.models.team import ClientStandingShare
                    ClientStandingShare.objects.update_or_create(
                        owner=self.user, member_id=user_id,
                        defaults={
                            'role': role,
                            'can_add_expense': can_add_expense,
                            'can_complete_stage': can_complete_stage,
                            'can_see_money': bool(can_see_money) if can_see_money is not None else False,
                        },
                    )
                except Exception:
                    logger.exception("Standing share saqlashda xato (perm saqlanib bo'ldi)")

            perm = ClientOrderPermission.objects.select_related(
                'user', 'user__vip_level',
            ).prefetch_related('stages').get(pk=perm.pk)
            return serialize_permission(perm)

        result = await _save()
        await self._broadcast_order(order_id, 'perm.saved', result)
        return {'ok': True, 'data': result}

    # ── "Har doim" doimiy a'zolar (standing share) ──

    @staticmethod
    def _autoshare_team_dict(team):
        """Jamoa avto-ulashish sozlamalari + a'zolar (sync kontekstda chaqiriladi)."""
        return {
            'id': team.pk,
            'name': team.name,
            'auto_share_new_orders': team.auto_share_new_orders,
            'auto_role': team.auto_role,
            'auto_can_add_expense': team.auto_can_add_expense,
            'auto_can_complete_stage': team.auto_can_complete_stage,
            'auto_can_see_money': team.auto_can_see_money,
            'members': [{
                'name': m.user.full_name or m.user.username,
                'role': m.role,
            } for m in team.members.filter(status='active')
                .select_related('user').order_by('role', 'user__full_name')],
        }

    async def handle_standing_list(self, data):
        @database_sync_to_async
        def _list():
            from client_erp.models.team import ClientStandingShare, ClientTeam
            rows = ClientStandingShare.objects.filter(
                owner=self.user,
            ).select_related('member').order_by('member__full_name')
            members = [{
                'id': s.pk,
                'user_id': s.member_id,
                'full_name': s.member.full_name,
                'phone': s.member.phone,
                'role': s.role,
                'can_add_expense': s.can_add_expense,
                'can_complete_stage': s.can_complete_stage,
                'can_see_money': s.can_see_money,
            } for s in rows]
            teams = [self._autoshare_team_dict(t)
                     for t in ClientTeam.objects.filter(owner=self.user)]
            return members, teams

        members, teams = await _list()
        return {'ok': True, 'data': {'members': members, 'teams': teams}}

    async def handle_standing_update(self, data):
        """Doimiy ("Har doim") yozuvni tahrirlash — owner-scoped."""
        sid = data.get('id')
        role = data.get('role')

        @database_sync_to_async
        def _update():
            from client_erp.models.team import ClientStandingShare
            ss = ClientStandingShare.objects.filter(pk=sid, owner=self.user).first()
            if not ss:
                return None
            if role in ('viewer', 'worker', 'manager'):
                ss.role = role
            for f in ('can_add_expense', 'can_complete_stage', 'can_see_money'):
                if f in data:
                    setattr(ss, f, bool(data.get(f)))
            ss.save()
            return {
                'id': ss.pk, 'user_id': ss.member_id, 'role': ss.role,
                'can_add_expense': ss.can_add_expense,
                'can_complete_stage': ss.can_complete_stage,
                'can_see_money': ss.can_see_money,
            }

        result = await _update()
        if result is None:
            return {'ok': False, 'error': 'Topilmadi'}
        return {'ok': True, 'data': result}

    async def handle_standing_delete(self, data):
        sid = data.get('id')

        @database_sync_to_async
        def _delete():
            from client_erp.models.team import ClientStandingShare
            deleted, _ = ClientStandingShare.objects.filter(
                pk=sid, owner=self.user,
            ).delete()
            return deleted

        deleted = await _delete()
        if not deleted:
            return {'ok': False, 'error': 'Topilmadi'}
        return {'ok': True, 'data': None}

    # ── Jamoa avto-ulashish sozlamalari (auto_share_new_orders) ──

    async def handle_team_autoshare_get(self, data):
        @database_sync_to_async
        def _get():
            from client_erp.models.team import ClientTeam
            return [self._autoshare_team_dict(t)
                    for t in ClientTeam.objects.filter(owner=self.user)]

        return {'ok': True, 'data': {'teams': await _get()}}

    async def handle_team_autoshare_set(self, data):
        """Avto-ulashish bayrog'i + auto_* ruxsatlarni saqlash — faqat owner."""
        team_id = data.get('team_id')

        @database_sync_to_async
        def _set():
            from client_erp.models.team import ClientTeam
            team = ClientTeam.objects.filter(pk=team_id, owner=self.user).first()
            if not team:
                return None
            if 'auto_share_new_orders' in data:
                team.auto_share_new_orders = bool(data.get('auto_share_new_orders'))
            role = data.get('auto_role')
            if role in ('viewer', 'worker', 'manager'):
                team.auto_role = role
            for f in ('auto_can_add_expense', 'auto_can_complete_stage', 'auto_can_see_money'):
                if f in data:
                    setattr(team, f, bool(data.get(f)))
            team.save()
            return self._autoshare_team_dict(team)

        result = await _set()
        if result is None:
            return {'ok': False, 'error': "Jamoa topilmadi yoki siz egasi emassiz"}
        return {'ok': True, 'data': result}

    async def handle_perm_delete(self, data):
        perm_id = data.get('id')

        @database_sync_to_async
        def _delete():
            from client_erp.models import ClientOrderPermission
            perm = ClientOrderPermission.objects.select_related('order').get(pk=perm_id)
            if perm.order.owner_id != self.user.pk:
                return None, 'Ruxsat yo\'q'
            order_id = perm.order_id
            perm.delete()
            return order_id, None

        order_id, error = await _delete()
        if error:
            return {'ok': False, 'error': error}
        await self._broadcast_order(order_id, 'perm.deleted', {'perm_id': perm_id})
        return {'ok': True, 'data': None}

    async def handle_user_search(self, data):
        q = (data.get('q') or '').strip()
        if len(q) < 2:
            return {'ok': True, 'data': {'users': []}}

        @database_sync_to_async
        def _search():
            from client_erp.models import ClientUser
            users = ClientUser.objects.filter(
                models.Q(full_name__icontains=q) |
                models.Q(phone__icontains=q) |
                models.Q(username__icontains=q),
                is_active=True,
            ).exclude(pk=self.user.pk)[:10]
            return [{'id': u.pk, 'full_name': u.full_name, 'phone': u.phone} for u in users]

        return {'ok': True, 'data': {'users': await _search()}}

    # ═══════════════════════════════════════════════════════════
    #  TEAM HANDLERS
    # ═══════════════════════════════════════════════════════════

    def _get_user_team(self):
        from client_erp.models.team import ClientTeam, ClientTeamMember
        team = ClientTeam.objects.filter(owner=self.user).first()
        if team:
            return team
        m = ClientTeamMember.objects.filter(user=self.user, status='active', role__in=['owner', 'admin']).select_related('team').first()
        return m.team if m else None

    async def handle_page_team(self, data):
        @database_sync_to_async
        def _get():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import (
                ClientTeam, ClientTeamMember, ClientProfitTemplate, ClientProfitTemplateLine,
            )
            membership = ClientTeamMember.objects.filter(user=self.user, status='active').select_related('team').first()
            owned = ClientTeam.objects.filter(owner=self.user).first()
            team_obj = owned or (membership.team if membership else None)

            if not team_obj:
                return {'team': None, 'profit_templates': [], 'member_teams': []}

            members = []
            for m in team_obj.members.filter(status__in=['active', 'invited']).select_related('user').order_by('role', 'user__full_name'):
                members.append({
                    'user_id': m.user_id, 'name': m.user.full_name or m.user.username,
                    'phone': m.user.phone or '', 'username': m.user.username,
                    'role': m.role, 'profit_percent': float(m.profit_percent),
                    'status': m.status,
                })
            invitations = [m for m in members if m['status'] == 'invited']
            active_members = [m for m in members if m['status'] == 'active']

            templates = []
            for t in ClientProfitTemplate.objects.filter(team=team_obj).order_by('-is_default', 'name'):
                lines = [{'role_label': ln.role_label, 'percent': float(ln.percent)} for ln in t.lines.all()]
                templates.append({'id': t.id, 'name': t.name, 'is_default': t.is_default, 'lines': lines})

            # A'zo bo'lgan boshqa jamoalar (yuqorida ko'rsatilgandan tashqari) — yangi tab uchun
            member_teams = []
            for mem in ClientTeamMember.objects.filter(
                user=self.user, status='active',
            ).exclude(team_id=team_obj.id).select_related('team', 'team__owner'):
                tm = mem.team
                tmem = [{
                    'name': mm.user.full_name or mm.user.username,
                    'role': mm.role, 'profit_percent': float(mm.profit_percent),
                } for mm in tm.members.filter(status='active').select_related('user').order_by('role', 'user__full_name')]
                member_teams.append({
                    'id': tm.id, 'name': tm.name,
                    'owner_name': tm.owner.full_name or tm.owner.username,
                    'my_role': mem.role, 'my_percent': float(mem.profit_percent),
                    'members': tmem,
                })

            is_owner = team_obj.owner_id == self.user.pk

            # Jamoa buyurtmalari — endi shu yerda (avval Buyurtmalar sahifasida edi)
            from client_erp.models.team import ClientOrderShare
            from client_erp.serializers import serialize_order_brief
            team_orders = []
            for s in ClientOrderShare.objects.filter(
                team=team_obj, order__is_deleted=False,
            ).select_related('order', 'order__customer'):
                team_orders.append({
                    'order': serialize_order_brief(s.order),
                    'visibility': s.visibility,
                    'team_name': team_obj.name,
                })

            return {
                'team': {
                    'id': team_obj.id, 'name': team_obj.name,
                    'description': team_obj.description or '',
                    'is_owner': is_owner,
                    'members': active_members, 'invitations': invitations,
                    # Kutilayotgan takliflar (ro'yxatdan o'tmaganlarga, 2026-09-23, additive)
                    'pending': [{
                        'id': p.id, 'name': p.name, 'phone': p.phone,
                        'role': p.role,
                    } for p in team_obj.pending_invites.filter(status='waiting').order_by('-created_at')],
                },
                'profit_templates': templates,
                'member_teams': member_teams,
                'team_orders': team_orders,
            }
        return {'ok': True, 'data': await _get()}

    async def handle_team_create(self, data):
        @database_sync_to_async
        def _create():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam, ClientTeamMember
            if ClientTeam.objects.filter(owner=self.user).exists():
                return None, 'Sizda allaqachon jamoa bor'
            if ClientTeamMember.objects.filter(user=self.user, status='active').exists():
                return None, 'Siz allaqachon boshqa jamoada a\'zo siz'
            team = ClientTeam.objects.create(name=data.get('name', 'Jamoa'), owner=self.user, description=data.get('description', ''))
            ClientTeamMember.objects.create(team=team, user=self.user, role='owner', status='active', profit_percent=35)
            return team.id, None
        tid, err = await _create()
        if err: return {'ok': False, 'error': err}
        return {'ok': True, 'data': {'team_id': tid}}

    async def handle_team_update(self, data):
        @database_sync_to_async
        def _update():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            team.name = data.get('name', team.name)
            team.description = data.get('description', team.description)
            team.save()
            return None
        err = await _update()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

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

    async def handle_team_update_member(self, data):
        @database_sync_to_async
        def _upd():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam, ClientTeamMember
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            m = ClientTeamMember.objects.get(team=team, user_id=data.get('user_id'))
            if m.role == 'owner': return 'Egani o\'zgartib bo\'lmaydi'
            m.role = data.get('role', m.role)
            m.profit_percent = float(data.get('profit_percent', m.profit_percent))
            m.save()
            return None
        err = await _upd()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_team_remove_member(self, data):
        @database_sync_to_async
        def _remove():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam, ClientTeamMember
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            m = ClientTeamMember.objects.get(team=team, user_id=data.get('user_id'))
            if m.role == 'owner': return 'Egani chiqarib bo\'lmaydi'
            m.delete()
            return None
        err = await _remove()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_team_leave(self, data):
        """Foydalanuvchi O'ZI a'zo bo'lgan jamoadan chiqadi (egasi chiqolmaydi)."""
        @database_sync_to_async
        def _leave():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeamMember
            team_id = data.get('team_id')
            qs = ClientTeamMember.objects.filter(user=self.user)
            m = qs.filter(team_id=team_id).first() if team_id else qs.exclude(role='owner').first()
            if not m:
                return 'Jamoa topilmadi'
            if m.role == 'owner':
                return "Siz jamoa egasisiz — chiqib bo'lmaydi (jamoani o'chiring)"
            m.delete()
            return None
        err = await _leave()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_team_save_template(self, data):
        @database_sync_to_async
        def _save():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeam, ClientProfitTemplate, ClientProfitTemplateLine
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            tmpl = ClientProfitTemplate.objects.create(team=team, name=data.get('name', 'Shablon'))
            for i, ln in enumerate(data.get('lines', [])):
                ClientProfitTemplateLine.objects.create(
                    template=tmpl, role_label=ln.get('role_label', ''),
                    percent=float(ln.get('percent', 0)), sort_order=i,
                )
            return None
        err = await _save()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_team_delete_template(self, data):
        @database_sync_to_async
        def _del():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientProfitTemplate
            team = self._get_user_team()
            if not team: return 'Jamoa topilmadi'
            tmpl = ClientProfitTemplate.objects.filter(id=data.get('id'), team=team).first()
            if not tmpl: return 'Shablon topilmadi'
            tmpl.delete()
            return None
        err = await _del()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    # ── ILOVA ADMINI (2026-09-23, additive) ──────────────────────────
    # Sozlamalarni ilova ichidan o'zgartirish + admin tayinlash.
    # Mavjud handlerlarga tegilmaydi.
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

    async def handle_team_accept(self, data):
        @database_sync_to_async
        def _accept():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeamMember
            from django.utils import timezone
            m = ClientTeamMember.objects.filter(user=self.user, status='invited').first()
            if not m: return 'Taklif topilmadi'
            m.status = 'active'
            m.accepted_at = timezone.now()
            m.save()
            return None
        err = await _accept()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_team_decline(self, data):
        @database_sync_to_async
        def _decline():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models.team import ClientTeamMember
            ClientTeamMember.objects.filter(user=self.user, status='invited').delete()
            return None
        await _decline()
        return {'ok': True}

    async def handle_profit_withdraw(self, data):
        @database_sync_to_async
        def _withdraw():
            from tenant_manager.middleware import _thread_local
            _db = self.scope.get('db_alias', 'default')
            _thread_local.db_alias = _db
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientOrder, ClientFinanceRecord
            from client_erp.models.team import (
                ClientProfitWithdrawal, ClientProfitWithdrawalLine,
                ClientOrderProfitShare,          # ulush yozuvi kafolati (2026-08-18)
            )
            from client_erp.models.order import ClientOrderTimeline
            from client_erp.models.permission import ClientOrderPermission
            from django.db import transaction
            from django.utils import timezone
            from datetime import timedelta as _td

            order = ClientOrder.objects.get(pk=data.get('order_id'), owner=self.user)
            lines = data.get('lines', [])
            total_profit = float(data.get('total_profit', 0))

            # ── H3 (2026-08-04): IDEMPOTENTLIK — `client_request_id` ─────────
            # Brauzer har «Tasdiqlash» bosilganda bitta UUID yuboradi, qayta
            # urinishda AYNAN o'shani takrorlaydi. Shu ID bilan yozuv bo'lsa —
            # YANGI yozuv yaratmaymiz, mavjudini "muvaffaqiyat" deb qaytaramiz.
            # Bu tugmani ikki marta bosish, WS timeout'dan keyingi qayta
            # urinish va reconnect-navbatni bir yo'la yopadi (TZ §0.4-B).
            _crid = (data.get('client_request_id') or '').strip() or None
            if _crid:
                # UUID bo'lmasa — jim tashlab yuboramiz (eski brauzer yoki
                # o'zgartirilgan mijoz noto'g'ri qiymat yuborsa, butun pul
                # operatsiyasi ValidationError bilan yiqilmasin).
                import uuid as _uuid_mod
                try:
                    _crid = str(_uuid_mod.UUID(str(_crid)))
                except (ValueError, AttributeError, TypeError):
                    logger.warning("[profit_withdraw] noto'g'ri client_request_id: %r", _crid)
                    _crid = None
            if _crid:
                _dup = ClientProfitWithdrawal.objects.filter(client_request_id=_crid).first()
                if _dup:
                    # Takror so'rov — jimgina o'sha natijani qaytaramiz (xato EMAS,
                    # aks holda foydalanuvchi «bo'lmadi» deb yana bosardi).
                    return _dup.order_id, None, []

            # Zaxira to'siq (eski frontend UUID yubormasa ham ishlaydi):
            # shu zakazdan oxirgi 60 soniyada AYNAN shu summa yechilgan bo'lsa.
            _recent = ClientProfitWithdrawal.objects.filter(
                order=order, created_by=self.user,
                created_at__gte=timezone.now() - _td(seconds=60),
            ).exclude(status='reversed').first()
            if _recent and abs(float(_recent.total_profit or 0) - total_profit) < 1:
                return None, (
                    "Bu buyurtmadan hozirgina pul yechilgan (1 daqiqa ichida). "
                    "Takroriy yozuv yaratilmadi — Moliya bo'limidan tekshiring."
                ), []

            # ── H4 (2026-08-03): ATOMIK TRANZAKSIYA ───────────────────────────
            # Ilgari butun `consumers.py` da bironta `transaction.atomic` yo'q
            # edi. Natijada 3-qatorda xato chiqsa (masalan DB «too many
            # clients»), 1-2 qator ALLAQACHON commit bo'lgan holda qolardi —
            # yarim yechilgan pul. Endi hammasi yoki hech narsa.
            with transaction.atomic(using=_db):
                wd = ClientProfitWithdrawal.objects.create(
                    order=order, total_profit=total_profit,
                    status='completed', created_by=self.user,
                    completed_at=timezone.now(),
                    client_request_id=_crid,          # H3: takrorlanishga qarshi
                )
                from client_erp.services.scope import TEAM_FINANCE_BETA_USER_IDS
                # ── Bildirishnoma ro'yxati (2026-08-04) ────────────────────────
                # Ilgari `_notify` ALOHIDA `ClientTeamMember` nom-mosligidan
                # tuzilardi — bu HAQIQIY kirim yaratilgan `_matched_user`dan
                # MUSTAQIL edi, ya'ni: (a) ba'zida odam pul OLMAGAN bo'lsa ham
                # "Foyda yechildi" xabari kelardi (chalkash), (b) ba'zida real
                # kirim yozilgan odamga UMUMAN xabar bormasdi (jim pul). Endi
                # bildirishnoma FAQAT haqiqatda kirim yaratilgan `_matched_user`
                # uchun, xuddi shu joyda yig'iladi — ikkalasi HAR DOIM mos keladi.
                _notify = []
                for ln in lines:
                    # ── H1 (2026-08-03): ism → akkaunt moslashtirish ────────────
                    # Faqat AUDIT-TRAIL uchun (WithdrawalLine.user) — moliyaviy
                    # hisobga ta'sir qilmaydi, GLOBAL ishlaydi (barcha
                    # foydalanuvchilar). Manba: shu zakazga ULASHILGAN, pul
                    # ko'rish ruxsati bor real akkauntlar (`ClientOrderPermission`)
                    # — begona akkaunt tasodifan mos kelib qolmasligi uchun
                    # ro'yxat shu zakazga ulashilganlar bilan CHEKLANGAN.
                    # ── XAVFSIZLIK (2026-08-04): ANIQ BIR MOSLIK bo'lmasa —
                    # HECH KIMGA yozilmaydi. Ilgari birinchi mos kelgan odam
                    # olinardi (`break`) — agar shu zakazga ulashilganlar orasida
                    # 2 kishining ismi bir xil/o'xshash bo'lsa, pul/ma'lumot
                    # NOTO'G'RI odamga "oqib ketishi" mumkin edi (audit: TZ
                    # §0.4-D, bazada `dilshod` ×2). Endi: 0 yoki 2+ moslik —
                    # avtomatik bog'lanmaydi (jim, xavfsiz — eski xatti-harakat).
                    # ── H1 to'liq (2026-08-04): KONTAKT FK ustuvor ──────────────
                    # Frontend endi `user_id` yuboradi (foyda taqsimotidagi
                    # bog'langan kontakt). Ism bo'yicha taxmin QILINMAYDI —
                    # u faqat eski, bog'lanmagan yozuvlar uchun zaxira.
                    # Xavfsizlik: id shu buyurtmada ruxsat etilgan kontaktlar
                    # ro'yxatida bo'lishi SHART (begona akkauntga pul ketmasin).
                    _matched_user = None
                    _uid_in = ln.get('user_id')
                    if _uid_in:
                        try:
                            _uid_in = int(_uid_in)
                        except (TypeError, ValueError):
                            _uid_in = None
                    if _uid_in and _uid_in != order.owner_id:
                        # 2026-08-04: qidiruv orqali tanlangan har qanday FAOL
                        # akkaunt qabul qilinadi (egasi ongli tanlagan).
                        from client_erp.models import ClientUser as _CU
                        _matched_user = _CU.objects.filter(pk=_uid_in, is_active=True).first()
                        if not _matched_user:
                            logger.warning(
                                "[profit_withdraw] faol bo'lmagan akkaunt id=%s (order=%s)",
                                _uid_in, order.pk)

                    _nm = (ln.get('name') or '').strip().lower()
                    if _nm and not _matched_user:
                        _candidates = []
                        for _p in ClientOrderPermission.objects.filter(
                            order=order, can_see_money=True,
                        ).exclude(user=self.user).select_related('user'):
                            _u = _p.user
                            if _nm in {
                                (_u.full_name or '').strip().lower(),
                                (_u.username or '').strip().lower(),
                            }:
                                _candidates.append(_u)
                        if len(_candidates) == 1:
                            _matched_user = _candidates[0]
                        elif len(_candidates) > 1:
                            logger.warning(
                                "[profit_withdraw] ism to'qnashuvi: '%s' %d ta akkauntga mos "
                                "keldi (order=%s) — avtomatik bog'lanmadi (xavfsizlik)",
                                _nm, len(_candidates), order.pk,
                            )

                    # ── H7 (2026-08-04): A'ZO ROZILIGI ───────────────────────
                    # Kontaktga bog'langan qator — a'zo «Qabul qilaman»
                    # bosgunicha `confirmed=False`. Uning Kirimiga pul
                    # SHUNDA yoziladi (pastda `if _matched_user` bloki
                    # o'chirilgan). Akkauntsiz (nom-yozuv) qatorlar esa
                    # darhol tasdiqlangan hisoblanadi — kutadigan odam yo'q.
                    _needs_ok = bool(_matched_user)
                    _line = ClientProfitWithdrawalLine.objects.create(
                        withdrawal=wd, name=ln.get('name', ''),
                        user=_matched_user,
                        percent=float(ln.get('percent', 0)),
                        amount=float(ln.get('amount', 0)),
                        confirmed=not _needs_ok,
                        confirmed_at=None if _needs_ok else timezone.now(),
                    )
                    ClientFinanceRecord.objects.create(
                        owner=self.user, order=order,
                        record_type='withdrawal',
                        amount=float(ln.get('amount', 0)),
                        description=ln.get('name', ''),
                        recipient_name=ln.get('name', ''),
                        date=timezone.localdate(),
                        source_line=_line,            # H5: manbaga bog'lanadi
                    )
                    # BETA (faqat artom_cl↔ibrohim_cl, scope.py:TEAM_FINANCE_BETA_USER_IDS):
                    # oluvchi HAQIQIY hamkor-akkaunt bo'lsa — unga ALOHIDA kirim yozuvi,
                    # real pul o'tkazmasi sifatida. `order=None` ATAYLAB — aks holda bu
                    # order.finance_records yig'indisiga (barcha ustalar ulushi shundan
                    # hisoblanadi) qo'shilib, egasining o'z foydasini shishirib yuborardi.
                    # H7: a'zoning Kirimi SHU YERDA yozilMAYDI — u «Qabul
                    # qilaman» bosganda `handle_profit_accept` yozadi.
                    # Bu yerda faqat xabar beramiz: «sizga ulush kelmoqda».
                    if _matched_user:
                        _notify.append((
                            _matched_user, float(ln.get('amount', 0)),
                            float(ln.get('percent', 0)), order.title, _line.pk,
                        ))
                # ══ ULUSH YOZUVLARI KAFOLATI (2026-08-18, 2026-09-09 TUZATILDI) ══
                # `ClientOrderProfitShare` (kimga necha foiz) ALOHIDA amalda —
                # «foizni saqlash» — yaraladi. Foydalanuvchi foizni saqlamasdan
                # to'g'ridan-to'g'ri pul yechsa, yozuv umuman bo'lmay qolardi:
                # pul yechilgan, lekin tizim buyurtmani «taqsimlanmagan» deb
                # sanayverardi (#296 «Jafar aka jizzax», 2026-08-18 shikoyati).
                # Endi yechim paytida yozuv YO'Q bo'lsa — aynan yechim
                # satrlaridan tiklanadi.
                #
                # 2026-09-09 TUZATISH (bug: order #451, "Ustalar foydasi"
                # paneli faqat ClientOrderProfitShare'ni o'qiydi — withdrawal
                # jadvalini emas — shu sabab QAYTA taqsimlash paneldan
                # "ko'rinmas" edi): agar mavjud share'lar YECHISH satrlaridagi
                # odamlar bilan MOS KELMASA (masalan eski 1 kishilik 100% share
                # bor edi, lekin endi 3 kishiga qayta bo'lib yechilmoqda) — eski
                # yozuvlar ALMASHTIRILADI. Bu FAQAT hisobot/ulush-yozuvi (foiz
                # ko'rsatuv), haqiqiy pulga (yuqorida allaqachon yozilgan
                # ClientFinanceRecord/ClientProfitWithdrawal) TEGILMAYDI.
                _existing_shares = list(ClientOrderProfitShare.objects.filter(order=order))
                _lines_uids = frozenset(
                    (ln.get('user_id') or None, (ln.get('name') or '').strip())
                    for ln in lines
                )
                _shares_uids = frozenset(
                    (s.user_id, (s.name or '').strip()) for s in _existing_shares
                )
                _shares_stale = bool(_existing_shares) and _lines_uids != _shares_uids
                if _shares_stale:
                    ClientOrderProfitShare.objects.filter(order=order).delete()
                if not _existing_shares or _shares_stale:
                    for _i, _ln in enumerate(lines):
                        try:
                            _amt = float(_ln.get('amount', 0) or 0)
                            _pct = float(_ln.get('percent', 0) or 0)
                            if not _pct and total_profit:
                                _pct = round(_amt / float(total_profit) * 100, 2)
                            _nm = _ln.get('name', '')
                            _uid2 = _ln.get('user_id') or None
                            ClientOrderProfitShare.objects.create(
                                order=order,
                                user_id=_uid2,
                                name=_nm,
                                percent=_pct,
                                # Egasining qatori «qoldiq» deb belgilanadi —
                                # mavjud yozuvlar bilan bir xil bo'lsin
                                # (partner_remove.py aynan shunga qaraydi)
                                is_remainder=(_uid2 is None and 'buyurtma egasi' in _nm),
                                sort_order=_i,
                            )
                        except Exception:                          # noqa: BLE001
                            logger.warning(
                                "[profit_withdraw] ulush yozuvi tiklanmadi (order=%s)",
                                order.pk, exc_info=True)

                ClientOrderTimeline.objects.create(
                    order=order, action='profit_withdraw',
                    note='Foyda yechildi: ' + ', '.join([ln.get('name','')+'='+str(ln.get('amount',0)) for ln in lines]),
                )
                # H4: Telegram yuborish — TRANZAKSIYA ICHIDA emas, commit'dan
                # KEYIN (pastda). Sabab: `notify_*` ichida `requests.post(
                # timeout=10)` bor; DB tranzaksiyasi ochiq turganda tashqi HTTP
                # kutish xavfli (uzun tranzaksiya, connection band bo'lib qoladi).

            # ── ULUSH BILDIRISHNOMALARINI YOPISH (2026-08-04) ────────────────
            # «Sizga ulush belgilandi» kartasi pul HAQIQATDA o'tkazilgunicha
            # turadi (foydalanuvchi so'rovi: «pulni o'tkazmaguncha
            # yo'qolmaydigan bo'lishi kerak»). Endi pul o'tdi — IKKALA
            # tomondagi (ega + a'zo) yozuvni «o'qildi» qilamiz.
            try:
                from client_erp.models import ClientNotification
                ClientNotification.objects.filter(
                    is_read=False, channel='in_app',
                    link__startswith=f'/orders/{order.pk}#',
                ).update(is_read=True)
            except Exception:                                     # noqa: BLE001
                logger.warning("[profit_withdraw] bildirishnoma yopilmadi", exc_info=True)

            # ── Tranzaksiya YOPILDI (commit bo'ldi) — endi tashqi HTTP ──
            from client_erp.services.notifications import (
                notify_team_share_received, notify_share_sent_to_member,
            )
            for _u, _amt, _pct, _title, _lid in _notify:
                try:
                    # (a) A'ZOGA — «sizga ulush kelmoqda» (Telegram + ilovada)
                    notify_team_share_received(_u, _amt, _pct, _title, _lid)
                    # (b) EGASIGA — «falonchiga X so'm jo'natildi» (tasdiq).
                    notify_share_sent_to_member(self.user, _u, _amt, _pct, _title, _lid)
                except Exception:      # noqa: BLE001 — bildirishnoma pulni buzmasin
                    logger.warning("[profit_withdraw] xabar yuborilmadi", exc_info=True)
            return order.pk, None, _notify
        oid, err, _ = await _withdraw()
        if err:
            return {'ok': False, 'error': err}
        await self._broadcast_order(oid, 'profit.withdrawn', {'order_id': oid})
        return {'ok': True}

    async def handle_contacts_search(self, data):
        """Ro'yxatdan o'tgan foydalanuvchilar orasidan KONTAKT QIDIRISH.

        Nega kerak (2026-08-04 so'rovi): ilgari faqat o'z jamoasidagilar
        chiqardi — jamoaga hali qo'shilmagan, lekin Bittada'da ro'yxatdan
        o'tgan ustaga ulush yozib bo'lmasdi.

        Xavfsizlik: qidiruv FAQAT aniq so'rov bilan ishlaydi (kamida 2 belgi)
        va butun ro'yxatni to'kib bermaydi (20 tagacha). Telefonning oxirgi
        4 raqami ko'rsatiladi — ismdoshlarni ajratish uchun (to'liq raqam
        ko'rsatilmaydi).
        """
        q = (data.get('q') or '').strip()
        if len(q) < 2:
            return {'ok': True, 'data': {'items': []}}

        @database_sync_to_async
        def _find():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from django.db.models import Q
            from client_erp.models import ClientUser
            from client_erp.serializers import contact_label

            digits = ''.join(ch for ch in q if ch.isdigit())
            cond = Q(full_name__icontains=q) | Q(username__icontains=q)
            if digits:
                cond = cond | Q(phone__icontains=digits)
            qs = (ClientUser.objects.filter(cond, is_active=True)
                  .exclude(pk=self.user.pk).order_by('full_name')[:20])
            return [{
                'id': u.pk, 'label': contact_label(u),
                'name': (u.full_name or u.username or ''),
                'username': u.username or '',
                'phone': ''.join(ch for ch in (u.phone or '') if ch.isdigit()),
                'source': 'search',
            } for u in qs]

        return {'ok': True, 'data': {'items': await _find()}}

    async def handle_profit_accept(self, data):
        """H7 (2026-08-04) — A'ZO ulushni QABUL QILADI yoki RAD ETADI.

        Oqim: egasi «Pul yechish» bosadi → uning kassasidan pul chiqadi,
        lekin a'zoning Kirimiga HALI yozilmaydi (`line.confirmed=False`).
        A'zo o'z Moliya sahifasida kartani ko'radi va tanlaydi:

          • «✅ Qabul qilaman» → Kirimiga yoziladi, egaga tasdiq xabari
          • «❌ Olmadim»       → egaga pul QAYTADI (teskari yozuv), xabar

        Faqat AYNAN SHU a'zo o'z qatorini tasdiqlay oladi.
        """
        line_id = data.get('line_id')
        accept = bool(data.get('accept'))
        if not line_id:
            return {'ok': False, 'error': "Qaysi ulush ekani ko'rsatilmagan"}

        @database_sync_to_async
        def _act():
            from tenant_manager.middleware import _thread_local
            _db = self.scope.get('db_alias', 'default')
            _thread_local.db_alias = _db
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientFinanceRecord
            from client_erp.models.team import ClientProfitWithdrawalLine
            from django.db import transaction
            from django.utils import timezone

            ln = (ClientProfitWithdrawalLine.objects
                  .filter(pk=line_id, user=self.user)          # FAQAT o'ziniki
                  .select_related('withdrawal', 'withdrawal__order',
                                  'withdrawal__order__owner').first())
            if not ln:
                return None, "Ulush topilmadi (yoki sizga tegishli emas)", None
            if ln.confirmed:
                return None, "Bu ulush allaqachon qabul qilingan", None
            if ln.withdrawal.status == 'reversed':
                return None, "Bu yechim bekor qilingan", None

            order = ln.withdrawal.order
            owner = order.owner
            amt = float(ln.amount or 0)

            with transaction.atomic(using=_db):
                if accept:
                    # A'zoning Kirimiga yoziladi (`order=None` — ataylab:
                    # egasining zakaz-foydasini shishirmasin)
                    ClientFinanceRecord.objects.create(
                        owner=self.user, order=None,
                        record_type='income', amount=amt,
                        description=f"Ulashilgan zakaz ulushi — {order.title}",
                        date=timezone.localdate(), source_line=ln,
                    )
                    ln.confirmed = True
                    ln.confirmed_at = timezone.now()
                    ln.save(update_fields=['confirmed', 'confirmed_at'])
                else:
                    # Rad etildi — egaga pul QAYTADI (teskari yozuv)
                    ClientFinanceRecord.objects.create(
                        owner=owner, order=order,
                        record_type='income', amount=amt,
                        description=f"QAYTDI: {ln.name} ulushni olmadi",
                        date=timezone.localdate(),
                        source_line=ln, is_reversal=True,
                    )
                    ln.confirmed = False
                    ln.confirmed_at = timezone.now()
                    ln.save(update_fields=['confirmed_at'])

            return (owner, None, {'amount': amt, 'title': order.title,
                                  'accept': accept, 'order_id': order.pk})

        owner, err, info = await _act()
        if err:
            return {'ok': False, 'error': err}

        # Kutish kartalarini YOPISH — amal bajarildi (ikkala tomonda).
        # `link` oxiridagi `#line-<id>` aynan shu qatorni bildiradi.
        def _close():
            from client_erp.models import ClientNotification
            ClientNotification.objects.filter(
                is_read=False, channel='in_app',
                link__endswith=f'#line-{line_id}',
            ).update(is_read=True)
        try:
            await database_sync_to_async(_close)()
        except Exception:                                         # noqa: BLE001
            logger.warning("[profit_accept] karta yopilmadi", exc_info=True)

        def _notify():
            from client_erp.services.notifications import (
                notify_in_app, _send, _mini_url)
            from client_erp.serializers import contact_label
            lbl = contact_label(self.user)
            if info['accept']:
                notify_in_app(owner, f"{lbl} ulushni qabul qildi · {info['title']}",
                              "Pul uning hisobiga o‘tkazildi.", 'custom',
                              amount=info['amount'], link='/finance', icon='✅')
            else:
                notify_in_app(owner, f"{lbl} ulushni OLMADI · {info['title']}",
                              "Summa sizning kassangizga qaytarildi.", 'custom',
                              amount=info['amount'], link='/finance', icon='↩️')
            if getattr(owner, 'telegram_chat_id', None):
                _send(owner.telegram_chat_id,
                      (f"✅ <b>{lbl} ulushni qabul qildi</b>\n\n" if info['accept']
                       else f"↩️ <b>{lbl} ulushni olmadi</b>\n\n")
                      + f"📦 <b>{info['title']}</b>\n"
                      + f"💰 <b>{info['amount']:,.0f}</b> so‘m"
                      + ("" if info['accept'] else "\n\n<i>Summa kassangizga qaytarildi.</i>"),
                      "📱 Moliyani ochish", _mini_url(owner))
        try:
            await database_sync_to_async(_notify)()
        except Exception:                                         # noqa: BLE001
            logger.warning("[profit_accept] xabar yuborilmadi", exc_info=True)

        return {'ok': True, 'data': {'accepted': info['accept']}}

    async def handle_profit_withdraw_reverse(self, data):
        """H6 (2026-08-04) — foyda yechishni BEKOR QILISH.

        Nega kerak: cross-akkaunt kirim (F8) real pul yozuvi — xato qilinsa
        ilgari uni qaytarish mexanizmi UMUMAN yo'q edi (`is_deleted=True`
        qo'yadigan kod yo'q, `finance.revert` esa faqat bitta akkaunt uchun
        va `order=None` yozuvni target qila olmaydi). Audit buni KRITIK deb
        belgilagan (TZ §0.4-C).

        QOIDA — O'CHIRISH EMAS, TESKARI YOZUV (append-only):
          • egaga     → `income`  (yechilgan pul kassaga qaytdi)
          • a'zoga    → `expense` (unga yozilgan ulush qaytarib olindi)
          • eski yozuvlar TEGILMAYDI, `status='reversed'` bo'ladi.

        HIMOYA:
          1. Faqat yechishni yaratgan odam (zakaz egasi) bekor qila oladi.
          2. Sabab (izoh) MAJBURIY.
          3. A'zo o'sha pulni ALLAQACHON o'z kassasidan yechib olgan bo'lsa —
             bekor qilish BLOKLANADI (aks holda uning balansi manfiyga tushardi).
          4. Ikki marta bekor qilib bo'lmaydi.
        """
        wd_id = data.get('withdrawal_id')
        note = (data.get('note') or '').strip()
        if not wd_id:
            return {'ok': False, 'error': "Qaysi yechim bekor qilinishi ko'rsatilmagan"}
        if len(note) < 3:
            return {'ok': False, 'error': "Bekor qilish sababini yozing (kamida 3 harf)"}

        @database_sync_to_async
        def _reverse():
            from tenant_manager.middleware import _thread_local
            _db = self.scope.get('db_alias', 'default')
            _thread_local.db_alias = _db
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientFinanceRecord
            from client_erp.models.team import ClientProfitWithdrawal
            from client_erp.models.order import ClientOrderTimeline
            from django.db import transaction
            from django.db.models import Sum as _Sum
            from decimal import Decimal as _D
            from django.utils import timezone

            wd = (ClientProfitWithdrawal.objects
                  .filter(pk=wd_id, order__owner=self.user)
                  .select_related('order').first())
            if not wd:
                return None, "Yechim topilmadi (yoki sizga tegishli emas)", []
            if wd.status == 'reversed':
                return None, "Bu yechim allaqachon bekor qilingan", []

            lines = list(wd.lines.select_related('user').all())

            # ── HIMOYA 3: a'zo pulni allaqachon yechib olganmi ──
            # Uning balansi = kirim − chiqim − yechim. Agar biz ulushni
            # qaytarib olsak balans MANFIYga tushsa — demak pul allaqachon
            # sarflangan, bir tomonlama qaytarib bo'lmaydi.
            for ln in lines:
                if not ln.user_id:
                    continue
                _b = ClientFinanceRecord.objects.filter(owner_id=ln.user_id, is_deleted=False)
                _i = _b.filter(record_type='income').aggregate(s=_Sum('amount'))['s'] or 0
                _e = _b.filter(record_type='expense').aggregate(s=_Sum('amount'))['s'] or 0
                _w = _b.filter(record_type='withdrawal').aggregate(s=_Sum('amount'))['s'] or 0
                _bal = _D(str(_i)) - _D(str(_e)) - _D(str(_w))
                if _bal < _D(str(ln.amount or 0)):
                    return None, (
                        f"«{ln.name}» bu pulni allaqachon sarflagan "
                        f"(uning balansi: {int(_bal):,} so'm). "
                        "Avtomatik bekor qilib bo'lmaydi — u bilan kelishing."
                    ).replace(',', ' '), []

            _notify = []
            with transaction.atomic(using=_db):
                for ln in lines:
                    _amt = float(ln.amount or 0)
                    if _amt <= 0:
                        continue
                    # (a) EGAGA — yechilgan pul kassaga qaytdi
                    ClientFinanceRecord.objects.create(
                        owner=self.user, order=wd.order,
                        record_type='income', amount=_amt,
                        description=f"BEKOR: {ln.name} ulushi qaytarildi",
                        date=timezone.localdate(),
                        source_line=ln, is_reversal=True,
                    )
                    # (b) A'ZOGA — unga yozilgan ulush qaytarib olindi
                    if ln.user_id:
                        ClientFinanceRecord.objects.create(
                            owner_id=ln.user_id, order=None,
                            record_type='expense', amount=_amt,
                            description=f"BEKOR: «{wd.order.title}» ulushi qaytarildi",
                            date=timezone.localdate(),
                            source_line=ln, is_reversal=True,
                        )
                        if ln.user and ln.user.telegram_chat_id:
                            _notify.append((ln.user, _amt, wd.order.title, note))

                wd.status = 'reversed'
                wd.reversed_at = timezone.now()
                wd.reversed_by = self.user
                wd.reverse_note = note
                wd.save(update_fields=['status', 'reversed_at', 'reversed_by', 'reverse_note'])

                ClientOrderTimeline.objects.create(
                    order=wd.order, action='profit_withdraw_reverse',
                    note=f"Foyda yechish BEKOR qilindi: {note}",
                )

            return wd.order_id, None, _notify

        oid, err, notify = await _reverse()
        if err:
            return {'ok': False, 'error': err}

        # Telegram — tranzaksiyadan KEYIN (H4 qoidasi)
        def _send():
            from client_erp.services.notifications import notify_profit_reversed
            for _u, _amt, _title, _note in notify:
                try:
                    notify_profit_reversed(_u, _amt, _title, _note)
                except Exception:                                 # noqa: BLE001
                    logger.warning("[profit_reverse] Telegram yuborilmadi", exc_info=True)
        await database_sync_to_async(_send)()

        await self._broadcast_order(oid, 'profit.reversed', {'order_id': oid})
        return {'ok': True}

    async def handle_team_report(self, data):
        @database_sync_to_async
        def _report():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientOrder, ClientFinanceRecord
            from client_erp.models.team import ClientOrderProfitShare
            from django.db.models import Sum

            period = data.get('period', 'all')
            order_qs = ClientOrder.objects.filter(
                owner=self.user,
            ).exclude(status='cancelled')

            if period == 'month':
                from django.utils import timezone
                now = timezone.localdate()
                order_qs = order_qs.filter(created_at__year=now.year, created_at__month=now.month)
            elif period == 'year':
                from django.utils import timezone
                now = timezone.localdate()
                order_qs = order_qs.filter(created_at__year=now.year)

            orders = order_qs
            member_data = {}
            orders_with_shares = 0
            incomplete_orders = []

            for o in orders:
                shares = ClientOrderProfitShare.objects.filter(order_id=o.id).order_by('sort_order')
                if not shares.exists():
                    continue
                orders_with_shares += 1
                total_pct = sum(float(s.percent) for s in shares)
                if abs(total_pct - 100) > 0.5:
                    incomplete_orders.append(f"{o.title} ({total_pct}%)")

                income = float(o.finance_records.filter(
                    record_type='income', is_deleted=False,
                ).aggregate(s=Sum('amount'))['s'] or 0)
                expense = float(o.finance_records.filter(
                    record_type='expense', is_deleted=False,
                ).aggregate(s=Sum('amount'))['s'] or 0)
                profit = income - expense

                for s in shares:
                    name = s.name
                    pct = float(s.percent)
                    amt = profit * pct / 100
                    if name not in member_data:
                        member_data[name] = {'percent': pct, 'calculated': 0, 'orders': set()}
                    member_data[name]['calculated'] += amt
                    member_data[name]['orders'].add(o.id)

            wd_qs = ClientFinanceRecord.objects.filter(
                owner=self.user, record_type='withdrawal', is_deleted=False,
            )
            if period == 'month':
                wd_qs = wd_qs.filter(date__year=now.year, date__month=now.month)
            elif period == 'year':
                wd_qs = wd_qs.filter(date__year=now.year)
            withdrawn_by_name = {}
            for w in wd_qs:
                name = w.recipient_name or ''
                withdrawn_by_name[name] = withdrawn_by_name.get(name, 0) + float(w.amount)

            members = []
            total_profit = 0
            for name, md in member_data.items():
                members.append({
                    'name': name,
                    'percent': md['percent'],
                    'orders_count': len(md['orders']),
                    'calculated': round(md['calculated']),
                    'withdrawn': round(withdrawn_by_name.get(name, 0)),
                })
                total_profit += md['calculated']
            members.sort(key=lambda x: -x['calculated'])

            total_withdrawn = sum(float(v) for v in withdrawn_by_name.values())

            return {
                'total_orders': orders_with_shares,
                'total_profit': round(total_profit),
                'total_withdrawn': round(total_withdrawn),
                'members': members,
                'incomplete_orders': incomplete_orders,
            }

        result = await _report()
        return {'ok': True, 'data': result}

    # ═══════════════════════════════════════════════════════════
    #  USTALAR FOYDASI (kanonik ism + drill-down) — faqat O'QISH
    # ═══════════════════════════════════════════════════════════

    @staticmethod
    def _pf_norm(raw):
        """Ismni normalizatsiya: lower, probel siqish, apostrof birxil."""
        import re
        s = (raw or '').strip().lower()
        for ch in ('ʻ', '`', 'ʼ', '’', '‘'):
            s = s.replace(ch, "'")
        return re.sub(r'\s+', ' ', s).strip()

    @classmethod
    def _pf_base(cls, raw):
        """Asosiy token: honorific (aka/opa...) olib tashlanadi, birinchi so'z."""
        s = cls._pf_norm(raw)
        for suf in (' aka', ' opa', ' aya', ' ota', ' xola', ' ака', ' опа'):
            if s.endswith(suf):
                s = s[:-len(suf)].strip()
                break
        parts = s.split(' ')
        return parts[0] if parts else s

    @staticmethod
    def _pf_lev(a, b):
        """Levenshtein masofasi (typo aniqlash uchun)."""
        if a == b:
            return 0
        la, lb = len(a), len(b)
        if not la:
            return lb
        if not lb:
            return la
        prev = list(range(lb + 1))
        for i, ca in enumerate(a, 1):
            cur = [i]
            for j, cb in enumerate(b, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if ca == cb else 1)))
            prev = cur
        return prev[lb]

    @classmethod
    def _pf_cluster(cls, raw_names):
        """Raw ismlarni kanonik klasterlarga birlashtirish.
        raw_names: [str,...] (takrorlar bilan). Qaytadi: (raw->cid dict, cid->display dict)."""
        from collections import Counter
        freq = Counter([(r or '').strip() for r in raw_names])
        # Distinct raw'larni klasterlash (bo'sh alohida)
        clusters = []  # [{'base':str,'raws':set}]
        for raw in freq:
            base = cls._pf_base(raw)
            if base == '':
                # bo'sh ism — alohida "Taqsimlanmagan" klaster
                target = next((c for c in clusters if c['base'] == ''), None)
                if target is None:
                    target = {'base': '', 'raws': set()}
                    clusters.append(target)
                target['raws'].add(raw)
                continue
            found = None
            for c in clusters:
                ck = c['base']
                if not ck:
                    continue
                # QATTIQ moslik (2026-07-24): turli ismlar birlashib ketmasin
                # (avval Levenshtein<=2 edi → "Azizbek"/"Asilbek" (2 farq) noto'g'ri
                # birlashardi). Endi: aynan bir xil, YOKI prefiks (ikkalasi >=4 harf,
                # masalan "Rustam"/"Rustamjon"), YOKI 1 harf typo (ikkalasi >=5 harf,
                # masalan "Ibrohim"/"Ibroxim").
                if (base == ck
                        or (len(base) >= 4 and len(ck) >= 4
                            and (ck.startswith(base) or base.startswith(ck)))
                        or (min(len(base), len(ck)) >= 5 and cls._pf_lev(base, ck) <= 1)):
                    found = c
                    break
            if found is None:
                found = {'base': base, 'raws': set()}
                clusters.append(found)
            found['raws'].add(raw)
        # Har klasterga display + cid
        raw_to_cid, cid_display = {}, {}
        for cid, c in enumerate(clusters):
            if c['base'] == '':
                disp = 'Taqsimlanmagan'
            else:
                # eng ko'p uchragan variant; teng bo'lsa — eng uzun
                disp = max(c['raws'], key=lambda r: (freq[r], len(r))).strip()
                if disp and disp == disp.lower():
                    disp = disp[:1].upper() + disp[1:]
            cid_display[cid] = disp
            for r in c['raws']:
                raw_to_cid[r] = cid
        return raw_to_cid, cid_display

    def _pf_lifetime_totals(self, shared_ids):
        """BUTUN DAVR bo'yicha har ustaning ishlab topgani va kassadan olgani.

        Nega kerak (2026-07-31 TUZATISH): «ortiqcha olgan / berilishi kerak»
        ilgari DAVR ichida solishtirilardi — iyul foydasi ↔ iyulda olingan pul.
        Lekin pul JAMG'ARMA: usta iyulda iyunda topshirilgan zakaz uchun ham
        pul oladi, avans ham oladi. Natijada soxta qizil chiqardi
        (Oybek aka: −18 696 904 ko'rsatardi, haqiqiy qarzi −3 124 304).
        Endi qoldiq FAQAT butun tarix bo'yicha: jami ishlab topdi − jami oldi.

        Qaytaradi: (raw_to_cid, calc_by_cid, wd_by_cid, wd_unmatched_by_base)
        MOLIYAGA TEGMAYDI — faqat o'qish, kassa/kirim/chiqim chetda.
        """
        from collections import defaultdict
        from django.db.models import Q, Sum
        from client_erp.models import ClientOrder, ClientFinanceRecord
        from client_erp.models.team import ClientOrderProfitShare

        scope_q = Q(owner=self.user)
        if shared_ids:
            scope_q = scope_q | Q(pk__in=shared_ids)
        _orders = list(ClientOrder.objects.filter(
            scope_q, status__in=['delivered', 'ready'], is_deleted=False,
        ).select_related('owner'))
        oids = [o.id for o in _orders]

        profit = defaultdict(float)
        if oids:
            for r in ClientFinanceRecord.objects.filter(
                order_id__in=oids, is_deleted=False,
                record_type__in=['income', 'expense'],
            ).values('order_id', 'record_type').annotate(s=Sum('amount')):
                amt = float(r['s'] or 0)
                profit[r['order_id']] += amt if r['record_type'] == 'income' else -amt

        # SHARTNOMA-ASOSLI (2026-08-03): `handle_team_profit_detail` bilan AYNAN
        # bir xil formula bo'lishi SHART. Aks holda panelda «Topdi 5M, Oldi 3M,
        # Qoldiq −1.2M» kabi matematik mumkin bo'lmagan qatorlar chiqadi
        # (audit: TZ §0.3-K3 — davr hisobi yangi, umumiy hisob eski bo'lib qolardi).
        for _o in _orders:
            if _o.uses_contract_profit:
                profit[_o.id] = float(_o.contract_profit or 0)

        shares = list(ClientOrderProfitShare.objects.filter(order_id__in=oids)) if oids else []
        raw_to_cid, _disp = self._pf_cluster([s.name for s in shares])

        calc = defaultdict(float)
        for s in shares:
            nm = (s.name or '').strip()
            cid = raw_to_cid.get(nm) if nm else None
            if cid is None:
                continue
            calc[cid] += profit.get(s.order_id, 0.0) * float(s.percent or 0) / 100.0

        wd, wd_unmatched = defaultdict(float), defaultdict(float)
        for w in ClientFinanceRecord.objects.filter(
                owner=self.user, record_type='withdrawal', is_deleted=False):
            rn = (w.recipient_name or '').strip()
            cid = self._pf_match_cid(rn, raw_to_cid)
            if cid is not None:
                wd[cid] += float(w.amount or 0)
            else:
                wd_unmatched[self._pf_base(rn)] += float(w.amount or 0)
        return raw_to_cid, calc, wd, wd_unmatched

    @classmethod
    def _pf_match_cid(cls, raw, raw_to_cid):
        """Oluvchi ismini klasterga bog'lash — `_pf_cluster` bilan BIR XIL qoida
        (aynan baza · prefiks ≥4h · 1-typo ≥5h). Topilmasa None."""
        raw = (raw or '').strip()
        if not raw:
            return None
        if raw in raw_to_cid:
            return raw_to_cid[raw]
        wbase = cls._pf_base(raw)
        if not wbase:
            return None
        for c_raw, c_cid in raw_to_cid.items():
            cbase = cls._pf_base(c_raw)
            if not cbase:
                continue
            if (cbase == wbase
                    or (min(len(wbase), len(cbase)) >= 4
                        and (wbase.startswith(cbase) or cbase.startswith(wbase)))
                    or (min(len(wbase), len(cbase)) >= 5
                        and cls._pf_lev(wbase, cbase) <= 1)):
                return c_cid
        return None

    async def handle_team_profit_detail(self, data):
        @database_sync_to_async
        def _detail():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from collections import Counter, defaultdict
            from django.db.models import Sum
            from client_erp.models import ClientOrder, ClientFinanceRecord
            from client_erp.models.team import ClientOrderProfitShare
            from client_erp.services.periods import get_period_bounds

            # Sahifa tepasidagi davr filtri bilan BIR XIL hisoblagich (Finance
            # kartalari bilan mos kelishi uchun — period/ym/date_from/date_to).
            start, end, _, _ = get_period_bounds(
                data.get('period', 'month'), data.get('date_from'), data.get('date_to'), data.get('ym'),
            )

            # ── Foyda FAQAT topshirilgan (delivered/ready) zakazdan (2026-07-24) ──
            # Avval barcha status (in-progress ham) olinardi → tugamagan zakazning
            # oldindan olingan puli (prepayment) foydani shishirardi. Endi faqat
            # yakunlangan zakaz foydaga kiradi (Sof foyda tamoyili bilan bir xil).
            #
            # 2026-07-25 TUZATISH — davr sanasi `created_at` edi, ya'ni zakaz
            # OCHILGAN oyga tushardi; "Sof foyda" esa `delivered_at` (TOPSHIRILGAN)
            # bo'yicha ishlaydi (serializers.py:838). Natijada iyunda ochilib iyulda
            # topshirilgan zakaz ustaning FOYDASIGA kirmasdi, lekin o'sha zakaz uchun
            # olgan puli "olindi"ga kirardi → qoldiq asossiz manfiy chiqardi.
            # Endi `delivered_at` bo'yicha; u bo'sh bo'lsa (hali topshirilmagan
            # `ready` zakazlar — 13 tadan 12 tasi) `created_at` ga tushamiz, aks
            # holda ular hisobdan butunlay yo'qolardi.
            # `is_deleted=False` ham qo'shildi — o'chirilgan zakaz (3 ta bor edi)
            # foydaga kirmasligi kerak (Sof foyda ham shunday filtrlaydi).
            from django.db.models.functions import Coalesce
            # ── O'Z zakazlari + UNGA ULASHILGANLAR (TZ-Ulashilgan-Zakaz-Hisobot.md) ──
            # 2026-07-31: ilgari faqat `owner=self.user` edi — boshqa akkaunt
            # ulashgan zakazdagi ulush BUTUNLAY ko'rinmasdi (zakaz #178:
            # Oybek 1 637 650 yo'qolardi). Endi ulashilganlar ham qo'shiladi.
            # DIQQAT: bu FAQAT foyda/ulush paneli — kassa va balansga TEGMAYDI
            # (ulashilgan zakaz puli boshqa odamning kassasida).
            from django.db.models import Q
            from client_erp.services.scope import shared_order_ids, shared_visibility_map
            _shared_ids = shared_order_ids(self.user)
            _vis_map = shared_visibility_map(self.user)
            _scope_q = Q(owner=self.user)
            if _shared_ids:
                _scope_q = _scope_q | Q(pk__in=_shared_ids)
            orders_qs = ClientOrder.objects.filter(
                _scope_q, status__in=['delivered', 'ready'], is_deleted=False)
            if start:
                orders_qs = orders_qs.annotate(
                    _pf_date=Coalesce('delivered_at', 'created_at'),
                ).filter(_pf_date__date__gte=start, _pf_date__date__lte=end)
            orders = list(orders_qs.select_related('customer'))
            oid_list = [o.id for o in orders]
            order_by_id = {o.id: o for o in orders}

            # ── Har zakaz foydasi — bitta bulk so'rov ──
            # Bazaviy hisob: income − expense (eski usul, bulk — tez).
            profit_by_order = {oid: 0.0 for oid in oid_list}
            if oid_list:
                for r in ClientFinanceRecord.objects.filter(
                    order_id__in=oid_list, is_deleted=False,
                    record_type__in=['income', 'expense'],
                ).values('order_id', 'record_type').annotate(s=Sum('amount')):
                    amt = float(r['s'] or 0)
                    profit_by_order[r['order_id']] += amt if r['record_type'] == 'income' else -amt

            # ── SHARTNOMA-ASOSLI FOYDA (2026-08-03) ──────────────────────────
            # FINANCE_V2 sinovidagi egalarda foyda `contract_profit` bo'yicha
            # qayta hisoblanadi (shartnoma − xarajat). Shu tufayli "Ustalar
            # foydasi" paneli Moliya sahifasidagi "Sof foyda" bilan AYNAN mos
            # keladi — audit topgan asosiy ziddiyat (TZ §0.3-K3) shu yerda edi.
            # Shartnomasi yo'q eski zakazlar avtomatik eski hisobda qoladi
            # (`contract_profit` ichidagi grandfathering).
            for _o in orders:
                if _o.uses_contract_profit:
                    profit_by_order[_o.id] = float(_o.contract_profit or 0)

            # ── Foyda ulushlari (shu zakazlar bo'yicha) ──
            all_shares = list(ClientOrderProfitShare.objects.filter(order_id__in=oid_list).select_related('user')) if oid_list else []
            shares_by_order = defaultdict(list)
            for s in all_shares:
                shares_by_order[s.order_id].append(s)

            # ── Kanonik klaster (faqat nom bor bo'lganlar person bo'ladi) ──
            raw_to_cid, cid_display = self._pf_cluster([s.name for s in all_shares])

            people = {}  # cid -> accumulator
            for s in all_shares:
                nm = (s.name or '').strip()
                if not nm:
                    continue  # bo'sh nom → taqsimlanmagan (person emas)
                cid = raw_to_cid.get(nm)
                if cid is None:
                    continue
                p = people.setdefault(cid, {
                    'name': cid_display[cid], 'percents': [],
                    'calculated': 0.0, 'orders': [],
                    # H1 to'liq (2026-08-04): kontaktga bog'langanmi.
                    # Eski, erkin-matn yozuvlar UI'da ⚠️ bilan ajratiladi —
                    # ular real akkauntga tegishli emas, pul avtomatik
                    # o'tkazilmaydi (TZ-Kontakt-Asosli-Foyda-Taqsimoti.md §4.3).
                    'user_id': None, 'label': None,
                })
                if getattr(s, 'user_id', None) and not p['user_id']:
                    p['user_id'] = s.user_id
                    try:
                        from client_erp.serializers import contact_label as _clbl
                        p['label'] = _clbl(s.user)
                    except Exception:                             # noqa: BLE001
                        p['label'] = None
                o = order_by_id.get(s.order_id)
                if not o:
                    continue
                profit = profit_by_order.get(o.id, 0.0)
                pct = float(s.percent or 0)
                amt = profit * pct / 100.0
                p['percents'].append(pct)
                p['calculated'] += amt
                # Ulashilgan zakaz — `finance_hidden` bo'lsa zakaz foydasi
                # KO'RSATILMAYDI (faqat o'z ulushi). TZ §3.4.
                _is_shared = o.id in _shared_ids
                _hidden = _is_shared and _vis_map.get(o.id) == 'finance_hidden'
                p['orders'].append({
                    'order_id': o.id,
                    'title': o.title or '—',
                    'client_name': (o.customer.full_name if o.customer else '') or o.title or '—',
                    'order_profit': None if _hidden else round(profit),
                    'percent': pct,
                    'amount': round(amt),
                    'date': o.created_at.date().isoformat() if o.created_at else '',
                    'status': o.status,
                    'is_shared': _is_shared,      # frontend «ulashilgan» belgisi
                })

            # ── Olindi (withdrawal) — kanonik nom bo'yicha ──
            wd_qs = ClientFinanceRecord.objects.filter(
                owner=self.user, record_type='withdrawal', is_deleted=False,
            )
            if start:
                wd_qs = wd_qs.filter(date__gte=start, date__lte=end)
            withdrawn_by_cid = {}
            # Ulushi bo'lmagan (klasterga tushmagan) ustaning yechgan puli — yashirin
            # qolmasin (2026-07-24: Nursulton 19.8M "yo'qolardi", jami olindi noto'g'ri edi).
            unmatched_wd = {}   # recipient_name -> summa
            for w in wd_qs:
                rn = (w.recipient_name or '').strip()
                # 2026-07-30: aynan baza tenglashuvi yetarli emas edi — oluvchi
                # ismida bitta harf tushib qolsa («Gnisher» ← «Ganisher», 86 000)
                # pul ustaga tushmay, alohida "arvoh usta" qatori bo'lib chiqardi.
                # `_pf_match_cid` — `_pf_cluster` bilan BIR XIL bag'rikenglik.
                cid = self._pf_match_cid(rn, raw_to_cid)
                if cid is not None:
                    withdrawn_by_cid[cid] = withdrawn_by_cid.get(cid, 0.0) + float(w.amount or 0)
                else:
                    key = rn or 'Nomsiz'
                    unmatched_wd[key] = unmatched_wd.get(key, 0.0) + float(w.amount or 0)

            # ── ARXIVLANGAN ustalar (ishdan bo'shaganlar) ko'rsatilmaydi ──
            # `ClientProfitPerson.is_active=False` — TZ-Ustalar-Dinamik.md §2.1.
            # Ro'yxatda UMUMAN yo'q odam ko'rinaveradi (tarixiy ma'lumot
            # yo'qolmasin); faqat ATAYLAB arxivlangan yashiriladi.
            # Ulush/pul yozuvlari TEGILMAYDI — bu faqat ko'rsatish filtri.
            from client_erp.models.team import ClientProfitPerson
            archived = {
                (n or '').strip().lower()
                for n in ClientProfitPerson.objects.filter(
                    owner=self.user, is_active=False).values_list('name', flat=True)
            }

            def _is_archived(nm):
                raw = (nm or '').strip().lower()
                if not raw:
                    return False
                if raw in archived:
                    return True
                # Yozilish variantlari (Nrsulton / nursulton / «Nursulton ») —
                # `_pf_cluster` bilan BIR XIL qoida: aynan baza, prefiks (≥4h)
                # yoki 1-typo (≥5h). Aks holda Asilbek/Azizbek kabi turli
                # odamlar noto'g'ri birlashib ketardi (F1 bugi, 2026-07-24).
                b = self._pf_base(raw)
                if not b:
                    return False
                for a in archived:
                    ab = self._pf_base(a)
                    if not ab:
                        continue
                    if ab == b:
                        return True
                    if (min(len(b), len(ab)) >= 4
                            and (b.startswith(ab) or ab.startswith(b))):
                        return True
                    if min(len(b), len(ab)) >= 5 and self._pf_lev(b, ab) <= 1:
                        return True
                return False

            # Arxivlangan ustaning ESKI ulushi ekranda ko'rinmaydi — lekin pul
            # yo'qolib qolmasin: jamini alohida qaytaramiz, panelda ismsiz
            # "Arxivlangan ustalar ulushi" qatori bo'lib chiqadi. Aks holda
            # ko'rinadigan qatorlar + taqsimlanmagan ≠ zakaz foydasi bo'lardi
            # (iyun: 8 568 750 jimgina yo'qolardi).
            archived_hidden = 0.0
            archived_withdrawn = 0.0

            # ── UMUMIY (butun tarix) qoldiq — «ortiqcha olgan» faqat shundan ──
            # Davr filtri bor bo'lsa ikkinchi, filtrsiz o'tish qilinadi; davr
            # allaqachon "butun tarix" bo'lsa qo'shimcha so'rov shart emas.
            if start:
                _lt_r2c, _lt_calc, _lt_wd, _lt_unwd = self._pf_lifetime_totals(_shared_ids)
                raws_by_cid = defaultdict(set)
                for _r, _c in raw_to_cid.items():
                    raws_by_cid[_c].add(_r)
            else:
                _lt_r2c = None

            def _lifetime(cid, name, period_calc, period_wd):
                """(umumiy_topdi, umumiy_oldi) — davr filtri bo'lmasa davrniki."""
                if _lt_r2c is None:
                    return period_calc, period_wd
                lt_cid = None
                for _r in raws_by_cid.get(cid, ()):
                    if _r in _lt_r2c:
                        lt_cid = _lt_r2c[_r]
                        break
                if lt_cid is None:
                    lt_cid = self._pf_match_cid(name, _lt_r2c)
                if lt_cid is None:
                    return period_calc, _lt_unwd.get(self._pf_base(name), period_wd)
                return _lt_calc.get(lt_cid, 0.0), _lt_wd.get(lt_cid, 0.0)

            result = []
            for cid, p in people.items():
                if _is_archived(p['name']):
                    archived_hidden += p['calculated']
                    archived_withdrawn += withdrawn_by_cid.get(cid, 0.0)
                    continue
                percents = p['percents']
                mode_pct = Counter(percents).most_common(1)[0][0] if percents else 0
                p['orders'].sort(key=lambda x: -x['amount'])
                wdn = withdrawn_by_cid.get(cid, 0.0)
                lt_c, lt_w = _lifetime(cid, p['name'], p['calculated'], wdn)
                result.append({
                    'name': p['name'],
                    # Kontaktga bog'langan bo'lsa «Ism · ...1234», aks holda
                    # eski erkin matn (UI ⚠️ ko'rsatadi).
                    'label': p.get('label') or p['name'],
                    'user_id': p.get('user_id'),
                    'is_linked': bool(p.get('user_id')),
                    'percent': mode_pct,
                    'orders_count': len(p['orders']),
                    'calculated': round(p['calculated']),
                    'withdrawn': round(wdn),
                    # `remaining` — UMUMIY qoldiq (butun tarix), davrniki EMAS.
                    'remaining': round(lt_c - lt_w),
                    'lt_calculated': round(lt_c),
                    'lt_withdrawn': round(lt_w),
                    'period_remaining': round(p['calculated'] - wdn),
                    'orders': p['orders'],
                })
            result.sort(key=lambda x: -x['calculated'])
            # Biriktirilmagan olindi — ulushi yo'q, lekin pul yechgan ustalar (oxirida)
            for rn, amt in sorted(unmatched_wd.items(), key=lambda x: -x[1]):
                if _is_archived(rn):
                    archived_withdrawn += amt   # ko'rsatilmaydi, lekin jamda qoladi
                    continue
                lt_c, lt_w = _lifetime(None, rn, 0.0, amt)
                result.append({
                    'name': rn,
                    'label': rn,
                    'user_id': None,
                    'is_linked': False,
                    'percent': 0,
                    'orders_count': 0,
                    'calculated': 0,
                    'withdrawn': round(amt),
                    'remaining': round(lt_c - lt_w),
                    'lt_calculated': round(lt_c),
                    'lt_withdrawn': round(lt_w),
                    'period_remaining': round(-amt),
                    'orders': [],
                    'unassigned_worker': True,   # ulush biriktirilmagan (frontend belgisi)
                })
            people_names = [r['name'] for r in result]

            # ── TAQSIMLANMAGAN zakazlar (foyda>0, nomli ulush 100% emas) ──
            # (2026-08-12 TUZATISH) Moliya sahifasidagi "Foyda taqsimlanmagan"
            # eslatma-kartasi (`_undistributed_hint`, serializers.py) HAR DOIM
            # BARCHA VAQT hisoblaydi va shu bo'limga link beradi. Yuqoridagi
            # `orders`/`profit_by_order` esa TANLANGAN davrga cheklangan
            # (Ustalar-daromadi bo'limi uchun ataylab shunday, F3 tuzatishi —
            # tegilmaydi). Ikkalasi bitta ro'yxatdan foydalansa, kartada
            # ko'rsatilgan eski (masalan may/iyun) zakazlar bu ro'yxatda
            # umuman ko'rinmasdi — foydalanuvchi buni aynan shu sabab bilan
            # xato deb topdi (karta 12ta/20 227 000 deydi, ro'yxat boshqacha
            # edi). Shuning uchun bu bo'lim uchun ALOHIDA, davr-mustaqil
            # so'rov — `_undistributed_hint` bilan bir xil manba
            # (`contract_profit`, yagona-manba property) ishlatiladi.
            _finished = {'delivered', 'ready'}
            _undist_qs = ClientOrder.objects.filter(
                owner=self.user, status__in=['delivered', 'ready'], is_deleted=False,
            ).select_related('customer').prefetch_related('profit_shares')
            undistributed = []
            total_undistributed = 0.0
            for o in _undist_qs:
                profit = float(o.contract_profit or 0)
                if profit <= 0:
                    continue  # zarar yoki 0 — taqsimlanmaydi
                oshares = list(o.profit_shares.all())
                assigned = sum(float(s.percent or 0) for s in oshares if (s.name or '').strip())
                unassigned_pct = 100.0 - assigned
                if unassigned_pct <= 0.5:
                    continue  # to'liq taqsimlangan
                un_amt = profit * unassigned_pct / 100.0
                total_undistributed += un_amt
                undistributed.append({
                    'order_id': o.id,
                    'title': o.title or '—',
                    'client_name': (o.customer.full_name if o.customer else '') or o.title or '—',
                    'profit': round(profit),
                    'unassigned_pct': round(unassigned_pct, 1),
                    'unassigned_amount': round(un_amt),
                    'status': o.status,
                    'has_shares': bool(oshares),
                    'shares': [{'name': (s.name or ''), 'percent': float(s.percent or 0)}
                               for s in sorted(oshares, key=lambda x: x.sort_order)],
                    'date': o.created_at.date().isoformat() if o.created_at else '',
                })
            undistributed.sort(key=lambda x: (0 if x['status'] in _finished else 1, -x['unassigned_amount']))

            return {
                'people': result,
                'people_names': people_names,
                'total_calculated': round(sum(r['calculated'] for r in result)),
                'total_withdrawn': round(sum(r['withdrawn'] for r in result)),
                'total_profit': round(sum(r['calculated'] for r in result)),
                'undistributed': undistributed,
                'undistributed_count': len(undistributed),
                'total_undistributed': round(total_undistributed),
                # Arxivlangan (ishdan bo'shagan) ustalarning eski ulushi/olgani —
                # ismsiz jami. Panelda ko'rsatiladi, aks holda raqamlar jamlanmaydi.
                'archived_hidden': round(archived_hidden),
                'archived_withdrawn': round(archived_withdrawn),
                'period': data.get('period', 'month'),
            }

        return {'ok': True, 'data': await _detail()}

    # ═══════════════════════════════════════════════════════════
    #  USTALAR RO'YXATI (ClientProfitPerson) — to'liq dinamik
    #  TZ: TZ-Ustalar-Dinamik.md
    #  MOLIYAGA TEGMAYDI — faqat ism ro'yxati (kassa/kirim/chiqim chetda).
    # ═══════════════════════════════════════════════════════════

    def _pp_ctx(self):
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = self.scope.get('db_alias', 'default')
        _thread_local.tenant = self.scope.get('tenant')

    async def handle_profit_people_list(self, data):
        """Usta ro'yxati. `all=True` — arxivlanganlar ham."""
        @database_sync_to_async
        def _list():
            self._pp_ctx()
            from client_erp.models.team import ClientProfitPerson
            qs = ClientProfitPerson.objects.filter(owner=self.user)
            if not data.get('all'):
                qs = qs.filter(is_active=True)
            return [{'id': p.id, 'name': p.name, 'is_active': p.is_active,
                     'sort_order': p.sort_order} for p in qs]
        return {'ok': True, 'people': await _list()}

    async def handle_profit_people_add(self, data):
        """Yangi usta qo'shish. Bir xil ism bo'lsa — arxivdan tiklaydi."""
        @database_sync_to_async
        def _add():
            self._pp_ctx()
            from django.db.models import Max
            from client_erp.models.team import ClientProfitPerson
            name = (data.get('name') or '').strip()[:100]
            if not name:
                return None, 'Usta ismini kiriting'
            obj = ClientProfitPerson.objects.filter(owner=self.user, name__iexact=name).first()
            if obj:
                if obj.is_active:
                    return None, f'«{name}» allaqachon ro\'yxatda'
                obj.is_active = True          # arxivdan tiklash
                obj.save(update_fields=['is_active'])
            else:
                nxt = (ClientProfitPerson.objects.filter(owner=self.user)
                       .aggregate(m=Max('sort_order'))['m'] or 0) + 10
                obj = ClientProfitPerson.objects.create(
                    owner=self.user, name=name, sort_order=nxt)
            return {'id': obj.id, 'name': obj.name, 'is_active': obj.is_active,
                    'sort_order': obj.sort_order}, None
        obj, err = await _add()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'person': obj}

    async def handle_profit_people_update(self, data):
        """Usta ismini o'zgartirish (eski ulushlardagi nom TEGILMAYDI)."""
        @database_sync_to_async
        def _upd():
            self._pp_ctx()
            from client_erp.models.team import ClientProfitPerson
            name = (data.get('name') or '').strip()[:100]
            if not name:
                return None, 'Usta ismini kiriting'
            obj = ClientProfitPerson.objects.filter(
                owner=self.user, pk=data.get('id')).first()
            if not obj:
                return None, 'Usta topilmadi'
            obj.name = name
            obj.save(update_fields=['name'])
            return {'id': obj.id, 'name': obj.name, 'is_active': obj.is_active}, None
        obj, err = await _upd()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'person': obj}

    async def handle_profit_people_archive(self, data):
        """Ro'yxatdan olib tashlash (arxiv) — hisobotda ham ko'rinmaydi.

        Eski ulushlar (ClientOrderProfitShare) va pul yozuvlari TEGILMAYDI —
        faqat ko'rsatishdan yashiriladi."""
        @database_sync_to_async
        def _arch():
            self._pp_ctx()
            from client_erp.models.team import ClientProfitPerson
            obj = ClientProfitPerson.objects.filter(
                owner=self.user, pk=data.get('id')).first()
            if not obj:
                return 'Usta topilmadi'
            obj.is_active = bool(data.get('restore', False))   # restore=True → tiklash
            obj.save(update_fields=['is_active'])
            return None
        err = await _arch()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_profit_people_delete(self, data):
        """Butunlay o'chirish. Ismi ulushlarda ishlatilgan bo'lsa — arxivga."""
        @database_sync_to_async
        def _del():
            self._pp_ctx()
            from client_erp.models.team import ClientProfitPerson, ClientOrderProfitShare
            obj = ClientProfitPerson.objects.filter(
                owner=self.user, pk=data.get('id')).first()
            if not obj:
                return None, 'Usta topilmadi'
            used = ClientOrderProfitShare.objects.filter(
                order__owner=self.user, name__iexact=obj.name).exists()
            if used:
                obj.is_active = False
                obj.save(update_fields=['is_active'])
                return 'archived', None
            obj.delete()
            return 'deleted', None
        mode, err = await _del()
        if err:
            return {'ok': False, 'error': err}
        return {'ok': True, 'mode': mode}

    # ═══════════════════════════════════════════════════════════
    #  ORDER SHARE HANDLERS
    # ═══════════════════════════════════════════════════════════

    async def handle_order_share(self, data):
        @database_sync_to_async
        def _share():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientOrder
            from client_erp.models.team import ClientTeam, ClientOrderShare
            order = ClientOrder.objects.get(pk=data.get('order_id'), owner=self.user)
            team = ClientTeam.objects.filter(owner=self.user).first()
            if not team:
                from client_erp.models.team import ClientTeamMember
                membership = ClientTeamMember.objects.filter(user=self.user, status='active').select_related('team').first()
                team = membership.team if membership else None
            if not team:
                return 'Avval jamoa yarating yoki jamoaga qo\'shiling'
            ClientOrderShare.objects.update_or_create(
                order=order, team=team,
                defaults={
                    'shared_by': self.user,
                    'visibility': data.get('visibility', 'full'),
                    'can_edit': data.get('can_edit', False),
                    'can_complete': data.get('can_complete', True),
                    'can_add_expense': data.get('can_add_expense', False),
                },
            )
            from client_erp.services.notifications import notify_order_shared
            from client_erp.models.team import ClientTeamMember
            shared_by = self.user.full_name or self.user.username
            for m in ClientTeamMember.objects.filter(team=team, status='active').exclude(user=self.user).select_related('user'):
                notify_order_shared(m.user, order.title, shared_by)
            return None
        err = await _share()
        if err: return {'ok': False, 'error': err}
        return {'ok': True}

    async def handle_order_unshare(self, data):
        @database_sync_to_async
        def _unshare():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientOrder
            order = ClientOrder.objects.get(pk=data.get('order_id'), owner=self.user)
            # ── TZ-Moliya (2026-08-15) §F3: SHERIK CHIQARILSA — HAMMASI EGASIGA ──
            # Foyda ulushi ham, rasxod ulushi ham, undan kelib chiqqan qarz ham
            # olib tashlanadi. Mantiq YAGONA joyda (`services/partner_remove.py`)
            # — sinov ham aynan shu funksiyani chaqiradi.
            from client_erp.services.partner_remove import remove_partner_team
            return remove_partner_team(order, data.get('team_id'),
                                       actor=self.user,
                                       reason=(data.get('reason') or '').strip())
        info = await _unshare()
        return {'ok': True, 'data': info}

    # ═══════════════════════════════════════════════════════════
    #  PROFIT SHARE HANDLERS
    # ═══════════════════════════════════════════════════════════

    async def handle_notification_read(self, data):
        """Bildirishnomani «o'qildi» deb belgilash (yoki hammasini).

        WS: `notification.read` → {id} yoki {all: true}
        """
        nid = data.get('id')
        mark_all = bool(data.get('all'))

        @database_sync_to_async
        def _mark():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from client_erp.models import ClientNotification
            qs = ClientNotification.objects.filter(user=self.user, is_read=False)
            if not mark_all:
                if not nid:
                    return 0
                qs = qs.filter(pk=nid)
            return qs.update(is_read=True)

        n = await _mark()
        return {'ok': True, 'data': {'marked': n}}

    async def handle_profit_save(self, data):
        order_id = data.get('order_id')
        shares = data.get('shares', [])

        @database_sync_to_async
        def _save():
            from tenant_manager.middleware import _thread_local
            _thread_local.db_alias = self.scope.get('db_alias', 'default')
            _thread_local.tenant = self.scope.get('tenant')
            from django.db.models import Count, Sum
            from client_erp.models import ClientOrder
            from client_erp.models.team import ClientOrderProfitShare, ClientProfitWithdrawal

            order = ClientOrder.objects.get(pk=order_id, owner=self.user)

            # ── 2026-08-04→09-03: SHARTNOMASIZ TAQSIMLASH — endi OGOHLANTIRISH,
            # BLOKLAMAYDI ────────────────────────────────────────────────────
            # Ilgari bu yerda qat'iy xato qaytarilardi (foyda shartnoma
            # summasidan hisoblanadi, shartnomasiz noto'g'ri summa
            # taqsimlanib qolardi — buyurtma #327 misoli). 2026-09-03: «Yangi
            # buyurtma» formasida shartnoma summasi ixtiyoriy qilingandan
            # keyin, bu yer hali qat'iy bloklab qolgan edi — «Foyda
            # taqsimlash» oynasi esa YOPILMAYDIGAN (locked) bo'lgani uchun
            # foydalanuvchi hech qanday yo'l bilan davom eta olmasdi. Endi
            # xato o'rniga faqat ogohlantirish qo'shiladi (pastdagi _warning
            # bilan birlashtirilib, Toast.info sifatida ko'rsatiladi) —
            # taqsimot 0% asosida saqlanadi, shartnoma keyin kiritilsa foyda
            # o'zi to'g'ri qayta hisoblanadi.
            from client_erp.services.scope import contract_required as _need_c
            _no_contract_warning = None
            if _need_c(self.user) and float(order.contract_amount or 0) <= 0:
                _no_contract_warning = (
                    "Shartnoma summasi hali kiritilmagan — foyda 0 sifatida "
                    "saqlandi. Shartnomani keyin qo'shsangiz, foyda o'zi "
                    "to'g'ri qayta hisoblanadi."
                )

            # ── F9 (2026-08-03): FOIZ-O'ZGARTIRISH OGOHLANTIRISHI ────────────
            # Agar shu buyurtmadan avval pul yechilgan bo'lsa, foizni
            # o'zgartirish ESKI yozuvlarga TA'SIR QILMAYDI (append-only —
            # avvalgi ClientFinanceRecord/WithdrawalLine o'zgarmaydi). Buni
            # ochiq aytamiz — aks holda "nega eski summa o'zgarmadi" degan
            # tushunmovchilikka olib keladi (TZ §F9).
            _prior = ClientProfitWithdrawal.objects.filter(order=order).aggregate(
                n=Count('id'), s=Sum('total_profit'),
            )
            _warning = None
            if _prior['n']:
                _warning = (
                    f"Bu buyurtmadan avval {_prior['n']} marta pul yechilgan "
                    f"(jami {int(_prior['s'] or 0):,} so'm). Foizni o'zgartirish "
                    "faqat KEYINGI yechishlarga ta'sir qiladi, avvalgi yozuvlar "
                    "o'zgarmaydi."
                ).replace(',', ' ')

            # ── H1 to'liq (2026-08-04): KONTAKTGA BOG'LASH ───────────────────
            # `user_id` faqat SHU buyurtmada ruxsat etilgan kontaktlar ro'yxatidan
            # qabul qilinadi — mijoz ixtiyoriy id yuborib, begona akkauntga
            # ulush yozib qo'ymasin (TZ-Kontakt-Asosli-Foyda-Taqsimoti.md).
            # 2026-08-04: qidiruv qo'shilgach — jamoadan tashqaridagi
            # ro'yxatdan o'tgan foydalanuvchini ham tanlash mumkin (egasi
            # ongli ravishda qidirib topadi). Shuning uchun whitelist =
            # FAOL akkauntlar. Jamoadan tashqarisi bo'lsa LOG yoziladi.
            from client_erp.serializers import order_contacts as _contacts_fn
            from client_erp.models import ClientUser as _CU
            _team = {c['id'] for c in _contacts_fn(order)}
            _allowed = set(_CU.objects.filter(is_active=True).values_list('id', flat=True))
            _allowed.add(order.owner_id)          # egasi («Men» qatori)

            ClientOrderProfitShare.objects.filter(order=order).delete()
            _assigned = []          # [(user_id, percent)] — bildirishnoma uchun
            for i, s in enumerate(shares):
                _uid = s.get('user_id')
                try:
                    _uid = int(_uid) if _uid else None
                except (TypeError, ValueError):
                    _uid = None
                if _uid is not None and _uid not in _allowed:
                    logger.warning(
                        "[profit_save] faol bo'lmagan akkaunt id=%s (order=%s) — bog'lanmadi",
                        _uid, order.pk,
                    )
                    _uid = None
                elif _uid is not None and _uid not in _team and _uid != order.owner_id:
                    logger.info(
                        "[profit_save] jamoadan TASHQARI kontakt id=%s (order=%s, ega=%s)",
                        _uid, order.pk, self.user.username,
                    )
                ClientOrderProfitShare.objects.create(
                    order=order,
                    user_id=_uid,
                    name=s.get('name', ''),
                    percent=float(s.get('percent', 0)),
                    is_remainder=False,
                    sort_order=i,
                )
                # Bildirishnoma uchun yig'amiz (egasining o'zi bundan mustasno)
                if _uid and _uid != order.owner_id:
                    _assigned.append((_uid, float(s.get('percent', 0))))
            # ── ULUSH BELGILANGANDA BILDIRISHNOMA (2026-08-04) ──────────────
            # Foydalanuvchi so'rovi: ulush belgilangan zahoti a'zo ham, egasi
            # ham bilib tursin — pul yechilishini kutmasdan. Pul hali
            # o'tkazilmagani ANIQ yoziladi («hali yechilmagan»).
            _profit = float(order.contract_profit or 0)
            _notes = []
            for _uid, _pct in _assigned:
                _amt = _profit * _pct / 100.0
                _notes.append((_uid, _amt, _pct))
            _combined_warning = ' '.join(w for w in (_no_contract_warning, _warning) if w) or None
            return {'order_id': order.pk, 'warning': _combined_warning,
                    'assigned': _notes, 'order_title': order.title,
                    'profit': _profit}

        try:
            result = await _save()
            # Shartnoma yo'q (yoki boshqa taqiq) — broadcast qilinmaydi.
            if result.get('__err__'):
                return {'ok': False, 'error': result['__err__']}
            await self._broadcast_order(result['order_id'], 'profit.saved',
                                        {'order_id': result['order_id']})

            # Bildirishnomalar — DB yozuvidan KEYIN, alohida (pulni buzmasin)
            _assigned = result.get('assigned') or []
            if _assigned:
                @database_sync_to_async
                def _notify_assigned():
                    from client_erp.models import ClientUser
                    from client_erp.services.notifications import (
                        notify_share_assigned, notify_share_assigned_owner,
                    )
                    for _uid, _amt, _pct in _assigned:
                        try:
                            _u = ClientUser.objects.filter(pk=_uid).first()
                            if not _u:
                                continue
                            _oid = result['order_id']
                            notify_share_assigned(_u, _amt, _pct,
                                                  result['order_title'], _oid)
                            notify_share_assigned_owner(self.user, _u, _amt, _pct,
                                                        result['order_title'], _oid)
                        except Exception:                         # noqa: BLE001
                            logger.warning("[profit_save] xabar yuborilmadi", exc_info=True)
                await _notify_assigned()
            # ⚠️ 2026-08-04 BUG TUZATILDI: `_reply()`/`receive_json` faqat
            # `ok`/`data`/`error` kwarg qabul qiladi (`await self._reply(content,
            # **result)`) — `warning` kalitini to'g'ridan-to'g'ri qaytarish
            # `TypeError: _reply() got an unexpected keyword argument 'warning'`
            # bilan BUTUN so'rovni yiqitardi (F9 ishga tushgan kunning o'zida).
            # To'g'ri joyi — `data` ichida.
            return {'ok': True, 'data': {'warning': result.get('warning')}}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # ═══════════════════════════════════════════════════════════
    #  FINANCE HANDLERS
    # ═══════════════════════════════════════════════════════════

    # ── USTALAR QARZI (kreditor) — moliya TZ §F4, 2026-08-15 ──────────────
    # Mavjud moliya yozuvlariga TEGMAYDI: kassa/balans o'zgarmaydi, bu
    # faqat "kimga qancha qarzdorman" hisobi.
    async def handle_supplierdebt_create(self, data):
        from decimal import Decimal, InvalidOperation
        name = (data.get('creditor_name') or '').strip()[:150]
        ctype = data.get('creditor_type') if data.get('creditor_type') in (
            'dokon', 'ustanovchik', 'shaxs', 'boshqa') else 'dokon'
        try:
            amount = Decimal(str(data.get('amount') or 0))
        except (InvalidOperation, TypeError):
            amount = Decimal('0')
        if not name or amount <= 0:
            return {'ok': False, 'error': "Nom va summa kerak"}
        # «Nima uchun» — MAJBURIY (2026-08-15): keyin «bu qarz nimaga edi?»
        # degan savolga javob qolmasdi.
        if not (data.get('note') or '').strip():
            return {'ok': False, 'error': "Nima uchun qarz olinganini yozing"}

        @database_sync_to_async
        def _create():
            from client_erp.models import ClientSupplierDebt
            from django.utils import timezone as _tz
            _td = data.get('taken_date') or None
            d = ClientSupplierDebt.objects.create(
                owner=self.user, creditor_name=name, creditor_type=ctype,
                amount=amount, note=(data.get('note') or '')[:255],
                order_id=data.get('order_id') or None,
                taken_date=_td or _tz.localdate(),
            )
            return d.pk
        pk = await _create()
        return {'ok': True, 'id': pk}

    async def handle_supplierdebt_pay(self, data):
        from decimal import Decimal, InvalidOperation
        try:
            amount = Decimal(str(data.get('amount') or 0))
        except (InvalidOperation, TypeError):
            amount = Decimal('0')
        did = data.get('id')
        if not did or amount <= 0:
            return {'ok': False, 'error': "Summa kerak"}

        @database_sync_to_async
        def _pay():
            from client_erp.models import ClientSupplierDebt
            d = ClientSupplierDebt.objects.filter(pk=did, owner=self.user).first()
            if not d:
                return None
            d.paid = (d.paid or 0) + amount
            if d.paid >= d.amount:
                d.paid = d.amount
                d.is_closed = True
            d.save(update_fields=['paid', 'is_closed', 'updated_at'])
            return float(d.remaining)
        rem = await _pay()
        if rem is None:
            return {'ok': False, 'error': 'topilmadi'}
        return {'ok': True, 'remaining': rem}

    async def handle_supplierdebt_delete(self, data):
        did = data.get('id')

        @database_sync_to_async
        def _del():
            from client_erp.models import ClientSupplierDebt
            return ClientSupplierDebt.objects.filter(pk=did, owner=self.user).delete()[0]
        n = await _del()
        return {'ok': bool(n)}

    async def handle_finance_create(self, data):
        record_type = data.get('type', 'income')
        amount = data.get('amount', 0)
        description = data.get('description', '')
        payment_method = data.get('payment_method', 'cash')
        category = data.get('category', '')
        customer_id = data.get('customer_id')
        order_id = data.get('order_id')

        if not amount or float(amount) <= 0:
            return {'ok': False, 'error': 'Summa noto\'g\'ri'}

        @database_sync_to_async
        def _create():
            from client_erp.models import ClientFinanceRecord, ClientOrder
            from client_erp.serializers import serialize_transaction
            from django.utils import timezone

            # ── H8-b (2026-08-03): SHARTNOMA LIMITI TESHIGI ──────────────────
            # `handle_order_income` (buyurtma detalidagi «Kirim») shartnomadan
            # oshib ketishni bloklardi, LEKIN bu yo'l (Moliya sahifasidagi
            # «Kirim», order_id bilan) tekshirmasdi — shu teshik orqali 4 ta
            # zakazda kirim shartnomadan oshgan (TZ §0.2).
            # ⚠️ SCOPE (2026-08-03): faqat FINANCE_V2 sinov akkauntida. Boshqa
            # foydalanuvchilarda eski xatti-harakat qoladi — shartnomadan ortiq
            # to'lov ularning ish jarayonini to'sib qo'ymasin.
            from client_erp.services.scope import finance_v2 as _fin_v2
            if record_type == 'income' and order_id and _fin_v2(self.user):
                from django.db.models import Sum
                _o = ClientOrder.objects.filter(pk=order_id, owner=self.user).first()
                if _o:
                    # Shartnoma summasi yo'q — kirim umuman qabul qilinmaydi
                    # (2026-08-04 qarori; `handle_order_income` bilan bir xil).
                    # Bu yo'lda maxsus UI yo'q, shuning uchun matn to'liq.
                    from client_erp.services.scope import contract_required as _need_contract
                    if _need_contract(self.user) and float(_o.contract_amount or 0) <= 0:
                        return {'__err__': (
                            "Avval shartnoma summasini kiriting — buyurtmani ochib "
                            "«Moliya → Shartnoma» tugmasidan. Foyda shartnoma "
                            "summasidan hisoblanadi."
                        )}
                    # Limit — `handle_order_income` bilan bir xil mantiq:
                    # rad etmaymiz, so'raymiz (2026-08-08). `allow_extra=True`
                    # kelsa pul o'tadi va `extra_income` uni ajratib turadi.
                    _z = float(_o.zaklad_amount or 0)
                    if _z > 0 and not data.get('allow_extra'):
                        _ex = ClientFinanceRecord.objects.filter(
                            order_id=order_id, record_type='income', is_deleted=False,
                        ).aggregate(t=Sum('amount'))['t'] or 0
                        if float(_ex) + float(amount) > _z:
                            _qoldiq = max(0, _z - float(_ex))
                            return {'__over__': {
                                '__over_contract__': True,
                                'contract': _z, 'already': float(_ex),
                                'remaining': _qoldiq, 'amount': float(amount),
                                'extra': float(_ex) + float(amount) - _z,
                            }}

            # ── DUBLIKAT OLDINI OLISH (2026-08-07) ──────────────────────────
            # Sabab: 24 guruh takror yozuv topildi (123.8 mln). Ko'pi tugma
            # ikki marta bosilgani — orasi 0–60 soniya. Endi shu holatda
            # yozmaymiz, savol qaytaramiz; foydalanuvchi `confirm_dup=True`
            # yuborsa yoziladi. Bu 60 soniyalik oyna — real ketma-ket ikki
            # to'lovga xalaqit bermaydi (ular kamdan-kam 1 daqiqada tushadi).
            if not data.get('confirm_dup'):
                from datetime import timedelta
                _recent = ClientFinanceRecord.objects.filter(
                    owner=self.user, record_type=record_type, amount=amount,
                    is_deleted=False,
                    created_at__gte=timezone.now() - timedelta(seconds=60),
                )
                if order_id:
                    _recent = _recent.filter(order_id=order_id)
                _dup = _recent.order_by('-created_at').first()
                if _dup:
                    _sec = int((timezone.now() - _dup.created_at).total_seconds())
                    return {'__dup__': (
                        f"Xuddi shu summa ({float(amount):,.0f} so'm) {_sec} soniya "
                        f"oldin yozilgan"
                        + (f" — «{_dup.description}»" if _dup.description else "")
                        + ". Yana yozilsinmi?"
                    )}

            record = ClientFinanceRecord.objects.create(
                owner=self.user,
                record_type=record_type,
                amount=amount,
                description=description,
                payment_method=payment_method,
                category=category,
                customer_id=customer_id if customer_id else None,
                order_id=order_id if order_id else None,
                date=timezone.localdate(),
            )
            return serialize_transaction(record)

        result = await _create()
        if isinstance(result, dict) and result.get('__over__'):
            return {'ok': False, 'over_contract': result['__over__'],
                    'error': 'Shartnoma summasi to\'lib bo\'lgan'}
        if isinstance(result, dict) and result.get('__dup__'):
            # Bloklamaymiz — so'raymiz. Frontend `confirm_dup:true` bilan qayta yuboradi.
            return {'ok': False, 'dup_confirm': True, 'error': result['__dup__']}
        if isinstance(result, dict) and result.get('__err__'):
            return {'ok': False, 'error': result['__err__']}
        return {'ok': True, 'data': result}

    async def handle_ai_chat(self, data):
        """Matnli AI chat (2026-08-05, TZ-AI-Tushuntiruvchi-Tashxischi.md §6.4).

        Raqamlar AI'dan emas: `ai_chat.answer` kerakli tool'ni oldindan
        bajarib, natijani promptga «FAKTLAR» bo'lib qo'yadi.

        AMAL TAKLIFI (2026-09-11, TZ-AI-Chat-Amal-Bajarish): AI matnda
        amal-so'z (masalan «tugat») ko'rsa, javobda `action` maydoni
        qaytishi mumkin — bu HECH QACHON bu yerda bajarilmaydi, faqat
        frontendga (`rc-glive.js`) uzatiladi, u esa foydalanuvchidan
        tasdiq so'ragach `RcActions.run()` orqali bajaradi.
        `context` — frontend `RcActions.run('current_context')` natijasi
        (joriy sahifa/buyurtma/etaplar matni, ID'lar shundan olinadi).
        """
        q = (data.get('text') or '').strip()
        history = data.get('history') or []
        context = (data.get('context') or '')[:1500]
        if not q:
            return {'ok': False, 'error': 'Savol yozing'}

        @database_sync_to_async
        def _ask():
            from client_erp.services.ai_chat import answer
            return answer(self.user, q, history if isinstance(history, list) else [],
                          context=context)

        try:
            text, failed, usage, action = await _ask()
        except Exception as e:                                    # noqa: BLE001
            return {'ok': False, 'error': str(e)[:150]}
        # `usage` — sarf hisoboti (TZ §2.6): token, bugungi limit qoldig'i
        return {'ok': True, 'data': {'text': text, 'degraded': bool(failed),
                                     'usage': usage, 'action': action}}

    async def handle_debt_create(self, data):
        customer_id = data.get('customer_id')
        amount = data.get('amount', 0)
        description = data.get('description', '')
        # To'lov muddati (2026-08-05) — ixtiyoriy. Aynan shu maydon
        # «muddatli qarz»ni tizim hisoblagan qarzdan ajratib turadi.
        due_raw = (data.get('due_date') or '').strip()

        if not customer_id or not amount:
            return {'ok': False, 'error': 'Mijoz va summa kerak'}

        due = None
        if due_raw:
            from datetime import date as _date
            try:
                due = _date.fromisoformat(due_raw[:10])
            except (ValueError, TypeError):
                return {'ok': False, 'error': "Sana noto'g'ri (YYYY-MM-DD)"}

        @database_sync_to_async
        def _create():
            from client_erp.models import ClientDebt
            from client_erp.serializers import serialize_customer
            debt = ClientDebt.objects.create(
                owner=self.user,
                customer_id=customer_id,
                original_amount=amount,
                remaining=amount,
                due_date=due,
            )
            return {
                'id': debt.pk,
                'customer': serialize_customer(debt.customer) if debt.customer else None,
                'original_amount': str(int(float(amount))),
                'paid_amount': '0',
                'remaining': str(int(float(amount))),
                'status': debt.status,
                'due_date': debt.due_date.isoformat() if debt.due_date else None,
                'created_at': debt.created_at.isoformat(),
            }

        return {'ok': True, 'data': await _create()}

    async def handle_debt_pay(self, data):
        debt_id = data.get('id')
        amount = data.get('amount', 0)

        @database_sync_to_async
        def _pay():
            from client_erp.models import ClientDebt, ClientDebtPayment
            from django.utils import timezone
            from decimal import Decimal

            debt = ClientDebt.objects.get(pk=debt_id, owner=self.user)
            pay_amount = min(Decimal(str(amount)), debt.remaining)
            ClientDebtPayment.objects.create(
                debt=debt, amount=pay_amount,
                date=timezone.localdate(),
            )
            debt.paid_amount += pay_amount
            debt.remaining -= pay_amount
            if debt.remaining <= 0:
                debt.remaining = 0
                debt.status = 'paid'
            elif debt.paid_amount > 0:
                debt.status = 'partial'
            debt.save(update_fields=['paid_amount', 'remaining', 'status'])
            return {
                'debt_id': debt.pk,
                'remaining': str(int(debt.remaining)),
                'paid_amount': str(int(debt.paid_amount)),
                'status': debt.status,
            }

        try:
            result = await _pay()
        except Exception:
            return {'ok': False, 'error': 'Qarz topilmadi'}
        return {'ok': True, 'data': result}

    async def handle_finance_withdrawal(self, data):
        amount = data.get('amount', 0)
        if not amount or float(amount) <= 0:
            return {'ok': False, 'error': 'Summa noto\'g\'ri'}
        recipient = (data.get('recipient_name') or '').strip()
        desc = (data.get('description') or '').strip()

        @database_sync_to_async
        def _withdraw():
            from client_erp.models import ClientFinanceRecord
            from client_erp.serializers import serialize_transaction
            from django.utils import timezone
            from django.db.models import Sum
            from decimal import Decimal
            # QOLDIQ NAZORATI — «Kassa ostatka»dan ortiq yechib bo'lmaydi.
            # Formula ekrandagi qiymat bilan AYNAN bir xil bo'lishi uchun
            # yagona manbadan olinadi (TZ-Moliya 2026-08-15 §F6) — ilgari bu
            # yerda kesim (`cutover`) hisobga olinmay, ekranda ko'rinib turgan
            # summani yechib bo'lmasligi mumkin edi.
            from client_erp.serializers import kassa_ostatka
            _balance = kassa_ostatka(self.user)
            if Decimal(str(amount)) > _balance:
                return None, f"Kassa ostatka yetarli emas (mavjud: {int(_balance):,} so'm)".replace(',', ' ')
            record = ClientFinanceRecord.objects.create(
                owner=self.user,
                record_type='withdrawal',
                amount=amount,
                description=desc or 'Pul yechish',
                recipient_name=recipient,
                payment_method=data.get('payment_method', 'cash'),
                date=timezone.localdate(),
            )
            return serialize_transaction(record), None

        _out, _err = await _withdraw()
        if _err:
            return {'ok': False, 'error': _err}
        return {'ok': True, 'data': _out}

    # ═══════════════════════════════════════════════════════════
    #  LAYLO AI CHAT
    # ═══════════════════════════════════════════════════════════

    async def handle_laylo_chat(self, data):
        text = (data.get('text') or '').strip()
        audio_b64 = data.get('audio_base64', '')
        quality = data.get('quality', 'standard')
        want_tts = data.get('tts', False)

        if audio_b64 and not text:
            import base64 as _b64
            try:
                _raw_len = len(_b64.b64decode(audio_b64))
            except Exception:
                _raw_len = 0
            if _raw_len > self._LAYLO_STT_MAX_BYTES:
                return {'ok': False, 'error': f'Audio hajmi juda katta (max {self._LAYLO_STT_MAX_BYTES // 1024} KB)'}
            stt_result = await self._laylo_stt(audio_b64)
            if not stt_result:
                return {'ok': False, 'error': 'Ovozni tushunib bo\'lmadi'}
            text = stt_result

        if not text:
            return {'ok': False, 'error': 'Matn kerak'}

        # Tanga yechish — chat ishlov berishdan OLDIN (AI-tanga o'chiq bo'lsa 0,
        # hech kim bloklanmaydi; yetmasa faqat InsufficientCoins ko'tariladi).
        from client_erp.services import coins
        try:
            await database_sync_to_async(coins.charge)(self.user, 'laylo_chat')
        except coins.InsufficientCoins as e:
            return {'ok': False, 'error': 'coins', 'need': e.need, 'balance': e.balance}

        if not hasattr(self, '_laylo_history'):
            self._laylo_history = []

        self._laylo_history.append({"role": "user", "content": text})

        @database_sync_to_async
        def _process():
            from voicebot.engine.context import LayloUserContext
            from voicebot.engine.core import LayloEngine

            ctx = LayloUserContext.from_client_user(
                self.user,
                transport='websocket',
                tenant_db=self.scope.get('db_alias', 'tenant_mebelcity'),
                agent_name='laylo_client',
            )
            engine = LayloEngine(
                ctx=ctx,
                quality=quality,
                history=list(self._laylo_history),
            )
            return engine.process_message(text)

        try:
            await self.send_json({
                'type': 'laylo.typing',
                'data': {'status': 'thinking'},
            })
            response = await _process()
            self._laylo_history.append({"role": "assistant", "content": response.plain_text or response.html})
            if len(self._laylo_history) > 20:
                self._laylo_history = self._laylo_history[-20:]

            result = {
                'html': response.html,
                'tts_text': response.tts_text,
                'tools_used': response.tools_used,
                'cost': str(response.cost),
                'coins': self.user.coins,
            }

            if audio_b64:
                result['transcript'] = text

            if want_tts and response.tts_text:
                tts_audio = await self._laylo_tts(response.tts_text)
                if tts_audio:
                    result['audio_base64'] = tts_audio
                    result['audio_mime'] = 'audio/ogg'

            return {'ok': True, 'data': result}
        except Exception as e:
            logger.exception("Laylo AI error")
            return {'ok': False, 'error': f'AI xatosi: {str(e)[:200]}'}

    async def handle_laylo_tts(self, data):
        """TTS: matnni ovozga aylantirish."""
        text = (data.get('text') or '').strip()
        if not text:
            return {'ok': False, 'error': 'Matn kerak'}
        audio_b64 = await self._laylo_tts(text)
        if not audio_b64:
            return {'ok': False, 'error': 'TTS xatosi'}
        return {'ok': True, 'data': {'audio_base64': audio_b64, 'audio_mime': 'audio/ogg'}}

    _LAYLO_STT_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
    _LAYLO_TTS_MAX_CHARS = 2000

    async def _laylo_stt(self, audio_b64):
        """Base64 audio → matn (Yandex STT)."""
        @database_sync_to_async
        def _do():
            import base64
            from django.conf import settings
            from voicebot.speechkit.stt import recognize
            from voicebot.speechkit.auth import basic_token
            try:
                audio_bytes = base64.b64decode(audio_b64)
            except Exception:
                return ''
            if len(audio_bytes) > self._LAYLO_STT_MAX_BYTES:
                return ''
            target = settings.YX_STT_TARGET
            token = basic_token(
                login=settings.YX_LOGIN,
                password=settings.YX_PASSWORD,
                precomputed=getattr(settings, 'YX_TOKEN', ''),
            )
            lang = getattr(settings, 'YX_LANG', 'uz-UZ')
            return recognize(audio_bytes, target=target, token=token, lang=lang) or ''
        try:
            return await _do()
        except Exception:
            logger.exception("Laylo STT error")
            return ''

    async def _laylo_tts(self, text):
        """Matn → base64 audio (Yandex TTS)."""
        if len(text) > self._LAYLO_TTS_MAX_CHARS:
            text = text[:self._LAYLO_TTS_MAX_CHARS]
        @database_sync_to_async
        def _do():
            import base64
            from django.conf import settings
            from voicebot.speechkit.tts import synthesize
            from voicebot.speechkit.auth import basic_token
            target = settings.YX_TTS_TARGET
            token = basic_token(
                login=settings.YX_LOGIN,
                password=settings.YX_PASSWORD,
                precomputed=getattr(settings, 'YX_TOKEN', ''),
            )
            voice = getattr(settings, 'YX_VOICE', 'nigora')
            audio = synthesize(text, target=target, token=token, voice=voice, speed=1.0)
            return base64.b64encode(audio).decode('ascii')
        try:
            return await _do()
        except Exception:
            logger.exception("Laylo TTS error")
            return ''

    async def handle_laylo_permissions(self, data):
        @database_sync_to_async
        def _get():
            from voicebot.engine.context import LayloUserContext
            ctx = LayloUserContext.from_client_user(
                self.user,
                tenant_db=self.scope.get('db_alias', 'tenant_mebelcity'),
            )
            return sorted(list(ctx.permissions))

        perms = await _get()
        return {'ok': True, 'data': {'permissions': perms}}

    # ═══════════════════════════════════════════════════════════
    #  SETTINGS
    # ═══════════════════════════════════════════════════════════

    async def handle_settings_contact_admin(self, data):
        """Sozlamalar > "Admin bilan bog'lanish" — admin guruhiga xabar yuboradi."""
        message = str(data.get('message') or '').strip()[:500]

        @database_sync_to_async
        def _send():
            from client_erp.services.notifications import notify_admin_contact_request
            return notify_admin_contact_request(self.user, message)

        ok = await _send()
        if not ok:
            return {'ok': False, 'error': "Admin guruhi sozlanmagan"}
        return {'ok': True, 'data': None}

    async def handle_referral_share(self, data):
        """"Do'stingga ulash" kunlik topshirig'i — Ulashish tugmasi bosilganda."""
        @database_sync_to_async
        def _do():
            from client_erp.services.gamification import check_quest_progress
            self.user.refresh_from_db()
            check_quest_progress(self.user, 'share')

        await _do()
        return {'ok': True, 'data': None}

    async def handle_settings_password(self, data):
        current = data.get('current', '')
        new_pass = data.get('new', '')
        if len(new_pass) < 4:
            return {'ok': False, 'error': 'Parol kamida 4 ta belgi'}

        @database_sync_to_async
        def _change():
            from client_erp.models import ClientUser
            user = ClientUser.objects.get(pk=self.user.pk)
            if not user.check_password(current):
                return False, 'Hozirgi parol noto\'g\'ri'
            user.set_password(new_pass)
            user.save(update_fields=['password_hash'])
            return True, None

        ok, error = await _change()
        if not ok:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': None}

    async def handle_settings_delete_account(self, data):
        """Foydalanuvchi o'z akkountini BUTUNLAY o'chiradi (parol tasdig'i bilan).
        Ichki client_erp ma'lumoti + disk fayllari o'chadi; katta ERP va
        panoramalar teginilmaydi. Frontend keyin /mini/logout/ ga yo'naltiradi."""
        password = data.get('password') or ''

        @database_sync_to_async
        def _do():
            from client_erp.models import ClientUser
            user = ClientUser.objects.get(pk=self.user.pk)
            if not user.check_password(password):
                return False, 'Parol noto\'g\'ri'
            from client_erp.services.account_purge import purge_client_account
            db = self.scope.get('db_alias', 'default')
            res = purge_client_account(user.pk, db=db)
            if not res.get('ok'):
                return False, res.get('error') or 'O\'chirishda xatolik'
            return True, None

        ok, error = await _do()
        if not ok:
            return {'ok': False, 'error': error}
        return {'ok': True, 'data': None}

    async def handle_page_zamers(self, data):
        await self._unsubscribe_all_orders()

        @database_sync_to_async
        def _get():
            import re
            from django.db.models import Q
            try:
                from manfacturing.models import Zamer
                from hashids import Hashids
                _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

                q_filter = Q(client_user=self.user)

                phone = self.user.phone
                if phone:
                    digits = re.sub(r'\D', '', phone)
                    if digits.startswith('998') and len(digits) > 9:
                        digits = digits[3:]
                    q_filter = q_filter | Q(order__client__phone__endswith=digits)

                zamers = list(Zamer.objects.filter(
                    q_filter,
                ).select_related('order', 'order__client').prefetch_related('blocks').distinct().order_by('-id')[:50])

                mc_ids = [z.order_id for z in zamers if z.order_id and not z.client_order_id]
                mc_map = MiniERPConsumer._resolve_client_orders_by_mc(mc_ids)

                co_cache = {}
                result = []
                for z in zamers:
                    thumb = None
                    for field in ['wall_HABG_image', 'wall_ABCD_image', 'wall_DEFC_image', 'wall_EFGH_image']:
                        img = getattr(z, field, None)
                        if img and img.name:
                            try:
                                thumb = img.url
                            except Exception:
                                pass
                            break
                    if not thumb and z.preview_image:
                        thumb = z.preview_image

                    co_id = z.client_order_id
                    co_title = ''
                    if co_id:
                        if co_id not in co_cache:
                            from client_erp.models import ClientOrder
                            try:
                                co_cache[co_id] = ClientOrder.objects.get(pk=co_id).title
                            except ClientOrder.DoesNotExist:
                                co_cache[co_id] = ''
                        co_title = co_cache[co_id]
                    elif z.order_id and z.order_id in mc_map:
                        co_id = mc_map[z.order_id]['id']
                        co_title = mc_map[z.order_id]['title']

                    order_hash = _hashids.encode(z.order_id) if z.order_id else ''
                    result.append({
                        'id': z.id,
                        'room_name': z.room_name or '',
                        'width': float(z.width or 0),
                        'height': float(z.height or 0),
                        'depth': float(z.depth or 0),
                        'length': float(z.length or 0),
                        'blocks_count': z.blocks.count(),
                        'thumbnail': thumb,
                        'order_hash': order_hash,
                        'order_id': z.order_id,
                        'client_order_id': co_id,
                        'client_order_title': co_title,
                        'note': z.note or '',
                        'zamer_url': f'/make_zamer/{order_hash}/?mode=input' if order_hash else '',
                        'created_at': z.created_at.isoformat() if z.created_at else None,
                    })
                return result
            except Exception as e:
                logger.exception("Zamers page error")
                return []

        return {'ok': True, 'data': {'zamers': await _get()}}

    async def handle_zamer_link(self, data):
        zamer_id = data.get('zamer_id')
        client_order_id = data.get('client_order_id')

        @database_sync_to_async
        def _link():
            from manfacturing.models import Zamer
            try:
                z = Zamer.objects.get(pk=zamer_id)
                z.client_order_id = client_order_id or None
                z.save(update_fields=['client_order_id'])
                return True
            except Zamer.DoesNotExist:
                return False

        ok = await _link()
        return {'ok': ok}
