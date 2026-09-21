import 'dotenv/config';

export const config = {
  mode: (process.env.MODE || 'mock') as 'mock' | 'flowable',
  port: Number(process.env.PORT || 3000),
  flowable: {
    url: process.env.FLOWABLE_URL || 'http://localhost:8080',
    user: process.env.FLOWABLE_USER || 'flowable',
    password: process.env.FLOWABLE_PASSWORD || 'flowable',
  },
  db: {
    url: process.env.DB_URL || '',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
    .split(',')
    .map(s => s.trim()),
};
