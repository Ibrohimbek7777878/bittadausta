"""client_erp/glive_consumer.py — Gemini Live SERVER-SIDE proxy consumer.

Brauzer  <->  (bizning WS: /ws/mini/<username>/glive/)  <->  Gemini Live (SDK).

SABAB (nega proxy):
    gemini-3.1-flash-live-preview modeli brauzer-direct (ephemeral token +
    BidiGenerateContentConstrained) yo'lida `1011 internal error` beradi — Google
    constrained endpoint'i bu model bilan nomos. SDK'ning to'g'ridan-to'g'ri
    (header-auth) ulanishi esa 3.1 bilan MUKAMMAL ishlaydi (server testlarida
    tasdiqlangan: sessiya ochildi, tool_call qaytdi, tool_response ishladi).
    Shuning uchun audio bizning server orqali Gemini'ga ko'priklanadi. Bonus:
    GEMINI_API_KEY brauzerga umuman chiqmaydi (ephemeral token ham kerak emas).

OQIM (JSON kadrlar; audio base64):
    browser -> {type:'start', page, tools}          gate+charge -> Gemini sessiya
    server  -> {type:'ready', model}                sessiya ochildi, mikrofonni yoq
    browser -> {type:'audio', data:<b64 PCM16 16k>}  -> session.send_realtime_input
    server  -> {type:'audio', data:<b64 PCM 24k>}    Gemini ovozi -> ijro
    server  -> {type:'tool_call', id, name, args}    -> RcActions.run
    browser -> {type:'tool_response', id, name, result} -> session.send_tool_response
    server  -> {type:'interrupted'}                  barge-in (ijroni to'xtat)
    browser -> {type:'stop'} yoki disconnect         sessiya yopiladi
    server  -> {type:'error', detail, upgrade?}      xato / gate rad

XAVFSIZLIK: F1/F2 gating standart-ochiq — CLIENT_FEATURE_GATING/CLIENT_AI_COINS
o'chiq bo'lsa hech kim bloklanmaydi/tanga sarflamaydi (can_use_live True/True).
Katta ERP'ga TEGMAYDI — mustaqil consumer, faqat client_erp servislarini chaqiradi.
"""
import asyncio
import base64
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# ── TO'LOV VA CHEKLOV (2026-08-05, TZ-Tanga-Tolov-Adolat.md) ─────────────
# PCM16 mono 16 kHz → 32 000 bayt/soniya.
# 1.5 soniya audio = odam HAQIQATAN gapirdi (mikrofon jimligi emas).
BYTES_PER_SEC = 32000
MIN_AUDIO_MS = 1500
MIN_AUDIO_BYTES = int(BYTES_PER_SEC * MIN_AUDIO_MS / 1000)

# Qayta ulanish oynasi — shu vaqt ichida ikkinchi to'lov olinmaydi
CHARGE_WINDOW_SEC = 50

# Uzoq sessiya: 20-daqiqada ogohlantirish, 25-daqiqada avtomatik to'xtatish
# (zarar chegarasi ~29 daqiqa — HISOBOT-Tanga-Token-Narx.md §4)
WARN_SEC = 20 * 60
HARD_STOP_SEC = 25 * 60


class GeminiLiveConsumer(AsyncJsonWebsocketConsumer):
    """Gemini Live ovozli boshqaruv uchun server-side proxy."""

    # ── ulanish ──
    async def connect(self):
        self.username = self.scope['url_route']['kwargs'].get('username', '')
        self.user = await self._authenticate()
        if not self.user or self.user.username != self.username:
            await self.close(code=4001)
            return
        self.gsession = None      # SDK AsyncSession (ochilgach)
        self.gtask = None         # sessiyani yurituvchi background task
        self._charged = 0         # yechib olingan tanga (refund uchun emas — F2 o'chiq)
        self._closing = False
        # ── o'lchov + to'lov holati (2026-08-05) ──
        self._t_started = None    # sessiya boshlangan vaqt
        self._audio_bytes = 0     # yuborilgan audio (bayt) — gapirilgan vaqt
        self._warned = False      # 20-daqiqa ogohlantirishi berildimi
        self._charge_reason = ''  # 'first_audio' | 'reuse_window' | 'skipped'
        self._logged = False      # o'lchov yozuvi yozildimi (bir marta)
        await self.accept()

    async def disconnect(self, code):
        await self._teardown()

    # ── kiruvchi kadrlar ──
    async def receive_json(self, content):
        t = content.get('type', '')
        try:
            if t == 'start':
                await self._on_start(content)
            elif t == 'audio':
                await self._on_audio(content)
            elif t == 'text':
                await self._on_text(content)
            elif t == 'tool_response':
                await self._on_tool_response(content)
            elif t == 'stop':
                await self._teardown()
                await self._safe_send({'type': 'ended'})
            elif t == 'ping':
                await self._safe_send({'type': 'pong'})
        except Exception as e:  # noqa: BLE001 — hech qachon consumer'ni yiqitmaymiz
            logger.exception('glive proxy receive error')
            await self._safe_send({'type': 'error', 'detail': str(e)[:200]})

    # ── Server tomonidagi ma'lumot tool'lari (2026-08-05) ──
    async def _try_server_tool(self, name, args):
        """Server tool'i bo'lsa bajaradi va matn qaytaradi, aks holda None."""
        try:
            from client_erp.services.ai_tools import SERVER_TOOLS
        except Exception:                                         # noqa: BLE001
            return None
        if name not in SERVER_TOOLS:
            return None

        @database_sync_to_async
        def _run():
            self._set_ctx()                    # tenant konteksti (thread-local)
            from client_erp.services.ai_tools import run_server_tool
            return run_server_tool(self.user, name, args)

        try:
            out = await _run()
        except Exception as e:                                    # noqa: BLE001
            logger.exception('glive server tool xato: %s', name)
            out = f"Ma'lumot olinmadi: {str(e)[:120]}"
        # Foydalanuvchi ekranda ham ko'rsin (ovoz eshitilmay qolsa)
        await self._safe_send({'type': 'tool_result', 'name': name,
                               'text': (out or '')[:4000]})
        return out or ''

    async def _send_tool_result(self, call_id, name, text):
        """Natijani Gemini sessiyasiga qaytaradi."""
        try:
            from google.genai import types
        except Exception:                                         # noqa: BLE001
            return
        if not self.gsession:
            return
        try:
            await self.gsession.send_tool_response(function_responses=[
                types.FunctionResponse(id=call_id, name=name,
                                       response={'result': text}),
            ])
        except Exception:                                         # noqa: BLE001
            logger.exception('glive tool_response yuborilmadi: %s', name)

    # ── TO'LOV: faqat haqiqiy gapirilganda (2026-08-05, TZ §2.1) ──
    async def _ensure_charged(self):
        """Sessiyada BIR MARTA. 50 s oyna ichida qayta olinmaydi (§2.2)."""
        if self._charged:
            return

        @database_sync_to_async
        def _do():
            self._set_ctx()
            from client_erp.services import coins
            # Qayta ulanish oynasi — internet uzilib qayta ulansa ikkinchi
            # marta to'lov OLINMAYDI (oldingi to'lovning davomi).
            if coins.recently_charged(self.user, 'gemini_live', CHARGE_WINDOW_SEC):
                return 0, 'reuse_window'
            try:
                return coins.charge(self.user, 'gemini_live',
                                    ref_id='glive', hard=True), 'first_audio'
            except Exception:                                     # noqa: BLE001
                return 0, 'skipped'

        try:
            amount, reason = await _do()
        except Exception:                                         # noqa: BLE001
            logger.exception('glive _ensure_charged xato')
            return
        self._charged = amount or 0
        self._charge_reason = reason
        # Foydalanuvchi ko'rsin: qancha yechildi (yoki yechilmadi)
        await self._safe_send({'type': 'charged', 'coins': self._charged,
                               'reason': reason})

    # ── O'LCHOV: sessiya yakunida bir marta (2026-08-05, TZ §2.3) ──
    async def _log_usage(self):
        if self._logged or self._t_started is None:
            return
        # ⚠️ 2026-08-05: BO'SH sessiya yozilmaydi.
        # Gemini sessiyasi ba'zan ~10 soniyada uzilib, brauzer avtomatik
        # qayta ulanadi (scheduleReconnect). Har qayta ulanish yangi
        # consumer — agar har biri yozuv yaratsa, kunlik limit (30 xabar)
        # foydalanuvchi hech narsa qilmasdan tugab qolardi.
        # Shart: kamida 3 soniya YOKI biror audio yuborilgan bo'lsin.
        _dur = (timezone.now() - self._t_started).total_seconds()
        if _dur < 3 and self._audio_bytes <= 0:
            self._logged = True
            return
        self._logged = True
        ended = timezone.now()
        dur = int((ended - self._t_started).total_seconds())
        audio_ms = int(self._audio_bytes / BYTES_PER_SEC * 1000)

        @database_sync_to_async
        def _write():
            self._set_ctx()
            from client_erp.services import ai_usage
            # Live token sonini SDK har doim bermaydi — audio vaqtidan
            # taxmin qilamiz (~25 token/soniya, HISOBOT §3).
            est_tok = int(audio_ms / 1000 * 25)
            ai_usage.log(
                self.user, 'live',
                started_at=self._t_started, ended_at=ended,
                duration_sec=dur, audio_ms_in=audio_ms,
                tokens_in=est_tok, tokens_out=est_tok,
                tokens_estimated=True,
                provider='gemini-live',
                coins_charged=self._charged,
                charge_reason=self._charge_reason or 'skipped',
            )
            return ai_usage.usage_block(
                self.user, tokens=est_tok * 2, estimated=True,
                duration_sec=dur, coins=self._charged)

        try:
            block = await _write()
        except Exception:                                         # noqa: BLE001
            logger.exception('glive _log_usage xato')
            return
        # Sarf hisobotini foydalanuvchiga yuboramiz (§2.6)
        await self._safe_send({'type': 'usage', **(block or {})})

    # ── start: gate + sessiya ochish ──
    async def _on_start(self, content):
        if self.gtask and not self.gtask.done():
            return  # allaqachon ishlayapti
        allowed, affordable = await self._gate()
        if not allowed:
            await self._safe_send({'type': 'error', 'detail': "Bu funksiya tarifingizda yo'q", 'upgrade': True})
            return
        if not affordable:
            await self._safe_send({'type': 'error', 'detail': 'Tanga yetarli emas', 'upgrade': True})
            return
        page = content.get('page') or '#/'
        tools = content.get('tools') or []
        # ── SERVER TOOL e'lonlari (2026-08-05) ──
        # Brauzer bilmasligi kerak — bular serverda bajariladi. Shu yerda
        # qo'shiladi, shuning uchun rc-actions.js ga TEGILMAYDI.
        try:
            from client_erp.services.ai_tools import SERVER_TOOL_DECLS
            _have = {t.get('name') for t in tools if isinstance(t, dict)}
            tools = list(tools) + [d for d in SERVER_TOOL_DECLS
                                   if d['name'] not in _have]
        except Exception:                                         # noqa: BLE001
            pass                       # e'lonlar yuklanmasa ham sessiya ochilsin
        system = await self._build_system(page)
        self._closing = False
        self.gtask = asyncio.create_task(self._run_session(system, tools))

    # ── Gemini sessiyasi (background task) ──
    async def _run_session(self, system, tools):
        from client_erp.gemini_live import live_model
        try:
            from google import genai
            from google.genai import types  # noqa: F401 — _on_audio/_on_tool_response uchun ham kerak
        except Exception as e:  # noqa: BLE001
            await self._safe_send({'type': 'error', 'detail': "AI kutubxona yo'q: " + str(e)[:120]})
            return

        from client_erp.gemini_live import live_key_candidates, mark_live_key, classify_live_error
        candidates = await database_sync_to_async(live_key_candidates)()
        if not candidates:
            await self._safe_send({'type': 'error', 'detail': 'AI kalit sozlanmagan'})
            self.gsession = None
            if not self._closing:
                await self._safe_send({'type': 'ended'})
            return

        model = live_model()
        # Ayol ovozi (default 'Aoede' — iliq ayol). settings.GEMINI_LIVE_VOICE bilan
        # almashtirsa bo'ladi (Gemini female: Aoede/Kore/Leda/Zephyr).
        voice = getattr(settings, 'GEMINI_LIVE_VOICE', 'Aoede') or 'Aoede'
        config = {
            'response_modalities': ['AUDIO'],
            'system_instruction': system,
            # Matn yozish + transkript (2026-07-15): javob ovozda beriladi, LEKIN
            # ekranda ham (aytilgan/yozilgan) matn ko'rinishi uchun.
            'output_audio_transcription': {},
            'input_audio_transcription': {},
            'speech_config': {'voice_config': {'prebuilt_voice_config': {'voice_name': voice}}},
        }
        if tools:
            # Frontend GEMINI_TOOLS (lowercase JSON-schema) — SDK o'zi konvert qiladi.
            config['tools'] = [{'function_declarations': tools}]

        # ── BEPUL POOL rotatsiyasi: kalit limit/yaroqsiz bo'lsa keyingisiga o'tamiz ──
        last_kind = 'transient'
        try:
            for cand in candidates:
                if self._closing:
                    break
                connected = False
                try:
                    client = genai.Client(api_key=cand['key'], http_options={'api_version': 'v1beta'})
                    async with client.aio.live.connect(model=model, config=config) as session:
                        connected = True
                        self.gsession = session
                        # Ishlagan kalitni 'valid' deb belgilaymiz (rotatsiya o'rgansin)
                        if cand.get('row_id') is not None:
                            await database_sync_to_async(mark_live_key)(cand['row_id'], cand['idx'], 'valid')
                        logger.info('glive: kalit ishladi — %s', cand.get('name'))
                        # ── 2026-08-05: SESSIYA OCHILISHIDA TO'LOV YO'Q ──
                        # TZ-Tanga-Tolov-Adolat.md §2.1. Ilgari shu yerda
                        # `_charge()` chaqirilardi — natijada bosdi-yopdi
                        # qilgan odam ham 2 tanga to'lardi. O'lchandi:
                        # 95 sessiyaning 67 tasi (71%) 30 soniya ichida
                        # qayta ochilgan → 134 tanga bekorga ketgan.
                        # Endi to'lov `_ensure_charged()` da — foydalanuvchi
                        # HAQIQATAN gapirganda (§2.1 MIN_AUDIO_MS).
                        self._t_started = timezone.now()
                        await self._safe_send({'type': 'ready', 'model': model})
                        async for response in session.receive():
                            if self._closing:
                                break
                            data = getattr(response, 'data', None)
                            if data:
                                await self._safe_send({'type': 'audio',
                                                       'data': base64.b64encode(data).decode('ascii')})
                            tc = getattr(response, 'tool_call', None)
                            if tc and getattr(tc, 'function_calls', None):
                                for fc in tc.function_calls:
                                    # ── SERVER TOOL'lari (2026-08-05) ──
                                    # Ma'lumot so'rovlari (tashxis, qarzdorlar,
                                    # ko'rsatkich izohi) SHU YERDA bajariladi.
                                    # Sabab: brauzerdagi `RcActions.run` SINXRON
                                    # — WS javobini kuta olmaydi.
                                    # UI amallari (sahifa ochish, etap tugatish)
                                    # avvalgidek brauzerga yuboriladi.
                                    _res = await self._try_server_tool(
                                        fc.name, dict(fc.args or {}))
                                    if _res is not None:
                                        await self._send_tool_result(
                                            getattr(fc, 'id', None), fc.name, _res)
                                        continue
                                    await self._safe_send({'type': 'tool_call', 'id': getattr(fc, 'id', None),
                                                           'name': fc.name, 'args': dict(fc.args or {})})
                            sc = getattr(response, 'server_content', None)
                            if sc is not None and getattr(sc, 'interrupted', False):
                                await self._safe_send({'type': 'interrupted'})
                            if sc is not None:
                                out_t = getattr(sc, 'output_transcription', None)
                                if out_t is not None and getattr(out_t, 'text', None):
                                    await self._safe_send({'type': 'transcript', 'role': 'model', 'text': out_t.text})
                                in_t = getattr(sc, 'input_transcription', None)
                                if in_t is not None and getattr(in_t, 'text', None):
                                    await self._safe_send({'type': 'transcript', 'role': 'user', 'text': in_t.text})
                    break  # sessiya normal tugadi
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001
                    if connected:
                        # Sessiya ochilgan edi — kalit muammosi emas, oddiy uzilish/tugash
                        logger.exception('glive session error (connected)')
                        break
                    # ULANISHDA xato — kalitni turkumlab belgilaymiz, keyingisini sinaymiz
                    kind = classify_live_error(e)
                    last_kind = kind
                    logger.warning('glive connect fail key=%s kind=%s: %s', cand.get('name'), kind, str(e)[:150])
                    if cand.get('row_id') is not None and kind in ('rate_limited', 'invalid'):
                        await database_sync_to_async(mark_live_key)(cand['row_id'], cand['idx'], kind, str(e)[:200])
                    continue
            else:
                # Hamma kalit muvaffaqiyatsiz (break bo'lmadi)
                _detail = ("AI yordamchi vaqtincha band (barcha kalitlar limit tugagan). Birozdan so'ng urinib ko'ring."
                           if last_kind == 'rate_limited'
                           else "AI yordamchi hozircha ishlamayapti. Birozdan so'ng urinib ko'ring.")
                await self._safe_send({'type': 'error', 'detail': _detail})
        except asyncio.CancelledError:
            raise
        finally:
            self.gsession = None
            if not self._closing:
                await self._safe_send({'type': 'ended'})

    # ── audio: brauzer -> Gemini ──
    async def _on_audio(self, content):
        s = self.gsession
        if not s:
            return
        b64 = content.get('data')
        if not b64:
            return
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return

        # ── Audio hisobi (2026-08-05) ──
        # PCM16 mono 16 kHz → 32 000 bayt/soniya. Yuborilgan bayt hajmidan
        # foydalanuvchi QANCHA VAQT gapirgani aniq hisoblanadi.
        self._audio_bytes += len(raw)
        if self._audio_bytes >= MIN_AUDIO_BYTES and not self._charged:
            await self._ensure_charged()

        # ── Uzoq sessiya himoyasi (§2.4) ──
        if self._t_started is not None:
            el = (timezone.now() - self._t_started).total_seconds()
            if el >= HARD_STOP_SEC:
                await self._safe_send({
                    'type': 'limit',
                    'detail': "Suhbat 25 daqiqaga yetdi — avtomatik to'xtatildi.",
                })
                await self._teardown()
                await self._safe_send({'type': 'ended'})
                return
            if el >= WARN_SEC and not self._warned:
                self._warned = True
                await self._safe_send({
                    'type': 'warn',
                    'detail': "5 daqiqadan keyin suhbat avtomatik to'xtaydi.",
                })

        from google.genai import types
        try:
            await s.send_realtime_input(
                audio=types.Blob(data=raw, mime_type='audio/pcm;rate=16000')
            )
        except Exception:
            pass  # sessiya yopilayotgan bo'lishi mumkin — jim o'tamiz

    # ── text: brauzer -> Gemini (matn yozib yuborish, 2026-07-15) ──
    async def _on_text(self, content):
        s = self.gsession
        if not s:
            return
        text = (content.get('text') or '').strip()[:2000]
        if not text:
            return
        # Foydalanuvchi o'zi yozgan matnni ham darhol transkript sifatida
        # ko'rsatamiz (Gemini input_transcription faqat OVOZ uchun ishlaydi,
        # yozilgan matnga tegishli emas).
        await self._safe_send({'type': 'transcript', 'role': 'user', 'text': text})
        try:
            await s.send_client_content(
                turns={'role': 'user', 'parts': [{'text': text}]},
                turn_complete=True,
            )
        except Exception:
            pass

    # ── tool_response: brauzer -> Gemini ──
    async def _on_tool_response(self, content):
        s = self.gsession
        if not s:
            return
        from google.genai import types
        fr = types.FunctionResponse(
            name=content.get('name'),
            response={'result': content.get('result')},
        )
        fid = content.get('id')
        if fid:
            fr.id = fid
        try:
            await s.send_tool_response(function_responses=[fr])
        except Exception:
            pass

    # ── yopish ──
    async def _teardown(self):
        # O'lchov yozuvi — sessiya QANDAY tugashidan qat'i nazar bir marta
        # (stop / disconnect / 25-daqiqa limiti / xato). `_logged` bayrog'i
        # takrorlanishning oldini oladi.
        try:
            await self._log_usage()
        except Exception:                                         # noqa: BLE001
            logger.exception('glive teardown _log_usage')
        self._closing = True
        t = self.gtask
        self.gtask = None
        if t and not t.done():
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        self.gsession = None

    async def _safe_send(self, obj):
        try:
            await self.send_json(obj)
        except Exception:
            pass

    # ── DB yordamchilar (tenant alias thread-local — mavjud consumer patterni) ──
    def _set_ctx(self):
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = self.scope.get('db_alias', 'default')
        _thread_local.tenant = self.scope.get('tenant')

    @database_sync_to_async
    def _authenticate(self):
        self._set_ctx()
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

    @database_sync_to_async
    def _gate(self):
        self._set_ctx()
        from client_erp.gemini_live import can_use_live
        try:
            return can_use_live(self.user)
        except Exception:
            return (True, True)  # fail-safe: gating xatosi hech kimni bloklamaydi

    @database_sync_to_async
    def _charge(self):
        self._set_ctx()
        from client_erp.services import coins
        try:
            # HARD: Live tangani haqiqatan yechadi (global gating o'chiq bo'lsa ham).
            return coins.charge(self.user, 'gemini_live', ref_id='glive', hard=True)
        except Exception:
            return 0

    @database_sync_to_async
    def _build_system(self, page):
        self._set_ctx()
        from client_erp.gemini_live import system_context
        try:
            return system_context(self.user.full_name, page)
        except Exception:
            return "Sen Bittada Usta mini ERP ovozli yordamchisisan. Adabiy o'zbekcha gapir."
