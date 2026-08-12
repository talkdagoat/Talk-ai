import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged, linkWithPopup, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0124174965",
  appId: "1:793059344500:web:662c4e16fcff7717ecd121",
  apiKey: "AIzaSyDAKF2fJIAuauwF8a74TZp5ZkybzFex5qw",
  authDomain: "gen-lang-client-0124174965.firebaseapp.com",
  storageBucket: "gen-lang-client-0124174965.firebasestorage.app",
  messagingSenderId: "793059344500",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Auth providers
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');
githubProvider.addScope('delete_repo');

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  linkWithPopup
};
export type { User };
