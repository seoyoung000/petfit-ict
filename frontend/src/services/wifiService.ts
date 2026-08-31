import { BrushCommand, BrushStatus, DiscoveredDevice } from '@/types';

// 폰과 ESP32가 같은 WiFi(핸드폰 핫스팟)에 있을 때, 기기의 HTTP 서버로 직접 통신한다.
//
// 종인님 펌웨어(컨트롤 보드) 기준:
//   GET /      → 컨트롤 HTML 페이지 (200 OK)
//   GET /on    → LED ON
//   GET /off   → LED OFF
//   mDNS 이름 'petfit.local', 고정 IP 172.24.102.100
//
// 펌웨어는 배터리/약물 잔량을 보고하지 않으므로 해당 값은 표시용 placeholder로 둔다.
// (카메라는 별도 보드(/capture)이며 여기서 다루지 않는다.)
const DEFAULT_HOST = 'petfit.local';

// BrushCommand → 펌웨어 엔드포인트 매핑.
// 현재 펌웨어엔 /on, /off 만 있어 약물 분사/흡입은 LED 토글로 대체한다.
// 종인님이 /dispense, /suction 등을 추가하면 이 표만 바꾸면 된다.
// '/' 는 "엔드포인트 없음 → 살아있는지만 확인(ping)"을 의미한다.
const COMMAND_PATH: Record<BrushCommand, string> = {
  START_SCAN: '/on',
  STOP_SCAN:  '/off',
  DISPENSE:   '/on',
  SUCTION:    '/on',
  STATUS:     '/',
};

const DEFAULT_STATUS: BrushStatus = {
  connected: false,
  battery: 0,
  medication: 0,
  scanning: false,
};

// 펌웨어가 보고하지 않는 값들의 표시용 기본치 (UI가 0%로 비어 보이지 않도록)
const PLACEHOLDER_BATTERY = 100;
const PLACEHOLDER_MEDICATION = 100;

class WifiDeviceService {
  private host = DEFAULT_HOST;
  private connected = false;
  private name = '';
  private scanning = false;
  private latest: BrushStatus = { ...DEFAULT_STATUS };
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  setHost(host: string): void {
    const trimmed = host.trim();
    if (trimmed) this.host = trimmed;
  }

  get currentHost(): string {
    return this.host;
  }

  // 기기 HTTP 서버에 요청. 펌웨어는 HTML/텍스트를 돌려주므로 JSON 파싱하지 않는다.
  private async req(path: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${this.host}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`기기 응답 오류 (${res.status})`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  // 루트(/)로 기기가 응답하는지 확인
  private async ping(timeoutMs = 4000): Promise<boolean> {
    try {
      await this.req('/', undefined, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  async discover(): Promise<DiscoveredDevice[]> {
    const ok = await this.ping();
    if (!ok) return []; // 해당 호스트에서 기기를 못 찾음
    return [
      {
        id: this.host,
        name: 'PETFIT (WiFi)',
        serial: this.host,
        rssi: -40,
      },
    ];
  }

  async connect(_device: DiscoveredDevice): Promise<BrushStatus> {
    const ok = await this.ping();
    if (!ok) throw new Error('기기에 연결할 수 없습니다.');
    this.connected = true;
    this.name = 'PETFIT (WiFi)';
    this.scanning = false;
    this.latest = {
      connected: true,
      battery: PLACEHOLDER_BATTERY,
      medication: PLACEHOLDER_MEDICATION,
      scanning: false,
    };
    return this.latest;
  }

  async disconnect(): Promise<void> {
    this.stopStatusPolling();
    this.connected = false;
    this.name = '';
    this.scanning = false;
    this.latest = { ...DEFAULT_STATUS };
  }

  async sendCommand(command: BrushCommand): Promise<BrushStatus | null> {
    if (!this.connected) return null;
    const path = COMMAND_PATH[command];
    if (path === '/') {
      // STATUS: 전용 엔드포인트가 없으므로 살아있는지만 확인
      await this.ping();
    } else {
      await this.req(path);
    }
    if (command === 'START_SCAN') this.scanning = true;
    if (command === 'STOP_SCAN') this.scanning = false;
    this.latest = { ...this.latest, connected: true, scanning: this.scanning };
    return this.latest;
  }

  async fetchStatus(): Promise<BrushStatus | null> {
    if (!this.connected) return null;
    // 펌웨어에 상태 엔드포인트가 없으므로 연결 유지 여부만 갱신한다.
    const alive = await this.ping();
    this.latest = { ...this.latest, connected: alive };
    return this.latest;
  }

  startStatusPolling(
    onStatus: (s: BrushStatus) => void,
    intervalMs: number = 3000,
  ): () => void {
    this.stopStatusPolling();
    const tick = async () => {
      try {
        const s = await this.fetchStatus();
        if (s) onStatus(s);
      } catch {
        // 일시적 네트워크 오류는 무시
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

  get isConnected(): boolean {
    return this.connected;
  }

  get currentDeviceName(): string {
    return this.name;
  }
}

export const wifiService = new WifiDeviceService();
