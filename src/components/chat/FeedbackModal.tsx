import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  rating?: 'positive' | 'negative' | null;
}

const FeedbackModal = ({ isOpen, onClose, onSubmit, rating }: FeedbackModalProps) => {
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    onSubmit(comment);
    setComment("");
  };

  const handleClose = () => {
    setComment("");
    onClose();
  };

  const isPositive = rating === 'positive';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPositive ? "Thanks for the feedback!" : "Help us improve"}</DialogTitle>
          <DialogDescription>
            {isPositive 
              ? "Want to add a note about what you liked? (Optional)"
              : "What could be improved? Your feedback helps us provide better answers. (Optional)"
            }
          </DialogDescription>
        </DialogHeader>
        
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={isPositive ? "What did you like about this response?" : "Please describe what could be improved..."}
          className="min-h-[100px] resize-none"
        />
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSubmit}>
            Skip
          </Button>
          <Button 
            onClick={handleSubmit}
            className="gradient-chat text-primary-foreground"
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
