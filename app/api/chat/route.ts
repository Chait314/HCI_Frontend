import { NextResponse } from "next/server";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

type GithubModelsResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
  message?: string;
};

type ChatRequestBody = {
  model?: string;
  messages?: ChatMessage[];
  frequency_penalty?: number;
  max_tokens?: number;
  modalities?: string[];
  presence_penalty?: number;
  response_format?: Record<string, unknown>;
  seed?: number;
  stream?: boolean;
  stream_options?: Record<string, unknown>;
  stop?: string[];
  temperature?: number;
  tool_choice?: "auto" | "required" | "none";
  tools?: Record<string, unknown>[];
  top_p?: number;
};

export async function POST(req: Request) {
  const apiUrl =
    process.env.GITHUB_MODELS_API_URL ||
    "https://models.github.ai/inference/chat/completions";
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const model = process.env.GITHUB_MODELS_MODEL || "openai/gpt-4.1";
  const apiVersion = process.env.GITHUB_API_VERSION || "2026-03-10";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GITHUB_MODELS_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as ChatRequestBody;
    const messages = Array.isArray(body?.messages)
      ? body.messages.filter(
          (msg): msg is ChatMessage =>
            typeof msg?.role === "string" && typeof msg?.content === "string",
        )
      : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "`messages` is required and must be a non-empty array." },
        { status: 400 },
      );
    }

    const requestPayload: Record<string, unknown> = {
      model: typeof body?.model === "string" ? body.model : model,
      messages,
    };

    const optionalFields: Array<keyof ChatRequestBody> = [
      "frequency_penalty",
      "max_tokens",
      "modalities",
      "presence_penalty",
      "response_format",
      "seed",
      "stream",
      "stream_options",
      "stop",
      "temperature",
      "tool_choice",
      "tools",
      "top_p",
    ];

    for (const field of optionalFields) {
      if (body[field] !== undefined) {
        requestPayload[field] = body[field];
      }
    }

    const providerResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${apiKey}`,
        "X-GitHub-Api-Version": apiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const rawProviderBody = await providerResponse.text();
    let providerData: GithubModelsResponse = {};

    try {
      providerData = JSON.parse(rawProviderBody) as GithubModelsResponse;
    } catch {
      providerData = {};
    }

    if (!providerResponse.ok) {
      return NextResponse.json(
        {
          error:
            providerData?.error?.message ||
            providerData?.message ||
            rawProviderBody ||
            `GitHub Models request failed (${providerResponse.status}).`,
        },
        { status: providerResponse.status },
      );
    }

    const reply = providerData?.choices?.[0]?.message?.content;

    return NextResponse.json({ reply: reply || "No response received." });
  } catch (error) {
    console.error("Chat proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error while calling GitHub Models." },
      { status: 500 },
    );
  }
}
