import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
});

let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

api.interceptors.request.use(
  (config) => {
    if (currentToken) {
      config.headers.Authorization = `Bearer ${currentToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      currentToken = null;
      delete api.defaults.headers.common['Authorization'];
    }
    return Promise.reject(error);
  }
);

export const bookingApi = {
  getAvailability: (professionalId: string, date: string, serviceId: string, clientTz: string) =>
    api.get(`/professionals/${professionalId}/availability`, {
      params: { date, serviceId, clientTz },
    }),

  createBooking: (data: {
    professionalId: string;
    serviceId: string;
    startUtc: string;
    endUtc: string;
  }) => api.post('/bookings', data),

  getReservation: (reservationId: string) => api.get(`/bookings/${reservationId}`),

  getMyReservations: () => api.get('/bookings'),

  cancelReservation: (reservationId: string) =>
    api.post(`/bookings/${reservationId}/cancel`),
};

export const professionalApi = {
  list: (limit = 20, offset = 0) =>
    api.get('/professionals', { params: { limit, offset } }),

  getDetail: (id: string) => api.get(`/professionals/${id}`),
};

export const userApi = {
  getProfile: () => api.get('/users/profile'),

  updateProfile: (data: any) => api.put('/users/profile', data),
};

export const authApi = {
  signup: (email: string, password: string, fullName: string, timezone: string) =>
    api.post('/auth/signup', { email, password, fullName, timezone }),

  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),
};
