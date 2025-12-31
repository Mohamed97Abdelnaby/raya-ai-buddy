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
const MessageBubble = ({
  message,
  prompt
}: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const hasSources = !isUser && message.sources && message.sources.length > 0;
  return <div className={cn("flex gap-3 message-enter", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn("flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center", isUser ? "gradient-chat" : "bg-muted border border-border")}>
        {isUser ? <User className="w-4 h-4 text-primary-foreground" /> : <Bot className="w-4 h-4 text-secondary" />}
      </div>

      {/* Message Content */}
      <div className={cn("max-w-[75%] px-4 py-3 rounded-2xl", isUser ? "gradient-chat text-primary-foreground rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md shadow-card")}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        
        {/* Sources Section */}
        {hasSources}
        
        <p className={cn("text-xs mt-2", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {message.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}
        </p>
        
        {/* Feedback buttons for assistant messages */}
        {!isUser && <FeedbackButtons messageId={message.id} messageContent={message.content} prompt={prompt} sources={message.sources?.map(s => s.file)} />}
      </div>
    </div>;
};
export default MessageBubble;