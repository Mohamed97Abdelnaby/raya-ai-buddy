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
  messageContent?: string;
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

    // WandB configuration - using default entity and project
    const entity = 'default';
    const project = 'raya-feedback';
    const runId = 'raya-feedback-production';

    // Log to WandB using their API
    // First, we need to ensure the run exists or create it
    const wandbPayload = {
      history: [{
        'feedback/rating': feedback.rating === 'positive' ? 1 : 0,
        'feedback/rating_label': feedback.rating,
        'feedback/comment': feedback.comment || '',
        'feedback/message_id': feedback.messageId,
        'feedback/message_content': feedback.messageContent || '',
        'feedback/sources': JSON.stringify(feedback.sources || []),
        'feedback/timestamp': feedback.timestamp,
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
        
        // Create a new run
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
                  upsertBucket(input: {entityName: $entity, projectName: $project, name: $name}) {
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
