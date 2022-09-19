import chalk from 'chalk';
import { Client, GatewayIntentBits, EmbedBuilder, MessagePayload, AttachmentBuilder, Attachment } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log(chalk.gray(`Discord bot ${chalk.magenta(client.user?.tag)} ready.`));
});

export default async function Init() {
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

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
      {
        name: 'Logfile',
        value: 'attachment://Vein.log',
      },
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