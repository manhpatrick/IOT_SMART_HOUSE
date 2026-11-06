export const defaults = profile => profile === 'climate'
  ? { mode: 'AUTO', fanOn: 30, fanOff: 28, temperatureAlert: 35 }
  : { mode: 'AUTO', lightOn: 30, lightOff: 45 };
export const workspaceDefaults = { name: 'Phòng thực hành IoT', timezone: 'Asia/Ho_Chi_Minh', offlineSeconds: 35, retentionDays: 30 };
