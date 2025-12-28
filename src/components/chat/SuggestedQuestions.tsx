import { HelpCircle, Lightbulb, Settings, Users } from "lucide-react";

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void;
}

const suggestions = [
  {
    icon: HelpCircle,
    text: "What services does Raya IT offer?",
  },
  {
    icon: Lightbulb,
    text: "How can AI help my business?",
  },
  {
    icon: Settings,
    text: "Tell me about your IT solutions",
  },
  {
    icon: Users,
    text: "How can I contact support?",
  },
];

const SuggestedQuestions = ({ onSelectQuestion }: SuggestedQuestionsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelectQuestion(suggestion.text)}
          className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-accent transition-all duration-200 text-left group shadow-card"
        >
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-accent/30 transition-colors">
            <suggestion.icon className="w-5 h-5 text-secondary" />
          </div>
          <span className="text-sm text-foreground font-medium">
            {suggestion.text}
          </span>
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
