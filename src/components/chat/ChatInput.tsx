import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AttachmentInfo {
  name: string;
  content: string;
}

interface ChatInputProps {
  onSendMessage: (message: string, attachment?: AttachmentInfo) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSendMessage, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<AttachmentInfo | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachment) && !disabled) {
      onSendMessage(input.trim(), attachment || undefined);
      setInput("");
      setAttachment(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Check file type (text-based files)
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'application/xml',
      'text/xml',
    ];
    const allowedExtensions = ['.txt', '.md', '.json', '.csv', '.xml', '.log'];
    
    const isAllowedType = allowedTypes.includes(file.type) || 
      allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isAllowedType) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a text-based file (.txt, .md, .json, .csv, .xml)",
        variant: "destructive",
      });
      return;
    }

    try {
      const content = await file.text();
      setAttachment({
        name: file.name,
        content: content,
      });
      toast({
        title: "File attached",
        description: `${file.name} is ready to be indexed`,
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Could not read the file content",
        variant: "destructive",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border bg-card"
    >
      {/* Attachment preview */}
      {attachment && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
            <FileText className="h-4 w-4 text-secondary" />
            <span className="text-sm text-foreground flex-1 truncate">
              {attachment.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={removeAttachment}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex items-end gap-3 p-4">
        {/* File upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,.csv,.xml,.log"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="h-5 w-5" />
          <span className="sr-only">Attach file</span>
        </Button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachment ? "Add a message or send to index the file..." : "Type your message..."}
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          disabled={(!input.trim() && !attachment) || disabled}
          size="icon"
          className="h-11 w-11 rounded-full gradient-chat hover:opacity-90 transition-opacity shadow-card disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
};

export default ChatInput;
