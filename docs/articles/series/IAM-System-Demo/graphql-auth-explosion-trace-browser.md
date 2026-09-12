---
layout: doc
pageClass: wide-trace
sidebar: false
aside: false
---

<script setup>
import TraceBrowser from '../../../.vitepress/theme/components/TraceBrowser.vue'
</script>

# Interactive Trace Browser

[Back to the trace gallery](./graphql-auth-explosion-traces) · [Measured results](./graphql-auth-explosion-results)

Choose an example, expand or collapse its call tree, and select a span to inspect its tags and SQL. Search includes tag values. Use the service filter to follow one service while retaining its ancestors. Zoom widens the timeline; scroll horizontally to explore it. Selecting a span updates the URL so that the same span can be shared.

<TraceBrowser />
