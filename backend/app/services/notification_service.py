import boto3
import json
from app.config import get_settings

settings = get_settings()

sns = boto3.client(
    "sns",
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    region_name=settings.AWS_REGION,
)


def register_device(device_token: str, platform: str) -> str:
    """디바이스 토큰을 SNS에 등록하고 endpoint ARN 반환"""
    arn = settings.SNS_PLATFORM_ARN_IOS if platform == "ios" else settings.SNS_PLATFORM_ARN_ANDROID
    if not arn:
        return ""
    response = sns.create_platform_endpoint(
        PlatformApplicationArn=arn,
        Token=device_token,
    )
    return response["EndpointArn"]


def send_push(endpoint_arn: str, title: str, body: str, data: dict = None) -> bool:
    if not endpoint_arn:
        return False
    message = {
        "default": body,
        "GCM": json.dumps({
            "notification": {"title": title, "body": body},
            "data": data or {},
        }),
        "APNS": json.dumps({
            "aps": {"alert": {"title": title, "body": body}, "sound": "default"},
            **(data or {}),
        }),
    }
    try:
        sns.publish(
            TargetArn=endpoint_arn,
            Message=json.dumps(message),
            MessageStructure="json",
        )
        return True
    except Exception:
        return False


def send_scan_complete(endpoint_arn: str, pet_name: str, severity: str) -> None:
    severity_msg = {
        "normal": "이상 없음 – 건강해요!",
        "minor": "경미한 이상이 발견됐어요.",
        "warning": "주의가 필요한 피부 상태예요.",
        "critical": "즉시 진료가 필요할 수 있어요.",
    }.get(severity, "스캔이 완료됐어요.")
    send_push(
        endpoint_arn,
        title=f"{pet_name} 피부 리포트 도착",
        body=severity_msg,
        data={"type": "scan_complete", "severity": severity},
    )
