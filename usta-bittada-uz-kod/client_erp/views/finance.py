"""client_erp/views/finance.py — Moliya (kirim-chiqim, qarz)."""
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db.models import Sum, Q
from ..models import ClientFinanceRecord, ClientDebt, ClientDebtPayment, ClientCustomer
from django.utils import timezone


def mini_finance(request, username):
    user = request.client_user
    tab = request.GET.get('tab', 'all')

    base_qs = ClientFinanceRecord.objects.filter(owner=user, is_deleted=False).select_related('customer', 'order')

    if tab == 'income':
        records = base_qs.filter(record_type='income')
    elif tab == 'expense':
        records = base_qs.filter(record_type='expense')
    elif tab == 'withdrawal':
        records = base_qs.filter(record_type='withdrawal')
    else:
        records = base_qs

    records = records.order_by('-date', '-created_at')[:50]

    debts = ClientDebt.objects.filter(owner=user, status__in=['active', 'partial']).select_related('customer')

    income = base_qs.filter(record_type='income').aggregate(t=Sum('amount'))['t'] or 0
    expense = base_qs.filter(record_type='expense').aggregate(t=Sum('amount'))['t'] or 0
    withdrawal = base_qs.filter(record_type='withdrawal').aggregate(t=Sum('amount'))['t'] or 0
    total_debt = debts.aggregate(t=Sum('remaining'))['t'] or 0
    profit = income - expense
    balance = profit - withdrawal

    return render(request, 'client_erp/pages/finance/list.html', {
        'user': user, 'records': records, 'debts': debts,
        'income': income, 'expense': expense, 'total_debt': total_debt,
        'profit': profit, 'withdrawal': withdrawal, 'balance': balance,
        'tab': tab,
        'customers': ClientCustomer.objects.filter(owner=user),
    })


@require_POST
def mini_finance_create(request, username):
    user = request.client_user
    body = json.loads(request.body)
    r = ClientFinanceRecord.objects.create(
        owner=user,
        record_type=body.get('record_type', 'income'),
        amount=body.get('amount', 0),
        category=body.get('category', ''),
        payment_method=body.get('payment_method', 'cash'),
        description=body.get('description', ''),
        date=body.get('date') or timezone.localdate(),
        customer_id=body.get('customer_id') or None,
        order_id=body.get('order_id') or None,
    )
    return JsonResponse({'ok': True, 'id': r.id})


@require_POST
def mini_debt_create(request, username):
    user = request.client_user
    body = json.loads(request.body)
    amount = float(body.get('amount', 0))
    d = ClientDebt.objects.create(
        owner=user,
        customer_id=body.get('customer_id'),
        order_id=body.get('order_id') or None,
        original_amount=amount, remaining=amount,
        due_date=body.get('due_date') or None,
    )
    return JsonResponse({'ok': True, 'id': d.id})


@require_POST
def mini_debt_pay(request, username, pk):
    user = request.client_user
    body = json.loads(request.body)
    from decimal import Decimal
    debt = ClientDebt.objects.filter(pk=pk, owner=user).first()
    if not debt:
        return JsonResponse({'error': 'Topilmadi'}, status=404)
    amount = Decimal(str(body.get('amount', 0)))
    ClientDebtPayment.objects.create(debt=debt, amount=amount, date=body.get('date') or timezone.localdate())
    debt.paid_amount += amount
    debt.remaining = max(Decimal(0), debt.original_amount - debt.paid_amount)
    debt.status = 'paid' if debt.remaining <= 0 else 'partial'
    debt.save()
    return JsonResponse({'ok': True, 'remaining': float(debt.remaining)})


@require_POST
def mini_withdrawal(request, username):
    """POST /mini/<username>/finance/withdrawal/ — pul yechish."""
    user = request.client_user
    body = json.loads(request.body)
    from decimal import Decimal
    amount = Decimal(str(body.get('amount', 0)))
    if amount <= 0:
        return JsonResponse({'error': 'Summa musbat bo\'lishi kerak'}, status=400)

    rec = ClientFinanceRecord.objects.create(
        owner=user,
        record_type='withdrawal',
        amount=amount,
        payment_method=body.get('payment_method', 'cash'),
        description=body.get('description', 'Pul yechish'),
        date=body.get('date') or timezone.localdate(),
    )
    return JsonResponse({'ok': True, 'id': rec.id})
