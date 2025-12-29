import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeedbackPayload {
  messageId: string;
  rating: 'positive' | 'negative';
  comment?: string;
  timestamp: string;
  prompt?: string;
  response?: string;
  messageContent?: string;
  model?: string;
  sessionId?: string;
  sources?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WANDB_API_KEY = Deno.env.get('WANDB_API_KEY');
    
    if (!WANDB_API_KEY) {
      console.error('WANDB_API_KEY not configured');
      throw new Error('WandB API key not configured');
    }

    const feedback: FeedbackPayload = await req.json();
    console.log('Received feedback:', JSON.stringify(feedback));

    // WandB configuration - using wandb.init equivalent
    const entity = 'ahmed_wael-raya-it';
    const project = 'Raya Chatbot';
    
    // Generate a unique run ID for each feedback session or use a consistent one
    const runName = `feedback-${Date.now()}`;

    // Step 1: Create a new run using the correct GraphQL mutation
    // WandB uses 'modelName' for project, not 'projectName'
    const createRunResponse = await fetch('https://api.wandb.ai/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation UpsertBucket(
            $name: String,
            $project: String,
            $entity: String,
            $displayName: String,
            $config: JSONString
          ) {
            upsertBucket(input: {
              name: $name,
              modelName: $project,
              entityName: $entity,
              displayName: $displayName,
              config: $config
            }) {
              bucket {
                id
                name
                displayName
              }
              inserted
            }
          }
        `,
        variables: {
          entity: entity,
          project: project,
          name: runName,
          displayName: `Feedback ${feedback.rating}`,
          config: JSON.stringify({
            prompt: feedback.prompt || '',
            model: feedback.model || 'gpt-4.1-mini',
            rating: feedback.rating
          })
        }
      }),
    });

    const createRunResult = await createRunResponse.json();
    console.log('Create run result:', JSON.stringify(createRunResult));

    if (createRunResult.errors) {
      console.error('GraphQL errors:', JSON.stringify(createRunResult.errors));
      // Try alternative approach - log to summary
    }

    // Step 2: Log the feedback data
    const wandbPayload = {
      history: [{
        'prompt': feedback.prompt || '',
        'response': feedback.response || feedback.messageContent || '',
        'rating': feedback.rating === 'positive' ? 1 : 0,
        'rating_label': feedback.rating,
        'comment': feedback.comment || '',
        'model': feedback.model || 'gpt-4.1-mini',
        'session_id': feedback.sessionId || feedback.messageId,
        'message_id': feedback.messageId,
        'sources': JSON.stringify(feedback.sources || []),
        'timestamp': feedback.timestamp,
        '_timestamp': Date.now() / 1000
      }]
    };

    console.log('Sending to WandB:', JSON.stringify(wandbPayload));

    const wandbResponse = await fetch(
      `https://api.wandb.ai/files/${entity}/${encodeURIComponent(project)}/${runName}/file_stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wandbPayload),
      }
    );

    if (!wandbResponse.ok) {
      const errorText = await wandbResponse.text();
      console.error('WandB file_stream error:', wandbResponse.status, errorText);
    } else {
      console.log('Successfully logged feedback to WandB');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Feedback recorded' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing feedback:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});