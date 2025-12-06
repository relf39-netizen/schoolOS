import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// ------------------------------------------------------------------
// Firebase Configuration
// ------------------------------------------------------------------

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

// Check if configured (Logic: if apiKey contains default placeholder, it's not configured)
// Since we have the real key now, this should be true.
export const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let app;
let db: any = null;
let auth: any = null;
let storage: any = null;

if (isConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        console.log("Firebase Connected Successfully");
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
    }
} else {
    console.warn("Firebase config missing. Running in MOCK DATA mode.");
}

export { db, auth, storage };
export default app;