import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { handleFeedback } from "@/lib/feedback";
import { useToast } from "@/hooks/use-toast";
import FeedbackModal from "./FeedbackModal";

interface FeedbackButtonsProps {
  messageId: string;
  messageContent: string;
  prompt?: string;
  sources?: string[];
}

const FeedbackButtons = ({ messageId, messageContent, prompt, sources }: FeedbackButtonsProps) => {
  const [selectedRating, setSelectedRating] = useState<'positive' | 'negative' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingRating, setPendingRating] = useState<'positive' | 'negative' | null>(null);
  const { toast } = useToast();

  const handleFeedbackClick = (rating: 'positive' | 'negative') => {
    if (selectedRating) return;
    setPendingRating(rating);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (comment: string) => {
    if (!pendingRating) return;
    
    setSelectedRating(pendingRating);
    setIsModalOpen(false);

    await handleFeedback({
      messageId,
      rating: pendingRating,
      comment: comment || undefined,
      timestamp: new Date(),
      messageContent,
      prompt,
      model: 'gpt-4.1-mini',
      sessionId: messageId.split('-')[0],
      sources,
    });

    toast({
      title: "Thank you!",
      description: "Your feedback helps us improve.",
      duration: 2000,
    });
    
    setPendingRating(null);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setPendingRating(null);
  };

  return (
    <>
      <div className="flex items-center gap-1 mt-2">
        <button
          onClick={() => handleFeedbackClick('positive')}
          disabled={selectedRating !== null}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200",
            "hover:bg-muted",
            selectedRating === 'positive'
              ? "text-primary"
              : "text-muted-foreground/40 hover:text-primary",
            selectedRating !== null && selectedRating !== 'positive' && "opacity-30"
          )}
          aria-label="Good response"
        >
          <ThumbsUp 
            className={cn(
              "w-3.5 h-3.5 transition-transform hover:scale-110",
              selectedRating === 'positive' && "fill-current"
            )} 
          />
        </button>
        <button
          onClick={() => handleFeedbackClick('negative')}
          disabled={selectedRating !== null}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200",
            "hover:bg-muted",
            selectedRating === 'negative'
              ? "text-destructive"
              : "text-muted-foreground/40 hover:text-destructive",
            selectedRating !== null && selectedRating !== 'negative' && "opacity-30"
          )}
          aria-label="Poor response"
        >
          <ThumbsDown 
            className={cn(
              "w-3.5 h-3.5 transition-transform hover:scale-110",
              selectedRating === 'negative' && "fill-current"
            )} 
          />
        </button>
      </div>

      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        rating={pendingRating}
      />
    </>
  );
};

export default FeedbackButtons;
