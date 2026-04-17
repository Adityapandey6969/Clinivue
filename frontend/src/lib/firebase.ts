import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "REDACTED_FIREBASE_KEY",
  authDomain: "clinivue-d321c.firebaseapp.com",
  projectId: "clinivue-d321c",
  storageBucket: "clinivue-d321c.firebasestorage.app",
  messagingSenderId: "91980328524",
  appId: "1:91980328524:web:4de8b772120f36fe2e8ee9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logOut() {
  await signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export { auth };
export type { User };
