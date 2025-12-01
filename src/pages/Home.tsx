import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center p-4 pt-20">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-5xl md:text-6xl font-heading font-bold mb-4 bg-clip-text text-transparent gradient-primary">
            Business Updates Hub
          </h1>
          <p className="text-lg text-muted-foreground">
            Streamline your business communication with AI-powered insights
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150">
          <div className="group">
            <button
              onClick={() => navigate("/admin")}
              className="w-full bg-card hover:shadow-glow shadow-soft rounded-2xl p-8 border border-border transition-smooth hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-full gradient-primary shadow-glow">
                  <Shield className="h-12 w-12 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-heading font-bold">Admin Panel</h2>
                <p className="text-muted-foreground">
                  Add and manage daily business updates with ease
                </p>
              </div>
            </button>
          </div>

          <div className="group">
            <button
              onClick={() => navigate("/ask")}
              className="w-full bg-card hover:shadow-glow shadow-soft rounded-2xl p-8 border border-border transition-smooth hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-full bg-secondary shadow-glow">
                  <MessageSquare className="h-12 w-12 text-secondary-foreground" />
                </div>
                <h2 className="text-2xl font-heading font-bold">Ask the Bot</h2>
                <p className="text-muted-foreground">
                  Get instant answers from stored business updates
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
