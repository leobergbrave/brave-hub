/**
 * Helper de logs estruturados para funções Vercel.
 * Formato: [TIMESTAMP] [módulo] [NÍVEL] mensagem { dados? }
 */
export function log(module, level, message, data) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${module}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    const extra = typeof data === 'object' ? JSON.stringify(data) : String(data);
    console.log(`${prefix} ${message} ${extra}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}
