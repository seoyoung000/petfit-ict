from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PetCreate(BaseModel):
    name: str
    species: str
    breed: Optional[str] = None
    age_months: Optional[int] = None
    weight_kg: Optional[float] = None
    gender: Optional[str] = None
    neutered: bool = False


class PetUpdate(BaseModel):
    name: Optional[str] = None
    breed: Optional[str] = None
    age_months: Optional[int] = None
    weight_kg: Optional[float] = None
    gender: Optional[str] = None
    neutered: Optional[bool] = None


class PetResponse(BaseModel):
    id: str
    name: str
    species: str
    breed: Optional[str]
    age_months: Optional[int]
    weight_kg: Optional[float]
    gender: Optional[str]
    neutered: bool
    profile_image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
