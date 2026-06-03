"""FastAPI entry point for the Spoticker Plan Mode service."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.pipeline import run_pipeline
from app.schemas import Objective, PlanResult, SourceFile

load_dotenv()

# Validate required env vars at startup
_REQUIRED_ENV = ["ANTHROPIC_API_KEY", "SUPABASE_URL"]
_missing = [k for k in _REQUIRED_ENV if not os.environ.get(k)]
_SECRET = os.environ.get("PLAN_SERVICE_SECRET")

_bearer = HTTPBearer(auto_error=False)

def _check_auth(credentials: HTTPAuthorizationCredentials | None) -> None:
    if not _SECRET:
        return  # no secret configured — open in local dev
    if credentials is None or credentials.credentials != _SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _missing:
        import warnings
        warnings.warn(f"Plan service missing env vars: {_missing}")
    yield


app = FastAPI(
    title="Spoticker Plan Mode",
    version="0.1.0",
    lifespan=lifespan,
)

_CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if not _CORS_ORIGINS:
    _CORS_ORIGINS = ["http://localhost:3000", "https://*.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "missing_env": _missing,
    }


@app.post("/analyze", response_model=PlanResult)
async def analyze(
    files: Annotated[list[UploadFile], File(description="Dockerfile, k8s YAML, Terraform, or Helm values")],
    objective: Annotated[Objective, Form()] = Objective.cost_reliability,
    intent: Annotated[str | None, Form()] = None,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
):
    """
    Run the 5-stage Plan Mode pipeline against uploaded artifact files.
    Returns structured placement recommendations + a deployment-ready diff.
    """
    _check_auth(credentials)

    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    source_files: list[SourceFile] = []
    for upload in files:
        try:
            content = await upload.read()
            source_files.append(SourceFile(
                path=upload.filename or "unknown",
                content=content.decode("utf-8", errors="replace"),
            ))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read {upload.filename}: {exc}")

    if _missing:
        raise HTTPException(
            status_code=503,
            detail=f"Service misconfigured — missing env vars: {_missing}",
        )

    result = run_pipeline(
        files=source_files,
        objective=objective,
        user_intent=intent or None,
    )
    return result

