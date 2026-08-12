import React, { useState } from 'react';
import { 
  auth, db, googleProvider, githubProvider, 
  signInWithPopup, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, sendEmailVerification 
} from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { GithubAuthProvider } from 'firebase/auth';
import { Mail, Lock, LogIn, UserPlus, Github, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function initializeUserDoc(user: any, githubToken?: string) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      email: user.email,
      credits: 50, // Starter credits
      hasFreeApiKey: false,
      githubToken: githubToken || null,
      createdAt: new Date()
    });
  } else if (githubToken) {
    // Update existing user with new token
    await setDoc(userRef, { githubToken }, { merge: true });
  }
}

export function Auth({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        if (!userCred.user.emailVerified) {
          setError('Please verify your email before logging in.');
          setLoading(false);
          return;
        }
        await initializeUserDoc(userCred.user);
        onAuthSuccess();
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCred.user);
        await initializeUserDoc(userCred.user);
        setVerificationSent(true);
        setError('Verification email sent! Please check your inbox and verify before logging in.');
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await initializeUserDoc(result.user);
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    }
  };

  const handleGithubSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, githubProvider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      await initializeUserDoc(result.user, token);
      onAuthSuccess();
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
         setError('GitHub sign-in is not enabled. Please enable it in the Firebase Console.');
      } else {
         setError(err.message || 'GitHub sign-in failed.');
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#030712] text-slate-100 flex flex-col overflow-hidden relative font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px]"></div>

      <nav className="flex justify-between items-center px-6 lg:px-12 py-8 z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">T</div>
          <span className="text-2xl font-bold tracking-tight">Talk AI</span>
        </div>
        <div className="hidden lg:flex gap-8 text-sm font-medium text-slate-400">
          <a href="#" className="hover:text-white">Capabilities</a>
          <a href="#" className="hover:text-white">API</a>
          <a href="#" className="hover:text-white">Security</a>
          <a href="#" className="hover:text-white">Pricing</a>
        </div>
        <div className="hidden lg:flex gap-4">
          <button className="px-5 py-2 text-sm font-semibold rounded-full border border-white/10 hover:bg-white/5">About</button>
          <button className="px-5 py-2 text-sm font-semibold rounded-full bg-white text-black hover:bg-slate-200">Get Started</button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col lg:flex-row px-6 lg:px-12 pb-12 z-10 overflow-y-auto">
        <div className="w-full lg:w-1/2 flex flex-col justify-center lg:pr-12 mb-12 lg:mb-0 mt-8 lg:mt-0">
          <span className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold text-blue-400 w-fit mb-6">NEXT-GEN INTELLIGENCE</span>
          <h1 className="text-4xl lg:text-6xl font-extrabold leading-[1.1] mb-6">Smarter at everything.</h1>
          <p className="text-lg text-slate-400 mb-8 leading-relaxed">Experience an AI that understands nuance, logic, and code with unprecedented precision. Talk AI bridges the gap between thought and execution.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-blue-400 mb-1 font-bold">GitHub Sync</div>
              <p className="text-sm text-slate-500">Connect your repositories for free and let AI manage your PRs.</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-purple-400 mb-1 font-bold">Verified Only</div>
              <p className="text-sm text-slate-500">Mandatory email verification ensures a secure and clean environment.</p>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center">
          <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[40px] p-8 lg:p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
            <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
            <p className="text-slate-400 text-sm mb-8">Enter your details to access Talk AI intelligence.</p>

            {error && (
              <div className={cn("p-4 rounded-xl mb-6 text-sm font-medium border", verificationSent ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                {error}
              </div>
            )}

            <button 
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-bold py-3 px-4 rounded-2xl mb-4 hover:bg-slate-200 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>
            
            <button 
              onClick={handleGithubSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white font-bold py-3 px-4 rounded-2xl mb-6 hover:bg-white/10 transition-colors"
            >
              <Github className="w-5 h-5" />
              Sign in with GitHub
            </button>

            <div className="relative flex items-center justify-center mb-6">
              <div className="flex-1 border-b border-white/10"></div>
              <span className="px-4 text-xs text-slate-500 uppercase tracking-widest">or continue with</span>
              <div className="flex-1 border-b border-white/10"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-white placeholder-slate-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-white placeholder-slate-500"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 font-bold py-4 px-4 rounded-2xl mt-4 hover:bg-blue-500 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div className="mt-8 text-center text-sm">
              <p className="text-slate-400">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                <button 
                  onClick={() => { setIsLogin(!isLogin); setError(null); }} 
                  className="font-bold text-white hover:text-blue-400 transition-colors"
                >
                  {isLogin ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </div>

            <p className="text-center text-[10px] text-slate-500 mt-6 px-4 uppercase tracking-tighter">
              Account activation requires a verification link sent to your inbox.
            </p>
          </div>
        </div>
      </main>

      <footer className="px-12 py-6 border-t border-white/5 hidden md:flex justify-between items-center text-[10px] text-slate-600 uppercase tracking-[0.2em] font-medium z-10">
        <div>© 2024 Talk AI Systems</div>
        <div className="flex gap-8">
          <span>Global Latency: 14ms</span>
          <span>Nodes Active: 1,482</span>
          <span className="text-blue-500">GitHub Integration: Online</span>
        </div>
      </footer>
    </div>
  );
}
