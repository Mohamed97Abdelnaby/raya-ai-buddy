import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Loader2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSendMessage, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadDocument, isUploading, uploadProgress } = useDocumentUpload();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled && !isUploading) {
      onSendMessage(input.trim());
      setInput("");
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

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";

    const result = await uploadDocument(file);
    if (result) {
      onSendMessage(`📄 I just uploaded "${result.fileName}" with ${result.sheetsProcessed} sheet(s). The document has been indexed and is ready for questions.`);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const isDisabled = disabled || isUploading;

  return (
    <div>
      {/* Upload progress banner */}
      {isUploading && uploadProgress && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground bg-muted/50 border-t border-border">
          <Loader2 className="h-4 w-4 animate-spin" />
          <FileSpreadsheet className="h-4 w-4" />
          <span>{uploadProgress}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-3 p-4 border-t border-border bg-card"
      >
        {/* File upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isDisabled}
          onClick={() => fileInputRef.current?.click()}
          className="h-11 w-11 rounded-full shrink-0"
          title="Upload Excel / CSV document"
        >
          <Paperclip className="h-5 w-5" />
          <span className="sr-only">Upload document</span>
        </Button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isUploading ? "Uploading document..." : "Type your message..."}
            disabled={isDisabled}
            rows={1}
            className="w-full resize-none rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          disabled={!input.trim() || isDisabled}
          size="icon"
          className="h-11 w-11 rounded-full gradient-chat hover:opacity-90 transition-opacity shadow-card disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </form>
    </div>
  );
};

export default ChatInput;
