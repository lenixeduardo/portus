window.onerror = (_message, _source, _lineno, _colno, error) => {
  const msg = error?.message ?? String(_message);
  const stack = error?.stack;
  window.api.log.error("renderer:uncaughtException", msg, stack).catch(() => {});
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  window.api.log.error("renderer:unhandledRejection", err.message, err.stack).catch(() => {});
};
