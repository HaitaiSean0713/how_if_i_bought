import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import localFirebaseConfig from '../../firebase-applet-config.json';

// Use environment variables if they exist (e.g. on Vercel), otherwise fallback to the local json config (AI Studio)
const metaEnv = (import.meta as any).env || {};
const isCustomProject = !!(metaEnv.VITE_FIREBASE_PROJECT_ID || metaEnv.VITE_FIREBASE_API_KEY);
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || localFirebaseConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || localFirebaseConfig.appId,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (isCustomProject ? '(default)' : localFirebaseConfig.firestoreDatabaseId),
};

export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? initializeFirestore(app, { localCache: persistentLocalCache(), ignoreUndefinedProperties: true }, firebaseConfig.firestoreDatabaseId || '(default)') : null;
export const auth = app ? getAuth(app) : null;

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  if (!auth) throw new Error('尚未設定雲端登入，請先使用訪客模式。');
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error) {
    console.error('Login error', error);
    throw error;
  }
};


export const logout = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error', error);
  }
};

export async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
