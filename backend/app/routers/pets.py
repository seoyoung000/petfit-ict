from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.pet import Pet
from app.schemas.pet import PetCreate, PetUpdate, PetResponse
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.s3_service import upload_image, get_presigned_url, delete_object

router = APIRouter(prefix="/pets", tags=["pets"])


def _to_response(pet: Pet) -> PetResponse:
    data = PetResponse.model_validate(pet)
    if pet.profile_image_key:
        data.profile_image_url = get_presigned_url(pet.profile_image_key)
    return data


@router.get("", response_model=List[PetResponse])
def list_pets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pets = db.query(Pet).filter(Pet.owner_id == current_user.id).all()
    return [_to_response(p) for p in pets]


@router.post("", response_model=PetResponse, status_code=201)
def create_pet(body: PetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = Pet(owner_id=current_user.id, **body.model_dump())
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return _to_response(pet)


@router.get("/{pet_id}", response_model=PetResponse)
def get_pet(pet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")
    return _to_response(pet)


@router.put("/{pet_id}", response_model=PetResponse)
def update_pet(pet_id: str, body: PetUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(pet, k, v)
    db.commit()
    db.refresh(pet)
    return _to_response(pet)


@router.delete("/{pet_id}", status_code=204)
def delete_pet(pet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")
    if pet.profile_image_key:
        delete_object(pet.profile_image_key)
    db.delete(pet)
    db.commit()


@router.post("/{pet_id}/photo", response_model=PetResponse)
async def upload_photo(
    pet_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")
    if pet.profile_image_key:
        delete_object(pet.profile_image_key)
    contents = await file.read()
    key = upload_image(contents, prefix=f"pets/{pet_id}/profile")
    pet.profile_image_key = key
    db.commit()
    db.refresh(pet)
    return _to_response(pet)
