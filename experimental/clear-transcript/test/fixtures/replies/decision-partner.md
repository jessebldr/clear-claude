**Use Postgres** if this is a long-lived tool that people depend on. **Use SQLite** if you want the simplest possible deploy and you're confident it stays small. For 50 users, either handles the load easily, so the decision is really about operations and future flexibility, not performance.

**Why SQLite is a legitimate choice here**
- Zero infrastructure: one file, no server to run, patch, or secure.
- Backups are simple (file copy, or `sqlite3 .backup` / Litestream for continuous replication).
- With WAL mode on, it handles many concurrent readers and a single writer well. 50 users on an internal tool is a light write load.

**Why I'd still lean Postgres**
- **Concurrent writes:** SQLite allows one writer at a time. Fine now, but a long-running write (a big import, a report job) will block others.
- **Schema changes:** SQLite's `ALTER TABLE` is limited, so some migrations mean rebuilding the table.
- **Stricter, richer features:** real types, row-level locking, `JSONB`, full-text search, roles and permissions, and proper online migrations.
- **Growth path:** internal tools tend to gain users, background jobs, and a second server. Moving off SQLite later means a data migration, while Postgres scales without a rewrite.
- **Tooling:** if you might add BI tools, read replicas, or anyone querying the DB directly, Postgres is the standard.

**Rule of thumb**
- Pick SQLite if it's one process, one server, mostly reads, and you value low ops overhead. It's a good fit for a prototype or a small team tool that won't change much.
- Pick Postgres if you expect background workers, multiple app processes, heavy writes, or the tool becoming business-critical. The extra setup (a managed instance or a Docker container) is a small one-time cost.

If you tell me the stack and whether there are background jobs or heavy writes, I can make a firmer call.