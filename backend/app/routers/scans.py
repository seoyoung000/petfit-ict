from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.scan import Scan
from app.models.pet import Pet
from app.schemas.scan import ScanResponse, ScanSummary
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.s3_service import upload_image, get_presigned_url
from app.services.ai_service import run_inference, calculate_health_score, get_severity
from app.services.notification_service import send_scan_complete

router = APIRouter(prefix="/scans", tags=["scans"])


def _enrich(scan: Scan) -> ScanResponse:
    data = ScanResponse.model_validate(scan)
    if scan.image_key:
        data.image_url = get_presigned_url(scan.image_key)
    if scan.thumbnail_key:
        data.thumbnail_url = get_presigned_url(scan.thumbnail_key)
    return data


@router.post("/upload", response_model=ScanResponse, status_code=201)
async def upload_scan(
    pet_id: str = Form(...),
    medication_dispensed: float = Form(0.0),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")

    image_key = None
    diagnoses = []

    if file:
        contents = await file.read()
        image_key = upload_image(contents, prefix=f"scans/{pet_id}")
        # 동기 TF 추론이라 스레드풀로 넘긴다. 안 그러면 추론하는 동안
        # 이벤트 루프가 막혀서 다른 요청까지 전부 대기하게 된다.
        diagnoses = await run_in_threadpool(run_inference, contents, pet.species)

    diagnoses_dict = [d.model_dump() for d in diagnoses]
    health_score = calculate_health_score(diagnoses)
    severity = get_severity(diagnoses)

    scan = Scan(
        pet_id=pet_id,
        image_key=image_key,
        health_score=health_score,
        severity=severity,
        diagnoses=diagnoses_dict,
        medication_dispensed=medication_dispensed,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # 푸시 알림
    if current_user.device_token:
        send_scan_complete(current_user.device_token, pet.name, severity)

    return _enrich(scan)


@router.get("/history/{pet_id}", response_model=List[ScanSummary])
def get_history(
    pet_id: str,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.owner_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="반려동물을 찾을 수 없습니다.")

    scans = (
        db.query(Scan)
        .filter(Scan.pet_id == pet_id)
        .order_by(Scan.scanned_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for s in scans:
        thumbnail_url = get_presigned_url(s.thumbnail_key) if s.thumbnail_key else (
            get_presigned_url(s.image_key) if s.image_key else None
        )
        result.append(ScanSummary(
            id=s.id,
            pet_id=s.pet_id,
            thumbnail_url=thumbnail_url,
            health_score=s.health_score,
            severity=s.severity,
            condition_count=len(s.diagnoses or []),
            scanned_at=s.scanned_at,
        ))
    return result


@router.get("/{scan_id}", response_model=ScanResponse)
def get_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.query(Scan).join(Pet).filter(
        Scan.id == scan_id,
        Pet.owner_id == current_user.id,
    ).first()
    if not scan:
        raise HTTPException(status_code=404, detail="스캔 결과를 찾을 수 없습니다.")
    return _enrich(scan)
