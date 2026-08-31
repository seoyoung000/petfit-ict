from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class Pet(Base):
    __tablename__ = "pets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)
    species = Column(String, nullable=False)  # dog / cat
    breed = Column(String, nullable=True)
    age_months = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    gender = Column(String, nullable=True)  # male / female
    neutered = Column(Boolean, default=False)
    profile_image_key = Column(String, nullable=True)  # S3 key

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="pets")
    scans = relationship("Scan", back_populates="pet", cascade="all, delete-orphan")
