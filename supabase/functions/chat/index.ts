import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PINECONE_URL = Deno.env.get('PINECONE_URL');
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Relevance threshold - results below this score are ignored
const RELEVANCE_THRESHOLD = 0.7;

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
async function queryPinecone(userQuestion: string, topK: number = 5): Promise<{ documents: string[], sources: Source[] }> {
  console.log('Querying Pinecone...', { userQuestion, topK });
  
  const response = await fetch('https://developer-quickstart-py-pcmqk4n.svc.aped-4627-b74a.pinecone.io/records/namespaces/example-namespace/search', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY!,
      'X-Pinecone-Api-Version': 'unstable',
    },
    body: JSON.stringify({
      query: {
        inputs: { text: userQuestion },
        top_k: topK
      },
      fields: ["category", "chunk_text", "source_file", "text"]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Pinecone query failed:', response.status, errorText);
    throw new Error(`Pinecone query failed: ${response.status}`);
  }

  const results = await response.json();
  console.log('Pinecone raw results:', JSON.stringify(results));
  
  const documents: string[] = [];
  const sources: Source[] = [];
  const seenSources = new Set<string>();

  // Extract documents and sources from Pinecone results
  const hits = results.result?.hits || results.hits || [];
  
  for (const hit of hits as PineconeResult[]) {
    // Skip results below relevance threshold
    if (hit._score < RELEVANCE_THRESHOLD) {
      console.log(`Skipping low-relevance result: score=${hit._score.toFixed(3)} (threshold=${RELEVANCE_THRESHOLD})`);
      continue;
    }

    console.log(`Including result: score=${hit._score.toFixed(3)}`);

    const fields = hit.fields || {};
    const content = fields.chunk_text || fields.text || '';
    const sourceFile = fields.source_file || 'Unknown source';
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

  console.log(`Retrieved ${documents.length} relevant documents above threshold (from ${hits.length} total hits)`);
  
  return { documents, sources };
}

// RAG Query function
async function ragQuery(
  userQuestion: string, 
  topK: number = 5, 
  model: string = "gpt-3.5-turbo",
  temperature: number = 0.2,
  maxTokens: number = 500
): Promise<{ answer: string; sources: Source[] }> {
  
  let context = "";
  let sources: Source[] = [];

  // Try to get context from Pinecone
  try {
    const pineconeResults = await queryPinecone(userQuestion, topK);
    
    // If no relevant documents found above threshold, return fallback without calling OpenAI
    if (pineconeResults.documents.length === 0) {
      console.log('No relevant documents found above threshold - skipping OpenAI call');
      return { 
        answer: "I apologize, but I don't have enough information in my knowledge base to answer this question accurately.",
        sources: [] 
      };
    }
    
    context = pineconeResults.documents.join("\n\n");
    sources = pineconeResults.sources;
    
    console.log('Context length:', context.length);
    console.log('Sources:', JSON.stringify(sources));
  } catch (error) {
    console.error('Error querying Pinecone:', error);
    throw error; // Re-throw to prevent proceeding without valid context
  }

  // Build prompt with context
  const prompt = `Use the following context to answer the question. Be specific and cite information from the context when possible:\n\n${context}\n\nQuestion: ${userQuestion}`;

  // Call OpenAI
  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { 
          role: 'system', 
          content: 'You are Raya AI Assistant, an expert assistant for Raya IT company. Provide clear, helpful, and professional answers. If context is provided, use it to give accurate responses. Be friendly and supportive.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    console.error('OpenAI API error:', openaiResponse.status, errorText);
    throw new Error(`OpenAI API error: ${openaiResponse.status}`);
  }

  const data = await openaiResponse.json();
  const answer = data.choices[0].message.content;
  
  console.log('Generated answer:', answer);
  console.log('Returning sources:', JSON.stringify(sources));
  
  return { answer, sources };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, topK = 5, model = "gpt-3.5-turbo", temperature = 0.2, maxTokens = 500 } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!PINECONE_URL || !PINECONE_API_KEY) {
      console.error('Pinecone configuration missing');
      return new Response(
        JSON.stringify({ error: 'Pinecone not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing message:', message);
    
    const { answer, sources } = await ragQuery(message, topK, model, temperature, maxTokens);

    return new Response(
      JSON.stringify({ response: answer, sources }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
