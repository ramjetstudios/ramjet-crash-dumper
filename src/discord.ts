import chalk from 'chalk';
import { Client, GatewayIntentBits, EmbedBuilder, MessagePayload, AttachmentBuilder, Attachment } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log(chalk.gray(`Discord bot ${chalk.magenta(client.user?.tag)} ready.`));
});

client.on('messageCreate', async (message) => {
  if (message.channelId === '1035346874892308540') {
    if (message.content.trim().toLowerCase() !== 'vein') {
      if (!message.deletable) {
        console.error(chalk.red(`Message doesn't have 'vein', but it is not deletable`));
      }

      try {
        await message.delete();
      } catch (err) {}
    } else {
      try {
        await message.pin();
      } catch (err) {}
    }
  }
});

client.on('messageUpdate', async (message) => {
  if (message.channelId === '1035346874892308540') {
    if ((message.content || '').trim().toLowerCase() !== 'vein') {
      try {
        await message.delete();
      } catch (err) {}
    }
  }
});

export default async function Init() {
  await client.login(process.env.DISCORD_BOT_TOKEN);
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

    payload.setAuthor({ name: `Ramjet Crash Dumper` });
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
