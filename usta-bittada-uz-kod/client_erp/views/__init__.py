"""client_erp/views/__init__.py"""
from .auth import mini_login, mini_logout
from .dashboard import mini_dashboard
from .admin import mini_admin_dashboard, mini_admin_create_user, mini_admin_generate_password, mini_admin_toggle
from .customers import mini_clients, mini_client_create, mini_client_delete
from .orders import mini_orders, mini_order_detail, mini_order_create, mini_order_update
from .finance import mini_finance, mini_finance_create, mini_debt_create, mini_debt_pay
from .zamers import mini_zamers, mini_zamer_create
from .portfolio import mini_portfolio
from .mebelcity import mini_mebelcity
from .settings import mini_settings, mini_change_password
