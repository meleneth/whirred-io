# GraphQL Auth Explosion Case Study, Part 1: CTE

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## CTE

SQL is not great at hierarchical data structures. Account has parent_account_id as a field. The naive approach of fetching a single record, looking at the parent account id, and fetching that account by id is not good.

This CTE fixes that. It does all the work in the database, and returns a flat list of all the accounts in the hierarchy. If we supply the account id's that belong to an organization, this can be done in just that scope. That method is implemented in the codebase, but omitted here.

[Account#account_with_parents CTE](https://github.com/meleneth/iam-system-demo/blob/17caa8b61aac93199f7474e8cdfbb4d2954e3911/account-service/app/controllers/accounts_controller.rb#L13)
```sql
WITH RECURSIVE account_hierarchy(id, level, name, name_path)
AS (
SELECT "accounts"."id",
0 AS level,
"accounts"."name",
ARRAY[name] AS name_path
FROM "accounts"
WHERE "accounts"."parent_account_id" IS NULL

    UNION ALL

    SELECT a.id,
      t0.level + 1,
      a.name,
      ARRAY_APPEND(t0.name_path, a.name)
    FROM accounts a
    INNER JOIN account_hierarchy t0
       ON t0.id = a.parent_account_id

)
SELECT id,
level,
name_path[1] AS category,
ARRAY_TO_STRING(name_path, ' > ')
FROM account_hierarchy
```

Previous: [Creating a Million Users](/articles/series/IAM-System-Demo/creating-a-million-users)  
Next: [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)

