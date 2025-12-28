import { Bot, User, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: string[];
}

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div
      className={cn(
        "flex gap-3 message-enter",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
          isUser 
            ? "gradient-chat" 
            : "bg-muted border border-border"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-secondary" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[75%] px-4 py-3 rounded-2xl",
          isUser
            ? "gradient-chat text-primary-foreground rounded-br-md"
            : "bg-card border border-border text-foreground rounded-bl-md shadow-card"
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        
        {/* Source citations */}
        {hasSources && (
          <div className="mt-3 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <FileText className="w-3 h-3" />
              <span>Sources:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {message.sources!.map((source, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary/10 text-secondary border border-secondary/20"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <p
          className={cn(
            "text-xs mt-2",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
};

export default MessageBubble;
