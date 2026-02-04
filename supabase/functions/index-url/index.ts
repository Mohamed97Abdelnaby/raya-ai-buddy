import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const INDEX_HOST = "developer-quickstart-py-pcmqk4n.svc.aped-4627-b74a.pinecone.io";
const NAMESPACE = "example-namespace";
const MAX_CHUNK_BYTES = 40960; // 40,960 bytes per chunk

// Generate a UUID
function generateUUID(): string {
  return crypto.randomUUID();
}

// Extract domain name from URL for metadata
function extractDomainName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// Chunk text into segments of max bytes, respecting word boundaries
function chunkText(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  
  // Clean up EOF characters and normalize whitespace
  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  if (!cleanedText) {
    return [];
  }
  
  // Split by paragraphs first
  const paragraphs = cleanedText.split(/\n\n+/);
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    const paragraphWithBreak = paragraph + "\n\n";
    const encoder = new TextEncoder();
    
    // Check if adding this paragraph would exceed the limit
    const potentialChunk = currentChunk + paragraphWithBreak;
    const potentialBytes = encoder.encode(potentialChunk).length;
    
    if (potentialBytes <= maxBytes) {
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // If single paragraph is too large, split by sentences
      if (encoder.encode(paragraphWithBreak).length > maxBytes) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        currentChunk = "";
        
        for (const sentence of sentences) {
          const sentenceWithSpace = sentence + " ";
          const potentialSentenceChunk = currentChunk + sentenceWithSpace;
          
          if (encoder.encode(potentialSentenceChunk).length <= maxBytes) {
            currentChunk = potentialSentenceChunk;
          } else {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
            }
            
            // If single sentence is still too large, split by words
            if (encoder.encode(sentenceWithSpace).length > maxBytes) {
              const words = sentence.split(/\s+/);
              currentChunk = "";
              
              for (const word of words) {
                const wordWithSpace = word + " ";
                const potentialWordChunk = currentChunk + wordWithSpace;
                
                if (encoder.encode(potentialWordChunk).length <= maxBytes) {
                  currentChunk = potentialWordChunk;
                } else {
                  if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                  }
                  currentChunk = wordWithSpace;
                }
              }
            } else {
              currentChunk = sentenceWithSpace;
            }
          }
        }
      } else {
        currentChunk = paragraphWithBreak;
      }
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
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
  console.log("Firecrawl response success:", data.success);
  
  const content = data.data?.markdown || data.markdown || "";
  const title = data.data?.metadata?.title || data.metadata?.title || extractDomainName(url);
  
  return { content, title };
}

// Upload chunks to Pinecone using NDJSON format
async function uploadToPinecone(
  chunks: string[],
  sourceUrl: string,
  title: string
): Promise<{ success: boolean; recordCount: number }> {
  console.log(`Uploading ${chunks.length} chunks to Pinecone for: ${sourceUrl}`);
  
  const domainName = extractDomainName(sourceUrl);
  
  // Build NDJSON body
  const ndjsonLines: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const record = {
      _id: generateUUID(),
      chunk_text: chunks[i],
      category: "web_page",
      source_file: `${title} (${domainName})`,
      source_url: sourceUrl,
      chunk_index: i,
    };
    ndjsonLines.push(JSON.stringify(record));
  }
  
  const ndjsonBody = ndjsonLines.join("\n");
  
  console.log("Sending to Pinecone:", ndjsonLines.length, "records");
  
  const response = await fetch(
    `https://${INDEX_HOST}/records/namespaces/${NAMESPACE}/upsert`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "Api-Key": PINECONE_API_KEY!,
        "X-Pinecone-Api-Version": "2025-01",
      },
      body: ndjsonBody,
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Pinecone upsert error:", response.status, errorText);
    throw new Error(`Failed to upload to Pinecone: ${response.status}`);
  }
  
  const result = await response.json();
  console.log("Pinecone upsert result:", JSON.stringify(result));
  
  return { success: true, recordCount: chunks.length };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!FIRECRAWL_API_KEY) {
      console.error("FIRECRAWL_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Firecrawl API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!PINECONE_API_KEY) {
      console.error("PINECONE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Pinecone API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing URL:", url);

    // Step 1: Scrape the URL
    const { content, title } = await scrapeUrl(url);
    console.log(`Scraped content length: ${content.length} chars, title: ${title}`);

    if (!content || content.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No content could be extracted from the URL" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Chunk the content
    const chunks = chunkText(content, MAX_CHUNK_BYTES);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Could not create chunks from content" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Upload to Pinecone
    const result = await uploadToPinecone(chunks, url, title);

    return new Response(
      JSON.stringify({
        success: true,
        url: url,
        title: title,
        chunksIndexed: result.recordCount,
        message: `Successfully indexed ${result.recordCount} chunks from ${title}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in index-url function:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
