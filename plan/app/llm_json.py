"""Shared helper for extracting a JSON object from LLM text output."""
from __future__ import annotations
import json
import re


def extract_json_object(raw: str) -> dict:
    """
    Extract the first top-level JSON object from raw LLM text.

    Tolerates markdown code fences and leading/trailing commentary. Uses
    json.JSONDecoder.raw_decode (rather than naive find('{')/rfind('}'))
    so braces inside strings or extra commentary after the object don't
    produce a malformed slice.
    """
    text = raw.strip()
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text.strip())

    decoder = json.JSONDecoder()
    idx = text.find("{")
    while idx != -1:
        try:
            obj, _ = decoder.raw_decode(text, idx)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        idx = text.find("{", idx + 1)

    raise ValueError("LLM returned no JSON object")
