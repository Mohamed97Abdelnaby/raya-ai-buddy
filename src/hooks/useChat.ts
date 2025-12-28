import { useState, useCallback } from "react";
import { Message } from "@/components/chat/MessageBubble";
import { supabase } from "@/integrations/supabase/client";

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ingest a document into ChromaDB
  const ingestDocument = useCallback(async (id: string, text: string, file: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('rag-chat', {
        body: { type: 'ingest', id, text, file }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error ingesting document:", error);
      throw error;
    }
  }, []);

  // Send a message and get RAG-powered response
  const sendMessage = useCallback(async (content: string, attachment?: { name: string; content: string }) => {
    // If there's an attachment, ingest it first
    if (attachment) {
      const ingestMessage: Message = {
        id: `system-${Date.now()}`,
        role: "assistant",
        content: `📎 Indexing document: **${attachment.name}**...`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, ingestMessage]);

      try {
        await ingestDocument(
          `doc-${Date.now()}`,
          attachment.content,
          attachment.name
        );
        
        // Update the message to show success
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === ingestMessage.id 
              ? { ...msg, content: `✅ Document **${attachment.name}** has been indexed successfully. You can now ask questions about it.` }
              : msg
          )
        );
      } catch (error) {
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === ingestMessage.id 
              ? { ...msg, content: `❌ Failed to index document: ${error instanceof Error ? error.message : 'Unknown error'}` }
              : msg
          )
        );
        return;
      }
    }

    // If there's actual content (question), proceed with query
    if (!content.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('rag-chat', {
        body: { type: 'query', question: content }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error getting AI response:", error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "I apologize, but I'm having trouble processing your request. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [ingestDocument]);

  return {
    messages,
    isLoading,
    sendMessage,
    ingestDocument,
  };
};
