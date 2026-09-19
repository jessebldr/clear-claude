# B-tree vs hash indexes

**Short version:** a B-tree keeps keys in sorted order in a shallow, wide tree, so it handles equality, ranges, ordering, and prefixes. A hash index scatters keys by a hash function, so it can only answer equality, in exchange for a slightly shorter path to the row. **Default to B-tree.** Hash is a niche optimization.

## How a B-tree index works

### Mental model

Think of a phone book with a thumb index. You don't scan every page. You jump to a section, then a page, then a line. Each step narrows the search by a large factor, and the entries are sorted, so neighbors are adjacent.

### Structure (technically a B+tree)

Databases mostly use the B+tree variant.

- **Everything is pages.** The tree is made of fixed-size disk pages (8 KB in Postgres, 16 KB in InnoDB). A node is one page, because the disk and buffer pool deal in pages.
- **Internal nodes** hold sorted separator keys and pointers to child pages. They only route the search.
- **Leaf nodes** hold the actual index entries: the key plus a pointer to the row (or the row itself, see clustering below). Leaves are **linked to each other** in key order.
- **All leaves are at the same depth.** That's the "balanced" part, and it makes lookup cost predictable.

### Why it's shallow

Fanout is the key number. With an 8 KB page and small keys, one node holds a few hundred children. Roughly:

- 300 children per node → 3 levels covers about 27 million entries
- 4 levels covers about 8 billion

So a lookup in a huge table touches about 3-4 pages. The root and upper levels are hot and almost always in memory, so a lookup is often one or two real disk reads. That's why B-trees dominate: they're designed around the fact that disk reads are expensive and you should do as few as possible.

### Operations

**Point lookup:** start at the root, binary-search within the page for the right child, descend, and repeat until you reach a leaf. Cost is O(log_fanout N).

**Range scan** (`WHERE x BETWEEN 10 AND 50`): descend once to find 10, then walk the leaf chain sideways until you pass 50. This is the big win. You pay one descent, then sequential reads.

**Ordering:** because leaves are sorted, `ORDER BY` on the indexed column needs no sort step, and `MIN`/`MAX` are just the first or last leaf entry.

**Insert:** descend to the correct leaf and insert in sorted position. If the page is full, it **splits** in two, and a new separator key is pushed up to the parent. If the parent is full it splits too, and so on. If the split reaches the root, the tree grows one level taller. This is the only way height increases, which is why the tree stays balanced without rebalancing passes.

**Delete:** remove the entry. Textbook B-trees merge under-full pages. Real engines are lazier. Postgres, for instance, marks entries dead and reclaims space during vacuum, and only removes fully empty pages. So indexes can **bloat** and may need `REINDEX` after heavy churn.

**Concurrency:** many readers and writers hit the same pages. Engines use short-term page latches (lock coupling / "crabbing"). Postgres uses the Lehman-Yao B-link variant, where each page has a right-sibling pointer, so a reader that races with a split can follow the link instead of being blocked.

### Practical details that matter

- **Clustered vs secondary.** In InnoDB the primary key index *is* the table: leaves contain the full rows. Secondary indexes store the primary key as their pointer, so a secondary lookup is two tree descents. In Postgres the table is an unordered heap. All indexes point to a heap location (TID), and the heap fetch is a separate random read.
- **Composite indexes** sort by the first column, then the second within ties, and so on. An index on `(a, b)` serves `a = ?` and `a = ? AND b > ?`, but **not** `b = ?` alone. This is the leftmost-prefix rule.
- **Covering indexes / index-only scans.** If the index contains every column the query needs, the engine never touches the table. Postgres also needs the visibility map to be current for this to work.
- **Write cost.** Every index must be updated on insert, and on update of an indexed column. More indexes means slower writes and more storage. Index only what queries need.
- **Insert pattern.** Sequential keys (auto-increment, timestamps) append to the rightmost leaf, which is cache-friendly and produces densely packed pages. Random keys (UUIDv4) hit random leaves, causing scattered splits, poor fill, and more cache misses. This is a real performance difference at scale. UUIDv7 or other time-ordered IDs avoid it.
- **What it can't help with:** `WHERE lower(name) = ...` (unless you index the expression), `LIKE '%foo'` (leading wildcard), and low-selectivity columns like a boolean, where the planner will rightly prefer a scan.

## How a hash index works

### Mental model

A coat check. You hand over a ticket number and the attendant goes straight to the right hook. But the hooks aren't in any useful order, so "give me all coats from tickets 10 to 50" means checking every hook.

### Structure

- Apply a hash function to the key to get a number, then map it to a **bucket** (a page or chain of pages).
- The bucket holds entries for all keys that hash there. Collisions are expected, so within the bucket you compare actual keys.
- To grow, engines use **linear hashing** or **extendible hashing**, which split buckets incrementally instead of rebuilding the whole table.

### Operations

- **Lookup:** hash, go to the bucket, check entries. Expected O(1), meaning about one or two page reads regardless of table size.
- **Insert/delete:** hash and modify one bucket. Occasionally a bucket splits.
- **Range, ordering, prefix, min/max:** **not possible.** Hashing destroys order: adjacent keys land in unrelated buckets. Only `=` (and `IN`) work.

### Real-world caveats

- **Postgres:** hash indexes were not WAL-logged before version 10 (so not crash-safe or replicated), which gave them a bad reputation. That's fixed now. They still don't support uniqueness, multicolumn keys, or index-only scans. They store only the 32-bit hash code, not the key, so each match must be rechecked against the heap. The upside is a small, fixed-size entry regardless of key length.
- **MySQL/InnoDB:** you can't create a hash index on an InnoDB table. InnoDB does build an internal **adaptive hash index** in memory over hot B-tree pages, automatically. Explicit `USING HASH` only takes effect on the MEMORY engine.
- **Where hashing really shines:** in-memory structures such as hash joins, hash aggregates, and caches, and in engines built around it (e.g. some key-value stores).

## Side-by-side

| | B-tree | Hash |
|---|---|---|
| Equality (`=`) | O(log N), ~3-4 pages | O(1) expected, ~1-2 pages |
| Range (`<`, `BETWEEN`) | Yes | No |
| `ORDER BY`, `MIN`/`MAX` | Yes | No |
| Prefix / `LIKE 'abc%'` | Yes (with suitable collation/opclass) | No |
| Multicolumn | Yes, leftmost prefix | Postgres: no |
| Unique constraints | Yes | Postgres: no |
| Index size with long keys | Grows with key size | Postgres: fixed, small |
| Ordered output | Yes | No |
| Support across engines | Universal | Patchy |

## When to choose which

**Use a B-tree when:**
- It's your default, and the right answer for almost every column.
- You have or might get range queries, sorting, prefix search, or composite lookups.
- You need a `UNIQUE` or primary key constraint.
- You're not sure. B-trees tolerate changing query patterns. Hash indexes silently become useless when someone adds `>` to a query.

**Consider a hash index when all of these hold:**
1. Queries are **strictly equality** on that column, and you're confident that won't change.
2. The keys are **large** (long URLs, hashes of documents, long text tokens), so a B-tree would be big and the hash index's fixed-size entries save real space and cache.
3. You've **measured** and the lookup path is genuinely hot.
4. Your engine supports it properly (Postgres 10+, not MySQL/InnoDB).

**A caution on the speed argument:** the "O(1) vs O(log N)" comparison overstates the gap. With a B-tree's upper levels cached, the practical difference is often one page read, and B-trees in Postgres have had years of optimization (deduplication in 13, better page reuse). Benchmarks usually show hash winning by a modest margin at best. Space savings on long keys are the more compelling reason.

**If you have long keys but need ordering or uniqueness,** a common alternative is a B-tree on a computed hash column (or a functional index on `md5(col)`), which keeps B-tree features with short entries.

If you tell me the engine and a query pattern you're deciding on, I can give a concrete recommendation.