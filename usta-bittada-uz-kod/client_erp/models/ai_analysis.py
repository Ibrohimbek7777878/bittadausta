"""client_erp/models/ai_analysis.py — AI tahlil natijalari."""
from django.db import models


class ClientAIAnalysis(models.Model):
    owner = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='ai_analyses',
    )
    period = models.CharField(max_length=10, default='month')
    analysis_text = models.TextField()
    recommendations = models.JSONField(default=list, blank=True)
    coins_spent = models.IntegerField(default=0)
    analytics_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"AI Analysis #{self.pk} — {self.owner} ({self.period})"
