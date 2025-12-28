import { Bot } from "lucide-react";

const TypingIndicator = () => {
  return (
    <div className="flex gap-3 message-enter">
      {/* Avatar */}
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center">
        <Bot className="w-4 h-4 text-secondary" />
      </div>

      {/* Typing dots */}
      <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-card">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-secondary typing-dot" />
          <div className="w-2 h-2 rounded-full bg-secondary typing-dot" />
          <div className="w-2 h-2 rounded-full bg-secondary typing-dot" />
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
