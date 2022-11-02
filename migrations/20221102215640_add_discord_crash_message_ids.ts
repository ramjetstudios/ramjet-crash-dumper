import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('crashes', (db) => {
    db.string('discord_message_id').unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('crashes', (db) => {
    db.dropColumn('discord_message_id');
  });
}
