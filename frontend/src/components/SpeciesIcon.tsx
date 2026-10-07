import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pet } from '@/types';

export default function SpeciesIcon({ species, size, color }: { species: Pet['species']; size: number; color: string }) {
  return <MaterialCommunityIcons name={species === 'cat' ? 'cat' : 'dog'} size={size} color={color} />;
}
