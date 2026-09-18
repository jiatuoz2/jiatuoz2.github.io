(() => {
  const dialog = document.querySelector('.publication-video-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const player = dialog.querySelector('video');
  const heading = dialog.querySelector('h2');
  const closeButton = dialog.querySelector('.publication-video-close');
  let opener;

  function openVideo(url, title, trigger) {
    opener = trigger;
    heading.textContent = title;
    player.src = url;
    dialog.showModal();
    closeButton.focus();
    player.play().catch(() => {});
  }

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog &&
        (event.clientX < rect.left || event.clientX > rect.right ||
         event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    player.pause();
    player.removeAttribute('src');
    player.load();
    opener?.focus();
  });

  document.querySelectorAll('.publications .row').forEach((row) => {
    const link = [...row.querySelectorAll('.links a')].find((a) =>
      a.textContent.trim() === 'Video' && /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(a.getAttribute('href') || '')
    );
    const image = row.querySelector('img.preview');
    if (!link || !image) return;

    const title = row.querySelector('.title')?.textContent.trim() || 'Paper preview';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'publication-video-trigger';
    trigger.setAttribute('aria-label', `Play preview: ${title}`);
    trigger.setAttribute('aria-haspopup', 'dialog');
    // Clone the picture without the theme's image-zoom listeners or attributes.
    const original = image.closest('picture') || image;
    const preview = original.cloneNode(true);
    [preview, ...preview.querySelectorAll('*')].forEach((element) => {
      element.removeAttribute('data-zoomable');
      element.classList.remove('medium-zoom-image', 'medium-zoom-image--opened');
    });
    original.replaceWith(trigger);
    trigger.append(preview);
    trigger.addEventListener('click', () => openVideo(link.href, title, trigger));
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openVideo(link.href, title, link);
    });
  });
})();
