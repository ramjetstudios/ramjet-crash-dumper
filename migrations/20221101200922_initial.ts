import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('crashes', (table) => {
    table.string('id').primary();
    table.dateTime('created_at').defaultTo(knex.fn.now());
    table.dateTime('last_seen').defaultTo(knex.fn.now());
    table.string('stack', 1024);
    table.integer('count').defaultTo(1);
  });

  await knex.schema.createTable('feedback', (table) => {
    table.string('id').primary();
    table.dateTime('created_at').defaultTo(knex.fn.now());
    table.string('author');
    table.string('description');
  });

  await knex.schema.createTable('feedback_votes', (table) => {
    table.string('id').primary();
    table.dateTime('created_at').defaultTo(knex.fn.now());
    table.string('author');
    table.integer('vote');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('crashes');
  await knex.schema.dropTable('feedback_votes');
  await knex.schema.dropTable('feedback');
}
