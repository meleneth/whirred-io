# GraphQL Auth Explosion Case Study, Part 3: Multiple Object Authorization

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## Multiple Object Authorization

Object retrieval fans out to Authorization checks. At each service level, an array of objects is being requested, and the entire request should fail if Authorization is missing for any of those objects. In our example system, Authorization is cumulative per parent account - if you have permission to the parent account, you have permission to the child account. The Authorization service supports a 'can' endpoint, to check if a given user has a specific permission for a type of object.

These are individual level grants, not a collection of all the grants a user has. They are cached in redis, and are checkable in a single pipelined redis call.

Previous: [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)  
Next: [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)

