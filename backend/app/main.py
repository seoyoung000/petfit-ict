from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import get_settings
from app.database import Base, engine
from app.routers import auth, pets, scans, devices
from app.services.ai_service import warmup_models
import app.models  # noqa: F401 – ensures all models are registered

settings = get_settings()

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 요청 경로 밖에서 모델 로딩 비용을 미리 치른다.
    await run_in_threadpool(warmup_models)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 로컬 모드: 업로드된 이미지를 정적으로 서빙
if settings.USE_LOCAL_STORAGE:
    Path(settings.LOCAL_STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.LOCAL_STORAGE_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(scans.router)
app.include_router(devices.router)


@app.get("/health")
def health():
    return {"status": "ok", "mode": "local" if settings.USE_LOCAL_STORAGE else "cloud"}
