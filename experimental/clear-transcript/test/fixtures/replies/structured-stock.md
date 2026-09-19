# B-tree vs. hash indexes in relational databases

## 1. What a B-tree index is

Nearly every "B-tree index" in a relational database is actually a **B+tree**. The distinction matters for what the structure can do.

### Structure

The index is a balanced tree of fixed-size pages, typically 4–16 KB. Postgres uses 8 KB, InnoDB 16 KB, and SQL Server 8 KB.

- **Root page**: the single entry point.
- **Internal (branch) pages**: hold sorted *separator keys* and child pointers. A page with keys `[k1, k2, k3]` has four children: keys `< k1`, `k1..k2`, `k2..k3`, and `≥ k3`.
- **Leaf pages**: hold the actual `(key, pointer-to-row)` entries, sorted by key. Leaves are chained in a **doubly linked list**, so you can walk them in order without going back up the tree.

In a B+tree, only leaves carry row pointers. Internal pages carry only routing keys, which makes them small and gives them a very high fan-out.

### Why it's shallow

A page is sized to a disk block, so one page holds hundreds of entries. With 8 KB pages and ~16-byte keys plus pointers, fan-out is roughly 300–500.

| Levels | Approx. entries reachable |
|---|---|
| 2 | ~200K |
| 3 | ~60–100M |
| 4 | ~30B |

A lookup in a table with hundreds of millions of rows therefore touches about 3–4 pages. The root and upper levels are almost always in the buffer cache, so in practice that is often 1–2 actual disk reads. That is O(log_f N) with a huge base `f`.

### Lookup

1. Start at the root and binary-search the keys in the page.
2. Follow the child pointer to the next level.
3. At the leaf, binary-search for the exact key.
4. Follow the pointer to the heap tuple (Postgres uses a TID, `(block, offset)`), or, for a clustered index, the leaf *is* the row.

### Range scans

Descend once to find the first qualifying key, then walk the leaf chain until the upper bound is passed. The cost is one O(log N) descent plus sequential leaf reads. Sorted output comes for free, so `ORDER BY`, `MIN`/`MAX`, and merge joins can all skip a sort.

### Insertion and page splits

- Descend to the correct leaf and insert in sorted position.
- If the leaf is full, **split** it into two half-full pages and push a separator key up into the parent.
- If the parent is full, it splits too, and this can propagate to the root. When the root splits, the tree grows one level taller.

Because the tree only grows at the root, **all leaves stay at the same depth**. That is what "balanced" means, and it guarantees predictable lookup cost.

Consequences:

- **Fill factor**: pages are usually left 10–30% empty (Postgres defaults to 90% for B-tree leaves) to defer splits. Random insertion averages about 69% (ln 2) utilization.
- **Random keys** such as UUIDv4 split pages all over the tree, so they cause fragmentation, poor cache locality, and write amplification.
- **Monotonic keys** such as serials or time-ordered IDs append to the rightmost leaf. That is cache-friendly but can create a hot-page contention point.
- Postgres has a rightmost-split optimization (a 90/10 split instead of 50/50) to keep append-only workloads compact.

### Deletion

Deletes remove entries and may merge underfull pages. Many engines are lazy about this. Postgres only reclaims fully empty pages, relying on `VACUUM` and `REINDEX` to recover bloat. SQL Server and MySQL similarly leave sparse pages until rebuild or reorganize. Heavy churn therefore causes **index bloat**.

### Concurrency

Engines use latch coupling ("crabbing") or Lehman–Yao-style B-link trees. In Postgres, each page has a right-link, so readers can recover from a concurrent split by following the sibling pointer without holding locks up the tree. Concurrent readers and writers rarely block each other.

### Composite indexes and the leftmost-prefix rule

An index on `(a, b, c)` sorts by `a`, then `b` within equal `a`, then `c`. It can efficiently serve:

- `a = ?`
- `a = ? AND b = ?`
- `a = ? AND b > ?`
- `a = ? ORDER BY b`

It **cannot** efficiently seek on `b` alone, because `b` values are scattered across every `a` group. Some engines have skip scan (Oracle, MySQL 8.0+, and Postgres 18) to partly compensate. Column order is the most important design decision for a composite index:

- Equality columns first.
- Then the range or sort column.
- Selectivity is secondary to how the queries actually filter.

### Clustered vs. secondary

- **InnoDB** (MySQL) and **SQL Server** by default store the table *as* a B+tree on the primary key. That is the clustered index, and the leaf holds the full row. Secondary indexes store the primary key as their pointer, so a secondary lookup is a double traversal.
- **Postgres** stores rows in an unordered heap. Every index, including the primary key, is a secondary B-tree pointing to heap TIDs. `CLUSTER` reorders the heap once but doesn't maintain the order.

### Covering indexes and index-only scans

If every column the query needs is in the index, the engine never touches the table. Use `INCLUDE (col)` (Postgres, SQL Server) to add payload columns without making them part of the sort key. Postgres additionally needs the visibility map to be up to date for index-only scans to skip heap fetches.

### Other capabilities

- **Partial indexes**: `WHERE status = 'active'` indexes only the subset you query.
- **Expression indexes**: `lower(email)`.
- **Unique constraints**: enforced through the B-tree, and only the B-tree can do this in most engines.
- **Prefix matching**: `LIKE 'abc%'` works with a suitable collation or operator class. `LIKE '%abc'` does not.
- **NULL handling** differs by engine, so check whether `IS NULL` can use the index.

## 2. What a hash index is

A hash index applies a hash function to the key and uses the result to locate a bucket directly:

```
bucket = hash(key) mod N_buckets
```

Each bucket holds `(hash or key, row pointer)` entries, with overflow chains or pages for collisions. Lookup is expected **O(1)**: hash, go to the bucket, compare the key, and follow the pointer.

To grow without rehashing everything at once, disk-based implementations use **linear hashing** (Postgres) or **extendible hashing** (a directory that doubles). Splitting is incremental, one bucket at a time.

### What it gives up

The hash function deliberately destroys ordering. Nearby keys land in unrelated buckets, so:

- No range queries (`<`, `>`, `BETWEEN`)
- No `ORDER BY` support
- No prefix matching
- No leftmost-prefix behavior for multi-column keys. The whole tuple is hashed, so *every* column must be constrained by equality.
- Usually no uniqueness enforcement (Postgres hash indexes can't back a unique constraint or primary key)
- Typically no index-only scans, because the index often stores only the hash and must recheck the heap
- Typically no multi-column, `INCLUDE`, or partial-index flexibility, depending on the engine

## 3. Head-to-head

| Aspect | B-tree | Hash |
|---|---|---|
| Point lookup (`=`) | O(log N), ~3–4 pages | O(1) expected, ~1–2 pages |
| Range / `<`, `>`, `BETWEEN` | Yes | No |
| `ORDER BY`, min/max | Yes | No |
| Prefix / `LIKE 'x%'` | Yes | No |
| Composite keys | Leftmost-prefix use | All columns, equality only |
| Uniqueness / PK | Yes | Usually no |
| Key size effect | Large keys reduce fan-out | Fixed-size hash, so key size is irrelevant |
| Growth | Splits, stays balanced | Bucket splits, needs good hash |
| Skew | Handles it fine | Hot buckets and long overflow chains |
| Crash safety | Mature everywhere | Varies. Postgres hash indexes weren't WAL-logged before v10. |

### Why the O(1) advantage is smaller than it sounds

Because the B-tree's upper levels are cached, the practical difference for a point lookup is often one or two page fetches, and sometimes zero. Benchmarks in Postgres typically show hash indexes only modestly faster for equality lookups, and sometimes no faster at all. Hash indexes also don't shrink as much as one might hope, except for long keys.

## 4. When to use which

### Use a B-tree (the default, about 95% of the time) when:

- You need any range, sort, or prefix behavior.
- You need uniqueness or primary key enforcement.
- The query pattern is unknown or mixed. It handles equality well *and* everything else.
- You want composite indexes serving multiple query shapes.
- You want index-only scans or covering indexes.
- You need predictable behavior across engines. Some engines (InnoDB, SQL Server) don't offer a user-creatable on-disk hash index at all.

### Consider a hash index when:

- Access is **strictly equality** on a single key, and you're certain it will stay that way.
- Keys are **long** (URLs, long text, hashes of blobs). A hash index stores a fixed-size hash, so it can be much smaller than a B-tree over the same values, and fewer pages means better cache use.
- The workload is extremely lookup-heavy and you've **measured** a gain.
- You're using **in-memory** structures. There, hash tables genuinely win: MySQL's MEMORY engine (hash by default), Redis-style lookups, SQL Server's memory-optimized tables (hash indexes with a fixed bucket count you must size correctly), and **InnoDB's adaptive hash index**, which builds hash lookups over hot B-tree pages automatically.
- You're doing **hash joins**. This is a different use of hashing: a transient hash table built at query time, not a persistent index.

### Practical notes

- **Workaround for long keys with a B-tree**: index a hash column, e.g. `CREATE INDEX ON t (md5(url))` or a stored generated column, and query with `WHERE md5(url) = md5(?) AND url = ?`. That gives you B-tree features and small entries.
- Postgres also has other index types for other jobs: GIN (arrays, JSONB, full text), GiST/SP-GiST (geometry, ranges), BRIN (huge, naturally ordered tables). Reach for those before hash.
- Check your specific engine's docs. Hash-index support, durability, and features differ a lot across Postgres, MySQL/InnoDB, SQL Server, and Oracle.

## 5. Decision rule

1. Default to a B-tree.
2. Pick hash only if the access is equality-only *and* keys are large or the structure is in-memory *and* you've measured a benefit.
3. For anything ordered, ranged, unique, or composite, hash isn't an option anyway.

If you tell me which database you're using, I can go deeper on its specific implementation, such as Postgres `nbtree` page layout and the `bt_page_items` inspection tools, or how to read `EXPLAIN` output to tell which index type the planner picked and why.