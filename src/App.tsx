import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Heart, User, Sparkles, Code, Globe, 
  Mic, MicOff, Volume2, VolumeX, Play, 
  Copy, MoreVertical, Trash2, ChevronLeft,
  Image as ImageIcon, Terminal, Zap
} from 'lucide-react';
import { aiService } from './services/aiService';
import { AppMode, Message, CodeSnippet } from './types';
import { CodeRunner } from './components/CodeRunner';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [histories, setHistories] = useState<Record<AppMode, Message[]>>({
    GENERAL: [],
    WEB_APP: [],
    MYRA: []
  });
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [activeSnippetId, setActiveSnippetId] = useState<string | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [histories, mode]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleSend(undefined, transcript);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
    }
  }, [mode]);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  };

  const playResponse = async (text: string) => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (e) {}
    }

    // Stop listening while AI is speaking to prevent self-echo
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    setIsSpeaking(true);
    try {
      const base64Audio = await aiService.generateSpeech(text, mode || 'GENERAL');
      if (base64Audio) {
        const audioContext = getAudioContext();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const audioBuffer = audioContext.createBuffer(1, len / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        const dataView = new DataView(bytes.buffer);
        for (let i = 0; i < len / 2; i++) channelData[i] = dataView.getInt16(i * 2, true) / 32768;
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = mode === 'MYRA' ? 1.15 : 1.05;
        source.connect(audioContext.destination);
        source.onended = () => {
          setIsSpeaking(false);
          if (isVoiceMode) toggleListening();
        };
        currentSourceRef.current = source;
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error(error);
      setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSend = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault();
    const finalInput = textOverride || input;
    if (!finalInput.trim() || isLoading || !mode) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: finalInput,
      sender: 'user',
      timestamp: new Date()
    };

    setHistories(prev => ({
      ...prev,
      [mode]: [...prev[mode], userMsg]
    }));
    setInput('');
    setIsLoading(true);

    try {
      // Check for image generation request in GENERAL mode
      if (mode === 'GENERAL' && (finalInput.toLowerCase().includes('image') || finalInput.toLowerCase().includes('bnao'))) {
        const imageUrl = await aiService.generateImage(finalInput);
        if (imageUrl) {
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            text: "Ye rahi aapki image!",
            sender: 'ai',
            timestamp: new Date(),
            type: 'image',
            imageUrl
          };
          setHistories(prev => ({ ...prev, [mode]: [...prev[mode], aiMsg] }));
          if (isVoiceMode) playResponse("Ye rahi aapki image!");
          setIsLoading(false);
          return;
        }
      }

      const response = await aiService.sendMessage(mode, finalInput);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text || '...',
        sender: 'ai',
        timestamp: new Date()
      };

      // Extract code for WEB_APP mode
      if (mode === 'WEB_APP') {
        const codeMatch = response.text.match(/```html([\s\S]*?)```/) || response.text.match(/```([\s\S]*?)```/);
        if (codeMatch) {
          aiMsg.type = 'code';
          aiMsg.code = codeMatch[1].trim();
          const newSnippet: CodeSnippet = {
            id: Date.now().toString(),
            name: `Snippet ${snippets.length + 1}`,
            html: aiMsg.code,
            timestamp: new Date()
          };
          setSnippets(prev => [newSnippet, ...prev]);
          setActiveSnippetId(newSnippet.id);
          setShowCodePanel(true);
        }
      }

      setHistories(prev => ({
        ...prev,
        [mode]: [...prev[mode], aiMsg]
      }));

      if (isVoiceMode || isSpeaking) {
        playResponse(aiMsg.text);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!mode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans overflow-hidden relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-600/20 rounded-full blur-[128px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 relative z-10"
        >
          <h1 className="text-6xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-white to-rose-400">
            AI Universe
          </h1>
          <p className="text-slate-400 text-lg">Select your assistant to begin</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl relative z-10">
          {[
            { id: 'GENERAL', name: 'GENERAL', icon: Globe, color: 'from-blue-500 to-indigo-600', desc: 'Versatile assistant for everything' },
            { id: 'WEB_APP', name: 'WEB & APP', icon: Code, color: 'from-emerald-500 to-teal-600', desc: 'Code, preview and build apps' },
            { id: 'MYRA', name: 'MYRA', icon: Heart, color: 'from-rose-500 to-pink-600', desc: 'Your affectionate companion' }
          ].map((item, idx) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              onClick={() => setMode(item.id as AppMode)}
              className="group relative p-8 rounded-3xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all text-left"
            >
              <div className={cn("w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-6 shadow-lg", item.color)}>
                <item.icon className="text-white" size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-2">{item.name}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Zap size={20} className="text-indigo-400" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  const activeSnippet = snippets.find(s => s.id === activeSnippetId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar for WEB_APP snippets */}
      <AnimatePresence>
        {mode === 'WEB_APP' && showCodePanel && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-72 border-r border-slate-800 bg-slate-900/50 flex flex-col"
          >
            <div className="p-4 border-bottom border-slate-800 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <Terminal size={18} /> Snippets
              </h2>
              <button onClick={() => setShowCodePanel(false)} className="p-1 hover:bg-slate-800 rounded">
                <ChevronLeft size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {snippets.map(s => (
                <div key={s.id} className="group relative">
                  <button
                    onClick={() => setActiveSnippetId(s.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all text-sm pr-10",
                      activeSnippetId === s.id ? "bg-indigo-600 text-white" : "hover:bg-slate-800 text-slate-400"
                    )}
                  >
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-[10px] opacity-50 mt-1">{s.timestamp.toLocaleTimeString()}</div>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(s.name.toLowerCase().replace(/\s+/g, '-') + '.html');
                      alert(`Reference '${s.name.toLowerCase().replace(/\s+/g, '-') + '.html'}' copied! Use this in your code to link.`);
                    }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-indigo-500/20 text-indigo-400 rounded transition-all"
                    title="Copy Link Reference"
                  >
                    <Copy size={14} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSnippets(prev => prev.filter(snip => snip.id !== s.id));
                      if (activeSnippetId === s.id) setActiveSnippetId(null);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-rose-400 rounded transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {snippets.length === 0 && (
                <div className="text-center py-10 text-slate-600 text-sm italic">
                  No snippets yet. Ask WEB & APP assistant to create something!
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMode(null)}
              className="p-2 hover:bg-slate-900 rounded-full text-slate-400 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              {mode === 'GENERAL' && <Globe className="text-blue-400" size={20} />}
              {mode === 'WEB_APP' && <Code className="text-emerald-400" size={20} />}
              {mode === 'MYRA' && <Heart className="text-rose-400" size={20} />}
              <h1 className="font-bold tracking-tight">{mode} Assistant</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (confirm("Clear chat history for this mode?")) {
                  setHistories(prev => ({ ...prev, [mode]: [] }));
                }
              }}
              className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 transition-colors"
              title="Clear Chat"
            >
              <Trash2 size={20} />
            </button>
            {mode === 'WEB_APP' && (
              <button 
                onClick={() => setShowCodePanel(!showCodePanel)}
                className={cn("p-2 rounded-lg transition-all", showCodePanel ? "bg-emerald-600 text-white" : "hover:bg-slate-900 text-slate-400")}
              >
                <Terminal size={20} />
              </button>
            )}
            {isSpeaking && (
              <button 
                onClick={() => {
                  if (currentSourceRef.current) {
                    try { currentSourceRef.current.stop(); } catch (e) {}
                    setIsSpeaking(false);
                  }
                }}
                className="p-2 bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all animate-pulse"
                title="Stop Speaking"
              >
                <VolumeX size={20} />
              </button>
            )}
            <button 
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-medium",
                isVoiceMode ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
              )}
            >
              {isVoiceMode ? <Mic size={16} /> : <MicOff size={16} />}
              {isVoiceMode ? "Voice Active" : "Voice Off"}
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 flex overflow-hidden">
          <div className={cn("flex-1 flex flex-col transition-all", mode === 'WEB_APP' && activeSnippet ? "w-1/2" : "w-full")}>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {histories[mode].map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex w-full gap-4", msg.sender === 'user' ? "flex-row-reverse" : "flex-row")}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg",
                    msg.sender === 'user' ? "bg-indigo-600" : "bg-slate-800"
                  )}>
                    {msg.sender === 'user' ? <User size={20} /> : <Sparkles size={20} className="text-indigo-400" />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] space-y-2",
                    msg.sender === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-5 py-3 rounded-3xl text-[15px] leading-relaxed shadow-sm",
                      msg.sender === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-900 border border-slate-800 rounded-tl-none"
                    )}>
                      {msg.type === 'image' ? (
                        <div className="space-y-3">
                          <p>{msg.text}</p>
                          <img src={msg.imageUrl} alt="AI Generated" className="rounded-xl w-full max-w-sm border border-slate-700 shadow-2xl" />
                        </div>
                      ) : msg.type === 'code' ? (
                        <div className="space-y-3">
                          <p>Maine aapke liye ye code banaya hai:</p>
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                            <pre>{msg.code}</pre>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(msg.code || '');
                                alert("Code copied!");
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition-colors"
                            >
                              <Copy size={14} /> Copy
                            </button>
                            <button 
                              onClick={() => {
                                const newSnippet: CodeSnippet = {
                                  id: Date.now().toString(),
                                  name: `Snippet ${snippets.length + 1}`,
                                  html: msg.code || '',
                                  timestamp: new Date()
                                };
                                setSnippets(prev => [newSnippet, ...prev]);
                                setActiveSnippetId(newSnippet.id);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs transition-colors"
                            >
                              <Play size={14} /> Run
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p>{msg.text}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-2">
                      <span className="text-[10px] text-slate-500">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.sender === 'ai' && (
                        <button 
                          onClick={() => playResponse(msg.text)}
                          className="p-1 hover:bg-slate-800 rounded-full text-slate-500 hover:text-indigo-400 transition-colors"
                        >
                          <Volume2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center animate-pulse">
                    <Sparkles size={20} className="text-slate-600" />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-3xl rounded-tl-none animate-pulse">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
              <form 
                onSubmit={handleSend}
                className="max-w-4xl mx-auto relative group"
              >
                <div className="absolute inset-0 bg-indigo-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-3xl" />
                <div className="relative flex items-center gap-2 bg-slate-900/80 border border-slate-800 focus-within:border-indigo-500/50 p-2 rounded-3xl backdrop-blur-xl transition-all">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "p-3 rounded-2xl transition-all",
                      isListening ? "bg-rose-500 text-white animate-pulse" : "text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    {isListening ? <Mic size={22} /> : <MicOff size={22} />}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 py-3 px-2"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      "p-3 rounded-2xl transition-all",
                      input.trim() && !isLoading ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-600 bg-slate-800"
                    )}
                  >
                    <Send size={22} />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Preview Panel for WEB_APP */}
          {mode === 'WEB_APP' && activeSnippet && (
            <div className="w-1/2 border-l border-slate-800 flex flex-col bg-slate-900/30">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <Play size={16} className="text-emerald-400" />
                  <span className="font-bold text-sm">{activeSnippet.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveSnippetId(null)}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
                  >
                    <ChevronLeft size={18} className="rotate-180" />
                  </button>
                </div>
              </div>
              <div className="flex-1 p-4">
                <CodeRunner html={activeSnippet.html} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
