import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHROMA_URL = Deno.env.get('CHROMA_URL')!;
const CHROMA_API_KEY = Deno.env.get('CHROMA_API_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const COLLECTION = "customer-support-messages";

// ChromaDB: Add document
async function addDocument(id: string, text: string, file: string) {
  console.log(`[ChromaDB] Adding document: ${id}, file: ${file}`);
  const url = `${CHROMA_URL}/v1/collections/${COLLECTION}/records`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHROMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids: [id],
      documents: [text],
      metadatas: [{ file }],
    }),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[ChromaDB] Error adding document: ${res.status} - ${errorText}`);
    throw new Error(`ChromaDB error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  console.log(`[ChromaDB] Document added successfully`);
  return data;
}

// ChromaDB: Query for relevant docs
async function chromaQuery(query: string) {
  console.log(`[ChromaDB] Querying: "${query}"`);
  const url = `${CHROMA_URL}/v1/collections/${COLLECTION}/query`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHROMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      query: [query], 
      n_results: 3 
    }),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[ChromaDB] Query error: ${res.status} - ${errorText}`);
    throw new Error(`ChromaDB query error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  console.log(`[ChromaDB] Query returned ${data.documents?.flat()?.length || 0} documents`);
  return data;
}

// OpenAI: Generate answer with context
async function askGPT(question: string, context: string) {
  console.log(`[OpenAI] Generating answer for question`);
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini-2025-04-14',
      messages: [
        { 
          role: 'system', 
          content: `You are a helpful Raya IT support assistant. Use the provided context to answer questions accurately. If the context doesn't contain relevant information, provide a helpful general response but mention that you're providing general guidance.` 
        },
        { 
          role: 'user', 
          content: context 
            ? `User question: ${question}\n\nRelevant context from documents:\n${context}`
            : question
        },
      ],
    }),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[OpenAI] Error: ${res.status} - ${errorText}`);
    throw new Error(`OpenAI error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  console.log(`[OpenAI] Response generated successfully`);
  return data.choices[0].message.content;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, id, text, file, question } = await req.json();
    console.log(`[RAG-Chat] Request type: ${type}`);

    if (type === 'ingest') {
      // Add document to ChromaDB
      if (!id || !text || !file) {
        return new Response(JSON.stringify({ error: 'Missing required fields: id, text, file' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      await addDocument(id, text, file);
      return new Response(JSON.stringify({ success: true, message: 'Document indexed successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'query') {
      // Query ChromaDB → Build context → Ask GPT
      if (!question) {
        return new Response(JSON.stringify({ error: 'Missing required field: question' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await chromaQuery(question);
      const docs = result.documents?.flat() || [];
      const meta = result.metadatas?.flat() || [];

      // Build context from retrieved documents
      let context = '';
      docs.forEach((d: string, i: number) => {
        if (d) {
          context += `SOURCE FILE: ${meta[i]?.file || 'Unknown'}\nCONTENT:\n${d}\n\n`;
        }
      });

      console.log(`[RAG-Chat] Built context from ${docs.filter(Boolean).length} documents`);

      const answer = await askGPT(question, context);
      const sources = meta.map((m: any) => m?.file).filter(Boolean);
      
      return new Response(JSON.stringify({ 
        answer,
        sources: [...new Set(sources)] // Remove duplicates
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid type. Use "ingest" or "query"' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RAG-Chat] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
