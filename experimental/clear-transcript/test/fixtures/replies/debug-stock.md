**Why it prints 3 three times**

`var` is function-scoped (or global-scoped here), so there is only **one** `i` shared by all three loop iterations. `setTimeout` callbacks run after the loop has finished, when `i` is already `3`. Each arrow function closes over that same variable and reads its final value.

**Fixes**

1. Use `let` (simplest). It creates a fresh binding per iteration:

```js
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i));
// 0, 1, 2
```

2. Pre-ES6 alternative: capture the value with an IIFE:

```js
for (var i = 0; i < 3; i++) {
  (function (j) {
    setTimeout(() => console.log(j));
  })(i);
}
```

3. Or pass the value as a `setTimeout` argument:

```js
for (var i = 0; i < 3; i++) setTimeout((j) => console.log(j), 0, i);
```

Option 1 is the idiomatic choice today.