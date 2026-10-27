# GraphQL at scale

I keep seeing stories about GraphQL performance problems.  I've seen systems where that was the case, so I did some work to investigate and documented the results here.

I'm starting here with a mostly no-detail overview of the problem and the solution.  There are a lot of interesting details to go over which will be in the next pages for anyone who wishes to see them.

We start with a distributed Identity and Access Management distributed system.  We have multiple services that each own their own domain objects, and we are supporting a large software as a service offering with clients ranging from single users to full enterprises to managed service providers (MSP's) with thousands of clients of their own.

At the start, the system is mostly working as far as letting users access the system goes.  For a given logged in user, a list of capabilities can be retrieved for that user in a given context, which says what they are allowed to do.  This looks like an array of string, such as

["account.users.read", "account.data.read", "account.users.write"]

We have seperate services for Users, Orgnizations, Accounts, Authorization, and User Management.  Most of the services are fairly basic wrappers around SQL tables for their domain objects, and provide strong protection via requiring Authorization service to have a relavent capability for any given operation.

The core problem we are solving is loading the user management screen for a large number of users at once.
