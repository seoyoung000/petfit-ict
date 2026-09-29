import { bleService } from './bleService';
import { deviceService } from './deviceService';
import { BrushCommand, BrushStatus, DiscoveredDevice } from '@/types';

export type { DiscoveredDevice };

// 실제로 통신하는 백엔드
// 'ble'   : dev build에서 ESP32와 블루투스로 통신 (기본이자 유일한 실제 연결 방식)
// 'cloud' : BLE 불가 환경(Expo Go)에서의 데모 폴백
export type BrushTransport = 'ble' | 'cloud';

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
  // 연결은 블루투스만 지원한다. BLE를 쓸 수 없는 환경에서만 데모 폴백으로 내려간다.
  get transport(): BrushTransport {
    return bleService.isAvailable ? 'ble' : 'cloud';
  }

  get unavailableReason(): string | null {
    return bleService.unavailableReason;
  }

  private get backend(): BrushBackend {
    return this.transport === 'ble' ? bleService : deviceService;
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
}

export const brushService = new BrushService();
