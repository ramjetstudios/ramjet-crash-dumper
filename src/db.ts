import knex from 'knex';
import { parse as parseConnectionString } from 'pg-connection-string';

const Database = knex({
  client: 'pg',
  connection: {
    ...(parseConnectionString(process.env.DATABASE_URL as string) as any),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    application_name: 'ramjet-bot',
  },
});

export default Database;
