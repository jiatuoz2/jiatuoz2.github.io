(() => {
  const menu = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".primary-navigation");
  if (menu && navigation) {
    document.documentElement.classList.add("js-navigation");
    menu.hidden = false;
    const closeMenu = () => {
      navigation.classList.remove("is-open");
      menu.setAttribute("aria-expanded", "false");
    };
    menu.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("is-open");
      menu.setAttribute("aria-expanded", String(isOpen));
    });
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navigation.classList.contains("is-open")) {
        closeMenu();
        menu.focus();
      }
    });
  }

  const tools = document.querySelector(".publication-tools");
  const papers = [...document.querySelectorAll(".academic-publications .paper")];
  if (tools && papers.length) {
    tools.hidden = false;
    const buttons = [...tools.querySelectorAll("[data-filter]")];
    const search = tools.querySelector('input[type="search"]');
    const count = document.querySelector(".publication-count");
    const empty = document.querySelector(".no-results");
    const groups = [...document.querySelectorAll(".academic-publications ol.bibliography")];
    let topic = "all";
    const searchablePapers = papers.map((paper) => ({
      paper,
      text: paper.textContent.toLocaleLowerCase(),
      topics: (paper.dataset.research || "").split(/\s+/),
    }));
    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      let visible = 0;
      searchablePapers.forEach(({ paper, text, topics }) => {
        const matches = (topic === "all" || topics.includes(topic)) && text.includes(query);
        paper.closest("li").hidden = !matches;
        if (matches) visible++;
      });
      groups.forEach((group) => {
        const hasPapers = [...group.children].some((item) => !item.hidden);
        group.hidden = !hasPapers;
        const heading = group.previousElementSibling;
        if (heading?.matches("h2.bibliography")) heading.hidden = !hasPapers;
      });
      count.textContent = `${visible} ${visible === 1 ? "publication" : "publications"}`;
      empty.hidden = visible > 0;
    };
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        topic = button.dataset.filter;
        buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        update();
      })
    );
    search.addEventListener("input", update);
    update();
  }

  const dialog = document.querySelector(".research-video-dialog");
  if (dialog && typeof dialog.showModal === "function") {
    const player = dialog.querySelector("video");
    const title = dialog.querySelector("h2");
    const close = dialog.querySelector(".video-close");
    const directLink = dialog.querySelector(".video-direct-link");
    let opener;
    document.querySelectorAll("[data-research-video]").forEach((link) => {
      link.setAttribute("aria-haspopup", "dialog");
      link.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        opener = link;
        title.textContent = link.dataset.videoTitle || "Research preview";
        directLink.href = link.href;
        player.src = link.href;
        dialog.showModal();
        close.focus();
        player.play().catch(() => {});
      });
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (
        event.target === dialog &&
        (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
      )
        dialog.close();
    });
    dialog.addEventListener("close", () => {
      player.pause();
      player.removeAttribute("src");
      player.load();
      opener?.focus();
    });
  }
})();
