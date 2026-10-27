FROM musicshak

# Rebase the deployed Vue 2 bundle without changing its content or data.
# Assert the known bundle shape so a future Musicshak rebuild fails visibly.
RUN set -eu; \
    page=/usr/share/nginx/html/index.html; \
    app=/usr/share/nginx/html/js/app.da613854.js; \
    grep -q 'href=/js/' "$page"; \
    grep -q 'u.p="/"' "$app"; \
    grep -q 'base:"/"' "$app"; \
    sed -i 's@href=/@href=/musicshak/@g; s@src=/@src=/musicshak/@g' "$page"; \
    sed -i 's@u.p="/"@u.p="/musicshak/"@; s@base:"/"@base:"/musicshak/"@' "$app"; \
    grep -q 'u.p="/musicshak/"' "$app"; \
    grep -q 'base:"/musicshak/"' "$app"

COPY deploy/musicshak-nginx.conf /etc/nginx/conf.d/default.conf
