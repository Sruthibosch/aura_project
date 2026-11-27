import type { ReactNode } from "react";

/** Two folded pages form a compact learning emblem. */
export function AuraMark() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 7.5c4.7-1 8.1.1 11 3.4v17c-2.9-3.3-6.3-4.4-11-3.4v-17Z" fill="currentColor"/><path d="M18 6.4 28 3v20.2l-10 3.4V6.4Z" fill="currentColor" opacity=".7"/><path d="m21 10 4-1.4m-4 5.8 4-1.4" stroke="#5146b9" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}

export function DomainIcon({ name }: { name: string }) {
  let shape: ReactNode;
  if (/Python|Java|C &|Web/.test(name)) shape=<><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 20"/></>;
  else if (/AI/.test(name)) shape=<><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M10 10h4v4h-4z"/></>;
  else if (/SQL/.test(name)) shape=<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>;
  else if (/Data|Finance|Marketing/.test(name)) shape=<><path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/></>;
  else if (/Design|Animation/.test(name)) shape=<><path d="m4 20 2-7L17 2l5 5-11 11-7 2Zm2-7 5 5M14 5l5 5"/></>;
  else if (/Cyber/.test(name)) shape=<><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/></>;
  else if (/Cloud/.test(name)) shape=<path d="M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11-1 5.5 5.5 0 0 1 0 11H7Z"/>;
  else if (/Mobile/.test(name)) shape=<><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4M10 5h4"/></>;
  else if (/Engineering/.test(name)) shape=<><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/></>;
  else if (/Business/.test(name)) shape=<><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 3 12 3 18 0M12 12v4"/></>;
  else if (/Math/.test(name)) shape=<><path d="M4 7h6M7 4v6m7-3h6M4 17h6m-3-3v6m7-5h6m-6 4h6"/></>;
  else shape=<><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/></>;
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}
