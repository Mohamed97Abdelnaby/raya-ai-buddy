import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINECONE_URL = Deno.env.get("PINECONE_URL");
const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface PineconeResult {
  _id: string;
  _score: number;
  fields?: {
    category?: string;
    chunk_text?: string;
    source_file?: string;
    text?: string;
  };
}

interface Source {
  file: string;
  category?: string;
}

// Query Pinecone for relevant documents
async function queryPinecone(
  userQuestion: string,
  topK: number = 5,
): Promise<{ documents: string[]; sources: Source[] }> {
  console.log("Querying Pinecone...", { userQuestion, topK });

  const response = await fetch(
    "https://developer-quickstart-py-pcmqk4n.svc.aped-4627-b74a.pinecone.io/records/namespaces/example-namespace/search",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": PINECONE_API_KEY!,
        "X-Pinecone-Api-Version": "unstable",
      },
      body: JSON.stringify({
        query: {
          inputs: { text: userQuestion },
          top_k: topK,
        },
        fields: ["category", "chunk_text", "source_file", "text"],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Pinecone query failed:", response.status, errorText);
    throw new Error(`Pinecone query failed: ${response.status}`);
  }

  const results = await response.json();
  console.log("Pinecone raw results:", JSON.stringify(results));

  const documents: string[] = [];
  const sources: Source[] = [];
  const seenSources = new Set<string>();

  // Extract documents and sources from Pinecone results
  const hits = results.result?.hits || results.hits || [];

  for (const hit of hits as PineconeResult[]) {
    const fields = hit.fields || {};
    const content = fields.chunk_text || fields.text || "";
    const sourceFile = fields.source_file || "Unknown source";
    const category = fields.category;

    if (content) {
      documents.push(content);
      console.log(`Document from ${sourceFile}: ${content.substring(0, 100)}...`);
    }

    // Add unique sources
    if (!seenSources.has(sourceFile)) {
      seenSources.add(sourceFile);
      sources.push({ file: sourceFile, category });
    }
  }

  console.log(`Retrieved ${documents.length} documents from ${sources.length} unique sources`);

  return { documents, sources };
}

// RAG Query function
async function ragQuery(
  userQuestion: string,
  topK: number = 5,
  model: string = "gpt-3.5-turbo",
  temperature: number = 0.2,
  maxTokens: number = 500,
): Promise<{ answer: string; sources: Source[] }> {
  let context = "";
  let sources: Source[] = [];

  // Try to get context from Pinecone
  try {
    const pineconeResults = await queryPinecone(userQuestion, topK);
    context = pineconeResults.documents.join("\n\n");
    sources = pineconeResults.sources;

    console.log("Context length:", context.length);
    console.log("Sources:", JSON.stringify(sources));
  } catch (error) {
    console.error("Error querying Pinecone, continuing without context:", error);
  }

  // Build source list for citation
  const sourcesList = sources.map((s, i) => `[${i + 1}] ${s.file}`).join("\n");

  // System prompt with rules
  const systemPrompt = `You are Raya AI Assistant, a Retrieval-Augmented AI system. You must strictly follow these rules:

────────────────────────────
🎯 CORE BEHAVIOR
- Your ONLY knowledge source is the <context> provided to you in the final user message.
- If information is NOT inside <context>, you MUST NOT invent, guess, or use external world knowledge.

────────────────────────────
🤝 GREETINGS & COURTESY
If the user message is ONLY a greeting, thanks, emoji, or simple polite phrase such as:
"hello" | "hi" | "hey" | "good morning" | "morning" | "thanks" | "شكراً" | "السلام عليكم" | "سلام" | "😊" | "👍"
→ Reply naturally and politely WITHOUT using context and WITHOUT citations.

Example:
User: "hi"
Assistant: "Hello 👋 How can I help you today?"

────────────────────────────
📘 INFORMATIONAL QUESTIONS
Before answering:
1️⃣ First determine if the provided <context> contains information directly answering the question.
2️⃣ If YES → answer using ONLY what is explicitly written inside <context>.
3️⃣ If NO → respond *exactly*:

"I'm sorry, I don't have enough information in my knowledge base to answer this."

(no explanations, no sources, nothing else)

────────────────────────────
🧠 PARTIAL ANSWERS
If the context only answers part of the question:
- Answer ONLY the part that exists
- Then add:
"For the remaining details, my KB does not contain enough information."

────────────────────────────
📚 CITATION RULES
- If you use information from <context>, cite the source(s) like this:

  📚 Sources:
  [1] filename.pdf
  [2] notes.docx

- DO NOT cite sources if the answer was a greeting or if you responded with:
  "I'm sorry, I don't have enough information in my knowledge base to answer this."

────────────────────────────
📝 RESPONSE STYLE
- Use bullets or steps when helpful
- Respond in the same language the user used
- Be concise, friendly, and accurate

If you are unsure, always choose to say:
"I'm sorry, I don't have enough information in my knowledge base to answer this."

Available sources:
${sourcesList}`;

  // Build user message with question and context using XML tags
  const userMessage = `<question>
${userQuestion}
</question>

<context>
${context || "No relevant content found in knowledge base."}
</context>`;

  console.log("Sending to OpenAI - System prompt length:", systemPrompt.length);
  console.log("Sending to OpenAI - User message:", userMessage.substring(0, 200) + "...");

  // Call OpenAI
  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    console.error("OpenAI API error:", openaiResponse.status, errorText);
    throw new Error(`OpenAI API error: ${openaiResponse.status}`);
  }

  const data = await openaiResponse.json();
  const answer = data.choices[0].message.content;

  console.log("Generated answer:", answer);
  console.log("Returning sources:", JSON.stringify(sources));

  return { answer, sources };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, topK = 5, model = "gpt-3.5-turbo", temperature = 0.2, maxTokens = 500 } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!PINECONE_URL || !PINECONE_API_KEY) {
      console.error("Pinecone configuration missing");
      return new Response(JSON.stringify({ error: "Pinecone not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing message:", message);

    const { answer, sources } = await ragQuery(message, topK, model, temperature, maxTokens);

    return new Response(JSON.stringify({ response: answer, sources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in chat function:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
