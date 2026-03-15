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
import { Transcriber } from './voice/transcribe.js';
import { Speaker } from './voice/speaker.js';
import { VoiceReceiver } from './voice/receiver.js';
import { GatewayClient } from './gateway/client.js';

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

// Per-guild cleanup handles: receiver + gatewayClient
interface GuildSession {
  receiver: VoiceReceiver;
  gatewayClient: GatewayClient;
}

const sessions = new Map<string, GuildSession>();

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

  const guildId = interaction.guildId;
  const channelId = voiceChannel.id;

  // Clean up any existing session in this guild
  await cleanupSession(guildId);

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const transcriber = new Transcriber(config);
  const gatewayClient = new GatewayClient(config.gateway.url, config.gateway.token);
  const speaker = new Speaker(connection, config);
  const receiver = new VoiceReceiver(connection, transcriber, gatewayClient, speaker, guildId, channelId);

  try {
    await gatewayClient.connect();
  } catch (err) {
    console.error('[bot] Gateway connection failed:', err);
    // Continue anyway — gateway will retry
  }

  receiver.start();
  sessions.set(guildId, { receiver, gatewayClient });

  console.log(`[bot] Joined voice channel: ${voiceChannel.name} in guild ${guildId}`);
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

  await cleanupSession(interaction.guildId);
  connection.destroy();

  console.log(`[bot] Left voice channel in guild ${interaction.guildId}`);
  await interaction.reply({ content: 'Left the voice channel.' });
}

async function cleanupSession(guildId: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session) return;

  session.receiver.stop();
  session.gatewayClient.disconnect();
  sessions.delete(guildId);
}

client.once('ready', async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  console.log(`[bot] STT: ${config.stt.provider} / TTS: ${config.tts.provider}`);
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
  for (const [guildId] of sessions) {
    cleanupSession(guildId).catch(() => undefined);
  }
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discord.botToken);
