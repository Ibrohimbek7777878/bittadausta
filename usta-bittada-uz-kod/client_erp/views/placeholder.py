"""client_erp/views/placeholder.py — Hali tayyor bo'lmagan sahifalar uchun."""
from django.shortcuts import render


def _page(request, username, page_name, icon):
    return render(request, 'client_erp/pages/placeholder.html', {
        'user': request.client_user,
        'page_name': page_name,
        'icon': icon,
    })


def mini_clients(request, username):
    return _page(request, username, 'Mijozlarim', 'fas fa-users')

def mini_orders(request, username):
    return _page(request, username, 'Buyurtmalar', 'fas fa-clipboard-list')

def mini_finance(request, username):
    return _page(request, username, 'Moliya', 'fas fa-coins')

def mini_zamers(request, username):
    return _page(request, username, 'Zamerlar', 'fas fa-ruler-combined')

def mini_portfolio(request, username):
    return _page(request, username, 'Portfolio', 'fas fa-images')

def mini_mebelcity(request, username):
    return _page(request, username, 'MebelCity buyurtmalar', 'fas fa-industry')

def mini_settings(request, username):
    return _page(request, username, 'Sozlamalar', 'fas fa-cog')
