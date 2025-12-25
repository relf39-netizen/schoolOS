
import { initializeApp, getApps, getApp } from 'firebase/app';
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
  Timestamp,
  type QuerySnapshot,
  type DocumentData
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

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

export const isConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;

let app: any = null;
let db: any = null;
let auth: any = null;
let storage: any = null;

if (isConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (error) {
    console.warn("Firebase initialization failed:", error);
  }
}

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
