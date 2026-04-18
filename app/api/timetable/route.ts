import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import PDFParser from "pdf2json";

type SubjectInput = {
  id: number;
  name: string;
  score: number | null;
};

type HandoutInput = {
  subjectId: number;
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

type StudyPreferencesInput = {
  workingDays: string[];
  workingHoursByDay: Record<string, { start: string; end: string }>;
  slotDurationMinutes: number;
};

type TimetableRequestBody = {
  model?: string;
  subjects?: SubjectInput[];
  studyPreferences?: StudyPreferencesInput;
  handouts?: HandoutInput[];
  prompt?: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  previousTimetable?: TimetableCell[][];
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

type TimetableCell = {
  subject: string;
  topic: string;
};

type TimetablePayload = {
  timetable: TimetableCell[][];
};

type HandoutExtractionResult = {
  text: string;
  bytes: number;
  error?: string;
};

const MAX_CHARS_PER_HANDOUT = 4000;
const MAX_TOTAL_HANDOUT_CHARS = 24000;
const VALID_WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_DAY_RANGE = { start: "08:00", end: "12:00" };

function logDebug(enabled: boolean, label: string, payload: unknown) {
  if (!enabled) return;
  console.log(`[timetable-debug] ${label}`, payload);
}

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

async function extractHandoutData(
  handout: HandoutInput,
): Promise<HandoutExtractionResult> {
  const fileBuffer = deserializeDataUrlToBuffer(handout.dataUrl);
  if (!fileBuffer) {
    return { text: "", bytes: 0, error: "Could not decode file data URL." };
  }

  try {
    if (isPdf(handout)) {
      const pdfText = (await extractPdfTextWithPdf2Json(fileBuffer)).trim();

      if (!pdfText) {
        return {
          text: "",
          bytes: fileBuffer.byteLength,
          error:
            "No selectable text found in PDF (possibly scanned/image-based PDF).",
        };
      }

      return { text: pdfText, bytes: fileBuffer.byteLength };
    }

    if (isDocx(handout)) {
      const docxText = (await extractDocxTextWithJsZip(fileBuffer)).trim();

      if (!docxText) {
        return {
          text: "",
          bytes: fileBuffer.byteLength,
          error: "No text nodes found in DOCX document.xml.",
        };
      }

      return { text: docxText, bytes: fileBuffer.byteLength };
    }

    return {
      text: "",
      bytes: fileBuffer.byteLength,
      error: "Unsupported handout format.",
    };
  } catch (error) {
    return {
      text: "",
      bytes: fileBuffer.byteLength,
      error:
        error instanceof Error ? error.message : "Unknown extraction error.",
    };
  }
}

function buildFilenameTopicHint(fileName: string): string {
  const stopWords = new Set([
    "handout",
    "module",
    "mod",
    "course",
    "subject",
    "the",
    "and",
    "for",
    "with",
    "from",
    "bits",
    "f111",
    "f211",
    "f340",
  ]);

  const cleaned = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .map((token) => token.toLowerCase())
    .filter(
      (token) =>
        token.length >= 4 && !stopWords.has(token) && !/^\d+$/.test(token),
    );

  if (tokens.length === 0) {
    return cleaned || "General topics from handout";
  }

  const uniqueTokens = [...new Set(tokens)].slice(0, 6);
  return uniqueTokens.join(", ");
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

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function formatMinutesTo12Hour(totalMinutes: number): string {
  const bounded = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1));
  const hours24 = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

function buildDaySlotStarts(
  day: string,
  studyPreferences: StudyPreferencesInput,
): number[] {
  const range = studyPreferences.workingHoursByDay[day] || DEFAULT_DAY_RANGE;
  const start = parseTimeToMinutes(range.start);
  const end = parseTimeToMinutes(range.end);
  const slotDuration = Math.max(15, studyPreferences.slotDurationMinutes || 60);

  if (start === null || end === null || end <= start) return [];

  const slotCount = Math.floor((end - start) / slotDuration);
  if (slotCount <= 0) return [];

  return Array.from({ length: slotCount }, (_, index) => start + index * slotDuration);
}

function normalizeTimetable(
  parsed: unknown,
  expectedRows: number,
  expectedCols: number,
  orderedWorkingDays: string[],
): TimetablePayload | null {
  if (!parsed) return null;

  const toCell = (cell: unknown): TimetableCell | null => {
    if (!cell || typeof cell !== "object") return null;

    const subject = (cell as { subject?: unknown }).subject;
    const topic = (cell as { topic?: unknown }).topic;

    if (typeof subject !== "string" || typeof topic !== "string") return null;

    return {
      subject: subject.trim() || "Study",
      topic: topic.trim() || "Revision",
    };
  };

  let timetable: unknown = null;

  if (Array.isArray(parsed)) {
    timetable = parsed;
  } else if (typeof parsed === "object") {
    const parsedObj = parsed as Record<string, unknown>;
    timetable = parsedObj.timetable;

    if (!Array.isArray(timetable)) {
      const weekdayKeys = orderedWorkingDays.map((day) => day.toLowerCase());
      const hasWeekdayShape = weekdayKeys.every((key) =>
        Array.isArray(parsedObj[key]),
      );

      if (hasWeekdayShape) {
        const dayColumns = weekdayKeys.map(
          (key) => parsedObj[key] as unknown[],
        );
        const maxRows = Math.min(
          expectedRows,
          ...dayColumns.map((col) => col.length),
        );
        const rebuilt: unknown[][] = [];

        for (let row = 0; row < maxRows; row += 1) {
          rebuilt.push(dayColumns.map((col) => col[row]));
        }

        timetable = rebuilt;
      }
    }
  }

  if (!Array.isArray(timetable) || timetable.length === 0) return null;

  const rows = timetable.map((row) => (Array.isArray(row) ? row : []));
  if (rows.some((row) => row.length === 0)) return null;

  const rowCount = rows.length;
  const minColCount = Math.min(...rows.map((row) => row.length));

  if (rowCount > 0 && minColCount >= expectedCols) {
    const normalized = rows.slice(0, expectedRows).map((row) =>
      row
        .slice(0, expectedCols)
        .map(toCell)
        .filter((cell): cell is TimetableCell => cell !== null),
    );

    while (normalized.length < expectedRows) {
      normalized.push(
        Array.from({ length: expectedCols }, () => ({
          subject: "No Slot",
          topic: "Outside working hours",
        })),
      );
    }

    if (normalized.every((row) => row.length === expectedCols)) {
      return { timetable: normalized };
    }
  }

  if (rowCount === expectedCols && minColCount >= expectedRows) {
    const transposed: TimetableCell[][] = Array.from(
      { length: expectedRows },
      () => [],
    );

    for (let dayIndex = 0; dayIndex < expectedCols; dayIndex += 1) {
      for (let blockIndex = 0; blockIndex < expectedRows; blockIndex += 1) {
        const cell = toCell(rows[dayIndex][blockIndex]);
        if (!cell) return null;
        transposed[blockIndex].push(cell);
      }
    }

    if (transposed.every((row) => row.length === expectedCols)) {
      return { timetable: transposed };
    }
  }

  return null;
}

export async function POST(req: Request) {
  const debugEnabled = process.env.TIMETABLE_DEBUG === "true";
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
    const body = (await req.json()) as TimetableRequestBody;
    logDebug(debugEnabled, "request.received", {
      hasSubjects: Array.isArray(body?.subjects),
      hasHandouts: Array.isArray(body?.handouts),
      modelOverride: typeof body?.model === "string" ? body.model : null,
    });

    const subjects = Array.isArray(body.subjects)
      ? body.subjects.filter(
          (s): s is SubjectInput =>
            typeof s?.id === "number" &&
            typeof s?.name === "string" &&
            (typeof s?.score === "number" || s?.score === null),
        )
      : [];

    const studyPreferences: StudyPreferencesInput = {
      workingDays: Array.isArray(body?.studyPreferences?.workingDays)
        ? body.studyPreferences.workingDays.filter(
            (day): day is string =>
              typeof day === "string" && VALID_WEEK_DAYS.includes(day),
          )
        : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      workingHoursByDay: VALID_WEEK_DAYS.reduce<
        Record<string, { start: string; end: string }>
      >((acc, day) => {
        const candidate = (
          body?.studyPreferences?.workingHoursByDay as
            | Record<string, { start?: unknown; end?: unknown }>
            | undefined
        )?.[day];

        acc[day] = {
          start:
            typeof candidate?.start === "string"
              ? candidate.start
              : DEFAULT_DAY_RANGE.start,
          end:
            typeof candidate?.end === "string"
              ? candidate.end
              : DEFAULT_DAY_RANGE.end,
        };

        return acc;
      }, {}),
      slotDurationMinutes:
        typeof body?.studyPreferences?.slotDurationMinutes === "number" &&
        body.studyPreferences.slotDurationMinutes >= 15
          ? Math.floor(body.studyPreferences.slotDurationMinutes)
          : 60,
    };

    if (studyPreferences.workingDays.length === 0) {
      studyPreferences.workingDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    }

    const orderedWorkingDays = VALID_WEEK_DAYS.filter((day) =>
      studyPreferences.workingDays.includes(day),
    );
    const daySlotStarts = orderedWorkingDays.reduce<Record<string, number[]>>(
      (acc, day) => {
        acc[day] = buildDaySlotStarts(day, studyPreferences);
        return acc;
      },
      {},
    );
    const allSlotStarts = Array.from(
      new Set(orderedWorkingDays.flatMap((day) => daySlotStarts[day] || [])),
    ).sort((a, b) => a - b);
    const fallbackStart = parseTimeToMinutes(DEFAULT_DAY_RANGE.start) ?? 8 * 60;
    const rowSlotStarts = allSlotStarts.length > 0 ? allSlotStarts : [fallbackStart];
    const expectedRows = rowSlotStarts.length;
    const expectedCols = Math.max(1, orderedWorkingDays.length);

    if (subjects.length === 0) {
      return NextResponse.json(
        { error: "subjects is required and must be a non-empty array." },
        { status: 400 },
      );
    }

    logDebug(debugEnabled, "subjects.normalized", {
      count: subjects.length,
      subjects,
    });

    const handouts = Array.isArray(body.handouts)
      ? body.handouts.filter(
          (h): h is HandoutInput =>
            typeof h?.subjectId === "number" &&
            typeof h?.fileName === "string" &&
            typeof h?.mimeType === "string" &&
            typeof h?.dataUrl === "string",
        )
      : [];

    const conversation = Array.isArray(body.conversation)
      ? body.conversation
          .filter(
            (turn): turn is { role: "user" | "assistant"; content: string } =>
              (turn?.role === "user" || turn?.role === "assistant") &&
              typeof turn?.content === "string" &&
              turn.content.trim().length > 0,
          )
          .slice(-10)
      : [];

    const previousTimetableNormalized = Array.isArray(body.previousTimetable)
      ? normalizeTimetable(
          { timetable: body.previousTimetable },
          expectedRows,
          expectedCols,
          orderedWorkingDays,
        )
      : null;

    const subjectNameById = new Map(
      subjects.map((subject) => [subject.id, subject.name]),
    );

    const extractedHandouts: string[] = [];
    const filenameHints: string[] = [];
    let totalChars = 0;

    for (const handout of handouts) {
      if (totalChars >= MAX_TOTAL_HANDOUT_CHARS) break;

      const extracted = await extractHandoutData(handout);
      const text = extracted.text.replace(/\s+/g, " ").trim();

      const subjectName =
        subjectNameById.get(handout.subjectId) || "Unknown subject";

      filenameHints.push(
        `Subject: ${subjectName} | File: ${handout.fileName} | filename topic hints: ${buildFilenameTopicHint(handout.fileName)}`,
      );

      logDebug(debugEnabled, "handout.extraction", {
        fileName: handout.fileName,
        subjectId: handout.subjectId,
        mimeType: handout.mimeType,
        bytes: extracted.bytes,
        extractedChars: text.length,
        error: extracted.error || null,
      });

      if (!text) continue;

      const remaining = MAX_TOTAL_HANDOUT_CHARS - totalChars;
      const maxForThisHandout = Math.min(MAX_CHARS_PER_HANDOUT, remaining);
      const excerpt = text.slice(0, maxForThisHandout);

      totalChars += excerpt.length;
      extractedHandouts.push(
        `Subject: ${subjectName} (ID: ${handout.subjectId}) | File: ${handout.fileName}\n${excerpt}`,
      );
    }

    logDebug(debugEnabled, "handout.summary", {
      providedHandouts: handouts.length,
      extractedHandouts: extractedHandouts.length,
      extractedTotalChars: totalChars,
      filenameHints: filenameHints.length,
    });

    const subjectContext = subjects
      .map((subject) => {
        const scoreText =
          subject.score === null
            ? "not rated"
            : `${subject.score}/5 (5 = strongest, 1 = weakest)`;

        return `- ${subject.name}: strength ${scoreText}`;
      })
      .join("\n");

    const handoutContext =
      extractedHandouts.length > 0
        ? extractedHandouts.join("\n\n---\n\n")
        : "No handout text could be extracted. Use subject strengths to balance the plan.";

    const filenameHintContext =
      filenameHints.length > 0
        ? filenameHints.join("\n")
        : "No handout files were provided.";

    const conversationContext =
      conversation.length > 0
        ? conversation
            .map(
              (turn, index) =>
                `${index + 1}. ${turn.role.toUpperCase()}: ${turn.content}`,
            )
            .join("\n")
        : "No previous conversation turns.";

    const previousTimetableContext =
      previousTimetableNormalized &&
      previousTimetableNormalized.timetable.length > 0
        ? previousTimetableNormalized.timetable
            .map(
              (row, rowIndex) =>
                `Block ${rowIndex + 1}: ${row
                  .map((cell) => `${cell.subject} - ${cell.topic}`)
                  .join(" | ")}`,
            )
            .join("\n")
        : "No previous timetable available.";

    const dayScheduleContext = orderedWorkingDays
      .map((day) => {
        const ranges = (daySlotStarts[day] || []).map(
          (slotStart) =>
            `${formatMinutesTo12Hour(slotStart)} - ${formatMinutesTo12Hour(slotStart + studyPreferences.slotDurationMinutes)}`,
        );
        if (ranges.length === 0) {
          return `- ${day}: no valid slots after rounding down by slot duration.`;
        }

        return `- ${day}: ${ranges.join(" | ")}`;
      })
      .join("\n");

    const rowTimesContext = rowSlotStarts
      .map(
        (slotStart, index) =>
          `Row ${index + 1}: ${formatMinutesTo12Hour(slotStart)} - ${formatMinutesTo12Hour(
            slotStart + studyPreferences.slotDurationMinutes,
          )}`,
      )
      .join("\n");

    const studyPreferencesContext = [
      `Working days selected by user (Sun to Sat options): ${studyPreferences.workingDays.join(", ")}`,
      "Working hours per selected day:",
      dayScheduleContext,
      `Preferred slot duration (minutes): ${studyPreferences.slotDurationMinutes}`,
      `Expected timetable shape: ${expectedRows} rows x ${expectedCols} columns in this day order: ${orderedWorkingDays.join(", ")}.`,
      "Row-to-time mapping (use this exact row order):",
      rowTimesContext,
      "Use these preferences to shape workload intensity and topic depth across timetable blocks.",
      "Do not schedule study entries beyond the user's end time for any day.",
      'If a day does not have availability for a row time, return {"subject":"No Slot","topic":"Outside working hours"} for that cell.',
    ].join("\n");

    const systemPrompt =
      "You are an academic planning assistant. Build a weekly timetable from subjects, student strength scores, and handout content. " +
      "Handouts contain what should be studied in each subject. Scores are from 1 to 5 where 5 means strongest and 1 means weakest. " +
      "Give more time and foundational topics to weaker subjects and advanced revision to stronger subjects. " +
      "When the user asks to edit or change a timetable, treat the previous timetable as the baseline and modify it instead of creating an unrelated new plan. " +
      'Return strict JSON only with this schema: {"timetable":[[{"subject":"...","topic":"..."}]]}. ' +
      `It must be exactly ${expectedRows} rows and each row must contain exactly ${expectedCols} cells. ` +
      "Do not output markdown, code fences, explanations, tips, or a daily routine. " +
      "Do not use vague placeholder topics such as 'Advanced Topics', 'Foundational Topics', 'Intermediate Topics', or 'Revision' unless those exact phrases appear in handout excerpts.";

    const userPrompt = [
      `Create a timetable only for these days in order: ${orderedWorkingDays.join(", ")}.`,
      `Important: The JSON timetable must be exactly ${expectedRows} rows and each row must contain exactly ${expectedCols} cells (columns).`,
      "Subject strengths:",
      subjectContext,
      "",
      "Study preferences:",
      studyPreferencesContext,
      "",
      "Handout excerpts:",
      handoutContext,
      "",
      "Filename-based topic hints (use these when handout text extraction is empty):",
      filenameHintContext,
      "",
      "Previous timetable baseline (preserve this unless user asks for major changes):",
      previousTimetableContext,
      "",
      "Recent conversation context:",
      conversationContext,
      "",
      typeof body.prompt === "string" && body.prompt.trim()
        ? `Additional user request: ${body.prompt.trim()}`
        : "",
    ].join("\n");

    logDebug(debugEnabled, "prompt.preview", {
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      userPromptStart: userPrompt.slice(0, 1200),
    });

    const basePayload = {
      model: typeof body.model === "string" ? body.model : defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    };

    const requestHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${apiKey}`,
      "X-GitHub-Api-Version": apiVersion,
      "Content-Type": "application/json",
    };

    let providerResponse = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        ...basePayload,
        response_format: { type: "json_object" },
      }),
    });

    let rawProviderBody = await providerResponse.text();

    logDebug(debugEnabled, "provider.response.initial", {
      status: providerResponse.status,
      bodyStart: rawProviderBody.slice(0, 1200),
    });

    if (!providerResponse.ok) {
      const responseFormatRejected =
        providerResponse.status === 400 || providerResponse.status === 422;

      if (responseFormatRejected) {
        let initialErrorData: ProviderResponse = {};

        try {
          initialErrorData = JSON.parse(rawProviderBody) as ProviderResponse;
        } catch {
          initialErrorData = {};
        }

        const initialErrorText = (
          initialErrorData?.error?.message ||
          initialErrorData?.message ||
          rawProviderBody
        ).toLowerCase();

        if (initialErrorText.includes("response_format")) {
          providerResponse = await fetch(apiUrl, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(basePayload),
          });
          rawProviderBody = await providerResponse.text();

          logDebug(
            debugEnabled,
            "provider.response.retryWithoutResponseFormat",
            {
              status: providerResponse.status,
              bodyStart: rawProviderBody.slice(0, 1200),
            },
          );
        }
      }
    }
    let providerData: ProviderResponse = {};

    try {
      providerData = JSON.parse(rawProviderBody) as ProviderResponse;
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

    const modelText = providerData?.choices?.[0]?.message?.content || "";
    const jsonText = extractJsonObject(modelText);

    logDebug(debugEnabled, "provider.output.parse", {
      modelTextChars: modelText.length,
      modelTextStart: modelText.slice(0, 1200),
      hasJsonObject: Boolean(jsonText),
    });

    if (!jsonText) {
      if (previousTimetableNormalized) {
        logDebug(debugEnabled, "timetable.fallback.previous", {
          reason: "Model did not return JSON object.",
        });

        return NextResponse.json({
          timetable: previousTimetableNormalized.timetable,
          fallbackUsed: true,
        });
      }

      return NextResponse.json(
        { error: "Model did not return valid JSON for timetable." },
        { status: 502 },
      );
    }

    let parsedOutput: unknown;

    try {
      parsedOutput = JSON.parse(jsonText);
    } catch {
      if (previousTimetableNormalized) {
        logDebug(debugEnabled, "timetable.fallback.previous", {
          reason: "Model JSON parse failed.",
        });

        return NextResponse.json({
          timetable: previousTimetableNormalized.timetable,
          fallbackUsed: true,
        });
      }

      return NextResponse.json(
        { error: "Could not parse model JSON timetable output." },
        { status: 502 },
      );
    }

    const normalized = normalizeTimetable(
      parsedOutput,
      expectedRows,
      expectedCols,
      orderedWorkingDays,
    );

    logDebug(debugEnabled, "timetable.normalization", {
      isValid: Boolean(normalized),
      rows: normalized?.timetable.length,
      cols: normalized?.timetable[0]?.length,
    });

    if (!normalized) {
      if (previousTimetableNormalized) {
        logDebug(debugEnabled, "timetable.fallback.previous", {
          reason: "Normalized timetable invalid.",
        });

        return NextResponse.json({
          timetable: previousTimetableNormalized.timetable,
          fallbackUsed: true,
        });
      }

      return NextResponse.json(
        { error: "Model output format is invalid for timetable schema." },
        { status: 502 },
      );
    }

    const weakestSubject = [...subjects].sort((a, b) => {
      const scoreA = a.score === null ? 3 : a.score;
      const scoreB = b.score === null ? 3 : b.score;
      return scoreA - scoreB;
    })[0];

    const correctedTimetable = normalized.timetable.map((row, rowIndex) =>
      row.map((cell, colIndex) => {
        const day = orderedWorkingDays[colIndex];
        const rowStart = rowSlotStarts[rowIndex];
        const hasAvailability = (daySlotStarts[day] || []).includes(rowStart);
        const isNoSlotCell =
          cell.subject.trim().toLowerCase() === "no slot" ||
          cell.topic.trim().toLowerCase() === "outside working hours";

        if (!hasAvailability) {
          return {
            subject: "No Slot",
            topic: "Outside working hours",
          };
        }

        if (hasAvailability && isNoSlotCell) {
          return {
            subject: weakestSubject?.name || "Study Session",
            topic: "Planned study session",
          };
        }

        return cell;
      }),
    );

    return NextResponse.json({ timetable: correctedTimetable });
  } catch (error) {
    console.error("Timetable generation error:", error);
    return NextResponse.json(
      { error: "Internal server error while generating timetable." },
      { status: 500 },
    );
  }
}
