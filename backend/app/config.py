from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Petfit API"
    DEBUG: bool = False

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Storage
    USE_LOCAL_STORAGE: bool = False
    LOCAL_STORAGE_DIR: str = "uploads"
    LOCAL_STORAGE_BASE_URL: str = "http://localhost:8000/uploads"

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET_NAME: str = ""

    FCM_SERVER_KEY: str = ""
    SNS_PLATFORM_ARN_IOS: str = ""
    SNS_PLATFORM_ARN_ANDROID: str = ""

    # AI
    AI_MODEL_DIR: str = ""
    AI_CONFIDENCE_THRESHOLD: float = 0.4
    # 질환/정상 2분류 모델은 질환 확률이 정상보다 높아야(>0.5) 질환으로 본다
    AI_BINARY_THRESHOLD: float = 0.5
    # 모델은 병변만 잘라낸 사진으로 학습됐으므로 사진 가운데 이 비율(짧은 변 기준)만 잘라 넣는다
    AI_CENTER_CROP: float = 0.7
    AI_USE_MOCK: bool = True

    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
