/******************************************************************************
 * Petfit ESP32-CAM  BLE 펌웨어
 * ----------------------------------------------------------------------------
 * 앱(frontend/src/services/bleService.ts)과는 BLE 로 통신하고,
 * 약물 분사 모터가 달린 ESP32 개발보드에는 ESP-NOW 로 명령을 전달합니다.
 *
 *   앱 ──BLE──> ESP32-CAM ──ESP-NOW──> 모터 보드(MOTOR_MAC)
 *
 *  [ 반드시 준비 ]
 *   1) 보드: "AI Thinker ESP32-CAM"        (도구 > 보드)
 *   2) PSRAM: Enabled                      (도구 > PSRAM)  ← 카메라에 필수
 *   3) 라이브러리: "NimBLE-Arduino" 2.x    (라이브러리 매니저에서 설치)
 *      → 일반 ESP32 BLE 라이브러리는 카메라와 같이 쓰면 메모리 부족으로 죽습니다.
 *      → 1.x 버전과는 콜백 형식이 달라서 컴파일되지 않습니다. 2.x를 쓰세요.
 *
 *  [ 앱과의 프로토콜 ]
 *   - 기기 이름: "PETFIT-CAM"   (앱은 이름에 PETFIT 이 들어간 기기를 찾음)
 *   - Service : 6E400001-B5A3-F393-E0A9-E50E24DCCA9E  (Nordic UART)
 *   - TX char : 6E400002...  앱 → 기기 (WRITE)  : 명령 수신
 *   - RX char : 6E400003...  기기 → 앱 (NOTIFY) : 상태/이미지 송신
 *
 *   앱이 보내는 명령(TX, 첫 바이트):
 *     0x01 START_SCAN  → 촬영 후 이미지를 BLE로 전송
 *     0x02 STOP_SCAN   → 대기 중인 촬영 취소
 *     0x03 DISPENSE    → ESP-NOW 로 모터 보드에 0x03 전달 (모터 ON)
 *     0x05 STATUS      → 상태 응답
 *     0x06 PREVIEW_START → 미리보기: 끊임없이 촬영해 이미지를 계속 전송
 *     0x07 PREVIEW_STOP  → 미리보기 중지 (STOP_SCAN 도 미리보기를 멈춤)
 *     0x10 ...         → WiFi 자격증명 프레임 (이 펌웨어에선 무시)
 *
 *   기기가 보내는 상태(RX):  [0x05, battery, medication, flags]
 *       flags bit0 = scanning(촬영/전송 중)
 *   분사 결과(RX): [0x08, result]
 *       result 0 = 모터 보드가 펌프 작동을 마치고 회신함
 *       result 1 = 모터 보드 전송 실패 또는 응답 시간 초과
 *
 *   이미지 전송(RX):
 *       시작 : [0xA0, len3, len2, len1, len0]   (JPEG 총 길이, big-endian 4바이트)
 *       본문 : JPEG 원본 바이트를 (MTU-3) 크기로 잘라 연속 notify
 *       끝   : [0xA1]
 *     미리보기 프레임도 같은 형식으로 연달아 보낸다.
 *     이미지 전송 중에는 상태 알림을 보내지 않음 (앱이 이미지 조각과 헷갈리지 않게).
 *
 *  [ 모터 보드(ESP-NOW) ]
 *   - 모터 보드 MAC 은 아래 MOTOR_MAC. 1바이트 0x03 을 받으면 모터가 켜진다.
 *   - 두 보드는 같은 WiFi 채널(ESPNOW_CHANNEL)이어야 한다. 모터 보드가 공유기에
 *     연결돼 있지 않으면 기본 채널 1 이므로 그대로 맞는다.
 *   - 부팅 시 시리얼에 이 보드(카메라)의 MAC 이 찍힌다. 모터 보드가 송신자를
 *     등록해야 하면 그 값을 쓰면 된다.
 ******************************************************************************/

#include <NimBLEDevice.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
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
#define DEVICE_NAME  "PETFIT-CAM"
#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // App -> Device (WRITE)
#define RX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // Device -> App (NOTIFY)

// ── 프로토콜 상수 ────────────────────────────────────────────────────────────
#define CMD_START_SCAN 0x01
#define CMD_STOP_SCAN  0x02
#define CMD_DISPENSE   0x03
#define CMD_STATUS     0x05
#define CMD_PREVIEW_START 0x06
#define CMD_PREVIEW_STOP  0x07
#define CMD_WIFI       0x10
#define MSG_STATUS     0x05
#define MSG_DISPENSE_RESULT 0x08
#define IMG_BEGIN      0xA0
#define IMG_END        0xA1

#define STATUS_INTERVAL_MS 2000   // 연결 중 주기적 상태 알림 간격
#define NOTIFY_RETRY_MAX    200   // notify 버퍼가 찼을 때 재시도 횟수 (x 5ms)
#define MAX_CHUNK           512   // BLE 값 하나의 최대 길이. 넘으면 안드로이드가 잘라버린다
#define DISPENSE_RESULT_TIMEOUT_MS 5000

// ── 모터 보드 (ESP-NOW) ──────────────────────────────────────────────────────
const uint8_t MOTOR_MAC[6] = {0x14, 0xC1, 0x9F, 0xC1, 0x1F, 0x0C};
#define ESPNOW_CHANNEL 1

// ── 전역 상태 ────────────────────────────────────────────────────────────────
NimBLEServer*         server = nullptr;
NimBLECharacteristic* rxChar = nullptr;

// BLE 콜백(NimBLE 태스크)과 loop() 사이에서 공유되는 값
volatile bool     deviceConnected = false;
volatile bool     subscribed      = false;   // 앱이 RX 알림을 구독했는지
volatile bool     captureRequested = false;  // 촬영 요청 (loop 에서 처리)
volatile bool     previewing       = false;  // 미리보기 중 (loop 에서 프레임 반복 전송)
volatile bool     statusRequested  = false;  // 상태 응답 요청 (loop 에서 처리)
volatile bool     dispenseRequested = false; // 모터 보드로 분사 명령 전달 요청 (loop 에서 처리)

// ESP-NOW 전송 결과 (WiFi 태스크 콜백 → loop 에서 출력)
volatile bool     espNowResultReady = false;
volatile bool     espNowDelivered   = false;
volatile bool     motorDispenseResultReady = false;
volatile uint8_t  motorDispenseResult = 1;
bool              espNowReady       = false;
volatile uint16_t negotiatedMTU   = 23;      // 협상된 MTU (기본 23 → payload 20B)

bool scanning = false;
bool cameraReady = false;
bool dispenseAwaitingMotor = false;
uint32_t dispenseDeadlineMs = 0;

// 카메라 보드에는 배터리/약물 센서가 없으므로 데모용 고정값
uint8_t battery    = 100;
uint8_t medication = 100;

// ── notify 전송 (버퍼가 차면 잠깐 기다렸다 재시도) ────────────────────────────
// 그냥 notify() 만 연속 호출하면 버퍼가 찼을 때 조각이 조용히 버려져 이미지가 깨진다.
bool notifyReliable(const uint8_t* data, size_t len) {
  for (int i = 0; i < NOTIFY_RETRY_MAX; i++) {
    if (!deviceConnected || !subscribed) return false;
    if (rxChar->notify(data, len)) return true;
    delay(5);
  }
  return false;
}

// ── 상태 알림: [0x05, battery, medication, flags] ───────────────────────────
void sendStatus() {
  if (!deviceConnected || !subscribed) return;
  uint8_t buf[4] = {MSG_STATUS, battery, medication, (uint8_t)(scanning ? 0x01 : 0x00)};
  notifyReliable(buf, sizeof(buf));
}

// ── 분사 결과 알림: [0x08, result] ────────────────────────────────────────
void sendDispenseResult(uint8_t result) {
  uint8_t buf[2] = {MSG_DISPENSE_RESULT, result};
  notifyReliable(buf, sizeof(buf));
}

// ── 한 장 촬영해 JPEG 를 BLE 로 잘게 나눠 전송 (미리보기/단일 촬영 공용) ──────
// 반환: 끝 마커까지 다 보냈으면 true. sentBytes 에 보낸 본문 길이를 담는다.
bool sendFrame(size_t* sentBytes) {
  *sentBytes = 0;
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("촬영 실패");
    return false;
  }

  // 1) 시작 헤더 [0xA0, 길이 4바이트]
  uint8_t header[5] = {
    IMG_BEGIN,
    (uint8_t)((fb->len >> 24) & 0xFF),
    (uint8_t)((fb->len >> 16) & 0xFF),
    (uint8_t)((fb->len >> 8)  & 0xFF),
    (uint8_t)( fb->len        & 0xFF),
  };
  bool sendOk = notifyReliable(header, sizeof(header));

  // 2) 본문 청크 전송 (MTU-3 크기, 최대 512바이트)
  size_t chunk = (negotiatedMTU > 23) ? (negotiatedMTU - 3) : 20;
  if (chunk > MAX_CHUNK) chunk = MAX_CHUNK;
  size_t sent = 0;
  while (sendOk && sent < fb->len) {
    size_t n = fb->len - sent;
    if (n > chunk) n = chunk;
    sendOk = notifyReliable(fb->buf + sent, n);
    sent += n;
  }

  // 3) 끝 마커 [0xA1]
  if (sendOk) {
    uint8_t endMark = IMG_END;
    sendOk = notifyReliable(&endMark, 1);
  }

  esp_camera_fb_return(fb);
  *sentBytes = sent;
  return sendOk;
}

// ── 단일 촬영 (START_SCAN) ───────────────────────────────────────────────────
void captureAndSend() {
  if (!deviceConnected || !subscribed) return;
  if (!cameraReady) {
    Serial.println("카메라가 준비되지 않아 촬영 불가");
    return;
  }

  scanning = true;
  sendStatus();

  uint32_t startMs = millis();
  size_t sent = 0;
  bool ok = sendFrame(&sent);
  scanning = false;

  if (ok) {
    Serial.printf("이미지 전송 완료: %u bytes, %lu ms\n", sent, millis() - startMs);
  } else {
    Serial.printf("이미지 전송 중단: %u bytes 보냄 (촬영 실패, 연결 끊김 또는 버퍼 정체)\n", sent);
  }
  sendStatus();
}

// ── 미리보기 한 프레임 (PREVIEW_START 동안 loop 에서 반복) ───────────────────
void sendPreviewFrame() {
  static uint32_t frames = 0, windowStart = 0;
  if (!deviceConnected || !subscribed || !cameraReady) return;

  size_t sent = 0;
  if (!sendFrame(&sent)) return;

  // 3초마다 실제 프레임 속도 출력 (전송 상태 확인용)
  frames++;
  uint32_t now = millis();
  if (windowStart == 0) windowStart = now;
  if (now - windowStart >= 3000) {
    Serial.printf("미리보기: %.1f fps (마지막 %u bytes)\n", frames * 1000.0f / (now - windowStart), sent);
    frames = 0;
    windowStart = now;
  }
}

// ── 명령 처리 (BLE 콜백에서 호출 — 무거운 작업은 loop 로 넘긴다) ─────────────
void handleCommand(const uint8_t* data, size_t len) {
  if (len == 0) return;
  switch (data[0]) {
    case CMD_START_SCAN:
      Serial.println("CMD: START_SCAN");
      captureRequested = true;
      break;
    case CMD_STOP_SCAN:
      Serial.println("CMD: STOP_SCAN");
      captureRequested = false;
      previewing = false;
      statusRequested = true;
      break;
    case CMD_PREVIEW_START:
      Serial.println("CMD: PREVIEW_START");
      previewing = true;
      break;
    case CMD_PREVIEW_STOP:
      Serial.println("CMD: PREVIEW_STOP");
      previewing = false;
      break;
    case CMD_DISPENSE:
      Serial.println("CMD: DISPENSE → 모터 보드로 전달");
      dispenseRequested = true;
      statusRequested = true;
      break;
    case CMD_STATUS:
      statusRequested = true;
      break;
    case CMD_WIFI:
      Serial.println("CMD: WiFi 자격증명 수신 (BLE 펌웨어에선 무시)");
      break;
    default:
      Serial.printf("알 수 없는 명령: 0x%02X\n", data[0]);
      break;
  }
}

// ── ESP-NOW: 모터 보드로 분사 명령 전달 ──────────────────────────────────────
// 전송 완료 콜백 형식이 ESP-IDF 5.5(arduino-esp32 3.3)부터 바뀌어서 둘 다 지원한다.
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
void onEspNowSent(const esp_now_send_info_t* info, esp_now_send_status_t status) {
#else
void onEspNowSent(const uint8_t* mac, esp_now_send_status_t status) {
#endif
  espNowDelivered = (status == ESP_NOW_SEND_SUCCESS);
  espNowResultReady = true;
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
void onEspNowReceived(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
#else
void onEspNowReceived(const uint8_t* mac, const uint8_t* data, int len) {
#endif
  // 모터 보드는 펌프를 끈 뒤 [0x83, 0x00]을 회신한다.
  if (len >= 2 && data[0] == 0x83) {
    motorDispenseResult = data[1];
    motorDispenseResultReady = true;
  }
}

bool initEspNow() {
  WiFi.mode(WIFI_STA);   // 공유기에는 연결하지 않음. ESP-NOW 에만 WiFi 무선을 쓴다
  WiFi.disconnect();
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW 초기화 실패");
    return false;
  }
  esp_now_register_send_cb(onEspNowSent);
  esp_now_register_recv_cb(onEspNowReceived);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, MOTOR_MAC, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.ifidx   = WIFI_IF_STA;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("ESP-NOW 모터 보드 등록 실패");
    return false;
  }

  Serial.printf("ESP-NOW 준비: 이 보드 MAC %s → 모터 보드 %02X:%02X:%02X:%02X:%02X:%02X (채널 %d)\n",
                WiFi.macAddress().c_str(),
                MOTOR_MAC[0], MOTOR_MAC[1], MOTOR_MAC[2], MOTOR_MAC[3], MOTOR_MAC[4], MOTOR_MAC[5],
                ESPNOW_CHANNEL);
  return true;
}

void sendDispenseToMotor() {
  if (!espNowReady) {
    Serial.println("ESP-NOW 가 준비되지 않아 모터 명령을 보낼 수 없음");
    sendDispenseResult(1);
    return;
  }
  uint8_t cmd = CMD_DISPENSE;
  esp_err_t err = esp_now_send(MOTOR_MAC, &cmd, 1);
  if (err != ESP_OK) {
    Serial.printf("모터 보드 전송 실패: %s\n", esp_err_to_name(err));
    sendDispenseResult(1);
    return;
  }
  dispenseAwaitingMotor = true;
  dispenseDeadlineMs = millis() + DISPENSE_RESULT_TIMEOUT_MS;
}

// ── BLE 콜백 (NimBLE-Arduino 2.x 형식) ───────────────────────────────────────
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& connInfo) override {
    deviceConnected = true;
    Serial.printf("앱 연결됨: %s\n", connInfo.getAddress().toString().c_str());
    // 연결 간격을 짧게(7.5~15ms) 요청 → 이미지 전송 속도 향상
    s->updateConnParams(connInfo.getConnHandle(), 6, 12, 0, 200);
  }

  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& connInfo, int reason) override {
    deviceConnected = false;
    subscribed = false;
    captureRequested = false;
    previewing = false;
    negotiatedMTU = 23;
    Serial.printf("연결 해제 (reason %d) → 다시 광고 시작\n", reason);
    NimBLEDevice::startAdvertising();
  }

  void onMTUChange(uint16_t MTU, NimBLEConnInfo& connInfo) override {
    negotiatedMTU = MTU;
    Serial.printf("MTU 협상됨: %u (청크 %u bytes)\n", MTU, min(MTU - 3, MAX_CHUNK));
  }
};

class TxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
    NimBLEAttValue v = c->getValue();
    handleCommand(v.data(), v.length());
  }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
  // subValue: 0 = 구독 해제, 1 = notify, 2 = indicate
  void onSubscribe(NimBLECharacteristic* c, NimBLEConnInfo& connInfo, uint16_t subValue) override {
    subscribed = (subValue & 0x0001) != 0;
    Serial.printf("RX 알림 구독: %s\n", subscribed ? "ON" : "OFF");
    if (subscribed) statusRequested = true;
  }
};

// ── 카메라 초기화 ────────────────────────────────────────────────────────────
bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk  = XCLK_GPIO_NUM;  config.pin_pclk  = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href  = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn  = PWDN_GPIO_NUM;  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // 버퍼 1개 + 빈 버퍼일 때만 촬영 → 명령 받은 시점의 새 사진이 나온다.
  // (버퍼 2개면 미리 찍혀 있던 예전 프레임이 먼저 나옴)
  config.fb_count  = 1;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  // BLE 는 느리므로 이미지를 작게! (QVGA 320x240 ≈ 8~15KB)
  // 더 빠르게: FRAMESIZE_QQVGA(160x120).  더 선명하게: FRAMESIZE_VGA(640x480, 느림)
  if (psramFound()) {
    config.frame_size   = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;   // 숫자 클수록 용량 작음(화질 낮음)
    config.fb_location  = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size   = FRAMESIZE_QQVGA;
    config.jpeg_quality = 15;
    config.fb_location  = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("카메라 초기화 실패: 0x%x\n", err);
    return false;
  }
  return true;
}

// ── BLE 초기화 ───────────────────────────────────────────────────────────────
void initBLE() {
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setMTU(517);   // 큰 MTU 허용 → 앱이 요청하면 이미지 전송 가속
  NimBLEDevice::setPower(9);   // 송신 출력 9 dBm (최대)

  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);

  NimBLECharacteristic* txChar = service->createCharacteristic(
      TX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  txChar->setCallbacks(new TxCallbacks());

  rxChar = service->createCharacteristic(RX_UUID, NIMBLE_PROPERTY::NOTIFY);
  rxChar->setCallbacks(new RxCallbacks());
  // 서비스는 서버가 광고를 시작할 때 자동으로 시작된다 (2.x에선 service->start() 불필요)

  // 광고 패킷은 31바이트 제한: 128비트 UUID(18) + flags(3)만 넣고
  // 이름은 스캔 응답에 따로 넣는다. 한 패킷에 다 넣으면 넘쳐서 이름이나 UUID가 빠짐.
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.addServiceUUID(NimBLEUUID(SERVICE_UUID));

  NimBLEAdvertisementData scanData;
  scanData.setName(DEVICE_NAME);

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  adv->enableScanResponse(true);
  adv->start();
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Petfit ESP32-CAM (BLE) 시작 ===");

  cameraReady = initCamera();
  if (!cameraReady) {
    Serial.println("카메라 없이 계속 진행 (BLE 연결/상태만 동작)");
  }

  espNowReady = initEspNow();

  initBLE();
  Serial.printf("BLE 광고 시작 — 앱에서 '%s' 검색하세요\n", DEVICE_NAME);
}

void loop() {
  // 촬영/전송은 BLE 콜백이 아니라 여기서 한다.
  // 콜백 안에서 오래 붙잡고 있으면 BLE 처리 전체가 멈춰 연결이 끊길 수 있다.
  if (captureRequested) {
    captureRequested = false;
    captureAndSend();
  }

  if (dispenseRequested) {
    dispenseRequested = false;
    sendDispenseToMotor();
  }

  if (espNowResultReady) {
    espNowResultReady = false;
    Serial.println(espNowDelivered
        ? "모터 보드 명령 수신 확인 → 펌프 완료 회신 대기"
        : "모터 보드 응답 없음 (전원 / MAC / WiFi 채널 확인)");
    if (!espNowDelivered && dispenseAwaitingMotor) {
      dispenseAwaitingMotor = false;
      sendDispenseResult(1);
    }
  }

  if (motorDispenseResultReady) {
    motorDispenseResultReady = false;
    if (dispenseAwaitingMotor) {
      dispenseAwaitingMotor = false;
      Serial.printf("모터 보드 분사 완료 회신: %u\n", motorDispenseResult);
      sendDispenseResult(motorDispenseResult);
    }
  }

  if (dispenseAwaitingMotor && (int32_t)(millis() - dispenseDeadlineMs) >= 0) {
    dispenseAwaitingMotor = false;
    Serial.println("모터 보드의 분사 완료 회신 시간 초과");
    sendDispenseResult(1);
  }

  if (statusRequested) {
    statusRequested = false;
    sendStatus();
  }

  // 미리보기: 한 프레임씩 보내고 매번 loop 로 돌아와 명령/상태를 처리한다
  if (previewing) {
    sendPreviewFrame();
  }

  // 연결 중이면 주기적으로 상태 알림 (이미지 전송은 위에서 끝난 뒤라 섞이지 않음)
  static uint32_t lastStatus = 0;
  if (deviceConnected && subscribed && millis() - lastStatus > STATUS_INTERVAL_MS) {
    lastStatus = millis();
    sendStatus();
  }

  delay(10);
}
