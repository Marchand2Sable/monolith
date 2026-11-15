// Errors the player can see (no WebGL) and errors the developer can read (a list the debug panel shows).

export function installErrorHandlers(sink: string[]): void {
  window.addEventListener('error', (e) => {
    sink.push(`${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    sink.push('promesse rejetée : ' + String((e.reason as Error)?.message ?? e.reason));
  });
}

export function showFatal(root: HTMLElement, message: string, error: unknown): void {
  console.error(error);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;text-align:center;padding:24px;background:#0c0c0d;color:#f3f2ee;font:14px/1.7 Helvetica,Arial,sans-serif;letter-spacing:.06em;pointer-events:auto';
  d.innerHTML = `<div><div style="letter-spacing:.5em;font-weight:300;font-size:22px;margin-bottom:18px">MONOLITH</div>${message}<br><small style="color:#888">Essayez un autre navigateur ou activez l'accélération matérielle.</small></div>`;
  root.appendChild(d);
}
