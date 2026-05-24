import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      await SecureStore.deleteItemAsync('authToken');
      // Navigate to login (handle in app logic)
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  signup: async (email: string, password: string, firstName: string, lastName: string) => {
    const response = await api.post('/api/auth/signup', {
      email,
      password,
      firstName,
      lastName,
    });
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },
};

export const professionalApi = {
  list: async () => {
    const response = await api.get('/api/professionals');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/professionals/${id}`);
    return response.data;
  },
};

export const availabilityApi = {
  getSlots: async (professionalId: string, date: string) => {
    const response = await api.get('/api/availability', {
      params: { professional_id: professionalId, date },
    });
    return response.data;
  },
};

export const reservationApi = {
  create: async (professionalId: string, serviceId: string, startTime: string, endTime: string) => {
    const response = await api.post('/api/reservations', {
      professional_id: professionalId,
      service_id: serviceId,
      start_time: startTime,
      end_time: endTime,
    });
    return response.data;
  },

  getMyReservations: async () => {
    const response = await api.get('/api/reservations');
    return response.data;
  },

  cancel: async (reservationId: string) => {
    const response = await api.patch(`/api/reservations/${reservationId}/cancel`);
    return response.data;
  },
};

export default api;
