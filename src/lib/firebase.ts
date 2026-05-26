import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error('Login error', error);
    throw error;
  }
};

export const checkRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('Redirect login successful:', result.user);
    }
  } catch (error) {
    console.error('Redirect login error', error);
    throw error;
  }
};


export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error', error);
  }
};

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
