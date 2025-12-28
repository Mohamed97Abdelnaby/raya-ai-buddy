import { useState, useCallback } from "react";
import { Message } from "@/components/chat/MessageBubble";

// Simulated AI response for demo purposes
// In production, this will be replaced with actual API call
const simulateAIResponse = async (userMessage: string): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const responses: Record<string, string> = {
    default: `Thank you for your message. I'm the Raya AI Assistant, here to help you with any questions about our services, IT solutions, and support.

Is there anything specific you'd like to know about Raya Information Technology?`,
    services: `Raya Information Technology offers a comprehensive range of services including:

• **Enterprise Solutions** - ERP, CRM, and business management systems
• **Cloud Services** - Migration, hosting, and cloud infrastructure
• **Cybersecurity** - Security assessments, monitoring, and protection
• **Digital Transformation** - AI, automation, and digital innovation
• **IT Infrastructure** - Network design, implementation, and management

Would you like to learn more about any specific service?`,
    ai: `AI can transform your business in many powerful ways:

• **Process Automation** - Reduce manual work and increase efficiency
• **Customer Service** - Implement intelligent chatbots and support systems
• **Data Analytics** - Gain insights from your data for better decisions
• **Predictive Maintenance** - Prevent issues before they occur
• **Personalization** - Deliver tailored experiences to your customers

At Raya IT, we help businesses implement AI solutions that drive real results. Would you like to discuss your specific needs?`,
    support: `You can reach our support team through multiple channels:

📧 **Email**: support@rayait.com
📞 **Phone**: +20 2 XXXX XXXX
🌐 **Website**: www.rayait.com

Our support team is available Sunday through Thursday, 9 AM to 5 PM (Cairo time).

Is there something specific I can help you with right now?`,
  };

  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("service") || lowerMessage.includes("offer")) {
    return responses.services;
  }
  if (lowerMessage.includes("ai") || lowerMessage.includes("artificial")) {
    return responses.ai;
  }
  if (lowerMessage.includes("support") || lowerMessage.includes("contact") || lowerMessage.includes("help")) {
    return responses.support;
  }

  return responses.default;
};

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await simulateAIResponse(content);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date(),
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
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
  };
};
