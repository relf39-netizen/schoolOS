import { initializeApp, getApps, getApp } from 'firebase/app';
// Fix: Group Firestore function imports and separate them from type-only imports to resolve resolution issues
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc, 
  where, 
  doc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  getDocs, 
  setDoc,
  Timestamp
} from 'firebase/firestore';
// Fix: Use separate import type syntax to support environments with older TypeScript versions (pre-4.5)
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Configuration from Environment Variables
const env = (import.meta as any).env;

const firebaseConfig = {
    apiKey: "AIzaSyDEpU1t8EBzxpeWmy8AZrcMySi-SbqGLl4",
    authDomain: "schooloperatorsystem.firebaseapp.com",
    databaseURL: "https://schooloperatorsystem-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "schooloperatorsystem",
    storageBucket: "schooloperatorsystem.firebasestorage.app",
    messagingSenderId: "821652200196",
    appId: "1:821652200196:web:5d6e2fe19a365603f64e51",
    measurementId: "G-DPHF36ZLKK"
   };
   

// Check if Firebase should be enabled (API Key must exist)
export const isConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';

let app;
let db: any;
let auth: any;
let storage: any;

if (isConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

// Re-export Firestore functions to be used throughout the app
// Fix: Ensure modular SDK functions and types are properly exported for consumption by system components
export { 
  db, 
  auth, 
  storage,
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc, 
  where, 
  doc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  getDocs, 
  setDoc,
  Timestamp
};

export type { QuerySnapshot, DocumentData };

export default app;