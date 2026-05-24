import axios from 'axios';
import { useAuth } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  try {
    // Token will be added from auth context
    // This is a placeholder - actual implementation depends on auth setup
  } catch (error) {
    console.error('Error adding auth token:', error);
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      console.error('Unauthorized');
    }
    return Promise.reject(error);
  }
);

export const bookingApi = {
  getAvailability: (professionalId: string, date: string) =>
    api.get(`/professionals/${professionalId}/availability`, { params: { date } }),

  createBooking: (data: any) =>
    api.post('/bookings', data),

  getReservation: (reservationId: string) =>
    api.get(`/bookings/${reservationId}`),

  cancelReservation: (reservationId: string) =>
    api.post(`/bookings/${reservationId}/cancel`),
};

export const professionalApi = {
  list: () =>
    api.get('/professionals'),

  getDetail: (id: string) =>
    api.get(`/professionals/${id}`),
};

export const userApi = {
  getProfile: () =>
    api.get('/users/profile'),

  updateProfile: (data: any) =>
    api.put('/users/profile', data),
};

export const authApi = {
  signup: (email: string, password: string) =>
    api.post('/auth/signup', { email, password }),

  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  logout: () =>
    api.post('/auth/logout'),
};
