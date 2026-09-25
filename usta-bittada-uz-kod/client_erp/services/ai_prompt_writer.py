"""client_erp/services/ai_prompt_writer.py — AI-rasm tayyor promptlarni Claude opus-4-8 orqali yozdirish.

Mahsulot nomi yoki uslub nomidan (masalan "Кромка 19/04 ПВХ Бежевый" yoki "Ispancha uslub")
tayyor, ishlatishga tayyor inglizcha AI-rasm-tahrirlash prompt matni yoziladi.
Xato bo'lsa — oddiy fallback matn qaytariladi, butun partiya to'xtamaydi.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

_SYSTEM_PRODUCT = """You are an expert AI prompt engineer for furniture/interior photo editing.
Given the name of a furniture product or material (it may be in Uzbek or Russian, and may look
like a raw warehouse SKU), write ONE ready-to-use English instruction that a furniture-shop
employee can paste as-is into an AI image editor to transform a photo of furniture so it
features this product's material, color, or style.

Rules:
1. Output ONLY the instruction sentence(s) — no quotes, no preamble, no explanation.
2. 20-60 words, specific about color/material/texture where the name implies it.
3. Mention professional interior photography quality (lighting, realistic materials).
4. If the name is a generic material/edge-band/hardware SKU, describe the material/color it
   implies applying to the furniture in the photo, still framed as a photo-edit instruction."""

_SYSTEM_STYLE = """You are an expert AI prompt engineer for furniture/interior photo editing.
Given the name of an interior DESIGN STYLE (e.g. a room type or a design tradition), write ONE
ready-to-use English instruction that a furniture-shop employee can paste as-is into an AI image
editor to transform an uploaded furniture photo into that style.

Rules:
1. Output ONLY the instruction sentence(s) — no quotes, no preamble, no explanation.
2. 25-70 words, concrete about colors, materials, lighting, and mood typical of that style.
3. Mention professional interior photography quality.
4. Preserve the furniture's basic shape/function — only restyle materials, colors, and setting."""


def write_ai_prompt(subject, kind='product'):
    """kind: 'product' yoki 'style'. Claude opus-4-8 orqali tayyor prompt matnini qaytaradi.

    Returns: (prompt_text, ok). ok=False bo'lsa prompt_text — oddiy fallback matn.
    CHAQIRUVCHI: ok=False va bazada allaqachon yaxshi (AI yozgan) matn bo'lsa,
    uni fallback bilan USTIDAN YOZMASLIK kerak — xato vaqtinchalik bo'lishi mumkin.
    """
    fallback = (
        f"Ushbu mebelni «{subject}» mahsulotiga o'xshash uslub, rang va materialda, "
        f"professional interyer dizayni sifatida qayta chiz."
    )
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return fallback, False

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        system = _SYSTEM_STYLE if kind == 'style' else _SYSTEM_PRODUCT
        label = 'Interior style' if kind == 'style' else 'Product/material name'
        resp = client.messages.create(
            model='claude-opus-4-8',
            max_tokens=200,
            system=system,
            messages=[{'role': 'user', 'content': f'{label}: {subject}\n\nInstruction:'}],
        )
        text = resp.content[0].text.strip()
        return (text, True) if text else (fallback, False)
    except Exception as e:
        logger.warning('AI prompt yozishda xato (%s, %s): %s', kind, subject, e)
        return fallback, False
