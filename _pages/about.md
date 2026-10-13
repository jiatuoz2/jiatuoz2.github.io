---
permalink: /
title: ""
author_profile: true
redirect_from: [/about/, /about.html]
---

<h1 id="about-me">About Me</h1>

I am Jiatuo "Charlie" Zou, a researcher in **Human-Computer Interaction (HCI)** and a graduate of Columbia University (M.S.). I recently joined the [SPICE Lab](https://spice-lab.org/) at Northwestern University, advised by [Karan Ahuja](https://karan-ahuja.com/). Previously, I was a research assistant in the [CGUI Lab](https://graphics.cs.columbia.edu/home) at Columbia University, working with [Steven Feiner](https://www.cs.columbia.edu/~feiner/).

<h2 id="research-interests" class="research-heading">Research interests</h2>

My work lies at the intersection of **extended reality (XR), wearable computing, multimodal AI, and novel sensing**. I think about these interests as a continuous loop: **sensing → sensemaking → interaction → new sensing**. Sensing captures signals, sensemaking understands those signals, and interaction uses that understanding to respond, producing new signals for the next cycle.

<div class="research-overview">
{% include research-cycle.html %}
<ul class="research-themes" aria-label="Research interests across the sensing and interaction loop">
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

I am applying to PhD programs for **Fall 2027**. If our research interests align, I welcome the opportunity to connect; [email](mailto:{{ site.author.email }}) is the best way to reach me.

<h2 id="news" class="section-heading"><span class="section-icon" aria-hidden="true">🔥</span> News</h2>
<ul class="news-list">
{% assign updates = site.news | sort: 'date' | reverse %}
{% for item in updates %}<li><time datetime="{{ item.date | date: '%Y-%m-%d' }}">{{ item.date | date: '%Y.%m' }}</time><div>{{ item.content | markdownify }}</div></li>{% endfor %}
</ul>

<h2 id="publications" class="section-heading"><span class="section-icon" aria-hidden="true">📝</span> Publications</h2>
{% include publications.html %}
