---
layout: doc
pageClass: wide-trace
sidebar: false
aside: false
---

<script setup>
import TraceBrowser from '../../../.vitepress/theme/components/TraceBrowser.vue'
</script>

# GraphQL at Scale: Interactive Traces

[Back to the first draft](./graphql-at-scale-first-draft) · [Evidence appendix](./graphql-at-scale-evidence)

Choose either October 25 trace, expand or collapse its call tree, and select a span to inspect tags and executed SQL. Search includes tag values. The service filter keeps matching spans and their ancestors visible. The two requests and their byte-identical responses are described in the evidence appendix.

<TraceBrowser />
