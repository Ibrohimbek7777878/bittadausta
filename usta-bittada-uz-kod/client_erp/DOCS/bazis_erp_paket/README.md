# Bazis B3D → ERP narx moduli — paket

Bu paket Bazis `.b3d` chizmasidan narx hisoblash uchun.

## Ichida
- **CLAUDE_CODE_PROMPT.md** — Claude Code'ga beriladigan vazifa (shuni ko'chiring).
- **B3D_PARSER_BILIM.md** — B3D formati va parser haqida TO'LIQ texnik bilim (ishlaган/sinalган/ocholmagan). Claude Code avval shuni o'qisin.
- **bazis_bom.js** — Node/brauzer parser + BOM (faqat `pako` kerak).
- **b3d_full_parser.py** — Python parser + BOM.
- **bazis_batch.py** — minglab faylни partiyali tekshiruvchi (mustaqil, stdlib).

## Qanday ishlatish
1. Bu zipни ERP loyihangizga yuklang.
2. Claude Code'ni oching, `CLAUDE_CODE_PROMPT.md` matnини bering.
3. Claude Code avval `B3D_PARSER_BILIM.md` ни o'qiydi, keyin parserni o'rab narx modulini quradi.

## Talablar
- JS: `npm i pako`
- Python: standart kutubxona (qo'shimcha kerak emas)

## Parser tasdiqlangan
918+ haqiqiy faylда sinalган, rasmiy Bazis BPJ eksporti bilan solishtirib tasdiqlangan (pozitsiya/o'lcham xato 0.0).
