import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Code2, Video, Zap, Users, ArrowRight } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LandingPage() {
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const createSession = async () => {
    setIsCreating(true);
    try {
      const response = await axios.post(`${API}/sessions`);
      const { session_id } = response.data;
      navigate(`/session/${session_id}`);
    } catch (error) {
      toast.error("Failed to create session");
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const joinSession = () => {
    if (!sessionCode.trim()) {
      toast.error("Please enter a session code");
      return;
    }
    setIsJoining(true);
    navigate(`/session/${sessionCode.trim()}`);
  };

  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Zero Latency",
      description: "Real-time character-by-character synchronization"
    },
    {
      icon: <Video className="w-6 h-6" />,
      title: "HD Video Chat",
      description: "Built-in peer-to-peer video communication"
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Pair Programming",
      description: "See cursors and selections in real-time"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0B0C10] relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1737505599162-d9932323a889?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRpZ2l0YWwlMjBuZXR3b3JrJTIwY29ubmVjdGlvbiUyMGRhcmt8ZW58MHx8fHwxNzY2NjYxNTc5fDA&ixlib=rb-4.1.0&q=85')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/80 to-transparent" />
      
      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30">
              <Code2 className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-['Space_Grotesk']">
              CodeSphere
            </h1>
          </div>
        </header>

        {/* Hero Section */}
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-8 animate-fade-in">
            <div className="space-y-2">
              <p className="uppercase tracking-[0.2em] text-xs font-bold text-cyan-400">
                Real-time Collaboration
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white font-['Space_Grotesk'] tracking-tight leading-none">
                Code Together,<br />
                <span className="text-cyan-400 glow-text">Anywhere.</span>
              </h2>
            </div>
            <p className="text-lg text-slate-300 max-w-xl leading-relaxed">
              The ultimate platform for remote pair programming, code reviews, 
              and technical interviews. Seamlessly integrate code editing with 
              real-time video chat.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                data-testid="create-session-btn"
                onClick={createSession}
                disabled={isCreating}
                className="bg-cyan-400 text-black hover:bg-cyan-300 font-bold uppercase tracking-wider rounded-sm shadow-[0_0_15px_rgba(102,252,241,0.4)] transition-all hover:scale-105 px-8 py-6 text-base"
              >
                {isCreating ? "Creating..." : "Create Session"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              
              <div className="flex gap-2">
                <Input
                  data-testid="session-code-input"
                  placeholder="Enter session code"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && joinSession()}
                  className="bg-black/20 border-white/10 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 rounded-sm text-white placeholder:text-slate-600 font-mono w-48"
                />
                <Button
                  data-testid="join-session-btn"
                  onClick={joinSession}
                  disabled={isJoining}
                  variant="outline"
                  className="bg-transparent border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 hover:border-cyan-400 rounded-sm px-6"
                >
                  Join
                </Button>
              </div>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="lg:col-span-5 space-y-4" style={{ animationDelay: '0.2s' }}>
            {features.map((feature, index) => (
              <Card 
                key={feature.title}
                data-testid={`feature-card-${index}`}
                className="bg-[#1F2833]/50 border border-white/5 rounded-lg backdrop-blur-sm hover:border-cyan-400/30 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${0.1 * (index + 1)}s` }}
              >
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-cyan-400/10 text-cyan-400">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1 font-['Space_Grotesk']">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {feature.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-20 pt-8 border-t border-white/5">
          <div className="flex flex-wrap justify-center gap-12 text-center text-slate-500 text-sm">
            <div>
              <span className="text-cyan-400 font-mono">Monaco Editor</span> powered
            </div>
            <div>
              <span className="text-cyan-400 font-mono">WebRTC</span> video
            </div>
            <div>
              <span className="text-cyan-400 font-mono">WebSocket</span> sync
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
