from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime, JSON, func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    pet_id = Column(String, ForeignKey("pets.id"), nullable=False)

    image_key = Column(String, nullable=True)           # S3 key for raw image
    thumbnail_key = Column(String, nullable=True)       # S3 key for thumbnail

    health_score = Column(Integer, nullable=True)       # 0~100
    severity = Column(String, nullable=True)            # normal / minor / warning / critical

    # AI diagnosis result stored as JSON list
    # e.g. [{"condition": "아토피 피부염", "confidence": 0.87, "area": "등", "action": "진료 권장"}]
    diagnoses = Column(JSON, default=list)

    medication_dispensed = Column(Float, default=0.0)   # ml dispensed
    suction_used = Column(Integer, default=0)           # seconds of suction

    notes = Column(String, nullable=True)
    scanned_at = Column(DateTime, server_default=func.now())

    pet = relationship("Pet", back_populates="scans")
