import { Bot, User, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import FeedbackButtons from "./FeedbackButtons";

export interface Source {
  file: string;
  category?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Source[];
}

interface MessageBubbleProps {
  message: Message;
  prompt?: string;
}

const MessageBubble = ({ message, prompt }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const hasSources = !isUser && message.sources && message.sources.length > 0;

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
        
        {/* Sources Section */}
        {hasSources && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <FileText className="w-3 h-3" />
              <span className="font-medium">Sources:</span>
            </div>
            <ul className="space-y-1">
              {message.sources!.map((source, index) => (
                <li 
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-1.5"
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span className="break-all">
                    {source.file}
                    {source.category && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-muted rounded text-[10px]">
                        {source.category}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
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
        
        {/* Feedback buttons for assistant messages */}
        {!isUser && (
          <FeedbackButtons
            messageId={message.id}
            messageContent={message.content}
            prompt={prompt}
            sources={message.sources?.map(s => s.file)}
          />
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
