(() => {
  const navigation = document.querySelector(".greedy-nav");
  const menu = navigation?.querySelector("button");
  const overflow = navigation?.querySelector(".hidden-links");
  // The upstream menu can measure before font/layout widths settle in WebKit.
  // Reconcile actual list size as it changes, including after an item is restored.
  if (navigation && typeof window.updateNav === "function") {
    let frame = null;
    const fit = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        window.updateNav();
      });
    };
    document.fonts?.ready.then(fit);
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(fit);
      observer.observe(navigation);
      observer.observe(navigation.querySelector(".visible-links"));
    }
  }
  if (menu && overflow) {
    const sync = () => menu.setAttribute("aria-expanded", String(!overflow.classList.contains("hidden")));
    const close = () => {
      overflow.classList.add("hidden");
      menu.classList.remove("close");
      sync();
    };
    menu.addEventListener("click", sync);
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overflow.classList.contains("hidden")) {
        close();
        menu.focus();
      }
    });
    sync();
  }

  const normalizeSearch = (text) =>
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  document.querySelectorAll("[data-publications]").forEach((section) => {
    const form = section.querySelector(".publication-search");
    const input = form.querySelector("input");
    const clear = form.querySelector("button");
    const status = section.querySelector(".publication-search-status");
    const papers = [...section.querySelectorAll(".paper-box")].map((element) => ({
      element,
      text: normalizeSearch(`${element.textContent} ${element.dataset.searchKeywords || ""}`),
    }));
    const filter = () => {
      const terms = normalizeSearch(input.value.trim()).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const paper of papers) {
        paper.element.hidden = !terms.every((term) => paper.text.includes(term));
        if (!paper.element.hidden) count++;
      }
      clear.hidden = input.value.length === 0;
      status.hidden = terms.length === 0;
      status.textContent = count ? `${count} of ${papers.length} publications` : "No publications found. Try a different search.";
    };
    form.addEventListener("submit", (event) => event.preventDefault());
    input.addEventListener("input", filter);
    clear.addEventListener("click", () => {
      input.value = "";
      filter();
      input.focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        input.value = "";
        filter();
      }
    });
    filter();
    form.hidden = false;
  });

  const dialog = document.querySelector(".research-video-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const video = dialog.querySelector("video");
  const heading = dialog.querySelector("h2");
  const closeButton = dialog.querySelector(".video-close");
  const directLink = dialog.querySelector(".video-direct-link");
  let opener;
  document.querySelectorAll("[data-research-video]").forEach((link) => {
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      heading.textContent = link.dataset.videoTitle;
      directLink.href = link.href;
      video.src = link.href;
      dialog.showModal();
      closeButton.focus();
      video.play().catch(() => {});
    });
  });
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    opener?.focus();
  });
})();
