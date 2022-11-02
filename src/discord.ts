import chalk from 'chalk';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  MessagePayload,
  AttachmentBuilder,
  Attachment,
  Partials,
  Events,
  REST,
  Routes,
} from 'discord.js';
import Database from './db';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

client.on('ready', () => {
  console.log(chalk.gray(`Discord bot ${chalk.magenta(client.user?.tag)} ready.`));
});

client.on(Events.MessageCreate, async (message) => {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (err) {}
  }

  if (message.author?.bot) {
    return;
  }

  if (message.channelId === '1035346874892308540') {
    if (message.content.trim().toLowerCase() !== 'vein') {
      if (!message.deletable) {
        console.error(chalk.red(`Message doesn't have 'vein', but it is not deletable`));
      }

      try {
        await message.delete();
      } catch (err) {
        console.error(chalk.red(err));
      }
    } else {
      try {
        await message.pin();
      } catch (err) {
        console.error(chalk.red(err));
      }
    }
  }
});

client.on(Events.MessageUpdate, async (message) => {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (err) {}
  }

  if (message.author?.bot) {
    return;
  }

  if (message.channelId === '1035346874892308540') {
    if ((message.content || '').trim().toLowerCase() !== 'vein') {
      if (!message.deletable) {
        console.error(chalk.red(`Message doesn't have 'vein', but it is not deletable`));
      }

      try {
        await message.delete();
      } catch (err) {
        console.error(chalk.red(err));
      }
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'crashcount') {
    const count = await Database('crashes').sum({ c: 'count' });
    await interaction.reply(`${count[0].c} crashes in the database. Zero soon (TM)`);
  }
});

export default async function Init() {
  await client.login(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID), {
    body: [
      {
        name: 'crashcount',
        description: 'Tells you the number of crashes reported in the last 24 hours.',
      },
    ],
  });
}

export const SendText = async (text: string) => {
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID!);
  if (channel && channel.isTextBased()) {
    await channel.send(text);
  } else {
    console.error(chalk.red(`Failed to find channel ${process.env.DISCORD_CHANNEL_ID!}!`));
  }
};

export const Send = async (id: string, kvs: { [key: string]: string }, logfile?: string, stack?: string) => {
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID!);
  if (channel && channel.isTextBased()) {
    let logPayload: AttachmentBuilder | undefined = undefined;
    if (logfile) {
      logPayload = new AttachmentBuilder(Buffer.from(logfile));
      logPayload.setName('Vein.log');
      logPayload.setDescription("User's crash logfile");
    }

    const payload = new EmbedBuilder();

    payload.setAuthor({ name: `Ramjet Bot` });
    payload.setColor(0xdc473a);
    if (stack) {
      payload.setDescription(`\`\`\`
${stack.substring(0, 1023 - 8)}
\`\`\``);
    }
    payload.setFields([
      ...Object.keys(kvs).map((k) => ({
        name: k,
        value: kvs[k],
        inline: true,
      })),
    ]);
    payload.setTitle(id);

    const message = new MessagePayload(channel, {
      embeds: [payload],
      files: logPayload ? [logPayload] : [],
    });
    await channel.send(message);
  } else {
    console.error(chalk.red(`Failed to find channel ${process.env.DISCORD_CHANNEL_ID!}!`));
  }
};
