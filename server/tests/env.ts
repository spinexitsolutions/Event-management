// Test environment — applied before any app module is imported.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mongodb://127.0.0.1:27017/events_test?replicaSet=rs0&directConnection=true';
process.env.APP_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.EMAIL_PROVIDER = 'none';
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = 'uploads-test';
process.env.APP_URL = 'http://localhost:5173';
process.env.CORS_ORIGINS = 'http://localhost:5173';
