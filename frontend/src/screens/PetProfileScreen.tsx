import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { usePetStore } from '@/store/usePetStore';
import { petAPI, resolveMediaUrl } from '@/services/api';
import { useTheme } from '@/theme/useTheme';
import SpeciesIcon from '@/components/SpeciesIcon';
import { RootStackParams } from '@/navigation/AppNavigator';
import { Pet } from '@/types';

type Params = RouteProp<RootStackParams, 'PetProfile'>;

export default function PetProfileScreen() {
  const nav = useNavigation();
  const route = useRoute<Params>();
  const { pets, createPet, updatePet, deletePet, fetchPets } = usePetStore();

  const editingId = route.params?.petId;
  const editing = pets.find((p) => p.id === editingId);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState(editing?.name ?? '');
  const [species, setSpecies] = useState<'dog' | 'cat'>(editing?.species ?? 'dog');
  const [breed, setBreed] = useState(editing?.breed ?? '');
  const [ageMonths, setAgeMonths] = useState(String(editing?.age_months ?? ''));
  const [weight, setWeight] = useState(String(editing?.weight_kg ?? ''));
  const [gender, setGender] = useState(editing?.gender ?? 'male');
  const [neutered, setNeutered] = useState(editing?.neutered ?? false);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('알림', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        species,
        breed: breed.trim() || undefined,
        age_months: ageMonths ? parseInt(ageMonths) : undefined,
        weight_kg: weight ? parseFloat(weight) : undefined,
        gender,
        neutered,
      };
      let pet: Pet;
      if (editing) {
        await updatePet(editing.id, payload);
        pet = pets.find((p) => p.id === editing.id)!;
        // upload photo
        if (photoUri) {
          const form = new FormData();
          form.append('file', { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' } as any);
          await petAPI.uploadPhoto(editing.id, form);
          await fetchPets();
        }
      } else {
        pet = await createPet(payload);
        if (photoUri) {
          const form = new FormData();
          form.append('file', { uri: photoUri, name: 'photo.jpg', type: 'image/jpeg' } as any);
          await petAPI.uploadPhoto(pet.id, form);
          await fetchPets();
        }
      }
      nav.goBack();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('삭제 확인', `${editing?.name}의 모든 데이터가 삭제됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          await deletePet(editing!.id);
          nav.goBack();
        },
      },
    ]);
  };

  const avatarSrc = photoUri
    ? { uri: photoUri }
    : editing?.profile_image_url
    ? { uri: resolveMediaUrl(editing.profile_image_url) }
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{editing ? '프로필 수정' : '반려동물 등록'}</Text>
        {editing && (
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickPhoto}>
          {avatarSrc ? (
            <Image source={avatarSrc} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <SpeciesIcon species={species} size={44} color={colors.primaryDark} />
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={16} color={colors.white} />
          </View>
        </TouchableOpacity>

        {/* Species */}
        <Text style={styles.label}>종류</Text>
        <View style={styles.toggle}>
          {(['dog', 'cat'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.toggleBtn, species === s && styles.toggleBtnActive]}
              onPress={() => setSpecies(s)}
            >
              <View style={styles.toggleContent}>
                <SpeciesIcon species={s} size={18} color={species === s ? colors.primaryDark : colors.textSecondary} />
                <Text style={[styles.toggleText, species === s && styles.toggleTextActive]}>
                  {s === 'dog' ? '강아지' : '고양이'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {[
          { label: '이름 *', value: name, onChange: setName, placeholder: '이름을 입력하세요' },
          { label: '품종', value: breed, onChange: setBreed, placeholder: '예: 골든 리트리버' },
          { label: '나이 (개월)', value: ageMonths, onChange: setAgeMonths, placeholder: '예: 24', keyboard: 'numeric' as const },
          { label: '몸무게 (kg)', value: weight, onChange: setWeight, placeholder: '예: 12.5', keyboard: 'decimal-pad' as const },
        ].map(({ label, value, onChange, placeholder, keyboard }) => (
          <View key={label}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor={colors.textLight}
              value={value}
              onChangeText={onChange}
              keyboardType={keyboard}
            />
          </View>
        ))}

        {/* Gender */}
        <Text style={styles.label}>성별</Text>
        <View style={styles.toggle}>
          {[['male', '수컷'], ['female', '암컷']] .map(([v, l]) => (
            <TouchableOpacity
              key={v}
              style={[styles.toggleBtn, gender === v && styles.toggleBtnActive]}
              onPress={() => setGender(v)}
            >
              <Text style={[styles.toggleText, gender === v && styles.toggleTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Neutered */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setNeutered(!neutered)}
        >
          <Ionicons
            name={neutered ? 'checkbox' : 'square-outline'}
            size={24}
            color={neutered ? colors.primary : colors.textLight}
          />
          <Text style={styles.checkLabel}>중성화 완료</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? '저장 중...' : '저장하기'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: 20, paddingBottom: 40, gap: 4 },
  avatarWrap: { alignSelf: 'center', marginBottom: 24 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primary, borderRadius: 14, padding: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  toggle: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  toggleContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleText: { fontSize: 14, color: colors.textSecondary },
  toggleTextActive: { color: colors.primaryDark, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  checkLabel: { fontSize: 15, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
