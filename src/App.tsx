import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Auth } from './components/Auth';
import { Chat } from './components/Chat';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Check if email verification is required and done
      // For Google/Github, emailVerified is true automatically
      if (currentUser && currentUser.providerData.some(p => p.providerId === 'password') && !currentUser.emailVerified) {
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030712] text-slate-100 relative overflow-hidden font-sans">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px]"></div>
         <div className="w-8 h-8 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin z-10"></div>
         <p className="mt-4 text-sm font-medium z-10">Loading Talk AI...</p>
      </div>
    );
  }

  return user ? <Chat /> : <Auth onAuthSuccess={() => {}} />;
}
