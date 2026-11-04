// @ts-nocheck
/* eslint-disable */
import { createClient } from "@supabase/supabase-js";
import { auth } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import React, { useState, useMemo, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

// ── DETECT IF RUNNING IN CAPACITOR (native Android/iOS) ──
const isNative = () => {
  try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform(); } catch(e) { return false; }
};

// ── CAPGO: Notify app is ready (prevents rollback after update) ──
if (isNative()) {
  try {
    import("@capgo/capacitor-updater").then(({ CapacitorUpdater }) => {
      CapacitorUpdater.notifyAppReady();
    }).catch(() => {});
  } catch(e) {}
}

// ── STORAGE HELPER (uses BOTH localStorage + Capacitor Preferences) ──
const Storage = {
  async set(key, value) {
    // Always save to localStorage first (works everywhere)
    try { localStorage.setItem(key, String(value)); } catch(e) {}
    // Also save to Capacitor Preferences if on native
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key, value: String(value) });
      } catch(e) {}
    }
  },
  async get(key) {
    // Try Capacitor Preferences first on native
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        const { value } = await Preferences.get({ key });
        if (value !== null && value !== undefined) return value;
      } catch(e) {}
    }
    // Fall back to localStorage
    try { return localStorage.getItem(key); } catch(e) { return null; }
  },
  async remove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
    if (isNative()) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key });
      } catch(e) {}
    }
  }
};

// ── SUPABASE CONFIG ──
const SUPABASE_URL = "https://lykhjuizzvurklywxflz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5a2hqdWl6enZ1cmtseXd4Zmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODg3OTMsImV4cCI6MjEwNjk2NDc5M30.2gO3aK030mJ0pYTeMd95B7uZF-dHnFzDOSaPwt9hZ6Q";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
import { MapPin, Search, ShoppingCart, Plus, Minus, ArrowLeft, Check, Store, X, Globe, Bike, Star, Gift, Clock, Package, Copy, Tag, Zap, Users, ThumbsUp, History, Bell, ChevronRight, Award, Repeat, RotateCcw, User, Heart, CreditCard, HelpCircle, RefreshCcw, Home, LogOut, Phone, Mail, Edit3, Lightbulb, Info, Mic, ChevronDown, Menu, ShoppingBasket, Sparkles, Sunrise, Leaf, Truck, LocateFixed } from "lucide-react";

// ── DESIGN TOKENS ──
// Basil green: actions and selection. Haldi (turmeric): category pills and highlights. Sage: the shelf behind the cards.
const basil = "#1A6B3C", basilDark = "#124D2A", mango = "#FF6B35";
const chili = "#D93A30", soil = "#6B716A", ink = "#1E2B22", line = "#E4E8E0";
const bg = "#FFFFFF", panel = "#FFFFFF";
const haldi = "#F2B53A", sage = "#F2F5F1";
const display = "'Figtree', 'Noto Sans Kannada', system-ui, -apple-system, sans-serif";
const body = "'Figtree', 'Noto Sans Kannada', system-ui, -apple-system, sans-serif";
const accent = "'Baloo Tamma 2', 'Figtree', 'Noto Sans Kannada', system-ui, sans-serif"; // rounded display face made for Kannada


const PRODUCTS = [
  {id:"p1",cat:"Dairy",name:"A2 Desi Cow Bilona Ghee",price:549,unit:"200ml",vendor:"v1",img:"/products/p1.jpg",variants:[{label:"250g",price:299},{label:"500g",price:569},{label:"1kg",price:1099}]},
  {id:"p2",cat:"Dairy",name:"A2 Desi Cow Bilona Ghee 2nd variant",price:1050,unit:"500ml",vendor:"v1",img:"/products/p2.jpg",variants:[{label:"250ml",price:525},{label:"500ml",price:1050},{label:"1L",price:1942}]},
  {id:"p3",cat:"Dairy",name:"Buffalo Ghee",price:649,unit:"500ml",vendor:"v1",img:"/products/p3.jpg",variants:[{label:"250g",price:199},{label:"500g",price:379},{label:"1kg",price:729}]},
  {id:"p4",cat:"Dairy",name:"Fresh Malai Paneer",price:70,unit:"100gm",vendor:"v1",img:"/products/p4.jpg",variants:[{label:"200g",price:69},{label:"400g",price:129},{label:"1kg",price:299}]},
  {id:"p5",cat:"Dairy",name:"Fresh White Butter",price:120,unit:"120gm",vendor:"v1",img:"/products/p5.jpg",variants:[{label:"100g",price:120},{label:"250g",price:222}]},
  {id:"p6",cat:"Fruits",name:"Apple Green Granny Smith Imported",price:67,unit:"140gm | pc",vendor:"v2",img:"/products/p6.jpg",variants:[{label:"1pc",price:67},{label:"3pc",price:188},{label:"6pc",price:362}]},
  {id:"p7",cat:"Fruits",name:"Apple Pink Lady Imported",price:70,unit:"150gm | 1pc",vendor:"v2",img:"/products/p7.jpg",variants:[{label:"1pc",price:70},{label:"3pc",price:196},{label:"6pc",price:378}]},
  {id:"p8",cat:"Fruits",name:"Apple Red Delicious Regular",price:55,unit:"145gm | 1pc",vendor:"v2",img:"/products/p8.jpg",variants:[{label:"1pc",price:55},{label:"3pc",price:154},{label:"6pc",price:297}]},
  {id:"p9",cat:"Fruits",name:"Apple Red Delicious Peti",price:1130,unit:"1 Peti | Box",vendor:"v2",img:"/products/p9.jpg"},
  {id:"p10",cat:"Fruits",name:"Apple Royal Gala",price:73,unit:"155gm | 1pc",vendor:"v2",img:"/products/p10.jpg",variants:[{label:"1pc",price:73},{label:"3pc",price:204},{label:"6pc",price:394}]},
  {id:"p12",cat:"Fruits",name:"Apple Washington Imported",price:60,unit:"150gm | 1pc",vendor:"v2",img:"/products/p12.jpg",variants:[{label:"1pc",price:60},{label:"3pc",price:168},{label:"6pc",price:324}]},
  {id:"p13",cat:"Fruits",name:"Apple Washington Peti",price:1200,unit:"1 Peti | Box",vendor:"v2",img:"/products/p13.jpg"},
  {id:"p14",cat:"Fruits",name:"Avocado Hass Jumbo  Semi-ripe",price:85,unit:"210gm | 1pc",vendor:"v2",img:"/products/p14.jpg",variants:[{label:"1pc",price:85},{label:"3pc",price:238},{label:"6pc",price:459}]},
  {id:"p15",cat:"Fruits",name:"Avocado Hass  Semi-ripe",price:60,unit:"230gm | 1pc",vendor:"v2",img:"/products/p15.jpg",variants:[{label:"1pc",price:60},{label:"3pc",price:168},{label:"6pc",price:324}]},
  {id:"p16",cat:"Fruits",name:"Banana Nendran",price:32,unit:"225gm | 1pc",vendor:"v2",img:"/products/p16.jpg",variants:[{label:"1pc",price:32},{label:"3pc",price:90},{label:"6pc",price:173}]},
  {id:"p20",cat:"Fruits",name:"Banana Yelakki",price:9,unit:"55gm | 1pc",vendor:"v2",img:"/products/p20.jpg",variants:[{label:"1pc",price:9},{label:"3pc",price:25},{label:"6pc",price:49}]},
  {id:"p21",cat:"Fruits",name:"Blueberry  Imported  Jumbo",price:331,unit:"125gm | 1pc",vendor:"v2",img:"/products/p21.jpg",variants:[{label:"1pc",price:331},{label:"3pc",price:927},{label:"6pc",price:1787}]},
  {id:"p22",cat:"Fruits",name:"Coconut Brown  Medium",price:43,unit:"330gm | 1pc",vendor:"v2",img:"/products/p22.jpg",variants:[{label:"1pc",price:43},{label:"3pc",price:120},{label:"6pc",price:232}]},
  {id:"p23",cat:"Fruits",name:"Coconut Brown  Large",price:73,unit:"480gm | 1pc",vendor:"v2",img:"/products/p23.jpg",variants:[{label:"1pc",price:73},{label:"3pc",price:204},{label:"6pc",price:394}]},
  {id:"p24",cat:"Fruits",name:"Cocunut Brown  Grated",price:100,unit:"200gm | 1pc",vendor:"v2",img:"/products/p24.jpg",variants:[{label:"1pc",price:100},{label:"3pc",price:280},{label:"6pc",price:540}]},
  {id:"p25",cat:"Fruits",name:"Cocunut Brown  Chunks",price:100,unit:"200gm | 1pc",vendor:"v2",img:"/products/p25.jpg",variants:[{label:"1pc",price:100},{label:"3pc",price:280},{label:"6pc",price:540}]},
  {id:"p26",cat:"Fruits",name:"Dragon Fruit  White Inside",price:100,unit:"300gm | 1pc",vendor:"v2",img:"/products/p26.jpg",variants:[{label:"1pc",price:100},{label:"3pc",price:280},{label:"6pc",price:540}]},
  {id:"p27",cat:"Fruits",name:"Dragon Fruit  Red Inside",price:82,unit:"250-350gm | 1pc",vendor:"v2",img:"/products/p27.jpg",variants:[{label:"1pc",price:82},{label:"3pc",price:230},{label:"6pc",price:443}]},
  {id:"p28",cat:"Fruits",name:"Figs (Anjeer)",price:72,unit:"250gm |1pc",vendor:"v2",img:"/products/p28.jpg",variants:[{label:"1pc",price:72},{label:"3pc",price:202},{label:"6pc",price:389}]},
  {id:"p29",cat:"Fruits",name:"Fresh Coconut Water  Green  Without Malai",price:71,unit:"250ml | 1pc",vendor:"v2",img:"/products/p29.jpg",variants:[{label:"1pc",price:71},{label:"3pc",price:199},{label:"6pc",price:383}]},
  {id:"p30",cat:"Fruits",name:"Grape Fruit  Imported",price:103,unit:"280gm | 1pc",vendor:"v2",img:"/products/p30.jpg",variants:[{label:"1pc",price:103},{label:"3pc",price:288},{label:"6pc",price:556}]},
  {id:"p31",cat:"Fruits",name:"Grapes Bangalore Blue",price:94,unit:"450-500gm | 1pc",vendor:"v2",img:"/products/p31.jpg",variants:[{label:"1pc",price:94},{label:"3pc",price:263},{label:"6pc",price:508}]},
  {id:"p32",cat:"Fruits",name:"Grapes Muscat Shine  Imported",price:100,unit:"200-250gm | 1pc",vendor:"v2",img:"/products/p32.jpg",variants:[{label:"1pc",price:100},{label:"3pc",price:280},{label:"6pc",price:540}]},
  {id:"p33",cat:"Fruits",name:"Graped Red Globe  Imported",price:124,unit:"200-250gm | 1pc",vendor:"v2",img:"/products/p33.jpg",variants:[{label:"1pc",price:124},{label:"3pc",price:347},{label:"6pc",price:670}]},
  {id:"p34",cat:"Fruits",name:"Graped Red Globe  India",price:82,unit:"250gm |1pc",vendor:"v2",img:"/products/p34.jpg",variants:[{label:"1pc",price:82},{label:"3pc",price:230},{label:"6pc",price:443}]},
  {id:"p35",cat:"Fruits",name:"Guavas Thai  Pink  Semi-ripe",price:37,unit:"200-230gm | 1pc",vendor:"v2",img:"/products/p35.jpg",variants:[{label:"1pc",price:37},{label:"3pc",price:104},{label:"6pc",price:200}]},
  {id:"p37",cat:"Fruits",name:"Kiwi Green  Regular",price:45,unit:"80gm | 1pc",vendor:"v2",img:"/products/p37.jpg",variants:[{label:"1pc",price:45},{label:"3pc",price:126},{label:"6pc",price:243}]},
  {id:"p38",cat:"Fruits",name:"Kiwi Zespri  Gold  Imported",price:220,unit:"3pc pack",vendor:"v2",img:"/products/p38.jpg",variants:[{label:"1pc",price:220},{label:"3pc",price:616},{label:"6pc",price:1188}]},
  {id:"p39",cat:"Fruits",name:"Kiwi Zespri  Green  Imported",price:143,unit:"3pc pack",vendor:"v2",img:"/products/p39.jpg",variants:[{label:"1pc",price:143},{label:"3pc",price:400},{label:"6pc",price:772}]},
  {id:"p40",cat:"Fruits",name:"Longan Thailand  Imported",price:120,unit:"200gm | 1pc",vendor:"v2",img:"/products/p40.jpg",variants:[{label:"1pc",price:120},{label:"3pc",price:336},{label:"6pc",price:648}]},
  {id:"p41",cat:"Fruits",name:"Muskmelon Honey",price:44,unit:"800gm | 1pc",vendor:"v2",img:"/products/p41.jpg",variants:[{label:"1pc",price:44},{label:"3pc",price:123},{label:"6pc",price:238}]},
  {id:"p42",cat:"Fruits",name:"Ornage Mini Mandarin  Imported",price:34,unit:"80gm | 1pc",vendor:"v2",img:"/products/p42.jpg",variants:[{label:"1pc",price:34},{label:"3pc",price:95},{label:"6pc",price:184}]},
  {id:"p44",cat:"Fruits",name:"Orange Valencia  Imported Regular",price:55,unit:"205gm | 1pc",vendor:"v2",img:"/products/p44.jpg",variants:[{label:"1pc",price:55},{label:"3pc",price:154},{label:"6pc",price:297}]},
  {id:"p45",cat:"Fruits",name:"Papaya Disco  Medium Semi - ripe",price:61,unit:"1.1kg | 1pc",vendor:"v2",img:"/products/p45.jpg",variants:[{label:"1pc",price:61},{label:"3pc",price:171},{label:"6pc",price:329}]},
  {id:"p49",cat:"Fruits",name:"Pear Beauty  Imported",price:105,unit:"170gm | 1pc",vendor:"v2",img:"/products/p49.jpg",variants:[{label:"1pc",price:105},{label:"3pc",price:294},{label:"6pc",price:567}]},
  {id:"p50",cat:"Fruits",name:"Pear Nashpati",price:26,unit:"135gm | 1pc",vendor:"v2",img:"/products/p50.jpg",variants:[{label:"1pc",price:26},{label:"3pc",price:73},{label:"6pc",price:140}]},
  {id:"p51",cat:"Fruits",name:"Pear Packham",price:73,unit:"175gm | 1pc",vendor:"v2",img:"/products/p51.jpg",variants:[{label:"1pc",price:73},{label:"3pc",price:204},{label:"6pc",price:394}]},
  {id:"p52",cat:"Fruits",name:"Pineapple  Semi-ripe",price:103,unit:"1.0kg | 1pc",vendor:"v2",img:"/products/p52.jpg",variants:[{label:"1pc",price:103},{label:"3pc",price:288},{label:"6pc",price:556}]},
  {id:"p53",cat:"Fruits",name:"Pineapple Baby  Semi-ripe",price:71,unit:"700gm | 1pc",vendor:"v2",img:"/products/p53.jpg",variants:[{label:"1pc",price:71},{label:"3pc",price:199},{label:"6pc",price:383}]},
  {id:"p54",cat:"Fruits",name:"Pineapple Cut Slice",price:200,unit:"350-400gm | 1pack",vendor:"v2",img:"/products/p54.jpg",variants:[{label:"1pc",price:200},{label:"3pc",price:560},{label:"6pc",price:1080}]},
  {id:"p55",cat:"Fruits",name:"Pomegranate  Regular",price:32,unit:"195gm | 1pc",vendor:"v2",img:"/products/p55.jpg",variants:[{label:"1pc",price:32},{label:"3pc",price:90},{label:"6pc",price:173}]},
  {id:"p56",cat:"Fruits",name:"Pomegranate  Arils",price:221,unit:"200gm | 1pc",vendor:"v2",img:"/products/p56.jpg",variants:[{label:"1pc",price:221},{label:"3pc",price:619},{label:"6pc",price:1193}]},
  {id:"p57",cat:"Fruits",name:"Pomegranate  Premium",price:54,unit:"275gm | 1pc",vendor:"v2",img:"/products/p57.jpg",variants:[{label:"1pc",price:54},{label:"3pc",price:151},{label:"6pc",price:292}]},
  {id:"p58",cat:"Fruits",name:"Sapota (Chikoo) Regular",price:13,unit:"75gm | 1pc",vendor:"v2",img:"/products/p58.jpg",variants:[{label:"1pc",price:13},{label:"3pc",price:36},{label:"6pc",price:70}]},
  {id:"p59",cat:"Fruits",name:"Sugarcane",price:15,unit:"500gm | 1pc",vendor:"v2",img:"/products/p59.jpg",variants:[{label:"1pc",price:15},{label:"3pc",price:42},{label:"6pc",price:81}]},
  {id:"p60",cat:"Fruits",name:"Sweet Lime (Mosambi)  Small",price:13,unit:"155gm | 1pc",vendor:"v2",img:"/products/p60.jpg",variants:[{label:"1pc",price:13},{label:"3pc",price:36},{label:"6pc",price:70}]},
  {id:"p62",cat:"Fruits",name:"Sweet Tamarind (Imli)",price:179,unit:"250gm |1pc",vendor:"v2",img:"/products/p62.jpg",variants:[{label:"1pc",price:179},{label:"3pc",price:501},{label:"6pc",price:967}]},
  {id:"p63",cat:"Fruits",name:"Watermelon Kiran",price:85,unit:"3.3kg | 1pc",vendor:"v2",img:"/products/p63.jpg",variants:[{label:"1pc",price:85},{label:"3pc",price:238},{label:"6pc",price:459}]},
  {id:"p64",cat:"Fruits",name:"Wood Apple",price:20,unit:"200gm | 1pc",vendor:"v2",img:"/products/p64.jpg",variants:[{label:"1pc",price:20},{label:"3pc",price:56},{label:"6pc",price:108}]},
  {id:"p65",cat:"Vegetables",name:"Amaranthus  Red",price:35,unit:"250gm | 1pc",vendor:"v3",img:"/products/p65.jpg",variants:[{label:"1pc",price:35},{label:"2pc",price:66},{label:"4pc",price:126}]},
  {id:"p66",cat:"Vegetables",name:"Amaranthus  Green",price:35,unit:"250gm | 1pc",vendor:"v3",img:"/products/p66.jpg",variants:[{label:"1pc",price:35},{label:"2pc",price:66},{label:"4pc",price:126}]},
  {id:"p67",cat:"Vegetables",name:"Amla",price:17,unit:"100gm | 1pc",vendor:"v3",img:"/products/p67.jpg",variants:[{label:"1pc",price:17},{label:"2pc",price:32},{label:"4pc",price:61}]},
  {id:"p68",cat:"Vegetables",name:"Ash Gourd  Whole",price:131,unit:"2.5kg | 1pc",vendor:"v3",img:"/products/p68.jpg",variants:[{label:"1pc",price:131},{label:"2pc",price:249},{label:"4pc",price:472}]},
  {id:"p69",cat:"Vegetables",name:"Ash Gourd  Cut",price:21,unit:"200gm | 1pc",vendor:"v3",img:"/products/p69.jpg",variants:[{label:"1pc",price:21},{label:"2pc",price:40},{label:"4pc",price:76}]},
  {id:"p71",cat:"Vegetables",name:"Banana Leaves",price:85,unit:"5pc",vendor:"v3",img:"/products/p71.jpg",variants:[{label:"1pc",price:85},{label:"2pc",price:162},{label:"4pc",price:306}]},
  {id:"p73",cat:"Vegetables",name:"Beans Broad",price:21,unit:"250gm",vendor:"v3",img:"/products/p73.jpg",variants:[{label:"250g",price:21},{label:"500g",price:39},{label:"1kg",price:74}]},
  {id:"p78",cat:"Vegetables",name:"Beans Lobia",price:22,unit:"250gm",vendor:"v3",img:"/products/p78.jpg",variants:[{label:"250g",price:22},{label:"500g",price:41},{label:"1kg",price:77}]},
  {id:"p81",cat:"Vegetables",name:"Beetroot Ooty",price:24,unit:"185gm | 1pc",vendor:"v3",img:"/products/p81.jpg",variants:[{label:"1pc",price:24},{label:"2pc",price:46},{label:"4pc",price:86}]},
  {id:"p82",cat:"Vegetables",name:"Brinjal Green  Stripe",price:9,unit:"100gm | 1pc",vendor:"v3",img:"/products/p82.jpg",variants:[{label:"1pc",price:9},{label:"2pc",price:17},{label:"4pc",price:32}]},
  {id:"p88",cat:"Vegetables",name:"Cabbage Desi",price:20,unit:"690gm | 1pc",vendor:"v3",img:"/products/p88.jpg",variants:[{label:"1pc",price:20},{label:"2pc",price:38},{label:"4pc",price:72}]},
  {id:"p89",cat:"Vegetables",name:"Cabbage Purple",price:128,unit:"890gm | 1pc",vendor:"v3",img:"/products/p89.jpg",variants:[{label:"1pc",price:128},{label:"2pc",price:243},{label:"4pc",price:461}]},
  {id:"p90",cat:"Vegetables",name:"Baby Carrot Ooty",price:12,unit:"100gm | 1pc",vendor:"v3",img:"/products/p90.jpg",variants:[{label:"1pc",price:12},{label:"2pc",price:23},{label:"4pc",price:43}]},
  {id:"p91",cat:"Vegetables",name:"Carrot Ooty",price:18,unit:"160gm | 2pc",vendor:"v3",img:"/products/p91.jpg",variants:[{label:"1pc",price:18},{label:"2pc",price:34},{label:"4pc",price:65}]},
  {id:"p93",cat:"Vegetables",name:"Cherry Tomato  Red",price:52,unit:"200gm | 1pack",vendor:"v3",img:"/products/p93.jpg",variants:[{label:"250g",price:52},{label:"500g",price:96},{label:"1kg",price:182}]},
  {id:"p94",cat:"Vegetables",name:"Chilli Akash Green",price:5,unit:"50gm",vendor:"v3",img:"/products/p94.jpg",variants:[{label:"250g",price:5},{label:"500g",price:9},{label:"1kg",price:18}]},
  {id:"p95",cat:"Vegetables",name:"Chilli Green",price:4,unit:"50gm",vendor:"v3",img:"/products/p95.jpg",variants:[{label:"250g",price:4},{label:"500g",price:7},{label:"1kg",price:14}]},
  {id:"p96",cat:"Vegetables",name:"Chilli Green Bhajji",price:6,unit:"100gm | 1pc",vendor:"v3",img:"/products/p96.jpg",variants:[{label:"1pc",price:6},{label:"2pc",price:11},{label:"4pc",price:22}]},
  {id:"p97",cat:"Vegetables",name:"Coccinia (Thondekaayi)",price:12,unit:"250gm",vendor:"v3",img:"/products/p97.jpg",variants:[{label:"250g",price:12},{label:"500g",price:22},{label:"1kg",price:42}]},
  {id:"p99",cat:"Vegetables",name:"Cariander (Kothambari Soppu) Without Root",price:13,unit:"120gm |1Bunch",vendor:"v3",img:"/products/p99.jpg",variants:[{label:"1 bunch",price:13},{label:"2 bunch",price:23},{label:"3 bunch",price:42}]},
  {id:"p100",cat:"Vegetables",name:"Cariander (Kothambari Soppu) With Root",price:11,unit:"120gm | 1bunch",vendor:"v3",img:"/products/p100.jpg",variants:[{label:"1 bunch",price:11},{label:"2 bunch",price:20},{label:"3 bunch",price:35}]},
  {id:"p101",cat:"Vegetables",name:"Sweet Corn (Bhutta)  Kernels",price:65,unit:"200gm | 1pack",vendor:"v3",img:"/products/p101.jpg",variants:[{label:"250g",price:65},{label:"500g",price:120},{label:"1kg",price:228}]},
  {id:"p102",cat:"Vegetables",name:"Sweet Corn (Bhutta)  Cob Large",price:27,unit:"5000gm| 1pc",vendor:"v3",img:"/products/p102.jpg",variants:[{label:"1pc",price:27},{label:"2pc",price:51},{label:"4pc",price:97}]},
  {id:"p104",cat:"Vegetables",name:"Cucumber English",price:19,unit:"300gm | 2pc",vendor:"v3",img:"/products/p104.jpg",variants:[{label:"1pc",price:19},{label:"2pc",price:36},{label:"4pc",price:68}]},
  {id:"p105",cat:"Vegetables",name:"Cucumber Green",price:25,unit:"600gm | 2pc",vendor:"v3",img:"/products/p105.jpg",variants:[{label:"1pc",price:25},{label:"2pc",price:48},{label:"4pc",price:90}]},
  {id:"p106",cat:"Vegetables",name:"Cucumber Mangalore",price:27,unit:"1.1kg | 1pc",vendor:"v3",img:"/products/p106.jpg",variants:[{label:"1pc",price:27},{label:"2pc",price:51},{label:"4pc",price:97}]},
  {id:"p107",cat:"Vegetables",name:"Curry Leaves",price:11,unit:"50gm",vendor:"v3",img:"/products/p107.jpg",variants:[{label:"250g",price:11},{label:"500g",price:20},{label:"1kg",price:38}]},
  {id:"p108",cat:"Vegetables",name:"Dill leaves (Soya Saag)",price:39,unit:"250gm",vendor:"v3",img:"/products/p108.jpg",variants:[{label:"250g",price:39},{label:"500g",price:72},{label:"1kg",price:136}]},
  {id:"p109",cat:"Vegetables",name:"Drumstick",price:10,unit:"100gm | 1pc",vendor:"v3",img:"/products/p109.jpg",variants:[{label:"1pc",price:10},{label:"2pc",price:19},{label:"4pc",price:36}]},
  {id:"p111",cat:"Vegetables",name:"Garlic Local",price:34,unit:"100gm",vendor:"v3",img:"/products/p111.jpg",variants:[{label:"250g",price:34},{label:"500g",price:63},{label:"1kg",price:119}]},
  {id:"p112",cat:"Vegetables",name:"Garlic Ooty  Peeled",price:59,unit:"100gm | 1pack",vendor:"v3",img:"/products/p112.jpg",variants:[{label:"250g",price:59},{label:"500g",price:109},{label:"1kg",price:206}]},
  {id:"p113",cat:"Vegetables",name:"Fresh Ginger",price:32,unit:"100gm pack",vendor:"v3",img:"/products/p113.jpg",variants:[{label:"250g",price:32},{label:"500g",price:59},{label:"1kg",price:112}]},
  {id:"p115",cat:"Vegetables",name:"Green Peas  Peeled",price:44,unit:"100gm pack",vendor:"v3",img:"/products/p115.jpg",variants:[{label:"250g",price:44},{label:"500g",price:81},{label:"1kg",price:154}]},
  {id:"p116",cat:"Vegetables",name:"Green Peas  In Pod",price:58,unit:"250gm pack",vendor:"v3",img:"/products/p116.jpg",variants:[{label:"250g",price:58},{label:"500g",price:107},{label:"1kg",price:203}]},
  {id:"p118",cat:"Vegetables",name:"Bitter Gourd Green  Small",price:19,unit:"200gm",vendor:"v3",img:"/products/p118.jpg",variants:[{label:"250g",price:19},{label:"500g",price:35},{label:"1kg",price:66}]},
  {id:"p119",cat:"Vegetables",name:"Bitter Gourd Green  Medium",price:9,unit:"130gm",vendor:"v3",img:"/products/p119.jpg",variants:[{label:"250g",price:9},{label:"500g",price:17},{label:"1kg",price:32}]},
  {id:"p120",cat:"Vegetables",name:"Avarekai Pelled",price:108,unit:"180gm | 1pack",vendor:"v3",img:"/products/p120.jpg",variants:[{label:"250g",price:108},{label:"500g",price:200},{label:"1kg",price:378}]},
  {id:"p121",cat:"Vegetables",name:"Kakdi",price:10,unit:"70gm | 1pc",vendor:"v3",img:"/products/p121.jpg",variants:[{label:"1pc",price:10},{label:"2pc",price:19},{label:"4pc",price:36}]},
  {id:"p123",cat:"Vegetables",name:"Lady Finger",price:4,unit:"100gm",vendor:"v3",img:"/products/p123.jpg",variants:[{label:"250g",price:4},{label:"500g",price:7},{label:"1kg",price:14}]},
  {id:"p124",cat:"Vegetables",name:"Bottle Gourd  Long Large",price:45,unit:"720gm | 1pc",vendor:"v3",img:"/products/p124.jpg",variants:[{label:"1pc",price:45},{label:"2pc",price:86},{label:"4pc",price:162}]},
  {id:"p127",cat:"Vegetables",name:"Lemon Local  Small",price:21,unit:"60gm | 2pc",vendor:"v3",img:"/products/p127.jpg",variants:[{label:"1pc",price:21},{label:"2pc",price:40},{label:"4pc",price:76}]},
  {id:"p128",cat:"Vegetables",name:"Lemon Local  Medium",price:26,unit:"70gm |2pc",vendor:"v3",img:"/products/p128.jpg",variants:[{label:"1pc",price:26},{label:"2pc",price:49},{label:"4pc",price:94}]},
  {id:"p129",cat:"Vegetables",name:"Methi Leaves  Sorted",price:53,unit:"125gm | 1pack",vendor:"v3",img:"/products/p129.jpg",variants:[{label:"250g",price:53},{label:"500g",price:98},{label:"1kg",price:186}]},
  {id:"p130",cat:"Vegetables",name:"Methi Leaves  Without Root",price:27,unit:"255gm | 1Bunch",vendor:"v3",img:"/products/p130.jpg",variants:[{label:"1 bunch",price:27},{label:"2 bunch",price:49},{label:"3 bunch",price:86}]},
  {id:"p131",cat:"Vegetables",name:"Methi Leaves  With Root",price:24,unit:"265gm | 1Bunch",vendor:"v3",img:"/products/p131.jpg",variants:[{label:"1 bunch",price:24},{label:"2 bunch",price:43},{label:"3 bunch",price:77}]},
  {id:"p132",cat:"Vegetables",name:"Mint Leaves (Pudina)",price:10,unit:"50gm | 1Bunch",vendor:"v3",img:"/products/p132.jpg",variants:[{label:"1 bunch",price:10},{label:"2 bunch",price:18},{label:"3 bunch",price:32}]},
  {id:"p133",cat:"Vegetables",name:"Mustard Leaves Local",price:18,unit:"200gm | 1pack",vendor:"v3",img:"/products/p133.jpg",variants:[{label:"250g",price:18},{label:"500g",price:33},{label:"1kg",price:63}]},
  {id:"p134",cat:"Vegetables",name:"Onion Nasik  Medium",price:73,unit:"1.0kg",vendor:"v3",img:"/products/p134.jpg",variants:[{label:"250g",price:73},{label:"500g",price:135},{label:"1kg",price:256}]},
  {id:"p135",cat:"Vegetables",name:"Onion Nasik  Large",price:39,unit:"500gm",vendor:"v3",img:"/products/p135.jpg",variants:[{label:"500g",price:19},{label:"1kg",price:35},{label:"3kg",price:99}]},
  {id:"p136",cat:"Vegetables",name:"Onion Nasik  Mix",price:68,unit:"1.0kg",vendor:"v3",img:"/products/p136.jpg",variants:[{label:"250g",price:68},{label:"500g",price:126},{label:"1kg",price:238}]},
  {id:"p137",cat:"Vegetables",name:"Onion Sambar  Whole",price:25,unit:"250gm",vendor:"v3",img:"/products/p137.jpg",variants:[{label:"250g",price:25},{label:"500g",price:46},{label:"1kg",price:88}]},
  {id:"p138",cat:"Vegetables",name:"Onion Sambar  Peeled",price:95,unit:"200gm | 1pack",vendor:"v3",img:"/products/p138.jpg",variants:[{label:"250g",price:95},{label:"500g",price:176},{label:"1kg",price:332}]},
  {id:"p139",cat:"Vegetables",name:"Onion Spring",price:11,unit:"100gm | 1pc",vendor:"v3",img:"/products/p139.jpg",variants:[{label:"1pc",price:11},{label:"2pc",price:21},{label:"4pc",price:40}]},
  {id:"p140",cat:"Vegetables",name:"Onion White  Medium",price:52,unit:"500gm",vendor:"v3",img:"/products/p140.jpg",variants:[{label:"250g",price:52},{label:"500g",price:96},{label:"1kg",price:182}]},
  {id:"p141",cat:"Vegetables",name:"Malabar Spinach",price:23,unit:"250gm",vendor:"v3",img:"/products/p141.jpg",variants:[{label:"250g",price:23},{label:"500g",price:43},{label:"1kg",price:80}]},
  {id:"p142",cat:"Vegetables",name:"Spinach (Palak)  Without Root",price:22,unit:"280gm | 1bunch",vendor:"v3",img:"/products/p142.jpg",variants:[{label:"1 bunch",price:22},{label:"2 bunch",price:40},{label:"3 bunch",price:70}]},
  {id:"p143",cat:"Vegetables",name:"Spinach (Palak)  With Root",price:17,unit:"270gm | 1bunch",vendor:"v3",img:"/products/p143.jpg",variants:[{label:"1 bunch",price:17},{label:"2 bunch",price:31},{label:"3 bunch",price:54}]},
  {id:"p144",cat:"Vegetables",name:"Spinach (Palak)  Chopped",price:51,unit:"250gm | 1pack",vendor:"v3",img:"/products/p144.jpg",variants:[{label:"250g",price:51},{label:"500g",price:94},{label:"1kg",price:178}]},
  {id:"p145",cat:"Vegetables",name:"Potato Agra  Large",price:39,unit:"1.0kg",vendor:"v3",img:"/products/p145.jpg",variants:[{label:"500g",price:22},{label:"1kg",price:40},{label:"3kg",price:110}]},
  {id:"p146",cat:"Vegetables",name:"Potato Agra  Medium",price:34,unit:"1.0kg",vendor:"v3",img:"/products/p146.jpg",variants:[{label:"250g",price:34},{label:"500g",price:63},{label:"1kg",price:119}]},
  {id:"p147",cat:"Vegetables",name:"Potato Agra  Mix",price:29,unit:"1.0kg",vendor:"v3",img:"/products/p147.jpg",variants:[{label:"250g",price:29},{label:"500g",price:54},{label:"1kg",price:102}]},
  {id:"p148",cat:"Vegetables",name:"Potato Baby",price:29,unit:"500gm pack",vendor:"v3",img:"/products/p148.jpg",variants:[{label:"250g",price:29},{label:"500g",price:54},{label:"1kg",price:102}]},
  {id:"p149",cat:"Vegetables",name:"Pumpkin Disco  Whole",price:32,unit:"985gm | 1pc",vendor:"v3",img:"/products/p149.jpg",variants:[{label:"1pc",price:32},{label:"2pc",price:61},{label:"4pc",price:115}]},
  {id:"p150",cat:"Vegetables",name:"Pumpkin Green  Cut",price:33,unit:"200gm pack",vendor:"v3",img:"/products/p150.jpg",variants:[{label:"250g",price:33},{label:"500g",price:61},{label:"1kg",price:116}]},
  {id:"p151",cat:"Vegetables",name:"Raw Banana",price:13,unit:"150-180gm | 1pc",vendor:"v3",img:"/products/p151.jpg",variants:[{label:"1pc",price:13},{label:"2pc",price:25},{label:"4pc",price:47}]},
  {id:"p152",cat:"Vegetables",name:"Raw Papaya",price:47,unit:"965gm | 1pc",vendor:"v3",img:"/products/p152.jpg",variants:[{label:"1pc",price:47},{label:"2pc",price:89},{label:"4pc",price:169}]},
  {id:"p153",cat:"Vegetables",name:"Raw Turmeric (Haldi)",price:11,unit:"50gm | 1pc",vendor:"v3",img:"/products/p153.jpg",variants:[{label:"1pc",price:11},{label:"2pc",price:21},{label:"4pc",price:40}]},
  {id:"p154",cat:"Vegetables",name:"Sprout Horse Gram",price:68,unit:"150gm pack",vendor:"v3",img:"/products/p154.jpg",variants:[{label:"250g",price:68},{label:"500g",price:126},{label:"1kg",price:238}]},
  {id:"p155",cat:"Vegetables",name:"Sprout Moong",price:38,unit:"150gm pack",vendor:"v3",img:"/products/p155.jpg",variants:[{label:"250g",price:38},{label:"500g",price:70},{label:"1kg",price:133}]},
  {id:"p157",cat:"Vegetables",name:"Sweet Potato  Medium",price:15,unit:"150-250gm | 1pc",vendor:"v3",img:"/products/p157.jpg",variants:[{label:"1pc",price:15},{label:"2pc",price:28},{label:"4pc",price:54}]},
  {id:"p158",cat:"Vegetables",name:"Tinda Desi",price:6,unit:"40gm | 1pc",vendor:"v3",img:"/products/p158.jpg",variants:[{label:"1pc",price:6},{label:"2pc",price:11},{label:"4pc",price:22}]},
  {id:"p159",cat:"Vegetables",name:"Tomato Green",price:18,unit:"500gm pack",vendor:"v3",img:"/products/p159.jpg",variants:[{label:"250g",price:18},{label:"500g",price:33},{label:"1kg",price:63}]},
  {id:"p160",cat:"Vegetables",name:"Tomato Hybrid  Mix",price:14,unit:"500gm pack",vendor:"v3",img:"/products/p160.jpg",variants:[{label:"250g",price:14},{label:"500g",price:26},{label:"1kg",price:49}]},
  {id:"p161",cat:"Vegetables",name:"Tomato Hybrid  Large",price:24,unit:"500gm pack",vendor:"v3",img:"/products/p161.jpg",variants:[{label:"250g",price:15},{label:"500g",price:28},{label:"1kg",price:52}]},
  {id:"p162",cat:"Vegetables",name:"Tomato Hybrid  Medium",price:19,unit:"500gm pack",vendor:"v3",img:"/products/p162.jpg",variants:[{label:"250g",price:19},{label:"500g",price:35},{label:"1kg",price:66}]},
  {id:"p163",cat:"Vegetables",name:"Tomato Local  Mix",price:16,unit:"500gm pack",vendor:"v3",img:"/products/p163.jpg",variants:[{label:"250g",price:16},{label:"500g",price:30},{label:"1kg",price:56}]},
  {id:"p164",cat:"Vegetables",name:"Tomato Local  Medium",price:21,unit:"500gm pack",vendor:"v3",img:"/products/p164.jpg",variants:[{label:"250g",price:21},{label:"500g",price:39},{label:"1kg",price:74}]},
  {id:"p165",cat:"Vegetables",name:"Tomato Local  Large",price:26,unit:"500gm pack",vendor:"v3",img:"/products/p165.jpg",variants:[{label:"250g",price:26},{label:"500g",price:48},{label:"1kg",price:91}]},
  {id:"p166",cat:"Vegetables",name:"Tori Ridge Gourd  Large",price:16,unit:"315gm | 1pc",vendor:"v3",img:"/products/p166.jpg",variants:[{label:"1pc",price:16},{label:"2pc",price:30},{label:"4pc",price:58}]},
  {id:"p170",cat:"Exotics",name:"Asparagus",price:36,unit:"100gm",vendor:"v4",img:"/products/p170.jpg",variants:[{label:"1pc",price:36},{label:"2pc",price:68},{label:"3pc",price:97}]},
  {id:"p171",cat:"Exotics",name:"Baby Corn",price:29,unit:"200gm 1pack",vendor:"v4",img:"/products/p171.jpg",variants:[{label:"1 pack",price:29},{label:"2 pack",price:55}]},
  {id:"p172",cat:"Exotics",name:"Bell Pepper  Red",price:52,unit:"165gm | 1pc",vendor:"v4",img:"/products/p172.jpg",variants:[{label:"1pc",price:52},{label:"2pc",price:99},{label:"3pc",price:140}]},
  {id:"p173",cat:"Exotics",name:"Bell Pepper  Yellow",price:51,unit:"180gm |1pc",vendor:"v4",img:"/products/p173.jpg",variants:[{label:"1pc",price:51},{label:"2pc",price:97},{label:"3pc",price:138}]},
  {id:"p174",cat:"Exotics",name:"Celery",price:53,unit:"290gm | 1pc",vendor:"v4",img:"/products/p174.jpg",variants:[{label:"1pc",price:53},{label:"2pc",price:101},{label:"3pc",price:143}]},
  {id:"p175",cat:"Exotics",name:"Chow Chow",price:12,unit:"215gm |1pc",vendor:"v4",img:"/products/p175.jpg",variants:[{label:"1pc",price:12},{label:"2pc",price:23},{label:"3pc",price:32}]},
  {id:"p176",cat:"Exotics",name:"Dill leaves (Soya Saag)",price:39,unit:"250gm",vendor:"v4",img:"/products/p176.jpg",variants:[{label:"1pc",price:39},{label:"2pc",price:74},{label:"3pc",price:105}]},
  {id:"p177",cat:"Exotics",name:"Cherry Tomato  Red",price:52,unit:"200gm | 1pack",vendor:"v4",img:"/products/p177.jpg",variants:[{label:"1 pack",price:52},{label:"2 pack",price:99}]},
  {id:"p178",cat:"Exotics",name:"Dragon Fruit  White Inside",price:100,unit:"300gm | 1pc",vendor:"v4",img:"/products/p178.jpg",variants:[{label:"1pc",price:100},{label:"2pc",price:190},{label:"3pc",price:270}]},
  {id:"p179",cat:"Exotics",name:"Dragon Fruit  Red Inside",price:82,unit:"250-350gm | 1pc",vendor:"v4",img:"/products/p179.jpg",variants:[{label:"1pc",price:82},{label:"2pc",price:156},{label:"3pc",price:221}]},
  {id:"p181",cat:"Exotics",name:"Cabbage Purple",price:128,unit:"890gm | 1pc",vendor:"v4",img:"/products/p181.jpg",variants:[{label:"1pc",price:128},{label:"2pc",price:243},{label:"3pc",price:346}]},
  {id:"p182",cat:"Exotics",name:"Figs (Anjeer)",price:72,unit:"250gm |1pc",vendor:"v4",img:"/products/p182.jpg",variants:[{label:"1pc",price:72},{label:"2pc",price:137},{label:"3pc",price:194}]},
  {id:"p184",cat:"Exotics",name:"Gongura Leaves",price:10,unit:"100gm",vendor:"v4",img:"/products/p184.jpg",variants:[{label:"1pc",price:10},{label:"2pc",price:19},{label:"3pc",price:27}]},
  {id:"p186",cat:"Exotics",name:"Italian Basil",price:9,unit:"50gm",vendor:"v4",img:"/products/p186.jpg",variants:[{label:"1pc",price:9},{label:"2pc",price:17},{label:"3pc",price:24}]},
  {id:"p187",cat:"Exotics",name:"Kiwi Zespri  Gold  Imported",price:220,unit:"3pc pack",vendor:"v4",img:"/products/p187.jpg",variants:[{label:"1 pack",price:220},{label:"2 pack",price:418}]},
  {id:"p190",cat:"Exotics",name:"Lettuce Green",price:16,unit:"80gm | 1pc",vendor:"v4",img:"/products/p190.jpg",variants:[{label:"1pc",price:16},{label:"2pc",price:30},{label:"3pc",price:43}]},
  {id:"p191",cat:"Exotics",name:"Lettuce Icebereg",price:68,unit:"455gm | 1pc",vendor:"v4",img:"/products/p191.jpg",variants:[{label:"1pc",price:68},{label:"2pc",price:129},{label:"3pc",price:184}]},
  {id:"p192",cat:"Exotics",name:"Lettuce Romaine",price:16,unit:"115gm | 1pc",vendor:"v4",img:"/products/p192.jpg",variants:[{label:"1pc",price:16},{label:"2pc",price:30},{label:"3pc",price:43}]},
  {id:"p193",cat:"Exotics",name:"Neem Leaves",price:20,unit:"50gm 1bunch",vendor:"v4",img:"/products/p193.jpg",variants:[{label:"1 bunch",price:20},{label:"2 bunch",price:37}]},
  {id:"p194",cat:"Exotics",name:"Parsley Curly",price:11,unit:"50gm",vendor:"v4",img:"/products/p194.jpg",variants:[{label:"1pc",price:11},{label:"2pc",price:21},{label:"3pc",price:30}]},
  {id:"p195",cat:"Exotics",name:"Passion Fruit  Regular",price:33,unit:"115gm | 1pc",vendor:"v4",img:"/products/p195.jpg",variants:[{label:"1pc",price:33},{label:"2pc",price:63},{label:"3pc",price:89}]},
  {id:"p196",cat:"Exotics",name:"Rosemary Leaves",price:60,unit:"50gm bunch",vendor:"v4",img:"/products/p196.jpg",variants:[{label:"1 bunch",price:60},{label:"2 bunch",price:111}]},
  {id:"p197",cat:"Exotics",name:"Tapioca",price:10,unit:"250gm",vendor:"v4",img:"/products/p197.jpg",variants:[{label:"1pc",price:10},{label:"2pc",price:19},{label:"3pc",price:27}]},
  {id:"p198",cat:"Exotics",name:"Thyme Leaves",price:99,unit:"100gm",vendor:"v4",img:"/products/p198.jpg",variants:[{label:"1pc",price:99},{label:"2pc",price:188},{label:"3pc",price:267}]},
  {id:"p201",cat:"Spices",name:"Ajwain (Carom Seeds) Whole",price:50,unit:"50gm | 1pc",vendor:"v5",img:"/products/p201.jpg",variants:[{label:"50g",price:50},{label:"100g",price:90},{label:"250g",price:160}]},
  {id:"p202",cat:"Spices",name:"Amchur Powder  Premium",price:70,unit:"80gm | 1pc",vendor:"v5",img:"/products/p202.jpg",variants:[{label:"50g",price:70},{label:"100g",price:126},{label:"250g",price:224}]},
  {id:"p203",cat:"Spices",name:"Black Mustard Seeds  Whole",price:25,unit:"50gm | 1pc",vendor:"v5",img:"/products/p203.jpg",variants:[{label:"50g",price:25},{label:"100g",price:45},{label:"250g",price:80}]},
  {id:"p204",cat:"Spices",name:"Cardamom Green  Whole",price:331,unit:"50gm | 1pc",vendor:"v5",img:"/products/p204.jpg",variants:[{label:"10g",price:49},{label:"25g",price:109},{label:"50g",price:199}]},
  {id:"p205",cat:"Spices",name:"Cinnamon Bark Kerala  Pounded",price:80,unit:"80gm | 1pc",vendor:"v5",img:"/products/p205.jpg",variants:[{label:"50g",price:80},{label:"100g",price:144},{label:"250g",price:256}]},
  {id:"p206",cat:"Spices",name:"Cinnamon Cassia Imported  Whole",price:45,unit:"30gm | 1pc",vendor:"v5",img:"/products/p206.jpg",variants:[{label:"50g",price:45},{label:"100g",price:81},{label:"250g",price:144}]},
  {id:"p207",cat:"Spices",name:"Clove  White",price:125,unit:"50gm | 1pc",vendor:"v5",img:"/products/p207.jpg",variants:[{label:"50g",price:125},{label:"100g",price:225},{label:"250g",price:400}]},
  {id:"p208",cat:"Spices",name:"Coriander Kota Bold  Whole",price:45,unit:"50gm | 1pc",vendor:"v5",img:"/products/p208.jpg",variants:[{label:"100g",price:25},{label:"250g",price:55},{label:"500g",price:99}]},
  {id:"p209",cat:"Spices",name:"Coriander Kota Bold  Pounded",price:60,unit:"80gm | 1pc",vendor:"v5",img:"/products/p209.jpg",variants:[{label:"50g",price:60},{label:"100g",price:108},{label:"250g",price:192}]},
  {id:"p210",cat:"Spices",name:"Coriander Kota Bold  Ground",price:45,unit:"80gm | 1pc",vendor:"v5",img:"/products/p210.jpg",variants:[{label:"50g",price:45},{label:"100g",price:81},{label:"250g",price:144}]},
  {id:"p211",cat:"Spices",name:"Cumin Rajasthan Bold  Whole",price:55,unit:"50gm | 1pc",vendor:"v5",img:"/products/p211.jpg",variants:[{label:"100g",price:39},{label:"250g",price:89},{label:"500g",price:169}]},
  {id:"p212",cat:"Spices",name:"Cumin Rajasthan Bold  Pounded",price:75,unit:"80gm | 1pc",vendor:"v5",img:"/products/p212.jpg",variants:[{label:"50g",price:75},{label:"100g",price:135},{label:"250g",price:240}]},
  {id:"p213",cat:"Spices",name:"Cumin Rajasthan Bold  Ground",price:80,unit:"80gm | 1pc",vendor:"v5",img:"/products/p213.jpg",variants:[{label:"50g",price:80},{label:"100g",price:144},{label:"250g",price:256}]},
  {id:"p214",cat:"Spices",name:"Kasuri Methi  Whole",price:30,unit:"20gm | 1pc",vendor:"v5",img:"/products/p214.jpg",variants:[{label:"50g",price:30},{label:"100g",price:54},{label:"250g",price:96}]},
  {id:"p215",cat:"Spices",name:"Methi Dana (Fenugreek) Whole",price:30,unit:"50gm | 1pc",vendor:"v5",img:"/products/p215.jpg",variants:[{label:"50g",price:30},{label:"100g",price:54},{label:"250g",price:96}]},
  {id:"p216",cat:"Spices",name:"Black Pepper Malabar MG1  Whole",price:108,unit:"50gm | 1portion",vendor:"v5",img:"/products/p216.jpg",variants:[{label:"50g",price:59},{label:"100g",price:109},{label:"250g",price:259}]},
  {id:"p217",cat:"Spices",name:"Black Pepper Malabar MG1  Pounded",price:170,unit:"80gm | 1pc",vendor:"v5",img:"/products/p217.jpg",variants:[{label:"50g",price:170},{label:"100g",price:306},{label:"250g",price:544}]},
  {id:"p218",cat:"Spices",name:"Black Pepper Malabar MG1  Ground",price:140,unit:"80gm | 1pc",vendor:"v5",img:"/products/p218.jpg",variants:[{label:"50g",price:140},{label:"100g",price:252},{label:"250g",price:448}]},
  {id:"p219",cat:"Spices",name:"Red chilli Guntur Teja  Whole",price:50,unit:"30gm | 1portion",vendor:"v5",img:"/products/p219.jpg",variants:[{label:"50g",price:50},{label:"100g",price:90},{label:"250g",price:160}]},
  {id:"p220",cat:"Spices",name:"Red chilli Guntur Teja  Pounded",price:80,unit:"80gm 1portion",vendor:"v5",img:"/products/p220.jpg",variants:[{label:"50g",price:80},{label:"100g",price:144},{label:"250g",price:256}]},
  {id:"p221",cat:"Spices",name:"Red chilli Guntur Teja  Ground",price:56,unit:"80gm 1portion",vendor:"v5",img:"/products/p221.jpg",variants:[{label:"100g",price:45},{label:"250g",price:99},{label:"500g",price:185}]},
  {id:"p222",cat:"Spices",name:"Red Chilli Kashmiri  Pounded",price:100,unit:"80gm 1portion",vendor:"v5",img:"/products/p222.jpg",variants:[{label:"50g",price:100},{label:"100g",price:180},{label:"250g",price:320}]},
  {id:"p223",cat:"Spices",name:"Red Chilli Kashmiri  Pounded",price:80,unit:"80gm 1portion",vendor:"v5",img:"/products/p223.jpg",variants:[{label:"50g",price:80},{label:"100g",price:144},{label:"250g",price:256}]},
  {id:"p224",cat:"Spices",name:"Turmeric Pounded",price:55,unit:"80gm 1portion",vendor:"v5",img:"/products/p224.jpg",variants:[{label:"50g",price:55},{label:"100g",price:99},{label:"250g",price:176}]},
  {id:"p225",cat:"Spices",name:"Turmeric Ground",price:43,unit:"80gm 1portion",vendor:"v5",img:"/products/p225.jpg",variants:[{label:"100g",price:29},{label:"250g",price:65},{label:"500g",price:119}]},
  {id:"p226",cat:"Spices",name:"Yellow Mustard Seeds  Whole",price:25,unit:"50gm | 1 portion",vendor:"v5",img:"/products/p226.jpg",variants:[{label:"50g",price:25},{label:"100g",price:45},{label:"250g",price:80}]},
  {id:"p227",cat:"Spices",name:"Fresh Wild Forest Honey",price:350,unit:"500gm |1 portion",vendor:"v5",img:"/products/p227.jpg",variants:[{label:"100g",price:88},{label:"250g",price:193},{label:"500g",price:350}]},
  {id:"p228",cat:"Spices",name:"Black Mustard Oil",price:249,unit:"500ml",vendor:"v5",img:"/products/p228.jpg",variants:[{label:"500ml",price:89},{label:"1L",price:169}]},
  {id:"p229",cat:"Spices",name:"Black Mustard Oil",price:449,unit:"1Liter",vendor:"v5",img:"/products/p229.jpg",variants:[{label:"500ml",price:89},{label:"1L",price:169}]},
  {id:"p230",cat:"Spices",name:"Coconut Oil",price:599,unit:"500ml | 1portion",vendor:"v5",img:"/products/p230.jpg",variants:[{label:"500ml",price:110},{label:"1L",price:210},{label:"2L",price:399}]},
  {id:"p231",cat:"Spices",name:"Extra Virgin Olive Oil",price:399,unit:"250ml | 1portion",vendor:"v5",img:"/products/p231.jpg",variants:[{label:"250ml",price:199},{label:"500ml",price:379}]},
  {id:"p232",cat:"Spices",name:"Peanut Oil",price:279,unit:"500ml | 1portion",vendor:"v5",img:"/products/p232.jpg",variants:[{label:"500ml",price:95},{label:"1L",price:180},{label:"2L",price:349}]},
  {id:"p233",cat:"Spices",name:"Peanut Oil",price:499,unit:"1Liter | 1portion",vendor:"v5",img:"/products/p233.jpg",variants:[{label:"500ml",price:95},{label:"1L",price:180},{label:"2L",price:349}]},
  {id:"p234",cat:"Spices",name:"Sesame Oil",price:349,unit:"500ml | 1portion",vendor:"v5",img:"/products/p234.jpg",variants:[{label:"500ml",price:130},{label:"1L",price:249}]},
  {id:"p235",cat:"Spices",name:"Yellow Mustard Oil",price:299,unit:"500ml | 1portion",vendor:"v5",img:"/products/p235.jpg",variants:[{label:"500ml",price:85},{label:"1L",price:159}]},
  {id:"p236",cat:"Spices",name:"Yellow Mustard Oil",price:549,unit:"1Liter | 1portion",vendor:"v5",img:"/products/p236.jpg",variants:[{label:"500ml",price:85},{label:"1L",price:159}]},
  {id:"p237",cat:"Flowers",name:"Bel Patta",price:7,unit:"10gm",vendor:"v6",img:"/products/p237.jpg",variants:[{label:"50g",price:7},{label:"100g",price:13},{label:"250g",price:29}]},
  {id:"p238",cat:"Flowers",name:"Chrysanthemum & Rose Flower String",price:116,unit:"1pc",vendor:"v6",img:"/products/p238.jpg",variants:[{label:"1 pc",price:116},{label:"2 pc",price:220},{label:"5 pc",price:522}]},
  {id:"p239",cat:"Flowers",name:"Marigold Mala  Orange",price:50,unit:"1pc",vendor:"v6",img:"/products/p239.jpg",variants:[{label:"1 pc",price:50},{label:"2 pc",price:95},{label:"5 pc",price:225}]},
  {id:"p240",cat:"Flowers",name:"Tulsi Garland",price:54,unit:"1pc",vendor:"v6",img:"/products/p240.jpg",variants:[{label:"1 pc",price:54},{label:"2 pc",price:103},{label:"5 pc",price:243}]},
  {id:"p241",cat:"Flowers",name:"Yellow Chrysanthemum String",price:89,unit:"1pc",vendor:"v6",img:"/products/p241.jpg",variants:[{label:"1 pc",price:89},{label:"2 pc",price:169},{label:"5 pc",price:400}]},
  {id:"p242",cat:"Flowers",name:"Betel Leaves",price:50,unit:"5pc",vendor:"v6",img:"/products/p242.jpg",variants:[{label:"50g",price:50},{label:"100g",price:92},{label:"250g",price:210}]},
  {id:"p243",cat:"Flowers",name:"Mango Leaves",price:22,unit:"1bunch",vendor:"v6",img:"/products/p243.jpg",variants:[{label:"50g",price:22},{label:"100g",price:41},{label:"250g",price:92}]},
  {id:"p244",cat:"Flowers",name:"Fresh Lotus Flower",price:30,unit:"1pc",vendor:"v6",img:"/products/p244.jpg",variants:[{label:"50g",price:30},{label:"100g",price:56},{label:"250g",price:126}]},
  {id:"p245",cat:"Flowers",name:"Kanakambaram Flowers",price:133,unit:"50gm",vendor:"v6",img:"/products/p245.jpg",variants:[{label:"50g",price:133},{label:"100g",price:246},{label:"250g",price:559}]},
  {id:"p246",cat:"Flowers",name:"Marigold  Mix",price:3,unit:"50gm",vendor:"v6",img:"/products/p246.jpg",variants:[{label:"50g",price:3},{label:"100g",price:6},{label:"250g",price:13}]},
  {id:"p247",cat:"Flowers",name:"Marigold  Orange",price:3,unit:"50gm",vendor:"v6",img:"/products/p247.jpg",variants:[{label:"50g",price:3},{label:"100g",price:6},{label:"250g",price:13}]},
  {id:"p248",cat:"Flowers",name:"Marigold  Yellow",price:3,unit:"50gm",vendor:"v6",img:"/products/p248.jpg",variants:[{label:"50g",price:3},{label:"100g",price:6},{label:"250g",price:13}]},
  {id:"p249",cat:"Flowers",name:"Pooja Flower Mix",price:91,unit:"1pack",vendor:"v6",img:"/products/p249.jpg",variants:[{label:"50g",price:91},{label:"100g",price:168},{label:"250g",price:382}]},
  {id:"p250",cat:"Flowers",name:"Rajanigandha",price:22,unit:"50gm",vendor:"v6",img:"/products/p250.jpg",variants:[{label:"50g",price:22},{label:"100g",price:41},{label:"250g",price:92}]},
  {id:"p251",cat:"Flowers",name:"Rose Without Stem  Red",price:25,unit:"50gm",vendor:"v6",img:"/products/p251.jpg",variants:[{label:"50g",price:25},{label:"100g",price:46},{label:"250g",price:105}]},
  {id:"p252",cat:"Flowers",name:"Rose Without Stem  Yellow",price:30,unit:"50gm",vendor:"v6",img:"/products/p252.jpg",variants:[{label:"50g",price:30},{label:"100g",price:56},{label:"250g",price:126}]},
  {id:"p253",cat:"Flowers",name:"Rose Petals  Red",price:9,unit:"20gm",vendor:"v6",img:"/products/p253.jpg",variants:[{label:"50g",price:9},{label:"100g",price:17},{label:"250g",price:38}]},
  {id:"p254",cat:"Flowers",name:"Rose Petals  Mix",price:23,unit:"50gm",vendor:"v6",img:"/products/p254.jpg",variants:[{label:"50g",price:23},{label:"100g",price:43},{label:"250g",price:97}]},
  {id:"p255",cat:"Flowers",name:"Tulsi Leaves",price:11,unit:"20gm",vendor:"v6",img:"/products/p255.jpg",variants:[{label:"50g",price:11},{label:"100g",price:20},{label:"250g",price:46}]}
];

const KN_NAMES = {"A2 Desi Cow Bilona Ghee":"A2 ದೇಸಿ ಹಸು ಬಿಲೋನ ತುಪ್ಪ","A2 Desi Cow Bilona Ghee 2nd variant":"A2 ದೇಸಿ ಹಸು ಬಿಲೋನ ತುಪ್ಪ (2)","Buffalo Ghee":"ಕೋಣ ತುಪ್ಪ","Fresh Malai Paneer":"ತಾಜಾ ಮಲಾಯ್ ಪನೀರ್","Fresh White Butter":"ತಾಜಾ ಬಿಳಿ ಬೆಣ್ಣೆ","Apple Green Granny Smith Imported":"ಹಸಿರು ಸೇಬು (ಆಮದು)","Apple Pink Lady Imported":"ಗುಲಾಬಿ ಸೇಬು (ಆಮದು)","Apple Red Delicious Peti":"ಕೆಂಪು ಸೇಬು (ಪೆಟ್ಟಿ)","Apple Red Delicious Regular":"ಕೆಂಪು ಸೇಬು","Apple Royal Gala":"ರಾಯಲ್ ಗಾಲಾ ಸೇಬು","Apple Royal Gala 2nd variant":"ರಾಯಲ್ ಗಾಲಾ ಸೇಬು (2)","Apple Washington Imported":"ವಾಷಿಂಗ್ಟನ್ ಸೇಬು","Apple Washington Peti":"ವಾಷಿಂಗ್ಟನ್ ಸೇಬು (ಪೆಟ್ಟಿ)","Amla":"ನೆಲ್ಲಿಕಾಯಿ","Banana Nendran":"ನೇಂದ್ರ ಬಾಳೆ","Banana Red":"ಕೆಂಪು ಬಾಳೆ","Banana Robusta  Medium Semi - ripe":"ರೊಬಸ್ಟಾ ಬಾಳೆ (ಮಧ್ಯಮ)","Banana Robusta  Small Semi - ripe":"ರೊಬಸ್ಟಾ ಬಾಳೆ (ಚಿಕ್ಕ)","Banana Yelakki":"ಯೆಲಕ್ಕಿ ಬಾಳೆ","Blueberry  Imported  Jumbo":"ಬ್ಲೂಬೆರ್ರಿ (ಆಮದು)","Dragon Fruit  Red Inside":"ಡ್ರ್ಯಾಗನ್ ಹಣ್ಣು (ಕೆಂಪು)","Dragon Fruit  White Inside":"ಡ್ರ್ಯಾಗನ್ ಹಣ್ಣು (ಬಿಳಿ)","Figs (Anjeer)":"ಅಂಜೂರ","Fresh Coconut Water  Green  Without Malai":"ತಾಜಾ ತೆಂಗಿನ ನೀರು","Fresh Wild Forest Honey":"ಅರಣ್ಯ ಜೇನುತುಪ್ಪ","Grape Fruit  Imported":"ದ್ರಾಕ್ಷಾಹಣ್ಣು (ಆಮದು)","Grapefruit  Imported":"ಗ್ರೇಪ್‌ಫ್ರೂಟ್ (ಆಮದು)","Grapes Bangalore Blue":"ಬೆಂಗಳೂರು ನೀಲಿ ದ್ರಾಕ್ಷಿ","Grapes Muscat Shine  Imported":"ಮಸ್ಕತ್ ದ್ರಾಕ್ಷಿ (ಆಮದು)","Graped Red Globe  Imported":"ಕೆಂಪು ದ್ರಾಕ್ಷಿ (ಆಮದು)","Graped Red Globe  India":"ಕೆಂಪು ದ್ರಾಕ್ಷಿ (ಭಾರತ)","Guavas Thai  Pink  Semi-ripe":"ಥಾಯ್ ಗೋಯಾ (ಗುಲಾಬಿ)","Guavas Thai  White  Semi-ripe":"ಥಾಯ್ ಗೋಯಾ (ಬಿಳಿ)","Kiwi Green  Regular":"ಕಿವಿ (ಹಸಿರು)","Kiwi Zespri  Gold  Imported":"ಕಿವಿ ಚಿನ್ನ (ಆಮದು)","Kiwi Zespri  Green  Imported":"ಕಿವಿ ಹಸಿರು (ಆಮದು)","Longan Thailand  Imported":"ಲೊಂಗನ್ (ಆಮದು)","Muskmelon Honey":"ಜೇನು ಕರ್ಬೂಜ","Orange Valencia  Imported Premium":"ವಲೆನ್ಸಿಯಾ ಕಿತ್ತಳೆ (ಶ್ರೇಷ್ಠ)","Orange Valencia  Imported Regular":"ವಲೆನ್ಸಿಯಾ ಕಿತ್ತಳೆ","Ornage Mini Mandarin  Imported":"ಮಿನಿ ಮ್ಯಾಂಡರಿನ್ (ಆಮದು)","Papaya Disco  Large Semi - ripe":"ಡಿಸ್ಕೊ ಪಪ್ಪಾಯ (ದೊಡ್ಡ)","Papaya Disco  Medium Semi - ripe":"ಡಿಸ್ಕೊ ಪಪ್ಪಾಯ (ಮಧ್ಯಮ)","Papaya Red Lady  Large Semi - ripe":"ರೆಡ್ ಲೇಡಿ ಪಪ್ಪಾಯ (ದೊಡ್ಡ)","Papaya Red Lady  Medium Semi - ripe":"ರೆಡ್ ಲೇಡಿ ಪಪ್ಪಾಯ (ಮಧ್ಯಮ)","Passion Fruit  Regular":"ಪ್ಯಾಶನ್ ಹಣ್ಣು","Pear Beauty  Imported":"ಬ್ಯೂಟಿ ಪೇರಳೆ (ಆಮದು)","Pear Nashpati":"ನಾಶಪತಿ ಪೇರಳೆ","Pear Packham":"ಪ್ಯಾಕ್‌ಹ್ಯಾಮ್ ಪೇರಳೆ","Pineapple  Semi-ripe":"ಅನಾನಸ್","Pineapple Baby  Semi-ripe":"ಬೇಬಿ ಅನಾನಸ್","Pineapple Cut Slice":"ಅನಾನಸ್ ಚೂರು","Pomegranate  Arils":"ದಾಳಿಂಬೆ ಕಾಳುಗಳು","Pomegranate  Premium":"ದಾಳಿಂಬೆ (ಶ್ರೇಷ್ಠ)","Pomegranate  Regular":"ದಾಳಿಂಬೆ","Sapota (Chikoo) Regular":"ಚಿಕ್ಕು","Sweet Lime (Mosambi)  Large":"ಮೊಸಂಬಿ (ದೊಡ್ಡ)","Sweet Lime (Mosambi)  Small":"ಮೊಸಂಬಿ (ಚಿಕ್ಕ)","Sweet Tamarind (Imli)":"ಮಿಠಾ ಹುಣಸೆ","Watermelon Kiran":"ಕಿರಣ್ ಕಲ್ಲಂಗಡಿ","Wood Apple":"ಬಿಳ್ ಹಣ್ಣು","Amaranthus  Green":"ಹಸಿರು ದಂಟು","Amaranthus  Red":"ಕೆಂಪು ದಂಟು","Ash Gourd  Cut":"ಬೂದು ಕುಂಬಳ (ಕಟ್)","Ash Gourd  Whole":"ಬೂದು ಕುಂಬಳ","Asparagus":"ಅಸ್ಪರಾಗಸ್","Avarekai Pelled":"ಅವರೆಕಾಯಿ (ಸುಲಿದ)","Baby Carrot Ooty":"ಬೇಬಿ ಕ್ಯಾರೆಟ್ (ಊಟಿ)","Baby Corn":"ಬೇಬಿ ಜೋಳ","Banana Flower":"ಬಾಳೆ ಹೂ","Banana Leaves":"ಬಾಳೆ ಎಲೆ","Banana Stem":"ಬಾಳೆ ದಿಂಡು","Beans Broad":"ಅಗಲ ಹುರಳಿ","Beans Ceanberry":"ಕ್ರೆನ್‌ಬೆರ್ರಿ ಬೀನ್ಸ್","Beans French (Harikot)":"ಫ್ರೆಂಚ್ ಬೀನ್ಸ್","Beans French Hybrid":"ಫ್ರೆಂಚ್ ಬೀನ್ಸ್ (ಹೈಬ್ರಿಡ್)","Beans Gwar (Cluster Beans)":"ಗೋರಿಕಾಯಿ","Beans Lobia":"ಅಲಸಂದೆ","Beetroot Local  Large":"ಬೀಟ್‌ರೂಟ್ (ದೊಡ್ಡ)","Beetroot Local  Medium":"ಬೀಟ್‌ರೂಟ್ (ಮಧ್ಯಮ)","Beetroot Ooty":"ಊಟಿ ಬೀಟ್‌ರೂಟ್","Bel Patta":"ಬಿಲ್ವ ಎಲೆ","Bell Pepper  Red":"ಕೆಂಪು ಕ್ಯಾಪ್ಸಿಕಂ","Bell Pepper  Yellow":"ಹಳದಿ ಕ್ಯಾಪ್ಸಿಕಂ","Betel Leaves":"ವೀಳ್ಯದೆಲೆ","Bitter Gourd Green  Medium":"ಹಾಗಲಕಾಯಿ (ಮಧ್ಯಮ)","Bitter Gourd Green  Small":"ಹಾಗಲಕಾಯಿ (ಚಿಕ್ಕ)","Bottle Gourd  Long Large":"ಸೋರೆಕಾಯಿ (ದೊಡ್ಡ)","Bottle Gourd  Long Medium":"ಸೋರೆಕಾಯಿ (ಮಧ್ಯಮ)","Bottle Gourd  Long Small":"ಸೋರೆಕಾಯಿ (ಚಿಕ್ಕ)","Bringal Purple  Stripe":"ಕೆಂಪು ಬದನೆ (ಪಟ್ಟೆ)","Brinjal Green  Long":"ಹಸಿರು ಬದನೆ (ಉದ್ದ)","Brinjal Green  Stripe":"ಹಸಿರು ಬದನೆ (ಪಟ್ಟೆ)","Brinjal Purple  Bharta":"ನೇರಳೆ ಬದನೆ (ಭರ್ತಾ)","Brinjal Purple  Long":"ನೇರಳೆ ಬದನೆ (ಉದ್ದ)","Cabbage Chinese":"ಚೀನಿ ಎಲೆಕೋಸು","Cabbage Desi":"ದೇಸಿ ಎಲೆಕೋಸು","Cabbage Purple":"ನೇರಳೆ ಎಲೆಕೋಸು","Cariander (Kothambari Soppu) With Root":"ಕೊತ್ತಂಬರಿ ಸೊಪ್ಪು (ಬೇರಿನ ಸಹಿತ)","Cariander (Kothambari Soppu) Without Root":"ಕೊತ್ತಂಬರಿ ಸೊಪ್ಪು","Carrot Ooty":"ಊಟಿ ಕ್ಯಾರೆಟ್","Carrot Orange":"ಕಿತ್ತಳೆ ಕ್ಯಾರೆಟ್","Celery":"ಸೆಲೆರಿ","Cherry Tomato  Red":"ಚೆರ್ರಿ ಟೊಮ್ಯಾಟೊ","Chilli Akash Green":"ಆಕಾಶ್ ಹಸಿ ಮೆಣಸಿನಕಾಯಿ","Chilli Green Bhajji":"ಭಜ್ಜಿ ಮೆಣಸಿನಕಾಯಿ","Chilli Green":"ಹಸಿ ಮೆಣಸಿನಕಾಯಿ","Chow Chow":"ಚೋ ಚೋ","Coccinia (Thondekaayi)":"ತೊಂಡೆಕಾಯಿ","Coconut Brown  Large":"ತೆಂಗಿನಕಾಯಿ (ದೊಡ್ಡ)","Coconut Brown  Medium":"ತೆಂಗಿನಕಾಯಿ (ಮಧ್ಯಮ)","Cocunut Brown  Chunks":"ತೆಂಗಿನಕಾಯಿ ತುಂಡು","Cocunut Brown  Grated":"ತೆಂಗಿನಕಾಯಿ ತುರಿ","Colocasia (Arbi) Roots":"ಕೆಸವಿನ ಗೆಡ್ಡೆ","Cucumber English":"ಇಂಗ್ಲಿಷ್ ಸೌತೆಕಾಯಿ","Cucumber Green":"ಹಸಿರು ಸೌತೆಕಾಯಿ","Cucumber Mangalore":"ಮಂಗಳೂರು ಸೌತೆ","Curry Leaves":"ಕರಿಬೇವು","Dill leaves (Soya Saag)":"ಸೋಪ್ಪು ಎಲೆ","Drumstick":"ನುಗ್ಗೆಕಾಯಿ","Drumstick  Leaves":"ನುಗ್ಗೆ ಸೊಪ್ಪು","Fresh Ginger":"ಅಲ್ಲಂ","Garlic Local":"ಬೆಳ್ಳುಳ್ಳಿ (ಸ್ಥಳೀಯ)","Garlic Ooty  Peeled":"ಊಟಿ ಬೆಳ್ಳುಳ್ಳಿ (ಸುಲಿದ)","Ginger Thai":"ಥಾಯ್ ಶುಂಠಿ","Gongura Leaves":"ಗೊಂಗೂರ ಸೊಪ್ಪು","Green Peas  In Pod":"ಬಟಾಣಿ (ಹಸಿ)","Green Peas  Peeled":"ಬಟಾಣಿ (ಸುಲಿದ)","Italian Basil":"ಇಟಲಿ ತುಳಸಿ","Kakdi":"ಕಾಕಡಿ","Kantola (Spine Gourd)":"ಕಂಟೋಲ","Knol Khol":"ನವಿಲುಕೋಸು","Lady Finger":"ಬೆಂಡೆಕಾಯಿ","Leek":"ಲೀಕ್","Lemon Grass":"ಲೆಮನ್ ಗ್ರಾಸ್","Lemon Local  Medium":"ನಿಂಬೆಹಣ್ಣು (ಮಧ್ಯಮ)","Lemon Local  Small":"ನಿಂಬೆಹಣ್ಣು (ಚಿಕ್ಕ)","Lettuce Green":"ಹಸಿರು ಲೆಟ್ಯೂಸ್","Lettuce Icebereg":"ಐಸ್‌ಬರ್ಗ್ ಲೆಟ್ಯೂಸ್","Lettuce Romaine":"ರೊಮೇನ್ ಲೆಟ್ಯೂಸ್","Malabar Spinach":"ಬಸಳೆ","Mango Leaves":"ಮಾವಿನ ಎಲೆ","Methi Leaves  Sorted":"ಮೆಂತ್ಯೆ ಸೊಪ್ಪು (ಸ್ವಚ್ಛ)","Methi Leaves  With Root":"ಮೆಂತ್ಯೆ ಸೊಪ್ಪು (ಬೇರಿನ ಸಹಿತ)","Methi Leaves  Without Root":"ಮೆಂತ್ಯೆ ಸೊಪ್ಪು","Mint Leaves (Pudina)":"ಪುದೀನ","Mustard Leaves Local":"ಸಾಸಿವೆ ಸೊಪ್ಪು","Neem Leaves":"ಬೇವಿನ ಎಲೆ","Onion Nasik  Large":"ನಾಸಿಕ್ ಈರುಳ್ಳಿ (ದೊಡ್ಡ)","Onion Nasik  Medium":"ನಾಸಿಕ್ ಈರುಳ್ಳಿ (ಮಧ್ಯಮ)","Onion Nasik  Mix":"ನಾಸಿಕ್ ಈರುಳ್ಳಿ (ಮಿಕ್ಸ್)","Onion Sambar  Peeled":"ಸಾಂಬಾರ್ ಈರುಳ್ಳಿ (ಸುಲಿದ)","Onion Sambar  Whole":"ಸಾಂಬಾರ್ ಈರುಳ್ಳಿ","Onion Spring":"ಹಸಿ ಈರುಳ್ಳಿ","Onion White  Medium":"ಬಿಳಿ ಈರುಳ್ಳಿ","Parsley Curly":"ಪಾರ್ಸ್ಲಿ","Potato Agra  Large":"ಆಗ್ರಾ ಆಲೂಗಡ್ಡೆ (ದೊಡ್ಡ)","Potato Agra  Medium":"ಆಗ್ರಾ ಆಲೂಗಡ್ಡೆ (ಮಧ್ಯಮ)","Potato Agra  Mix":"ಆಗ್ರಾ ಆಲೂಗಡ್ಡೆ (ಮಿಕ್ಸ್)","Potato Baby":"ಬೇಬಿ ಆಲೂಗಡ್ಡೆ","Pumpkin Disco  Whole":"ಡಿಸ್ಕೊ ಕುಂಬಳಕಾಯಿ","Pumpkin Green  Cut":"ಹಸಿರು ಕುಂಬಳ (ಕಟ್)","Raw Banana":"ಕಚ್ಚಾ ಬಾಳೆ","Raw Papaya":"ಕಚ್ಚಾ ಪಪ್ಪಾಯ","Raw Turmeric (Haldi)":"ಕಚ್ಚಾ ಅರಿಶಿನ","Rosemary Leaves":"ರೋಸ್‌ಮೆರಿ","Spinach (Palak)  Chopped":"ಪಾಲಕ್ (ಹೆಚ್ಚಿದ)","Spinach (Palak)  With Root":"ಪಾಲಕ್ (ಬೇರಿನ ಸಹಿತ)","Spinach (Palak)  Without Root":"ಪಾಲಕ್","Sprout Horse Gram":"ಹುರಳಿ ಮೊಳಕೆ","Sprout Mix":"ಮಿಶ್ರ ಮೊಳಕೆ","Sprout Moong":"ಹೆಸರು ಮೊಳಕೆ","Sugarcane":"ಕಬ್ಬು","Sweet Corn (Bhutta)  Cob Large":"ಜೋಳದ ಕಂಬ (ದೊಡ್ಡ)","Sweet Corn (Bhutta)  Cob Medium":"ಜೋಳದ ಕಂಬ (ಮಧ್ಯಮ)","Sweet Corn (Bhutta)  Kernels":"ಜೋಳ ಕಾಳು","Sweet Potato  Medium":"ಸಿಹಿ ಗೆಣಸು","Tapioca":"ಮರಗೆಣಸು","Thyme Leaves":"ತೈಮ್ ಎಲೆ","Tinda Desi":"ಟಿಂಡಾ","Tomato Green":"ಹಸಿರು ಟೊಮ್ಯಾಟೊ","Tomato Hybrid  Large":"ಹೈಬ್ರಿಡ್ ಟೊಮ್ಯಾಟೊ (ದೊಡ್ಡ)","Tomato Hybrid  Medium":"ಹೈಬ್ರಿಡ್ ಟೊಮ್ಯಾಟೊ (ಮಧ್ಯಮ)","Tomato Hybrid  Mix":"ಹೈಬ್ರಿಡ್ ಟೊಮ್ಯಾಟೊ (ಮಿಕ್ಸ್)","Tomato Local  Large":"ಸ್ಥಳೀಯ ಟೊಮ್ಯಾಟೊ (ದೊಡ್ಡ)","Tomato Local  Medium":"ಸ್ಥಳೀಯ ಟೊಮ್ಯಾಟೊ (ಮಧ್ಯಮ)","Tomato Local  Mix":"ಸ್ಥಳೀಯ ಟೊಮ್ಯಾಟೊ (ಮಿಕ್ಸ್)","Tori Ridge Gourd  Large":"ತೊಂಡೆ (ದೊಡ್ಡ)","Tori Ridge Gourd  Medium":"ತೊಂಡೆ (ಮಧ್ಯಮ)","Tori Snake Gourd  Large":"ಪಡ್ವಲಕಾಯಿ (ದೊಡ್ಡ)","Tori Snake Gourd  Medium":"ಪಡ್ವಲಕಾಯಿ (ಮಧ್ಯಮ)","Tulsi Leaves":"ತುಳಸಿ ಎಲೆ","Zucchini  Green":"ಹಸಿರು ಝುಕ್ಕಿನಿ","Zucchini  Yellow":"ಹಳದಿ ಝುಕ್ಕಿನಿ","Avocado Hass  Semi-ripe":"ಅವಕಾಡೊ (ಅರ್ಧ ಹಣ್ಣು)","Avocado Hass Jumbo  Semi-ripe":"ಅವಕಾಡೊ ಜಂಬೊ","Ajwain (Carom Seeds) Whole":"ಓಮ ಕಾಳು","Amchur Powder  Premium":"ಮಾವಿನ ಪುಡಿ","Black Mustard Seeds  Whole":"ಕಪ್ಪು ಸಾಸಿವೆ","Black Pepper Malabar MG1  Ground":"ಮಲಬಾರ್ ಕಾಳು ಮೆಣಸು (ಪುಡಿ)","Black Pepper Malabar MG1  Pounded":"ಮಲಬಾರ್ ಕಾಳು ಮೆಣಸು (ಜಜ್ಜಿದ)","Black Pepper Malabar MG1  Whole":"ಮಲಬಾರ್ ಕಾಳು ಮೆಣಸು","Cardamom Green  Whole":"ಹಸಿರು ಏಲಕ್ಕಿ","Cinnamon Bark Kerala  Pounded":"ಕೇರಳ ದಾಲ್ಚಿನ್ನಿ (ಜಜ್ಜಿದ)","Cinnamon Cassia Imported  Whole":"ಕಾಸಿಯಾ ದಾಲ್ಚಿನ್ನಿ","Clove  White":"ಬಿಳಿ ಲವಂಗ","Coriander Kota Bold  Ground":"ಧನಿಯಾ (ಪುಡಿ)","Coriander Kota Bold  Pounded":"ಧನಿಯಾ (ಜಜ್ಜಿದ)","Coriander Kota Bold  Whole":"ಧನಿಯಾ (ಇಡಿ)","Cumin Rajasthan Bold  Ground":"ಜೀರಿಗೆ (ಪುಡಿ)","Cumin Rajasthan Bold  Pounded":"ಜೀರಿಗೆ (ಜಜ್ಜಿದ)","Cumin Rajasthan Bold  Whole":"ಜೀರಿಗೆ","Kasuri Methi  Whole":"ಕಸೂರಿ ಮೆಂತ್ಯೆ","Methi Dana (Fenugreek) Whole":"ಮೆಂತ್ಯ ಕಾಳು","Red Chilli Kashmiri  Pounded":"ಕಾಶ್ಮೀರಿ ಕೆಂಪು ಮೆಣಸು (ಜಜ್ಜಿದ)","Red chilli Guntur Teja  Ground":"ಗುಂಟೂರ್ ತೇಜಾ ಮೆಣಸು (ಪುಡಿ)","Red chilli Guntur Teja  Pounded":"ಗುಂಟೂರ್ ತೇಜಾ ಮೆಣಸು (ಜಜ್ಜಿದ)","Red chilli Guntur Teja  Whole":"ಗುಂಟೂರ್ ತೇಜಾ ಮೆಣಸು","Turmeric Ground":"ಅರಿಶಿನ (ಪುಡಿ)","Turmeric Pounded":"ಅರಿಶಿನ (ಜಜ್ಜಿದ)","Yellow Mustard Seeds  Whole":"ಹಳದಿ ಸಾಸಿವೆ","Black Mustard Oil":"ಕಪ್ಪು ಸಾಸಿವೆ ಎಣ್ಣೆ","Coconut Oil":"ತೆಂಗಿನ ಎಣ್ಣೆ","Extra Virgin Olive Oil":"ಎಕ್ಸ್ಟ್ರಾ ವರ್ಜಿನ್ ಆಲಿವ್ ಎಣ್ಣೆ","Peanut Oil":"ಶೇಂಗಾ ಎಣ್ಣೆ","Sesame Oil":"ಎಳ್ಳಿನ ಎಣ್ಣೆ","Yellow Mustard Oil":"ಹಳದಿ ಸಾಸಿವೆ ಎಣ್ಣೆ","Chrysanthemum & Rose Flower String":"ಚೆಂಡು ಮತ್ತು ಗುಲಾಬಿ ಹಾರ","Fresh Lotus Flower":"ತಾಜಾ ತಾವರೆ ಹೂ","Kanakambaram Flowers":"ಕನಕಾಂಬರ ಹೂ","Marigold  Mix":"ಚೆಂಡು ಹೂ (ಮಿಶ್ರ)","Marigold  Orange":"ಕಿತ್ತಳೆ ಚೆಂಡು ಹೂ","Marigold  Yellow":"ಹಳದಿ ಚೆಂಡು ಹೂ","Marigold Mala  Orange":"ಕಿತ್ತಳೆ ಚೆಂಡು ಹಾರ","Pooja Flower Mix":"ಪೂಜೆ ಹೂ ಮಿಶ್ರ","Rajanigandha":"ರಜನಿಗಂಧ","Rose Petals  Mix":"ಗುಲಾಬಿ ದಳ (ಮಿಶ್ರ)","Rose Petals  Red":"ಕೆಂಪು ಗುಲಾಬಿ ದಳ","Rose Without Stem  Red":"ಕೆಂಪು ಗುಲಾಬಿ","Rose Without Stem  Yellow":"ಹಳದಿ ಗುಲಾಬಿ","Tulsi Garland":"ತುಳಸಿ ಹಾರ","Yellow Chrysanthemum String":"ಹಳದಿ ಚೆಂಡು ಹೂ ಹಾರ"};

const CATS = [
  { id: "all",        en: "All",          kn: "ಎಲ್ಲಾ" },
  { id: "Fruits",     en: "Fruits",      kn: "ಹಣ್ಣುಗಳು" },
  { id: "Vegetables", en: "Vegetables",  kn: "ತರಕಾರಿಗಳು" },
  { id: "Dairy",      en: "Dairy",       kn: "ಹಾಲಿನ ಪದಾರ್ಥ" },
  { id: "Exotics",    en: "Exotics",     kn: "ವಿದೇಶಿ ಹಣ್ಣು" },
  { id: "Spices",     en: "Spices",      kn: "ಮಸಾಲೆಗಳು" },
  { id: "Flowers",    en: "Flowers",     kn: "ಹೂವುಗಳು" },
];

// Translate group key (first word of product name) to Kannada
function groupKeyKn(key, KN_NAMES) {
  // Find any KN_NAMES entry whose English name starts with this key
  const match = Object.entries(KN_NAMES).find(([en]) => en.startsWith(key));
  if (!match) return key;
  // Extract first word(s) of Kannada translation
  return match[1].split(/[\s(]/)[0];
}

const CAT_EMOJI = { Fruits:"🍎", Vegetables:"🥦", Dairy:"🥛", Exotics:"🥑", Spices:"🌶️", Oils:"🫙", Flowers:"🌸" };

// ── SHOP HELPERS ──
const COL_LEFT = "max(0px, calc(50vw - 240px))"; // left/right edge of the centred 480px app column on desktop
const rs = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const nm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const ts = (s) => (s ? Date.parse(String(s).replace(" ", "T").replace(/(\.\d{3})\d+/, "$1")) : NaN);
function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; }
}
// Price truth: a product sells at the size the customer picked, else its first size, else its base unit.
// Cards, the product sheet, the cart and saved orders all use this, so the price shown is the price charged.
function unitOf(p, picked) {
  const vs = Array.isArray(p && p.variants) ? p.variants : [];
  const want = picked && p ? picked[p.id] : undefined;
  const v = vs.find(x => x.label === want) || vs[0];
  return v ? { label: v.label, price: v.price } : { label: p.unit, price: p.price };
}
// Search matches English names, Kannada names and category names (both languages)
function matchesQuery(p, q) {
  const raw = String(q || "").trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  const catKn = (CATS.find(c => c.id === p.cat) || {}).kn || "";
  return nm(p.name).includes(s) || (KN_NAMES[p.name] || "").includes(raw) || (p.name_kn || "").includes(raw)
    || (s.length >= 3 && nm(p.cat).startsWith(s)) || (raw.length >= 2 && catKn.startsWith(raw));
}
// Shelves under the search bar. "Buy again" comes from the customer's orders; "New this week" lists products
// added in the admin panel in the last 7 days. "Today's picks" and "In season" show the product ids in SHELF_PICKS.
const SHELF_DEFS = [
  { id: "ordered",  en: "Buy again",     kn: "ಮತ್ತೆ ಖರೀದಿಸಿ", icon: "repeat",   tint: "#E5F1E8", ink: "#1A6B3C", empty: { en: "No orders yet",         kn: "ಇನ್ನೂ ಆರ್ಡರ್ ಇಲ್ಲ" } },
  { id: "new",      en: "New this week", kn: "ಈ ವಾರ ಹೊಸದು",  icon: "sparkles", tint: "#FCF0D2", ink: "#8A5D0B", empty: { en: "Nothing new this week", kn: "ಈ ವಾರ ಹೊಸದೇನೂ ಇಲ್ಲ" } },
  { id: "picks",    en: "Today's picks", kn: "ಇಂದಿನ ಆಯ್ಕೆ",   icon: "sunrise",  tint: "#FBE6DF", ink: "#A63A24", empty: { en: "Coming soon",           kn: "ಶೀಘ್ರದಲ್ಲೇ" } },
  { id: "seasonal", en: "In season",     kn: "ಈ ಸೀಸನ್",       icon: "leaf",     tint: "#E3F0EF", ink: "#23706E", empty: { en: "Coming soon",           kn: "ಶೀಘ್ರದಲ್ಲೇ" } },
];
const SHELF_ICONS = { repeat: Repeat, sparkles: Sparkles, sunrise: Sunrise, leaf: Leaf };
const SHELF_PICKS = { picks: [], seasonal: [] }; // product ids, e.g. { picks: ["p161", "p123"], seasonal: ["p35"] }
// Products are grouped by their first word ("Apple", "Onion"). Words like "Sweet" or "Raw" only describe,
// so those groups use two words: "Sweet Corn" and "Sweet Potato" stay apart, "Dragon Fruit" stays together.
const PREFIX_WORDS = new Set(["fresh", "raw", "sweet", "green", "red", "black", "yellow", "white", "baby", "bell", "ash",
  "bitter", "bottle", "cherry", "dragon", "extra", "lady", "wild", "kasuri"]);
function groupKeyOf(name) {
  const w = String(name || "").split(/[\s(]+/).filter(Boolean);
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  let key = w.length > 1 && PREFIX_WORDS.has(w[0].toLowerCase()) ? `${cap(w[0])} ${cap(w[1])}` : cap(w[0] || "");
  if (/\boil\b/i.test(name) && !/\boil$/i.test(key)) key += " Oil"; // mustard oil stays apart from mustard seeds
  return key;
}
// English label for a group: the key, unless it's a code like "A2" — then the words all its names share
function enGroupLabel(products, key) {
  if (key.length > 2 && !/\d/.test(key)) return key;
  const names = products.map(p => String(p.name).split(/\s+/).filter(Boolean));
  const shared = [];
  for (let i = 0; i < names[0].length && names.every(n => (n[i] || "").toLowerCase() === names[0][i].toLowerCase()); i++) shared.push(names[0][i]);
  return shared.length > 1 ? shared.join(" ") : key;
}
// Kannada label for a group: the words its products' Kannada names share
// ("ಸೇಬು" for every apple, "ಸ್ವೀಟ್ ಕಾರ್ನ್" for both kinds of sweet corn). Falls back to the English label.
function knGroupLabel(products, fallback) {
  const names = products.map(p => p.name_kn || KN_NAMES[p.name]).filter(Boolean)
    .map(n => n.replace(/\([^)]*\)/g, " ").split(/\s+/).filter(Boolean));
  if (!names.length) return fallback;
  if (names.length === 1) return names[0].join(" ");
  const shared = [];
  for (let i = 0; i < names[0].length && names.every(n => n[i] === names[0][i]); i++) shared.push(names[0][i]);
  if (shared.length) return shared.join(" ");
  const count = {};
  names.forEach(n => [...new Set(n)].forEach(w => { count[w] = (count[w] || 0) + 1; }));
  let best = null;
  names[0].forEach(w => { if (best === null || count[w] > count[best]) best = w; });
  return best && count[best] > 1 ? best : fallback;
}

function ProductImage({ p }) {
  const [err, setErr] = useState(false);
  if (!p.img || err) return (
    // No photo yet (e.g. just added in the admin panel): category emoji on a soft disc
    <div aria-hidden="true" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ height: "78%", aspectRatio: "1 / 1", maxWidth: "100%", borderRadius: "50%", background: "#F4EFDF",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(20px, 8vw, 40px)", lineHeight: 1 }}>
        {CAT_EMOJI[p.cat] || "🛒"}
      </div>
    </div>
  );
  return <img src={p.img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center"}} onError={() => setErr(true)} loading="lazy" />;
}

// Real warehouse location
const WAREHOUSE_POS = [15.426861, 75.614917];
// The shop's WhatsApp: new orders and "Get help" messages go here
const SHOP_WHATSAPP = "919886888924";

// ── MAPS ──
// Leaflet (the map library) loads once from the CDN, only when a map is shown.
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("lf-css")) {
      const link = document.createElement("link");
      link.id = "lf-css"; link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletPromise = null; reject(new Error("Map library failed to load")); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

// Straight-line distance in km
function kmBetween(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// A gentle arc between two points: reads as a route without pretending to know the roads
function arcPoints(a, b, bend = 0.18, n = 40) {
  const cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return pts;
}
const fmtAccuracy = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// Small line icons for map markers (24×24 grid)
const MAP_ICON = {
  store: '<path d="M3 9h18"/><path d="M4.5 9 6 4h12l1.5 5"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
};
const svgIcon = (name, size, color, sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MAP_ICON[name]}</svg>`;
// Classic map pin with an icon in its head; the tip is at (19, 47)
const pinSvg = (fill, icon) =>
  `<svg width="38" height="48" viewBox="0 0 38 48" aria-hidden="true"><path d="M19 46.5S3.5 30 3.5 18.5a15.5 15.5 0 0 1 31 0C34.5 30 19 46.5 19 46.5z" fill="${fill}" stroke="#fff" stroke-width="3"/>` +
  `<g transform="translate(9.4 8.9) scale(0.8)" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${MAP_ICON[icon]}</g></svg>`;

// ── TRACKING MAP ──
// Store, customer and live rider on a soft map. The route is drawn as an arc: store → home before pickup,
// then rider → home with dots flowing towards the customer.
function TrackingMap({ customerLat, customerLon, riderPos, lang, height = 320, rounded = false, finished = false }) {
  const elRef = useRef(null), mapRef = useRef(null), routeRef = useRef([]), riderRef = useRef(null), animRef = useRef(null), prevRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const kn = lang === "kn";
  const home = customerLat && customerLon ? [Number(customerLat), Number(customerLon)] : null;

  const fit = () => {
    const map = mapRef.current, L = window.L;
    if (!map || !L) return;
    const pts = [WAREHOUSE_POS];
    if (home) pts.push(home);
    if (riderRef.current) { const p = riderRef.current.getLatLng(); pts.push([p.lat, p.lng]); }
    if (pts.length === 1) map.setView(WAREHOUSE_POS, 15);
    else map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [44, 76], paddingBottomRight: [44, rounded ? 44 : 64], maxZoom: 16 });
  };

  const drawRoute = from => {
    const map = mapRef.current, L = window.L;
    if (!map || !L || !home) return;
    routeRef.current.forEach(l => map.removeLayer(l));
    const pts = arcPoints(from || WAREHOUSE_POS, home);
    const layers = [L.polyline(pts, { color: "#fff", weight: 9, opacity: 0.95, lineCap: "round", interactive: false })];
    if (from) {
      layers.push(L.polyline(pts, { color: "#1A6B3C", weight: 6, lineCap: "round", interactive: false }));
      layers.push(L.polyline(pts, { color: "#fff", weight: 2.5, opacity: 0.9, lineCap: "round", className: "g-route-flow", interactive: false }));
      layers.push(L.polyline([WAREHOUSE_POS, from], { color: "#1A6B3C", weight: 3, opacity: 0.35, dashArray: "2 8", lineCap: "round", interactive: false }));
    } else {
      layers.push(L.polyline(pts, { color: "#1A6B3C", weight: 4, opacity: 0.85, dashArray: "8 9", lineCap: "round", interactive: false }));
    }
    layers.forEach(l => l.addTo(map));
    routeRef.current = layers;
  };

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
      L.tileLayer(OSM_TILES, { maxZoom: 19 }).addTo(map);
      L.control.attribution({ position: "bottomleft", prefix: false }).addAttribution(OSM_CREDIT).addTo(map);
      L.marker(WAREHOUSE_POS, { keyboard: false, icon: L.divIcon({ className: "g-divicon", iconSize: [40, 40], iconAnchor: [20, 20],
        html: `<div class="g-mk"><div class="g-mk-sq">${svgIcon("store", 20, "#fff")}</div><div class="g-mk-label">${kn ? "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್" : "Royal Harvest"}</div></div>` }) }).addTo(map);
      if (home) L.marker(home, { keyboard: false, icon: L.divIcon({ className: "g-divicon", iconSize: [38, 48], iconAnchor: [19, 47],
        html: `<div class="g-mk g-mk-home">${pinSvg("#D9482B", "home")}<div class="g-mk-label">${kn ? "ನೀವು" : "You"}</div></div>` }) }).addTo(map);
      mapRef.current = map;
      drawRoute(null);
      fit();
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      riderRef.current = null; prevRef.current = null; routeRef.current = [];
      setReady(false);
    };
  }, [customerLat, customerLon, lang]);

  // Live rider: glide from the last position to the new one
  const rLat = riderPos ? Number(riderPos.lat) : null, rLon = riderPos ? Number(riderPos.lon) : null;
  useEffect(() => {
    const map = mapRef.current, L = window.L;
    if (!ready || !map || !L || rLat == null || rLon == null || finished) return;
    const to = [rLat, rLon];
    drawRoute(to);
    if (!riderRef.current) {
      riderRef.current = L.marker(to, { keyboard: false, zIndexOffset: 1000, icon: L.divIcon({ className: "g-divicon", iconSize: [46, 46], iconAnchor: [23, 23],
        html: `<div class="g-mk-rider">${svgIcon("bike", 22, "#1A6B3C", 2.2)}</div>` }) }).addTo(map);
      prevRef.current = to;
      fit();
      return;
    }
    const from = prevRef.current || to;
    prevRef.current = to;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const t0 = performance.now(), dur = 2500;
    const step = now => {
      const t = Math.min((now - t0) / dur, 1), e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      if (riderRef.current) riderRef.current.setLatLng([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]);
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else if (mapRef.current && !mapRef.current.getBounds().pad(-0.1).contains(to)) fit();
    };
    animRef.current = requestAnimationFrame(step);
  }, [ready, rLat, rLon, finished]);

  // Delivered or cancelled: no route and no rider, just the shop and the home
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !finished) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    routeRef.current.forEach(l => map.removeLayer(l)); routeRef.current = [];
    if (riderRef.current) { map.removeLayer(riderRef.current); riderRef.current = null; prevRef.current = null; }
    fit();
  }, [ready, finished]);

  return (
    <div className="g-map" style={{ position: "relative", height, isolation: "isolate", borderRadius: rounded ? 18 : 0, overflow: "hidden", background: "#EAEFE8" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }}/>
      {failed && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: soil }}>
        {kn ? "ನಕ್ಷೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ" : "The map couldn't load"}</div>}
      {!home && !failed && (
        <div className="g-frost" style={{ position: "absolute", left: "50%", bottom: rounded ? 12 : 40, transform: "translateX(-50%)", zIndex: 1100,
          padding: "6px 12px", borderRadius: 14, fontSize: 12, fontWeight: 600, color: ink, whiteSpace: "nowrap" }}>
          {kn ? "ಈ ಆರ್ಡರ್‌ಗೆ GPS ಪಿನ್ ಇಲ್ಲ" : "No GPS pin for this order"}
        </div>
      )}
      <button className="g-reset" onClick={fit} aria-label={kn ? "ನಕ್ಷೆಯನ್ನು ಮಧ್ಯಕ್ಕೆ ತನ್ನಿ" : "Show the whole route"}
        style={{ position: "absolute", right: 12, bottom: rounded ? 12 : 40, zIndex: 1100, width: 42, height: 42, borderRadius: 21, background: "#fff",
          boxShadow: "0 3px 12px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: ink }}>
        <LocateFixed size={19}/>
      </button>
    </div>
  );
}

// ── LOCATION PICKER ──
// The pin stays in the middle; the customer drags the map until it sits on their door.
// Phone GPS can be kilometres off, so this is what tells the rider exactly where to come.
function LocationPicker({ lat, lon, accuracy, manual, lang, onMove }) {
  const elRef = useRef(null), mapRef = useRef(null), circleRef = useRef(null), onMoveRef = useRef(onMove), userMoveRef = useRef(false);
  const latestRef = useRef({ lat, lon, accuracy });
  const [dragging, setDragging] = useState(false);
  onMoveRef.current = onMove;
  latestRef.current = { lat, lon, accuracy };
  const kn = lang === "kn";
  // Zoom so the accuracy circle shows (radius 75–150px); street level when the fix is good
  const zoomFor = (acc, la) => Math.max(13, Math.min(17, Math.floor(Math.log2((156543 * Math.cos((la * Math.PI) / 180) * 150) / Math.max(acc || 0, 1)))));

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !elRef.current || mapRef.current) return;
      const { lat: la, lon: lo, accuracy: acc } = latestRef.current; // newest GPS reading, even if it came in while the map loaded
      // Zooming keeps the centre still, so the pin never slides off the spot the customer chose
      const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, touchZoom: "center", doubleClickZoom: "center" })
        .setView([la, lo], zoomFor(acc, la));
      L.tileLayer(OSM_TILES, { maxZoom: 19 }).addTo(map);
      L.control.attribution({ position: "bottomleft", prefix: false }).addAttribution(OSM_CREDIT).addTo(map);
      L.control.zoom({ position: "bottomright", zoomInTitle: kn ? "ಹತ್ತಿರ" : "Zoom in", zoomOutTitle: kn ? "ದೂರ" : "Zoom out" }).addTo(map);
      // Where the phone thinks it is: the door is somewhere inside this circle
      circleRef.current = L.circle([la, lo], { radius: acc > 25 ? acc : 0, color: "#1A6B3C", weight: 1.5, opacity: 0.55, dashArray: "4 6",
        fillColor: "#1A6B3C", fillOpacity: 0.08, interactive: false }).addTo(map);
      map.on("dragstart", () => { userMoveRef.current = true; setDragging(true); });
      map.getContainer().addEventListener("keydown", e => { if (e.key && e.key.indexOf("Arrow") === 0) userMoveRef.current = true; });
      // moveend, not dragend: after a flick the map keeps gliding, and the pin is where it stops
      map.on("moveend", () => {
        if (!userMoveRef.current) return;
        userMoveRef.current = false; setDragging(false);
        const c = map.getCenter(); onMoveRef.current({ lat: c.lat, lon: c.lng });
      });
      mapRef.current = map;
    }).catch(() => {});
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // A fresh GPS reading (not the customer's own pin) re-centres the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || manual || userMoveRef.current) return;
    map.setView([lat, lon], zoomFor(accuracy, lat));
    if (circleRef.current) { circleRef.current.setLatLng([lat, lon]); circleRef.current.setRadius(accuracy > 25 ? accuracy : 0); }
  }, [lat, lon, accuracy, manual]);

  return (
    <div className="g-map" style={{ position: "relative", height: 200, borderRadius: 16, overflow: "hidden", isolation: "isolate", border: `1px solid ${line}`, background: "#EAEFE8" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }}/>
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", zIndex: 1099, width: 14, height: 6, marginLeft: -7, marginTop: -3,
        borderRadius: "50%", background: "rgba(0,0,0,0.28)", pointerEvents: "none" }}/>
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", zIndex: 1100, pointerEvents: "none", lineHeight: 0,
        transform: `translate(-50%, -100%) translateY(${dragging ? -10 : 0}px)`, transition: "transform .15s" }}
        dangerouslySetInnerHTML={{ __html: pinSvg("#1A6B3C", "home") }}/>
      <div className="g-frost" style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1100, maxWidth: "88%",
        padding: "5px 12px", borderRadius: 14, fontSize: 12, fontWeight: 600, color: ink, textAlign: "center", pointerEvents: "none" }}>
        {kn ? "ಪಿನ್ ನಿಮ್ಮ ಬಾಗಿಲ ಮೇಲೆ ಬರುವಂತೆ ನಕ್ಷೆ ಸರಿಸಿ" : "Drag the map so the pin sits on your door"}
      </div>
    </div>
  );
}

// ── PRODUCT SHEET ──
// Pick a size and how many. Opens with what's already in the cart, so it can also update or remove an item.
function ProductSheet({ p, inCart, picked, lang, KN_NAMES, onCommit, onClose }) {
  const kn = lang === "kn";
  const sizes = Array.isArray(p.variants) ? p.variants : [];
  const current = unitOf(p, picked);
  const [size, setSize] = useState(current.label);
  const [qty, setQty] = useState(inCart > 0 ? inCart : 1);
  const closeRef = useRef(null);
  const u = sizes.find(s => s.label === size) || current;
  const oos = p.in_stock === false;
  const maxQty = Math.max(1, Math.min(10, p.stock_qty ?? 10));
  const name = kn ? (KN_NAMES[p.name] || p.name_kn || p.name) : p.name;
  const changed = qty !== inCart || (inCart > 0 && size !== current.label);
  const total = rs(qty * u.price);

  useEffect(() => {
    if (closeRef.current) closeRef.current.focus({ preventScroll: true });
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  let cta, kind = "go", disabled = false;
  if (oos) { cta = kn ? "ದಾಸ್ತಾನಿಲ್ಲ" : "Out of stock"; disabled = true; }
  else if (inCart > 0 && qty === 0) { cta = kn ? "ಬುಟ್ಟಿಯಿಂದ ತೆಗೆದುಹಾಕಿ" : "Remove from cart"; kind = "remove"; }
  else if (inCart > 0 && !changed) { cta = kn ? "ಸರಿ" : "Done"; kind = "quiet"; }
  else if (inCart > 0) { cta = kn ? `ಬುಟ್ಟಿ ನವೀಕರಿಸಿ: ${total} ಗೆ ${qty}` : `Update cart: ${qty} for ${total}`; }
  else if (qty === 0) { cta = kn ? "ಎಷ್ಟು ಬೇಕು ಆರಿಸಿ" : "Choose how many"; disabled = true; }
  else { cta = kn ? `${total} ಗೆ ${qty} ಸೇರಿಸಿ` : `Add ${qty} for ${total}`; }

  const ctaStyle = kind === "remove" ? { background: "#fff", color: chili, border: `1.5px solid ${chili}` }
    : kind === "quiet" ? { background: "#EEF2EB", color: ink, border: "1.5px solid transparent" }
    : { background: disabled ? "#C9CFC5" : basil, color: "#fff", border: "1.5px solid transparent" };
  const step = { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: ink, padding: 0 };

  return ReactDOM.createPortal(
    <div onClick={onClose} className="g-fade" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,32,24,0.45)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="dialog" aria-modal="true" aria-label={name} className="g-sheet" onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "24px 24px 0 0", maxHeight: "92vh", overflowY: "auto",
          padding: "10px 18px calc(18px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -10px 40px rgba(22,32,24,0.18)",
          fontFamily: body, color: ink }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "#D9DED3", margin: "0 auto 14px" }}/>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 112, height: 112, flexShrink: 0, borderRadius: 16, background: "#F5F7F2", padding: 8 }}><ProductImage p={p}/></div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{name}</div>
            <div style={{ marginTop: 6, fontSize: 15 }}>
              <span style={{ fontWeight: 800 }}>{rs(u.price)}</span><span style={{ color: soil }}> / {u.label}</span>
            </div>
            {oos
              ? <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: chili }}>{kn ? "ಸದ್ಯಕ್ಕೆ ದಾಸ್ತಾನಿಲ್ಲ" : "Out of stock right now"}</div>
              : inCart > 0 ? <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: basil }}>{kn ? `ಬುಟ್ಟಿಯಲ್ಲಿ ${inCart} ಇದೆ` : `${inCart} in your cart`}</div> : null}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={kn ? "ಮುಚ್ಚಿ" : "Close"} className="g-reset"
            style={{ width: 36, height: 36, borderRadius: 18, background: "#EEF2EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={18}/>
          </button>
        </div>

        {sizes.length > 1 && <>
          <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700 }}>{kn ? "ಗಾತ್ರ ಆರಿಸಿ" : "Choose size"}</div>
          <div role="radiogroup" aria-label={kn ? "ಗಾತ್ರ" : "Size"} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {sizes.map(s => {
              const on = s.label === size;
              return (
                <button key={s.label} role="radio" aria-checked={on} onClick={() => setSize(s.label)} className="g-reset g-tap"
                  style={{ minWidth: 78, padding: "8px 12px", borderRadius: 12, border: `1.5px solid ${on ? basil : line}`, background: on ? "#EEF7F1" : "#fff" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: on ? basil : ink }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: on ? basil : soil, marginTop: 1 }}>{rs(s.price)}</div>
                </button>
              );
            })}
          </div>
        </>}

        {!oos && <>
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${line}`, borderRadius: 14 }}>
              <button onClick={() => setQty(q => Math.max(0, q - 1))} disabled={qty === 0} aria-label={kn ? "ಒಂದು ಕಡಿಮೆ" : "One less"}
                style={{ ...step, opacity: qty === 0 ? 0.35 : 1 }}><Minus size={18}/></button>
              <div aria-live="polite" style={{ minWidth: 40, textAlign: "center", fontSize: 19, fontWeight: 800 }}>{qty}</div>
              <button onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label={kn ? "ಒಂದು ಹೆಚ್ಚು" : "One more"}
                style={{ ...step, opacity: qty >= maxQty ? 0.35 : 1 }}><Plus size={18}/></button>
            </div>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: 12, color: soil }}>{qty} × {u.label}</div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{total}</div>
            </div>
          </div>
          <input type="range" className="g-range" min={0} max={maxQty} step={1} value={qty}
            onChange={e => setQty(Number(e.target.value))} aria-label={kn ? "ಪ್ರಮಾಣ" : "Quantity"}
            style={{ width: "100%", marginTop: 16, "--fill": `${(qty / maxQty) * 100}%` }}/>
        </>}

        <button disabled={disabled} className="g-reset g-tap"
          onClick={() => {
            if (disabled) return;
            if (kind === "quiet") { onClose(); return; }
            onCommit(qty, sizes.length ? size : undefined);
            onClose();
          }}
          style={{ width: "100%", marginTop: 18, padding: "15px 16px", borderRadius: 14, fontSize: 16, fontWeight: 800, textAlign: "center",
            cursor: disabled ? "not-allowed" : "pointer", ...ctaStyle }}>
          {cta}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── HANDPICKD LAYOUT COMPONENT ──
// (name kept for history) Royal Harvest's shop grid: category sections with sticky turmeric pills,
// or a flat list for search results and shelves.
function HandpickdLayout({ filtered, listMode, onClearList, suggestions, onSuggest, cart, setCart, addToCart, removeFromCart,
  selectedVariant, setSelectedVariant, lang, onOpenDrawer, CATS, KN_NAMES, basil, soil, ink, line, chili }) {

  const [expandedGroup, setExpandedGroup] = useState(null); // wide card whose varieties are open
  const [sheetProduct, setSheetProduct] = useState(null);   // product open in the sheet
  const topRef = useRef(null);
  const kn = lang === "kn";
  const pname = p => kn ? (KN_NAMES[p.name] || p.name_kn || p.name) : p.name;
  const gname = (key, products) => kn ? knGroupLabel(products || [], key) : enGroupLabel(products || [], key);
  const qtyOf = p => cart[p.id] || 0;
  // Inside an opened group the shared word is dropped: "Apple Royal Gala" shows as "Royal Gala"
  const shortName = (p, key, label) => {
    const n = pname(p).trim();
    for (const pre of [label, key]) {
      if (pre && n.length > pre.length + 1 && n.toLowerCase().startsWith(pre.toLowerCase() + " ")) return n.slice(pre.length + 1);
    }
    return n;
  };

  // cat → group → [products]
  const grouped = useMemo(() => {
    const result = {};
    filtered.forEach(p => {
      const key = groupKeyOf(p.name);
      if (!result[p.cat]) result[p.cat] = {};
      if (!result[p.cat][key]) result[p.cat][key] = [];
      result[p.cat][key].push(p);
    });
    return result;
  }, [filtered]);
  const activeCats = CATS.filter(c => c.id !== "all" && grouped[c.id]);

  // A new search or shelf starts at the top of its results
  const listKey = listMode ? listMode.key : "";
  useEffect(() => {
    if (!listMode || !topRef.current) return;
    const stick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--g-sticky")) || 0;
    const top = topRef.current.getBoundingClientRect().top;
    if (top < stick) window.scrollTo({ top: window.scrollY + top - stick });
  }, [listKey]);

  const commit = (p, qty, label) => {
    if (label) setSelectedVariant(sv => ({ ...sv, [p.id]: label }));
    setCart(c => { const n = { ...c }; if (qty > 0) n[p.id] = qty; else delete n[p.id]; return n; });
  };

  const GAP = 12;
  const FILLERS = [
    { icon: Truck,  en: "Delivered in 2 hrs", kn: "2 ಗಂಟೆಯಲ್ಲಿ ಡೆಲಿವರಿ", tint: "#1A6B3C", glow: "rgba(26,107,60,0.16)" },
    { icon: Leaf,   en: "Fresh every day",    kn: "ಪ್ರತಿದಿನ ತಾಜಾ",        tint: "#2F7D6D", glow: "rgba(47,125,109,0.16)" },
    { icon: MapPin, en: "Made for Gadag",     kn: "ಗದಗಿಗಾಗಿ",             tint: "#A0700E", glow: "rgba(242,181,58,0.24)" },
  ];
  const cardShadow = "0 1px 2px rgba(30,43,34,0.05), 0 4px 12px rgba(30,43,34,0.05)";
  const clamp2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
  const miniBtn = { width: 24, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" };

  /* ── Add control: "+" button, then a − n + stepper once the item is in the cart ── */
  const addControl = (p, name) => {
    if (p.in_stock === false) return null;
    const q = qtyOf(p);
    const max = Math.max(1, Math.min(10, p.stock_qty ?? 10));
    if (q === 0) return (
      <button className="g-reset g-tap" aria-label={kn ? `${name} ಬುಟ್ಟಿಗೆ ಸೇರಿಸಿ` : `Add ${name} to cart`} onClick={() => addToCart(p.id)}
        style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, border: `1.5px solid ${basil}`, background: "#fff", color: basil,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Plus size={17} strokeWidth={2.6}/>
      </button>
    );
    return (
      <div style={{ height: 30, flexShrink: 0, borderRadius: 9, background: basil, color: "#fff", display: "flex", alignItems: "center" }}>
        <button className="g-reset" aria-label={kn ? `${name} ಒಂದು ಕಡಿಮೆ` : `Remove one ${name}`} onClick={() => removeFromCart(p.id)} style={miniBtn}>
          <Minus size={14} strokeWidth={2.6}/></button>
        <span aria-live="polite" style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 800 }}>{q}</span>
        <button className="g-reset" aria-label={kn ? `${name} ಇನ್ನೊಂದು` : `Add one more ${name}`} disabled={q >= max}
          onClick={() => { if (q < max) addToCart(p.id); }} style={{ ...miniBtn, opacity: q >= max ? 0.45 : 1 }}><Plus size={14} strokeWidth={2.6}/></button>
      </div>
    );
  };

  /* ── Product card: photo, name, price and add button, all inside the card ── */
  const narrow = (p, opts = {}) => {
    const u = unitOf(p, selectedVariant), oos = p.in_stock === false;
    const full = pname(p);
    const name = opts.groupKey ? shortName(p, opts.groupKey, opts.groupLabel) : full;
    return (
      <div key={p.id} style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14,
        border: `1px solid ${line}`, boxShadow: cardShadow, overflow: "hidden", ...(opts.style || null) }}>
        <button className="g-reset g-tap" onClick={() => setSheetProduct(p)}
          aria-label={`${full}, ${rs(u.price)} / ${u.label}${oos ? (kn ? ", ದಾಸ್ತಾನಿಲ್ಲ" : ", out of stock") : ""}`}
          style={{ flex: 1, display: "flex", flexDirection: "column", textAlign: "left", filter: oos ? "grayscale(1)" : "none", opacity: oos ? 0.6 : 1 }}>
          <div style={{ position: "relative", width: "100%", paddingTop: "76%", background: "#F7F8F5" }}>
            <div style={{ position: "absolute", inset: 6 }}><ProductImage p={p}/></div>
            {oos && <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontWeight: 800, color: chili, padding: "3px 7px",
              background: "#FDECEC", borderRadius: 6 }}>{kn ? "ದಾಸ್ತಾನಿಲ್ಲ" : "Out of stock"}</span>}
          </div>
          <div style={{ padding: "8px 9px 0", fontSize: 13, fontWeight: 600, color: ink, lineHeight: 1.25, minHeight: 41, ...clamp2 }}>{name}</div>
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, padding: "6px 6px 8px 9px" }}>
          <span style={{ fontSize: 12.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ fontWeight: 800, color: ink }}>{rs(u.price)}</span><span style={{ fontSize: 11, color: soil }}>/{u.label}</span>
          </span>
          {addControl(p, full)}
        </div>
      </div>
    );
  };

  /* ── Wide card: a product with several varieties; small photos of them, tap to open ── */
  const wideCard = (it, catId) => {
    const { key, products } = it;
    const groupKey = `${catId}::${key}`, isExpanded = expandedGroup === groupKey;
    const units = products.map(p => unitOf(p, selectedVariant));
    const minP = Math.min(...units.map(u => u.price)), maxP = Math.max(...units.map(u => u.price));
    const sameUnit = units.every(u => u.label === units[0].label);
    const inCartN = products.reduce((s, p) => s + qtyOf(p), 0);
    const face = products.find(p => p.img) || products[0];
    const label = gname(key, products);
    const toggle = () => {
      setExpandedGroup(isExpanded ? null : groupKey);
      if (!isExpanded) setTimeout(() => {
        const el = document.getElementById(`vp-${groupKey}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
    };
    return (
      <div key={key} style={{ gridColumn: "span 2", minWidth: 0, display: "flex" }}>
        <button className="g-reset g-tap" onClick={toggle} aria-expanded={isExpanded}
          aria-label={kn ? `${label}, ${products.length} ಆಯ್ಕೆಗಳು` : `${label}, ${products.length} varieties`}
          style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, textAlign: "left", background: "#fff", borderRadius: 14, padding: 12,
            border: `1.5px solid ${isExpanded ? basil : line}`, boxShadow: cardShadow }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ fontWeight: 800, color: ink }}>{rs(minP)}{maxP > minP ? ` – ${rs(maxP)}` : ""}</span>
              {sameUnit && <span style={{ fontSize: 11, color: soil }}>/{units[0].label}</span>}
            </span>
            <div style={{ fontSize: 18, fontWeight: 700, color: ink, lineHeight: 1.2, marginTop: 6, ...clamp2 }}>{label}</div>
            {inCartN > 0 && <span style={{ alignSelf: "flex-start", marginTop: 6, fontSize: 11, fontWeight: 800, color: basil, background: "#E5F1E8",
              borderRadius: 10, padding: "2px 8px" }}>{kn ? `ಬುಟ್ಟಿಯಲ್ಲಿ ${inCartN}` : `${inCartN} in cart`}</span>}
            <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden="true" style={{ display: "flex" }}>
                {products.slice(0, 3).map((p, i) => (
                  <span key={p.id} style={{ width: 26, height: 26, borderRadius: 13, marginLeft: i ? -9 : 0, border: "2px solid #fff",
                    boxShadow: "0 0 0 1px #E4E8E0", overflow: "hidden", background: "#F2F4EF", display: "block" }}>
                    {p.img && <img src={p.img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>}
                  </span>
                ))}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: basil, display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
                {products.length} {kn ? "ಆಯ್ಕೆಗಳು" : "varieties"}
                <ChevronDown size={15} strokeWidth={2.4} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}/>
              </span>
            </div>
          </div>
          <div style={{ width: 100, height: 100, flexShrink: 0, alignSelf: "center" }}><ProductImage p={face}/></div>
        </button>
      </div>
    );
  };

  /* ── Filler tile: fills the slot a wide card can't use ── */
  const filler = (f, k) => {
    const Icon = f.icon;
    return (
      <div key={k} aria-hidden="true" className="g-glass" style={{ "--glow": f.glow, minHeight: 120, borderRadius: 16, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, padding: 12, textAlign: "center" }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.95)", boxShadow: "0 2px 8px rgba(30,43,34,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", color: f.tint }}>
          <Icon size={20} strokeWidth={2}/>
        </span>
        <span style={{ fontFamily: accent, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, color: "#23392B" }}>{f[lang]}</span>
      </div>
    );
  };

  /* ── Variety panel: opens under the row; swipe sideways, the next card peeks in ── */
  const varietyPanel = (openItem, catId) => {
    const label = gname(openItem.key, openItem.products);
    const n = openItem.products.length;
    return (
      <div id={`vp-${catId}::${openItem.key}`} style={{ background: "#EEF6F0", border: `1.5px solid ${basil}`, borderRadius: 16,
        padding: "10px 0 12px 12px", margin: `0 0 ${GAP + 4}px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px 8px 0" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: basilDark }}>{kn ? `${label}: ${n} ಆಯ್ಕೆಗಳು` : `${n} varieties of ${label}`}</span>
          <button className="g-reset" onClick={() => setExpandedGroup(null)} aria-label={kn ? "ಮುಚ್ಚಿ" : "Close"}
            style={{ width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: basilDark }}>
            <X size={17}/></button>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", scrollSnapType: "x proximity", paddingRight: 12 }}>
          {openItem.products.map(p => narrow(p, { groupKey: openItem.key, groupLabel: label, style: { flex: "0 0 42%", scrollSnapAlign: "start" } }))}
        </div>
      </div>
    );
  };

  /* ── Category sections: sequential 3-column packing ── */
  let fillerN = 0;
  const sections = activeCats.map(cat => {
    const entries = Object.entries(grouped[cat.id]);
    // several varieties = 2 columns, one = 1 column; if a wide card can't fit, fill the leftover slot and start a new row
    const rowsData = [];
    let cur = [], used = 0;
    const pushRow = () => { if (cur.length) rowsData.push(cur); cur = []; used = 0; };
    entries.forEach(([key, products]) => {
      const span = products.length > 1 ? 2 : 1;
      if (used + span > 3) { cur.push({ filler: FILLERS[fillerN++ % FILLERS.length], start: used, span: 3 - used }); pushRow(); }
      cur.push({ key, products, span, start: used });
      used += span;
      if (used === 3) pushRow();
    });
    pushRow();

    return (
      <section key={cat.id} id={`sec-${cat.id}`} className="g-sec" aria-label={cat[lang]}>
        {/* Sticky category pill; tap to open the category drawer */}
        <div style={{ position: "sticky", top: "var(--g-sticky, 0px)", zIndex: 6, padding: `12px ${GAP}px 10px`, pointerEvents: "none" }}>
          <button className="g-reset g-tap g-frost" onClick={onOpenDrawer}
            aria-label={kn ? `${cat[lang]}: ವರ್ಗಗಳನ್ನು ತೆರೆಯಿರಿ` : `${cat[lang]}: open categories`}
            style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 7, color: ink, borderRadius: 20,
              padding: "5px 12px 5px 12px", fontFamily: accent, fontWeight: 700, fontSize: 17, lineHeight: 1.25 }}>
            <span aria-hidden="true" style={{ fontFamily: body, fontSize: 15 }}>{CAT_EMOJI[cat.id] || "🛒"}</span>
            {cat[lang]}
            <ChevronDown size={16} strokeWidth={2.4} style={{ color: basil }}/>
          </button>
        </div>
        <div style={{ padding: `0 ${GAP}px 4px` }}>
          {rowsData.map((row, rIdx) => {
            const openItem = row.find(it => it.products && it.products.length > 1 && expandedGroup === `${cat.id}::${it.key}`);
            return (
              <div key={`row-${rIdx}`}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: GAP, marginBottom: GAP }}>
                  {row.map((it, cIdx) => it.filler
                    ? filler(it.filler, `f-${rIdx}-${cIdx}`)
                    : it.products.length > 1 ? wideCard(it, cat.id) : narrow(it.products[0]))}
                </div>
                {openItem && varietyPanel(openItem, cat.id)}
              </div>
            );
          })}
        </div>
      </section>
    );
  });

  /* ── Flat list: search results or an open shelf ── */
  const flat = listMode && (
    <div ref={topRef} style={{ padding: `14px ${GAP}px 6px` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listMode.title}</h2>
        <button className="g-reset" onClick={onClearList}
          style={{ fontSize: 14, fontWeight: 700, color: basil, padding: "6px 4px", flexShrink: 0 }}>{kn ? "ತೆರವುಗೊಳಿಸಿ" : "Clear"}</button>
      </div>
      {listMode.items.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: GAP }}>{listMode.items.map(p => narrow(p))}</div>
      ) : (
        <div style={{ padding: "20px 8px 8px", textAlign: "center" }}>
          <div style={{ fontFamily: accent, fontWeight: 700, fontSize: 22, color: basil, lineHeight: 1.25 }}>
            {kn ? "ಬೇರೆ ಹೆಸರಿನಲ್ಲಿ ಹುಡುಕಿ" : "Try another name"}
          </div>
          <div style={{ fontSize: 14, color: soil, marginTop: 8, lineHeight: 1.45, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
            {kn ? "ಕಾಗುಣಿತ ಪರಿಶೀಲಿಸಿ, ಅಥವಾ ಮೈಕ್ ಒತ್ತಿ ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಹೇಳಿ."
                : "Check the spelling, or tap the mic and say it in Kannada or English."}
          </div>
          {suggestions && suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {suggestions.map(s => (
                <button key={s.q} className="g-reset g-tap" onClick={() => onSuggest(s.q)}
                  style={{ padding: "8px 14px", borderRadius: 20, background: "#fff", border: `1px solid ${line}`, fontSize: 14, fontWeight: 600, color: ink }}>{s.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div style={{ background: sage, paddingBottom: 150, width: "100%", minHeight: "70vh" }}>
        {listMode ? flat : sections}
      </div>
      {sheetProduct && (
        <ProductSheet key={sheetProduct.id} p={sheetProduct} inCart={qtyOf(sheetProduct)} picked={selectedVariant}
          lang={lang} KN_NAMES={KN_NAMES} onCommit={(q, l) => commit(sheetProduct, q, l)} onClose={() => setSheetProduct(null)}/>
      )}
    </>
  );
}

// ── ROYAL HARVEST (formerly GADAG 360): single-warehouse grocery delivery ──
export default function Gadag360() {
  const [screen, setScreen] = useState("home");
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => readJSON("gd360_cart", {}));
  const [address, setAddress] = useState("");
  const [gpsCoords, setGpsCoords] = useState(null); // {lat, lon, accuracy} from GPS
  const [payment, setPayment] = useState("cod"); // cod = cash or UPI on delivery; "online" once Razorpay is live
  const [orderStatusIdx, setOrderStatusIdx] = useState(0);
  const [riderPos, setRiderPos] = useState(null); // {lat, lon} from live delivery boy GPS
  const riderPollRef = useRef(null);
  const timerRef = useRef(null);
  const [activeOrders, setActiveOrders] = useState(() => {    // orders being tracked; kept for a day so a reload doesn't lose them
    const v = readJSON("gd360_active", []);
    return Array.isArray(v) ? v.filter(o => o && o.id && Date.now() - (o.placedAt || 0) < 864e5 && !["delivered", "cancelled"].includes(o.status)) : [];
  });
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("gd360_lang") === "kn" ? "kn" : "en"; } catch (e) { return "en"; } });

  // ── ALL 16 FEATURES STATE ──
  const [coins, setCoins] = useState(120);                 // F2 loyalty coins
  const [orderHistory, setOrderHistory] = useState([]);     // F3 order history
  const [deliverySlot, setDeliverySlot] = useState("");     // F5 slot booking
  const [userArea, setUserArea] = useState("Gadag");        // F12 hyperlocal
  const [referralCopied, setReferralCopied] = useState(false); // F15 referral
  const [hoverRating, setHoverRating] = useState(0);
  const [lastRating, setLastRating] = useState(0);          // F16 rating
  const [showRating, setShowRating] = useState(false);
  const [showBundles, setShowBundles] = useState(false);    // F7 bundles
  const [showFestival, setShowFestival] = useState(false);  // F8 festival
  const [showHistory, setShowHistory] = useState(false);    // F3 history
  const [showReferral, setShowReferral] = useState(false);  // F15 referral
  const [showAreaPicker, setShowAreaPicker] = useState(false); // F12 area
  const [flashDismissed, setFlashDismissed] = useState(false); // F1 flash
  const [voiceActive, setVoiceActive] = useState(false);    // F13 voice search
  const [voiceError, setVoiceError] = useState("");
  const [bulkMode, setBulkMode] = useState(false);          // F14 bulk mode
  const [notifShown, setNotifShown] = useState(false);      // F10 whatsapp notif

  // ── CUSTOMER ACCOUNT STATE ──
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState("home"); // home | profile
  const [profileSection, setProfileSection] = useState(null); // null = profile home, or section name
  const [loginStep, setLoginStep] = useState("phone"); // phone | otp
  const [loginPhone, setLoginPhone] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [wishlist, setWishlist] = useState({});
  const [savedAddresses, setSavedAddresses] = useState(["Near Bus Stand, Gadag"]);
  const [userProfile, setUserProfile] = useState({ name:"", phone:"", email:"" });
  const [editProfile, setEditProfile] = useState({ name:"", phone:"", email:"" });
  const [suggestText, setSuggestText] = useState("");
  const [suggestSent, setSuggestSent] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(() => readJSON("gd360_sizes", {}));
  const [currentUserId, setCurrentUserId] = useState(null);
  const [tip, setTip] = useState(0);
  const [dbProducts, setDbProducts] = useState([]);
  const [vendorOrderStatus, setVendorOrderStatus] = useState({}); // {orderId: "accepted"|"rejected"}
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // The running "Use GPS" watch, so a second tap (or placing the order) stops the old one
  const gpsWatchRef = useRef(null);
  const stopGpsWatch = () => {
    const w = gpsWatchRef.current;
    if (!w) return;
    clearTimeout(w.timer);
    if (w.id != null && navigator.geolocation) navigator.geolocation.clearWatch(w.id);
    gpsWatchRef.current = null;
  };
  const [showCatDrawer, setShowCatDrawer] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [screen, activeTab, profileSection]);

  // ── HOME UI STATE ──
  const [activeShelf, setActiveShelf] = useState(null);  // open shelf, e.g. "ordered"
  const [chipNote, setChipNote] = useState(null);        // short note under a shelf that has nothing yet
  const stickyRef = useRef(null), chipsWrapRef = useRef(null), chipNoteTimer = useRef(null);
  // Keep the cart, chosen sizes and language after a refresh
  useEffect(() => { Storage.set("gd360_cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { Storage.set("gd360_sizes", JSON.stringify(selectedVariant)); }, [selectedVariant]);
  useEffect(() => { Storage.set("gd360_lang", lang); }, [lang]);
  useEffect(() => { Storage.set("gd360_active", JSON.stringify(activeOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).slice(0, 3))); }, [activeOrders]);
  // Share the pinned header's height so category tags stick right under it
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--g-sticky", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, activeTab]);
  // Category drawer: hold the page still and close on Escape
  useEffect(() => {
    if (!showCatDrawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = e => { if (e.key === "Escape") setShowCatDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [showCatDrawer]);

  // ── LIVE PRODUCTS (catalog in code, merged with Supabase price & stock) ──
  // Match by name first (admin panel assigns timestamp IDs like "p1791..." not "p10"), then by id.
  // Once Supabase has loaded, products deleted in the admin panel are hidden and products added there appear.
  const findDbProduct = (p) =>
    dbProducts.find(d => d.name && p.name && nm(d.name) === nm(p.name)) ||
    dbProducts.find(d => d.id === p.id);
  const LIVE_PRODUCTS = useMemo(() => {
    const dbLoaded = dbProducts.length > 0;
    const fromCode = [];
    PRODUCTS.forEach(p => {
      const dbP = findDbProduct(p);
      if (dbLoaded && !dbP) return; // deleted in the admin panel
      const livePrice = dbP && dbP.price != null ? dbP.price : p.price;
      // If admin changed the base price, scale variant prices proportionally
      const scaledVariants = p.variants && p.price && livePrice !== p.price
        ? p.variants.map(v => ({ ...v, price: Math.round((v.price / p.price) * livePrice) }))
        : p.variants;
      fromCode.push({
        ...p,
        name: dbP && dbP.name ? String(dbP.name).replace(/\s+/g, " ").trim() : p.name, // admin edits & spelling fixes win
        name_kn: (dbP && dbP.name_kn) || KN_NAMES[p.name] || undefined,
        price: livePrice,
        variants: scaledVariants,
        in_stock: dbP ? dbP.in_stock !== false : true,
        stock_qty: dbP ? (dbP.stock_qty ?? 100) : 100,
        created_at: dbP ? dbP.created_at : undefined,
      });
    });
    const addedInAdmin = dbProducts
      .filter(d => d.name && !PRODUCTS.some(p => p.id === d.id || nm(p.name) === nm(d.name)))
      .map(d => ({
        id: d.id, cat: d.cat, name: String(d.name).trim(), name_kn: d.name_kn || undefined,
        price: d.price || 0, unit: d.unit || "1 unit", img: d.img_url || "",
        variants: Array.isArray(d.variants) && d.variants.length ? d.variants : undefined,
        in_stock: d.in_stock !== false, stock_qty: d.stock_qty ?? 100, created_at: d.created_at,
      }));
    return [...fromCode, ...addedInAdmin];
  }, [dbProducts]);

  // ── STATIC DATA ──
  const BUNDLES = [
    {id:"b1", icon:"🥬", name:"Weekly Sabzi Pack",   nameKn:"ವಾರದ ತರಕಾರಿ ಪ್ಯಾಕ್",  items:"Onion · Tomato · Potato · Coriander", price:89,  orig:105},
    {id:"b2", icon:"🥗", name:"Salad Combo",         nameKn:"ಸಲಾಡ್ ಕಾಂಬೊ",          items:"Cucumber · Carrot · Tomato · Lemon",   price:69,  orig:82},
    {id:"b3", icon:"🍳", name:"Breakfast Box",       nameKn:"ಬ್ರೇಕ್‌ಫಾಸ್ಟ್ ಬಾಕ್ಸ್",items:"Banana · Paneer · Butter · Tomato",    price:99,  orig:120},
    {id:"b4", icon:"🫕", name:"Dal-Sabzi Kit",       nameKn:"ದಾಲ್-ತರಕಾರಿ ಕಿಟ್",     items:"Onion · Tomato · Garlic · Ginger",    price:79,  orig:95},
  ];
  const FESTIVAL_PACKS = [
    {id:"f1", icon:"🪔", name:"Diwali Pooja Kit",    nameKn:"ದೀಪಾವಳಿ ಪೂಜಾ ಕಿಟ್",   items:"Marigold + Coconut + Banana + Rose",          price:149},
    {id:"f2", icon:"🌺", name:"Ugadi Special",       nameKn:"ಉಗಾದಿ ಸ್ಪೆಷಲ್",         items:"Raw Mango + Neem + Coconut + Jaggery",        price:129},
    {id:"f3", icon:"🐘", name:"Ganesh Chaturthi",    nameKn:"ಗಣೇಶ ಚತುರ್ಥಿ",           items:"Banana + Coconut + Marigold + Tulsi Garland", price:179},
    {id:"f4", icon:"🎋", name:"Sankranti Kit",       nameKn:"ಸಂಕ್ರಾಂತಿ ಕಿಟ್",         items:"Sugarcane + Sesame + Coconut + Pongal",       price:199},
  ];
  const SLOTS = ["Morning 7–10am","Afternoon 12–3pm","Evening 5–8pm"];
  const SLOTS_KN = ["ಬೆಳಿಗ್ಗೆ 7–10","ಮಧ್ಯಾಹ್ನ 12–3","ಸಂಜೆ 5–8"];
  const AREAS = ["Gadag","Betageri","Laxmeshwar","Shirahatti","Naragund","Ron","Mundaragi"];
  const FLASH = {name:"Fresh Tomatoes", nameKn:"ತಾಜಾ ಟೊಮ್ಯಾಟೊ", discount:10, icon:"🍅", ends:"Tonight 10pm"};

  const T = {
    en: {
      appName: "Royal Harvest",
      tagline: "Gadag, Karnataka",
      subtitle: "Fresh from your neighbourhood",
      searchPlaceholder: "Search products...",
      allCats: "All",
      addToCart: "Add",
      shopView: "Shop View",
      yourCart: "Your cart",
      checkout: "Checkout",
      orderPlaced: "Order placed!",
      emptyCart: "Your cart is empty",
      emptyCartSub: "Add some fresh products to get started.",
      shopNow: "Shop Now",
      deliveryAddress: "Delivery address",
      enterAddress: "Enter your delivery address...",
      paymentMethod: "Payment method",
      upi: "UPI / QR Code",
      cod: "Cash on Delivery",
      subtotal: "Subtotal",
      deliveryFee: "Delivery fee",
      total: "Total",
      placeOrder: "Place Order",
      orderConfirmed: "Order Confirmed!",
      orderStatus1: "Order received",
      orderStatus2: "Picking items",
      orderStatus3: "Out for delivery",
      orderStatus4: "Delivered!",
      thankYou: "Thank you for ordering!",
      continueShopping: "Continue Shopping",
      ordersHeading: "Incoming Orders",
      noOrders: "No orders yet",
      items: "items",
      paid: "Paid via",
      inStock: "In stock",
      outStock: "Out of stock",
      products: "products",
    },
    kn: {
      appName: "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್",
      tagline: "ಗದಗ, ಕರ್ನಾಟಕ",
      subtitle: "ನಿಮ್ಮ ನೆರೆಹೊರೆಯಿಂದ ತಾಜಾ",
      searchPlaceholder: "ಉತ್ಪನ್ನಗಳನ್ನು ಹುಡುಕಿ...",
      allCats: "ಎಲ್ಲಾ",
      addToCart: "ಸೇರಿಸಿ",
      shopView: "ಅಂಗಡಿ ನೋಟ",
      yourCart: "ನಿಮ್ಮ ಬುಟ್ಟಿ",
      checkout: "ಪಾವತಿ",
      orderPlaced: "ಆರ್ಡರ್ ಮಾಡಲಾಗಿದೆ!",
      emptyCart: "ನಿಮ್ಮ ಬುಟ್ಟಿ ಖಾಲಿ ಇದೆ",
      emptyCartSub: "ಪ್ರಾರಂಭಿಸಲು ತಾಜಾ ಉತ್ಪನ್ನಗಳನ್ನು ಸೇರಿಸಿ.",
      shopNow: "ಈಗ ಖರೀದಿಸಿ",
      deliveryAddress: "ತಲುಪಿಸುವ ವಿಳಾಸ",
      enterAddress: "ನಿಮ್ಮ ವಿಳಾಸ ನಮೂದಿಸಿ...",
      paymentMethod: "ಪಾವತಿ ವಿಧಾನ",
      upi: "UPI / QR ಕೋಡ್",
      cod: "ನಗದು ತಲುಪಿಸುವಿಕೆ",
      subtotal: "ಒಟ್ಟು ಮೊತ್ತ",
      deliveryFee: "ಡೆಲಿವರಿ ಶುಲ್ಕ",
      total: "ಒಟ್ಟು",
      placeOrder: "ಆರ್ಡರ್ ಮಾಡಿ",
      orderConfirmed: "ಆರ್ಡರ್ ದೃಢಪಡಿಸಲಾಗಿದೆ!",
      orderStatus1: "ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
      orderStatus2: "ವಸ್ತುಗಳನ್ನು ತೆಗೆಯಲಾಗುತ್ತಿದೆ",
      orderStatus3: "ತಲುಪಿಸಲು ಹೊರಟಿದೆ",
      orderStatus4: "ತಲುಪಿಸಲಾಗಿದೆ!",
      thankYou: "ಆರ್ಡರ್ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು!",
      continueShopping: "ಮುಂದುವರೆಸಿ",
      ordersHeading: "ಬರುತ್ತಿರುವ ಆರ್ಡರ್‌ಗಳು",
      noOrders: "ಇನ್ನೂ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ",
      items: "ವಸ್ತುಗಳು",
      paid: "ಪಾವತಿ:",
      inStock: "ದಾಸ್ತಾನಿದೆ",
      outStock: "ದಾಸ್ತಾನಿಲ್ಲ",
      products: "ಉತ್ಪನ್ನಗಳು",
    },
  };
  const t = T[lang];

  const filtered = useMemo(() => LIVE_PRODUCTS.filter(p =>
    (activeCat === "all" || p.cat === activeCat) && matchesQuery(p, query)
  ), [activeCat, query, LIVE_PRODUCTS]);

  // Each line carries the price and size the customer chose, so cart, total and saved order agree
  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const p = LIVE_PRODUCTS.find(x => x.id === id);
      if (!p) return null;
      const u = unitOf(p, selectedVariant);
      return { ...p, qty, price: u.price, unitLabel: u.label };
    })
    .filter(Boolean);
  const itemCount = cartItems.reduce((s,i) => s + i.qty, 0);
  const subtotal = cartItems.reduce((s,i) => s + i.qty * i.price, 0);
  // ── BILL: one calculation for the cart bar, the bill screen and the saved order ──
  const deliveryFee = subtotal > 0 && subtotal < 250 ? 15 : 0; // free delivery from ₹250, as the bill promises
  const total = subtotal + deliveryFee;

  const addToCart = (id) => {
    const prod = LIVE_PRODUCTS.find(p => p.id === id);
    if (prod && !prod.in_stock) return; // block out of stock
    setCart(c => ({...c, [id]: (c[id]||0)+1}));
  };
  const removeFromCart = (id) => setCart(c => ({...c, [id]: Math.max(0,(c[id]||0)-1)}));
  // ── DISCOUNT: ₹20 off if order ≥ ₹299 (F6) ──
  const minOrderDiscount = subtotal >= 299 ? 20 : 0;
  const finalTotal = total - minOrderDiscount + tip; // what the customer pays and the rider collects (tip included)
  // Coins earned this order (F2), on the goods only, not the tip
  const coinsEarned = Math.floor((total - minOrderDiscount) / 10);

  // ── HOME: shelves, search results, category drawer ──
  const shelves = useMemo(() => {
    const seen = new Set(), ordered = [];
    orderHistory.forEach(o => (o.items || []).forEach(i => {
      const p = LIVE_PRODUCTS.find(x => x.id === i.id) || LIVE_PRODUCTS.find(x => i.name && nm(x.name) === nm(i.name));
      if (p && !seen.has(p.id)) { seen.add(p.id); ordered.push(p); }
    }));
    // "New this week": added in the admin panel in the last 7 days (the first bulk import doesn't count)
    const stamps = LIVE_PRODUCTS.map(p => ts(p.created_at)).filter(n => !isNaN(n));
    const firstImport = stamps.length ? Math.min(...stamps) : Infinity;
    const isNew = p => { const t = ts(p.created_at); return !isNaN(t) && t > firstImport + 864e5 && Date.now() - t < 7 * 864e5; };
    return {
      ordered,
      new: LIVE_PRODUCTS.filter(isNew).sort((a, b) => ts(b.created_at) - ts(a.created_at)),
      picks: LIVE_PRODUCTS.filter(p => SHELF_PICKS.picks.includes(p.id)),
      seasonal: LIVE_PRODUCTS.filter(p => SHELF_PICKS.seasonal.includes(p.id)),
    };
  }, [LIVE_PRODUCTS, orderHistory]);

  const qTrim = query.trim();
  const shelfDef = SHELF_DEFS.find(s => s.id === activeShelf);
  let listMode = null;
  if (qTrim) {
    const items = shelfDef ? shelves[shelfDef.id].filter(p => matchesQuery(p, qTrim)) : filtered;
    listMode = {
      key: `q:${qTrim}:${activeShelf || ""}`, items,
      title: items.length
        ? (lang === "kn" ? `“${qTrim}”: ${items.length} ಫಲಿತಾಂಶ` : `${items.length} result${items.length === 1 ? "" : "s"} for “${qTrim}”`)
        : (lang === "kn" ? `“${qTrim}” ಸಿಗಲಿಲ್ಲ` : `No match for “${qTrim}”`),
    };
  } else if (shelfDef) {
    const items = shelves[shelfDef.id];
    listMode = { key: `s:${shelfDef.id}`, items, title: `${shelfDef[lang]} (${items.length})` };
  }
  const searchSuggestions = ["Tomato", "Onion", "Potato", "Banana", "Apple", "Coconut", "Paneer", "Ghee"]
    .filter(w => LIVE_PRODUCTS.some(p => nm(p.name).includes(w.toLowerCase())))
    .slice(0, 6)
    .map(w => { const label = lang === "kn" ? knGroupLabel(LIVE_PRODUCTS.filter(p => nm(p.name).includes(w.toLowerCase())), w) : w; return { q: label, label }; });
  const catCounts = LIVE_PRODUCTS.reduce((m, p) => { m[p.cat] = (m[p.cat] || 0) + 1; return m; }, {});

  const onShelf = (s, e) => {
    if (!shelves[s.id].length) {
      const wrap = chipsWrapRef.current ? chipsWrapRef.current.getBoundingClientRect() : { left: 0, width: 360 };
      const r = e.currentTarget.getBoundingClientRect();
      setChipNote({ id: s.id, text: s.empty[lang], x: Math.max(10, Math.min(r.left - wrap.left, wrap.width - 200)) });
      clearTimeout(chipNoteTimer.current);
      chipNoteTimer.current = setTimeout(() => setChipNote(null), 2600);
      return;
    }
    setChipNote(null);
    setActiveShelf(a => (a === s.id ? null : s.id));
  };
  const focusSearch = () => {
    const el = document.getElementById("g-search");
    if (el) el.focus({ preventScroll: true }); // focus inside the tap so phones open the keyboard
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const jumpToCat = (id) => {
    setShowCatDrawer(false); setQuery(""); setActiveShelf(null); setActiveCat("all");
    setTimeout(() => { const el = document.getElementById("sec-" + id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  };

  // Cancel for real: mark the order cancelled (the delivery app hides it) and put the items back in stock.
  // Only before the rider picks it up.
  const cancelOrder = async () => {
    const o = activeOrders[0];
    setShowCancelConfirm(false);
    if (!o) { setScreen("home"); return; }
    try {
      const { data: cur } = await supabase.from("orders").select("status").eq("id", o.id).single();
      if (cur && ["pickedup", "picked_up", "delivered"].includes(cur.status)) {
        alert(lang === "kn" ? "ಆರ್ಡರ್ ಈಗಾಗಲೇ ಹೊರಟಿದೆ, ರದ್ದು ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ." : "Your order is already on the way, so it can't be cancelled now.");
        return;
      }
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
      for (const it of (o.items || [])) {
        // same match as placeOrder: by name first (admin-added rows have their own ids), then by id
        const dbProd = dbProducts.find(d => d.name && it.name && d.name.toLowerCase() === it.name.toLowerCase()) || dbProducts.find(d => d.id === it.id);
        if (!dbProd) continue;
        const { data: p } = await supabase.from("products").select("id, stock_qty").eq("id", dbProd.id).single();
        if (p) { const q = (p.stock_qty ?? 0) + (it.qty || 0); await supabase.from("products").update({ stock_qty: q, in_stock: q > 0 }).eq("id", p.id); }
      }
    } catch (e) {}
    revokeCoins(o);
    setActiveOrders(v => v.filter(x => x.id !== o.id));
    setOrderHistory(h => h.map(x => (x.id === o.id ? { ...x, status: "cancelled" } : x)));
    setScreen("home");
    alert(lang === "kn" ? "ಆರ್ಡರ್ ರದ್ದು ಮಾಡಲಾಗಿದೆ" : "Order cancelled");
  };

  // A cancelled order doesn't earn coins: take them back, once per order
  const coinsRevokedRef = useRef(new Set());
  const revokeCoins = (o) => {
    if (!o || !o.coins || coinsRevokedRef.current.has(o.id)) return;
    coinsRevokedRef.current.add(o.id);
    setCoins(c => {
      const n = Math.max(0, c - o.coins);
      Storage.set("gd360_coins", String(n));
      if (currentUserId) supabase.from("users").update({ coins: n }).eq("id", currentUserId).then(() => {}, () => {});
      return n;
    });
  };

  const placeOrder = async () => {
    stopGpsWatch();
    const orderId = "GD" + Math.floor(1000 + Math.random()*9000);
    const newOrder = {id:orderId, status:"placed", placedAt:Date.now(), items:cartItems, total:finalTotal, coins:coinsEarned, address, gps_lat: gpsCoords?.lat || null, gps_lon: gpsCoords?.lon || null, payment, slot:deliverySlot, date: new Date().toLocaleDateString("en-IN"), customer_phone: userProfile.phone, customer_name: userProfile.name};
    setActiveOrders(v => [newOrder, ...v]);
      sendOwnerNotification(newOrder);
    setOrderHistory(h => [newOrder, ...h]);
    setCoins(c => {
      const newCoins = c + coinsEarned;
      Storage.set("gd360_coins", String(newCoins));
      return newCoins;
    });
    setOrderStatusIdx(0); setRiderPos(null); setScreen("checkout"); setCart({});
    setShowRating(false); setLastRating(0); setDeliverySlot("");
    setTimeout(() => setNotifShown(true), 2000);

    // ── REDUCE STOCK IN SUPABASE ──
    try {
      for (const item of cartItems) {
        const prod = LIVE_PRODUCTS.find(p => p.id === item.id);
        if (prod) {
          const newQty = Math.max(0, (prod.stock_qty || 100) - item.qty);
          // Match by name since admin-added products use timestamp IDs, not hardcoded IDs
          const dbProd = dbProducts.find(d => d.name && prod.name && d.name.toLowerCase() === prod.name.toLowerCase()) || dbProducts.find(d => d.id === item.id);
          if (dbProd) {
            await supabase.from("products").update({ stock_qty: newQty, in_stock: newQty > 0 }).eq("id", dbProd.id);
          }
        }
      }
    } catch(e) {}

    // ── SAVE TO SUPABASE ──
    try {
      // 1. Save order
      await supabase.from("orders").insert({
        id: orderId,
        status: "placed",
        total: finalTotal,
        delivery_fee: deliveryFee,
        discount: minOrderDiscount,
        address,
        gps_lat: gpsCoords ? gpsCoords.lat : null,
        gps_lon: gpsCoords ? gpsCoords.lon : null,
        delivery_slot: deliverySlot || "Standard",
        payment,
        user_id: currentUserId || null,
      });
      // 2. Save order items
      const items = cartItems.map(i => {
        // cartItems already carry the size and price the customer chose (see unitOf)
        const varLabel = i.unitLabel || selectedVariant[i.id] || null;
        const varPrice = i.price;
        return {
          order_id: orderId,
          product_id: i.id,
          product_name: i.name,
          quantity: i.qty,
          price: varPrice,
          variant: varLabel,
        };
      });
      const { data: itemsData, error: itemsError } = await supabase.from("order_items").insert(items);
      // 3. Update user coins
      if (currentUserId) {
        await supabase.from("users")
          .update({ coins: coins + coinsEarned })
          .eq("id", currentUserId);
      }
    } catch(e) {}

    // Status advances only when delivery boy updates it in delivery.html
    // (polled every 10s via the order status polling effect below)
  };

  // F4 Smart reorder
  const reorder = (order) => {
    const newCart = {};
    order.items.forEach(i => { newCart[i.id] = i.qty; });
    setCart(newCart);
    setShowHistory(false);
    setScreen("cart");
  };

  // F13 Voice search
  const startVoice = () => {
    setVoiceError("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition;
    if (!SR) {
      setVoiceError(lang==="kn" ? "ವಾಯ್ಸ್ ಸಪೋರ್ಟ್ ಇಲ್ಲ" : "Voice not supported. Try Chrome on Android.");
      return;
    }
    navigator.mediaDevices?.getUserMedia({audio:true})
      .then(() => {
        const rec = new SR();
        rec.lang = lang === "kn" ? "kn-IN" : "en-IN";
        rec.continuous = false;
        rec.interimResults = false;
        rec.onstart = () => { setVoiceActive(true); setVoiceError(""); };
        rec.onend   = () => setVoiceActive(false);
        rec.onresult = (e) => { setQuery(e.results[0][0].transcript); setVoiceActive(false); };
        rec.onerror = (e) => {
          setVoiceActive(false);
          if (e.error === "not-allowed") setVoiceError(lang==="kn" ? "ಮೈಕ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್ ತೆರೆಯಿರಿ." : "Mic blocked. Allow microphone in browser settings.");
          else if (e.error === "no-speech") setVoiceError(lang==="kn" ? "ಮಾತು ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ." : "No speech heard. Try again.");
          else setVoiceError(lang==="kn" ? "ದೋಷ ಸಂಭವಿಸಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ." : "Error: " + e.error + ". Try again.");
        };
        rec.start();
      })
      .catch(() => {
        setVoiceError(lang==="kn" ? "ಮೈಕ್ ಅನುಮತಿ ಅಗತ್ಯ. ಬ್ರೌಸರ್‌ನಲ್ಲಿ Allow ಮಾಡಿ." : "Microphone permission required. Click 'Allow' in your browser.");
      });
  };

  const Header = ({ showBack, onBack, title }) => {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",paddingTop:"env(safe-area-inset-top, 0px)",backgroundColor:"white",borderBottom:`1px solid ${line}`,minHeight:52,position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {showBack
            ? <button onClick={onBack} style={{color:ink,background:"none",border:"none",cursor:"pointer",padding:4,display:"flex"}}><ArrowLeft size={20}/></button>
            : <button onClick={()=>setActiveTab("profile")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{width:34,height:34,borderRadius:"50%",backgroundColor:"#e8f5e9",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <User size={18} style={{color:basil}}/>
                </div>
              </button>
          }
          {title && <span style={{fontSize:16,fontWeight:800,color:ink}}>{title}</span>}
          {!showBack && !title && (
            <div aria-label={t.appName} style={{fontFamily:accent,fontSize:19,fontWeight:700,lineHeight:1,whiteSpace:"nowrap"}}>
              {lang==="kn"
                ? <span style={{color:basil}}>{t.appName}</span>
                : <><span style={{color:"#946500"}}>Royal</span> <span style={{color:basil}}>Harvest</span></>}
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setLang(l=>l==="en"?"kn":"en")}
            style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,backgroundColor:"#f5f5f5",color:ink,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
            <Globe size={10}/>{lang==="en"?"ಕನ್ನಡ":"EN"}
          </button>
          {screen==="home"
            ? <button onClick={()=>setScreen("cart")} style={{position:"relative",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:"50%",backgroundColor:"#f5f5f5"}}>
                <ShoppingCart size={18} style={{color:ink}}/>
                {itemCount>0 && <div style={{position:"absolute",top:0,right:0,width:16,height:16,borderRadius:"50%",backgroundColor:chili,color:"white",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{itemCount}</div>}
              </button>
            : null
          }
        </div>
      </div>
    );
  };


    // ── OWNER NOTIFICATIONS ──
    const sendOwnerNotification = (order) => {
      // WhatsApp notification to owner
      const mapsLink = order.gps_lat && order.gps_lon
        ? `\n📍 GPS Location: https://maps.google.com/?q=${order.gps_lat},${order.gps_lon}`
        : "";
      const waMsg = encodeURIComponent(
        `🛒 NEW ORDER - Royal Harvest\n` +
        `Order ID: #${order.id}\n` +
        `Customer: ${order.customer_name || "Customer"}\n` +
        `Phone: ${order.customer_phone || ""}\n` +
        `Items: ${(order.items||[]).map(i=>i.name+" x"+i.qty).join(", ")}\n` +
        `Total: ₹${order.total}\n` +
        `Address: ${order.address}${mapsLink}\n` +
        `Slot: ${order.slot}\n` +
        `Payment: ${order.payment === "online" ? "Online" : "Cash/UPI on delivery"}`
      );
      window.open(`https://wa.me/${SHOP_WHATSAPP}?text=${waMsg}`, "_blank");
    };

// 📱 SIMPLE LOGIN (no OTP — will add Firebase OTP later)
const sendOtp = async () => {
  if(loginPhone.length!==10){ alert("Enter valid 10-digit number"); return; }
  setLoginStep("otp"); // go to name step
};
const verifyOtp = async () => {
  if(!loginOtp.trim()){ alert("Enter your name"); return; }
  try {
    // loginOtp field is reused for name input temporarily
      // Define existingUser at outer scope so it's always accessible
      let existingUser = null;
      try {
        let { data: existingUsers } = await supabase
          .from("users").select("*").eq("phone", loginPhone).limit(1);
        existingUser = existingUsers && existingUsers.length > 0 ? existingUsers[0] : null;
        if (!existingUser) {
          const { data: newUser } = await supabase
            .from("users").insert({ phone: loginPhone, name: loginOtp.trim(), coins: 120 }).select().single();
          existingUser = newUser;
        } else if (loginOtp.trim() && !existingUser.name) {
          // Save name if not set yet
          await supabase.from("users").update({ name: loginOtp.trim() }).eq("id", existingUser.id);
        }
        if (existingUser) {
          setCurrentUserId(existingUser.id);
          setCoins(existingUser.coins || 120);
          const { data: orders } = await supabase
            .from("orders").select("*, order_items(*)").eq("user_id", existingUser.id).order("created_at", {ascending:false});
          if (orders) setOrderHistory(orders.map(o => ({
            id: o.id, total: o.total, address: o.address,
            payment: o.payment, slot: o.delivery_slot, status: o.status,
            date: new Date(o.created_at).toLocaleDateString("en-IN"),
            items: (o.order_items||[]).map(i => ({id:i.product_id, name:i.product_name, qty:i.quantity, price:i.price}))
          })));
        }
      } catch(e) {}

      // Always login regardless of Supabase success
      const profileData = {
        name: loginOtp.trim() || existingUser?.name || "",
        phone: loginPhone,
        email: existingUser?.email || ""
      };
      setUserProfile(profileData);
      setEditProfile(profileData);
      setIsLoggedIn(true);

      // Save session
      await Storage.set("gd360_loggedIn", "true");
      await Storage.set("gd360_profile", JSON.stringify(profileData));
      await Storage.set("gd360_userId", existingUser?.id||"");
      await Storage.set("gd360_coins", String(existingUser?.coins||120));

      setLoginPhone(""); setLoginOtp(""); setLoginStep("phone");
  } catch(e){ alert("Login failed. Please try again."); }  };
  const toggleWishlist = (id) => setWishlist(w=>({...w,[id]:!w[id]}));


  // ── CAPACITOR NATIVE SETUP ──
  useEffect(() => {
    // 1. Restore login session
    const restoreSession = async () => {
      try {
        // Try Capacitor Preferences first
        let loggedIn = null;
        let profileStr = null;
        let savedCoins = null;
        let savedUserId = null;

        if (isNative()) {
          try {
            const { Preferences } = await import("@capacitor/preferences");
            const r1 = await Preferences.get({ key: "gd360_loggedIn" });
            loggedIn = r1.value;
            if (loggedIn === "true") {
              const r2 = await Preferences.get({ key: "gd360_profile" });
              const r3 = await Preferences.get({ key: "gd360_coins" });
              const r4 = await Preferences.get({ key: "gd360_userId" });
              profileStr = r2.value;
              savedCoins = r3.value;
              savedUserId = r4.value;
            }
          } catch(e) {}
        }

        // Fallback to localStorage
        if (!loggedIn) {
          loggedIn = localStorage.getItem("gd360_loggedIn");
          profileStr = localStorage.getItem("gd360_profile");
          savedCoins = localStorage.getItem("gd360_coins");
          savedUserId = localStorage.getItem("gd360_userId");
        }

        if (loggedIn === "true") {
          if (profileStr) {
            try {
              const profile = JSON.parse(profileStr);
              setUserProfile(profile);
              setEditProfile(profile);
            } catch(e) {}
          }
          if (savedCoins) setCoins(parseInt(savedCoins)||120);
          if (savedUserId) {
            setCurrentUserId(savedUserId);
            // Fetch order history on session restore (not just after login)
            try {
              const { data: orders } = await supabase
                .from("orders").select("*, order_items(*)").eq("user_id", savedUserId).order("created_at", {ascending:false});
              if (orders) setOrderHistory(orders.map(o => ({
                id: o.id, total: o.total, address: o.address,
                payment: o.payment, slot: o.delivery_slot, status: o.status,
                date: new Date(o.created_at).toLocaleDateString("en-IN"),
                items: (o.order_items||[]).map(i => ({id:i.product_id, name:i.product_name, qty:i.quantity, price:i.price}))
              })));
            } catch(e) {}
          }
          setIsLoggedIn(true);
        }
      } catch(e) {}
    };
    restoreSession();

    // Load products from Supabase (overrides hardcoded prices)
    const loadProductsFromDB = async (attempt = 1) => {
      try {
        const { data, error } = await supabase.from("products").select("id, name, name_kn, cat, price, unit, in_stock, stock_qty, variants, img_url, created_at");
        if (error) throw error;
        if (data && data.length > 0) {
          setDbProducts(data);
        } else if (attempt < 3) {
          // Retry up to 3 times if empty (mobile network delay)
          setTimeout(() => loadProductsFromDB(attempt + 1), 1500 * attempt);
        }
      } catch(e) {
        if (attempt < 3) setTimeout(() => loadProductsFromDB(attempt + 1), 1500 * attempt);
      }
    };
    loadProductsFromDB();

    // 2. Status bar — only on native Android
    const setupStatusBar = async () => {
      if (!isNative()) return;
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setBackgroundColor({ color: "#ffffff" });
        await StatusBar.setStyle({ style: Style.Light });
      } catch(e) {}
    };
    setupStatusBar();

    // 3. Back button — only on native Android
    const setupBackButton = async () => {
      if (!isNative()) return;
      try {
        const { App: CapApp } = await import("@capacitor/app");
        CapApp.addListener("backButton", () => {
          setScreen(currentScreen => {
            if (currentScreen !== "home") { setTimeout(()=>setScreen("home"),0); return currentScreen; }
            return currentScreen;
          });
          setActiveTab(currentTab => {
            if (currentTab !== "home") { setTimeout(()=>{setActiveTab("home");setProfileSection(null);},0); return currentTab; }
            return currentTab;
          });
          setProfileSection(currentSection => {
            if (currentSection) { setTimeout(()=>setProfileSection(null),0); return currentSection; }
            return currentSection;
          });
        });
      } catch(e) {}
    };
    setupBackButton();
  }, []); // Run once on mount

  // ── ORDER STATUS + RIDER GPS POLL ──
  // While an order is live: every 3s on the tracking screen, every 15s elsewhere (keeps the home banner current).
  // Reads the real status (placed→confirmed→pickedup→delivered, or cancelled) and the rider's GPS.
  const STATUS_TO_IDX = { placed:0, confirmed:1, pickedup:2, picked_up:2, delivered:3 };
  const activeOrderId = activeOrders[0]?.id || null;
  const activeOrderDone = ["delivered", "cancelled"].includes(activeOrders[0]?.status);
  const isTrackingScreen = screen === "checkout" || screen === "confirmation";
  const deliveredRef = useRef(false);
  useEffect(() => {
    if (!activeOrderId || activeOrderDone) {
      if (riderPollRef.current) { clearInterval(riderPollRef.current); riderPollRef.current = null; }
      return;
    }
    deliveredRef.current = false;

    const pollOrder = async () => {
      if (deliveredRef.current) return;
      try {
        const { data } = await supabase
          .from("orders")
          .select("status, rider_lat, rider_lon")
          .eq("id", activeOrderId)
          .single();
        if (!data) return;
        setOrderStatusIdx(STATUS_TO_IDX[data.status] ?? 0);
        if (data.rider_lat && data.rider_lon) {
          setRiderPos(r => (r && r.lat === data.rider_lat && r.lon === data.rider_lon ? r : { lat: data.rider_lat, lon: data.rider_lon }));
        }
        setActiveOrders(v => (v.some(x => x.id === activeOrderId && x.status !== data.status)
          ? v.map(x => (x.id === activeOrderId ? { ...x, status: data.status } : x)) : v));
        if (data.status === "delivered") { deliveredRef.current = true; setShowRating(true); }
        if (data.status === "cancelled") { deliveredRef.current = true; revokeCoins(activeOrders.find(x => x.id === activeOrderId)); }
      } catch(e) {}
    };

    pollOrder(); // immediate first poll
    riderPollRef.current = setInterval(pollOrder, isTrackingScreen ? 3000 : 15000);
    return () => { if (riderPollRef.current) { clearInterval(riderPollRef.current); riderPollRef.current = null; } };
  }, [activeOrderId, activeOrderDone, isTrackingScreen]);

  // The order shown in the home banner (until it's delivered or cancelled)
  const liveOrder = activeOrderId && !activeOrderDone ? activeOrders[0] : null;
  const liveIdx = liveOrder ? (STATUS_TO_IDX[liveOrder.status] ?? orderStatusIdx) : 0;
  const liveKm = liveOrder && riderPos && liveOrder.gps_lat && liveOrder.gps_lon
    ? kmBetween([Number(riderPos.lat), Number(riderPos.lon)], [Number(liveOrder.gps_lat), Number(liveOrder.gps_lon)]) : null;

  // ── BOTTOM NAV ──
  // BottomNav removed — profile accessed via header avatar
  const BottomNav = () => null;

  return (
    <div className="app-shell" style={{width:"100%", maxWidth:"100%", minHeight:"100vh", display:"flex", flexDirection:"column", backgroundColor:bg, fontFamily:body, color:ink, position:"relative", boxSizing:"border-box", paddingTop:"env(safe-area-inset-top, 0px)"}}>

      {/* ── ACCOUNT TAB ── */}
      {activeTab==="profile" && !profileSection && <>
        {isLoggedIn ? (
          <>
            <div style={{flex:1,overflowY:"auto",backgroundColor:"#f8f8f6",paddingBottom:80}}>
              {/* Profile header */}
              <div style={{backgroundColor:"white",padding:"16px 20px 20px",paddingTop:"calc(env(safe-area-inset-top, 0px) + 16px)",textAlign:"center",borderBottom:`1px solid ${line}`}}>
                {/* Top row: Home icon left, Sign out right */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <button onClick={()=>{setActiveTab("home");setScreen("home");setProfileSection(null);}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,backgroundColor:"#f0faf4",color:basil,border:`1px solid ${basil}20`,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    <Home size={14}/> {lang==="kn"?"ಮುಖಪುಟ":"Home"}
                  </button>
                  <button onClick={()=>{
                    setIsLoggedIn(false);
                    Storage.remove("gd360_loggedIn");
                    Storage.remove("gd360_profile");
                    Storage.remove("gd360_userId");
                    Storage.remove("gd360_coins");
                  }} style={{fontSize:12,fontWeight:600,padding:"6px 14px",borderRadius:20,backgroundColor:"#fee2e2",color:chili,border:"none",cursor:"pointer"}}>
                    {lang==="kn"?"ಲಾಗ್ ಔಟ್":"Sign Out"}
                  </button>
                </div>
                {/* Avatar */}
                <div style={{width:64,height:64,borderRadius:"50%",backgroundColor:"#e8f0e4",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:28}}>
                  {userProfile.name?userProfile.name[0].toUpperCase():"👤"}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <span style={{fontSize:16,fontWeight:800,color:ink}}>Dear {userProfile.name||"Friend"}</span>
                  <button onClick={()=>setProfileSection("editprofile")} style={{background:"none",border:"none",cursor:"pointer",color:soil}}><Edit3 size={13}/></button>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:4,color:soil,fontSize:12}}>
                  <Phone size={11}/> {userProfile.phone}
                </div>
                {/* Delivery address */}
                <div style={{marginTop:14,padding:"10px 14px",backgroundColor:"#f8f8f6",borderRadius:12,textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:600,color:soil,marginBottom:4}}>{lang==="kn"?"ಡೆಲಿವರಿ ವಿಳಾಸ":"Your Delivery Address"}</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:ink}}>
                      <MapPin size={12} style={{color:basil}}/>{savedAddresses[0]||"Add address"}
                    </div>
                    <button onClick={()=>setProfileSection("addresses")} style={{background:"none",border:"none",cursor:"pointer",color:soil}}><Edit3 size={12}/></button>
                  </div>
                </div>
                {/* Delivery slot */}
                <div style={{marginTop:8,padding:"10px 14px",backgroundColor:"#f8f8f6",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:ink}}>
                    <Clock size={14} style={{color:basil}}/>
                    <span>{lang==="kn"?"ಡೆಲಿವರಿ ಸ್ಲಾಟ್":"Delivery Slot:"}</span>
                    <span style={{fontWeight:700,color:basil,backgroundColor:"#e8f5e9",padding:"2px 8px",borderRadius:10}}>7AM-9AM</span>
                  </div>
                  <ChevronRight size={14} style={{color:soil}}/>
                </div>
              </div>

              {/* 4 circle icons — Support, Past Orders, Money Matters, Everything Else */}
              <div style={{backgroundColor:"white",margin:"8px 0",padding:"20px 16px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {[
                    {icon:"?", label:lang==="kn"?"ಸಹಾಯ":"Support",        color:"#c8a96e", id:"help"},
                    {icon:"📦",label:lang==="kn"?"ಹಿಂದಿನ ಆರ್ಡರ್":"Past Orders",color:chili,   id:"orders"},
                    {icon:"₹", label:lang==="kn"?"ಹಣ":"Money Matters",     color:basil,    id:"payments"},
                    {icon:"···",label:lang==="kn"?"ಇತರೆ":"Everything Else", color:"#64b5d4", id:"more"},
                  ].map(item=>(
                    <button key={item.id} onClick={()=>setProfileSection(item.id==="more"?"editprofile":item.id)}
                      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer"}}>
                      <div style={{width:56,height:56,borderRadius:"50%",border:`2px solid ${item.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:item.color}}>
                        {item.icon}
                      </div>
                      <span style={{fontSize:12,fontWeight:500,color:ink}}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rest of menu items */}
              <div style={{backgroundColor:"white",margin:"8px 0",padding:"8px 16px"}}>
                {[
                  {icon:<Heart size={16}/>,   label:lang==="kn"?"ವಿಶ್‌ಲಿಸ್ಟ್":"Wishlist",        id:"wishlist"},
                  {icon:<Award size={16}/>,   label:lang==="kn"?"ರಿವಾರ್ಡ್ಸ್":"Rewards & Coins",  id:"rewards"},
                  {icon:<RefreshCcw size={16}/>,label:lang==="kn"?"ರಿಫಂಡ್":"Refunds",            id:"refunds"},
                  {icon:<Lightbulb size={16}/>,label:lang==="kn"?"ಸೂಚಿಸಿ":"Suggest Product",     id:"suggest"},
                  {icon:<Info size={16}/>,    label:lang==="kn"?"ಮಾಹಿತಿ":"General Info",         id:"info"},
                ].map(row=>(
                  <button key={row.id} onClick={()=>setProfileSection(row.id)}
                    style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${line}`,background:"none",border:"none",borderBottom:`1px solid ${line}`,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,color:ink}}>
                      <span style={{color:basil}}>{row.icon}</span>
                      <span style={{fontSize:14,fontWeight:500}}>{row.label}</span>
                    </div>
                    <ChevronRight size={14} style={{color:soil}}/>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* ── LOGIN SCREEN ── */
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:"100vh",backgroundColor:"white"}}>
            {/* Green top section */}
            <div style={{background:`linear-gradient(160deg,${basil},#2d9e5f)`,padding:"48px 24px 36px",textAlign:"center"}}>
              <img src="/logo192.png" alt="" width={68} height={68} style={{display:"inline-block",borderRadius:18,marginBottom:12,border:"2px solid rgba(255,255,255,0.55)",boxShadow:"0 6px 18px rgba(0,0,0,0.18)"}}/>
              <div style={{color:"white",fontSize:22,fontWeight:800,letterSpacing:-0.5}}>{lang==="kn"?"ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್":"Royal Harvest"}</div>
              <div style={{color:"rgba(255,255,255,0.8)",fontSize:13,marginTop:6}}>{lang==="kn"?"ತಾಜಾ ತರಕಾರಿ · ಹಣ್ಣು · 2 ಗಂಟೆಯಲ್ಲಿ ಡೆಲಿವರಿ":"Fresh Groceries · Delivered in 2 hrs"}</div>
            </div>
            {/* Login form */}
            <div style={{flex:1,padding:"28px 24px",backgroundColor:"white"}}>
              <div style={{fontSize:18,fontWeight:800,color:ink,marginBottom:6}}>{lang==="kn"?"ಲಾಗಿನ್ ಮಾಡಿ":"Login / Sign up"}</div>
              <div style={{fontSize:13,color:soil,marginBottom:24}}>{lang==="kn"?"ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ, ಕಾಯಿನ್ಸ್ ಗಳಿಸಿ":"Track orders, earn coins & save addresses"}</div>
              {loginStep==="phone" ? <>
                <div style={{fontSize:12,fontWeight:600,color:soil,marginBottom:6}}>{lang==="kn"?"ಮೊಬೈಲ್ ನಂಬರ್":"Mobile Number"}</div>
                <div style={{display:"flex",borderRadius:12,overflow:"hidden",border:`2px solid ${basil}`,marginBottom:16}}>
                  <div style={{padding:"12px 14px",backgroundColor:"#e8f5e9",color:basil,fontWeight:700,fontSize:14}}>+91</div>
                  <input type="tel" maxLength={10} value={loginPhone} onChange={e=>setLoginPhone(e.target.value.replace(/\D/g,""))}
                    placeholder={lang==="kn"?"10 ಅಂಕಿ ನಂಬರ್":"10-digit number"}
                    style={{flex:1,padding:"12px 14px",border:"none",outline:"none",fontSize:15,color:ink}}/>
                </div>
                <button onClick={sendOtp} style={{width:"100%",padding:"14px",borderRadius:14,backgroundColor:basil,color:"white",border:"none",cursor:"pointer",fontSize:15,fontWeight:800}}>
                  {lang==="kn"?"ಮುಂದುವರೆಯಿರಿ":"Continue"} →
                </button>
                <div style={{textAlign:"center",marginTop:20,fontSize:11,color:soil}}>
                  {lang==="kn"?"ಮುಂದುವರೆಯುವ ಮೂಲಕ ನೀವು ನಮ್ಮ ನಿಯಮಗಳನ್ನು ಒಪ್ಪಿಕೊಳ್ಳುತ್ತೀರಿ":"By continuing you agree to our Terms & Privacy Policy"}
                </div>
              </> : <>
                <div style={{fontSize:12,fontWeight:600,color:soil,marginBottom:6}}>{lang==="kn"?"ನಿಮ್ಮ ಹೆಸರು":"Your Name"}</div>
                <input type="text" value={loginOtp} onChange={e=>setLoginOtp(e.target.value)}
                  placeholder={lang==="kn"?"ಹೆಸರು ನಮೂದಿಸಿ":"Enter your name"}
                  style={{width:"100%",padding:"14px",borderRadius:14,border:`2px solid ${basil}`,outline:"none",fontSize:16,color:ink,boxSizing:"border-box",marginBottom:16}}/>
                <button onClick={verifyOtp} style={{width:"100%",padding:"14px",borderRadius:14,backgroundColor:basil,color:"white",border:"none",cursor:"pointer",fontSize:15,fontWeight:800,marginBottom:10}}>
                  {lang==="kn"?"ಲಾಗಿನ್ ಮಾಡಿ":"Login"} →
                </button>
                <button onClick={()=>setLoginStep("phone")} style={{width:"100%",padding:"10px",borderRadius:14,backgroundColor:"#f7f7f7",color:soil,border:"none",cursor:"pointer",fontSize:13,fontWeight:600}}>
                  {lang==="kn"?"← ನಂಬರ್ ಬದಲಾಯಿಸಿ":"← Change number"}
                </button>
              </>}
              {/* Benefits */}
              <div style={{marginTop:32,display:"flex",flexDirection:"column",gap:12}}>
                {[
                  {icon:"📦",text:lang==="kn"?"ಹಿಂದಿನ ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ":"Track your past orders"},
                  {icon:"🪙",text:lang==="kn"?"ಪ್ರತಿ ಆರ್ಡರ್‌ನಲ್ಲಿ ಕಾಯಿನ್ಸ್ ಗಳಿಸಿ":"Earn coins on every order"},
                  {icon:"📍",text:lang==="kn"?"ವಿಳಾಸ ಉಳಿಸಿ":"Save delivery addresses"},
                ].map((b,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:"50%",backgroundColor:"#f0faf4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{b.icon}</div>
                    <div style={{fontSize:13,color:soil}}>{b.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <BottomNav/>
      </>}

      {/* ── PROFILE SECTIONS ── */}
      {activeTab==="profile" && profileSection && <>
        <div className="flex items-center gap-3 px-4 py-3 sticky top-0 z-10" style={{backgroundColor: basil}}>
          <button onClick={()=>setProfileSection(null)} className="text-white"><ArrowLeft size={20}/></button>
          <span style={{fontFamily: display, color:"white", fontSize:17}}>
            {{orders:lang==="kn"?"ನನ್ನ ಆರ್ಡರ್‌ಗಳು":"My Orders", payments:lang==="kn"?"ಪಾವತಿ":"Payment Management", wishlist:lang==="kn"?"ವಿಶ್‌ಲಿಸ್ಟ್":"Wishlist", addresses:lang==="kn"?"ವಿಳಾಸ":"Saved Addresses", rewards:lang==="kn"?"ರಿವಾರ್ಡ್ಸ್":"Rewards", refunds:lang==="kn"?"ರಿಫಂಡ್":"Refunds", editprofile:lang==="kn"?"ಪ್ರೊಫೈಲ್ ಎಡಿಟ್":"Edit Profile", suggest:lang==="kn"?"ಸೂಚಿಸಿ":"Suggest Product", info:lang==="kn"?"ಮಾಹಿತಿ":"General Info", help:lang==="kn"?"ಸಹಾಯ":"Help & Support"}[profileSection]}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4">

          {/* MY ORDERS */}
          {profileSection==="orders" && (<>
            {/* Help button */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
              <button style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,backgroundColor:"#f0faf4",color:basil,border:`1px solid ${basil}`,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                💬 {lang==="kn"?"ಸಹಾಯ ಪಡೆಯಿರಿ":"Get Help"}
              </button>
            </div>
            {orderHistory.length===0
              ? <div style={{textAlign:"center",paddingTop:60}}>
                  <div style={{fontSize:48,marginBottom:12}}>📦</div>
                  <div style={{fontSize:14,color:soil}}>{lang==="kn"?"ಇನ್ನೂ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ":"No orders yet"}</div>
                  <button onClick={()=>{setProfileSection(null);setActiveTab("home");}} style={{marginTop:14,padding:"10px 24px",borderRadius:12,backgroundColor:basil,color:"white",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>
                    {lang==="kn"?"ಶಾಪಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ":"Start Shopping"}
                  </button>
                </div>
              : orderHistory.map(o=>(
                  <div key={o.id} style={{backgroundColor:"white",borderRadius:16,marginBottom:12,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
                    {/* Order header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:`1px solid ${line}`}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:800,color:ink}}>#{o.id}</div>
                        <div style={{fontSize:10,color:soil,marginTop:1}}>{o.date} · {o.slot||"Standard"}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {(() => {
                          const live = activeOrders.find(a => a.id === o.id);
                          const st = (live && live.status) || o.status || "delivered";
                          if (st === "cancelled") return <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:10,backgroundColor:"#FDECEA",color:chili}}>{lang==="kn"?"ರದ್ದಾಗಿದೆ":"Cancelled"}</span>;
                          if (st === "delivered") return <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:10,backgroundColor:"#e8f5e9",color:basil}}>✓ {lang==="kn"?"ತಲುಪಿಸಲಾಗಿದೆ":"Delivered"}</span>;
                          if (liveOrder && liveOrder.id === o.id) return (
                            <button className="g-reset g-tap" onClick={() => { setProfileSection(null); setActiveTab("home"); setScreen("checkout"); }}
                              style={{fontSize:11.5,fontWeight:700,padding:"5px 10px",borderRadius:10,backgroundColor:basil,color:"#fff",display:"inline-flex",alignItems:"center",gap:5}}>
                              <Bike size={13}/>{lang==="kn"?"ಟ್ರ್ಯಾಕ್ ಮಾಡಿ":"Track order"}</button>);
                          return <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:10,backgroundColor:"#FBF1D9",color:"#8A5A00"}}>{lang==="kn"?"ಪ್ರಗತಿಯಲ್ಲಿದೆ":"In progress"}</span>;
                        })()}
                      </div>
                    </div>
                    {/* Product images row */}
                    <div style={{display:"flex",gap:8,padding:"10px 14px",overflowX:"auto",scrollbarWidth:"none"}}>
                      {(o.items||[]).slice(0,5).map((item,idx)=>{
                        const prod = LIVE_PRODUCTS.find(p=>p.id===item.id||p.name===item.name);
                        return (
                          <div key={idx} style={{flexShrink:0,width:56,textAlign:"center"}}>
                            <div style={{width:56,height:56,borderRadius:10,overflow:"hidden",backgroundColor:"#fafafa",border:`1px solid ${line}`}}>
                              {prod?<ProductImage p={prod}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛒</div>}
                            </div>
                            <div style={{fontSize:8,color:soil,marginTop:3,lineHeight:1.2}}>×{item.qty}</div>
                          </div>
                        );
                      })}
                      {(o.items||[]).length>5&&<div style={{flexShrink:0,width:56,height:56,borderRadius:10,backgroundColor:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:soil}}>+{o.items.length-5}</div>}
                    </div>
                    {/* Total + actions */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderTop:`1px solid ${line}`}}>
                      <div style={{fontSize:13,fontWeight:800,color:ink}}>₹{o.total} · {o.payment==="online"?"Online":"COD"}</div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{
                          const items = (o.items||[]);
                          const subtotalAmt = items.reduce((s,i)=>s+(i.price*i.qty),0);
                          const invoiceHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Royal Harvest Invoice</title>
                          <style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#111;font-size:13px}
                          .header{border-bottom:2px solid #1A6B3C;padding-bottom:12px;margin-bottom:16px}
                          .logo{color:#1A6B3C;font-size:22px;font-weight:900;letter-spacing:-0.5px}
                          .subtitle{color:#555;font-size:11px;margin-top:2px}
                          .meta{display:flex;justify-content:space-between;margin:12px 0;font-size:12px}
                          .meta-box{background:#f8f8f8;padding:10px 14px;border-radius:8px;flex:1;margin:0 4px}
                          .meta-box:first-child{margin-left:0} .meta-box:last-child{margin-right:0}
                          .label{color:#888;font-size:10px;margin-bottom:3px}
                          table{width:100%;border-collapse:collapse;margin:16px 0}
                          th{background:#1A6B3C;color:white;padding:8px 10px;text-align:left;font-size:11px}
                          td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}
                          tr:last-child td{border-bottom:none}
                          .total-row{background:#f0faf4;font-weight:bold}
                          .footer{margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#888;text-align:center}
                          .green{color:#1A6B3C;font-weight:700}
                          .bill-summary{background:#f8f8f8;border-radius:8px;padding:12px;margin:12px 0}
                          .bill-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
                          .bill-total{display:flex;justify-content:space-between;padding:8px 0 0;margin-top:4px;border-top:1px solid #ddd;font-weight:bold;font-size:14px}
                          </style></head><body>
                          <div class="header">
                            <div class="logo">Royal Harvest</div>
                            <div class="subtitle">Fresh Groceries · Gadag-Betageri, Karnataka 582101</div>
                            <div class="subtitle">FSSAI: (Registration Pending) · Ph: +91 98765 43210</div>
                          </div>
                          <div style="text-align:center;font-size:14px;font-weight:bold;margin-bottom:12px;letter-spacing:1px">TAX INVOICE / BILL OF SUPPLY</div>
                          <div class="meta">
                            <div class="meta-box"><div class="label">Invoice No.</div><div style="font-weight:700">${o.id}-INV</div></div>
                            <div class="meta-box"><div class="label">Order No.</div><div style="font-weight:700">#${o.id}</div></div>
                            <div class="meta-box"><div class="label">Date</div><div>${o.date}</div></div>
                            <div class="meta-box"><div class="label">Payment</div><div>${o.payment==="online"?"Online payment":"Cash/UPI on Delivery"}</div></div>
                          </div>
                          <div class="meta">
                            <div class="meta-box" style="flex:2"><div class="label">Bill To / Ship To</div>
                              <div style="font-weight:600">${userProfile.name||"Customer"}</div>
                              <div>${o.address||"Gadag, Karnataka"}</div>
                              <div>Ph: ${userProfile.phone||"—"}</div>
                            </div>
                            <div class="meta-box" style="flex:2"><div class="label">Delivery Slot</div>
                              <div>${o.slot||"Standard Delivery"}</div>
                              <div class="label" style="margin-top:8px">Delivered By</div>
                              <div>Royal Harvest</div>
                            </div>
                          </div>
                          <table>
                            <thead><tr><th>SR</th><th>Item & Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
                            <tbody>
                              ${items.map((item,idx)=>`<tr><td>${idx+1}</td><td>${item.name}</td><td>${item.qty}</td><td>₹${item.price}</td><td>₹${item.price*item.qty}</td></tr>`).join("")}
                            </tbody>
                          </table>
                          <div class="bill-summary">
                            <div class="bill-row"><span>Item Total</span><span>₹${subtotalAmt}</span></div>
                            <div class="bill-row"><span>Delivery Fee</span><span>${subtotalAmt>=250?"FREE":"₹15"}</span></div>
                            <div class="bill-total"><span>Invoice Value</span><span class="green">₹${o.total}</span></div>
                          </div>
                          <div style="font-size:11px;color:#555;margin:8px 0">
                            <div>• GST: Fresh fruits & vegetables — 0% GST applicable</div>
                            <div>• This is a computer generated invoice and does not require a signature</div>
                          </div>
                          <div class="footer">
                            <div style="font-size:12px;font-weight:700;color:#1A6B3C;margin-bottom:4px">Thank you for shopping with Royal Harvest!</div>
                            <div>Fresh groceries delivered to your door in 2 hours</div>
                            <div style="margin-top:4px">For support: +91 98765 43210 · ${window.location.host}</div>
                          </div>
                          </body></html>`;
                          const win = window.open("","_blank");
                          if(win){ win.document.write(invoiceHTML); win.document.close(); win.print(); }
                        }} style={{padding:"5px 10px",borderRadius:8,backgroundColor:"#f0faf4",color:basil,border:`1px solid ${basil}20`,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                          🧾 {lang==="kn"?"ಇನ್‌ವಾಯ್ಸ್":"Invoice"}
                        </button>
                        <button onClick={()=>reorder(o)} style={{padding:"5px 10px",borderRadius:8,backgroundColor:basil,color:"white",border:"none",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                          🔄 {lang==="kn"?"ಮತ್ತೆ ಆರ್ಡರ್":"Reorder"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            }
          </>)}

          {/* PAYMENT MANAGEMENT */}
          {profileSection==="payments" && <div className="space-y-3">
            {[{icon:"📱",label:"UPI / GPay / PhonePe",sub:"Linked & active"},{icon:"💳",label:lang==="kn"?"ಕ್ರೆಡಿಟ್/ಡೆಬಿಟ್ ಕಾರ್ಡ್":"Credit / Debit Card",sub:lang==="kn"?"ಕಾರ್ಡ್ ಸೇರಿಸಿ":"Add a card"},{icon:"💵",label:"Cash on Delivery",sub:lang==="kn"?"ಡೆಲಿವರಿ ಸಮಯದಲ್ಲಿ ಪಾವತಿ":"Pay when order arrives"},{icon:"🪙",label:lang==="kn"?"ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್ ಕಾಯಿನ್ಸ್":"Royal Harvest Coins",sub:`${coins} coins = ₹${Math.floor(coins/10)} off next order`}].map((m,i)=>(
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                <span className="text-2xl">{m.icon}</span>
                <div><div className="font-semibold text-sm">{m.label}</div><div className="text-xs" style={{color:soil}}>{m.sub}</div></div>
              </div>
            ))}
          </div>}

          {/* WISHLIST */}
          {profileSection==="wishlist" && (
            Object.values(wishlist).filter(Boolean).length===0
              ? <div className="text-center pt-16"><div className="text-5xl mb-3">🤍</div><div className="text-sm" style={{color:soil}}>{lang==="kn"?"ವಿಶ್‌ಲಿಸ್ಟ್ ಖಾಲಿ ಇದೆ":"Your wishlist is empty"}</div><button onClick={()=>{setProfileSection(null);setActiveTab("home");setScreen("home");}} className="mt-4 px-4 py-2 rounded-xl text-sm font-bold" style={{backgroundColor:basil,color:"white"}}>{lang==="kn"?"ಉತ್ಪನ್ನ ಹುಡುಕಿ":"Browse Products"}</button></div>
              : <div className="grid grid-cols-2 gap-3">{LIVE_PRODUCTS.filter(p=>wishlist[p.id]).map(p=>(
                  <div key={p.id} className="rounded-2xl overflow-hidden" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                    <div style={{position:"relative",paddingTop:"75%",overflow:"hidden"}}><div style={{position:"absolute",inset:0}}><ProductImage p={p}/></div></div>
                    <div className="p-2"><div className="text-xs font-semibold">{lang==="kn"?(p.name_kn||KN_NAMES[p.name]||p.name):p.name}</div><div className="text-xs font-bold mt-1">₹{p.price}</div><button onClick={()=>addToCart(p.id)} className="w-full mt-2 py-1 rounded-lg text-xs font-bold" style={{backgroundColor:mango,color:basilDark}}>+ {lang==="kn"?"ಸೇರಿಸಿ":"Add"}</button></div>
                  </div>
                ))}</div>
          )}

          {/* SAVED ADDRESSES */}
          {profileSection==="addresses" && <div className="space-y-3">
            {savedAddresses.map((a,i)=>(
              <div key={i} className="flex items-start gap-3 p-4 rounded-2xl" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                <MapPin size={16} style={{color:basil,marginTop:2}}/>
                <div className="flex-1 text-sm">{a}</div>
                <button onClick={()=>setSavedAddresses(s=>s.filter((_,j)=>j!==i))} className="text-xs" style={{color:chili}}>✕</button>
              </div>
            ))}
            <button onClick={()=>{const a=prompt("Enter new address:");if(a)setSavedAddresses(s=>[...s,a]);}} className="w-full py-3 rounded-2xl text-sm font-bold" style={{backgroundColor:basil,color:"white"}}>+ {lang==="kn"?"ಹೊಸ ವಿಳಾಸ ಸೇರಿಸಿ":"Add New Address"}</button>
          </div>}

          {/* REWARDS */}
          {profileSection==="rewards" && <div>
            <div className="rounded-2xl p-5 mb-4 text-center" style={{backgroundColor:"#FFF8E1",border:`2px solid ${mango}`}}>
              <div className="text-5xl mb-2">🪙</div>
              <div className="text-3xl font-bold" style={{color:"#8B5E00"}}>{coins}</div>
              <div className="text-sm font-semibold" style={{color:soil}}>{lang==="kn"?"ಒಟ್ಟು ಕಾಯಿನ್ಸ್":"Total Coins"}</div>
              <div className="mt-2 text-xs" style={{color:soil}}>{lang==="kn"?`= ₹${Math.floor(coins/10)} ರಿಡೀಮ್ ಮೌಲ್ಯ`:`= ₹${Math.floor(coins/10)} redeemable value`}</div>
            </div>
            {[{label:lang==="kn"?"ಹೇಗೆ ಗಳಿಸುವುದು":"How to earn",items:[lang==="kn"?"₹10 ಖರ್ಚಿಗೆ 1 ಕಾಯಿನ್":"1 coin per ₹10 spent",lang==="kn"?"ಸ್ನೇಹಿತರನ್ನು ರೆಫರ್ ಮಾಡಿ → 50 ಕಾಯಿನ್ಸ್":"Refer a friend → 50 coins",lang==="kn"?"ಮೊದಲ ಆರ್ಡರ್ → 30 ಕಾಯಿನ್ಸ್":"First order bonus → 30 coins"]},{label:lang==="kn"?"ಹೇಗೆ ರಿಡೀಮ್ ಮಾಡುವುದು":"How to redeem",items:[lang==="kn"?"10 ಕಾಯಿನ್ಸ್ = ₹1 ರಿಯಾಯಿತಿ":"10 coins = ₹1 discount",lang==="kn"?"ಚೆಕ್‌ಔಟ್‌ನಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಅನ್ವಯ":"Applied automatically at checkout"]}].map((s,i)=>(
              <div key={i} className="rounded-2xl p-4 mb-3" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                <div className="font-semibold text-sm mb-2">{s.label}</div>
                {s.items.map((it,j)=><div key={j} className="text-xs flex items-center gap-2 mb-1"><span style={{color:basil}}>✓</span>{it}</div>)}
              </div>
            ))}
          </div>}

          {/* REFUNDS */}
          {profileSection==="refunds" && <div className="text-center pt-8">
            <div className="text-5xl mb-3">💸</div>
            <div className="font-semibold mb-1">{lang==="kn"?"ರಿಫಂಡ್ ನೀತಿ":"Refund Policy"}</div>
            <div className="text-sm mb-6" style={{color:soil}}>{lang==="kn"?"ತಾಜಾ ಸಮಸ್ಯೆ ಇದ್ದರೆ 24 ಗಂಟೆಯಲ್ಲಿ ಸಂಪರ್ಕಿಸಿ":"Contact within 24 hrs for freshness issues. Full refund guaranteed."}</div>
            <div className="rounded-2xl p-4 text-left" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
              <div className="text-sm font-semibold mb-2">📋 {lang==="kn"?"ರಿಫಂಡ್ ಇತಿಹಾಸ":"Refund History"}</div>
              <div className="text-xs" style={{color:soil}}>{lang==="kn"?"ಇನ್ನೂ ರಿಫಂಡ್‌ಗಳಿಲ್ಲ":"No refunds yet — great!"}</div>
            </div>
            <button className="w-full mt-4 py-3 rounded-2xl font-bold text-sm" style={{backgroundColor:chili,color:"white"}}>📞 {lang==="kn"?"ರಿಫಂಡ್ ಕೋರಿಕೆ":"Request a Refund"}</button>
          </div>}

          {/* EDIT PROFILE */}
          {profileSection==="editprofile" && <div className="space-y-4">
            {[{icon:<User size={14}/>,label:lang==="kn"?"ಹೆಸರು":"Full Name",key:"name",placeholder:"Your name"},{icon:<Phone size={14}/>,label:lang==="kn"?"ಫೋನ್":"Phone",key:"phone",placeholder:"10-digit number"},{icon:<Mail size={14}/>,label:lang==="kn"?"ಇಮೇಲ್":"Email",key:"email",placeholder:"your@email.com"}].map(f=>(
              <div key={f.key}>
                <div className="text-xs font-semibold mb-1 flex items-center gap-1" style={{color:soil}}>{f.icon} {f.label}</div>
                <input value={editProfile[f.key]} onChange={e=>setEditProfile(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{backgroundColor:panel,border:`1.5px solid ${line}`}}/>
              </div>
            ))}
            <button onClick={async()=>{
              setUserProfile({...editProfile});
              Storage.set("gd360_profile", JSON.stringify(editProfile));
              if(currentUserId){
                await supabase.from("users").update({name:editProfile.name, email:editProfile.email}).eq("id",currentUserId);
              }
              setProfileSection(null);
            }} className="w-full py-3 rounded-2xl font-bold text-sm" style={{backgroundColor:basil,color:"white"}}>
              {lang==="kn"?"ಪ್ರೊಫೈಲ್ ಉಳಿಸಿ":"Save Profile"}
            </button>
          </div>}

          {/* SUGGEST PRODUCT */}
          {profileSection==="suggest" && <div>
            <div className="text-sm mb-3" style={{color:soil}}>{lang==="kn"?"ನೀವು ಇಷ್ಟಪಡುವ ಉತ್ಪನ್ನ ಇಲ್ಲವೇ? ನಮಗೆ ತಿಳಿಸಿ!":"Can't find what you need? Tell us and we'll add it!"}</div>
            {!suggestSent ? <>
              <textarea value={suggestText} onChange={e=>setSuggestText(e.target.value)} rows={4}
                placeholder={lang==="kn"?"ಉದಾ: ರಾಗಿ ಹಿಟ್ಟು, ದೇಸಿ ತುಪ್ಪ 500g...":"e.g. Ragi flour, Desi ghee 500g, Jowar seeds..."}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{backgroundColor:panel,border:`1.5px solid ${line}`}}/>
              <button onClick={()=>{if(suggestText.trim())setSuggestSent(true);}} className="w-full mt-3 py-3 rounded-2xl font-bold text-sm" style={{backgroundColor:basil,color:"white"}}>
                📤 {lang==="kn"?"ಸಲ್ಲಿಸಿ":"Submit Suggestion"}
              </button>
            </> : <div className="text-center pt-8">
              <div className="text-5xl mb-3">🙏</div>
              <div className="font-bold">{lang==="kn"?"ಧನ್ಯವಾದ!":"Thank you!"}</div>
              <div className="text-sm mt-1" style={{color:soil}}>{lang==="kn"?"ನಿಮ್ಮ ಸಲಹೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ":"Your suggestion has been received. We'll review it soon!"}</div>
              <button onClick={()=>{setSuggestSent(false);setSuggestText("");}} className="mt-4 text-xs" style={{color:basil}}>{lang==="kn"?"ಮತ್ತೊಂದು ಸೂಚಿಸಿ":"Suggest another"}</button>
            </div>}
          </div>}

          {/* GENERAL INFO */}
          {profileSection==="info" && <div className="space-y-3">
            {[{title:"About Royal Harvest",body:"Royal Harvest delivers fresh fruits, vegetables and daily essentials straight from our own warehouse in Gadag to your doorstep in under 2 hours."},{title:"Service Areas",body:"Gadag · Betageri · Laxmeshwar · Shirahatti · Naragund · Ron · Mundaragi"},{title:"Delivery Hours",body:"7:00 AM – 9:00 PM, all days including Sundays"},{title:"Contact",body:"📞 +91 98765 43210\n📍 Gadag-Betageri, Karnataka 582101"}].map((s,i)=>(
              <div key={i} className="rounded-2xl p-4" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                <div className="font-semibold text-sm mb-1">{s.title}</div>
                <div className="text-xs whitespace-pre-line" style={{color:soil}}>{s.body}</div>
              </div>
            ))}
          </div>}

          {/* HELP & SUPPORT */}
          {profileSection==="help" && <div className="space-y-3">
            {[{q:lang==="kn"?"ಡೆಲಿವರಿ ಎಷ್ಟು ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ?":"How long does delivery take?",a:lang==="kn"?"ಸಾಮಾನ್ಯವಾಗಿ 45–90 ನಿಮಿಷ":"Usually 45–90 minutes within Gadag-Betageri."},{q:lang==="kn"?"ನನ್ನ ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡುವುದು ಹೇಗೆ?":"How do I track my order?",a:lang==="kn"?"ಆರ್ಡರ್ ನಂತರ ಲೈವ್ ಮ್ಯಾಪ್ ಲಭ್ಯ":"After placing, a live map screen shows your rider's location."},{q:lang==="kn"?"ಕನಿಷ್ಠ ಆರ್ಡರ್ ಎಷ್ಟು?":"What is the minimum order?",a:lang==="kn"?"ಕನಿಷ್ಠ ₹50":"Minimum order is ₹50. Free delivery above ₹199."},{q:lang==="kn"?"ಉತ್ಪನ್ನ ತಾಜಾ ಆಗಿಲ್ಲದಿದ್ದರೆ?":"What if the product is not fresh?",a:lang==="kn"?"ಫೋಟೋ ಕಳುಹಿಸಿ, ಪೂರ್ಣ ರಿಫಂಡ್ ಗ್ಯಾರಂಟಿ":"Send us a photo within 24 hrs — full refund guaranteed, no questions asked."}].map((faq,i)=>(
              <div key={i} className="rounded-2xl p-4" style={{backgroundColor:panel,border:`1px solid ${line}`}}>
                <div className="font-semibold text-sm mb-1">❓ {faq.q}</div>
                <div className="text-xs" style={{color:soil}}>{faq.a}</div>
              </div>
            ))}
            <div className="rounded-2xl p-4 text-center" style={{backgroundColor:"#E8F5E9"}}>
              <div className="text-sm font-semibold mb-2" style={{color:basil}}>{lang==="kn"?"ಇನ್ನೂ ಸಹಾಯ ಬೇಕೇ?":"Need more help?"}</div>
              <button className="px-4 py-2 rounded-xl text-sm font-bold" style={{backgroundColor:basil,color:"white"}}>💬 WhatsApp Us</button>
            </div>
          </div>}

        </div>
        <BottomNav/>
      </>}

      {screen === "home" && activeTab === "home" && <>
        {/* ── PINNED TOP: header + search stay on screen while you scroll ── */}
        <div ref={stickyRef} style={{ position:"sticky", top:0, zIndex:30, background:"#fff", boxShadow:"0 1px 0 rgba(30,43,34,0.07)" }}>
          <Header/>
          <div style={{ padding:"8px 12px 10px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"#F2F4EF", border:`1px solid ${line}`, borderRadius:14, height:46, padding:"0 5px 0 12px" }}>
              <Search size={17} style={{ color:soil, flexShrink:0 }}/>
              <input id="g-search" type="search" value={query} onChange={e => setQuery(e.target.value)} enterKeyHint="search"
                placeholder={lang==="kn" ? "ಟೊಮ್ಯಾಟೊ, ತುಪ್ಪ, ಹೂವು ಹುಡುಕಿ" : "Search tomato, ghee, flowers"}
                aria-label={lang==="kn" ? "ಉತ್ಪನ್ನ ಹುಡುಕಿ" : "Search products"}
                style={{ flex:1, minWidth:0, height:"100%", border:"none", background:"none", outline:"none", fontSize:16, color:ink, fontFamily:"inherit" }}/>
              {query && (
                <button className="g-reset" onClick={() => setQuery("")} aria-label={lang==="kn" ? "ಹುಡುಕಾಟ ಅಳಿಸಿ" : "Clear search"}
                  style={{ width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", color:soil, flexShrink:0 }}><X size={17}/></button>
              )}
              <button className={voiceActive ? "g-reset g-pulse" : "g-reset"} onClick={startVoice} aria-label={lang==="kn" ? "ಧ್ವನಿಯಿಂದ ಹುಡುಕಿ" : "Search by voice"}
                style={{ width:36, height:36, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  background: voiceActive ? chili : "#fff", color: voiceActive ? "#fff" : basil, border:`1px solid ${voiceActive ? chili : line}` }}>
                <Mic size={18}/>
              </button>
            </div>
            {voiceActive && <div role="status" style={{ fontSize:12, color:chili, fontWeight:600, marginTop:6 }}>{lang==="kn" ? "ಕೇಳುತ್ತಿದೆ… ಉತ್ಪನ್ನದ ಹೆಸರು ಹೇಳಿ" : "Listening… say a product name"}</div>}
            {voiceError && !voiceActive && <div role="alert" style={{ fontSize:12, color:chili, marginTop:6 }}>{voiceError}</div>}
          </div>
        </div>

        {/* ── DELIVERY STRIP ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"8px 14px", background:"linear-gradient(90deg, rgba(26,107,60,0.10), rgba(26,107,60,0.02))" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, minWidth:0 }}>
            <Zap size={13} style={{ color:basil, flexShrink:0 }} fill={basil}/>
            <span style={{ fontWeight:700, color:basil, whiteSpace:"nowrap" }}>{lang==="kn" ? "2 ಗಂಟೆಯಲ್ಲಿ ಡೆಲಿವರಿ" : "Delivery in 2 hrs"}</span>
            <button className="g-reset" onClick={() => setShowAreaPicker(true)} aria-label={lang==="kn" ? `ಪ್ರದೇಶ ಬದಲಿಸಿ: ${userArea}` : `Change area: ${userArea}`}
              style={{ display:"inline-flex", alignItems:"center", gap:2, fontWeight:600, color:ink, whiteSpace:"nowrap", padding:"2px 0" }}>
              <MapPin size={12} style={{ color:soil }}/>{userArea}<ChevronDown size={13} style={{ color:soil }}/>
            </button>
          </div>
          {coins > 0 && <span style={{ fontSize:12, fontWeight:700, color:"#7A5A12", whiteSpace:"nowrap" }}>🪙 {coins}</span>}
        </div>

        {/* ── SHELVES: tap a pill to see just those products ── */}
        <div ref={chipsWrapRef} style={{ position:"relative", background:"#fff", paddingBottom: chipNote ? 40 : 12, borderBottom:`1px solid ${line}` }}>
          <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"12px 12px 2px", scrollbarWidth:"none" }}>
            {SHELF_DEFS.map(s => {
              const on = activeShelf === s.id;
              const Icon = SHELF_ICONS[s.icon];
              return (
                <button key={s.id} className="g-reset g-tap" onClick={e => onShelf(s, e)} aria-pressed={on}
                  style={{ flexShrink:0, height:40, borderRadius:20, padding:"0 14px 0 12px", display:"inline-flex", alignItems:"center", gap:7,
                    background: on ? basil : s.tint, color: on ? "#fff" : ink, fontSize:14, fontWeight:600, whiteSpace:"nowrap",
                    border:`1px solid ${on ? basil : "transparent"}` }}>
                  {Icon && <Icon size={16} strokeWidth={2.2} style={{ color: on ? "#fff" : s.ink }}/>}
                  {s[lang]}
                  {on && <X size={14} strokeWidth={2.6}/>}
                </button>
              );
            })}
          </div>
          {chipNote && (
            <div role="status" style={{ position:"absolute", left:chipNote.x, bottom:8, background:"#fff", border:`1px solid ${line}`, borderRadius:10,
              padding:"4px 12px", fontFamily:accent, fontWeight:600, fontSize:14, color:soil, boxShadow:"0 4px 14px rgba(30,43,34,0.12)", whiteSpace:"nowrap" }}>
              {chipNote.text}
            </div>
          )}
        </div>

        {/* ── CATEGORY DRAWER: the side tab opens it; categories jump to their section ── */}
        <button onClick={() => setShowCatDrawer(d => !d)} aria-label={lang==="kn" ? "ವರ್ಗಗಳು" : "Categories"} aria-expanded={showCatDrawer}
          style={{ position:"fixed", left:COL_LEFT, top:"50%", transform:"translateY(-50%)", zIndex:37, width:28, height:64, backgroundColor:basil, color:"#fff",
            border:"none", cursor:"pointer", borderRadius:"0 12px 12px 0", display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"2px 2px 10px rgba(18,77,42,0.3)" }}>
          <ChevronRight size={20} strokeWidth={2.6} style={{ transform: showCatDrawer ? "rotate(180deg)" : "none" }}/>
        </button>
        {showCatDrawer && <>
          <div className="g-fade" onClick={() => setShowCatDrawer(false)} style={{ position:"fixed", inset:0, background:"rgba(22,32,24,0.35)", zIndex:50 }}/>
          <nav className="g-drawer" aria-label={lang==="kn" ? "ವರ್ಗಗಳು" : "Categories"}
            style={{ position:"fixed", top:0, bottom:0, left:COL_LEFT, width:"min(82vw, 300px)", background:"#fff", zIndex:51, borderRadius:"0 24px 24px 0",
              boxShadow:"8px 0 30px rgba(22,32,24,0.18)", display:"flex", flexDirection:"column", paddingTop:"env(safe-area-inset-top, 0px)" }}>
            <div style={{ padding:"26px 20px 16px" }}>
              <div style={{ fontFamily:accent, fontWeight:700, fontSize:30, lineHeight:1.15, color:basil }}>{lang==="kn" ? "ನಮಸ್ಕಾರ!" : "Namaskara!"}</div>
              <div style={{ fontSize:16, color:soil, marginTop:6, lineHeight:1.35 }}>{lang==="kn" ? "ಇಂದು ನಿಮಗೆ ಏನು ಬೇಕು?" : "What would you like today?"}</div>
            </div>
            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", alignItems:"stretch", gap:8, padding:"2px 16px 24px" }}>
              {CATS.filter(c => c.id !== "all" && catCounts[c.id]).map(c => (
                <button key={c.id} className="g-reset g-tap" onClick={() => jumpToCat(c.id)}
                  style={{ display:"flex", alignItems:"center", gap:12, background:"#F3F6F2", color:ink, borderRadius:14, padding:"10px 14px",
                    fontFamily:accent, fontWeight:700, fontSize:18, lineHeight:1.25 }}>
                  <span aria-hidden="true" style={{ fontFamily:body, fontSize:20 }}>{CAT_EMOJI[c.id] || "🛒"}</span>
                  <span style={{ flex:1 }}>{c[lang]}</span>
                  <span style={{ fontFamily:body, fontSize:12, fontWeight:700, color:basil, background:"#fff", borderRadius:10, padding:"2px 8px" }}>{catCounts[c.id]}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCatDrawer(false)} aria-label={lang==="kn" ? "ವರ್ಗಗಳನ್ನು ಮುಚ್ಚಿ" : "Close categories"}
              style={{ position:"absolute", right:-28, top:"50%", transform:"translateY(-50%)", width:28, height:64, background:basil, color:"#fff",
                border:"none", borderRadius:"0 12px 12px 0", cursor:"pointer", boxShadow:"2px 2px 10px rgba(18,77,42,0.3)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ChevronRight size={20} strokeWidth={2.6} style={{ transform:"rotate(180deg)" }}/>
            </button>
          </nav>
        </>}

        <HandpickdLayout
          filtered={filtered} listMode={listMode} onClearList={() => { setQuery(""); setActiveShelf(null); }}
          suggestions={searchSuggestions} onSuggest={setQuery}
          cart={cart} setCart={setCart} addToCart={addToCart} removeFromCart={removeFromCart}
          selectedVariant={selectedVariant} setSelectedVariant={setSelectedVariant}
          lang={lang} onOpenDrawer={() => setShowCatDrawer(true)}
          CATS={CATS} KN_NAMES={KN_NAMES}
          basil={basil} soil={soil} ink={ink} line={line} chili={chili}
        />

        {liveOrder && <div aria-hidden="true" style={{ height: 76, background: sage }}/>}

        {/* ── BOTTOM: live order (tap to track) + cart bar with how far to the ₹20 discount ── */}
        {(itemCount > 0 || liveOrder) && (
          <div style={{ position:"fixed", bottom:0, left:COL_LEFT, right:COL_LEFT, zIndex:35, padding:"0 10px calc(env(safe-area-inset-bottom, 0px) + 10px)", pointerEvents:"none" }}>
            {liveOrder && (() => {
              const kn = lang === "kn";
              const LiveIcon = [Clock, Package, Bike][liveIdx] || Clock;
              const etaMin = liveIdx === 2 && liveKm != null ? Math.max(2, Math.round(liveKm * 3.9)) : null;
              const head = [
                kn ? "ಆರ್ಡರ್ ಬಂದಿದೆ" : "Order received",
                kn ? "ಆರ್ಡರ್ ಪ್ಯಾಕ್ ಆಗುತ್ತಿದೆ" : "Packing your order",
                etaMin != null ? (kn ? `~${etaMin} ನಿಮಿಷದಲ್ಲಿ ತಲುಪುತ್ತದೆ` : `Arriving in ~${etaMin} min`) : (kn ? "ದಾರಿಯಲ್ಲಿದೆ" : "On the way"),
              ][liveIdx] || "";
              return (
                <button className="g-reset g-tap" onClick={() => setScreen("checkout")}
                  aria-label={`${head}. ${kn ? "ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ" : "Track your order"}`}
                  style={{ pointerEvents:"auto", width:"100%", display:"flex", alignItems:"center", gap:12, padding:"10px 14px 10px 10px", marginBottom: itemCount > 0 ? 8 : 0,
                    background:"#fff", borderRadius:18, border:`1px solid ${line}`, boxShadow:"0 8px 28px rgba(30,43,34,0.2)" }}>
                  <span style={{ position:"relative", width:42, height:42, borderRadius:21, background:"#E5F1E8", color:basil, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <LiveIcon size={20}/>
                    {liveIdx === 2 && <span className="g-live-dot" style={{ position:"absolute", top:1, right:1, border:"2px solid #fff", width:11, height:11 }}/>}
                  </span>
                  <span style={{ flex:1, minWidth:0, textAlign:"left" }}>
                    <span style={{ display:"block", fontSize:14.5, fontWeight:800, color:ink, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{head}</span>
                    <span style={{ display:"block", fontSize:12, color:soil, marginTop:1 }}>{kn ? "ಆರ್ಡರ್" : "Order"} #{liveOrder.id}</span>
                  </span>
                  <span style={{ display:"flex", alignItems:"center", gap:1, fontSize:14, fontWeight:800, color:basil, flexShrink:0 }}>
                    {kn ? "ಟ್ರ್ಯಾಕ್" : "Track"}<ChevronRight size={17}/>
                  </span>
                </button>
              );
            })()}
            {itemCount > 0 && (
            <div style={{ pointerEvents:"auto", background:"#fff", borderRadius:18, overflow:"hidden", border:`1px solid ${line}`, boxShadow:"0 8px 28px rgba(30,43,34,0.2)" }}>
              <div style={{ padding:"8px 14px 8px", fontSize:12, fontWeight:600, color: subtotal >= 299 ? basil : ink }}>
                {subtotal >= 299
                  ? (lang==="kn" ? "ಈ ಆರ್ಡರ್‌ನಲ್ಲಿ ₹20 ಉಳಿತಾಯ" : "You're saving ₹20 on this order")
                  : (lang==="kn" ? `${rs(299 - subtotal)} ಹೆಚ್ಚು ಸೇರಿಸಿ, ₹20 ಉಳಿಸಿ` : `Add ${rs(299 - subtotal)} more to save ₹20`)}
                <div style={{ height:4, borderRadius:2, background:"#E8ECE4", marginTop:6, overflow:"hidden" }}>
                  <div style={{ width:`${Math.min(100, (subtotal / 299) * 100)}%`, height:"100%", background:basil, borderRadius:2, transition:"width .3s" }}/>
                </div>
              </div>
              <button className="g-reset" onClick={() => setScreen("cart")}
                style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:basil, color:"#fff" }}>
                <span style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ background:"rgba(255,255,255,0.18)", borderRadius:10, padding:"4px 10px", fontSize:13, fontWeight:800 }}>
                    {lang==="kn" ? `${itemCount} ವಸ್ತುಗಳು` : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                  </span>
                  <span style={{ fontSize:17, fontWeight:800 }}>{rs(finalTotal)}</span>
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:2, fontSize:15, fontWeight:700 }}>
                  {lang==="kn" ? "ಬುಟ್ಟಿ ನೋಡಿ" : "View cart"}<ChevronRight size={18}/>
                </span>
              </button>
            </div>
            )}
          </div>
        )}

        {/* ── F7 BUNDLES MODAL ── */}
        {showBundles && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
            <div className="rounded-t-3xl pb-8 px-4 pt-4" style={{backgroundColor: bg}}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base" style={{fontFamily: display}}>📦 {lang==="kn" ? "ಬಂಡಲ್ ಆಫರ್‌ಗಳು" : "Bundle Offers"}</div>
                <button onClick={() => setShowBundles(false)}><X size={18} style={{color: soil}}/></button>
              </div>
              {BUNDLES.map(b => (
                <div key={b.id} className="rounded-xl p-3 mb-2 flex items-center justify-between" style={{backgroundColor: panel, border:`1px solid ${line}`}}>
                  <div>
                    <div className="font-semibold text-sm">{b.icon} {lang==="kn" ? b.nameKn : b.name}</div>
                    <div className="text-xs mt-0.5" style={{color: soil}}>{b.items}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold text-sm" style={{color: basil}}>₹{b.price}</span>
                      <span className="text-xs line-through" style={{color: soil}}>₹{b.orig}</span>
                      <span className="text-xs font-bold px-1 rounded" style={{backgroundColor:"#E8F5E9", color: basil}}>Save ₹{b.orig-b.price}</span>
                    </div>
                  </div>
                  <button className="text-xs font-bold px-3 py-2 rounded-xl" style={{backgroundColor: mango, color: basilDark}}>+ {lang==="kn" ? "ಸೇರಿಸಿ" : "Add"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── F8 FESTIVAL MODAL ── */}
        {showFestival && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
            <div className="rounded-t-3xl pb-8 px-4 pt-4" style={{backgroundColor: bg}}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base" style={{fontFamily: display}}>🪔 {lang==="kn" ? "ಹಬ್ಬದ ಪ್ಯಾಕ್‌ಗಳು" : "Festival Packs"}</div>
                <button onClick={() => setShowFestival(false)}><X size={18} style={{color: soil}}/></button>
              </div>
              {FESTIVAL_PACKS.map(f => (
                <div key={f.id} className="rounded-xl p-3 mb-2 flex items-center justify-between" style={{backgroundColor: panel, border:`1px solid ${line}`}}>
                  <div>
                    <div className="font-semibold text-sm">{f.icon} {lang==="kn" ? f.nameKn : f.name}</div>
                    <div className="text-xs mt-0.5" style={{color: soil}}>{f.items}</div>
                    <span className="font-bold text-sm" style={{color: basil}}>₹{f.price}</span>
                  </div>
                  <button className="text-xs font-bold px-3 py-2 rounded-xl" style={{backgroundColor: mango, color: basilDark}}>+ {lang==="kn" ? "ಸೇರಿಸಿ" : "Add"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── F3 ORDER HISTORY + F4 REORDER MODAL ── */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
            <div className="rounded-t-3xl pb-8 px-4 pt-4" style={{backgroundColor: bg, maxHeight:"80vh", overflowY:"auto"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base" style={{fontFamily: display}}>📋 {lang==="kn" ? "ಆರ್ಡರ್ ಇತಿಹಾಸ" : "Order History"}</div>
                <button onClick={() => setShowHistory(false)}><X size={18} style={{color: soil}}/></button>
              </div>
              {orderHistory.length === 0
                ? <div className="text-center py-8 text-sm" style={{color: soil}}>{lang==="kn" ? "ಇನ್ನೂ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ" : "No orders yet. Place your first order!"}</div>
                : orderHistory.map(o => (
                    <div key={o.id} className="rounded-xl p-3 mb-2" style={{backgroundColor: panel, border:`1px solid ${line}`}}>
                      <div className="flex justify-between text-sm font-bold mb-1"><span>#{o.id}</span><span style={{color: soil}}>₹{o.total}</span></div>
                      <div className="text-xs mb-1" style={{color: soil}}>{o.date} · {o.items.length} items</div>
                      <div className="text-xs mb-2" style={{color: soil}}>{o.items.map(i=>`${i.name} ×${i.qty}`).join(", ").substring(0,60)}...</div>
                      {/* F4 Reorder */}
                      <button onClick={() => reorder(o)} className="w-full text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1" style={{backgroundColor: basil, color:"white"}}>
                        <RotateCcw size={11}/> {lang==="kn" ? "ಮತ್ತೆ ಆರ್ಡರ್ ಮಾಡಿ" : "Reorder"}
                      </button>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* ── F15 REFERRAL MODAL ── */}
        {showReferral && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
            <div className="rounded-t-3xl pb-8 px-4 pt-4" style={{backgroundColor: bg}}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base" style={{fontFamily: display}}>🔗 {lang==="kn" ? "ಸ್ನೇಹಿತರನ್ನು ಕರೆಯಿರಿ" : "Refer a Friend"}</div>
                <button onClick={() => setShowReferral(false)}><X size={18} style={{color: soil}}/></button>
              </div>
              <div className="text-center py-4 rounded-2xl mb-3" style={{backgroundColor: panel}}>
                <div className="text-4xl mb-2">🎁</div>
                <div className="font-bold text-base">{lang==="kn" ? "ಇಬ್ಬರಿಗೂ ₹30 ರಿಯಾಯಿತಿ!" : "Both get ₹30 off!"}</div>
                <div className="text-xs mt-1" style={{color: soil}}>{lang==="kn" ? "ನಿಮ್ಮ ಕೋಡ್ ಶೇರ್ ಮಾಡಿ" : "Share your referral code"}</div>
                <div className="mt-3 mx-4 flex items-center rounded-xl overflow-hidden" style={{border:`2px solid ${mango}`}}>
                  <div className="flex-1 py-2 text-center font-bold tracking-widest" style={{color: basil, fontSize:18}}>ROYAL30</div>
                  <button onClick={() => { navigator.clipboard?.writeText("ROYAL30"); setReferralCopied(true); setTimeout(() => setReferralCopied(false), 2000); }}
                    className="px-3 py-2 text-xs font-bold" style={{backgroundColor: mango, color: basilDark}}>
                    {referralCopied ? "✓ Copied!" : <><Copy size={12}/></>}
                  </button>
                </div>
              </div>
              <button onClick={() => setShowReferral(false)} className="w-full py-3 rounded-2xl font-bold text-sm" style={{backgroundColor: basil, color:"white"}}>
                📲 {lang==="kn" ? "WhatsApp ನಲ್ಲಿ ಶೇರ್ ಮಾಡಿ" : "Share on WhatsApp"}
              </button>
            </div>
          </div>
        )}

        {/* ── F12 AREA PICKER MODAL ── */}
        {showAreaPicker && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{backgroundColor:"rgba(0,0,0,0.4)"}}>
            <div className="rounded-t-3xl pb-8 px-4 pt-4" style={{backgroundColor: bg, width:"100%", maxWidth:480, margin:"0 auto"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base" style={{fontFamily: display}}>📍 {lang==="kn" ? "ನಿಮ್ಮ ಪ್ರದೇಶ" : "Your Area"}</div>
                <button onClick={() => setShowAreaPicker(false)}><X size={18} style={{color: soil}}/></button>
              </div>
              {AREAS.map(a => (
                <button key={a} onClick={() => { setUserArea(a); setShowAreaPicker(false); }}
                  className="w-full text-left px-4 py-3 rounded-xl mb-2 flex items-center justify-between"
                  style={{backgroundColor: panel, border:`1.5px solid ${userArea===a ? basil : line}`, fontWeight: userArea===a ? 700 : 400}}>
                  <span className="text-sm">{a}</span>
                  {userArea === a && <Check size={14} style={{color: basil}}/>}
                </button>
              ))}
            </div>
          </div>
        )}
        <BottomNav/>
      </>}

      {/* ── CART SCREEN ── */}
      {screen === "cart" && <>
        <Header showBack onBack={() => setScreen("home")} title={lang==="kn"?"ನಿಮ್ಮ ಬುಟ್ಟಿ":"Your Cart"}/>
        <div style={{flex:1,overflowY:"auto",backgroundColor:"#f8f8f6",paddingBottom:100}}>
          {cartItems.length === 0
            ? <div style={{textAlign:"center",paddingTop:80}}>
                <div style={{fontSize:48,marginBottom:12}}>🧺</div>
                <div style={{fontSize:16,fontWeight:700,color:ink}}>{lang==="kn"?"ಬುಟ್ಟಿ ಖಾಲಿ ಇದೆ":"Cart is empty"}</div>
                <button onClick={()=>setScreen("home")} style={{marginTop:16,padding:"10px 24px",borderRadius:12,backgroundColor:basil,color:"white",border:"none",cursor:"pointer",fontWeight:700}}>{lang==="kn"?"ಶಾಪಿಂಗ್ ಮಾಡಿ":"Shop Now"}</button>
              </div>
            : <>
                {/* Cart items */}
                <div style={{backgroundColor:"white",margin:"8px 0"}}>
                  {cartItems.map((i,idx) => (
                    <div key={i.id} style={{display:"flex",alignItems:"center",padding:"12px 14px",borderBottom:idx<cartItems.length-1?`1px solid ${line}`:"none",gap:12}}>
                      <div style={{width:60,height:60,borderRadius:10,overflow:"hidden",flexShrink:0,backgroundColor:"#fafafa"}}><ProductImage p={i}/></div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:ink}}>{lang==="kn"?(i.name_kn||KN_NAMES[i.name]||i.name):i.name}</div>
                        <div style={{fontSize:11,color:soil,marginTop:2}}>{rs(i.price)} / {i.unitLabel||i.unit}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,backgroundColor:basil,borderRadius:20,padding:"5px 10px"}}>
                        <button onClick={()=>removeFromCart(i.id)} style={{color:"white",background:"none",border:"none",cursor:"pointer",fontSize:16,lineHeight:1}}>−</button>
                        <span style={{color:"white",fontSize:13,fontWeight:700,minWidth:16,textAlign:"center"}}>{i.qty}</span>
                        <button onClick={()=>addToCart(i.id)} style={{color:"white",background:"none",border:"none",cursor:"pointer",fontSize:16,lineHeight:1}}>+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery address */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:ink}}>📍 {lang==="kn"?"ಡೆಲಿವರಿ ವಿಳಾಸ":"Delivery Address"}</div>
                    <button onClick={()=>{
                      if(!navigator.geolocation){alert("GPS not supported on this device");return;}
                      stopGpsWatch();
                      setAddress(lang==="kn"?"ಸ್ಥಳ ಪತ್ತೆ ಮಾಡಲಾಗುತ್ತಿದೆ...":"Detecting location...");
                      setGpsCoords(null);
                      // GPS strategy: accept ANY reading immediately, keep refining silently.
                      // Phone GPS chip may only give cell-tower accuracy (7421m) — that's OK,
                      // we save the coords for rough area + customer types exact address below.
                      let watchId = null;
                      let bestAccuracy = Infinity;
                      // Stop watching after 15s (keep best reading we got)
                      const stopTimer = setTimeout(()=>{
                        if(watchId!=null) navigator.geolocation.clearWatch(watchId);
                      }, 15000);
                      watchId = navigator.geolocation.watchPosition((pos)=>{
                        const {latitude:lat, longitude:lon, accuracy} = pos.coords;
                        // Always update if this reading is better than what we have
                        if(accuracy < bestAccuracy){
                          bestAccuracy = accuracy;
                          setGpsCoords(g => (g && g.manual ? g : {lat, lon, accuracy: Math.round(accuracy)}));
                          setAddress(a => (!a || a==="Detecting location..." || a==="ಸ್ಥಳ ಪತ್ತೆ ಮಾಡಲಾಗುತ್ತಿದೆ...") ? (lang==="kn"?"GPS ಸ್ಥಳ ಪಿನ್ ಮಾಡಲಾಗಿದೆ ✓":"GPS location pinned ✓") : a);
                        }
                        // Stop early if excellent fix
                        if(accuracy <= 50){
                          clearTimeout(stopTimer);
                          navigator.geolocation.clearWatch(watchId);
                        }
                      },(err)=>{
                        // A hiccup after we already have a position: keep the pin and what they typed
                        if(bestAccuracy < Infinity) return;
                        clearTimeout(stopTimer);
                        if(watchId!=null) navigator.geolocation.clearWatch(watchId);
                        setAddress(a => (a==="Detecting location..." || a==="ಸ್ಥಳ ಪತ್ತೆ ಮಾಡಲಾಗುತ್ತಿದೆ...") ? "" : a);
                        if(err.code===1) alert(lang==="kn"?"ಲೊಕೇಶನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ.\n\niPhone ಬಳಕೆದಾರರು: Settings → Safari → Location → Allow\nಮತ್ತು Precise Location ಆನ್ ಮಾಡಿ\n\nAndroid: Browser settings → Site settings → Location → Allow":"Location permission denied.\n\niPhone users: Settings → Safari → Location → Allow\nAlso turn ON Precise Location\n\nAndroid: tap the 🔒 lock icon in address bar → allow Location");
                        else alert(lang==="kn"?"ಸ್ಥಳ ಪತ್ತೆ ವಿಫಲ. ವಿಳಾಸ ಟೈಪ್ ಮಾಡಿ":"GPS failed. Please type your address");
                      },{enableHighAccuracy:true, maximumAge:0, timeout:15000});
                      gpsWatchRef.current = { id: watchId, timer: stopTimer };
                    }} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:basil,backgroundColor:"#f0faf4",border:`1px solid ${basil}`,borderRadius:20,padding:"5px 12px",cursor:"pointer"}}>
                      <MapPin size={12}/> {lang==="kn"?"GPS ಬಳಸಿ":"Use GPS"}
                    </button>
                  </div>
                  {/* GPS pin: a small map with a centre pin the customer can move to their door */}
                  {gpsCoords ? (
                    <div style={{marginBottom:8}}>
                      <LocationPicker lat={gpsCoords.lat} lon={gpsCoords.lon} accuracy={gpsCoords.accuracy} manual={!!gpsCoords.manual} lang={lang}
                        onMove={({lat, lon}) => setGpsCoords(g => ({...(g || {}), lat, lon, manual: true}))}/>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:8}}>
                        <span style={{fontSize:12,fontWeight:600,color: gpsCoords.manual || gpsCoords.accuracy <= 500 ? basil : "#B5621A"}}>
                          {gpsCoords.manual
                            ? (lang==="kn" ? "✓ ನೀವು ಪಿನ್ ಇಟ್ಟಿದ್ದೀರಿ" : "✓ Pin placed by you")
                            : gpsCoords.accuracy > 500
                              ? (lang==="kn" ? `GPS ಅಂದಾಜು ±${fmtAccuracy(gpsCoords.accuracy)}: ಪಿನ್ ಸರಿಪಡಿಸಿ` : `Rough GPS (±${fmtAccuracy(gpsCoords.accuracy)}): move the pin to your door`)
                              : (lang==="kn" ? `GPS ಪಿನ್ (±${fmtAccuracy(gpsCoords.accuracy)})` : `GPS pinned (±${fmtAccuracy(gpsCoords.accuracy)})`)}
                        </span>
                        <a href={`https://maps.google.com/?q=${gpsCoords.lat},${gpsCoords.lon}`} target="_blank" rel="noreferrer"
                          style={{fontSize:12,fontWeight:600,color:basil,whiteSpace:"nowrap"}}>{lang==="kn" ? "ಮ್ಯಾಪ್‌ನಲ್ಲಿ ನೋಡಿ" : "Check in Maps"}</a>
                      </div>
                    </div>
                  ) : null}
                  <textarea value={gpsCoords ? address.replace("GPS location pinned ✓","").replace("GPS ಸ್ಥಳ ಪಿನ್ ಮಾಡಲಾಗಿದೆ ✓","") : address}
                    onChange={e=>{ setAddress(e.target.value); if(!e.target.value) setGpsCoords(null); }}
                    placeholder={gpsCoords ? (lang==="kn"?"ಮನೆ ನಂ, ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್, ಬೀದಿ ಹೆಸರು ನಮೂದಿಸಿ *":"Enter house no., landmark, street name *") : (lang==="kn"?"ನಿಮ್ಮ ವಿಳಾಸ ನಮೂದಿಸಿ...":"Enter your delivery address...")} rows={2}
                    style={{width:"100%",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"inherit",border:`1px solid ${gpsCoords?basil:line}`,outline:"none",resize:"none",boxSizing:"border-box"}}/>
                  {savedAddresses.length>0 && (
                    <div style={{display:"flex",gap:6,marginTop:6,overflowX:"auto",scrollbarWidth:"none"}}>
                      {savedAddresses.map((a,i)=>(
                        <button key={i} onClick={()=>{ setAddress(a); setGpsCoords(null); }} style={{flexShrink:0,fontSize:10,padding:"4px 10px",borderRadius:12,backgroundColor:address===a?basil:"#f0f0f0",color:address===a?"white":soil,border:"none",cursor:"pointer"}}>
                          📍 {a.substring(0,20)}...
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delivery slot */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:ink,marginBottom:8}}>🕐 {lang==="kn"?"ಡೆಲಿವರಿ ಸ್ಲಾಟ್":"Delivery Slot"}</div>
                  <div style={{display:"flex",gap:6}}>
                    {SLOTS.map((s,i)=>(
                      <button key={s} onClick={()=>setDeliverySlot(s)} style={{flex:1,padding:"8px 4px",borderRadius:10,fontSize:10,fontWeight:600,cursor:"pointer",backgroundColor:deliverySlot===s?basil:"#f7f7f7",color:deliverySlot===s?"white":soil,border:`1.5px solid ${deliverySlot===s?basil:line}`}}>
                        {lang==="kn"?SLOTS_KN[i]:s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Suggested products ₹10-15 */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:ink,marginBottom:10}}>🛍️ {lang==="kn"?"ನಿಮಗಾಗಿ ಸ್ಪೆಷಲ್ ಆಫರ್":"Special offers for you"}</div>
                  <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none"}}>
                    {LIVE_PRODUCTS.filter(p=>p.price<=30&&!cart[p.id]).slice(0,8).map(p=>(
                      <div key={p.id} style={{flexShrink:0,width:80,borderRadius:10,overflow:"hidden",backgroundColor:"#fafafa",border:`1px solid ${line}`}}>
                        <div style={{height:64,backgroundColor:"#fafafa",overflow:"hidden"}}><ProductImage p={p}/></div>
                        <div style={{padding:"4px 6px 6px"}}>
                          <div style={{fontSize:9,fontWeight:600,color:ink,lineHeight:1.2}}>{p.name.split(" ").slice(0,2).join(" ")}</div>
                          <div style={{fontSize:10,fontWeight:800,color:basil,marginTop:2}}>₹{p.price}</div>
                          <button onClick={()=>addToCart(p.id)} style={{width:"100%",marginTop:4,padding:"3px 0",borderRadius:6,backgroundColor:mango,color:"white",border:"none",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Add</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tip for delivery */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:ink,marginBottom:8}}>🤝 {lang==="kn"?"ಡೆಲಿವರಿ ಹುಡುಗನಿಗೆ ಟಿಪ್":"Tip your delivery partner"}</div>
                  <div style={{display:"flex",gap:6}}>
                    {[0,10,20,30,50].map(t=>(
                      <button key={t} onClick={()=>setTip(t)} style={{flex:1,padding:"6px 2px",borderRadius:8,fontSize:11,fontWeight:600,cursor:"pointer",backgroundColor:tip===t?basil:"#f7f7f7",color:tip===t?"white":soil,border:`1px solid ${tip===t?basil:line}`}}>
                        {t===0?(lang==="kn"?"ಇಲ್ಲ":"None"):`₹${t}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bill summary */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:ink,marginBottom:10}}>🧾 {lang==="kn"?"ಬಿಲ್ ಸಾರಾಂಶ":"Bill Summary"}</div>
                  {[
                    {label:lang==="kn"?"ಐಟಂ ಒಟ್ಟು":"Item total", val:`₹${subtotal}`},
                    {label:lang==="kn"?"ಡೆಲಿವರಿ ಶುಲ್ಕ":"Delivery fee", val:subtotal>=250?<span style={{color:basil}}>{lang==="kn"?"ಉಚಿತ":"FREE"}</span>:`₹${deliveryFee}`, hint:lang==="kn"?"₹250 ಮೇಲೆ ಉಚಿತ ಡೆಲಿವರಿ":"Free delivery above ₹250"},
                    {label:lang==="kn"?"ಟಿಪ್":"Tip", val:`₹${tip}`},
                    minOrderDiscount>0&&{label:lang==="kn"?"ರಿಯಾಯಿತಿ":"Discount", val:`−₹${minOrderDiscount}`, green:true},
                    {label:lang==="kn"?"ಕಾಯಿನ್ಸ್ ಗಳಿಕೆ":"Coins earned", val:`+${coinsEarned}🪙`, green:true},
                  ].filter(Boolean).map((row,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:12,color:soil}}>{row.label}</div>
                        {row.hint&&<div style={{fontSize:9,color:basil}}>{row.hint}</div>}
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:row.green?basil:ink}}>{row.val}</div>
                    </div>
                  ))}
                  <div style={{borderTop:`1px solid ${line}`,paddingTop:10,display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:14,fontWeight:800,color:ink}}>{lang==="kn"?"ಒಟ್ಟು ಪಾವತಿ":"Total to pay"}</span>
                    <span style={{fontSize:14,fontWeight:800,color:ink}}>{rs(finalTotal)}</span>
                  </div>
                </div>

                {/* Payment + Place Order */}
                <div style={{backgroundColor:"white",margin:"8px 0",padding:"14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:ink,marginBottom:10}}>💳 {lang==="kn"?"ಪಾವತಿ ವಿಧಾನ":"Payment Method"}</div>
                  <div style={{display:"flex",gap:8,marginBottom:14}}>
                    {[{id:"cod",icon:"💵",label:lang==="kn"?"ನಗದು/UPI ಡೆಲಿವರಿ":"Cash/UPI on Delivery"},{id:"online",icon:"📱",label:lang==="kn"?"ಆನ್‌ಲೈನ್ ಪಾವತಿ":"Pay Online"}].map(opt=>(
                      <button key={opt.id} onClick={()=>setPayment(opt.id)} style={{flex:1,padding:"10px 6px",borderRadius:12,fontSize:11,fontWeight:600,cursor:"pointer",backgroundColor:payment===opt.id?"#f0faf4":"#f7f7f7",color:payment===opt.id?basil:soil,border:`1.5px solid ${payment===opt.id?basil:line}`,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                        <span style={{fontSize:20}}>{opt.icon}</span>{opt.label}
                        {payment===opt.id&&<Check size={12} style={{color:basil}}/>}
                      </button>
                    ))}
                  </div>
                  <button onClick={placeOrder} disabled={!address.trim()} style={{width:"100%",padding:"14px",borderRadius:14,backgroundColor:address.trim()?basil:"#ccc",color:"white",border:"none",cursor:address.trim()?"pointer":"not-allowed",fontSize:15,fontWeight:800}}>
                    {lang==="kn"?"ಆರ್ಡರ್ ಮಾಡಿ":"Place Order"} →
                  </button>
                </div>
              </>
          }
        </div>
      </>}

      {/* ── ORDER TRACKING: map on top, details in a sheet that slides over it ── */}
      {screen === "checkout" && (() => {
        const o = activeOrders[0] || {};
        const kn = lang === "kn";
        const idx = STATUS_TO_IDX[o.status] ?? orderStatusIdx;
        const cancelled = o.status === "cancelled";
        const homePt = o.gps_lat && o.gps_lon ? [Number(o.gps_lat), Number(o.gps_lon)] : null;
        const riderKm = riderPos && homePt ? kmBetween([Number(riderPos.lat), Number(riderPos.lon)], homePt) : null;
        const etaMin = riderKm != null ? Math.max(2, Math.round(riderKm * 3.9)) : null; // ~1.3× road factor at ~20 km/h
        const STEPS = [
          { key: "placed", en: "Received", kn: "ಸ್ವೀಕೃತ", Icon: Clock },
          { key: "packing", en: "Packing", kn: "ಪ್ಯಾಕಿಂಗ್", Icon: Package },
          { key: "onway", en: "On the way", kn: "ದಾರಿಯಲ್ಲಿ", Icon: Bike },
          { key: "done", en: "Delivered", kn: "ತಲುಪಿದೆ", Icon: Home },
        ];
        const HEAD = [
          { en: ["We've got your order", "We'll start packing it shortly."], kn: ["ನಿಮ್ಮ ಆರ್ಡರ್ ಬಂದಿದೆ", "ಶೀಘ್ರದಲ್ಲೇ ಪ್ಯಾಕಿಂಗ್ ಆರಂಭವಾಗುತ್ತದೆ."] },
          { en: ["Packing your order", "Fresh items are being picked at our Gadag store."], kn: ["ನಿಮ್ಮ ಆರ್ಡರ್ ಪ್ಯಾಕ್ ಆಗುತ್ತಿದೆ", "ನಮ್ಮ ಗದಗ ಅಂಗಡಿಯಲ್ಲಿ ತಾಜಾ ವಸ್ತುಗಳನ್ನು ಆರಿಸಲಾಗುತ್ತಿದೆ."] },
          { en: ["On the way", riderKm != null ? `Your rider is ${riderKm.toFixed(1)} km away.` : "Your rider has left our store."],
            kn: ["ದಾರಿಯಲ್ಲಿದೆ", riderKm != null ? `ನಿಮ್ಮ ರೈಡರ್ ${riderKm.toFixed(1)} ಕಿ.ಮೀ ದೂರದಲ್ಲಿದ್ದಾರೆ.` : "ರೈಡರ್ ಅಂಗಡಿಯಿಂದ ಹೊರಟಿದ್ದಾರೆ."] },
          { en: ["Delivered", "Enjoy your fresh groceries!"], kn: ["ತಲುಪಿಸಲಾಗಿದೆ", "ತಾಜಾ ದಿನಸಿಯನ್ನು ಆನಂದಿಸಿ!"] },
        ][idx] || { en: ["", ""], kn: ["", ""] };
        const [title, sub] = cancelled
          ? (kn ? ["ಆರ್ಡರ್ ರದ್ದಾಗಿದೆ", "ಈ ಆರ್ಡರ್ ರದ್ದು ಮಾಡಲಾಗಿದೆ. ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ‘ಸಹಾಯ ಪಡೆಯಿರಿ’ ಒತ್ತಿ."] : ["Order cancelled", "This order was cancelled. Questions? Tap Get help."])
          : (HEAD[lang] || HEAD.en);
        const eta = cancelled ? null : idx === 2
          ? (etaMin != null ? { label: kn ? "ತಲುಪುವ ಸಮಯ" : "Arriving in", value: kn ? `~${etaMin} ನಿಮಿಷ` : `~${etaMin} min` } : null)
          : idx < 2 ? { label: kn ? "ಡೆಲಿವರಿ" : "Delivery", value: o.slot || (kn ? "2 ಗಂಟೆಯೊಳಗೆ" : "Within 2 hrs") } : null;
        const items = o.items || [];
        const nItems = items.reduce((s, i) => s + (i.qty || 0), 0);
        const itemName = i => (kn ? (i.name_kn || KN_NAMES[i.name] || i.name) : i.name);
        const itemsLine = items.slice(0, 2).map(itemName).join(", ") + (items.length > 2 ? (kn ? ` +${items.length - 2} ಇನ್ನಷ್ಟು` : ` +${items.length - 2} more`) : "");
        const addressText = (o.address || "").replace("GPS location pinned ✓", "").replace("GPS ಸ್ಥಳ ಪಿನ್ ಮಾಡಲಾಗಿದೆ ✓", "").trim();
        const payLabel = o.payment === "online" ? (kn ? "ಆನ್‌ಲೈನ್ ಪಾವತಿ" : "Online payment") : (kn ? "ಡೆಲಿವರಿ ವೇಳೆ ನಗದು / UPI" : "Cash or UPI on delivery");
        const canCancel = !cancelled && idx < 2 && !!o.id;
        const detailRow = (Icon, label, value, extra, last) => (
          <div style={{ display: "flex", gap: 12, padding: "12px 14px", borderBottom: last ? "none" : `1px solid ${line}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 17, background: "#F1F5F0", color: basil, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={17}/></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: soil }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: ink, marginTop: 1, lineHeight: 1.35, overflowWrap: "anywhere" }}>{value}</div>
              {extra}
            </div>
          </div>
        );
        const sendWhatsApp = () => {
          const itemList = items.map(i => `• ${i.name} x${i.qty} = ₹${i.price * i.qty}`).join("\n");
          const msg = encodeURIComponent(
            `✅ *Royal Harvest - Order Confirmed!*\n\n🆔 Order ID: *#${o.id || "—"}*\n📅 Date: ${o.date || ""}\n⏰ Delivery Slot: ${o.slot || ""}\n\n` +
            `🛒 *Items Ordered:*\n${itemList}\n\n💰 *Total: ₹${o.total || 0}*\n💳 Payment: ${o.payment === "online" ? "Online" : "Cash/UPI on Delivery"}\n\n` +
            `📍 Deliver to: ${o.address || ""}\n\nThank you for ordering from Royal Harvest! 🙏\nFor help: +91 98868 88924`);
          window.open(`https://wa.me/?text=${msg}`, "_blank");
        };
        return <>
          <div style={{ position: "relative" }}>
            <TrackingMap customerLat={o.gps_lat} customerLon={o.gps_lon} riderPos={riderPos} lang={lang} height="clamp(300px, 46vh, 440px)" finished={idx === 3 || cancelled}/>
            <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 12, right: 12, zIndex: 2, display: "flex",
              alignItems: "center", justifyContent: "space-between", pointerEvents: "none" }}>
              <button className="g-reset" onClick={() => setScreen("home")} aria-label={kn ? "ಅಂಗಡಿಗೆ ಹಿಂತಿರುಗಿ" : "Back to the shop"}
                style={{ pointerEvents: "auto", width: 42, height: 42, borderRadius: 21, background: "#fff", boxShadow: "0 3px 12px rgba(0,0,0,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: ink }}><ArrowLeft size={20}/></button>
              {riderPos && idx === 2 && !cancelled && (
                <span className="g-frost" style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 16,
                  fontSize: 12.5, fontWeight: 700, color: basilDark }}><span className="g-live-dot"/>{kn ? "ಲೈವ್ ಸ್ಥಳ" : "Live location"}</span>
              )}
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 2, marginTop: -24, background: "#fff", borderRadius: "24px 24px 0 0",
            boxShadow: "0 -10px 30px rgba(30,43,34,0.10)", padding: "10px 16px 28px", minHeight: "56vh" }}>
            <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "#D9DED3", margin: "0 auto 14px" }}/>

            {/* Status headline + arrival */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontFamily: accent, fontSize: 25, fontWeight: 700, color: ink, lineHeight: 1.15 }}>{title}</h1>
                <p role="status" style={{ fontSize: 14, color: soil, marginTop: 5, lineHeight: 1.4 }}>{sub}</p>
              </div>
              {eta && (
                <div style={{ flexShrink: 0, textAlign: "center", background: "#EEF6F0", borderRadius: 14, padding: "8px 12px", minWidth: 86 }}>
                  <div style={{ fontSize: 11, color: basilDark, fontWeight: 600 }}>{eta.label}</div>
                  <div style={{ fontSize: 16, color: basil, fontWeight: 800, whiteSpace: "nowrap", marginTop: 1 }}>{eta.value}</div>
                </div>
              )}
            </div>

            {/* Progress */}
            {!cancelled && <ol aria-label={kn ? "ಆರ್ಡರ್ ಹಂತಗಳು" : "Order progress"}
              style={{ listStyle: "none", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", margin: "20px 0 4px", padding: 0 }}>
              {STEPS.map((s, i) => {
                const done = i < idx || idx === 3, active = i === idx && idx < 3;
                const Icon = s.Icon;
                return (
                  <li key={s.key} aria-current={active ? "step" : undefined}
                    style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                    {i > 0 && <span aria-hidden="true" style={{ position: "absolute", top: 17, right: "50%", width: "100%", height: 3, borderRadius: 2,
                      background: i <= idx ? basil : "#E3E8E0" }}/>}
                    <span className={active ? "g-step-active" : undefined} style={{ position: "relative", width: 36, height: 36, borderRadius: 18,
                      display: "flex", alignItems: "center", justifyContent: "center", background: done ? basil : active ? "#fff" : "#F1F4EF",
                      border: `2px solid ${done || active ? basil : "#E3E8E0"}`, color: done ? "#fff" : active ? basil : "#9AA394" }}>
                      {done ? <Check size={18} strokeWidth={3}/> : <Icon size={17} strokeWidth={2.2}/>}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 600, color: done || active ? ink : soil, lineHeight: 1.2 }}>{s[lang] || s.en}</span>
                  </li>
                );
              })}
            </ol>}

            {/* Rider */}
            {idx === 2 && !cancelled && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#F5F8F4", borderRadius: 16, padding: 12, marginTop: 16 }}>
                <span style={{ width: 44, height: 44, borderRadius: 22, background: "#E5F1E8", color: basil, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bike size={22}/></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{kn ? "ನಿಮ್ಮ ಡೆಲಿವರಿ ಪಾಲುದಾರ" : "Your delivery partner"}</div>
                  <div style={{ fontSize: 12.5, color: soil, marginTop: 2 }}>
                    {riderPos ? (kn ? "ನಕ್ಷೆಯಲ್ಲಿ ಲೈವ್ ಸ್ಥಳ ನೋಡಿ" : "Follow them live on the map") : (kn ? "ಲೈವ್ ಸ್ಥಳ ಶೀಘ್ರದಲ್ಲೇ ಕಾಣುತ್ತದೆ" : "Live location will appear shortly")}
                  </div>
                </div>
              </div>
            )}

            {/* Details */}
            <div style={{ marginTop: 16, border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden" }}>
              {detailRow(MapPin, kn ? "ಡೆಲಿವರಿ ವಿಳಾಸ" : "Delivering to",
                addressText || (homePt ? (kn ? "ಪಿನ್ ಮಾಡಿದ ಸ್ಥಳ" : "Your pinned location") : "—"),
                homePt && <a href={`https://maps.google.com/?q=${homePt[0]},${homePt[1]}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 4, fontSize: 12.5, fontWeight: 600, color: basil }}>{kn ? "ಗೂಗಲ್ ಮ್ಯಾಪ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ" : "Open in Google Maps"}</a>)}
              {detailRow(Package, `${kn ? "ಆರ್ಡರ್" : "Order"} #${o.id || "—"}`,
                `${nItems} ${kn ? (nItems === 1 ? "ವಸ್ತು" : "ವಸ್ತುಗಳು") : nItems === 1 ? "item" : "items"}, ${rs(o.total || 0)}`,
                itemsLine && <div style={{ fontSize: 12.5, color: soil, marginTop: 2 }}>{itemsLine}</div>)}
              {detailRow(CreditCard, kn ? "ಪಾವತಿ" : "Payment", payLabel, null, true)}
            </div>

            {/* Coins */}
            {o.coins > 0 && !cancelled && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "10px 14px", borderRadius: 14, background: "#FBF5E3" }}>
                <span style={{ fontSize: 20 }}>🪙</span>
                <span style={{ fontSize: 13, color: "#6B4E0E", fontWeight: 600 }}>
                  {kn ? `ಈ ಆರ್ಡರ್‌ನಲ್ಲಿ ${o.coins} ಕಾಯಿನ್ಸ್ ಗಳಿಸಿದ್ದೀರಿ. ಒಟ್ಟು: ${coins}` : `You earned ${o.coins} coins on this order. Balance: ${coins}`}
                </span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="g-reset g-tap" onClick={() => window.open(`https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(kn
                  ? `ನಮಸ್ಕಾರ ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್, ನನ್ನ ಆರ್ಡರ್ #${o.id || ""} ಬಗ್ಗೆ ಸಹಾಯ ಬೇಕು.` : `Hi Royal Harvest, I need help with my order #${o.id || ""}.`)}`, "_blank")}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: `1.5px solid ${basil}`, color: basil, fontWeight: 700, fontSize: 14, textAlign: "center" }}>
                {kn ? "ಸಹಾಯ ಪಡೆಯಿರಿ" : "Get help"}
              </button>
              {canCancel && (
                <button className="g-reset g-tap" onClick={() => setShowCancelConfirm(true)}
                  style={{ flex: 1, padding: "12px", borderRadius: 14, border: `1.5px solid ${chili}`, color: chili, fontWeight: 700, fontSize: 14, textAlign: "center" }}>
                  {kn ? "ಆರ್ಡರ್ ರದ್ದುಮಾಡಿ" : "Cancel order"}
                </button>
              )}
            </div>
            <button className="g-reset g-tap" onClick={sendWhatsApp}
              style={{ width: "100%", marginTop: 10, padding: "12px", borderRadius: 14, background: "#E8F8EE", color: "#128C4A", fontWeight: 700, fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span aria-hidden="true">💬</span>{kn ? "ಆರ್ಡರ್ ವಿವರ WhatsApp ನಲ್ಲಿ ಕಳುಹಿಸಿ" : "Send order details on WhatsApp"}
            </button>
            <button className="g-reset g-tap" onClick={() => setScreen("home")}
              style={{ width: "100%", marginTop: 10, padding: "14px", borderRadius: 14, background: basil, color: "#fff", fontWeight: 800, fontSize: 15, textAlign: "center" }}>
              {kn ? "ಶಾಪಿಂಗ್ ಮುಂದುವರೆಸಿ" : "Continue shopping"}
            </button>
          </div>

          {/* Cancel confirmation */}
          {showCancelConfirm && (
            <div className="g-fade" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(22,32,24,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div role="dialog" aria-modal="true" style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 330, textAlign: "center" }}>
                <div style={{ fontFamily: accent, fontSize: 20, fontWeight: 700, color: ink, marginBottom: 6 }}>{kn ? "ಆರ್ಡರ್ ರದ್ದು ಮಾಡಬೇಕೇ?" : "Cancel this order?"}</div>
                <div style={{ fontSize: 13.5, color: soil, marginBottom: 20, lineHeight: 1.45 }}>
                  {kn ? "ರದ್ದು ಮಾಡಿದ ನಂತರ ಇದನ್ನು ಹಿಂತಿರುಗಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ." : "We'll stop packing it. This can't be undone."}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="g-reset" onClick={() => setShowCancelConfirm(false)}
                    style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#F1F4EF", color: ink, fontWeight: 700, textAlign: "center" }}>{kn ? "ಬೇಡ" : "Keep order"}</button>
                  <button className="g-reset" onClick={cancelOrder}
                    style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: chili, color: "#fff", fontWeight: 700, textAlign: "center" }}>{kn ? "ರದ್ದು ಮಾಡಿ" : "Cancel order"}</button>
                </div>
              </div>
            </div>
          )}
        </>;
      })()}

      {screen === "confirmation" && <>
        <Header title={t.orderPlaced}/>
        <div className="flex-1 overflow-y-auto pb-6">

          {/* Leaflet OSM Map — real Gadag streets */}
          <div style={{margin:"16px 16px 0"}}><TrackingMap customerLat={activeOrders[0]?.gps_lat} customerLon={activeOrders[0]?.gps_lon} riderPos={riderPos} lang={lang} height={240} rounded/></div>

          {/* Status timeline */}
          <div className="mx-4 mt-5">
            <div className="font-bold mb-4" style={{fontFamily: display, fontSize:16}}>{t.orderConfirmed}</div>
            {[
              {label: t.orderStatus1, icon:"📋"},
              {label: t.orderStatus2, icon:"🧺"},
              {label: t.orderStatus3, icon:"🏍️"},
              {label: t.orderStatus4, icon:"✅"},
            ].map(({label, icon}, idx) => {
              const done = idx < orderStatusIdx;
              const active = idx === orderStatusIdx;
              return (
                <div key={idx} className="flex gap-3 mb-0">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
                      style={{backgroundColor: done||active ? basil : panel, color: done||active ? "white" : soil, border:`2px solid ${done||active ? basil : line}`,
                        boxShadow: active ? `0 0 0 4px ${basil}30` : "none"}}>
                      {done ? <Check size={14}/> : icon}
                    </div>
                    {idx < 3 && <div className="w-0.5 h-8 mt-1" style={{backgroundColor: done ? basil : line}}/>}
                  </div>
                  <div className="pb-6 pt-1">
                    <div className="text-sm" style={{fontWeight: active ? 700 : done ? 600 : 400, color: active ? basil : done ? ink : soil}}>{label}</div>
                    {active && idx < 3 && <div className="text-xs mt-0.5 animate-pulse" style={{color: mango}}>● {lang==="kn" ? "ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ..." : "In progress..."}</div>}
                    {done && <div className="text-xs mt-0.5" style={{color: soil}}>✓ {lang==="kn" ? "ಮುಗಿದಿದೆ" : "Done"}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coins earned */}
          <div className="mx-4 mt-4 px-4 py-3 rounded-xl flex items-center gap-3" style={{backgroundColor:"#FFF8E1", border:`1px solid ${mango}`}}>
            <span className="text-2xl">🪙</span>
            <div>
              <div className="font-bold text-sm" style={{color:"#8B5E00"}}>+{coinsEarned} {lang==="kn" ? "ಕಾಯಿನ್ಸ್ ಗಳಿಸಿದ್ದೀರಿ!" : "Coins Earned!"}</div>
              <div className="text-xs" style={{color: soil}}>{lang==="kn" ? `ಒಟ್ಟು: ${coins} ಕಾಯಿನ್ಸ್` : `Total balance: ${coins} coins`}</div>
            </div>
          </div>

          <div className="mx-4 mt-3">
            <button onClick={() => setScreen("home")} className="w-full py-3 rounded-2xl font-bold text-sm" style={{backgroundColor: mango, color: basilDark}}>{t.continueShopping}</button>
          </div>
        </div>

        {/* F10 WhatsApp notification toast */}
        {notifShown && (
          <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl"
            style={{backgroundColor:"#25D366", color:"white", zIndex:40}}>
            <span className="text-xl">💬</span>
            <div className="flex-1 text-sm">
              <div className="font-bold">{lang==="kn" ? "WhatsApp ಸಂದೇಶ ಕಳುಹಿಸಲಾಗಿದೆ" : "WhatsApp Confirmation Sent!"}</div>
              <div style={{fontSize:11, opacity:0.9}}>{lang==="kn" ? "ನಿಮ್ಮ ಆರ್ಡರ್ ವಿವರ ಕಳುಹಿಸಲಾಗಿದೆ" : "Order details sent to your number"}</div>
            </div>
            <button onClick={() => setNotifShown(false)}><X size={16} color="white"/></button>
          </div>
        )}

      </>}

      {/* Rating modal — portal to document.body so it's never clipped by parent overflow/transform */}
      {showRating && ReactDOM.createPortal(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.65)"}}>
          <div style={{margin:"0 16px",borderRadius:24,padding:24,width:"100%",maxWidth:360,backgroundColor:panel,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:48,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:700,fontSize:18,fontFamily:display}}>{lang==="kn"?"ಆರ್ಡರ್ ತಲುಪಿತು!":"Order Delivered!"}</div>
              <div style={{fontSize:13,marginTop:4,color:soil}}>{lang==="kn"?"ನಿಮ್ಮ ಅನುಭವ ಹೇಗಿತ್ತು?":"How was your experience?"}</div>
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:8}}>
              {[1,2,3,4,5].map(s=>(
                <button key={s} onClick={()=>setLastRating(s)} onMouseEnter={()=>setHoverRating(s)} onMouseLeave={()=>setHoverRating(0)}
                  style={{fontSize:32,background:"none",border:"none",cursor:"pointer",transform:s<=(hoverRating||lastRating)?"scale(1.25)":"scale(1)",transition:"transform 0.15s"}}>
                  {s<=(hoverRating||lastRating)?"⭐":"☆"}
                </button>
              ))}
            </div>
            <div style={{textAlign:"center",fontSize:12,marginBottom:16,color:soil}}>
              {lastRating===5?"🤩 Excellent!":lastRating===4?"😊 Good!":lastRating===3?"😐 Okay":lastRating>0?"😞 We'll improve":"Tap a star to rate"}
            </div>
            <button disabled={!lastRating} onClick={()=>setShowRating(false)}
              style={{width:"100%",padding:"12px 0",borderRadius:16,fontWeight:700,fontSize:14,border:"none",cursor:lastRating?"pointer":"default",backgroundColor:lastRating?basil:"#ccc",color:"white"}}>
              {lang==="kn"?"ರೇಟಿಂಗ್ ಸಲ್ಲಿಸಿ":"Submit Rating"}{lastRating>0?` · ${lastRating}★`:""}
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}