import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('crashes', (db) => {
    db.boolean('resolved').defaultTo(false).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('crashes', (db) => {
    db.dropColumn('resolved');
  });
}
