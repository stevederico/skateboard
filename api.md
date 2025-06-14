---
layout: default
title: API Reference
description: Complete backend API documentation with endpoints, examples, and SDK
---

# API Reference

Complete API reference for the Skateboard backend server.

## Base URL

```
Development: http://localhost:3001
Production: https://your-api-domain.com
```

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Authentication

#### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-06-14T10:00:00Z"
  }
}
```

**Response (400):**
```json
{
  "success": false,
  "error": "Email already exists"
}
```

#### POST /api/auth/login

Authenticate an existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

#### GET /api/auth/me

Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-06-14T10:00:00Z"
  }
}
```

#### POST /api/auth/logout

Logout current user (invalidate token).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### User Management

#### GET /api/users/profile

Get user profile information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "subscription": {
      "plan": "pro",
      "status": "active",
      "expiresAt": "2025-07-14T10:00:00Z"
    }
  }
}
```

#### PUT /api/users/profile

Update user profile.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "John Smith",
  "avatar": "https://example.com/new-avatar.jpg"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Smith",
    "avatar": "https://example.com/new-avatar.jpg"
  }
}
```

#### DELETE /api/users/account

Delete user account.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

### Stripe Integration

#### POST /api/stripe/create-payment-intent

Create a payment intent for one-time payments.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "amount": 2000,
  "currency": "usd",
  "description": "Product purchase"
}
```

**Response (200):**
```json
{
  "clientSecret": "pi_1234_secret_5678",
  "paymentIntentId": "pi_1234567890"
}
```

#### POST /api/stripe/create-checkout-session

Create a Stripe Checkout session.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "priceId": "price_1234567890",
  "mode": "payment",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

**Response (200):**
```json
{
  "sessionId": "cs_1234567890",
  "url": "https://checkout.stripe.com/pay/cs_1234567890"
}
```

#### POST /api/stripe/create-customer

Create a Stripe customer.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Response (200):**
```json
{
  "customerId": "cus_1234567890"
}
```

#### POST /api/stripe/create-subscription

Create a subscription.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "customerId": "cus_1234567890",
  "priceId": "price_1234567890"
}
```

**Response (200):**
```json
{
  "subscriptionId": "sub_1234567890",
  "status": "active",
  "currentPeriodEnd": "2025-07-14T10:00:00Z"
}
```

#### GET /api/stripe/subscriptions

Get user subscriptions.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "subscriptions": [
    {
      "id": "sub_1234567890",
      "status": "active",
      "plan": "pro",
      "currentPeriodStart": "2025-06-14T10:00:00Z",
      "currentPeriodEnd": "2025-07-14T10:00:00Z"
    }
  ]
}
```

#### POST /api/stripe/cancel-subscription

Cancel a subscription.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "subscriptionId": "sub_1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully"
}
```

#### POST /api/stripe/webhook

Stripe webhook endpoint (no authentication required).

**Headers:**
```
stripe-signature: webhook-signature-here
```

**Response (200):**
```json
{
  "received": true
}
```

### Content Management

#### GET /api/content/pages

Get static pages (privacy, terms, etc.).

**Response (200):**
```json
{
  "pages": [
    {
      "slug": "privacy",
      "title": "Privacy Policy",
      "content": "Your privacy policy content...",
      "updatedAt": "2025-06-14T10:00:00Z"
    },
    {
      "slug": "terms",
      "title": "Terms of Service", 
      "content": "Your terms content...",
      "updatedAt": "2025-06-14T10:00:00Z"
    }
  ]
}
```

#### GET /api/content/pages/:slug

Get a specific page.

**Response (200):**
```json
{
  "page": {
    "slug": "privacy",
    "title": "Privacy Policy",
    "content": "Your privacy policy content...",
    "updatedAt": "2025-06-14T10:00:00Z"
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

### Error Codes

- `INVALID_EMAIL` - Email format is invalid
- `WEAK_PASSWORD` - Password doesn't meet requirements
- `EMAIL_EXISTS` - Email already registered
- `INVALID_CREDENTIALS` - Login credentials are incorrect
- `TOKEN_EXPIRED` - JWT token has expired
- `TOKEN_INVALID` - JWT token is invalid
- `USER_NOT_FOUND` - User doesn't exist
- `STRIPE_ERROR` - Stripe payment error
- `SUBSCRIPTION_NOT_FOUND` - Subscription doesn't exist
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions

## Rate Limiting

API endpoints are rate limited:

- **Authentication endpoints**: 5 requests per minute per IP
- **Payment endpoints**: 10 requests per minute per user
- **General endpoints**: 100 requests per minute per user

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Pagination

List endpoints support pagination:

**Query Parameters:**
```
?page=1&limit=10&sort=createdAt&order=desc
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const API_BASE = 'http://localhost:3001';

class SkateboardAPI {
  constructor(token = null) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }

  async login(email, password) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    this.token = result.token;
    return result;
  }

  async getProfile() {
    return this.request('/api/users/profile');
  }

  async createPaymentIntent(amount, currency = 'usd') {
    return this.request('/api/stripe/create-payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amount, currency }),
    });
  }
}

// Usage
const api = new SkateboardAPI();
await api.login('user@example.com', 'password');
const profile = await api.getProfile();
```
