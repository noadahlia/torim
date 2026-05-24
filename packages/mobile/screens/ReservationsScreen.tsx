import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { bookingApi } from '../lib/api';

interface Reservation {
  id: string;
  service_name_snapshot: string;
  start_time: string;
  end_time: string;
  status: string;
  service_price_cents_snapshot: number;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: '#27ae60',
  AWAITING_CONFIRMATION: '#f39c12',
  AWAITING_DEPOSIT: '#e74c3c',
  COMPLETED: '#95a5a6',
  CANCELLED_BY_CLIENT: '#e74c3c',
  CANCELLED_BY_PROFESSIONAL: '#e74c3c',
  NO_SHOW: '#c0392b',
};

export default function ReservationsScreen() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReservations = async () => {
    try {
      setLoading(true);
      const response = await bookingApi.getMyReservations();
      setReservations(response.data || []);
    } catch (error) {
      console.error('Failed to load reservations:', error);
      Alert.alert('Error', 'Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReservations();
    setRefreshing(false);
  };

  const handleCancel = (reservation: Reservation) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await bookingApi.cancelReservation(reservation.id);
              Alert.alert('Success', 'Booking cancelled');
              loadReservations();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.response?.data?.message || 'Failed to cancel booking'
              );
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderReservation = ({ item }: { item: Reservation }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.serviceName}>{item.service_name_snapshot}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[item.status] || '#95a5a6' },
          ]}
        >
          <Text style={styles.statusText}>{item.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      <Text style={styles.dateTime}>
        {new Date(item.start_time).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>

      <Text style={styles.price}>₪{(item.service_price_cents_snapshot / 100).toFixed(2)}</Text>

      {['CONFIRMED', 'AWAITING_CONFIRMATION', 'AWAITING_DEPOSIT'].includes(item.status) && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => handleCancel(item)}
        >
          <Text style={styles.cancelButtonText}>Cancel Booking</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reservations}
        renderItem={renderReservation}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>No reservations yet</Text>
          </View>
        }
      />
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dateTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e74c3c',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
