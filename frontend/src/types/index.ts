export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Pet {
  id: string;
  name: string;
  species: 'dog' | 'cat';
  breed?: string;
  age_months?: number;
  weight_kg?: number;
  gender?: string;
  neutered: boolean;
  profile_image_url?: string;
  created_at: string;
}

export interface DiagnosisItem {
  condition: string;
  confidence: number;
  area?: string;
  action: string;
}

export type Severity = 'normal' | 'minor' | 'warning' | 'critical';

export interface Scan {
  id: string;
  pet_id: string;
  image_url?: string;
  thumbnail_url?: string;
  health_score?: number;
  severity?: Severity;
  diagnoses: DiagnosisItem[];
  medication_dispensed: number;
  suction_used: number;
  notes?: string;
  scanned_at: string;
}

export interface ScanSummary {
  id: string;
  pet_id: string;
  thumbnail_url?: string;
  health_score?: number;
  severity?: Severity;
  condition_count: number;
  scanned_at: string;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  serial: string;
  rssi: number;
}

export type BrushCommand = 'START_SCAN' | 'STOP_SCAN' | 'DISPENSE' | 'SUCTION' | 'STATUS';

export interface BrushStatus {
  connected: boolean;
  battery: number;       // 0~100
  medication: number;    // 0~100 %
  scanning: boolean;
}
