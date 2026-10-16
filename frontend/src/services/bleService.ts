import type { BleManager as BleManagerType, Device } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { BrushCommand, BrushStatus, DiscoveredDevice } from '@/types';

// Nordic UART Service (ESP32 기반 브러쉬 디바이스)
const PETFIT_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // App → Device
const RX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // Device → App

const COMMANDS: Record<BrushCommand, number[]> = {
  START_SCAN:   [0x01],
  STOP_SCAN:    [0x02],
  DISPENSE:     [0x03],
  STATUS:       [0x05],
};

// 기기 → 앱 메시지 (petfit_cam_ble.ino 와 동일)
const MSG_STATUS = 0x05; // [0x05, battery, medication, flags]
const MSG_DISPENSE_RESULT = 0x08; // [0x08, result], result 0 = 펌프 작동 완료
const IMG_BEGIN = 0xa0;  // [0xA0, len3, len2, len1, len0] 이후 JPEG 본문 조각들
const IMG_END = 0xa1;    // [0xA1]
const CMD_PREVIEW_START = 0x06; // 기기가 계속 촬영해 프레임을 연달아 보냄
const CMD_PREVIEW_STOP = 0x07;
// 크게 요청해야 사진 조각이 20바이트씩 쪼개지지 않는다.
// BLE 값 하나는 최대 512바이트라 그보다 큰 조각은 안드로이드가 잘라버린다.
// 515를 요청하면 MTU-3 = 512가 되지만, 안드로이드 14+는 요청값과 상관없이 517로 협상한다.
// 그래서 조각 크기 상한(512)은 펌웨어(MAX_CHUNK)에서 지켜야 한다.
const BLE_MTU = 515;
const CAPTURE_TIMEOUT_MS = 30000;
const DISPENSE_TIMEOUT_MS = 7000;

// React Native(Hermes)에는 Node의 Buffer가 없다.
// ble-plx는 값을 base64 문자열로 주고받으므로 atob/btoa로 바이트와 변환한다.
function toBase64(bytes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

interface CaptureWaiter {
  resolve: (jpegBase64: string) => void;
  reject: (e: Error) => void;
  onProgress?: (received: number, total: number) => void;
}

interface DispenseWaiter {
  resolve: () => void;
  reject: (e: Error) => void;
}

const DEFAULT_STATUS: BrushStatus = {
  connected: false,
  battery: 0,
  medication: 0,
  scanning: false,
};

// Expo Go에는 native BLE 모듈이 없으므로 lazy 로딩 + 가용성 체크
const isExpoGo = Constants.appOwnership === 'expo';

class PetfitBLEService {
  private manager: BleManagerType | null = null;
  private connectedDevice: Device | null = null;
  private initError: string | null = null;

  // 고수준 상태 관리
  private deviceMap = new Map<string, Device>();
  private latestStatus: BrushStatus = { ...DEFAULT_STATUS };
  private dataSub: (() => void) | null = null;
  private statusListeners = new Set<(s: BrushStatus) => void>();
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  // 사진 수신 상태: 헤더를 받으면 만들고, 끝 마커를 받으면 비운다
  private image: { buf: Uint8Array; received: number } | null = null;
  private captureWaiter: CaptureWaiter | null = null;
  private dispenseWaiter: DispenseWaiter | null = null;
  private dispenseTimer: ReturnType<typeof setTimeout> | null = null;
  private previewListener: ((jpegBase64: string) => void) | null = null;

  private getManager(): BleManagerType | null {
    if (this.manager) return this.manager;
    if (this.initError) return null;
    if (isExpoGo) {
      this.initError = 'Expo Go에서는 BLE를 사용할 수 없습니다. dev build가 필요해요.';
      return null;
    }
    try {
      const { BleManager } = require('react-native-ble-plx');
      this.manager = new BleManager();
      return this.manager;
    } catch (e: any) {
      this.initError = `BLE 초기화 실패: ${e?.message ?? e}`;
      return null;
    }
  }

  get isAvailable(): boolean {
    return this.getManager() !== null;
  }

  get unavailableReason(): string | null {
    void this.getManager();
    return this.initError;
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable) return false;
    if (Platform.OS !== 'android') return true;
    const sdkVersion = parseInt(String(Platform.Version), 10);
    if (sdkVersion >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  waitForPoweredOn(): Promise<void> {
    const m = this.getManager();
    if (!m) return Promise.resolve();
    const { State } = require('react-native-ble-plx');
    return new Promise((resolve) => {
      const sub = m.onStateChange((state) => {
        if (state === State.PoweredOn) {
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  // ── 고수준 API (화면에서 사용) ──────────────────────────────────────────

  // 주변 펫핏 기기를 일정 시간 스캔하여 목록으로 반환
  async discover(timeoutMs: number = 6000): Promise<DiscoveredDevice[]> {
    const m = this.getManager();
    if (!m) return [];
    const granted = await this.requestPermissions();
    if (!granted) throw new Error('블루투스 권한이 필요합니다.');
    await this.waitForPoweredOn();

    this.deviceMap.clear();
    const found = new Map<string, DiscoveredDevice>();

    return new Promise((resolve) => {
      const stop = this.scanForDevices((device) => {
        this.deviceMap.set(device.id, device);
        found.set(device.id, {
          id: device.id,
          name: device.name ?? 'PETFIT',
          serial: device.id.replace(/[:]/g, '').slice(-8).toUpperCase(),
          rssi: device.rssi ?? -60,
        });
      });
      setTimeout(() => {
        stop();
        resolve(Array.from(found.values()));
      }, timeoutMs);
    });
  }

  async connect(device: DiscoveredDevice): Promise<BrushStatus> {
    const m = this.getManager();
    if (!m) throw new Error(this.initError ?? 'BLE를 사용할 수 없습니다.');
    const target = this.deviceMap.get(device.id);
    if (!target) throw new Error('기기를 찾을 수 없습니다. 다시 검색해주세요.');

    // Android는 MTU를 직접 요청해야 커진다 (iOS는 자동)
    const connected = await target.connect({ requestMTU: BLE_MTU });
    const discovered = await connected.discoverAllServicesAndCharacteristics();
    this.connectedDevice = discovered;
    this.latestStatus = { ...DEFAULT_STATUS, connected: true };

    // 예기치 않은 연결 해제 감지
    discovered.onDisconnected(() => {
      this.image = null;
      this.failCapture('기기 연결이 끊겼어요.');
      this.failDispense('브러쉬 연결이 끊겨 분사 결과를 확인할 수 없어요.');
      this.latestStatus = { ...this.latestStatus, connected: false };
      this.emitStatus();
    });

    // 기기 → 앱 알림 구독 (상태 + 사진 조각)
    this.dataSub = this.subscribeToData((data) => this.handleIncoming(data));

    // 초기 상태 요청 후 잠시 대기
    await this.sendCommand('STATUS');
    await this.waitForStatus(1500);
    return this.latestStatus;
  }

  async disconnect(): Promise<void> {
    this.previewListener = null;
    this.image = null;
    this.failCapture('기기 연결을 해제했어요.');
    this.failDispense('브러쉬 연결이 해제되어 분사 결과를 확인할 수 없어요.');
    this.stopStatusPolling();
    this.dataSub?.();
    this.dataSub = null;
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } finally {
        this.connectedDevice = null;
      }
    }
    this.latestStatus = { ...DEFAULT_STATUS };
  }

  async sendCommand(command: BrushCommand): Promise<void> {
    if (!this.connectedDevice) throw new Error('기기가 연결되어 있지 않아요.');
    await this.writeBytes(COMMANDS[command]);
  }

  // 카메라 보드가 모터 보드의 펌프 완료 회신을 BLE로 전달할 때까지 기다린다.
  dispense(): Promise<void> {
    if (!this.connectedDevice) return Promise.reject(new Error('브러쉬가 연결되어 있지 않아요.'));
    if (this.dispenseWaiter) return Promise.reject(new Error('이미 분사 중이에요.'));

    return new Promise((resolve, reject) => {
      this.dispenseWaiter = { resolve, reject };
      this.dispenseTimer = setTimeout(() => {
        this.failDispense('펌프 작동 완료 응답을 받지 못했어요. 브러쉬와 모터 보드를 확인해주세요.');
      }, DISPENSE_TIMEOUT_MS);
      this.writeBytes(COMMANDS.DISPENSE).catch(() => {
        this.failDispense('분사 명령을 브러쉬에 보내지 못했어요. 연결을 확인해주세요.');
      });
    });
  }

  private async writeBytes(bytes: number[]): Promise<void> {
    if (!this.connectedDevice) throw new Error('기기가 연결되어 있지 않아요.');
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      PETFIT_SERVICE_UUID,
      TX_CHAR_UUID,
      toBase64(bytes),
    );
  }

  // 카메라 미리보기: 기기가 보내는 프레임을 onFrame으로 계속 넘긴다. 반환값을 호출하면 중지.
  // 미리보기를 모르는 예전 펌웨어는 명령을 무시하므로 프레임이 오지 않을 뿐 문제는 없다.
  startPreview(onFrame: (jpegBase64: string) => void): () => void {
    if (!this.connectedDevice) return () => {};
    this.previewListener = onFrame;
    this.writeBytes([CMD_PREVIEW_START]).catch(() => {});
    return () => {
      if (this.previewListener !== onFrame) return;
      this.previewListener = null;
      this.writeBytes([CMD_PREVIEW_STOP]).catch(() => {});
    };
  }

  // 기기에 촬영을 시키고 JPEG을 base64로 받는다
  captureImage(onProgress?: (received: number, total: number) => void): Promise<string> {
    if (!this.connectedDevice) return Promise.reject(new Error('기기가 연결되어 있지 않아요.'));
    if (this.captureWaiter) return Promise.reject(new Error('이미 촬영 중이에요.'));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.image = null;
        this.failCapture('기기에서 사진을 받지 못했어요. (시간 초과)');
      }, CAPTURE_TIMEOUT_MS);
      this.captureWaiter = {
        resolve: (b64) => { clearTimeout(timer); resolve(b64); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        onProgress,
      };
      this.sendCommand('START_SCAN').catch(() => this.failCapture('촬영 명령을 보내지 못했어요.'));
    });
  }

  // 대기 중인 촬영 결과를 더 이상 기다리지 않는다 (기기가 보내던 조각은 버림)
  cancelCapture(): void {
    this.image = null;
    this.failCapture('촬영을 취소했어요.');
  }

  startStatusPolling(
    onStatus: (s: BrushStatus) => void,
    intervalMs: number = 2000,
  ): () => void {
    this.statusListeners.add(onStatus);
    onStatus(this.latestStatus);
    if (!this.pollHandle) {
      // 기기에 주기적으로 상태를 요청 (응답은 알림으로 수신)
      this.pollHandle = setInterval(() => {
        void this.sendCommand('STATUS');
      }, intervalMs);
    }
    return () => {
      this.statusListeners.delete(onStatus);
      if (this.statusListeners.size === 0) this.stopStatusPolling();
    };
  }

  stopStatusPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.statusListeners.clear();
  }

  get isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  get currentDeviceName(): string {
    return this.connectedDevice?.name ?? '';
  }

  // ── 저수준 헬퍼 ──────────────────────────────────────────────────────────

  private scanForDevices(onFound: (device: Device) => void): () => void {
    const m = this.getManager();
    if (!m) return () => {};
    m.startDeviceScan(
      [PETFIT_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error || !device) return;
        if (device.name?.includes('PETFIT') || device.name?.includes('Petfit')) {
          onFound(device);
        }
      },
    );
    return () => m.stopDeviceScan();
  }

  private subscribeToData(onData: (data: Uint8Array) => void): () => void {
    if (!this.connectedDevice) return () => {};
    const sub = this.connectedDevice.monitorCharacteristicForService(
      PETFIT_SERVICE_UUID,
      RX_CHAR_UUID,
      (error, char) => {
        if (error || !char?.value) return;
        onData(fromBase64(char.value));
      },
    );
    return () => sub.remove();
  }

  // 기기에서 온 알림 한 건을 사진 조각 / 사진 시작 / 상태 중 하나로 처리
  private handleIncoming(data: Uint8Array): void {
    const img = this.image;
    if (img) {
      // 본문을 다 받기 전에는 첫 바이트가 무엇이든 사진 데이터다
      // (본문 조각이 0x05나 0xA1로 시작해도 상태/끝 마커로 착각하면 안 됨)
      if (img.received < img.buf.length) {
        const n = Math.min(data.length, img.buf.length - img.received);
        img.buf.set(data.subarray(0, n), img.received);
        img.received += n;
        this.captureWaiter?.onProgress?.(img.received, img.buf.length);
        return;
      }
      this.image = null;
      if (data.length === 1 && data[0] === IMG_END) {
        const waiter = this.captureWaiter;
        this.captureWaiter = null;
        if (waiter) waiter.resolve(toBase64(img.buf));
        else this.previewListener?.(toBase64(img.buf));
      } else {
        this.failCapture('사진을 받는 중 데이터가 어긋났어요. 다시 촬영해주세요.');
      }
      return;
    }

    if (data.length === 5 && data[0] === IMG_BEGIN) {
      const len = ((data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4]) >>> 0;
      this.image = { buf: new Uint8Array(len), received: 0 };
      this.captureWaiter?.onProgress?.(0, len);
      return;
    }

    if (data.length >= 2 && data[0] === MSG_DISPENSE_RESULT) {
      if (data[1] === 0) this.finishDispense();
      else this.failDispense('펌프 작동을 확인하지 못했어요. 모터 보드 연결을 확인해주세요.');
      return;
    }

    const partial = this.parseStatus(data);
    this.latestStatus = { ...this.latestStatus, ...partial, connected: true };
    this.emitStatus();
  }

  private failCapture(message: string): void {
    const waiter = this.captureWaiter;
    this.captureWaiter = null;
    waiter?.reject(new Error(message));
  }

  private finishDispense(): void {
    const waiter = this.dispenseWaiter;
    this.dispenseWaiter = null;
    if (this.dispenseTimer) clearTimeout(this.dispenseTimer);
    this.dispenseTimer = null;
    waiter?.resolve();
  }

  private failDispense(message: string): void {
    const waiter = this.dispenseWaiter;
    this.dispenseWaiter = null;
    if (this.dispenseTimer) clearTimeout(this.dispenseTimer);
    this.dispenseTimer = null;
    waiter?.reject(new Error(message));
  }

  private parseStatus(data: Uint8Array): Partial<BrushStatus> {
    // Protocol: [0x05, battery, medication, flags]
    if (data[0] !== MSG_STATUS || data.length < 4) return {};
    return {
      battery: data[1],
      medication: data[2],
      scanning: !!(data[3] & 0x01),
    };
  }

  private emitStatus(): void {
    for (const listener of this.statusListeners) listener(this.latestStatus);
  }

  // 첫 상태 알림 수신 또는 타임아웃까지 대기
  private waitForStatus(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.statusListeners.delete(once);
        resolve();
      };
      const once = () => finish();
      this.statusListeners.add(once);
      setTimeout(finish, timeoutMs);
    });
  }
}

export const bleService = new PetfitBLEService();
