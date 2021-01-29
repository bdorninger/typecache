/*export interface CacheEntryAttribs<T = unknown> {
  nodeClass: string;
  valueRank?: number;
  dataType?: CacheEntry<T>;
}*/

export interface CacheableValue<V = unknown> {
  value: V;
  key: string;
}

let timeProvider: ()=> number;
export function setTimeProviderForTesting(tp:()=>number) {
  timeProvider = tp;
}

export class CacheEntry {
  private _lastAccess: number;
  public parent?: CacheEntry;
  public readonly children: CacheEntry[] = [];

  constructor(public readonly value: CacheableValue) {
    this.touch();
  }
  public get key(): string {
    return this.value.key;
  }

  public get lastAccess():number {
    return this._lastAccess;
  }

  public touch() {
    this._lastAccess = timeProvider ? timeProvider():Date.now();
  }
}

export interface CacheIndex {
  [index: string]: CacheEntry;
}

export class HierarchyCache<T = CacheableValue> {
  private index: CacheIndex = {};
  private readonly cleanLoadFactor: number;
  private currentLoadFactor: number = 0.0;
  
  constructor(private readonly maxsize: number, cleanLoadFactor?: number) {
    cleanLoadFactor = cleanLoadFactor ?? 0.95;
    if (cleanLoadFactor > 1.0 || cleanLoadFactor < 0.5) {
      throw new Error(
        "Load factor for initiating the cleanup process must be higher than 0.5 and lower than 1.0"
      );
    }
    this.cleanLoadFactor = cleanLoadFactor;
  }

  public get currentSize(): number {
    return Object.keys(this.index).length;
  } 

  public addEntry(value: CacheableValue, parent?: CacheableValue) {
    const parentEntry = parent ? (this.index[parent.key]?? new CacheEntry(parent)):undefined;
    this.putEntry(
      this.index[value.key] ?? new CacheEntry(value), parentEntry);
  }

  protected putEntry(entry: CacheEntry, parent?: CacheEntry) {
    if(entry.key === parent?.key) {
      throw new Error(`Entry cannot be his own parent. Key is:${entry.key}`)
    }
    if (!this.index[entry.key]) {
      this.index[entry.key] = entry;
    }
    if (parent) {
      this.putEntry(parent);
      entry.parent = parent;
      parent.children.push(entry);
    }
    this.recomputeLoadFactor();
  }

  protected recomputeLoadFactor(isCleaning=false) {
    this.currentLoadFactor = this.currentSize / this.maxsize;
    if (!isCleaning && this.currentLoadFactor > this.cleanLoadFactor) { 
      // queueMicrotask(() => this.cleanup());
      this.cleanup(); 
    }
  }

  protected cleanup() {
    // clear oldest entries until we have a loadfactor cleanLoadFactor - 20%
    // console.log("CLEANING");
    const values = [...Object.values(this.index)].sort((entry1, entry2) => entry1.lastAccess - entry2.lastAccess);
    for (const entry of values) {
      this.removeEntry(entry.key, true);
      if (this.currentLoadFactor < this.cleanLoadFactor - 0.2) {
        break;
      }
    }
  }

  public getEntry(key: string): CacheableValue|undefined {
    return this.getCacheEntry(key)?.value;
  }

  protected getCacheEntry(key:string): CacheEntry|undefined {
    const entry = this.index[key];
    if(entry) {
      entry.touch();
    }
    return entry;
  }

  public getParent(key:string): CacheableValue|undefined {
    return this.getCacheEntry(key)?.parent?.value;
  }

  public getAncestors(key:string): CacheableValue[]|undefined {    
    let entry = this.getCacheEntry(key);
    if(!entry) {
      return undefined;
    }
    const results: CacheableValue[]=[]
    const root=entry;
    while(entry) {
      const p = entry.parent;
      if(p===root) {
        break;
      }
      if(p) {
        results.push(p.value);
      }
      entry =p;
    }
    return results;
  }

  public getDescendants(key:string): CacheableValue[]|undefined {
    let children = this.getChildren(key);    
    if(children === undefined) {
      return undefined;
    }
    const result = [...children];
    while(children && children.length>0) {
      let desc:CacheableValue[] =[];
      desc = children.reduce((allEntries, entry) => allEntries.concat(this.getChildren(entry.key)),desc);
      //const desc = children.flatMap(child => this.getChildren(child.key))
      result.push(...desc);
      children = desc;
    }    
    return result;
  }

  public getChildren(key:string): CacheableValue[]|undefined {
    const entry = this.index[key];
    if(entry) {
      return entry.children.map(e=> { e.touch(); return e.value});
    }
    return undefined;
  }

  public remove(key: string): CacheableValue|undefined {
    return this.removeEntry(key);
  }

  protected removeEntry(key: string, isCleaning = false): CacheableValue|undefined {
    const entry = this.index[key];
    if (!entry) {
      return undefined;
    }
    // console.log(`Removing: ${entry.key}`)
    delete this.index[entry.key];
    if (entry.children.length > 0) {
      entry.children.forEach(child => this.removeEntry(child.key,isCleaning));
    }
    if (entry.parent) {
      const ind = entry.parent.children.indexOf(entry);
      if (ind >= 0) {
        entry.parent.children.splice(ind, 1);
      }
    }
    this.recomputeLoadFactor(isCleaning);
    return entry.value;
  }

  public reset(): void {
    this.index = {};
    this.recomputeLoadFactor();
  }
}
