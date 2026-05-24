import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { bookingApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import * as Location from 'expo-location';

interface TimeSlot {
  start_utc: string;
  end_utc: string;
  display_local: string;
}

export default function BookingScreen({ route, navigation }: any) {
  const { professionalId, serviceId, serviceName, price } = route.params;
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loading, setLoading] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Jerusalem');

  useEffect(() => {
    const getTimezone = async () => {
      const location = await Location.getCurrentPositionAsync({});
      setTimezone(user?.user_metadata?.timezone || 'Asia/Jerusalem');
    };
    getTimezone();
  }, [user]);

  const loadSlots = async (date: string) => {
    if (!date || !serviceId) return;

    try {
      setLoading(true);
      const response = await bookingApi.getAvailability(
        professionalId,
        date,
        serviceId,
        timezone
      );
      setSlots(response.data.slots || []);
    } catch (error) {
      console.error('Failed to load slots:', error);
      Alert.alert('Error', 'Failed to load available slots');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    loadSlots(date);
  };

  const handleBook = async () => {
    if (!selectedSlot) {
      Alert.alert('Error', 'Please select a time slot');
      return;
    }

    try {
      setLoading(true);
      await bookingApi.createBooking({
        professionalId,
        serviceId,
        startUtc: selectedSlot.start_utc,
        endUtc: selectedSlot.end_utc,
      });

      Alert.alert('Success', 'Booking created successfully', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Reservations'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  const renderSlot = ({ item }: { item: TimeSlot }) => (
    <TouchableOpacity
      style={[
        styles.slotCard,
        selectedSlot === item && styles.slotCardSelected,
      ]}
      onPress={() => setSelectedSlot(item)}
      disabled={loading}
    >
      <Text
        style={[
          styles.slotTime,
          selectedSlot === item && styles.slotTimeSelected,
        ]}
      >
        {item.display_local}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          value={selectedDate}
          onChangeText={handleDateChange}
          editable={!loading}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service: {serviceName}</Text>
        <Text style={styles.price}>₪{(price / 100).toFixed(2)}</Text>
      </View>

      {loading && selectedDate ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : selectedDate && slots.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Times</Text>
          <FlatList
            data={slots}
            renderItem={renderSlot}
            keyExtractor={(item) => item.start_utc}
            scrollEnabled={false}
            numColumns={2}
            columnWrapperStyle={styles.slotsGrid}
          />
        </View>
      ) : selectedDate ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>No available slots for this date</Text>
        </View>
      ) : null}

      {selectedSlot && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleBook}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Confirm Booking</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  slotsGrid: {
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 8,
  },
  slotCardSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  slotTimeSelected: {
    color: '#007AFF',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
