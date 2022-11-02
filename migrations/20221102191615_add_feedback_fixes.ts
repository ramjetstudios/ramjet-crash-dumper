import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback_votes', (table) => {
    table.string('feedback_id').references('id').inTable('feedback');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback_votes', (table) => {
    table.dropColumn('feedback_id');
  });
}
