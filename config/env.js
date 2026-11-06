export function getConfig(overrides = {}) {
  return {
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || '',
    dbName: process.env.MONGODB_DB_NAME || 'iot_admin',
    dnsServers: (process.env.MONGODB_DNS_SERVERS || '').split(',').map(value => value.trim()).filter(Boolean),
    demo: process.env.DEMO_MODE !== 'false',
    sessionSecret: process.env.SESSION_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    mqtt: {
      url: process.env.MQTT_URL,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      prefix: process.env.MQTT_TOPIC_PREFIX || 'smartroom',
      dynamicSecurity: process.env.MQTT_DYNAMIC_SECURITY === 'true',
    },
    ...overrides,
  };
}
