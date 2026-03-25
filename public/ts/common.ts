export interface ApiResponse {
  message: string;
}

export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendPostRequest(
  endpoint: string,
  data: Record<string, unknown> = {},
): Promise<ApiResponse> {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      window.location.href = '/?expired=1';
      throw new Error('Session expired — redirecting to login');
    }
    let errMsg = `Request failed (${resp.status})`;
    try {
      const errBody = await resp.json() as { error?: string; message?: string };
      if (errBody.error) errMsg = errBody.error;
      else if (errBody.message) errMsg = errBody.message;
    } catch { /* non-JSON body — keep default */ }
    throw new Error(errMsg);
  }
  return resp.json() as Promise<ApiResponse>;
}

export function initToast(): void {
  if (!document.getElementById('cs-toast-container')) {
    $('body').append('<div id="cs-toast-container" role="status" aria-live="polite"></div>');
  }
}

export function toastError(fallback: string): (e: unknown) => void {
  return (e) => showToast(e instanceof Error ? e.message : fallback, 'error');
}

export function withLoading($btn: JQuery, action: () => Promise<void>): void {
  $btn.prop('disabled', true).addClass('btn-loading');
  action().finally(() => $btn.prop('disabled', false).removeClass('btn-loading'));
}

export function showToast(msg: string, type: 'success' | 'error' | 'info'): void {
  const $t = $(`<div class="cs-toast cs-toast--${type}">${escapeHtml(msg)}</div>`);
  $('#cs-toast-container').append($t);
  requestAnimationFrame(() => {
    $t.addClass('cs-toast--visible');
  });
  setTimeout(() => {
    $t.removeClass('cs-toast--visible');
    setTimeout(() => $t.remove(), 220);
  }, 3000);
}
