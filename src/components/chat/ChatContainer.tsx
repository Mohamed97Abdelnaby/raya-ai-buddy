import { useRef, useEffect } from "react";
import ChatHeader from "./ChatHeader";
import WelcomeMessage from "./WelcomeMessage";
import MessageBubble, { Message } from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import SuggestedQuestions from "./SuggestedQuestions";

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

const ChatContainer = ({ messages, isLoading, onSendMessage }: ChatContainerProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const hasMessages = messages.length > 0;

  // Find the previous user message for each assistant message
  const getPreviousUserMessage = (index: number): string | undefined => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return undefined;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto chat-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {!hasMessages && (
            <>
              <WelcomeMessage />
              <SuggestedQuestions onSelectQuestion={onSendMessage} />
            </>
          )}

          {hasMessages && (
            <div className="space-y-6">
              {messages.map((message, index) => (
                <MessageBubble 
                  key={message.id} 
                  message={message}
                  prompt={message.role === 'assistant' ? getPreviousUserMessage(index) : undefined}
                />
              ))}
              {isLoading && <TypingIndicator />}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="max-w-3xl mx-auto w-full">
        <ChatInput onSendMessage={onSendMessage} disabled={isLoading} />
      </div>
    </div>
  );
};

export default ChatContainer;
