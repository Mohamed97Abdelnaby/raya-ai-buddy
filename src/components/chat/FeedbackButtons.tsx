import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { handleFeedback } from "@/lib/feedback";
import { useToast } from "@/hooks/use-toast";
import FeedbackModal from "./FeedbackModal";

interface FeedbackButtonsProps {
  messageId: string;
  messageContent: string;
  sources?: string[];
}

const FeedbackButtons = ({ messageId, messageContent, sources }: FeedbackButtonsProps) => {
  const [selectedRating, setSelectedRating] = useState<'positive' | 'negative' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const handlePositiveFeedback = async () => {
    if (selectedRating) return;
    
    setSelectedRating('positive');
    
    await handleFeedback({
      messageId,
      rating: 'positive',
      timestamp: new Date(),
      messageContent,
      sources,
    });

    toast({
      title: "Thank you!",
      description: "Your feedback helps us improve.",
      duration: 2000,
    });
  };

  const handleNegativeFeedback = () => {
    if (selectedRating) return;
    setIsModalOpen(true);
  };

  const handleNegativeSubmit = async (comment: string) => {
    setSelectedRating('negative');
    setIsModalOpen(false);

    await handleFeedback({
      messageId,
      rating: 'negative',
      comment,
      timestamp: new Date(),
      messageContent,
      sources,
    });

    toast({
      title: "Feedback received",
      description: "Thank you for helping us improve.",
      duration: 2000,
    });
  };

  return (
    <>
      <div className="flex items-center gap-1 mt-2">
        <button
          onClick={handlePositiveFeedback}
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
          onClick={handleNegativeFeedback}
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
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNegativeSubmit}
      />
    </>
  );
};

export default FeedbackButtons;
