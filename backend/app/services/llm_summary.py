from __future__ import annotations

import os
from typing import Any

from openai import OpenAI


def generate_llm_summary(payload: dict[str, Any]) -> dict[str, str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=api_key)

    diagnostics = payload["diagnostics"]
    analysis = payload["analysis"]
    trust = payload.get("trust_score")

    prompt = f"""
You are writing a stakeholder-facing experiment summary for an A/B test review platform.

Your task:
Write 3 sections:
1. executive_summary
2. reliability_note
3. recommendation

Rules:
- Write in plain business English
- Be precise and short
- Separate statistical result from experiment trust
- Mention whether the result is statistically significant
- Mention the confidence interval
- Mention key trust risks such as SRM or missing outcomes
- If trust information is available, use it explicitly
- Recommendation should be practical and decision-oriented
- Do not use markdown
- Return valid JSON only with keys:
  executive_summary, reliability_note, recommendation

Diagnostics:
{diagnostics}

Analysis:
{analysis}

Trust score:
{trust}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You are a precise experimentation analyst who writes concise stakeholder summaries.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    content = response.choices[0].message.content
    if not content:
      raise ValueError("LLM returned empty content.")

    import json
    parsed = json.loads(content)

    return {
        "executive_summary": parsed.get("executive_summary", ""),
        "reliability_note": parsed.get("reliability_note", ""),
        "recommendation": parsed.get("recommendation", ""),
    }