# GraphQL Auth Explosion Case Study, Part 4: Redis Cache, per service

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## Redis Cache, per service

Each of the services that house objects has their own redis cache. These caches expire after 5 minutes, and we keep track of cache keys in a secondary key location such that if needed, specific caches could be expired when the data changes. This is not implemented, because we don't actually change data - we're just setting up having the data to be able to change it, actually changing it is out of scope.

Each system only caches it's own objects. Cacheing of objects on remote systems would make cache invalidation strategies difficult at best, so it is not allowed in the design.

Previous: [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)  
Next: [Part 5: Smart API's](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)

