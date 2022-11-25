import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback', (db) => {
    db.string('game_version');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('feedback', (db) => {
    db.dropColumn('game_version');
  });
}
