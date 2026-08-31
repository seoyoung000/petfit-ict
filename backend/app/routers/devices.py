from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal, Dict, List
from datetime import datetime, timezone
import uuid

from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/devices", tags=["devices"])

Command = Literal["START_SCAN", "STOP_SCAN", "DISPENSE", "SUCTION", "STATUS"]


class DeviceInfo(BaseModel):
    id: str
    name: str
    serial: str
    rssi: int = -50


class DeviceStatus(BaseModel):
    id: str
    name: str
    connected: bool
    battery: int
    medication: int
    scanning: bool
    last_seen: datetime


class CommandRequest(BaseModel):
    command: Command


class CommandResponse(BaseModel):
    ok: bool
    status: DeviceStatus


_devices: Dict[str, Dict] = {}


def _ensure_device(user_id: str) -> Dict:
    if user_id not in _devices:
        serial = uuid.uuid4().hex[:8].upper()
        _devices[user_id] = {
            "id": uuid.uuid4().hex,
            "name": f"PETFIT-{serial[:4]}",
            "serial": serial,
            "connected": False,
            "battery": 85,
            "medication": 70,
            "scanning": False,
            "last_seen": datetime.now(timezone.utc),
        }
    return _devices[user_id]


def _to_status(d: Dict) -> DeviceStatus:
    return DeviceStatus(
        id=d["id"],
        name=d["name"],
        connected=d["connected"],
        battery=d["battery"],
        medication=d["medication"],
        scanning=d["scanning"],
        last_seen=d["last_seen"],
    )


@router.get("/discover", response_model=List[DeviceInfo])
def discover(current_user: User = Depends(get_current_user)):
    d = _ensure_device(current_user.id)
    return [DeviceInfo(id=d["id"], name=d["name"], serial=d["serial"], rssi=-48)]


@router.post("/{device_id}/connect", response_model=DeviceStatus)
def connect(device_id: str, current_user: User = Depends(get_current_user)):
    d = _ensure_device(current_user.id)
    if d["id"] != device_id:
        raise HTTPException(status_code=404, detail="기기를 찾을 수 없습니다.")
    d["connected"] = True
    d["last_seen"] = datetime.now(timezone.utc)
    return _to_status(d)


@router.post("/{device_id}/disconnect", response_model=DeviceStatus)
def disconnect(device_id: str, current_user: User = Depends(get_current_user)):
    d = _ensure_device(current_user.id)
    if d["id"] != device_id:
        raise HTTPException(status_code=404, detail="기기를 찾을 수 없습니다.")
    d["connected"] = False
    d["scanning"] = False
    return _to_status(d)


@router.get("/{device_id}/status", response_model=DeviceStatus)
def status(device_id: str, current_user: User = Depends(get_current_user)):
    d = _ensure_device(current_user.id)
    if d["id"] != device_id:
        raise HTTPException(status_code=404, detail="기기를 찾을 수 없습니다.")
    return _to_status(d)


@router.post("/{device_id}/command", response_model=CommandResponse)
def command(device_id: str, body: CommandRequest, current_user: User = Depends(get_current_user)):
    d = _ensure_device(current_user.id)
    if d["id"] != device_id:
        raise HTTPException(status_code=404, detail="기기를 찾을 수 없습니다.")
    if not d["connected"]:
        raise HTTPException(status_code=400, detail="기기가 연결되어 있지 않습니다.")

    cmd = body.command
    if cmd == "START_SCAN":
        d["scanning"] = True
    elif cmd == "STOP_SCAN":
        d["scanning"] = False
    elif cmd == "DISPENSE":
        d["medication"] = max(0, d["medication"] - 1)
    elif cmd == "SUCTION":
        pass
    d["last_seen"] = datetime.now(timezone.utc)
    return CommandResponse(ok=True, status=_to_status(d))
