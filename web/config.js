// Supabase connection (hosted project "LiteBoard").
// The publishable/anon key is browser-safe by design — protected by Row-Level Security.
export const SUPABASE_URL = "https://sgruwwqubmtnzfcwpycs.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_HKSJFABZfN9JzDZzmXDQOg_KSk_Yed4";

// --- DEV auto-login ---
// Credentials live in config.local.js, which is gitignored and never committed.
// Copy config.local.example.js → config.local.js and fill in your test account to
// skip the login screen locally. Without that file, auto-login stays OFF (login shown).
let _dev = { DEV_AUTOLOGIN: false, DEV_EMAIL: "", DEV_PASSWORD: "" };
try {
  _dev = { ..._dev, ...(await import("./config.local.js")) };
} catch {
  /* no config.local.js — auto-login disabled, normal login screen is used */
}
export const DEV_AUTOLOGIN = _dev.DEV_AUTOLOGIN;
export const DEV_EMAIL = _dev.DEV_EMAIL;
export const DEV_PASSWORD = _dev.DEV_PASSWORD;
