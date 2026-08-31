import { bleService } from './bleService';
import { wifiService } from './wifiService';
import { deviceService } from './deviceService';
import { BrushCommand, BrushStatus, DiscoveredDevice } from '@/types';

export type { DiscoveredDevice };

// 사용자가 고르는 연결 방식
export type BrushMode = 'ble' | 'wifi';

// 실제로 통신하는 백엔드
// 'ble'   : dev build에서 ESP32와 블루투스로 통신
// 'wifi'  : 같은 WiFi의 ESP32 HTTP 서버와 통신
// 'cloud' : BLE 불가 환경(Expo Go)에서 BLE를 골랐을 때의 데모 폴백
export type BrushTransport = 'ble' | 'wifi' | 'cloud';

interface BrushBackend {
  discover(): Promise<DiscoveredDevice[]>;
  connect(d: DiscoveredDevice): Promise<BrushStatus>;
  disconnect(): Promise<void>;
  sendCommand(c: BrushCommand): Promise<unknown>;
  startStatusPolling(cb: (s: BrushStatus) => void, intervalMs?: number): () => void;
  stopStatusPolling(): void;
  readonly isConnected: boolean;
  readonly currentDeviceName: string;
}

class BrushService {
  // 실제 하드웨어(종인님 펌웨어)가 WiFi/HTTP 방식이므로 기본값을 wifi로 둔다.
  // (UI에서 블루투스로 토글 가능)
  private mode: BrushMode = 'wifi';

  setMode(mode: BrushMode): void {
    this.mode = mode;
  }

  get currentMode(): BrushMode {
    return this.mode;
  }

  // 선택한 방식을 실제 가능한 transport로 변환
  get transport(): BrushTransport {
    if (this.mode === 'wifi') return 'wifi';
    return bleService.isAvailable ? 'ble' : 'cloud';
  }

  get unavailableReason(): string | null {
    return this.mode === 'ble' ? bleService.unavailableReason : null;
  }

  // WiFi 모드에서 기기 주소(기본 petfit.local) 지정
  setWifiHost(host: string): void {
    wifiService.setHost(host);
  }

  get wifiHost(): string {
    return wifiService.currentHost;
  }

  private get backend(): BrushBackend {
    switch (this.transport) {
      case 'wifi':
        return wifiService;
      case 'ble':
        return bleService;
      default:
        return deviceService;
    }
  }

  discover(): Promise<DiscoveredDevice[]> {
    return this.backend.discover();
  }

  connect(device: DiscoveredDevice): Promise<BrushStatus> {
    return this.backend.connect(device);
  }

  disconnect(): Promise<void> {
    return this.backend.disconnect();
  }

  async sendCommand(command: BrushCommand): Promise<void> {
    await this.backend.sendCommand(command);
  }

  startStatusPolling(cb: (s: BrushStatus) => void, intervalMs?: number): () => void {
    return this.backend.startStatusPolling(cb, intervalMs);
  }

  stopStatusPolling(): void {
    this.backend.stopStatusPolling();
  }

  get isConnected(): boolean {
    return this.backend.isConnected;
  }

  get currentDeviceName(): string {
    return this.backend.currentDeviceName;
  }

  // BLE 모드에서만 동작하는 WiFi 프로비저닝 (기기에 WiFi 정보 전달)
  async sendWifiCredentials(ssid: string, password: string): Promise<void> {
    if (this.transport === 'ble') {
      await bleService.sendWifiCredentials(ssid, password);
    }
  }
}

export const brushService = new BrushService();
