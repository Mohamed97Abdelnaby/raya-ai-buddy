import rayaLogo from "@/assets/raya-logo.png";

const ChatHeader = () => {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shadow-card">
      <div className="flex items-center gap-3">
        <img 
          src={rayaLogo} 
          alt="Raya Information Technology" 
          className="h-10 w-auto object-contain"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm text-muted-foreground">Online</span>
      </div>
    </header>
  );
};

export default ChatHeader;
