// This page is reached by a top-level NETWORK navigation protected by Access.
// It is never cached by the service worker; no arbitrary return URL is accepted.
// Returning to the shell does not authorize a notebook: the account gate still
// validates the live identity and approval before opening any account database.
location.replace(new URL('./',location.href).href);
