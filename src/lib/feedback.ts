import { supabase } from "@/integrations/supabase/client";

export interface FeedbackData {
  messageId: string;
  rating: 'positive' | 'negative';
  comment?: string;
  timestamp: Date;
  messageContent?: string;
  sources?: string[];
}

/**
 * Handles user feedback by sending it to the backend edge function
 * which logs it to Weights & Biases (WandB)
 */
export const handleFeedback = async (feedback: FeedbackData): Promise<void> => {
  console.log('Submitting feedback to WandB:', feedback);
  
  const { data, error } = await supabase.functions.invoke('feedback', {
    body: {
      ...feedback,
      timestamp: feedback.timestamp.toISOString(),
    }
  });

  if (error) {
    console.error('Failed to submit feedback:', error);
    throw error;
  }

  console.log('Feedback submitted successfully:', data);
};
