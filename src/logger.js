import process from "node:process";

const LOG_MODULE_DEFAULT = "Agent";

function formatLog(level, moduleName, message, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    module: moduleName,
    message,
    ...details,
  };
  
  if (level === "ERROR" || level === "WARN") {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

export function createLogger(moduleName = LOG_MODULE_DEFAULT) {
  return {
    info: (message, details) => formatLog("INFO", moduleName, message, details),
    warn: (message, details) => formatLog("WARN", moduleName, message, details),
    error: (message, error, details) => {
      const errorInfo = error instanceof Error 
        ? { errorMessage: error.message, stack: error.stack } 
        : { errorDetails: error };
      formatLog("ERROR", moduleName, message, { ...details, ...errorInfo });
    },
    debug: (message, details) => {
      // Enable debug logging via an environment variable, e.g., LOG_LEVEL=debug or specific module debug
      // For simplicity, let's use a generic DEBUG flag for now, or module-specific.
      // Example: MCP_CLIENT_DEBUG=true or AGENT_DEBUG=true
      const debugEnabled = process.env.DEBUG === 'true' || process.env[`${moduleName.toUpperCase()}_DEBUG`] === 'true';
      if (debugEnabled) {
          formatLog("DEBUG", moduleName, message, details);
      }
    }
  };
}

// Default logger if needed directly, though creating instance per module is better
const defaultLogger = createLogger();
export default defaultLogger;
