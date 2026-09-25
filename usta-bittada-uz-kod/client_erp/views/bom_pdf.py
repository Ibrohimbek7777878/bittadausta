"""client_erp/views/bom_pdf.py — Mini ERP uchun Bazis smeta (BOM) PDF yuklab olish.

Katta ERP'dagi bom.views.snapshot_pdf `_can_edit` (is_staff) talab qiladi — mini
foydalanuvchi (ClientUser) uchun yaramaydi. Bu yerda ClientUser egaligini tekshirib,
mijoz uchun toza smeta PDF (tannarx yashirin) beriladi.

Usta hostда: /bom/snapshot/<id>/pdf/ → nginx → /mini/bom/snapshot/<id>/pdf/.
"""
import logging
from django.http import HttpResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger('client_erp.bom_pdf')


@require_GET
def bom_pdf_mini(request, snapshot_id):
    user = getattr(request, 'client_user', None)
    if not user:
        return HttpResponse("Auth kerak", status=401)

    from django.db.models import Q
    from bom.models import BomSnapshot
    from bom.services.pdf import build_bom_pdf
    from client_erp.models import ClientOrder, ClientOrderStage
    from tenant_manager.middleware import get_current_db_alias
    from django.utils import timezone

    db = get_current_db_alias()
    snap = BomSnapshot.objects.using(db).filter(id=snapshot_id).first()
    if not snap:
        return HttpResponse('Smeta topilmadi', status=404)

    src = snap.source_order_id
    # Egalik: (1) src to'g'ridan-to'g'ri ClientOrder bo'lsa egasi/ulashilgan;
    #         (2) src MebelCity order id bo'lsa — user etapi orqali bog'langan.
    accessible = (
        ClientOrder.objects.filter(pk=src)
        .filter(Q(owner=user) | Q(permissions__user=user)).exists()
        or ClientOrderStage.objects.filter(mebelcity_order_id=src)
        .filter(Q(order__owner=user) | Q(order__permissions__user=user)).exists()
    )
    if not accessible:
        return HttpResponse("Ruxsat yo'q", status=403)

    # Owner/mijoz/loyiha nomlari — bom.views yordamchi funksiyalarini qayta ishlatamiz
    try:
        from bom.views import _order_names, _project_name
        owner_name, client_name = _order_names(db, src)
        project = _project_name(db, snap)
    except Exception:
        owner_name = client_name = project = ''
    try:
        date_str = timezone.localtime().strftime('%d.%m.%Y')
    except Exception:
        date_str = ''

    pdf = build_bom_pdf(snap, db_alias=db, owner_name=owner_name,
                        client_name=client_name, project_name=project, date_str=date_str)
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = 'inline; filename="smeta-%s.pdf"' % snap.id
    return resp
