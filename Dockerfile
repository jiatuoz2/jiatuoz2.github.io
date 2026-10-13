FROM ruby:3.3.5-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Ignore checkout-local Bundler settings (including Windows/WSL paths).
ENV BUNDLE_IGNORE_CONFIG=1 \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_FROZEN=true \
    JEKYLL_ENV=development

WORKDIR /srv/jekyll
COPY Gemfile Gemfile.lock ./
RUN gem install bundler -v 4.0.6 --no-document \
    && bundle install --jobs 4 --retry 3
COPY docker/preview.yml /opt/jekyll/preview.yml

EXPOSE 8080
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--port", "8080", "--force_polling", "--destination", "/tmp/_site", "--config", "_config.yml,/opt/jekyll/preview.yml"]
