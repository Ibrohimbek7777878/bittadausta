"""client_erp/models/__init__.py"""
from .user import ClientUser, ClientLoginAttempt
from .customer import ClientCustomer
from .order import (
    ClientOrder, ClientOrderItem, ClientOrderPhoto, ClientOrderTimeline,
    ClientOrderStage, ClientOrderStageItem,
    ClientOrderFile, ClientOrderNote,
)
from .stage_template import ClientOrderStageTemplate, ClientOrderStageTemplateItem
from .permission import ClientOrderPermission
from .finance import ClientFinanceRecord, ClientFinanceLog, ClientDebt, ClientDebtPayment, ClientFinanceMonthArchive
from .zamer import ClientZamer, ClientZamerRoom, ClientZamerItem
from .room_capture import RoomCapture, RoomWallSegment, PlacedModule
from .room_plan_import import RoomPlanImport   # chizmadan xona (§F2)
from .client_error import ClientErrorLog      # brauzer xatolari jurnali
from .server_error import ServerErrorLog      # server (backend) xatolari jurnali
from .detal_qr import ClientDetalCard         # Detal QR (Bazis eksport → QR sahifa)
from .supplier_debt import ClientSupplierDebt
from .expense_share import ClientOrderExpenseShare
from .portfolio import (
    ClientPortfolioItem, ClientNotification,
    ClientAchievement, ClientUserAchievement, ClientVIPLevel,
)
from .ai_analysis import ClientAIAnalysis
from .catalog import ClientFeaturedProduct
from .prompt_preset import PromptPreset
from .contract import ClientContract
from .order_status import ClientOrderStatusDef, SYSTEM_KEYS
from .team import (
    ClientTeam, ClientTeamMember, ClientOrderShare,
    ClientOrderProfitShare, ClientProfitTemplate, ClientProfitTemplateLine,
    ClientProfitWithdrawal, ClientProfitWithdrawalLine,
    ClientStandingShare, ClientProfitPerson, ClientMonthEndReminderLog,
    ClientProfitAudit, ClientPendingInvite, AppSetting,
)
from .gamification import (
    GamificationRule, XPTransaction,
    Announcement, MonthlyDiscount,
    Event, EventParticipant,
    RewardItem, RewardClaim,
    Quest, QuestCompletion,
)
from .plan import ClientPlan, ClientSubscription
from .billing import CoinPack, ClientAIPrice, CoinLedger, ClientAiUsage
from .payments import ClientPayment, SavedCard, PaymentAttempt, PaymeMerchantTxn

__all__ = [
    'ClientUser', 'ClientLoginAttempt',
    'ClientCustomer',
    'ClientOrder', 'ClientOrderItem', 'ClientOrderPhoto', 'ClientOrderTimeline',
    'ClientOrderStage', 'ClientOrderStageItem',
    'ClientOrderFile', 'ClientOrderNote',
    'ClientOrderStageTemplate', 'ClientOrderStageTemplateItem',
    'ClientOrderPermission',
    'ClientFinanceRecord', 'ClientFinanceLog', 'ClientDebt', 'ClientDebtPayment', 'ClientFinanceMonthArchive',
    'ClientZamer', 'ClientZamerRoom', 'ClientZamerItem',
    'ClientPortfolioItem', 'ClientNotification',
    'ClientAchievement', 'ClientUserAchievement', 'ClientVIPLevel',
    'GamificationRule', 'XPTransaction',
    'Announcement', 'MonthlyDiscount',
    'Event', 'EventParticipant',
    'RewardItem', 'RewardClaim',
    'Quest', 'QuestCompletion',
    'ClientAIAnalysis',
    'ClientTeam', 'ClientTeamMember', 'ClientOrderShare',
    'ClientOrderProfitShare', 'ClientProfitTemplate', 'ClientProfitTemplateLine',
    'ClientStandingShare', 'ClientProfitPerson', 'ClientMonthEndReminderLog', 'ClientProfitAudit',
    'PromptPreset',
    'ClientContract',
    'ClientOrderStatusDef', 'SYSTEM_KEYS',
    'ClientPlan', 'ClientSubscription',
    'CoinPack', 'ClientAIPrice', 'CoinLedger', 'ClientAiUsage',
    'ClientPayment', 'SavedCard', 'PaymentAttempt', 'PaymeMerchantTxn',
    'ClientFeaturedProduct',
    'RoomCapture', 'RoomPlanImport', 'ClientErrorLog', 'RoomWallSegment', 'PlacedModule',
    'ClientSupplierDebt',
    'ClientOrderExpenseShare',
]
