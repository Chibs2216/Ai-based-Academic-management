/* Supabase connection. The publishable key is designed to be public: every
   request is still limited by the database's row level security. */
const UNIBOOK_CONFIG = {
    supabaseUrl: "https://ubrkrppiscxtoivytujy.supabase.co",
    supabaseKey: "sb_publishable_oB7jZzyW2NMYxFLrq8nBbQ_Nq4Nq46v"
};

/* "Remember this device": sessions live in localStorage when remembered,
   otherwise in sessionStorage (cleared when the browser closes). */
const REMEMBER_KEY = "unibook_remember_device";

function rememberDevice() {
    try {
        return localStorage.getItem(REMEMBER_KEY) !== "false";
    } catch (e) {
        return true;
    }
}

function setRememberDevice(remember) {
    try {
        localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
    } catch (e) { /* storage blocked: fall back to the default */ }
}

function sessionStore() {
    // A remembered session must not linger in sessionStorage, and vice versa.
    const keep = rememberDevice() ? window.localStorage : window.sessionStorage;
    return keep;
}

function makeSupabaseClient() {
    return window.supabase.createClient(UNIBOOK_CONFIG.supabaseUrl, UNIBOOK_CONFIG.supabaseKey, {
        auth: {
            storage: sessionStore(),
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
}

let sb = makeSupabaseClient();
