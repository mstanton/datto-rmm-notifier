// Datto RMM API Types

export interface DattoAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface DattoAlert {
  alertUid: string;
  deviceUid: string;
  deviceName: string;
  siteUid: string;
  siteName: string;
  alertMessage: string;
  alertContext: string; // JSON string
  alertSourceType: string;
  alertDate: string;
  diagnostics: string;
}

export interface DattoDevice {
  uid: string;
  hostname: string;
  description: string;
  siteUid: string;
  siteName: string;
  operatingSystem: string;
  domain: string;
  lastSeenDate: string;
  online: boolean;
}

export interface DattoSite {
  uid: string;
  name: string;
  description: string;
  notes: string;
  portalUrl: string;
}

// Alert Context Types
export interface BaseAlertContext {
  '@class': string;
}

export interface OnlineOfflineStatusContext extends BaseAlertContext {
  '@class': 'online_offline_status_ctx';
  status: 'offline' | 'online';
  duration: number;
}

export interface PerfDiskUsageContext extends BaseAlertContext {
  '@class': 'perf_disk_usage_ctx';
  drive: string;
  usagePercent: number;
  freeSpace: number;
  totalSpace: number;
}

export interface PerfResourceUsageContext extends BaseAlertContext {
  '@class': 'perf_resource_usage_ctx';
  resourceType: 'cpu' | 'memory' | 'network';
  usagePercent: number;
  duration: number;
}

export interface AntivirusContext extends BaseAlertContext {
  '@class': 'antivirus_ctx';
  status: 'disabled' | 'outdated' | 'threat_detected';
  lastUpdate: string;
  threatName?: string;
}

export interface PatchContext extends BaseAlertContext {
  '@class': 'patch_ctx';
  missingPatches: number;
  criticalPatches: number;
  oldestPatchDate: string;
  cvssScore?: number;
}

export interface RansomwareContext extends BaseAlertContext {
  '@class': 'ransomware_ctx';
  threatLevel: string;
  detectedFiles: number;
  suspiciousActivity: string;
}

export type AlertContext =
  | OnlineOfflineStatusContext
  | PerfDiskUsageContext
  | PerfResourceUsageContext
  | AntivirusContext
  | PatchContext
  | RansomwareContext
  | BaseAlertContext;
