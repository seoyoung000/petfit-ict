"""
피부 질환 AI 추론 서비스.

훈련된 모델 (InceptionResNetV2 + Dense(2048) + Dense(N))을 로드해서 추론.

라벨 인덱싱 (multi 모델, 7-class one-hot):
    0 → A1 구진·플라크
    1 → A2 비듬·각질·상피성잔고리
    2 → A3 태선화·과다색소침착
    3 → A4 농포·여드름
    4 → A5 미란·궤양
    5 → A6 결절·종괴
    6 → A7 정상

binary 모델: index 1 = 질환 검출, index 0 = 정상.

`run_inference(image_bytes, species)`만 외부에서 호출. AI_USE_MOCK=true면 mock.
"""
import io
import os
from typing import List, Dict, Optional
from dataclasses import dataclass

from PIL import Image
from app.schemas.scan import DiagnosisItem
from app.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# 라벨 메타데이터
# ---------------------------------------------------------------------------

MULTI_INDEX_TO_CODE = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]

LABEL_KR = {
    "A1": "구진·플라크",
    "A2": "비듬·각질·상피성잔고리",
    "A3": "태선화·과다색소침착",
    "A4": "농포·여드름",
    "A5": "미란·궤양",
    "A6": "결절·종괴",
    "A7": "정상",
}

ACTION_KR = {
    "A1": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A2": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A3": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A4": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A5": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A6": "피부 변화가 계속되면 수의사와 상담하세요.",
    "A7": "이상 없음",
}

# ---------------------------------------------------------------------------
# 모델 설정 (species → list of model configs)
# ---------------------------------------------------------------------------

@dataclass
class ModelConfig:
    name: str
    relpath: str              # AI_MODEL_DIR 기준 상대 경로
    kind: str                 # 'multi' | 'binary'
    covers: List[str]         # 이 모델이 진단 가능한 라벨 코드들
    binary_code: Optional[str] = None  # binary 모델일 때 검출 대상 코드

DOG_MODELS: List[ModelConfig] = [
    ModelConfig(
        name="dog_multi_A1_A3_A6",
        relpath="classification/workspace/data/dog/result_cla/multi_A1_A3_A6/model",
        kind="multi",
        covers=["A1", "A3", "A6"],
    ),
    ModelConfig(
        name="dog_multi_A4_A5_A6",
        relpath="classification/workspace/data/dog/result_cla/multi_A4_A5_A6/model",
        kind="multi",
        covers=["A4", "A5", "A6"],
    ),
    ModelConfig(
        name="dog_binary_A2",
        relpath="classification/workspace/data/dog/result_cla/binary_A2/model",
        kind="binary",
        covers=["A2"],
        binary_code="A2",
    ),
]

CAT_MODELS: List[ModelConfig] = [
    ModelConfig(
        name="cat_binary_A2",
        relpath="classification/workspace/data/cat/result_cla/binary_A2/model",
        kind="binary",
        covers=["A2"],
        binary_code="A2",
    ),
]

SPECIES_MODELS: Dict[str, List[ModelConfig]] = {
    "dog": DOG_MODELS,
    "cat": CAT_MODELS,
}

# ---------------------------------------------------------------------------
# 모델 로딩 (lazy, 프로세스당 1회)
# ---------------------------------------------------------------------------

_loaded_models: Dict[str, "Model"] = {}  # name → keras Model
_load_attempted = False


def _build_arch(num_classes: int, activation: str):
    """훈련 때와 동일한 아키텍처 재구성."""
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Dense
    from tensorflow.keras.applications.inception_resnet_v2 import InceptionResNetV2

    backbone = InceptionResNetV2(
        include_top=False,
        weights=None,  # checkpoint이 모든 weight 포함, imagenet 다운로드 회피
        input_tensor=None,
        input_shape=(224, 224, 3),
        pooling="avg",
    )
    model = Sequential()
    model.add(backbone)
    model.add(Dense(2048, activation="relu"))
    model.add(Dense(num_classes, activation=activation))
    return model


def _load_model(cfg: ModelConfig):
    """단일 모델 빌드 + 체크포인트 로드."""
    import tensorflow as tf

    model_dir = os.path.join(settings.AI_MODEL_DIR, cfg.relpath)
    checkpoint = tf.train.latest_checkpoint(model_dir)
    if checkpoint is None:
        raise FileNotFoundError(f"체크포인트 없음: {model_dir}")

    if cfg.kind == "multi":
        model = _build_arch(num_classes=7, activation="softmax")
    else:
        model = _build_arch(num_classes=2, activation="sigmoid")

    model.load_weights(checkpoint).expect_partial()
    return model


def _load_all_models():
    """앱 시작 시 모든 활성 모델 미리 로드."""
    global _load_attempted
    if _load_attempted:
        return
    _load_attempted = True

    failures = []
    for species, cfgs in SPECIES_MODELS.items():
        for cfg in cfgs:
            try:
                print(f"[ai_service] loading {cfg.name}...")
                _loaded_models[cfg.name] = _load_model(cfg)
                print(f"[ai_service] loaded {cfg.name}")
            except Exception as e:
                print(f"[ai_service] failed to load {cfg.name}: {e}")
                failures.append(cfg.name)

    if failures:
        raise AIModelUnavailableError(
            "AI 모델을 불러오지 못했습니다: " + ", ".join(failures)
        )


# ---------------------------------------------------------------------------
# 전처리 + 추론
# ---------------------------------------------------------------------------

class ImageQualityError(Exception):
    """진단에 쓸 수 없는 사진 (너무 어둡거나 밝거나, 아무것도 안 찍힘). 메시지는 사용자에게 그대로 보여준다."""


class AIModelUnavailableError(Exception):
    """필수 모델 파일을 읽지 못해 신뢰할 수 있는 분석 결과를 낼 수 없는 경우."""


# 사진 품질 기준 (가운데 잘라낸 영역의 흑백 밝기 0~255 기준)
MIN_BRIGHTNESS = 30    # 이보다 어두우면: 털 속에서 빛 없이 찍힘 등
MAX_BRIGHTNESS = 245   # 이보다 밝으면: 빛 반사로 하얗게 날아감
MIN_CONTRAST = 6       # 밝기 표준편차가 이보다 작으면: 렌즈가 가려졌거나 아무 무늬가 없음


def _center_crop(image_bytes: bytes) -> Image.Image:
    """
    사진 가운데를 정사각형으로 잘라낸다.

    AI-Hub 모델은 병변 바운딩박스만 잘라낸 이미지로 학습됐다(polygon2traindata --cropbbox).
    털/배경이 다 들어간 전체 사진을 넣으면 학습 때 본 적 없는 입력이라 결과가 엉뚱해지므로,
    앱에서 가운데 원에 병변을 맞춰 찍게 하고 그 부분만 모델에 넣는다.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    side = int(min(w, h) * settings.AI_CENTER_CROP)
    left, top = (w - side) // 2, (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def _check_quality(img: Image.Image) -> None:
    import numpy as np

    gray = np.asarray(img.convert("L"), dtype="float32")
    brightness, contrast = float(gray.mean()), float(gray.std())
    if brightness < MIN_BRIGHTNESS:
        raise ImageQualityError("사진이 너무 어두워요. 밝은 곳에서 다시 찍어주세요.")
    if brightness > MAX_BRIGHTNESS:
        raise ImageQualityError("사진이 너무 밝아요. 빛 반사가 없게 다시 찍어주세요.")
    if contrast < MIN_CONTRAST:
        raise ImageQualityError("피부가 잘 보이지 않아요. 카메라를 피부에 맞추고 다시 찍어주세요.")


def _preprocess(img: Image.Image):
    """훈련과 동일하게 224x224 RGB + [0,1] 정규화."""
    import numpy as np

    arr = np.asarray(img.resize((224, 224), Image.BILINEAR), dtype="float32") / 255.0
    return np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)


def _real_inference(image_bytes: bytes, species: str) -> List[DiagnosisItem]:
    cfgs = SPECIES_MODELS.get(species, [])
    if not cfgs:
        # 해당 종에 대한 모델 없음 → mock
        return _mock_result()

    _load_all_models()
    img = _center_crop(image_bytes)
    _check_quality(img)
    x = _preprocess(img)

    # 라벨 코드별 최고 확률 누적 (모델 간 겹치는 라벨은 max로 합침)
    code_to_conf: Dict[str, float] = {}
    # 라벨 코드별 판정 기준. 2분류 모델이 낸 라벨은 더 엄격한 기준을 쓴다.
    code_threshold: Dict[str, float] = {}

    for cfg in cfgs:
        model = _loaded_models.get(cfg.name)
        if model is None:
            raise AIModelUnavailableError(f"AI 모델을 찾을 수 없습니다: {cfg.name}")
        probs = model.predict(x, verbose=0)[0]

        if cfg.kind == "multi":
            for code in cfg.covers:
                idx = MULTI_INDEX_TO_CODE.index(code)
                p = float(probs[idx])
                if p > code_to_conf.get(code, 0.0):
                    code_to_conf[code] = p
                code_threshold.setdefault(code, settings.AI_CONFIDENCE_THRESHOLD)
        else:  # binary
            p = float(probs[1])  # index 1 = 질환 검출
            code = cfg.binary_code
            if code and p > code_to_conf.get(code, 0.0):
                code_to_conf[code] = p
            if code:
                code_threshold[code] = max(settings.AI_CONFIDENCE_THRESHOLD, settings.AI_BINARY_THRESHOLD)

    # 임계값 통과 항목만 DiagnosisItem으로 변환
    items: List[DiagnosisItem] = []
    for code, conf in sorted(code_to_conf.items(), key=lambda kv: kv[1], reverse=True):
        if conf < code_threshold[code]:
            continue
        items.append(DiagnosisItem(
            condition=LABEL_KR[code],
            confidence=round(conf, 4),
            area=None,
            action=ACTION_KR[code],
        ))

    return items


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def warmup_models() -> None:
    """
    앱 시작 시 모델을 미리 로드한다.

    이걸 안 하면 첫 스캔 요청이 들어올 때 lazy 로딩이 일어나서,
    그 요청을 보낸 사용자만 모델 로딩 시간을 통째로 떠안게 된다.
    mock 모드에서는 모델이 필요 없으므로 건너뛴다.
    """
    if settings.AI_USE_MOCK:
        return
    _load_all_models()


def run_inference(image_bytes: bytes, species: str = "dog") -> List[DiagnosisItem]:
    """
    이미지 bytes + 반려동물 종 → 진단 결과 리스트.

    TensorFlow 추론은 CPU를 오래 붙잡는 동기 작업이다.
    async 라우터에서 직접 부르면 이벤트 루프가 멈추므로
    반드시 run_in_threadpool 등으로 위임해서 호출할 것.
    """
    if settings.AI_USE_MOCK:
        return _mock_result()
    return _real_inference(image_bytes, species)


def _mock_result() -> List[DiagnosisItem]:
    return [
        DiagnosisItem(
            condition="미란·궤양",
            confidence=0.72,
            area="등",
            action="피부 변화가 계속되면 수의사와 상담하세요.",
        ),
        DiagnosisItem(
            condition="구진·플라크",
            confidence=0.45,
            area="배",
            action="피부 변화가 계속되면 수의사와 상담하세요.",
        ),
    ]


def calculate_health_score(diagnoses: List[DiagnosisItem]) -> Optional[int]:
    if not diagnoses:
        return None
    max_conf = max(d.confidence for d in diagnoses)
    disease_count = len(diagnoses)
    return max(10, int(95 - max_conf * 60 * disease_count))


def get_severity(diagnoses: List[DiagnosisItem]) -> str:
    if not diagnoses:
        return "unclassified"
    max_conf = max(d.confidence for d in diagnoses)
    if max_conf >= 0.8:
        return "critical"
    if max_conf >= 0.6:
        return "warning"
    return "minor"
