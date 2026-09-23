"""client_erp/models/order.py — Ichki buyurtma + Etaplar."""
import logging

from django.db import models
from django.db.models import Sum

logger = logging.getLogger(__name__)


class ClientOrder(models.Model):
    """Mebelchining o'z ichki buyurtmasi."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='orders')
    customer = models.ForeignKey('client_erp.ClientCustomer', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')

    title = models.CharField(max_length=300)
    description = models.TextField(blank=True, default='')

    # Eslatma: bu ro'yxat fallback/dastlabki qiymatlar uchun — haqiqiy, admin
    # tomonidan boshqariladigan ro'yxat ClientOrderStatusDef modelida (order_status.py)
    STATUS_CHOICES = [
        ('new', 'Yangi'),
        ('waiting', 'Kutilmoqda'),
        ('in_progress', 'Jarayonda'),
        ('at_mebelcity', 'MebelCity da'),
        ('ready', 'Tayyor'),
        ('delivered', 'Topshirildi'),
        ('cancelled', 'Bekor'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')

    estimated_price = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    final_price = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    zaklad_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)

    # MebelCity ga bog'lash (cross-tenant safe)
    mebelcity_order_id = models.IntegerField(null=True, blank=True)
    mebelcity_tenant = models.CharField(max_length=50, blank=True, default='')

    use_stages = models.BooleanField(default=True)
    stage_template = models.ForeignKey(
        'client_erp.ClientOrderStageTemplate', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='orders',
    )
    overall_progress = models.IntegerField(default=0)

    deadline = models.DateTimeField(null=True, blank=True)
    # Topshirilgan sana — status 'delivered' bo'lganda avto-to'ladi. Foyda AYNAN
    # shu sana oyiga tan olinadi (buyurtma-asosli oylik hisob). Timeline'dan mustaqil.
    delivered_at = models.DateTimeField(null=True, blank=True)
    # Tayyor bo'lgan sana — status 'ready' bo'lganda avto-to'ladi (2026-09-04).
    # Kirim/Chiqim/Foyda 'ready' buyurtmada delivered_at HALI yo'q bo'lsa
    # (topshirilmagan, faqat tayyor) shu sanaga tan olinadi — created_at
    # (BOSHLANGAN sana)ga HECH QACHON tushmasin degan talab shu sabab.
    ready_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Mijozga OCHIQ ulashish (public status sahifasi) — usta.bittada.uz/<uuid>/
    # Yoqilganда UUID beriladi; NULL = ulashilmagan. Eslatma/moliya KO'RSATILMAYDI.
    share_uuid = models.UUIDField(null=True, blank=True, unique=True, db_index=True,
                                  verbose_name="Mijoz ulashish UUID")

    # Soft-delete — o'chirilgan buyurtma yo'qolmaydi, "O'chirilgan loglar" da saqlanadi
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    delete_note = models.CharField(max_length=300, blank=True, default='', verbose_name="O'chirish sababi")

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} — {self.customer or '?'}"

    # ══ QAYTARISH (revert) MANTIG'I — 2026-08-24 ═════════════════════════
    #  TZ: TZ-Qaytarish-va-Shartnoma-Chegarasi.md
    #
    #  Qaytarish TESKARI yozuv sifatida saqlanadi (chiqim qaytarilsa
    #  `record_type='income'`, kirim qaytarilsa `record_type='expense'`) —
    #  bu KASSA hisobi uchun to'g'ri: `kirim − chiqim` da +X va −X
    #  bir-birini yo'q qiladi.
    #
    #  LEKIN zakaz kartasida kirim va chiqim ALOHIDA ko'rsatiladi va
    #  qaytarish oddiy kirim kabi sanalardi: #278 da mijoz 2 000 000
    #  bergan bo'lsa ham kirim 5 727 000 deb chiqardi (3 727 000 lik
    #  chiqim qaytarilgani kirimga qo'shilib ketgan edi).
    #
    #  TO'G'RI QOIDA: qaytarish — yangi pul EMAS, eski yozuvning bekor
    #  qilinishi. Shuning uchun u O'Z TOMONIDAN ayiriladi:
    #     chiqim qaytarildi → CHIQIM kamayadi, kirim tegilmaydi
    #     kirim  qaytarildi → KIRIM  kamayadi, chiqim tegilmaydi
    #
    #  ⚠️ `record_type` O'ZGARMAYDI — kassa formulasiga tegilmaydi.
    def _sum(self, **flt):
        from django.db.models import Sum
        return self.finance_records.filter(is_deleted=False, **flt).aggregate(
            t=Sum('amount'))['t'] or 0

    @property
    def total_income(self):
        if self.status == 'cancelled':
            return 0
        base = self._sum(record_type='income', is_reversal=False)
        # «Kirim qaytarish» yozuvlari `expense` turida saqlanadi
        ret = self._sum(category='income_return')
        val = base - ret
        return val if val > 0 else 0

    @property
    def total_expense(self):
        if self.status == 'cancelled':
            return 0
        base = self._sum(record_type='expense', is_reversal=False)
        # «Chiqim qaytarish» yozuvlari `income` turida saqlanadi
        ret = self._sum(category='expense_return')
        val = base - ret
        return val if val > 0 else 0

    @property
    def profit(self):
        """Eski (naqd-asosli) foyda — kelgan pul − xarajat.

        ⚠️ YANGI KODDA `contract_profit` ISHLATILSIN. Bu property faqat
        orqaga moslik uchun qoldirilgan (FINANCE_V2 bayrog'i o'chiq
        foydalanuvchilarda `contract_profit` shuning o'ziga tushadi).
        """
        return self.total_income - self.total_expense

    # ── SHARTNOMA-ASOSLI FOYDA (2026-08-03) ──────────────────────────────────
    # Butun tizimda foyda hisoblanadigan YAGONA joy. Ilgari bu formula 34 xil
    # joyda qo'lda takrorlanardi (audit: DOCS/TZ-Shartnoma-Foyda-Jamoa-Moliya.md
    # §0.3) — bittasi yangilanmasa raqamlar sahifalar aro farq qilardi.
    #
    # QOIDA (xalqaro «completed-contract» usuli, IFRS 15):
    #   daromad — KELISHILGAN summa (shartnoma), kelgan pul emas.
    #
    # GRANDFATHERING (SHART): shartnoma summasi kiritilmagan ESKI zakazlarda
    # eski formulaga tushadi. Aks holda jonli bazada 14 ta zakaz MANFIY foyda
    # chiqarardi va jami foyda −158 mln (−54%) bo'lardi (o'lchangan).

    @property
    def contract_amount(self):
        """Rasmiy shartnoma summasi. Mijoz TASDIQLAGAN `ClientContract` ustuvor,
        bo'lmasa qo'lda kiritilgan `zaklad_amount` (Shartnoma tugmasi)."""
        try:
            c = self.contracts.filter(status='confirmed').order_by('-confirmed_at').first()
            if c and c.contract_amount:
                return c.contract_amount
        except Exception:                                         # noqa: BLE001
            pass
        return self.zaklad_amount or self.final_price or 0

    @property
    def uses_contract_profit(self):
        """Shu zakaz shartnoma-asosli hisobga o'tganmi.

        Ikki shart: (1) egasi FINANCE_V2 sinovida, (2) shartnoma summasi bor.
        Ikkinchisi — grandfathering: eski, shartnomasiz zakazlar tegilmaydi.
        """
        from client_erp.services.scope import finance_v2
        try:
            return bool(finance_v2(self.owner)) and float(self.contract_amount or 0) > 0
        except Exception:                                         # noqa: BLE001
            return False

    @property
    def contract_profit(self):
        """ASOSIY foyda ko'rsatkichi — butun tizim shuni ishlatishi kerak."""
        if self.status == 'cancelled':
            return 0
        if self.uses_contract_profit:
            from decimal import Decimal
            old_profit = Decimal(str(self.profit))
            new_profit = Decimal(str(self.contract_amount)) - Decimal(str(self.total_expense))

            # ── XAVFSIZLIK TO'RI (2026-08-04) ───────────────────────────────
            # Jonli bazada topildi (order#132, TZ §0.9): `zaklad_amount` va
            # tasdiqlangan `ClientContract.contract_amount` ikkalasi ham >0,
            # lekin FARQLI bo'lishi mumkin (masalan shartnoma eskirgan/xato
            # kiritilgan). Bunday holda yangi formula haqiqiy xarajatdan kam
            # summani asos qilib, MANFIY foyda chiqarib yuborishi mumkin —
            # bu har doim ma'lumot nomuvofiqligi belgisi, HAQIQIY zarar emas
            # (TEST-REJA rollback-qoidasi: "foyda manfiy chiqsa — falokat").
            # Shu sabab: agar yangi formula MANFIYga tushib, eski (naqd)
            # formula 0 yoki musbat bo'lsa — ESKI formulaga qaytamiz va
            # log yozamiz (ko'rib chiqish uchun), foydalanuvchiga noto'g'ri
            # manfiy raqam hech qachon ko'rsatilmaydi.
            if new_profit < 0 and old_profit >= 0:
                logger.warning(
                    "[contract_profit] order=%s (owner=%s): yangi formula manfiy "
                    "(%s), eski formula bilan almashtirildi (%s). zaklad=%s "
                    "contract=%s — ko'rib chiqish kerak.",
                    self.pk, self.owner_id, new_profit, old_profit,
                    self.zaklad_amount, self.contract_amount,
                )
                return old_profit
            return new_profit
        return self.profit          # eski yo'l (grandfathering / bayroq o'chiq)

    @property
    def real_income(self):
        """MIJOZDAN kelgan haqiqiy pul — bekor qilingan yozuvlarsiz.

        `total_income`dan farqi: u BARCHA income yozuvini sanaydi, shu
        jumladan bekor qilingan foyda-taqsimotining kassaga QAYTISHINI ham
        (`is_reversal=True`). Kassa daftari uchun to'g'ri — pul haqiqatan
        qaytdi — lekin bu TUSHUM emas.

        Jonli bazada topilgan (2026-08-04, zakaz #319):
            total_income  69 999 628
            ├ mijoz puli  50 000 000
            └ bekor qaytishi 19 999 628   ← tushum emas
        Natijada «Qo'shimcha daromad» 19 999 628 deb ko'rsatilardi — aslida 0.

        ⚠️ `total_income` ATAYLAB o'zgartirilmadi: u `profit` (eski, naqd
        formulasi) ichida ishlatiladi va grandfathering yo'lidagi akkauntlar
        foydasini siljitib yuborardi. Shuning uchun «mijoz puli» ma'nosi
        kerak bo'lgan joylarda SHU property ishlatiladi.
        """
        if self.status == 'cancelled':
            return 0
        from django.db.models import Sum
        return self.finance_records.filter(
            record_type='income', is_deleted=False, is_reversal=False
        ).aggregate(t=Sum('amount'))['t'] or 0

    @property
    def extra_income(self):
        """«Qo'shimcha daromad» — shartnomadan ORTIQ kelgan pul.

        Foydaga QO'SHILMAYDI (qoida: foyda faqat shartnomadan), lekin
        YO'QOLMAYDI ham — hisobotda alohida satrda ko'rsatiladi. Aks holda
        foydalanuvchi «pulim qayoqqa ketdi?» deb qolardi."""
        if not self.uses_contract_profit:
            return 0
        from decimal import Decimal
        # `real_income` — bekor qilingan qaytishlar soxta «ortiqcha» yasamasin
        diff = Decimal(str(self.real_income)) - Decimal(str(self.contract_amount))
        return diff if diff > 0 else 0

    @property
    def payment_percent(self):
        # Shartnoma (zaklad_amount) — asosiy maqsad summa (Shartnoma tugmasi shu
        # yerga yozadi). final_price deyarli hech qachon to'ldirilmaydi — faqat
        # zaklad bo'lmasa zaxira sifatida ishlatiladi.
        price = self.zaklad_amount or self.final_price or 0
        if not price:
            return 0
        # `real_income` — bekor qilingan qaytish to'lov foizini shishirmasin
        # (mijoz 50% to'lagan bo'lsa ham 100% ko'rinib qolardi).
        return min(100, int(float(self.real_income) / float(price) * 100))

    def update_progress(self):
        stages = self.stages.exclude(status='skipped')
        total = stages.count()
        if total == 0:
            self.overall_progress = 0
        else:
            done = stages.filter(status='completed').count()
            self.overall_progress = int(done / total * 100)
        self.save(update_fields=['overall_progress'])


class ClientOrderItem(models.Model):
    """Buyurtma tarkibi."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=200)
    material = models.CharField(max_length=200, blank=True, default='')
    quantity = models.IntegerField(default=1)
    unit = models.CharField(max_length=20, default='dona')
    unit_price = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        app_label = 'client_erp'
        ordering = ['id']


class ClientOrderStage(models.Model):
    """Buyurtma etapi (dynamic stage)."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='stages')
    template_item = models.ForeignKey(
        'client_erp.ClientOrderStageTemplateItem', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    title = models.CharField(max_length=200)
    icon = models.CharField(max_length=10, default='📋')
    color = models.CharField(max_length=7, default='#6366f1')
    sort_order = models.IntegerField(default=0)

    STATUS_CHOICES = [
        ('pending', 'Kutilmoqda'),
        ('active', 'Faol'),
        ('completed', 'Tugallangan'),
        ('skipped', "O'tkazildi"),
    ]
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')

    assigned_to = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assigned_stages',
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='completed_stages',
    )
    note = models.TextField(blank=True, default='')
    estimated_cost = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    is_mebelcity = models.BooleanField(default=False)
    mebelcity_order_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f"{self.sort_order}. {self.title}"

    @property
    def total_expense(self):
        return self.expenses.filter(
            record_type='expense', is_deleted=False
        ).aggregate(t=Sum('amount'))['t'] or 0


class ClientOrderStageItem(models.Model):
    """Etap ichidagi checklist element."""
    stage = models.ForeignKey(ClientOrderStage, on_delete=models.CASCADE, related_name='checklist')
    title = models.CharField(max_length=300)
    is_done = models.BooleanField(default=False)
    done_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True, on_delete=models.SET_NULL,
    )
    done_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']


class ClientOrderPhoto(models.Model):
    """Buyurtma fotolari."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='client_erp/orders/')
    caption = models.CharField(max_length=200, blank=True, default='')
    STAGE_CHOICES = [('before', 'Oldin'), ('during', 'Jarayon'), ('after', 'Keyin')]
    stage = models.CharField(max_length=10, choices=STAGE_CHOICES, default='during')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'


class ClientOrderFile(models.Model):
    """Buyurtmaga biriktirilgan fayllar."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='files')
    # `blank=True` (2026-09-04): havola-turi yozuvda (external_url to'ldirilgan)
    # fizik fayl yo'q — faqat URL saqlanadi (masalan Bazis oblaka, ShapeSpark).
    file = models.FileField(upload_to='client_erp/files/', blank=True)
    # Tashqi havola — fayl o'rniga URL saqlash uchun (2026-09-04). To'ldirilgan
    # bo'lsa `file` bo'sh qoladi, frontend buni "havola" kartochkasi sifatida
    # ko'rsatadi (yangi oynada ochiladi, yuklab olish emas).
    external_url = models.URLField(max_length=500, blank=True, default='')
    thumbnail = models.ImageField(upload_to='client_erp/files/thumbs/', null=True, blank=True)
    FILE_TYPE_CHOICES = [
        ('image', 'Rasm'),
        ('video', 'Video'),
        ('document', 'Hujjat'),
        ('link', 'Havola'),
    ]
    file_type = models.CharField(max_length=10, choices=FILE_TYPE_CHOICES, default='document')
    file_name = models.CharField(max_length=300, default='')
    file_size = models.BigIntegerField(default=0)
    caption = models.CharField(max_length=300, blank=True, default='')
    # O'lchov chizmalari (2026-09-08, TZ-Olchov-Interaktiv-Saqlash) — rasm
    # ustiga chizilgan o'lchov chiziqlarining ALOHIDA ma'lumoti (rasm o'zi
    # HAMON chiziqlar bilan "kuydirilgan" holda saqlanadi — bu esa qayta
    # ochilganda chiziqlarni INTERAKTIV qilib qayta chizish uchun, editordagi
    # `Gallery._measures` bilan BIR XIL struktura):
    # [{id, p1:{x,y}, p2:{x,y}, mm, note, color}, ...] — koordinatalar rasmning
    # asl piksel o'lchamiga (canvas W/H) nisbatan. Bo'sh — measurement yo'q
    # (yoki bu maydon qo'shilishidan OLDIN saqlangan eski rasm).
    measurements = models.JSONField(default=list, blank=True)
    uploaded_by = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='uploaded_files',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return self.file_name


class ClientOrderNote(models.Model):
    """Buyurtma eslatmalari — notebook."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='notes')
    text = models.TextField()
    created_by = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='order_notes',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return self.text[:50]


class ClientOrderTimeline(models.Model):
    """Buyurtma tarixi."""
    order = models.ForeignKey(ClientOrder, on_delete=models.CASCADE, related_name='timeline')
    action = models.CharField(max_length=100)
    note = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
