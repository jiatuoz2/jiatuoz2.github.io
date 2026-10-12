---
layout: academic
title: about
permalink: /
description: Jiatuo “Charlie” Zou is an HCI researcher at Northwestern University's SPICE Lab, working on XR, wearable computing, multimodal AI, and novel sensing.
---

<section class="hero" aria-labelledby="intro-title">
  <div class="hero-copy">
    <p class="eyebrow"><span class="accent-dot" aria-hidden="true"></span> Human–Computer Interaction Researcher</p>
    <h1 id="intro-title">Jiatuo<br><span class="given-name">“Charlie”</span> Zou<span class="name-period">.</span></h1>
    <p class="hero-statement">Building interfaces that understand<br class="desktop-break"> people and the world around them.</p>
    <p class="hero-description">I explore how extended reality, wearable sensing, and multimodal AI can make interactive systems more responsive to human intent and context.</p>
    <div class="hero-actions"><a class="button button-primary" href="#research">Explore my research <span aria-hidden="true">↓</span></a><a class="button button-secondary" href="{{ '/assets/pdf/cv.pdf' | relative_url }}">Curriculum vitae <span aria-hidden="true">↗</span></a></div>
    <div class="social-links" aria-label="Academic profiles"><a href="https://scholar.google.com/citations?user={{ site.data.socials.scholar_userid }}">Google Scholar ↗</a><a href="https://github.com/{{ site.data.socials.github_username }}">GitHub ↗</a><a href="https://www.linkedin.com/in/{{ site.data.socials.linkedin_username }}/">LinkedIn ↗</a></div>
  </div>
  <figure class="profile-figure">
    <div class="portrait-frame"><img src="{{ '/assets/img/profile.jpg' | relative_url }}" alt="Jiatuo Charlie Zou" width="278" height="278" fetchpriority="high"><span class="portrait-corner" aria-hidden="true">↗</span></div>
    <figcaption><span class="profile-name">Currently at <a href="https://spice-lab.org/">SPICE Lab</a></span><span>Northwestern University</span><span class="profile-location">Evanston, Illinois</span></figcaption>
  </figure>
</section>

<aside class="opportunity-note"><span class="note-label">Looking ahead</span><p>I’m applying to PhD programs for <strong>Fall 2027</strong> and welcome connections around shared research interests.</p><a href="mailto:{{ site.data.socials.email }}">Let’s connect <span aria-hidden="true">↗</span></a></aside>

<section id="research" class="research-section section-space" aria-labelledby="research-title">
  <div class="section-heading"><div><p class="eyebrow">01 / Research in focus</p><h2 id="research-title">From human signals<br>to intelligent interactions.</h2></div><a class="text-link" href="{{ '/publications/' | relative_url }}">All publications <span aria-hidden="true">↗</span></a></div>
  <div class="research-features">{% bibliography --query @*[selected=true] --template academic-feature --group_by none %}</div>
  <div class="research-interests"><p class="eyebrow">Research interests</p><ul><li>Extended reality</li><li>Wearable computing</li><li>Multimodal AI</li><li>Novel sensing</li></ul></div>
</section>

<section id="about" class="about-section section-space" aria-labelledby="about-title">
  <div class="about-copy"><p class="eyebrow">02 / A little about me</p><h2 id="about-title">Making emerging technology<br>feel more human.</h2>
    <p>I’m Jiatuo “Charlie” Zou, an HCI researcher and a graduate of <strong>Columbia University (M.S.)</strong>. I recently joined the <a href="https://spice-lab.org/">SPICE Lab</a> at Northwestern University, advised by <a href="https://karan-ahuja.com/">Karan Ahuja</a>.</p>
    <p>Previously, I was a research assistant in the <a href="https://graphics.cs.columbia.edu/home">CGUI Lab</a> at Columbia University, working with <a href="https://www.cs.columbia.edu/~feiner/">Steven Feiner</a>.</p>
    <p>My work draws on implicit human sensing and environmental context to design adaptive, intelligent experiences. I’m interested in how emerging sensing and AI capabilities can become interactions that respond to a person’s situation, intent, and surroundings.</p>
    <a class="text-link" href="{{ '/cv/' | relative_url }}">More about my background <span aria-hidden="true">↗</span></a>
  </div>
  <div class="affiliations"><p class="eyebrow">Where I’ve worked</p><div class="affiliation"><span class="affiliation-mark northwestern" aria-hidden="true">N</span><div><h3>Northwestern University</h3><p>SPICE Lab · Current</p><a href="https://karan-ahuja.com/">Advised by Karan Ahuja ↗</a></div></div><div class="affiliation"><span class="affiliation-mark columbia" aria-hidden="true">C</span><div><h3>Columbia University</h3><p>M.S. · CGUI Lab</p><a href="https://www.cs.columbia.edu/~feiner/">Research with Steven Feiner ↗</a></div></div></div>
</section>

<section class="news-section section-space" aria-labelledby="news-title"><div class="section-heading"><div><p class="eyebrow">03 / Updates</p><h2 id="news-title">Along the way.</h2></div></div><ol class="news-list">{% assign updates = site.news | sort: 'date' | reverse %}{% for item in updates limit: 5 %}<li><time datetime="{{ item.date | date: '%Y-%m-%d' }}">{{ item.date | date: '%b %Y' }}</time><div>{{ item.content | markdownify }}</div></li>{% endfor %}</ol></section>

<section class="contact-section" aria-labelledby="contact-title"><p class="eyebrow">Let’s talk research</p><h2 id="contact-title">Good ideas start<br>with a conversation.</h2><p>If our research interests align, I’d love to hear from you.<br>Email is the best way to reach me.</p><a class="contact-email" href="mailto:{{ site.data.socials.email }}">{{ site.data.socials.email }} <span aria-hidden="true">↗</span></a></section>
