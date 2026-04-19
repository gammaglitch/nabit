import {
  type ChatInputCommandInteraction,
  type Message,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("nab")
  .setDescription("Send a URL to the nabit ingest API")
  .addStringOption((option) =>
    option.setName("url").setDescription("The URL to ingest").setRequired(true),
  );

const INGEST_API_URL =
  process.env.NABIT_API_URL ?? "https://memory-api.taida.space";
const INGEST_API_TOKEN = process.env.NABIT_API_TOKEN;

type IngestResult =
  | { success: true; created: boolean; itemUrl?: string }
  | { success: false; message: string };

async function ingestUrl(url: string): Promise<IngestResult> {
  if (!INGEST_API_TOKEN) {
    return {
      success: false,
      message: "NABIT_API_TOKEN is not configured.",
    };
  }

  try {
    const response = await fetch(`${INGEST_API_URL}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INGEST_API_TOKEN}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ingest API error:", response.status, errorText);
      return {
        success: false,
        message: `Ingest failed (${response.status}): ${response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      created?: boolean;
      item?: { id?: string };
    };
    const itemId = data.item?.id;
    return {
      success: true,
      created: Boolean(data.created),
      itemUrl: itemId ? `${INGEST_API_URL}/items/${itemId}` : undefined,
    };
  } catch (error) {
    console.error("Ingest error:", error);
    return {
      success: false,
      message: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function formatSuccess(
  url: string,
  result: Extract<IngestResult, { success: true }>,
) {
  const verb = result.created ? "Nabbed" : "Already known";
  return `✅ ${verb}: ${url}`;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);

  try {
    new URL(url);
  } catch {
    await interaction.reply({
      content: "Invalid URL format!",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  const result = await ingestUrl(url);

  if (result.success) {
    await interaction.editReply(formatSuccess(url, result));
  } else {
    await interaction.editReply(`❌ ${result.message}`);
  }
}

export async function handleMessage(message: Message) {
  const args = message.content.split(/\s+/);
  const url = args[1];

  if (!url) {
    await message.reply("Please provide a URL. Usage: `!nab <url>`");
    return;
  }

  try {
    new URL(url);
  } catch {
    await message.reply("Invalid URL format!");
    return;
  }

  const statusMsg = await message.reply("🔄 Nabbing URL...");
  const result = await ingestUrl(url);

  if (result.success) {
    await statusMsg.edit(formatSuccess(url, result));
  } else {
    await statusMsg.edit(`❌ ${result.message}`);
  }
}
