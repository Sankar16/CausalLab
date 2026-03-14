from __future__ import annotations

import json
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
You are writing a stakeholder-facing experiment summary for an A/B testing review platform.

Write 3 sections:
1. executive_summary
2. reliability_note
3. recommendation

Rules:
- Write in plain business English
- Be precise and concise
- Separate statistical result from trustworthiness
- Mention whether the result is statistically significant
- Mention the confidence interval
- Mention trust risks such as SRM or missing outcomes
- If adjusted analysis is available, mention whether it is directionally consistent with the unadjusted result
- If adjusted analysis is unavailable, briefly explain that covariate-adjusted analysis could not be fit safely
- If trust information is available, use it explicitly
- Return valid JSON only with keys:
  executive_summary, reliability_note, recommendation

Diagnostics:
{json.dumps(diagnostics)}

Analysis:
{json.dumps(analysis)}

Trust score:
{json.dumps(trust)}
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

    parsed = json.loads(content)

    return {
        "executive_summary": parsed.get("executive_summary", ""),
        "reliability_note": parsed.get("reliability_note", ""),
        "recommendation": parsed.get("recommendation", ""),
    }