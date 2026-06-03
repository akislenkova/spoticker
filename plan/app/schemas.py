from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    dockerfile = "dockerfile"
    k8s_manifest = "k8s_manifest"
    terraform = "terraform"
    helm = "helm"
    unknown = "unknown"


class WorkloadKind(str, Enum):
    training = "training"
    inference = "inference"
    batch = "batch"
    unknown = "unknown"


class FieldConfidence(str, Enum):
    explicit = "explicit"
    inferred = "inferred"
    unknown = "unknown"


class Objective(str, Enum):
    cost = "cost"
    cost_reliability = "cost_reliability"
    ha_multi_cloud = "ha_multi_cloud"


class SourceFile(BaseModel):
    path: str
    content: str


class WorkloadSpec(BaseModel):
    kind: WorkloadKind = WorkloadKind.unknown
    image: str | None = None
    command: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)


class ResourceSpec(BaseModel):
    gpu_count: int | None = None
    gpu_type: str | None = None  # e.g. "A100-80GB", "H100", "T4"
    cpu_request: str | None = None
    memory_request: str | None = None
    replicas: int = 1


class SchedulingSpec(BaseModel):
    node_selectors: dict[str, str] = Field(default_factory=dict)
    tolerations: list[dict[str, Any]] = Field(default_factory=list)
    use_spot: bool | None = None


class ExtractedSpec(BaseModel):
    source_type: SourceType = SourceType.unknown
    source_files: list[SourceFile] = Field(default_factory=list)
    workload: WorkloadSpec = Field(default_factory=WorkloadSpec)
    resources: ResourceSpec = Field(default_factory=ResourceSpec)
    scheduling: SchedulingSpec = Field(default_factory=SchedulingSpec)
    extraction_confidence: dict[str, FieldConfidence] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    inference_notes: dict[str, str] = Field(default_factory=dict)
    still_unknown: list[str] = Field(default_factory=list)
    duration_hours: float | None = None
    user_intent: str | None = None


class EvictionConfidence(str, Enum):
    high = "high"
    low = "low"


class PlacementCandidate(BaseModel):
    cloud: str
    region: str
    sku: str
    gpu_type: str
    gpu_count: int
    hourly_price: float
    eviction_rate_pct: float | None = None
    eviction_confidence: EvictionConfidence = EvictionConfidence.high
    estimated_total: float | None = None
    estimated_savings_vs_ondemand: float | None = None
    savings_pct: int | None = None
    ondemand_price: float | None = None
    rationale: list[str] = Field(default_factory=list)
    ondemand_url: str | None = None


class DiffChange(BaseModel):
    field: str
    value: Any
    reason: str


class RewriteResult(BaseModel):
    unified_diff: str
    additions: list[DiffChange] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    migration_commands: list[str] = Field(default_factory=list)
    validation_failed: bool = False
    validator_output: str | None = None


class PlanResult(BaseModel):
    spec: ExtractedSpec
    candidates: list[PlacementCandidate]
    chosen: PlacementCandidate | None = None
    rewrite: RewriteResult | None = None
    validation_passed: bool = False
    error: str | None = None
