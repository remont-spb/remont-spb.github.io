(() => {
  'use strict';
  const form = document.getElementById('repair-brief');
  if (!form) return;
  const dialog = document.getElementById('brief-channel');
  const status = document.getElementById('brief-status');
  const delivery = document.getElementById('brief-delivery-status');
  const counter = document.getElementById('brief-count');
  const buttons = [...dialog.querySelectorAll('[data-brief-channel]')];
  const storageKey = 'repair-brief-attempt-v1';
  let busy = false, attempt = null;
  const inputs = () => [...form.querySelectorAll('input[name="priority"]:checked')];
  function payload() {
    return {priorities: inputs().map(i => ({id: i.value})), wishes: form.elements.wishes.value.trim(), consent: form.elements.briefConsent.checked};
  }
  async function configuration() {
    const r = await fetch('./repair-brief-config.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw Error();
    const value = await r.json();
    const url = new URL(value.api_origin);
    if (value.enabled !== true || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
    return url.origin;
  }
  async function attemptKey(data) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
    const signature = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    try { attempt = JSON.parse(sessionStorage.getItem(storageKey)) || attempt; } catch (_) { /* Memory fallback. */ }
    if (!attempt || attempt.signature !== signature || !/^[A-Za-z0-9_-]{32,100}$/.test(attempt.key)) {
      attempt = {signature, key: crypto.randomUUID()};
    }
    try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); } catch (_) { /* Memory fallback. */ }
    return attempt.key;
  }
  function discardAttempt() {
    attempt = null;
    try { sessionStorage.removeItem(storageKey); } catch (_) { /* Memory fallback. */ }
  }
  form.addEventListener('change', () => {
    counter.textContent = inputs().length ? 'Выбрано: ' + inputs().length : 'Можно выбрать несколько пунктов';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (!inputs().length && !form.elements.wishes.value.trim()) {
      status.textContent = 'Выберите хотя бы один пункт или напишите пожелание.';
      form.querySelector('input[name="priority"]').focus();
      return;
    }
    status.textContent = '';
    delivery.textContent = '';
    dialog.showModal();
  });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (busy || !form.reportValidity()) return;
    busy = true;
    buttons.forEach(b => b.disabled = true);
    delivery.textContent = 'Сохраняем пожелания…';
    const channel = button.dataset.briefChannel;
    const data = {...payload(), channel};
    try {
      const origin = await configuration();
      const key = await attemptKey(data);
      const headers = {'Content-Type': 'application/json', 'Idempotency-Key': key};
      if (new URL(origin).hostname.endsWith('.ngrok-free.dev')) headers['ngrok-skip-browser-warning'] = '1';
      const response = await fetch(origin + '/v1/briefs', {
        method: 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 410 || response.status === 409) discardAttempt();
        delivery.textContent = response.status === 410 ? 'Срок ссылки истёк. Нажмите мессенджер ещё раз, чтобы создать новую.' :
          response.status === 429 ? 'Слишком много попыток. Попробуйте позднее — Ваш выбор остался на странице.' :
          'Не удалось сохранить пожелания. Ваш выбор остался на странице. Попробуйте ещё раз.';
        return;
      }
      if (!/^[A-Za-z0-9_-]{24,48}$/.test(result.start_token)) throw Error();
      const base = channel === 'telegram' ? 'https://t.me/SmetaDarom_Bot?start=brief_' : 'https://max.ru/id772498824211_1_bot?start=brief_';
      const link = base + result.start_token;
      delivery.textContent = 'Пожелания сохранены на 48 часов. Нажмите «Старт» в боте. Если мессенджер не открылся: ';
      const reopen = document.createElement('a');
      reopen.href = link;
      reopen.className = 'brief-reopen';
      reopen.textContent = 'Открыть ' + (channel === 'telegram' ? 'Telegram' : 'MAX');
      delivery.append(reopen);
      window.location.assign(link);
    } catch (_) {
      delivery.textContent = 'Нет связи с сервисом. Пожелания остались на странице. Попробуйте ещё раз; повторная отправка не создаст дубликат.';
    } finally {
      busy = false;
      buttons.forEach(b => b.disabled = false);
    }
  }));
})();
