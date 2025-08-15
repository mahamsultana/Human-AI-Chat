import { DataSource } from 'typeorm';
import { User } from '@/server/entities/User';
import { Conversation } from '@/server/entities/Conversation';
import { Message } from '@/server/entities/Message';

// Read values from environment variables
const {
  DATABASE_USERNAME,
  DATABASE_PASSWORD,
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_NAME,
} = process.env;

const dataSource = new DataSource({
  type: 'postgres',
  host: DATABASE_HOST || 'localhost',
  port: parseInt(DATABASE_PORT || '5432'),
  username: DATABASE_USERNAME || 'postgres',
  password: DATABASE_PASSWORD || '',
  database: DATABASE_NAME || 'chatbotapp',
  entities: [User, Conversation, Message],
  synchronize: process.env.NODE_ENV === 'development', // true for dev, false for prod
  logging: true, // Enable logging for debugging
  // Remove driver: Pool; TypeORM automatically uses the 'pg' module for postgres
});

let _ds: DataSource | null = null;

export async function getDataSource() {
  if (_ds && _ds.isInitialized) return _ds;

  _ds = await dataSource.initialize();
  console.log('Database connected');
  return _ds;
}

export default dataSource;