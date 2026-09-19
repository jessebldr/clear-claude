I don't have file-writing tools in this session, so here's the code inline. Save the two files side by side, for example as `lru_cache.py` and `test_lru_cache.py`.

**lru_cache.py**

```python
from collections import OrderedDict
from typing import Generic, Hashable, Optional, TypeVar

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")


class LRUCache(Generic[K, V]):
    """Fixed-capacity cache that evicts the least recently used entry."""

    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be a positive integer")
        self.capacity = capacity
        self._data: "OrderedDict[K, V]" = OrderedDict()

    def get(self, key: K, default: Optional[V] = None) -> Optional[V]:
        """Return the value for key and mark it most recently used."""
        if key not in self._data:
            return default
        self._data.move_to_end(key)
        return self._data[key]

    def put(self, key: K, value: V) -> None:
        """Insert or update key, evicting the LRU entry if over capacity."""
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        if len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)

    def __contains__(self, key: object) -> bool:
        return key in self._data
```

**test_lru_cache.py**

```python
import pytest

from lru_cache import LRUCache


def test_get_missing_returns_none_or_default():
    cache = LRUCache(2)
    assert cache.get("a") is None
    assert cache.get("a", -1) == -1


def test_put_and_get():
    cache = LRUCache(2)
    cache.put("a", 1)
    assert cache.get("a") == 1
    assert len(cache) == 1


def test_put_updates_existing_value():
    cache = LRUCache(2)
    cache.put("a", 1)
    cache.put("a", 2)
    assert cache.get("a") == 2
    assert len(cache) == 1


def test_evicts_least_recently_used():
    cache = LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("c", 3)
    assert "a" not in cache
    assert cache.get("b") == 2
    assert cache.get("c") == 3


def test_get_refreshes_recency():
    cache = LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.get("a")          # "b" is now least recently used
    cache.put("c", 3)
    assert "b" not in cache
    assert cache.get("a") == 1


def test_put_existing_refreshes_recency():
    cache = LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("a", 10)      # "b" is now least recently used
    cache.put("c", 3)
    assert "b" not in cache
    assert cache.get("a") == 10


def test_capacity_one():
    cache = LRUCache(1)
    cache.put("a", 1)
    cache.put("b", 2)
    assert "a" not in cache
    assert cache.get("b") == 2


def test_stores_falsy_values():
    cache = LRUCache(2)
    cache.put("a", 0)
    cache.put("b", None)
    assert cache.get("a", -1) == 0
    assert "b" in cache


@pytest.mark.parametrize("capacity", [0, -1])
def test_invalid_capacity_raises(capacity):
    with pytest.raises(ValueError):
        LRUCache(capacity)


def test_never_exceeds_capacity():
    cache = LRUCache(3)
    for i in range(100):
        cache.put(i, i)
    assert len(cache) == 3
    assert all(i in cache for i in (97, 98, 99))
```

Run it with `pytest test_lru_cache.py`. I haven't run the tests myself, since I have no execution tool here.

The cache uses `OrderedDict`, so both `get` and `put` are O(1). `get` accepts an optional `default`, so a stored `None` can be told apart from a miss. If you'd like, I can add the files to the repo once file tools are available.