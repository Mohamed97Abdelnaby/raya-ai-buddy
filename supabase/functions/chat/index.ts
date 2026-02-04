import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINECONE_URL = Deno.env.get("PINECONE_URL");
const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const INDEX_HOST = "developer-quickstart-py-pcmqk4n.svc.aped-4627-b74a.pinecone.io";
const NAMESPACE = "example-namespace";
const MAX_CHUNK_BYTES = 40960;

interface PineconeResult {
  _id: string;
  _score: number;
  fields?: {
    category?: string;
    chunk_text?: string;
    source_file?: string;
    text?: string;
    source_url?: string;
  };
}

interface Source {
  file: string;
  category?: string;
  url?: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// Detect URLs in text
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)]; // Remove duplicates
}

// Generate a UUID
function generateUUID(): string {
  return crypto.randomUUID();
}

// Extract domain name from URL
function extractDomainName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// Chunk text into segments of max bytes
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
  
  for (const paragraph of paragraphs) {
    const paragraphWithBreak = paragraph + "\n\n";
    const encoder = new TextEncoder();
    const potentialChunk = currentChunk + paragraphWithBreak;
    
    if (encoder.encode(potentialChunk).length <= maxBytes) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      
      if (encoder.encode(paragraphWithBreak).length > maxBytes) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        currentChunk = "";
        
        for (const sentence of sentences) {
          const sentenceWithSpace = sentence + " ";
          const potentialSentenceChunk = currentChunk + sentenceWithSpace;
          
          if (encoder.encode(potentialSentenceChunk).length <= maxBytes) {
            currentChunk = potentialSentenceChunk;
          } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = encoder.encode(sentenceWithSpace).length > maxBytes ? "" : sentenceWithSpace;
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

// Scrape URL using Firecrawl
async function scrapeUrl(url: string): Promise<{ content: string; title: string }> {
  console.log("Scraping URL with Firecrawl:", url);
  
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Firecrawl error:", response.status, errorText);
    throw new Error(`Failed to scrape URL: ${response.status}`);
  }
  
  const data = await response.json();
  const content = data.data?.markdown || data.markdown || "";
  const title = data.data?.metadata?.title || data.metadata?.title || extractDomainName(url);
  
  return { content, title };
}

// Upload chunks to Pinecone
async function uploadToPinecone(
  chunks: string[],
  sourceUrl: string,
  title: string
): Promise<{ success: boolean; recordCount: number }> {
  console.log(`Uploading ${chunks.length} chunks to Pinecone for: ${sourceUrl}`);
  
  const domainName = extractDomainName(sourceUrl);
  const ndjsonLines: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    // Use only 'text' field for embedding - Pinecone uses this for vectorization
    // Store a truncated version in chunk_text for retrieval to stay under 40KB metadata limit
    const record = {
      _id: generateUUID(),
      text: chunks[i],
      category: "web_page",
      source_file: `${title} (${domainName})`,
      source_url: sourceUrl,
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
  
  console.log("Pinecone upsert successful");
  return { success: true, recordCount: chunks.length };
}

// Process and index a URL
async function indexUrl(url: string): Promise<{ success: boolean; title: string; chunks: number }> {
  const { content, title } = await scrapeUrl(url);
  
  if (!content || content.length === 0) {
    throw new Error("No content could be extracted from the URL");
  }
  
  const chunks = chunkText(content, MAX_CHUNK_BYTES);
  
  if (chunks.length === 0) {
    throw new Error("Could not create chunks from content");
  }
  
  await uploadToPinecone(chunks, url, title);
  
  return { success: true, title, chunks: chunks.length };
}

// Query Pinecone for relevant documents
async function queryPinecone(
  userQuestion: string,
  topK: number = 5,
): Promise<{ documents: string[]; sources: Source[] }> {
  console.log("Querying Pinecone...", { userQuestion, topK });

  const response = await fetch(
    `https://${INDEX_HOST}/records/namespaces/${NAMESPACE}/search`,
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
        fields: ["category", "chunk_text", "source_file", "text", "source_url"],
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
    const sourceUrl = fields.source_url;

    if (content) {
      documents.push(content);
      console.log(`Document from ${sourceFile}: ${content.substring(0, 100)}...`);
    }

    // Add unique sources
    if (!seenSources.has(sourceFile)) {
      seenSources.add(sourceFile);
      sources.push({ file: sourceFile, category, url: sourceUrl });
    }
  }

  console.log(`Retrieved ${documents.length} documents from ${sources.length} unique sources`);

  return { documents, sources };
}

// RAG Query function
async function ragQuery(
  userQuestion: string,
  conversationHistory: ConversationMessage[] = [],
  topK: number = 5,
  model: string = "gpt-4o-mini",
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

────────────────────────────
💬 CONVERSATION CONTEXT
- You have access to the previous conversation history.
- Use it to understand follow-up questions and maintain context.
- If the user refers to "it", "that", "they", etc., use conversation history to understand what they mean.

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
  console.log("Conversation history length:", conversationHistory.length);

  // Build messages array with conversation history
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add previous conversation history (exclude the current question which is already in userMessage)
  const previousMessages = conversationHistory.slice(0, -1);
  for (const msg of previousMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current user message with context
  messages.push({ role: "user", content: userMessage });

  // Call OpenAI
  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
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
    const { 
      message, 
      conversationHistory = [], 
      topK = 5, 
      model = "gpt-4o-mini", 
      temperature = 0.2, 
      maxTokens = 500 
    } = await req.json();

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
    console.log("Conversation history received:", conversationHistory.length, "messages");

    // Step 1: Detect URLs in the message
    const urls = extractUrls(message);
    const indexedUrls: { url: string; title: string; chunks: number }[] = [];

    // Step 2: If URLs found and Firecrawl is configured, index them
    if (urls.length > 0 && FIRECRAWL_API_KEY) {
      console.log(`Found ${urls.length} URL(s) in message:`, urls);
      
      for (const url of urls) {
        try {
          console.log(`Indexing URL: ${url}`);
          const result = await indexUrl(url);
          indexedUrls.push({ url, title: result.title, chunks: result.chunks });
          console.log(`Successfully indexed ${result.chunks} chunks from: ${result.title}`);
        } catch (error) {
          console.error(`Failed to index URL ${url}:`, error);
          // Continue with other URLs even if one fails
        }
      }
    } else if (urls.length > 0 && !FIRECRAWL_API_KEY) {
      console.log("URLs found but FIRECRAWL_API_KEY not configured, skipping indexing");
    }

    // Step 3: Perform RAG query (will now include newly indexed content)
    const { answer, sources } = await ragQuery(message, conversationHistory, topK, model, temperature, maxTokens);

    // Build response with indexing info if URLs were processed
    let responseText = answer;
    if (indexedUrls.length > 0) {
      const indexInfo = indexedUrls
        .map(u => `📎 Indexed: ${u.title} (${u.chunks} chunks)`)
        .join("\n");
      responseText = `${indexInfo}\n\n${answer}`;
    }

    return new Response(JSON.stringify({ response: responseText, sources, indexedUrls }), {
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
