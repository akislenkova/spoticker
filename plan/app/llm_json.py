"""Shared helper for extracting a JSON object from LLM text output."""
from __future__ import annotations
import json
import re


def extract_json_object(raw: str) -> dict:
    """
    Extract the last top-level JSON object from raw LLM text.

    Tolerates markdown code fences and leading/trailing commentary. Uses
    json.JSONDecoder.raw_decode (rather than naive find('{')/rfind('}'))
    so braces inside strings or extra commentary after the object don't
    produce a malformed slice. Takes the *last* valid top-level object
    rather than the first, since a model that doesn't follow the
    "no markdown wrapper" instruction tends to front-load caveats/examples
    (which can themselves be small valid JSON objects) before the real
    answer, not the other way around.
    """
    text = raw.strip()
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text.strip())

    decoder = json.JSONDecoder()
    found: dict | None = None
    idx = text.find("{")
    while idx != -1:
        try:
            obj, end = decoder.raw_decode(text, idx)
            if isinstance(obj, dict):
                found = obj
            idx = text.find("{", end)
        except json.JSONDecodeError:
            idx = text.find("{", idx + 1)

    if found is None:
        raise ValueError("LLM returned no JSON object")
    return found
