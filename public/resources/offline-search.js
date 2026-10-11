/* Plain DOM controls shared by the vector and raster style viewers. */
window.installOfflineSearch = function (map, vector) {
  const panel = document.getElementById('offline-search');
  const form = panel.querySelector('form');
  const input = panel.querySelector('input');
  const status = panel.querySelector('[role="status"]');
  const results = panel.querySelector('ol');
  const credit = panel.querySelector('small');
  let controller;
  let generation = 0;
  let marker;

  function clear() {
    generation++;
    if (controller) controller.abort();
    results.replaceChildren();
    status.textContent = '';
  }
  input.addEventListener('input', clear);
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { clear(); input.focus(); event.preventDefault(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = Array.from(results.querySelectorAll('button'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement);
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) :
        (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next].focus();
      event.preventDefault();
    }
    event.stopPropagation();
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clear();
    const query = input.value.trim();
    if (!query) return;
    const current = generation;
    const abort = new AbortController();
    controller = abort;
    const timer = setTimeout(() => abort.abort(), 5000);
    status.textContent = 'Searching local index…';
    try {
      const url = new URL(panel.dataset.endpoint, location.href);
      url.searchParams.set('q', query);
      const key = new URL(location.href).searchParams.get('key');
      if (key) url.searchParams.set('key', key);
      const response = await fetch(url, { signal: abort.signal, cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json();
      if (current !== generation) return;
      if (!response.ok) throw new Error(body.error || 'Search failed.');
      if (!Array.isArray(body.results)) throw new Error('Invalid search response.');
      // the credit the search data requires, as text
      credit.textContent = body.attribution ? `Search data: ${body.attribution}` : '';
      for (const place of body.results) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = place.label;
        button.addEventListener('click', function () {
          if (marker) marker.remove();
          if (vector) {
            // Mercator cannot display the poles themselves.
            const position = [place.lon, Math.max(-85.051129, Math.min(85.051129, place.lat))];
            map.flyTo({ center: position, zoom: place.zoom });
            marker = new maplibregl.Marker().setLngLat(position).addTo(map);
          } else {
            const position = [Math.max(-85.051129, Math.min(85.051129, place.lat)), place.lon];
            map.setView(position, place.zoom);
            marker = L.circleMarker(position, { radius: 7, color: '#174c9b' }).addTo(map);
          }
          clear();
          status.textContent = place.label;
          input.focus();
        });
        item.append(button);
        results.append(item);
      }
      status.textContent = body.results.length ? `${body.results.length} result(s). Choose a place.` : 'No matching places. Try another name or lat,lon.';
    } catch (error) {
      if (current === generation) status.textContent = error.name === 'AbortError' ? 'Search timed out. Try again.' : error.message;
    } finally {
      clearTimeout(timer);
    }
  });
};
