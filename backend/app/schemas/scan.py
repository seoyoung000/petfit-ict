from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DiagnosisItem(BaseModel):
    condition: str         # 진단명 (한국어)
    confidence: float      # 0.0~1.0
    area: Optional[str]    # 부위 (등, 배, 귀 등)
    action: str            # 권장 조치


class ScanResponse(BaseModel):
    id: str
    pet_id: str
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    health_score: Optional[int]
    severity: Optional[str]
    diagnoses: List[DiagnosisItem]
    medication_dispensed: float
    suction_used: int
    notes: Optional[str]
    scanned_at: datetime

    class Config:
        from_attributes = True


class ScanSummary(BaseModel):
    id: str
    pet_id: str
    thumbnail_url: Optional[str] = None
    health_score: Optional[int]
    severity: Optional[str]
    condition_count: int
    scanned_at: datetime

    class Config:
        from_attributes = True


class DispenseCommand(BaseModel):
    pet_id: str
    amount_ml: float = 0.5
