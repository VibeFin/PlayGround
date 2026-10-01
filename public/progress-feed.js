(() => {
  const root = document.querySelector('#live-progress');
  if (!root) return;
  let signature = '';
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  async function refresh() {
    try {
      const response = await fetch('/progress-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Evidence feed unavailable');
      const data = await response.json();
      const next = JSON.stringify(data);
      if (next === signature) return;
      signature = next;
      const content = document.createDocumentFragment();
      const summary = el('div', 'proof-summary');
      summary.append(el('span', 'live-dot'), el('span', 'proof-status', data.status), el('span', 'proof-updated', `Updated ${data.updated} · refreshes every 15s`));
      content.append(summary);
      const pieces = el('div', 'proof-pieces');
      for (const piece of data.pieces || []) {
        const card = el('article', 'proof-piece');
        card.append(el('div', 'proof-eyebrow', piece.builder), el('h3', '', piece.name), el('p', 'proof-piece-status', piece.status), el('p', 'proof-critic', piece.critic));
        pieces.append(card);
      }
      content.append(pieces);
      if (data.checks?.length) {
        content.append(el('h2', 'proof-heading', 'Playtest evidence'));
        const checks = el('div', 'proof-checks');
        for (const check of data.checks) {
          const row = el('article', `proof-check ${check.result}`);
          row.append(el('span', 'proof-result', check.result === 'passed' ? '✓ PASS' : check.result.toUpperCase()), el('h3', '', check.name), el('p', '', check.detail));
          checks.append(row);
        }
        content.append(checks);
      }
      if (data.screenshots?.length) {
        content.append(el('h2', 'proof-heading', 'From the running game'));
        const gallery = el('div', 'proof-gallery');
        for (const shot of data.screenshots) {
          const figure = el('figure', 'proof-shot');
          const link = el('a');
          link.href = shot.src;
          link.target = '_blank';
          link.rel = 'noopener';
          const image = el('img');
          image.src = shot.src;
          image.alt = shot.title;
          image.loading = 'lazy';
          link.append(image);
          const caption = el('figcaption');
          caption.append(el('h3', '', shot.title), el('p', '', shot.detail));
          figure.append(link, caption);
          gallery.append(figure);
        }
        content.append(gallery);
      }
      if (data.reviews?.length) {
        content.append(el('h2', 'proof-heading', 'Builder → fresh critic → correction'));
        const reviews = el('div', 'proof-reviews');
        for (const review of data.reviews) {
          const card = el('article', 'proof-review');
          card.append(el('h3', '', review.piece), el('p', '', review.finding), el('p', 'proof-fix', review.fix), el('p', 'proof-verdict', review.verdict));
          reviews.append(card);
        }
        content.append(reviews);
      }
      content.append(el('p', 'proof-method', data.method || 'Only completed, observed checks are listed as passed. Browser and screenshot evidence will be added as the running game is reviewed.'), el('p', 'proof-renderer', data.renderer));
      root.replaceChildren(content);
    } catch (error) {
      if (!root.childElementCount) root.append(el('p', 'proof-method', 'The live evidence feed is reconnecting.'));
    }
  }
  refresh();
  setInterval(refresh, 15000);
})();
