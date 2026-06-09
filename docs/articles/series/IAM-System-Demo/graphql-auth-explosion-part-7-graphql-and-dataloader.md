# GraphQL Auth Explosion Case Study, Part 7: GraphQL and Dataloader

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## GraphQL and Dataloader

Everything up to this point has been directly implementable via REST api. Now we get into systems as they are actually used, where we implement GraphQL.

GraphQL lets the requestor specify the shape of data they get back, and then handle the exact data they are interested in.

Dataloader is a bit of advanced wizardy that lets you fetch groups of related objects in one call. This works well with all of our previous layers - multi object fetching by ID, caches, AND async. At this point the only problem left is pagination, which is left to the reader.

The dataloader implementation is basically a drop-in on top of our fast rest API's. Our API's are fast because they are able to accept an array of multiple ID's and responses are cached by reasonable keys.

GraphQL locks this in, by making each type of data query be batched together for multiple retrieval, even if you are requesting multiple keys directly from the GraphQL query level.

For instance, this query

with these variables

will make very few requests inside the system, for basically any size of data.

this is really handwavy in theory, so let's break it down to specifics.

One request to load the Accounts, one request to load the Users, one request to load the Groups, and one request to load the GroupUsers.

Previous: [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)  
Next: [Part 8: Falcon](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon)

