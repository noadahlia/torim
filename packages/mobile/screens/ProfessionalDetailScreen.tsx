import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { professionalApi } from '../lib/api';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  buffer_minutes_after: number;
}

interface Professional {
  user_id: string;
  full_name: string;
  bio?: string;
  services?: Service[];
}

export default function ProfessionalDetailScreen({ route, navigation }: any) {
  const { professionalId } = route.params;
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfessional = async () => {
      try {
        const response = await professionalApi.getDetail(professionalId);
        setProfessional(response.data);
      } catch (error) {
        console.error('Failed to load professional:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfessional();
  }, [professionalId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!professional) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Professional not found</Text>
      </View>
    );
  }

  const renderService = ({ item }: { item: Service }) => (
    <TouchableOpacity
      style={styles.serviceCard}
      onPress={() =>
        navigation.navigate('Booking', {
          professionalId,
          serviceId: item.id,
          serviceName: item.name,
          price: item.price_cents,
        })
      }
    >
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{item.name}</Text>
        <Text style={styles.serviceDetails}>
          {item.duration_minutes} min • ₪{(item.price_cents / 100).toFixed(2)}
        </Text>
      </View>
      <Text style={styles.bookButton}>→</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{professional.full_name}</Text>
        {professional.bio && <Text style={styles.bio}>{professional.bio}</Text>}
      </View>

      <Text style={styles.sectionTitle}>Services</Text>
      {professional.services && professional.services.length > 0 ? (
        <FlatList
          data={professional.services}
          renderItem={renderService}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.servicesList}
        />
      ) : (
        <Text style={styles.emptyText}>No services available</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  bio: {
    fontSize: 14,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 16,
    paddingBottom: 8,
    color: '#333',
  },
  servicesList: {
    padding: 16,
  },
  serviceCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  serviceDetails: {
    fontSize: 14,
    color: '#666',
  },
  bookButton: {
    fontSize: 20,
    color: '#007AFF',
    marginLeft: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
    padding: 20,
  },
});
