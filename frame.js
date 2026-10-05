(function () {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const reduceMql = matchMedia('(prefers-reduced-motion: reduce)');

  function wantsStill() {
    return reduceMql.matches || params.has('still');
  }

  const keep = ['safe', 'still', 'embed', 'wall', 'opaque'];
  document.querySelectorAll('a[data-lab]').forEach((anchor) => {
    const url = new URL(anchor.getAttribute('href'), location.href);
    for (const key of keep) {
      if (!params.has(key)) continue;
      url.searchParams.set(key, params.get(key) ?? '');
    }
    const file = url.pathname.split('/').pop() || 'index.html';
    anchor.href = `${file}${url.search}`;
  });

  reduceMql.addEventListener?.('change', () => {
    const still = wantsStill();
    root.classList.toggle('is-still', still);
    if (still) {
      root.classList.remove('is-locked');
      root.classList.add('is-open');
    }
  });

  const seal = document.getElementById('seal');
  if (!seal || !root.classList.contains('is-locked')) return;

  let dragging = false;
  let minX = 0;
  let maxX = 0;

  function track(clientX) {
    minX = Math.min(minX, clientX);
    maxX = Math.max(maxX, clientX);
    const rect = seal.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const tip = Math.min(1, Math.max(0, (clientX - rect.left) / width));
    const span = (maxX - minX) / width;
    seal.style.setProperty('--strike', Math.max(tip, span).toFixed(3));
    return span;
  }

  function finish() {
    if (!root.classList.contains('is-locked')) return;
    seal.style.setProperty('--strike', '1');
    root.classList.remove('is-locked');
    root.classList.add('is-open');
    seal.setAttribute('aria-expanded', 'true');
    seal.disabled = true;
    const first = document.querySelector('.folio');
    if (first) first.focus({ preventScroll: true });
  }

  seal.addEventListener('pointerdown', (event) => {
    dragging = true;
    minX = maxX = event.clientX;
    seal.setPointerCapture?.(event.pointerId);
    track(event.clientX);
  });

  seal.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    if (track(event.clientX) > 0.48) finish();
  });

  seal.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    if (track(event.clientX) > 0.48) finish();
    else seal.style.setProperty('--strike', '0');
  });

  seal.addEventListener('pointercancel', () => {
    dragging = false;
    if (root.classList.contains('is-locked')) seal.style.setProperty('--strike', '0');
  });

  seal.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    finish();
  });
})();
