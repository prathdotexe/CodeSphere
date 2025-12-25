import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { toast } from "sonner";
import {
  Code2, Video, VideoOff, Mic, MicOff, Share2, Users,
  Copy, Settings, LogOut, ChevronLeft, ChevronRight
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace(/^https?/, 'wss');

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
];

const DEFAULT_CODE = `// Welcome to CodeSphere! 🚀
// Start coding collaboratively

function greet(name) {
  return \`Hello, \${name}! Welcome to the session.\`;
}

console.log(greet('Developer'));
`;

export default function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const wsRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const isRemoteChangeRef = useRef(false);

  const [code, setCode] = useState(DEFAULT_CODE);
  const [language, setLanguage] = useState("javascript");
  const [participants, setParticipants] = useState([]);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);
  const [username] = useState(() => `User ${Math.floor(Math.random() * 1000)}`);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws/${sessionId}/${userId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      toast.success("Connected to session");
      // Send initial join message
      ws.send(JSON.stringify({
        type: "join",
        userId,
        username,
        sessionId
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      toast.error("Disconnected from session");
    };

    ws.onerror = () => {
      toast.error("Connection error");
    };

    return () => {
      ws.close();
      cleanupMedia();
    };
  }, [sessionId, userId, username]);

  const handleWebSocketMessage = useCallback((data) => {
    switch (data.type) {
      case "code_change":
        if (data.userId !== userId && editorRef.current) {
          isRemoteChangeRef.current = true;
          setCode(data.code);
          setTimeout(() => { isRemoteChangeRef.current = false; }, 50);
        }
        break;
      case "language_change":
        if (data.userId !== userId) {
          setLanguage(data.language);
        }
        break;
      case "participants_update":
        setParticipants(data.participants || []);
        break;
      case "session_state":
        if (data.code) {
          isRemoteChangeRef.current = true;
          setCode(data.code);
          setTimeout(() => { isRemoteChangeRef.current = false; }, 50);
        }
        if (data.language) setLanguage(data.language);
        if (data.participants) setParticipants(data.participants);
        break;
      case "webrtc_offer":
        handleOffer(data);
        break;
      case "webrtc_answer":
        handleAnswer(data);
        break;
      case "webrtc_ice":
        handleIceCandidate(data);
        break;
      case "user_joined":
        toast.info(`${data.username || 'Someone'} joined`);
        break;
      case "user_left":
        toast.info(`${data.username || 'Someone'} left`);
        break;
      default:
        break;
    }
  }, [userId]);

  // Handle code changes
  const handleEditorChange = (value) => {
    if (isRemoteChangeRef.current) return;
    setCode(value);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "code_change",
        code: value,
        userId,
        sessionId
      }));
    }
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "language_change",
        language: newLanguage,
        userId,
        sessionId
      }));
    }
  };

  // WebRTC functions
  const initWebRTC = async () => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    peerConnectionRef.current = new RTCPeerConnection(config);

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "webrtc_ice",
          candidate: event.candidate,
          userId,
          sessionId
        }));
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    return peerConnectionRef.current;
  };

  const toggleVideo = async () => {
    try {
      if (isVideoOn) {
        localStreamRef.current?.getVideoTracks().forEach(track => track.stop());
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setIsVideoOn(false);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: isAudioOn });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setIsVideoOn(true);

        // Setup WebRTC if not already
        if (!peerConnectionRef.current) {
          await initWebRTC();
        }
        stream.getTracks().forEach(track => {
          peerConnectionRef.current?.addTrack(track, stream);
        });

        // Create offer
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({
          type: "webrtc_offer",
          offer,
          userId,
          sessionId
        }));
      }
    } catch (err) {
      toast.error("Failed to access camera");
      console.error(err);
    }
  };

  const toggleAudio = async () => {
    try {
      if (isAudioOn) {
        localStreamRef.current?.getAudioTracks().forEach(track => track.stop());
        setIsAudioOn(false);
      } else {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
        } else {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getAudioTracks().forEach(track => {
            localStreamRef.current.addTrack(track);
          });
        }
        setIsAudioOn(true);
      }
    } catch (err) {
      toast.error("Failed to access microphone");
      console.error(err);
    }
  };

  const handleOffer = async (data) => {
    if (!peerConnectionRef.current) await initWebRTC();
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({
      type: "webrtc_answer",
      answer,
      userId,
      sessionId
    }));
  };

  const handleAnswer = async (data) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data) => {
    if (peerConnectionRef.current && data.candidate) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const cleanupMedia = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
  };

  const copySessionLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    toast.success("Session link copied!");
  };

  const leaveSession = () => {
    cleanupMedia();
    navigate("/");
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div data-testid="session-page" className="h-screen bg-[#0B0C10] grid grid-cols-12 overflow-hidden">
      {/* Sidebar */}
      <div className="col-span-2 border-r border-white/5 bg-[#0B0C10] flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-cyan-400/10 border border-cyan-400/30">
              <Code2 className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="font-bold text-white font-['Space_Grotesk']">CodeSphere</span>
          </div>
        </div>

        {/* Session Info */}
        <div className="p-4 border-b border-white/5">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Session</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-cyan-400 font-mono bg-cyan-400/10 px-2 py-1 rounded truncate flex-1" data-testid="session-id">
              {sessionId}
            </code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-testid="copy-link-btn"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-white"
                    onClick={copySessionLink}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy invite link</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Connection Status */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-xs text-slate-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Participants */}
        <div className="p-4 flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-slate-500" />
            <p className="text-xs uppercase tracking-wider text-slate-500">Participants</p>
          </div>
          <div className="space-y-2" data-testid="participants-list">
            <div className="flex items-center gap-2 p-2 rounded bg-white/5">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm text-white truncate">{username} (You)</span>
            </div>
            {participants.filter(p => p.userId !== userId).map((p) => (
              <div key={p.userId} className="flex items-center gap-2 p-2 rounded bg-white/5">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-sm text-slate-300 truncate">{p.username}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leave Button */}
        <div className="p-4 border-t border-white/5">
          <Button
            data-testid="leave-session-btn"
            variant="ghost"
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10"
            onClick={leaveSession}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Leave Session
          </Button>
        </div>
      </div>

      {/* Editor Area */}
      <div className={`${isPanelOpen ? 'col-span-8' : 'col-span-10'} flex flex-col relative transition-all`}>
        {/* Editor Header */}
        <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#0B0C10]">
          <div className="flex items-center gap-4">
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger data-testid="language-select" className="w-36 h-8 bg-black/20 border-white/10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1F2833] border-white/10">
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.value} value={lang.value} className="text-slate-300">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="share-btn"
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
              onClick={copySessionLink}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 monaco-container" data-testid="code-editor">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              padding: { top: 16 },
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      {/* Video Panel */}
      <div className={`${isPanelOpen ? 'col-span-2' : 'col-span-0 hidden'} border-l border-white/5 bg-[#0B0C10] flex flex-col transition-all`}>
        {/* Panel Toggle */}
        <Button
          data-testid="toggle-panel-btn"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-12 w-6 bg-[#1F2833] border border-white/10 rounded-l-lg rounded-r-none text-slate-400 hover:text-white"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          style={{ right: isPanelOpen ? 'calc(16.666% - 1px)' : '-1px' }}
        >
          {isPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>

        {/* Video Header */}
        <div className="p-4 border-b border-white/5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Video Chat</p>
        </div>

        {/* Video Streams */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Local Video */}
          <div className="relative">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full aspect-[4/3] rounded-lg bg-[#1F2833] object-cover"
              data-testid="local-video"
            />
            {!isVideoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1F2833] rounded-lg">
                <VideoOff className="w-8 h-8 text-slate-600" />
              </div>
            )}
            <span className="absolute bottom-2 left-2 text-xs bg-black/50 px-2 py-1 rounded text-white">
              You
            </span>
          </div>

          {/* Remote Video */}
          <div className="relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full aspect-[4/3] rounded-lg bg-[#1F2833] object-cover"
              data-testid="remote-video"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-[#1F2833] rounded-lg">
              <Users className="w-8 h-8 text-slate-600" />
            </div>
            <span className="absolute bottom-2 left-2 text-xs bg-black/50 px-2 py-1 rounded text-white">
              Remote
            </span>
          </div>
        </div>

        {/* Video Controls */}
        <div className="p-4 border-t border-white/5">
          <div className="flex justify-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-testid="toggle-video-btn"
                    variant={isVideoOn ? "default" : "secondary"}
                    size="icon"
                    className={`rounded-full ${isVideoOn ? 'bg-cyan-400 text-black hover:bg-cyan-300' : 'bg-[#1F2833] text-slate-400 hover:bg-[#2a3544]'}`}
                    onClick={toggleVideo}
                  >
                    {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isVideoOn ? 'Turn off camera' : 'Turn on camera'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-testid="toggle-audio-btn"
                    variant={isAudioOn ? "default" : "secondary"}
                    size="icon"
                    className={`rounded-full ${isAudioOn ? 'bg-cyan-400 text-black hover:bg-cyan-300' : 'bg-[#1F2833] text-slate-400 hover:bg-[#2a3544]'}`}
                    onClick={toggleAudio}
                  >
                    {isAudioOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isAudioOn ? 'Mute' : 'Unmute'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
