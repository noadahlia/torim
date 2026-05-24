import { supabase } from '../config/supabase.js';
import { AuthenticationError, ValidationError } from '../utils/errors.js';

export class AuthService {
  private supabase = supabase;

  async signup(
    email: string,
    password: string,
    fullName: string,
    timezone: string,
    role: string = 'ROLE_CLIENT'
  ) {
    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    try {
      const { data, error } = await this.supabase.auth.signUpWithPassword({
        email,
        password,
      });

      if (error) {
        throw new AuthenticationError(error.message);
      }

      // Create user profile
      await this.supabase.from('users').insert({
        id: data.user!.id,
        email,
        full_name: fullName,
        roles: [role],
        timezone,
      });

      return {
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('Signup failed');
    }
  }

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new AuthenticationError('Invalid credentials');
      }

      return {
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('Login failed');
    }
  }

  verifyToken(token: string) {
    // Verify JWT token
    try {
      // Placeholder - verify using jsonwebtoken library
      return { valid: true };
    } catch (error) {
      throw new AuthenticationError('Invalid token');
    }
  }
}
