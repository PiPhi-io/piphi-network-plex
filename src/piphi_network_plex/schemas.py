from __future__ import annotations

from pydantic import BaseModel, Field, field_validator
from piphi_runtime_kit_python import RuntimeConfig


class DeviceConfig(RuntimeConfig):
    host: str = ""
    alias: str | None = None
    token: str = Field(min_length=1, repr=False)
    base_url: str = ""
    poll_interval_seconds: int = Field(default=15, ge=5, le=3600)
    include_remote_servers: bool = True
    verify_tls: bool = True

    @field_validator("base_url", "host")
    @classmethod
    def normalize_location(cls, value: str) -> str:
        return value.strip().rstrip("/")


class ProviderResolveRequest(BaseModel):
    item_id: str
