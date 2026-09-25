#!/usr/bin/env python3
"""i18n-pack/apply_i18n.py — 77 ta yangi kalitni ru.js/en.js ga IDEMPOTENT qo'shadi.

Ishlatish (serverda, repo ildizidan):
    python3 DEPLOY-2026-09-23/i18n-pack/apply_i18n.py [repo_ildiz]

Bor kalitlar TEGILMAYDI (skip). Fayl oxiridagi I18n.register ichiga qo'shadi.
Keyin: node --check static/client_erp/js/i18n/ru.js static/client_erp/js/i18n/en.js
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/mebelcity_platform'


def js_entry(uz, tr):
    u = uz.replace('\\', '\\\\')
    t = tr.replace('\\', '\\\\')
    if "'" in u and '"' not in u:
        return f'    "{u}": \'{t}\','
    return f"    '{u.replace(chr(39), chr(92)+chr(39))}': '{t.replace(chr(39), chr(92)+chr(39))}',"


for lang in ('ru', 'en'):
    keys = json.load(open(os.path.join(HERE, f'keys_{lang}.json'), encoding='utf-8'))
    fn = os.path.join(ROOT, 'static/client_erp/js/i18n', f'{lang}.js')
    src = open(fn, encoding='utf-8').read()
    added = 0
    rows = []
    for uz, tr in keys.items():
        if uz in src:
            continue
        rows.append(js_entry(uz, tr))
        added += 1
    if rows:
        pos = src.rstrip().rfind('});')
        assert pos > 0, lang
        src = src[:pos] + '\n'.join(rows) + '\n' + src[pos:]
        open(fn, 'w', encoding='utf-8').write(src)
    print(lang, 'added:', added, 'skipped:', len(keys) - added)
print('OK')
