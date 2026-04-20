import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import PDFParser from "pdf2json";

type SubjectInput = {
  id: number;
  name: string;
};

type HandoutInput = {
  subjectId: number;
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

type TopicExtractRequest = {
  model?: string;
  subject?: SubjectInput;
  handout?: HandoutInput;
};

type ProviderResponse = {
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

type TopicExtractResponse = {
  topics: string[];
};

const MAX_HANDOUT_CHARS = 12000;
const MAX_TOPIC_COUNT = 60;

function deserializeDataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:.*;base64,(.*)$/);
  if (!match?.[1]) return null;

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function collectDocxTextNodes(node: unknown, chunks: string[]) {
  if (node === null || node === undefined) return;

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (trimmed) chunks.push(trimmed);
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectDocxTextNodes(child, chunks);
    }
    return;
  }

  if (typeof node === "object") {
    const record = node as Record<string, unknown>;

    for (const [key, value] of Object.entries(record)) {
      if (key === "w:t" || key === "t") {
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed) chunks.push(trimmed);
        } else {
          collectDocxTextNodes(value, chunks);
        }
      } else {
        collectDocxTextNodes(value, chunks);
      }
    }
  }
}

function extractPdfTextWithPdf2Json(fileBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on(
      "pdfParser_dataError",
      (errMsg: Error | { parserError: Error }) => {
        const errorMessage =
          errMsg instanceof Error
            ? errMsg.message
            : errMsg?.parserError?.message ||
              "pdf2json could not parse the PDF.";

        reject(new Error(errorMessage));
      },
    );

    parser.on("pdfParser_dataReady", (pdfData: unknown) => {
      try {
        const pages =
          (
            pdfData as {
              Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }>;
            }
          )?.Pages || [];
        const textChunks: string[] = [];

        for (const page of pages) {
          const pageTexts = Array.isArray(page?.Texts) ? page.Texts : [];

          for (const textNode of pageTexts) {
            const runs = Array.isArray(textNode?.R) ? textNode.R : [];

            for (const run of runs) {
              if (typeof run?.T !== "string") continue;

              try {
                const decoded = decodeURIComponent(run.T)
                  .replace(/\+/g, " ")
                  .trim();
                if (decoded) textChunks.push(decoded);
              } catch {
                const fallback = run.T.replace(/\+/g, " ").trim();
                if (fallback) textChunks.push(fallback);
              }
            }
          }
        }

        resolve(textChunks.join(" "));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to read parsed PDF text."),
        );
      }
    });

    parser.parseBuffer(fileBuffer);
  });
}

async function extractDocxTextWithJsZip(fileBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXmlFile = zip.file("word/document.xml");

  if (!documentXmlFile) {
    throw new Error("word/document.xml not found in DOCX archive.");
  }

  const xml = await documentXmlFile.async("string");
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  const parsed = parser.parse(xml);
  const chunks: string[] = [];
  collectDocxTextNodes(parsed, chunks);

  return chunks.join(" ");
}

function isPdf(handout: HandoutInput) {
  return (
    handout.mimeType === "application/pdf" ||
    handout.fileName.toLowerCase().endsWith(".pdf")
  );
}

function isDocx(handout: HandoutInput) {
  return (
    handout.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    handout.fileName.toLowerCase().endsWith(".docx")
  );
}

async function extractHandoutText(handout: HandoutInput): Promise<string> {
  const fileBuffer = deserializeDataUrlToBuffer(handout.dataUrl);
  if (!fileBuffer) return "";

  if (isPdf(handout)) {
    return (await extractPdfTextWithPdf2Json(fileBuffer))
      .replace(/\s+/g, " ")
      .trim();
  }

  if (isDocx(handout)) {
    return (await extractDocxTextWithJsZip(fileBuffer))
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function normalizeTopicName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeTopics(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((topic) => normalizeTopicName(topic))
    .filter((topic) => topic.length > 0)
    .filter((topic) => {
      const key = topic.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOPIC_COUNT);
}

function buildFilenameTopicFallback(fileName: string): string[] {
  const cleaned = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  return dedupeTopics(
    cleaned
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

export async function POST(req: Request) {
  const apiUrl =
    process.env.GITHUB_MODELS_API_URL ||
    "https://models.github.ai/inference/chat/completions";
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const defaultModel = process.env.GITHUB_MODELS_MODEL || "openai/gpt-4.1";
  const apiVersion = process.env.GITHUB_API_VERSION || "2026-03-10";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GITHUB_MODELS_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as TopicExtractRequest;
    const subject = body?.subject;
    const handout = body?.handout;

    if (
      !subject ||
      typeof subject.id !== "number" ||
      typeof subject.name !== "string"
    ) {
      return NextResponse.json(
        { error: "subject is required with id and name." },
        { status: 400 },
      );
    }

    if (
      !handout ||
      typeof handout.subjectId !== "number" ||
      typeof handout.fileName !== "string" ||
      typeof handout.mimeType !== "string" ||
      typeof handout.dataUrl !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "handout is required with subjectId, fileName, mimeType, and dataUrl.",
        },
        { status: 400 },
      );
    }

    const extractedText = (await extractHandoutText(handout)).slice(
      0,
      MAX_HANDOUT_CHARS,
    );

    if (!extractedText) {
      const fallbackTopics = buildFilenameTopicFallback(handout.fileName);
      return NextResponse.json({
        topics: fallbackTopics,
      } satisfies TopicExtractResponse);
    }

    const systemPrompt =
      "You extract concise study topics from academic handouts. " +
      'Return strict JSON only with schema: {"topics":["topic 1","topic 2"]}. ' +
      "Each topic must be short (2-10 words), specific, and not duplicated.";

    const userPrompt = [
      `Subject: ${subject.name}`,
      `Handout file: ${handout.fileName}`,
      "Extract only meaningful study topics from this content.",
      "Do not return explanation text.",
      "Handout content:",
      extractedText,
    ].join("\n\n");

    const requestHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${apiKey}`,
      "X-GitHub-Api-Version": apiVersion,
      "Content-Type": "application/json",
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        model: typeof body.model === "string" ? body.model : defaultModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    const rawBody = await response.text();
    let providerData: ProviderResponse = {};

    try {
      providerData = JSON.parse(rawBody) as ProviderResponse;
    } catch {
      providerData = {};
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            providerData?.error?.message ||
            providerData?.message ||
            rawBody ||
            `GitHub Models request failed (${response.status}).`,
        },
        { status: response.status },
      );
    }

    const modelText = providerData?.choices?.[0]?.message?.content || "";
    const jsonText = extractJsonObject(modelText);

    if (!jsonText) {
      const fallbackTopics = buildFilenameTopicFallback(handout.fileName);
      return NextResponse.json({
        topics: fallbackTopics,
      } satisfies TopicExtractResponse);
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = null;
    }

    const topics = Array.isArray(
      (parsed as { topics?: unknown } | null)?.topics,
    )
      ? (parsed as { topics: unknown[] }).topics
          .filter((topic): topic is string => typeof topic === "string")
          .map((topic) => topic.trim())
      : [];

    const deduped = dedupeTopics(topics);
    if (deduped.length > 0) {
      return NextResponse.json({
        topics: deduped,
      } satisfies TopicExtractResponse);
    }

    const fallbackTopics = buildFilenameTopicFallback(handout.fileName);
    return NextResponse.json({
      topics: fallbackTopics,
    } satisfies TopicExtractResponse);
  } catch (error) {
    console.error("Topic extraction error:", error);
    return NextResponse.json(
      { error: "Internal server error while extracting topics." },
      { status: 500 },
    );
  }
}
