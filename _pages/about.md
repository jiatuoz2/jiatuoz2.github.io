---
permalink: /
title: ""
author_profile: true
redirect_from: [/about/, /about.html]
---

<aside class="phd-callout" id="phd-applications" aria-labelledby="phd-applications-title">
  <p class="phd-callout-kicker"><span class="phd-callout-icon" aria-hidden="true"></span> <span id="phd-applications-title">Applying to PhD programs</span></p>
  <p class="phd-callout-text">I am applying to PhD programs for <strong>Fall 2027</strong>. If our research interests align, I welcome the opportunity to connect; email is the best way to reach me.</p>
  <p class="phd-callout-actions"><a class="phd-callout-button" href="mailto:{{ site.author.email }}">Email me</a> <a class="phd-callout-link" href="{{ site.author.cv | relative_url }}">View CV</a></p>
</aside>

<h1 id="about-me">About Me</h1>

I am Jiatuo "Charlie" Zou, a researcher in **Human-Computer Interaction (HCI)** and a graduate of Columbia University (M.S.). I recently joined the [SPICE Lab](https://spice-lab.org/) at Northwestern University, advised by [Karan Ahuja](https://karan-ahuja.com/). Previously, I was a research assistant in the [CGUI Lab](https://graphics.cs.columbia.edu/home) at Columbia University, working with [Steven Feiner](https://www.cs.columbia.edu/~feiner/).

<h2 id="research-interests" class="research-heading">Research interests</h2>

Today's interfaces make people spell out every input they want. This creates two gaps:

- **Effort gap:** specifying every detail is possible but slow.
- **Ability gap:** people know their goal but not what to specify to reach it.

To close these gaps, I build **context-aware interaction systems** that adapt to users and their environments based on novel sensing and multimodal AI, with a specific focus on **extended reality (XR), wearable computing, and human-AI interaction (HAI)**. I envision approaching these problems through a **human-AI loop** that consists of three components: **sensing, sensemaking, and interaction**. Sensing captures signals, sensemaking understands those signals, and interaction uses that understanding to respond, producing new signals for the next cycle.

<div class="research-overview">
{% include research-cycle.html %}
<ul class="research-themes" aria-label="Research interests across the human-AI loop">
  <li>
    <h3>Sensing</h3>
    <p>I am interested in capturing behavioral, physiological, and environmental signals through wearables and novel sensing. These measurements provide the raw evidence for sensemaking, including cues that are difficult to convey through explicit input alone.</p>
  </li>
  <li>
    <h3>Sensemaking</h3>
    <p>Sensemaking turns those signals into an understanding of people's activity, intent, and context. I am interested in multimodal AI that combines complementary evidence, accounts for uncertainty and source reliability, and updates its understanding as situations change.</p>
  </li>
  <li>
    <h3>Interaction</h3>
    <p>I aim to use that understanding to build XR, wearable, and AI-assisted interfaces that adapt what they present and when they respond. As people act and respond, these interactions produce new signals for sensing, helping the system support them while keeping them in control.</p>
  </li>
</ul>
</div>

<h2 id="news" class="section-heading"><span class="section-icon" aria-hidden="true">🔥</span> News</h2>
<ul class="news-list">
{% assign updates = site.news | sort: 'date' | reverse %}
{% for item in updates %}<li><time datetime="{{ item.date | date: '%Y-%m-%d' }}">{{ item.date | date: '%Y.%m' }}</time><div>{{ item.content | markdownify }}</div></li>{% endfor %}
</ul>

<h2 id="publications" class="section-heading"><span class="section-icon" aria-hidden="true">📝</span> Publications</h2>
{% include publications.html %}

<h2 id="journey" class="section-heading"><span class="section-icon" aria-hidden="true">🧭</span> My Journey</h2>
{% include journey.html %}
