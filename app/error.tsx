'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="auth-wrap"><section className="auth-card"><h1>Nie udało się wyświetlić panelu</h1><p>Spróbuj ponownie za chwilę.</p><button onClick={reset}>Odśwież</button></section></main>}
