**Why:** `var` is function-scoped, so all three callbacks share a single `i`. The loop finishes (leaving `i === 3`) before any `setTimeout` callback runs, and each callback reads `i` at that later time.

**Fix:** use `let`, which creates a fresh binding per iteration:

```js
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i)); // 0, 1, 2
```

Each iteration gets its own copy of `i`, and each closure captures its own copy.

If you're stuck with `var` (legacy code), wrap the body in an IIFE to capture the value:

```js
for (var i = 0; i < 3; i++) {
  ((j) => setTimeout(() => console.log(j)))(i);
} // 0, 1, 2
```

Or pass it as a `setTimeout` argument: `setTimeout(console.log, 0, i)`.