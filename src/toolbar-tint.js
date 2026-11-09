// Extend only an existing native page gradient; never infer a color from the player.
const sources = [
  'PlaylistPage_averageColorBackground', 'CommonAlbumPage_averageColorBackground',
  'ArtistPage_averageColorBackground', 'OfflineArtistPage_averageColorBackground',
  'ConcertPage_averageColorBackground', 'PlaylistPageHeader_header_branded',
  'PlaylistPageHeader_header_brandedAxe',
];
const selector = sources.map(name => `[class^="${name}__"],[class*=" ${name}__"]`).join(',');

export function createToolbarTint() {
  let source = null, toolbar = null, frame = 0;
  const observer = new MutationObserver(schedule);
  function clear() {
    toolbar?.removeAttribute('data-sg-tinted');
    toolbar?.style.removeProperty('--sg-page-tint');
  }
  function update() {
    frame = 0;
    if (!source?.isConnected || !toolbar?.isConnected) { clear(); return; }
    const style = getComputedStyle(source);
    const branded = source.className.includes('header_branded');
    const color = style.getPropertyValue(branded ? '--entity-branding-gradient-color-from' : '--average-color-background').trim();
    // Missing variable means the native neutral fallback, which must remain untouched.
    if (!color || !CSS.supports('color', color) || color === 'transparent' ||
        style.display === 'none' || style.visibility === 'hidden' ||
        Number(style.opacity) === 0 || style.backgroundImage === 'none') { clear(); return; }
    if (toolbar.style.getPropertyValue('--sg-page-tint') !== color)
      toolbar.style.setProperty('--sg-page-tint', color);
    if (!toolbar.hasAttribute('data-sg-tinted')) toolbar.setAttribute('data-sg-tinted', '');
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function disconnect() {
    observer.disconnect();
    source?.removeEventListener('transitionend', schedule);
    cancelAnimationFrame(frame); frame = 0;
  }
  return {
    sync(content, target) {
      const next = content?.querySelector(selector) || null;
      if (next !== source || target !== toolbar) {
        disconnect(); clear(); source = next; toolbar = target;
        if (source) {
          observer.observe(source, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
          source.addEventListener('transitionend', schedule);
        }
      }
      cancelAnimationFrame(frame); frame = 0;
      update();
    },
    destroy() { disconnect(); clear(); source = toolbar = null; },
  };
}
