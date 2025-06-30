# CP Mate Backend

Backend server for CP Mate - Competitive Programming Tracker

## Features

- 🔐 JWT Authentication
- 👤 User Management
- 📊 LeetCode & Codeforces API Integration
- 📈 Statistics Tracking
- 🛡️ Security Middleware

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp env.example .env
```

3. Configure environment variables in `.env`

4. Start MongoDB (local or use MongoDB Atlas)

5. Run the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/handles` - Update platform handles

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `PUT /api/user/preferences` - Update user preferences
- `PUT /api/user/password` - Change password
- `DELETE /api/user/account` - Delete account

### Statistics
- `GET /api/stats` - Get user stats
- `POST /api/stats/fetch` - Fetch stats from platforms
- `GET /api/stats/dashboard` - Get dashboard overview

## Environment Variables

- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `CLIENT_URL` - Frontend URL for CORS
- `NODE_ENV` - Environment (development/production)

## Database Models

### User
- Authentication fields (username, email, password)
- Platform handles (LeetCode, Codeforces)
- Profile information
- User preferences

### Stats
- Platform-specific statistics
- Rating history
- Problem-solving data
- Contest history
- Daily activity tracking 