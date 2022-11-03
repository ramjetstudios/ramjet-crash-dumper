import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback', (db) => {
    db.string('developer_response_type');
    db.string('developer_response');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback', (db) => {
    db.dropColumn('developer_response_type');
    db.dropColumn('developer_response');
  });
}
