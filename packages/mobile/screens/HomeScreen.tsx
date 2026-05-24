import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../lib/auth';
import { professionalApi } from '../lib/api';

interface Professional {
  user_id: string;
  full_name: string;
  bio?: string;
  avatar_url?: string;
}

export default function HomeScreen({ navigation }: any) {
  const { logout } = useAuth();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfessionals = async () => {
    try {
      setLoading(true);
      const response = await professionalApi.list(50, 0);
      setProfessionals(response.data.data || []);
    } catch (error) {
      console.error('Failed to load professionals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfessionals();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfessionals();
    setRefreshing(false);
  };

  const renderProfessional = ({ item }: { item: Professional }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('ProfessionalDetail', {
          professionalId: item.user_id,
        })
      }
    >
      <Text style={styles.name}>{item.full_name}</Text>
      {item.bio && <Text style={styles.bio}>{item.bio}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <>
          <FlatList
            data={professionals}
            renderItem={renderProfessional}
            keyExtractor={(item) => item.user_id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerContent}>
                <Text style={styles.emptyText}>No professionals found</Text>
              </View>
            }
          />
          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => navigation.navigate('Reservations')}
            >
              <Text style={styles.navButtonText}>My Reservations</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={logout}>
              <Text style={styles.navButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  bio: {
    fontSize: 14,
    color: '#666',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  navButton: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  navButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
