import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { config } from './config.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your current voice channel'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current voice channel'),
].map((cmd) => cmd.toJSON());

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discord.botToken);
  console.log('[bot] Registering slash commands...');
  await rest.put(Routes.applicationCommands(config.discord.clientId), {
    body: commands,
  });
  console.log('[bot] Slash commands registered.');
}

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: 'You must be in a voice channel first.', ephemeral: true });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  console.log(`[bot] Joined voice channel: ${voiceChannel.name} in guild ${interaction.guildId}`);
  await interaction.reply({ content: `Joined **${voiceChannel.name}**. Listening...` });
}

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  const connection = getVoiceConnection(interaction.guildId);
  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    await interaction.reply({ content: "I'm not in a voice channel.", ephemeral: true });
    return;
  }

  connection.destroy();
  console.log(`[bot] Left voice channel in guild ${interaction.guildId}`);
  await interaction.reply({ content: 'Left the voice channel.' });
}

client.once('ready', async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'join') {
      await handleJoin(interaction);
    } else if (interaction.commandName === 'leave') {
      await handleLeave(interaction);
    }
  } catch (err) {
    console.error('[bot] Error handling interaction:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
});

function shutdown(): void {
  console.log('[bot] Shutting down...');
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discord.botToken);
