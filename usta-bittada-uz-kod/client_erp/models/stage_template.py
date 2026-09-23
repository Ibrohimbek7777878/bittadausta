"""client_erp/models/stage_template.py — Etap shablonlari."""
from django.db import models


class ClientOrderStageTemplate(models.Model):
    """Foydalanuvchining etap shabloni."""
    owner = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.CASCADE, related_name='stage_templates',
    )
    name = models.CharField(max_length=200)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name


class ClientOrderStageTemplateItem(models.Model):
    """Shablon ichidagi etap."""
    template = models.ForeignKey(
        ClientOrderStageTemplate, on_delete=models.CASCADE, related_name='items',
    )
    title = models.CharField(max_length=200)
    icon = models.CharField(max_length=10, default='📋')
    color = models.CharField(max_length=7, default='#6366f1')
    sort_order = models.IntegerField(default=0)
    is_mebelcity = models.BooleanField(default=False)
    note = models.CharField(max_length=500, blank=True, default='')
    estimated_cost = models.IntegerField(default=0)
    checklist_json = models.JSONField(default=list, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.sort_order}. {self.title}"
