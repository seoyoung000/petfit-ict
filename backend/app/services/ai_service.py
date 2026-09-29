"""
피부 질환 AI 추론 서비스.

훈련된 모델 (InceptionResNetV2 + Dense(2048) + Dense(N))을 로드해서 추론.

라벨 인덱싱 (multi 모델, 7-class one-hot):
    0 → A1 아토피 피부염
    1 → A2 세균성 피부염
    2 → A3 말라세치아
    3 → A4 모낭충증
    4 → A5 표재성 피부염
    5 → A6 과각화증
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
    "A1": "아토피 피부염",
    "A2": "세균성 피부염",
    "A3": "말라세치아 감염",
    "A4": "모낭충증",
    "A5": "표재성 피부염",
    "A6": "과각화증",
    "A7": "정상",
}

ACTION_KR = {
    "A1": "수의사 진료 권장 (스테로이드/면역억제제)",
    "A2": "항생제 처방 필요 – 진료 권장",
    "A3": "항진균 샴푸 사용, 심할 경우 진료",
    "A4": "즉시 수의사 진료 필요",
    "A5": "보습 케어 + 증상 모니터링",
    "A6": "보습제 도포 권장",
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

    for species, cfgs in SPECIES_MODELS.items():
        for cfg in cfgs:
            try:
                print(f"[ai_service] loading {cfg.name}...")
                _loaded_models[cfg.name] = _load_model(cfg)
                print(f"[ai_service] loaded {cfg.name}")
            except Exception as e:
                print(f"[ai_service] failed to load {cfg.name}: {e}")


# ---------------------------------------------------------------------------
# 전처리 + 추론
# ---------------------------------------------------------------------------

def _preprocess(image_bytes: bytes):
    """훈련과 동일하게 224x224 RGB + [0,1] 정규화."""
    import numpy as np

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224), Image.BILINEAR)
    arr = np.asarray(img, dtype="float32") / 255.0
    return np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)


def _real_inference(image_bytes: bytes, species: str) -> List[DiagnosisItem]:
    cfgs = SPECIES_MODELS.get(species, [])
    if not cfgs:
        # 해당 종에 대한 모델 없음 → mock
        return _mock_result()

    _load_all_models()
    x = _preprocess(image_bytes)
    threshold = settings.AI_CONFIDENCE_THRESHOLD

    # 라벨 코드별 최고 확률 누적 (모델 간 겹치는 라벨은 max로 합침)
    code_to_conf: Dict[str, float] = {}

    for cfg in cfgs:
        model = _loaded_models.get(cfg.name)
        if model is None:
            continue
        probs = model.predict(x, verbose=0)[0]

        if cfg.kind == "multi":
            for code in cfg.covers:
                idx = MULTI_INDEX_TO_CODE.index(code)
                p = float(probs[idx])
                if p > code_to_conf.get(code, 0.0):
                    code_to_conf[code] = p
        else:  # binary
            p = float(probs[1])  # index 1 = 질환 검출
            code = cfg.binary_code
            if code and p > code_to_conf.get(code, 0.0):
                code_to_conf[code] = p

    # 임계값 통과 항목만 DiagnosisItem으로 변환
    items: List[DiagnosisItem] = []
    for code, conf in sorted(code_to_conf.items(), key=lambda kv: kv[1], reverse=True):
        if conf < threshold:
            continue
        items.append(DiagnosisItem(
            condition=LABEL_KR[code],
            confidence=round(conf, 4),
            area=None,
            action=ACTION_KR[code],
        ))

    if not items:
        # 임계값 통과한 게 없으면 정상으로 간주
        items.append(DiagnosisItem(
            condition="정상",
            confidence=1.0,
            area=None,
            action="이상 없음",
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
            condition="표재성 피부염",
            confidence=0.72,
            area="등",
            action="보습 케어 + 증상 모니터링",
        ),
        DiagnosisItem(
            condition="아토피 피부염",
            confidence=0.45,
            area="배",
            action="수의사 진료 권장 (스테로이드/면역억제제)",
        ),
    ]


def calculate_health_score(diagnoses: List[DiagnosisItem]) -> int:
    if not diagnoses:
        return 95
    # "정상"만 있으면 만점에 가깝게
    if len(diagnoses) == 1 and diagnoses[0].condition == "정상":
        return 95
    max_conf = max(d.confidence for d in diagnoses if d.condition != "정상")
    disease_count = sum(1 for d in diagnoses if d.condition != "정상")
    return max(10, int(95 - max_conf * 60 * disease_count))


def get_severity(diagnoses: List[DiagnosisItem]) -> str:
    diseases = [d for d in diagnoses if d.condition != "정상"]
    if not diseases:
        return "normal"
    max_conf = max(d.confidence for d in diseases)
    if max_conf >= 0.8:
        return "critical"
    if max_conf >= 0.6:
        return "warning"
    return "minor"
