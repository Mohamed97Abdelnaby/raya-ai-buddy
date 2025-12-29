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
}

const FeedbackModal = ({ isOpen, onClose, onSubmit }: FeedbackModalProps) => {
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    onSubmit(comment);
    setComment("");
  };

  const handleClose = () => {
    setComment("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help us improve</DialogTitle>
          <DialogDescription>
            What was wrong with this response? Your feedback helps us provide better answers.
          </DialogDescription>
        </DialogHeader>
        
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Please describe what could be improved..."
          className="min-h-[100px] resize-none"
        />
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            className="gradient-chat text-primary-foreground"
          >
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
