import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINECONE_URL = Deno.env.get("PINECONE_URL");
const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Relevance threshold - results below this score are ignored
const RELEVANCE_THRESHOLD = 0.4;

// RAG-bound system prompt
const SYSTEM_PROMPT = `You are a Retrieval-Augmented AI assistant. You must **only** answer questions using the content retrieved from the Knowledge Base (KB). 

- If the user's message is a greeting or a polite phrase such as: 

  "hello", "hi", "good morning", "good evening", "thanks", "thank you", "thanks a lot", "appreciate it"  

  → Respond naturally and politely, without requiring KB evidence.

- For any informational or factual question, you must **strictly** rely on retrieved KB content only.

- You are forbidden from inventing or assuming facts. **No hallucinations.**

- If retrieval scores are **below 0.7 threshold**, or the KB did not return relevant content:

  → Reply with: 

  "I'm sorry, I don't have enough information in my knowledge base to answer this."

Rules you must follow:

1️⃣ Never provide answers based on external knowledge or guessing.  

2️⃣ Never complete missing details on your own.  

3️⃣ Never cite or reference the KB itself — only answer normally using its content.  

4️⃣ If the input is not clearly a question or greeting, ask a clarification.  

Your mission is to be **accurate, safe, KB-bound, polite**, and **never hallucinate**.`;

interface PineconeMatch {
  id: string;
  score: number;
  metadata?: {
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

// Embed query using OpenAI text-embedding-3-large
async function embedQuery(query: string): Promise<number[]> {
  console.log("Embedding query with OpenAI text-embedding-3-large...");
  
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: query,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI embedding failed:", response.status, errorText);
    throw new Error(`OpenAI embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Query Pinecone for relevant documents
async function queryPinecone(
  userQuestion: string,
  topK: number = 5,
): Promise<{ documents: string[]; sources: Source[] }> {
  console.log("Querying Pinecone...", { userQuestion, topK });

  // First embed the query
  const queryEmbedding = await embedQuery(userQuestion);
  console.log("Query embedded, vector length:", queryEmbedding.length);

  const response = await fetch(
    "https://rag-pcmqk4n.svc.aped-4627-b74a.pinecone.io/records/namespaces/example-namespace/search",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": PINECONE_API_KEY!,
        "X-Pinecone-Api-Version": "unstable",
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        top_k: topK,
        include_metadata: true,
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

  // Extract documents and sources from Pinecone results (matches array with metadata)
  const matches = results.matches || [];

  for (const match of matches as PineconeMatch[]) {
    // Skip results below relevance threshold
    if (match.score < RELEVANCE_THRESHOLD) {
      console.log(`Skipping low-relevance result: score=${match.score.toFixed(3)} (threshold=${RELEVANCE_THRESHOLD})`);
      continue;
    }

    console.log(`Including result: score=${match.score.toFixed(3)}`);

    const metadata = match.metadata || {};
    const content = metadata.chunk_text || metadata.text || "";
    const sourceFile = metadata.source_file || "Unknown source";
    const category = metadata.category;

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

  console.log(`Retrieved ${documents.length} relevant documents above threshold (from ${matches.length} total matches)`);

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

    // // If no relevant documents found above threshold, return fallback without calling OpenAI
    // if (pineconeResults.documents.length === 0) {
    //   console.log('No relevant documents found above threshold - skipping OpenAI call');
    //   return {
    //     answer: "I apologize, but I don't have enough information in my knowledge base to answer this question accurately.",
    //     sources: []
    //   };
    // }

    context = pineconeResults.documents.join("\n\n");
    sources = pineconeResults.sources;

    console.log("Context length:", context.length);
    console.log("Sources:", JSON.stringify(sources));
  } catch (error) {
    console.error("Error querying Pinecone:", error);
    throw error; // Re-throw to prevent proceeding without valid context
  }

  // Call OpenAI with strict system prompt
  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Question: ${userQuestion}\n\nContext:\n${context}`,
        },
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
