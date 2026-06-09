# GraphQL Auth Explosion Case Study, Part 8: Falcon

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## Falcon

Once you're on Ruby 3, you have access to Async. With that comes access to the Falcon webserver instead of Puma. This is important because it lets your server do something else while waiting for network responses. In systems like this, most of the time will be spent waiting for network responses, so this can lead to some pretty wild performance per server gains.

Previous: [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)  
Next: [Conclusion: Architecture Is Throughput](/articles/series/IAM-System-Demo/graphql-auth-explosion-conclusion)

