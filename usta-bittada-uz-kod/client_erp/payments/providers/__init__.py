"""client_erp/payments/providers — konkret provayderlar.

Har bir modul import bo'lganda o'zini `base.register()` orqali PROVIDERS
registryga qo'shadi. Shu paketni import qilishning o'zi barcha provayderlarni
ro'yxatga oladi.

Sandbox BIRINCHI import qilinadi — boshqa provayderlar unga fallback qiladi.
"""
from .sandbox import SandboxProvider
from .payme import PaymeProvider
from .click import ClickProvider
from .octobank import OctobankProvider
from .multicard import MulticardProvider

__all__ = [
    'SandboxProvider',
    'PaymeProvider',
    'ClickProvider',
    'OctobankProvider',
    'MulticardProvider',
]
