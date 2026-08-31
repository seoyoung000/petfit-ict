import { create } from 'zustand';
import { Pet } from '@/types';
import { petAPI } from '@/services/api';

interface PetState {
  pets: Pet[];
  selectedPet: Pet | null;
  isLoading: boolean;
  fetchPets: () => Promise<void>;
  selectPet: (pet: Pet) => void;
  createPet: (data: Partial<Pet>) => Promise<Pet>;
  updatePet: (id: string, data: Partial<Pet>) => Promise<void>;
  deletePet: (id: string) => Promise<void>;
}

export const usePetStore = create<PetState>((set, get) => ({
  pets: [],
  selectedPet: null,
  isLoading: false,

  fetchPets: async () => {
    set({ isLoading: true });
    try {
      const { data } = await petAPI.list();
      set({ pets: data });
      if (!get().selectedPet && data.length > 0) {
        set({ selectedPet: data[0] });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  selectPet: (pet) => set({ selectedPet: pet }),

  createPet: async (data) => {
    const { data: pet } = await petAPI.create(data);
    set((s) => ({ pets: [...s.pets, pet], selectedPet: s.selectedPet ?? pet }));
    return pet;
  },

  updatePet: async (id, data) => {
    const { data: updated } = await petAPI.update(id, data);
    set((s) => ({
      pets: s.pets.map((p) => (p.id === id ? updated : p)),
      selectedPet: s.selectedPet?.id === id ? updated : s.selectedPet,
    }));
  },

  deletePet: async (id) => {
    await petAPI.delete(id);
    set((s) => {
      const pets = s.pets.filter((p) => p.id !== id);
      return {
        pets,
        selectedPet: s.selectedPet?.id === id ? (pets[0] ?? null) : s.selectedPet,
      };
    });
  },
}));
