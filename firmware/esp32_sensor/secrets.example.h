#pragma once
// Copy to secrets.h locally. These are legacy settings, not a NODO-ready contract.
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "YOUR_BROKER_LAN_IP";
const int mqtt_port = 1884;
// The imported firmware still uses the old ID/topics/JSON. See ../REVIEW.md.
const char* DEVICE_ID = "esp32_node_01";
const char* DEVICE_TOKEN = "YOUR_NODE_MQTT_PASSWORD";
const char* TOPIC_TELEMETRY = "devices/esp32_node_01/telemetry";
const char* TOPIC_COMMAND = "devices/esp32_node_01/commands";
const char* TOPIC_CONFIG = "devices/esp32_node_01/config";
const char* TOPIC_STATUS = "devices/esp32_node_01/status";
