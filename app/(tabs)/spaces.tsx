import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { SpaceRepo, Space } from '../../src/repositories/space_repo';
import { Colors } from '../../src/constants/Colors';
import { useFocusEffect } from 'expo-router';
import { CaptureFAB } from '../../src/components/CaptureFAB';

export default function SpacesScreen() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const router = useRouter();

  const loadSpaces = async () => {
    const data = await SpaceRepo.getAll();
    setSpaces(data);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadSpaces();
    }, [])
  );

  const renderItem = ({ item }: { item: Space }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => router.push(`/space/${item.id}`)}
    >
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={spaces}
        renderItem={renderItem}
        estimatedItemSize={60}
      />
      <CaptureFAB onPress={() => router.push('/space/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  item: {
    padding: 16,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  itemName: {
    fontSize: 18,
    fontWeight: '500'
  },
  itemDate: {
    color: Colors.secondaryText,
    fontSize: 14
  }
});
