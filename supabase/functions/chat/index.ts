import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHROMA_API_KEY = Deno.env.get('CHROMA_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Chroma Cloud configuration
const CHROMA_TENANT = 'b2e97de6-2527-4abe-b487-f3ffb1ebe412';
const CHROMA_DATABASE = 'RagAgent';
const CHROMA_COLLECTION = 'customer-support-messages';

// Query Chroma Cloud for relevant documents
async function queryChroma(userQuestion: string, topK: number = 3): Promise<{ documents: string[], metadatas: any[] }> {
  console.log('Querying Chroma Cloud...');
  
  const chromaUrl = `https://api.trychroma.com/api/v2/tenants/${CHROMA_TENANT}/databases/${CHROMA_DATABASE}/collections/${CHROMA_COLLECTION}/query`;
  console.log('Chroma URL:', chromaUrl);
  
  const response = await fetch(chromaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHROMA_API_KEY}`,
    },
    body: JSON.stringify({
      query_texts: [userQuestion],
      n_results: topK,
      include: ['documents', 'metadatas']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Chroma query failed:', response.status, errorText);
    throw new Error(`Chroma query failed: ${response.status}`);
  }

  const results = await response.json();
  console.log('Chroma results:', JSON.stringify(results));
  
  return {
    documents: results.documents?.[0] || [],
    metadatas: results.metadatas?.[0] || []
  };
}

// RAG Query function
async function ragQuery(
  userQuestion: string, 
  topK: number = 3, 
  model: string = "gpt-3.5-turbo",
  temperature: number = 0.2,
  maxTokens: number = 500
): Promise<string> {
  
  let context = "";
  let retrievedDocs: string[] = [];
  let retrievedMetadata: any[] = [];

  // Try to get context from Chroma
  try {
    const chromaResults = await queryChroma(userQuestion, topK);
    retrievedDocs = chromaResults.documents;
    retrievedMetadata = chromaResults.metadatas;
    
    console.log('Retrieved documents:');
    for (let i = 0; i < retrievedDocs.length; i++) {
      const doc = retrievedDocs[i];
      const meta = retrievedMetadata[i];
      console.log(`File: ${meta?.file || 'Unknown'}`);
      console.log(`Content: ${doc}\n`);
    }
    
    context = retrievedDocs.join("\n");
  } catch (error) {
    console.error('Error querying Chroma, continuing without context:', error);
  }

  // Build prompt with context if available
  const prompt = context 
    ? `Use the following context to answer the question:\n${context}\n\nQuestion: ${userQuestion}`
    : userQuestion;

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
  
  return answer;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, topK = 3, model = "gpt-3.5-turbo", temperature = 0.2, maxTokens = 500 } = await req.json();

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

    console.log('Processing message:', message);
    
    const answer = await ragQuery(message, topK, model, temperature, maxTokens);
    
    console.log('Generated answer:', answer);

    return new Response(
      JSON.stringify({ response: answer }),
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
