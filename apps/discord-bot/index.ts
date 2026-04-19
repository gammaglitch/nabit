import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands } from "./commands/index";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = "!";

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error(
    "Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment variables",
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function registerCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN as string);
  const commandData = Object.values(commands).map((cmd) => cmd.data.toJSON());

  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID as string), {
      body: commandData,
    });
    console.log("Successfully registered slash commands");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands[interaction.commandName as keyof typeof commands];
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error("Error executing command:", error);
    const reply = {
      content: "There was an error executing this command!",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  const command = commands[commandName as keyof typeof commands];
  if (!command?.handleMessage) return;

  try {
    await command.handleMessage(message);
  } catch (error) {
    console.error("Error executing command:", error);
    await message.reply("There was an error executing this command!");
  }
});

client.login(DISCORD_TOKEN);
