# GraphQL Auth Explosion Case Study, Part 6: Async MADNESS

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## Async MADNESS

In a large distributed system, sometimes there will be more records to retrieve than ability to retrieve them in a single request reasonably.

Enter Async (only available in Ruby 3, not Ruby 2). This allows us to fetch multiple groups of records at the same time. For instance, if you are loading 600 accounts, you could load 100 accounts in 6 requests instead of failing to load 600 because the request size was exceeded. This has the benefit of letting you benefit from your large deployment sizes as well - if you have 6 instances, each instance could be servicing it's own request. This can lead to a bit of a thundering herd problem, but that's a matter of tuning the dial and implementing limits - being ABLE to use your infrastructure is still a win.

Previous: [Part 5: Smart API's](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)  
Next: [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)

