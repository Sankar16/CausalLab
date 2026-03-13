from __future__ import annotations

import json
import os
from openai import OpenAI


def generate_executive_summary(payload: dict) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
      raise ValueError("OPENAI_API_KEY is not set in the backend environment.")

    client = OpenAI(api_key=api_key)

    diagnostics = payload["diagnostics"]
    analysis = payload["analysis"]
    metadata = payload.get("metadata", {})

    prompt = f"""
You are writing a professional A/B testing report summary for a business stakeholder.

Use ONLY the structured data provided below.
Do not invent numbers.
Do not recalculate statistics.
Write clearly and professionally in plain English.

Return valid JSON with exactly these keys:
- executive_summary
- reliability_note
- recommendation

Metadata:
{json.dumps(metadata, indent=2)}

Diagnostics:
{json.dumps(diagnostics, indent=2)}

Analysis:
{json.dumps(analysis, indent=2)}

Instructions:
- executive_summary: 4-6 sentences
- reliability_note: 2-4 sentences
- recommendation: 2-4 sentences
- If diagnostics contain SRM or missing-outcome warnings, clearly say the result should be interpreted cautiously.
- If diagnostics are clean, say confidence is relatively stronger.
- Make it easy for a stakeholder to understand.
"""

    response = client.responses.create(
        model="gpt-5.2",
        input=prompt,
    )

    text = response.output_text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {
            "executive_summary": text,
            "reliability_note": "",
            "recommendation": "",
        }

    return {
        "executive_summary": parsed.get("executive_summary", ""),
        "reliability_note": parsed.get("reliability_note", ""),
        "recommendation": parsed.get("recommendation", ""),
    }