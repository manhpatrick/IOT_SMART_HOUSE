// Imported legacy firmware; NOT compatible with the current NODO MQTT contract yet.
// See firmware/REVIEW.md before flashing or connecting to the backend.
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

//  THÔNG TIN WI-FI & MQTT
#include "secrets.h"

// ================= CẤU HÌNH PHẦN CỨNG =================
#define PIN_MQ2       34
#define PIN_LDR       35
#define PIN_DHT       16
#define PIN_BUZZER    18
#define PIN_LED       19
#define PIN_RELAY     23

#define DHTTYPE DHT11
DHT dht(PIN_DHT, DHTTYPE);

// CẤU HÌNH RELAY ACTIVE HIGH (JUMPER CẮM VÀO VỊ TRÍ H)
#define RELAY_ON   HIGH
#define RELAY_OFF  LOW

// ================= NGƯỠNG CẤU HÌNH MẶC ĐỊNH =================
// Vì đã đảo logic: Càng sáng -> số càng cao (tối đa 4095), Càng tối -> số càng nhỏ (về sát 0)
// Ngưỡng 1200: Khi trời tối dưới mức này thì tự động bật đèn LED
int lightThreshold    = 1200;
int gasThreshold      = 1200; // Trên 1200 hú còi cảnh báo
float tempThreshold   = 30.0; // Trên 30.0 độ C tự động bật quạt
bool autoMode         = true; // true: tự động theo cảm biến | false: chỉnh tay trên web

// ================= BIẾN TRẠNG THÁI THIẾT BỊ =================
bool ledState = false;
bool fanState = false;
bool decommissioned = false; // Cờ khóa thiết bị vĩnh viễn

float nhietDo = 0.0;
float doAm    = 0.0;
int gasVal    = 0;
int lightVal  = 0;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long prevDhtMillis = 0;
unsigned long prevPubMillis = 0;
unsigned long prevBuzzerMillis = 0;
bool buzzerBeep = false;

// ================= HÀM XỬ LÝ LỆNH TỪ SERVER (CALLBACK) =================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (decommissioned) return;

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) return;

  String top = String(topic);

  // 1. Nhận lệnh điều khiển Bật/Tắt thiết bị thủ công từ Web
  if (top == TOPIC_COMMAND) {
    const char* dev = doc["device"];
    if (dev == nullptr || !doc["state"].is<int>()) return;
    int state = doc["state"];
    if ((strcmp(dev, "led") != 0 && strcmp(dev, "fan") != 0) || (state != 0 && state != 1)) return;
    autoMode = false;

    if (strcmp(dev, "led") == 0) {
      ledState = (state == 1);
      digitalWrite(PIN_LED, ledState ? HIGH : LOW);
    }
    else if (strcmp(dev, "fan") == 0) {
      fanState = (state == 1);
      digitalWrite(PIN_RELAY, fanState ? RELAY_ON : RELAY_OFF);
    }
  }

  // 2. Nhận thay đổi cấu hình ngưỡng hoặc khóa thiết bị vĩnh viễn
  else if (top == TOPIC_CONFIG) {
    if (doc.containsKey("decommission") && doc["decommission"] == true) {
      Serial.println("\n[CANH BAO] Thiet bi da bi DECOMMISSION (KHOA VINH VIEN)!");
      decommissioned = true;
      digitalWrite(PIN_LED, LOW);
      digitalWrite(PIN_RELAY, RELAY_OFF);
      digitalWrite(PIN_BUZZER, LOW);
      client.publish(TOPIC_STATUS, "{\"status\":\"decommissioned\"}", true);
      client.disconnect();
      return;
    }

    if (doc.containsKey("lightThresh")) lightThreshold = doc["lightThresh"];
    if (doc.containsKey("gasThresh"))   gasThreshold   = doc["gasThresh"];
    if (doc.containsKey("tempThresh"))  tempThreshold  = doc["tempThresh"];
    if (doc.containsKey("autoMode"))    autoMode       = doc["autoMode"];
  }
}

// ================= KẾT NỐI LẠI MQTT (LWT & TOKEN) =================
void reconnectMQTT() {
  if (decommissioned) return;

  while (!client.connected()) {
    Serial.print("Dang ket noi MQTT Broker...");

    String willTopic = String(TOPIC_STATUS);
    const char* willMessage = "{\"status\":\"offline\"}";

    // Kết nối xác thực bằng Token và cấu hình bản tin LWT
    if (client.connect(DEVICE_ID, DEVICE_ID, DEVICE_TOKEN, willTopic.c_str(), 1, true, willMessage)) {
      Serial.println(" Thanh cong!");
      client.publish(TOPIC_STATUS, "{\"status\":\"online\"}", true);
      client.subscribe(TOPIC_COMMAND);
      client.subscribe(TOPIC_CONFIG);
    } else {
      Serial.print(" That bai, rc=");
      Serial.print(client.state());
      Serial.println(" Thu lai sau 3 giay...");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT);

  // Mức tắt ban đầu: xuất LOW để Relay mức H không bị kích hoạt
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_RELAY, RELAY_OFF);

  dht.begin();

  // Kết nối Wi-Fi chống treo bộ nhớ cache
  Serial.print("\nDang ket noi WiFi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());

  // Thiết lập MQTT Client
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
  client.setBufferSize(1024); // Allow a larger MQTT packet than the default buffer.
  client.setKeepAlive(15); // Rút ngắn KeepAlive xuống 15s để nhận diện rút nguồn nhanh
}

void loop() {
  if (decommissioned) {
    delay(1000);
    return;
  }

  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  unsigned long currentMillis = millis();

  // 1. Đọc DHT11 định kỳ mỗi 2 giây
  if (currentMillis - prevDhtMillis >= 2000) {
    prevDhtMillis = currentMillis;
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t)) {
      doAm = h;
      nhietDo = t;
    }
  }

  // 2. Đọc giá trị cảm biến Analog (Đảo chiều logic quang trở LDR)
  gasVal = analogRead(PIN_MQ2);
  lightVal = 4095 - analogRead(PIN_LDR); // Càng sáng -> số càng cao, Càng tối -> số càng thấp

  // 3. Logic điều khiển Tự động (khi autoMode = true)
  if (autoMode) {
    // Khi trời tối (giá trị ánh sáng tụt xuống dưới ngưỡng lightThreshold) -> Bật đèn LED
    ledState = (lightVal < lightThreshold);
    digitalWrite(PIN_LED, ledState ? HIGH : LOW);

    // Khi trời nóng vượt ngưỡng nhiệt độ -> Tự động bật quạt
    fanState = (nhietDo > tempThreshold && nhietDo > 0.0);
    digitalWrite(PIN_RELAY, fanState ? RELAY_ON : RELAY_OFF);
  }

  // 4. Còi cảnh báo khí gas (hoạt động độc lập)
  if (gasVal > gasThreshold) {
    if (currentMillis - prevBuzzerMillis >= 150) {
      prevBuzzerMillis = currentMillis;
      buzzerBeep = !buzzerBeep;
      digitalWrite(PIN_BUZZER, buzzerBeep ? HIGH : LOW);
    }
  } else {
    digitalWrite(PIN_BUZZER, LOW);
  }

  // 5. Gửi Telemetry lên Broker định kỳ mỗi 1.5 giây
  if (currentMillis - prevPubMillis >= 1500) {
    prevPubMillis = currentMillis;

    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["temp"]      = nhietDo;
    doc["hum"]       = doAm;
    doc["gas"]       = gasVal;
    doc["light"]     = lightVal;
    doc["led"]       = ledState ? 1 : 0;
    doc["fan"]       = fanState ? 1 : 0;
    doc["alarm"]     = (gasVal > gasThreshold) ? 1 : 0;

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);
    client.publish(TOPIC_TELEMETRY, jsonBuffer);
  }
}