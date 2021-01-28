import { generate, of, timer } from "rxjs";
import { count, map } from "rxjs/operators";
import {
  CacheableValue,
  CacheEntry,
  HierarchyCache,
  setTimeProviderForTesting
} from "./hierarchy-cache";

const CACHESIZE = 1000;
const VALUES = 1020;
let time = 0;
const source = of("GO").pipe(map(x => `Here we ${x}!`));

source.subscribe(console.log);

class CacheableValImpl implements CacheableValue<string> {
  constructor(public readonly value: string, public readonly _key?: string) {}
  public get key(): string {
    return this._key !== undefined ? this._key : "__" + this.value;
  }
}

let histo: CacheableValImpl[] = [];

const cache = new HierarchyCache(CACHESIZE, 1.0);
setTimeProviderForTesting(() => {
  return ++time;
});

const specials = [28, 122, 345, 566, 788, 845, 966];


function doit() {
  
  console.log(`Feeding ${VALUES} values into the cache with maxsize ${CACHESIZE}`)
  const start = Date.now();
  const dataset = generate(1, val => val <= VALUES, val => val + 1).subscribe(
    val => {
      //console.log("Generated:",val)
      const entry = new CacheableValImpl("entry-value" + val, "__" + val);
      let parent: CacheableValImpl;
      const rnd = Math.random();
      if (specials.indexOf(val) >= 0) {
        parent = histo.length > 0 ? histo[0] : undefined;
      }
      if (specials.indexOf(val) >= 0 && parent) {
        //console.log("grand!", val);
        const grandparent = histo.length > 1 ? histo[1] : undefined;
        cache.addEntry(parent, grandparent);
      }
      cache.addEntry(entry, parent);
      histo.unshift(entry);
      if (histo.length > 2) {
        histo.pop();
      }
    },
    () => {
      console.log("Finish cache init");
    }
  );

  /*for (let i = 0; i <= SIZE; i++) {
  console.log("entry: ", cache.getEntry("__" + i));
  console.log("anc: ", cache.getAncestors("__" + i));
  console.log("child: ", cache.getChildren("__" + i));
  console.log("desc: ", cache.getDescendants("__" + i));
  
  }*/
  const duration = Date.now() - start;
  console.log(`DONE in ${duration} ms, current cache size:`, cache.currentSize);

  specials.forEach(val => {
    console.log(`Value of : ${val}`, cache.getEntry("__"+val)?.value)
    console.log(`__Ancestors for ${val}`, cache.getAncestors("__" + val));
    console.log(
      `__Descendants for ${val - 2}`,
      cache.getDescendants("__" + (val - 2))
    );
    console.log(`__Children for ${val - 2}`, cache.getChildren("__" + (val - 2)));
  });
}

let bt = document.getElementById('doit');
bt.addEventListener("click", (e) => doit());

bt = document.getElementById('reset');
bt.addEventListener("click", (e) => { cache.reset(); console.log("Reset",cache.currentSize)});

