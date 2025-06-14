---
layout: default
title: Authentication
description: Complete authentication system with JWT, protected routes, and user management
---

# Authentication

Skateboard includes a complete authentication system with sign-up, sign-in, and protected routes.

## Overview

The authentication system includes:
- User registration and login
- Protected routes
- JWT token management
- Password hashing with bcrypt
- Session management

## Frontend Components

### SignUpView

Location: `@stevederico/skateboard-ui/SignUpView.jsx`

```jsx
import { SignUpView } from '@stevederico/skateboard-ui';

// Basic usage
<SignUpView />
```

### SignInView

Location: `@stevederico/skateboard-ui/SignInView.jsx`

```jsx
import { SignInView } from '@stevederico/skateboard-ui';

// Basic usage
<SignInView />
```

## Backend API

### Authentication Endpoints

#### POST /api/auth/register
Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### POST /api/auth/login
Authenticate a user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### GET /api/auth/me
Get current user information (requires authentication).

**Headers:**
```
Authorization: Bearer jwt-token-here
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

## Protected Routes

Use the built-in route protection:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<SignInView />} />
        <Route path="/register" element={<SignUpView />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
```

## Context Provider

The authentication context manages user state:

```jsx
import { AuthProvider, useAuth } from './context';

function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}

function Profile() {
  const { user, isAuthenticated, logout } = useAuth();
  
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
  
  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Custom Configuration

### JWT Secret

Set your JWT secret in `backend/.env`:
```
JWT_SECRET=your-super-secret-key-here
```

### Token Expiration

Configure token expiration in `backend/server.js`:
```javascript
const token = jwt.sign(
  { userId: user._id }, 
  process.env.JWT_SECRET, 
  { expiresIn: '7d' } // 7 days
);
```

### Password Requirements

Customize password validation:
```javascript
const passwordSchema = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false
};
```

## Database Schema

### User Model

```javascript
const userSchema = {
  _id: ObjectId,
  email: String, // unique, required
  password: String, // hashed with bcrypt
  name: String,
  createdAt: Date,
  updatedAt: Date,
  isActive: Boolean,
  role: String // 'user', 'admin', etc.
};
```

## Security Best Practices

1. **Password Hashing**: Uses bcrypt with salt rounds
2. **JWT Tokens**: Signed and verified securely
3. **CORS**: Configured for your domain
4. **Input Validation**: Email and password validation
5. **Rate Limiting**: Consider adding rate limiting for auth endpoints

## Troubleshooting

### Common Issues

**"Invalid token" errors:**
- Check JWT secret is set correctly
- Verify token hasn't expired
- Ensure Authorization header format: `Bearer <token>`

**CORS errors:**
- Update backend `config.json` with correct frontend URL
- Check credentials are included in requests

**Database connection:**
- Verify MongoDB is running
- Check database URL in backend config
