# GraphQL Auth Explosion Case Study: Future Explorations

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: draft

## Async Loading in Smaller Batches

One direction to explore is loading primary records in smaller batches so retrieval of secondary records can start as soon as the first batch arrives. Instead of waiting for the entire primary collection, we could collect the related ids from each batch and begin retrieving those records while subsequent primary batches are still loading.

That would let dependent retrieval overlap with the remaining primary retrieval. The work should still preserve batching and bounded concurrency: the useful experiment is finding a batch size that starts secondary retrieval early without multiplying small network requests or repeatedly fetching the same related records.

## Request Only the Fields We Need

Another direction is specifying the requested fields when retrieving records through ActiveResource. If a caller only needs an id and a name, pulling an entire fat record adds unnecessary serialization, network transfer, parsing, and object allocation.

This would need support in both the ActiveResource retrieval layer and the service API so the service returns only the requested fields. We would also need to retain fields required for relationships and authorization, and ensure a partially loaded record cannot be mistaken for a complete one. The experiment would measure how much narrower responses reduce payload size and retrieval cost for the same query.
