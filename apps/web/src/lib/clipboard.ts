/** A Clipboard API só existe em contexto seguro — na LAN (http://ip) cai no execCommand. */
export function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) resolve();
      else reject(new Error("cópia recusada"));
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(ta);
    }
  });
}
