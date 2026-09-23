"""client_erp/routing.py — WebSocket URL routing."""
from django.urls import path
from . import consumers
from . import glive_consumer

websocket_urlpatterns = [
    # Gemini Live server-side proxy — asosiy consumerdan OLDIN (aniqroq yo'l).
    path("ws/mini/<str:username>/glive/", glive_consumer.GeminiLiveConsumer.as_asgi()),
    path("ws/mini/<str:username>/", consumers.MiniERPConsumer.as_asgi()),
]
