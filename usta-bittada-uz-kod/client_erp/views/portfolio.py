"""client_erp/views/portfolio.py — Portfolio."""
from django.shortcuts import render
from ..models import ClientPortfolioItem


def mini_portfolio(request, username):
    user = request.client_user
    items = ClientPortfolioItem.objects.filter(owner=user).order_by('-created_at')
    return render(request, 'client_erp/pages/portfolio/list.html', {'user': user, 'items': items})
