import { Bot } from "lucide-react";

const WelcomeMessage = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mb-6 shadow-glow">
        <Bot className="w-8 h-8 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        Hello 👋
      </h1>
      <p className="text-lg text-foreground mb-1">
        Welcome to Raya AI Assistant
      </p>
      <p className="text-muted-foreground max-w-md">
        How can I help you today? Ask me anything about our services, 
        get support, or explore what we can do together.
      </p>
    </div>
  );
};

export default WelcomeMessage;
