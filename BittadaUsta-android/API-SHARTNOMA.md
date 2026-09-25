# Server API shartnomasi — avtomatik chiqarilgan

Har amal uchun: so'ralgan maydonlar va qaytariladigan kalitlar.

| Amal | So'rov maydonlari | Javob kalitlari |
|---|---|---|
| `ble.push` | mm, source | mm |
| `lazer.link` | — | url |
| `page.tarif` | — | data |
| `page.tanga` | — | data |
| `pay.start` | provider, purpose, target_id | data |
| `pay.sandbox_confirm` | payment_id | data |
| `pay.status` | payment_id | data |
| `onboarding.accept` | full_name | data |
| `glive.start` | page | data |
| `page.dashboard` | — | data |
| `dashboard.pending_detail` | — | data |
| `page.clients` | — | clients, data |
| `page.client_detail` | id | data |
| `page.orders` | — | — |
| `page.order` | id | data |
| `page.analytics` | date_from, date_to, period, ym | data |
| `analytics.ai` | period | — |
| `analytics.ai_history` | — | data |
| `rate.get` | — | data, rate |
| `page.finance` | date_from, date_to, period, ym | data |
| `page.mebelcity` | date_from, date_to, period, ym | — |
| `mebelcity.order_detail` | id | data |
| `page.vizualizatsiya` | — | data, galleries |
| `panorama.link` | client_order_id, gallery_uuid | — |
| `panorama.link_add` | name, url | data, uuid |
| `page.catalog` | — | data, items |
| `catalog.view` | — | data |
| `page.portfolio` | — | data, items |
| `portfolio.view` | — | data |
| `viz.delete` | gallery_uuid | data |
| `viz.rename` | gallery_uuid, name | data, name |
| `note.create` | order_id, text | data, note |
| `note.update` | note_id, text | data, note |
| `note.delete` | note_id | — |
| `file.delete` | file_id | — |
| `page.oldi_berdi` | — | data |
| `user.set_language` | language | data, language |
| `finance.duplicates` | — | data |
| `finance.duplicate_resolve` | action, group_ids, record_id | data, deleted, kept |
| `profit.proof` | order_id | data |
| `oldi.berdi_detail` | sale_id | data |
| `oldi.berdi_load_more` | limit, offset, period, section | data |
| `mc.order_detail` | code | data |
| `page.settings` | — | data |
| `settings.expense_cat_add` | color, icon, name | categories, data |
| `settings.expense_cat_delete` | key | categories, data |
| `client.create` | address, name, phone | data |
| `client.delete` | id | data |
| `client.update` | id, name, phone | data |
| `order.create` | __err__, __limit__, customer_id, description, template_id, title, zaklad_amount | data |
| `order.update` | fields, id, status_note | data |
| `order.customer_share` | order_id | data |
| `order.customer_unshare` | order_id | — |
| `order.delete` | id, note | data, id |
| `order.restore` | id | data |
| `orders.deleted` | — | data, orders |
| `order.income` | allow_extra, amount, customer_id, description, order_id, payment_method | data |
| `order.expense` | amount, category, description, order_id, payer_id, payment_method, stage_id | data |
| `finance.revert` | amount, order_id, record_id, type | data |
| `order.send_mc` | id | data |
| `stage.create` | checklist, color, estimated_cost, icon, is_mebelcity, mebelcity_order_id, note, order_id | data, progress, stage |
| `stage.link_order` | mebelcity_order_id, stage_id | data, stage |
| `order.link_mebelcity` | mebelcity_order_id, order_id | data |
| `mebelcity.orders_for_stage` | order_title | — |
| `stage.complete` | id | data |
| `stage.skip` | id | data |
| `stage.reopen` | id | data |
| `stage.delete` | id | data |
| `stage.reorder` | ids, order_id | data |
| `stage.check` | item_id, stage_id | data |
| `template.list` | — | data, templates |
| `template.save` | id, items, name | data |
| `template.delete` | id | — |
| `template.apply` | order_id, template_id | data |
| `perm.save` | always, can_add_expense, can_complete_stage, can_see_money, order_id, role, stages, user_id | data |
| `standing.list` | — | data, members, teams |
| `standing.update` | id, role | data |
| `standing.delete` | id | data |
| `team.autoshare_get` | — | data, teams |
| `team.autoshare_set` | auto_role, auto_share_new_orders, team_id | data |
| `perm.delete` | id | data |
| `user.search` | q | data, users |
| `page.team` | — | data |
| `team.create` | description, name | data, team_id |
| `team.update` | description, name | — |
| `team.invite` | profit_percent, query, role | — |
| `team.update_member` | profit_percent, role, user_id | — |
| `team.remove_member` | user_id | — |
| `team.leave` | team_id | — |
| `team.save_template` | lines, name | — |
| `team.delete_template` | id | — |
| `team.accept` | — | — |
| `team.decline` | — | — |
| `profit.withdraw` | client_request_id, lines, order_id, total_profit | — |
| `contacts.search` | q | data, items |
| `profit.accept` | accept, line_id | accepted, data |
| `profit.withdraw_reverse` | note, withdrawal_id | — |
| `team.report` | period | data |
| `team.profit_detail` | date_from, date_to, period, ym | — |
| `profit.people_list` | all | people |
| `profit.people_add` | name | person |
| `profit.people_update` | id, name | person |
| `profit.people_archive` | id, restore | — |
| `profit.people_delete` | id | mode |
| `order.share` | can_add_expense, can_complete, can_edit, order_id, visibility | — |
| `order.unshare` | order_id, reason, team_id | data |
| `notification.read` | all, id | data, marked |
| `profit.save` | order_id, shares | — |
| `supplierdebt.create` | amount, creditor_name, creditor_type, note, order_id, taken_date | id |
| `supplierdebt.pay` | amount, id | remaining |
| `supplierdebt.delete` | id | — |
| `finance.create` | allow_extra, amount, category, confirm_dup, customer_id, description, order_id, payment_method | data |
| `ai.chat` | context, history, text | action, data, degraded, text, usage |
| `debt.create` | amount, customer_id, description, due_date | data |
| `debt.pay` | amount, id | data |
| `finance.withdrawal` | amount, description, payment_method, recipient_name | data |
| `laylo.chat` | quality, text, tts | data |
| `laylo.tts` | text | audio_mime, data |
| `laylo.permissions` | — | data, permissions |
| `settings.contact_admin` | message | data |
| `referral.share` | — | data |
| `settings.password` | current, new | data |
| `settings.delete_account` | password | data |
| `page.zamers` | — | data, zamers |
| `zamer.link` | client_order_id, zamer_id | — |
