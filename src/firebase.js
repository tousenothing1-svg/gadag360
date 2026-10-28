import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA8-TiGOIyB6WPB-qDNP9hVzgQsrT_pzBo",
  authDomain: "gadag360-b57ca.firebaseapp.com",
  projectId: "gadag360-b57ca",
  storageBucket: "gadag360-b57ca.firebasestorage.app",
  messagingSenderId: "709276486111",
  appId: "1:709276486111:web:853b35fcd6a43846a39c6a",
  measurementId: "G-VTE5X46X7K"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);