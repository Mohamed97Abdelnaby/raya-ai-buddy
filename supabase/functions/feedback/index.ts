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

    // WandB configuration with correct entity and project
    const entity = 'ahmed_wael-raya-it-org';
    const project = 'Raya Chatbot';
    const runId = 'feedback-production';

    // Build the logging payload matching the required format
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

    // Use WandB's run API to log metrics
    const wandbResponse = await fetch(
      `https://api.wandb.ai/files/${entity}/${project}/${runId}/file_stream`,
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
      console.error('WandB API error:', wandbResponse.status, errorText);
      
      // If the run doesn't exist, try creating it first
      if (wandbResponse.status === 404) {
        console.log('Run not found, attempting to create...');
        
        // Create a new run using the correct mutation
        const createRunResponse = await fetch(
          `https://api.wandb.ai/graphql`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `
                mutation UpsertBucket($entity: String!, $project: String!, $name: String!) {
                  upsertBucket(input: {entityName: $entity, name: $name, projectName: $project}) {
                    bucket {
                      id
                      name
                    }
                  }
                }
              `,
              variables: {
                entity,
                project,
                name: runId
              }
            }),
          }
        );

        const createResult = await createRunResponse.text();
        console.log('Create run result:', createResult);

        // Retry logging
        const retryResponse = await fetch(
          `https://api.wandb.ai/files/${entity}/${project}/${runId}/file_stream`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(wandbPayload),
          }
        );

        if (!retryResponse.ok) {
          const retryError = await retryResponse.text();
          console.error('WandB retry error:', retryError);
          // Continue anyway - feedback was recorded in logs
        } else {
          console.log('Successfully logged to WandB on retry');
        }
      }
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
