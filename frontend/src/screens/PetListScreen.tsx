import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { usePetStore } from '@/store/usePetStore';
import { resolveMediaUrl } from '@/services/api';
import { useTheme } from '@/theme/useTheme';
import SpeciesIcon from '@/components/SpeciesIcon';
import { RootStackParams } from '@/navigation/AppNavigator';
import { Pet } from '@/types';

type Nav = StackNavigationProp<RootStackParams>;

function formatAge(months?: number): string {
  if (!months) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}개월`;
  if (m === 0) return `${y}세`;
  return `${y}세 ${m}개월`;
}

export default function PetListScreen() {
  const nav = useNavigation<Nav>();
  const { pets, selectedPet, fetchPets, selectPet } = usePetStore();
  const [refreshing, setRefreshing] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => { fetchPets(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPets();
    setRefreshing(false);
  };

  const handleEdit = (pet: Pet) => {
    nav.navigate('PetProfile', { petId: pet.id });
  };

  const handleAdd = () => {
    nav.navigate('PetProfile', {});
  };

  const handleSelect = (pet: Pet) => {
    selectPet(pet);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>내 반려동물</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {pets.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="paw" size={56} color={colors.primary} />
            <Text style={styles.emptyTitle}>등록된 반려동물이 없어요</Text>
            <Text style={styles.emptyDesc}>오른쪽 위 + 버튼으로 등록해주세요</Text>
          </View>
        ) : (
          pets.map((pet) => {
            const isSelected = selectedPet?.id === pet.id;
            return (
              <View key={pet.id} style={[styles.card, isSelected && styles.cardActive]}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() => handleSelect(pet)}
                  activeOpacity={0.7}
                >
                  {pet.profile_image_url ? (
                    <Image source={{ uri: resolveMediaUrl(pet.profile_image_url) }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <SpeciesIcon species={pet.species} size={28} color={colors.primaryDark} />
                    </View>
                  )}

                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{pet.name}</Text>
                      {isSelected && (
                        <View style={styles.activeBadge}>
                          <Ionicons name="checkmark" size={11} color={colors.white} />
                          <Text style={styles.activeBadgeText}>활성</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.subText}>
                      {pet.breed ?? (pet.species === 'cat' ? '고양이' : '강아지')}
                      {pet.age_months ? ` · ${formatAge(pet.age_months)}` : ''}
                    </Text>
                    <View style={styles.chipsRow}>
                      {pet.weight_kg !== undefined && (
                        <View style={styles.chip}>
                          <Ionicons name="barbell-outline" size={11} color={colors.textSecondary} />
                          <Text style={styles.chipText}>{pet.weight_kg}kg</Text>
                        </View>
                      )}
                      {pet.neutered && (
                        <View style={styles.chip}>
                          <Ionicons name="checkmark-circle" size={11} color={colors.primary} />
                          <Text style={styles.chipText}>중성화</Text>
                        </View>
                      )}
                      {pet.gender && (
                        <View style={styles.chip}>
                          <Ionicons
                            name={pet.gender === 'female' ? 'female' : 'male'}
                            size={11}
                            color={colors.textSecondary}
                          />
                          <Text style={styles.chipText}>
                            {pet.gender === 'female' ? '암컷' : '수컷'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(pet)}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {pets.length > 0 && (
          <TouchableOpacity style={styles.addCard} onPress={handleAdd}>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.addCardText}>새 반려동물 등록</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },

  emptyWrap: { alignItems: 'center', paddingVertical: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 13, color: colors.textSecondary },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0D' },
  cardMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  activeBadgeText: { fontSize: 10, color: colors.white, fontWeight: '700' },
  subText: { fontSize: 12, color: colors.textSecondary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  chipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  editBtn: { padding: 10 },

  addCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addCardText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
