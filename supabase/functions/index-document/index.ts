import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
const INDEX_HOST = "developer-quickstart-py-pcmqk4n.svc.aped-4627-b74a.pinecone.io";
const NAMESPACE = "example-namespace";
const MAX_CHUNK_BYTES = 38000;

function generateUUID(): string {
  return crypto.randomUUID();
}

function chunkText(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText) return [];

  const paragraphs = cleanedText.split(/\n\n+/);
  let currentChunk = "";
  const encoder = new TextEncoder();

  for (const paragraph of paragraphs) {
    const paragraphWithBreak = paragraph + "\n\n";
    const potentialChunk = currentChunk + paragraphWithBreak;

    if (encoder.encode(potentialChunk).length <= maxBytes) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());

      if (encoder.encode(paragraphWithBreak).length > maxBytes) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        currentChunk = "";
        for (const sentence of sentences) {
          const s = sentence + " ";
          const p = currentChunk + s;
          if (encoder.encode(p).length <= maxBytes) {
            currentChunk = p;
          } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = encoder.encode(s).length > maxBytes ? "" : s;
          }
        }
      } else {
        currentChunk = paragraphWithBreak;
      }
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

// Convert a sheet to readable text (markdown table format)
function sheetToText(sheet: XLSX.WorkSheet, sheetName: string): string {
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
  if (rows.length === 0) return "";

  const lines: string[] = [`## Sheet: ${sheetName}\n`];

  // Find max columns
  const maxCols = Math.max(...rows.map(r => r.length));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = Array.from({ length: maxCols }, (_, c) => String(row[c] ?? "").trim());
    lines.push("| " + cells.join(" | ") + " |");

    // Add header separator after first row
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  }

  return lines.join("\n");
}

// Parse Excel workbook and return text per sheet
function parseExcel(fileBuffer: Uint8Array): { sheetName: string; text: string }[] {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const sheets: { sheetName: string; text: string }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const text = sheetToText(sheet, sheetName);
    if (text.trim()) {
      sheets.push({ sheetName, text });
    }
  }

  return sheets;
}

// Upload chunks to Pinecone
async function uploadToPinecone(
  chunks: string[],
  fileName: string,
  sheetName: string,
): Promise<number> {
  const ndjsonLines: string[] = [];
  const encoder = new TextEncoder();

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    while (encoder.encode(chunkText).length > MAX_CHUNK_BYTES) {
      chunkText = chunkText.substring(0, chunkText.length - 500);
    }

    const record = {
      _id: generateUUID(),
      text: chunkText,
      category: "document",
      source_file: `${fileName} - ${sheetName}`,
      chunk_index: i,
    };
    ndjsonLines.push(JSON.stringify(record));
  }

  const response = await fetch(
    `https://${INDEX_HOST}/records/namespaces/${NAMESPACE}/upsert`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "Api-Key": PINECONE_API_KEY!,
        "X-Pinecone-Api-Version": "2025-01",
      },
      body: ndjsonLines.join("\n"),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Pinecone upsert error:", response.status, errorText);
    throw new Error(`Failed to upload to Pinecone: ${response.status}`);
  }

  return chunks.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!PINECONE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Pinecone API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = file.name;
    console.log(`Processing file: ${fileName}, size: ${file.size}`);

    // Validate file type
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Please upload .xlsx, .xls, or .csv files." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Parse Excel
    const sheets = parseExcel(fileBuffer);
    console.log(`Parsed ${sheets.length} sheets from ${fileName}`);

    if (sheets.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data found in the uploaded file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalChunks = 0;
    const sheetResults: { name: string; chunks: number }[] = [];

    for (const { sheetName, text } of sheets) {
      const chunks = chunkText(text, MAX_CHUNK_BYTES);
      if (chunks.length > 0) {
        const count = await uploadToPinecone(chunks, fileName, sheetName);
        totalChunks += count;
        sheetResults.push({ name: sheetName, chunks: count });
        console.log(`Indexed sheet "${sheetName}": ${count} chunks`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        sheetsProcessed: sheetResults.length,
        totalChunks,
        sheets: sheetResults,
        message: `Successfully indexed ${totalChunks} chunks from ${sheetResults.length} sheet(s)`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in index-document function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
