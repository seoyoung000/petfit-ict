/******************************************************************************
 * Petfit ESP32-CAM  BLE 펌웨어  (WiFi 대신 블루투스 BLE로 통신)
 * ----------------------------------------------------------------------------
 * 앱(petfit-app)의 bleService.ts 와 100% 호환되도록 만든 코드입니다.
 *
 *  [ 반드시 준비 ]
 *   1) 보드: "AI Thinker ESP32-CAM"  (도구 > 보드)
 *   2) PSRAM: Enabled                (도구 > PSRAM)  ← 카메라에 필수
 *   3) 라이브러리 설치: "NimBLE-Arduino" (라이브러리 매니저에서 검색·설치)
 *      → 일반 ESP32 BLE 라이브러리는 카메라와 같이 쓰면 메모리 부족으로 죽습니다.
 *        NimBLE 는 RAM 을 훨씬 적게 써서 ESP32-CAM + BLE 조합에 적합합니다.
 *
 *  [ 앱과의 프로토콜 ]  (bleService.ts 기준)
 *   - 기기 이름: "PETFIT-CAM"        (앱은 이름에 PETFIT 포함 기기를 찾음)
 *   - Service : 6E400001-B5A3-F393-E0A9-E50E24DCCA9E  (Nordic UART)
 *   - TX char : 6E400002...  앱 → 기기 (WRITE)  : 명령 수신
 *   - RX char : 6E400003...  기기 → 앱 (NOTIFY) : 상태/이미지 송신
 *
 *   앱이 보내는 명령(TX):
 *     0x01 START_SCAN  → 촬영 후 이미지를 BLE로 전송
 *     0x02 STOP_SCAN
 *     0x03 DISPENSE
 *     0x04 SUCTION
 *     0x05 STATUS      → [0x05, battery, medication, flags] 로 응답
 *     0x10 ...         → WiFi 자격증명 프레임(여기선 무시)
 *
 *   기기가 보내는 상태(RX):  [0x05, battery, medication, flags]
 *       flags bit0 = scanning
 *
 *   이미지 전송 프로토콜(RX, 이 펌웨어가 추가로 정의 — 앱에도 동일 처리 필요):
 *       시작 : [0xA0, lenHi, len2, len1, lenLo]   (JPEG 총 길이 4바이트, big-endian)
 *       본문 : JPEG 원본 바이트를 (MTU-3) 크기로 잘라 연속 notify
 *       끝   : [0xA1]
 ******************************************************************************/

#include <NimBLEDevice.h>
#include "esp_camera.h"

// ── AI-Thinker ESP32-CAM 핀맵 ────────────────────────────────────────────────
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22

// ── BLE UUID (앱과 반드시 동일) ──────────────────────────────────────────────
#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // App -> Device (WRITE)
#define RX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // Device -> App (NOTIFY)

// 이미지 프레이밍 마커
#define IMG_BEGIN 0xA0
#define IMG_END   0xA1

NimBLECharacteristic* rxChar = nullptr;   // 기기 → 앱 (notify)
volatile bool  deviceConnected = false;
volatile bool  scanning        = false;
uint16_t       negotiatedMTU   = 23;      // 협상된 MTU (기본 23 → payload 20B)

// 카메라 보드에는 배터리/약물 센서가 없으므로 데모용 고정값
uint8_t battery    = 100;
uint8_t medication = 100;

// ── 상태 알림 전송: [0x05, battery, medication, flags] ───────────────────────
void sendStatus() {
  if (!deviceConnected || rxChar == nullptr) return;
  uint8_t buf[4];
  buf[0] = 0x05;
  buf[1] = battery;
  buf[2] = medication;
  buf[3] = scanning ? 0x01 : 0x00;
  rxChar->setValue(buf, 4);
  rxChar->notify();
}

// ── 촬영 후 JPEG 를 BLE 로 잘게 나눠 전송 ────────────────────────────────────
void captureAndSend() {
  if (!deviceConnected || rxChar == nullptr) return;

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("촬영 실패");
    return;
  }
  Serial.printf("촬영 성공: %u bytes 전송 시작\n", fb->len);

  // 1) 시작 헤더 [0xA0, 길이 4바이트]
  uint8_t header[5];
  header[0] = IMG_BEGIN;
  header[1] = (fb->len >> 24) & 0xFF;
  header[2] = (fb->len >> 16) & 0xFF;
  header[3] = (fb->len >> 8)  & 0xFF;
  header[4] = (fb->len)       & 0xFF;
  rxChar->setValue(header, 5);
  rxChar->notify();
  delay(15);

  // 2) 본문 청크 전송 (MTU-3 크기)
  size_t chunk = (negotiatedMTU > 23) ? (negotiatedMTU - 3) : 20;
  size_t sent  = 0;
  while (sent < fb->len) {
    size_t n = fb->len - sent;
    if (n > chunk) n = chunk;
    rxChar->setValue(fb->buf + sent, n);
    rxChar->notify();
    sent += n;
    delay(10);              // notify 큐 넘침 방지 (안정성 우선)
  }

  // 3) 끝 마커 [0xA1]
  uint8_t endMark = IMG_END;
  rxChar->setValue(&endMark, 1);
  rxChar->notify();

  esp_camera_fb_return(fb);
  Serial.println("이미지 전송 완료");
}

// ── 명령 처리 ───────────────────────────────────────────────────────────────
void handleCommand(const uint8_t* data, size_t len) {
  if (len == 0) return;
  switch (data[0]) {
    case 0x01: // START_SCAN
      Serial.println("CMD: START_SCAN");
      scanning = true;
      sendStatus();
      captureAndSend();
      scanning = false;
      sendStatus();
      break;
    case 0x02: // STOP_SCAN
      Serial.println("CMD: STOP_SCAN");
      scanning = false;
      sendStatus();
      break;
    case 0x03: // DISPENSE (카메라 보드엔 모듈 없음 → ack 만)
      Serial.println("CMD: DISPENSE");
      sendStatus();
      break;
    case 0x04: // SUCTION
      Serial.println("CMD: SUCTION");
      sendStatus();
      break;
    case 0x05: // STATUS
      sendStatus();
      break;
    case 0x10: // WiFi provisioning (BLE 전용 펌웨어에선 사용 안 함)
      Serial.println("CMD: WiFi 자격증명 수신(무시)");
      break;
    default:
      Serial.printf("알 수 없는 명령: 0x%02X\n", data[0]);
      break;
  }
}

// ── BLE 콜백 ─────────────────────────────────────────────────────────────────
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s) {
    deviceConnected = true;
    Serial.println("앱 연결됨");
  }
  void onDisconnect(NimBLEServer* s) {
    deviceConnected = false;
    negotiatedMTU = 23;
    Serial.println("연결 해제 → 다시 광고 시작");
    NimBLEDevice::startAdvertising();
  }
  void onMTUChange(uint16_t MTU, ble_gap_conn_desc* desc) {
    negotiatedMTU = MTU;
    Serial.printf("MTU 협상됨: %u (청크 %u bytes)\n", MTU, MTU - 3);
  }
};

class TxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) {
    std::string v = c->getValue();
    handleCommand((const uint8_t*)v.data(), v.size());
  }
};

// ── 카메라 초기화 ────────────────────────────────────────────────────────────
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;   config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM; config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;   config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // BLE 는 느리므로 이미지를 작게! (QVGA 320x240 ≈ 8~15KB → 전송 빠름)
  // 더 빠르게: FRAMESIZE_QQVGA(160x120).  더 선명하게: FRAMESIZE_VGA(640x480, 느림)
  if (psramFound()) {
    config.frame_size   = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;   // 숫자 클수록 용량 작음(화질 낮음)
    config.fb_count     = 2;
  } else {
    config.frame_size   = FRAMESIZE_QQVGA;
    config.jpeg_quality = 15;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("카메라 초기화 실패: 0x%x\n", err);
    return false;
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Petfit ESP32-CAM (BLE) 시작 ===");

  if (!initCamera()) {
    Serial.println("카메라 없이 계속 진행(BLE만 동작)");
  }

  // BLE 초기화
  NimBLEDevice::init("PETFIT-CAM");          // 기기 이름
  NimBLEDevice::setMTU(517);                  // 큰 MTU 요청 → 이미지 전송 가속
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);     // 송신 출력 최대

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);

  // TX: 앱 → 기기 (쓰기)
  NimBLECharacteristic* txChar = service->createCharacteristic(
      TX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  txChar->setCallbacks(new TxCallbacks());

  // RX: 기기 → 앱 (알림)
  rxChar = service->createCharacteristic(RX_UUID, NIMBLE_PROPERTY::NOTIFY);

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();

  Serial.println("BLE 광고 시작 — 앱에서 'PETFIT-CAM' 검색하세요");
}

void loop() {
  // 연결돼 있으면 2초마다 상태 알림 (앱의 상태 폴링과 별개로 안정성 보강)
  static uint32_t last = 0;
  if (deviceConnected && millis() - last > 2000) {
    last = millis();
    sendStatus();
  }
  delay(10);
}
