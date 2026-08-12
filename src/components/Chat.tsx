import React, { useState, useEffect, useRef } from 'react';
import { db, auth, signOut, linkWithPopup, githubProvider } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import Markdown, { Components } from 'react-markdown';
import { Send, LogOut, Bot, User, Settings, Github, Key, CreditCard, X, Play } from 'lucide-react';
import { GithubAuthProvider } from 'firebase/auth';

interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  createdAt?: any;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [previewData, setPreviewData] = useState<{code: string, language: string} | null>(null);
  const [previewWidth, setPreviewWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;
    
    const q = query(
      collection(db, 'users', currentUser.uid, 'messages'),
      orderBy('createdAt', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    });

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data());
      }
    });

    return () => {
      unsubscribe();
      unsubUser();
    };
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setPreviewWidth(newWidth);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser || loading) return;

    if (userData && userData.credits <= 0) {
      alert("Insufficient credits. Please check your settings.");
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'messages'), {
        role: 'user',
        content: userMessage,
        createdAt: serverTimestamp()
      });

      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: userMessage });

      const idToken = await currentUser.getIdToken();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ messages: chatHistory })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'API Error');
      }

      await addDoc(collection(db, 'users', currentUser.uid, 'messages'), {
        role: 'model',
        content: data.text,
        createdAt: serverTimestamp()
      });

    } catch (error: any) {
      console.error('Error sending message:', error);
      alert(error.message || 'Error sending message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (!currentUser || !userData) return;
    if (userData.hasFreeApiKey) {
      alert("You have already claimed your free API key. Upgrade to a paid plan for more.");
      return;
    }
    
    const newKey = 'nx_' + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        hasFreeApiKey: true,
        apiKey: newKey
      });
      alert(`Your new API key is: ${newKey}\n\nPlease save it, it won't be shown again.`);
    } catch(err) {
      console.error(err);
    }
  };

  const handleUpgradeToPro = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        isPro: true
      });
      alert("Successfully upgraded to Pro Plan! You now have unlimited messages and access to Gemini 3.1 Pro.");
    } catch(err: any) {
      console.error(err);
      alert("Error upgrading: " + err.message);
    }
  };

  const handleLinkGithub = async () => {
    if (!currentUser) return;
    try {
      const result = await linkWithPopup(currentUser, githubProvider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          githubToken: credential.accessToken
        });
        alert("GitHub linked successfully!");
      }
    } catch(err: any) {
      console.error(err);
      alert("Error linking GitHub: " + err.message);
    }
  };

  const generatePreviewSrcDoc = (code: string, language: string) => {
    if (language === 'html') {
      return code;
    }
    if (['jsx', 'tsx', 'react'].includes(language)) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body>
          <div id="root"></div>
          <script type="text/babel" data-type="module">
            ${code.replace(/export default/g, 'const DefaultExport =')}
            
            const root = ReactDOM.createRoot(document.getElementById('root'));
            if (typeof DefaultExport !== 'undefined') {
              root.render(<DefaultExport />);
            } else if (typeof App !== 'undefined') {
              root.render(<App />);
            }
          </script>
        </body>
        </html>
      `;
    }
    return `<html><body><pre>${code}</pre></body></html>`;
  };

  const markdownComponents: Components = {
    code(props: any) {
      const {children, className, node, inline, ...rest} = props;
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const isPreviewable = ['html', 'jsx', 'tsx', 'react'].includes(language);
      const content = String(children).replace(/\n$/, '');
      
      return !inline && isPreviewable ? (
        <div className="relative group mt-2 mb-2">
          <button 
            onClick={() => setPreviewData({ code: content, language })}
            className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center shadow-lg"
          >
            <Play className="w-3 h-3 mr-1" /> Preview
          </button>
          <code {...rest} className={className}>
            {children}
          </code>
        </div>
      ) : (
        <code {...rest} className={className}>
          {children}
        </code>
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-slate-100 relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">
            T
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight text-white">Talk AI</h1>
            <p className="text-[10px] text-blue-400 font-bold tracking-[0.1em] uppercase">High-Reasoning Enabled</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden z-10">
        {/* Chat Area */}
        <div 
          className="flex flex-col h-full overflow-y-auto"
          style={{ width: previewData ? (100 - previewWidth) + '%' : '100%' }}
        >
          <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-8 pb-32">
            {messages.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-white/5 border border-white/10 shadow-lg shadow-white/5 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                  <Bot className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">How can I help you today?</h2>
                <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                  I am Talk AI, a highly intelligent assistant powered by Gemini. 
                  I can help you with complex reasoning, coding, analysis, and GitHub integration.
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div 
                  key={msg.id || index} 
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[90%] lg:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${msg.role === 'user' ? 'bg-blue-600/30 border border-blue-500/30 ml-4' : 'bg-gradient-to-tr from-blue-500 to-purple-600 mr-4'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4 text-blue-200" /> : <Bot className="w-4 h-4 text-white" />}
                    </div>
                    
                    <div className={`px-5 py-3.5 rounded-2xl backdrop-blur-md ${
                      msg.role === 'user' 
                        ? 'bg-blue-600/10 border border-blue-500/20 text-white' 
                        : 'bg-white/5 border border-white/10 text-slate-200 shadow-xl overflow-hidden'
                    }`}>
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.content}</p>
                      ) : (
                        <div className="markdown-body prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-headings:text-white prose-a:text-blue-400">
                          <Markdown components={markdownComponents}>{msg.content}</Markdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex w-full justify-start">
                <div className="flex max-w-[85%] flex-row">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-tr from-blue-500 to-purple-600 mr-4 shadow-lg">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-5 py-3.5 rounded-2xl bg-white/5 border border-white/10 shadow-xl backdrop-blur-md flex items-center">
                    <div className="flex space-x-1.5 items-center h-5">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Resizable handle & Live Preview Area */}
        {previewData && (
          <>
            <div 
              className="w-1 bg-white/10 hover:bg-blue-500 cursor-col-resize transition-colors flex-shrink-0 z-20"
              onMouseDown={() => setIsDragging(true)}
            />
            <div 
              className="hidden lg:flex flex-col h-full bg-[#030712] relative z-10"
              style={{ width: previewWidth + '%' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 backdrop-blur-md">
                <h3 className="font-semibold text-sm text-white flex items-center">
                  <Play className="w-4 h-4 mr-2 text-blue-400" />
                  Live Preview
                </h3>
                <button 
                  onClick={() => setPreviewData(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 bg-white">
                <iframe 
                  srcDoc={generatePreviewSrcDoc(previewData.code, previewData.language)}
                  className="w-full h-full border-0"
                  title="Live Preview"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#030712] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <CreditCard className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-white">{userData?.isPro ? 'Pro Plan' : 'Free Tier Limits'}</h3>
                  </div>
                  {userData?.isPro ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl font-bold text-white">Unlimited Messages</span>
                      </div>
                      <div className="inline-flex items-center text-sm font-medium text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg mb-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 mr-2"></span> Gemini 3.1 Pro Active
                      </div>
                      <p className="text-xs text-slate-400 mt-2">You are on the Pro Plan. Enjoy unlimited, high-reasoning coding assistance.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-end gap-2">
                        <p className="text-3xl font-bold text-white">{userData?.credits || 0}</p>
                        <p className="text-sm text-slate-400 mb-1">messages remaining</p>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.5 mt-4 mb-2">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, ((userData?.credits || 0) / 50) * 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">You are using Gemini Flash Lite on the Free Tier. 1 message = 1 credit.</p>
                      <button 
                        onClick={handleUpgradeToPro}
                        className="mt-4 w-full text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors font-bold shadow-lg shadow-blue-600/20"
                      >
                        Upgrade to Pro Plan
                      </button>
                    </>
                  )}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Github className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold text-white">GitHub Integration</h3>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">Allow Talk AI to read and manage your repositories.</p>
                  {userData?.githubToken ? (
                    <div className="inline-flex items-center text-sm font-medium text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-green-400 mr-2"></span> Connected
                    </div>
                  ) : (
                    <button 
                      onClick={handleLinkGithub}
                      className="text-sm bg-white text-black font-bold px-4 py-2 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Connect GitHub
                    </button>
                  )}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Key className="w-5 h-5 text-yellow-400" />
                    <h3 className="font-semibold text-white">Developer API Key</h3>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">Get 1 free API key to use Talk AI models in your own apps.</p>
                  {userData?.hasFreeApiKey ? (
                    <p className="text-sm text-slate-300">Key generated. See dashboard for usage.</p>
                  ) : (
                    <button 
                      onClick={generateApiKey}
                      className="text-sm border border-white/20 text-white hover:bg-white/5 font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      Generate Free Key
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="absolute bottom-0 left-0 w-full bg-transparent p-4 z-10">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="relative flex items-center backdrop-blur-xl rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Talk AI..."
              className="w-full pl-6 pr-14 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-white placeholder-slate-500 shadow-inner"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2.5 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-lg shadow-blue-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-3 mb-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
              Talk AI uses advanced reasoning and can make mistakes.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
