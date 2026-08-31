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
  SUCTION:      [0x04],
  STATUS:       [0x05],
};

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

    const connected = await target.connect();
    const discovered = await connected.discoverAllServicesAndCharacteristics();
    this.connectedDevice = discovered;
    this.latestStatus = { ...DEFAULT_STATUS, connected: true };

    // 예기치 않은 연결 해제 감지
    discovered.onDisconnected(() => {
      this.latestStatus = { ...this.latestStatus, connected: false };
      this.emitStatus();
    });

    // 기기 → 앱 알림 구독으로 상태 수신
    this.dataSub = this.subscribeToData((data) => {
      const partial = this.parseStatus(data);
      this.latestStatus = { ...this.latestStatus, ...partial, connected: true };
      this.emitStatus();
    });

    // 초기 상태 요청 후 잠시 대기
    await this.sendCommand('STATUS');
    await this.waitForStatus(1500);
    return this.latestStatus;
  }

  async disconnect(): Promise<void> {
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
    if (!this.connectedDevice) return;
    const bytes = Buffer.from(COMMANDS[command]).toString('base64');
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      PETFIT_SERVICE_UUID,
      TX_CHAR_UUID,
      bytes,
    );
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

  // BLE-based WiFi provisioning. Frame: [0x10, ssidLen, ...ssid, pwdLen, ...pwd]
  async sendWifiCredentials(ssid: string, password: string): Promise<void> {
    if (!this.connectedDevice) return;
    const ssidBytes = Buffer.from(ssid, 'utf8');
    const pwdBytes = Buffer.from(password, 'utf8');
    if (ssidBytes.length > 32 || pwdBytes.length > 64) {
      throw new Error('SSID/비밀번호가 너무 깁니다.');
    }
    const frame = Buffer.concat([
      Buffer.from([0x10, ssidBytes.length]),
      ssidBytes,
      Buffer.from([pwdBytes.length]),
      pwdBytes,
    ]);
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      PETFIT_SERVICE_UUID,
      TX_CHAR_UUID,
      frame.toString('base64'),
    );
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
        const bytes = Buffer.from(char.value, 'base64');
        onData(new Uint8Array(bytes));
      },
    );
    return () => sub.remove();
  }

  private parseStatus(data: Uint8Array): Partial<BrushStatus> {
    // Protocol: [0x05, battery, medication, flags]
    if (data[0] !== 0x05 || data.length < 4) return {};
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
