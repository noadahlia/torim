export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super('AUTHENTICATION_ERROR', 401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Forbidden') {
    super('AUTHORIZATION_ERROR', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super('NOT_FOUND', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super('CONFLICT', 409, message, details);
  }
}

export class PaymentError extends AppError {
  constructor(message: string, details?: any) {
    super('PAYMENT_ERROR', 402, message, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: any) {
    super('EXTERNAL_SERVICE_ERROR', 503, message, details);
  }
}
