import api from './api';
import { BrushCommand, BrushStatus, DiscoveredDevice } from '@/types';

export type { DiscoveredDevice };

interface RawStatus {
  id: string;
  name: string;
  connected: boolean;
  battery: number;
  medication: number;
  scanning: boolean;
  last_seen: string;
}

class PetfitDeviceService {
  private deviceId: string | null = null;
  private deviceName: string = '';
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  async discover(): Promise<DiscoveredDevice[]> {
    const { data } = await api.get<DiscoveredDevice[]>('/devices/discover');
    return data;
  }

  async connect(device: DiscoveredDevice): Promise<BrushStatus> {
    const { data } = await api.post<RawStatus>(`/devices/${device.id}/connect`);
    this.deviceId = data.id;
    this.deviceName = data.name;
    return this.toBrushStatus(data);
  }

  async disconnect(): Promise<void> {
    if (!this.deviceId) return;
    try {
      await api.post(`/devices/${this.deviceId}/disconnect`);
    } finally {
      this.stopStatusPolling();
      this.deviceId = null;
      this.deviceName = '';
    }
  }

  async sendCommand(command: BrushCommand): Promise<BrushStatus | null> {
    if (!this.deviceId) return null;
    const { data } = await api.post<{ ok: boolean; status: RawStatus }>(
      `/devices/${this.deviceId}/command`,
      { command },
    );
    return this.toBrushStatus(data.status);
  }

  async fetchStatus(): Promise<BrushStatus | null> {
    if (!this.deviceId) return null;
    const { data } = await api.get<RawStatus>(`/devices/${this.deviceId}/status`);
    return this.toBrushStatus(data);
  }

  startStatusPolling(
    onStatus: (s: BrushStatus) => void,
    intervalMs: number = 2000,
  ): () => void {
    this.stopStatusPolling();
    const tick = async () => {
      try {
        const s = await this.fetchStatus();
        if (s) onStatus(s);
      } catch {
        // ignore transient errors
      }
    };
    void tick();
    this.pollHandle = setInterval(tick, intervalMs);
    return () => this.stopStatusPolling();
  }

  stopStatusPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private toBrushStatus(raw: RawStatus): BrushStatus {
    return {
      connected: raw.connected,
      battery: raw.battery,
      medication: raw.medication,
      scanning: raw.scanning,
    };
  }

  get isConnected(): boolean {
    return this.deviceId !== null;
  }

  get currentDeviceName(): string {
    return this.deviceName;
  }

  get currentDeviceId(): string | null {
    return this.deviceId;
  }
}

export const deviceService = new PetfitDeviceService();
