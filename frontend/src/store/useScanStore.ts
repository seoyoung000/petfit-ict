import { create } from 'zustand';
import { Scan, ScanSummary, BrushStatus } from '@/types';
import { scanAPI } from '@/services/api';

interface ScanState {
  currentScan: Scan | null;
  history: ScanSummary[];
  brushStatus: BrushStatus;
  isScanning: boolean;
  isUploading: boolean;
  setScanning: (v: boolean) => void;
  setBrushStatus: (s: Partial<BrushStatus>) => void;
  uploadScan: (petId: string, imageUri?: string, medication?: number, suction?: number) => Promise<Scan>;
  fetchHistory: (petId: string) => Promise<void>;
  fetchScan: (scanId: string) => Promise<void>;
  clearCurrentScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  currentScan: null,
  history: [],
  isScanning: false,
  isUploading: false,
  brushStatus: { connected: false, battery: 0, medication: 0, scanning: false },

  setScanning: (v) => set({ isScanning: v }),

  setBrushStatus: (s) =>
    set((prev) => ({ brushStatus: { ...prev.brushStatus, ...s } })),

  uploadScan: async (petId, imageUri, medication = 0, suction = 0) => {
    set({ isUploading: true });
    try {
      const form = new FormData();
      form.append('pet_id', petId);
      form.append('medication_dispensed', String(medication));
      form.append('suction_used', String(suction));
      if (imageUri) {
        form.append('file', {
          uri: imageUri,
          name: 'scan.jpg',
          type: 'image/jpeg',
        } as any);
      }
      const { data } = await scanAPI.upload(form);
      set((s) => ({
        currentScan: data,
        history: [
          {
            id: data.id,
            pet_id: data.pet_id,
            thumbnail_url: data.thumbnail_url,
            health_score: data.health_score,
            severity: data.severity,
            condition_count: data.diagnoses.length,
            scanned_at: data.scanned_at,
          },
          ...s.history,
        ],
      }));
      return data;
    } finally {
      set({ isUploading: false });
    }
  },

  fetchHistory: async (petId) => {
    const { data } = await scanAPI.history(petId);
    set({ history: data });
  },

  fetchScan: async (scanId) => {
    const { data } = await scanAPI.get(scanId);
    set({ currentScan: data });
  },

  clearCurrentScan: () => set({ currentScan: null }),
}));
