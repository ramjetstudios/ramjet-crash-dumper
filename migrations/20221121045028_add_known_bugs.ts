import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('known_bugs', (table) => {
    table.string('text', 16384);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('known_bugs');
}
