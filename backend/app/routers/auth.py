from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse, DeviceTokenUpdate
from app.services import auth_service
from app.services.notification_service import register_device

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user_id = auth_service.decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")
    user = auth_service.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")
    return user


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: UserCreate, db: Session = Depends(get_db)):
    if auth_service.get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")
    user = User(
        email=body.email,
        name=body.name,
        hashed_password=auth_service.hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_service.create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = auth_service.get_user_by_email(db, body.email)
    if not user or not auth_service.verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    token = auth_service.create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/device-token")
def update_device_token(
    body: DeviceTokenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.device_token = body.device_token
    current_user.platform = body.platform
    db.commit()
    return {"ok": True}
