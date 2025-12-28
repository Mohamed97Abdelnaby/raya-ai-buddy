import ChatContainer from "@/components/chat/ChatContainer";
import { useChat } from "@/hooks/useChat";

const Index = () => {
  const { messages, isLoading, sendMessage } = useChat();

  return (
    <ChatContainer
      messages={messages}
      isLoading={isLoading}
      onSendMessage={sendMessage}
    />
  );
};

export default Index;
