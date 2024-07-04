(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.MaplibreInspect = factory());
})(this, (function () { 'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	var lodash_isequal = {exports: {}};

	/**
	 * Lodash (Custom Build) <https://lodash.com/>
	 * Build: `lodash modularize exports="npm" -o ./`
	 * Copyright JS Foundation and other contributors <https://js.foundation/>
	 * Released under MIT license <https://lodash.com/license>
	 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
	 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
	 */
	lodash_isequal.exports;

	(function (module, exports) {
		/** Used as the size to enable large array optimizations. */
		var LARGE_ARRAY_SIZE = 200;

		/** Used to stand-in for `undefined` hash values. */
		var HASH_UNDEFINED = '__lodash_hash_undefined__';

		/** Used to compose bitmasks for value comparisons. */
		var COMPARE_PARTIAL_FLAG = 1,
		    COMPARE_UNORDERED_FLAG = 2;

		/** Used as references for various `Number` constants. */
		var MAX_SAFE_INTEGER = 9007199254740991;

		/** `Object#toString` result references. */
		var argsTag = '[object Arguments]',
		    arrayTag = '[object Array]',
		    asyncTag = '[object AsyncFunction]',
		    boolTag = '[object Boolean]',
		    dateTag = '[object Date]',
		    errorTag = '[object Error]',
		    funcTag = '[object Function]',
		    genTag = '[object GeneratorFunction]',
		    mapTag = '[object Map]',
		    numberTag = '[object Number]',
		    nullTag = '[object Null]',
		    objectTag = '[object Object]',
		    promiseTag = '[object Promise]',
		    proxyTag = '[object Proxy]',
		    regexpTag = '[object RegExp]',
		    setTag = '[object Set]',
		    stringTag = '[object String]',
		    symbolTag = '[object Symbol]',
		    undefinedTag = '[object Undefined]',
		    weakMapTag = '[object WeakMap]';

		var arrayBufferTag = '[object ArrayBuffer]',
		    dataViewTag = '[object DataView]',
		    float32Tag = '[object Float32Array]',
		    float64Tag = '[object Float64Array]',
		    int8Tag = '[object Int8Array]',
		    int16Tag = '[object Int16Array]',
		    int32Tag = '[object Int32Array]',
		    uint8Tag = '[object Uint8Array]',
		    uint8ClampedTag = '[object Uint8ClampedArray]',
		    uint16Tag = '[object Uint16Array]',
		    uint32Tag = '[object Uint32Array]';

		/**
		 * Used to match `RegExp`
		 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
		 */
		var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

		/** Used to detect host constructors (Safari). */
		var reIsHostCtor = /^\[object .+?Constructor\]$/;

		/** Used to detect unsigned integer values. */
		var reIsUint = /^(?:0|[1-9]\d*)$/;

		/** Used to identify `toStringTag` values of typed arrays. */
		var typedArrayTags = {};
		typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
		typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
		typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
		typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
		typedArrayTags[uint32Tag] = true;
		typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
		typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
		typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
		typedArrayTags[errorTag] = typedArrayTags[funcTag] =
		typedArrayTags[mapTag] = typedArrayTags[numberTag] =
		typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
		typedArrayTags[setTag] = typedArrayTags[stringTag] =
		typedArrayTags[weakMapTag] = false;

		/** Detect free variable `global` from Node.js. */
		var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

		/** Detect free variable `self`. */
		var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

		/** Used as a reference to the global object. */
		var root = freeGlobal || freeSelf || Function('return this')();

		/** Detect free variable `exports`. */
		var freeExports = exports && !exports.nodeType && exports;

		/** Detect free variable `module`. */
		var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

		/** Detect the popular CommonJS extension `module.exports`. */
		var moduleExports = freeModule && freeModule.exports === freeExports;

		/** Detect free variable `process` from Node.js. */
		var freeProcess = moduleExports && freeGlobal.process;

		/** Used to access faster Node.js helpers. */
		var nodeUtil = (function() {
		  try {
		    return freeProcess && freeProcess.binding && freeProcess.binding('util');
		  } catch (e) {}
		}());

		/* Node.js helper references. */
		var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

		/**
		 * A specialized version of `_.filter` for arrays without support for
		 * iteratee shorthands.
		 *
		 * @private
		 * @param {Array} [array] The array to iterate over.
		 * @param {Function} predicate The function invoked per iteration.
		 * @returns {Array} Returns the new filtered array.
		 */
		function arrayFilter(array, predicate) {
		  var index = -1,
		      length = array == null ? 0 : array.length,
		      resIndex = 0,
		      result = [];

		  while (++index < length) {
		    var value = array[index];
		    if (predicate(value, index, array)) {
		      result[resIndex++] = value;
		    }
		  }
		  return result;
		}

		/**
		 * Appends the elements of `values` to `array`.
		 *
		 * @private
		 * @param {Array} array The array to modify.
		 * @param {Array} values The values to append.
		 * @returns {Array} Returns `array`.
		 */
		function arrayPush(array, values) {
		  var index = -1,
		      length = values.length,
		      offset = array.length;

		  while (++index < length) {
		    array[offset + index] = values[index];
		  }
		  return array;
		}

		/**
		 * A specialized version of `_.some` for arrays without support for iteratee
		 * shorthands.
		 *
		 * @private
		 * @param {Array} [array] The array to iterate over.
		 * @param {Function} predicate The function invoked per iteration.
		 * @returns {boolean} Returns `true` if any element passes the predicate check,
		 *  else `false`.
		 */
		function arraySome(array, predicate) {
		  var index = -1,
		      length = array == null ? 0 : array.length;

		  while (++index < length) {
		    if (predicate(array[index], index, array)) {
		      return true;
		    }
		  }
		  return false;
		}

		/**
		 * The base implementation of `_.times` without support for iteratee shorthands
		 * or max array length checks.
		 *
		 * @private
		 * @param {number} n The number of times to invoke `iteratee`.
		 * @param {Function} iteratee The function invoked per iteration.
		 * @returns {Array} Returns the array of results.
		 */
		function baseTimes(n, iteratee) {
		  var index = -1,
		      result = Array(n);

		  while (++index < n) {
		    result[index] = iteratee(index);
		  }
		  return result;
		}

		/**
		 * The base implementation of `_.unary` without support for storing metadata.
		 *
		 * @private
		 * @param {Function} func The function to cap arguments for.
		 * @returns {Function} Returns the new capped function.
		 */
		function baseUnary(func) {
		  return function(value) {
		    return func(value);
		  };
		}

		/**
		 * Checks if a `cache` value for `key` exists.
		 *
		 * @private
		 * @param {Object} cache The cache to query.
		 * @param {string} key The key of the entry to check.
		 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
		 */
		function cacheHas(cache, key) {
		  return cache.has(key);
		}

		/**
		 * Gets the value at `key` of `object`.
		 *
		 * @private
		 * @param {Object} [object] The object to query.
		 * @param {string} key The key of the property to get.
		 * @returns {*} Returns the property value.
		 */
		function getValue(object, key) {
		  return object == null ? undefined : object[key];
		}

		/**
		 * Converts `map` to its key-value pairs.
		 *
		 * @private
		 * @param {Object} map The map to convert.
		 * @returns {Array} Returns the key-value pairs.
		 */
		function mapToArray(map) {
		  var index = -1,
		      result = Array(map.size);

		  map.forEach(function(value, key) {
		    result[++index] = [key, value];
		  });
		  return result;
		}

		/**
		 * Creates a unary function that invokes `func` with its argument transformed.
		 *
		 * @private
		 * @param {Function} func The function to wrap.
		 * @param {Function} transform The argument transform.
		 * @returns {Function} Returns the new function.
		 */
		function overArg(func, transform) {
		  return function(arg) {
		    return func(transform(arg));
		  };
		}

		/**
		 * Converts `set` to an array of its values.
		 *
		 * @private
		 * @param {Object} set The set to convert.
		 * @returns {Array} Returns the values.
		 */
		function setToArray(set) {
		  var index = -1,
		      result = Array(set.size);

		  set.forEach(function(value) {
		    result[++index] = value;
		  });
		  return result;
		}

		/** Used for built-in method references. */
		var arrayProto = Array.prototype,
		    funcProto = Function.prototype,
		    objectProto = Object.prototype;

		/** Used to detect overreaching core-js shims. */
		var coreJsData = root['__core-js_shared__'];

		/** Used to resolve the decompiled source of functions. */
		var funcToString = funcProto.toString;

		/** Used to check objects for own properties. */
		var hasOwnProperty = objectProto.hasOwnProperty;

		/** Used to detect methods masquerading as native. */
		var maskSrcKey = (function() {
		  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
		  return uid ? ('Symbol(src)_1.' + uid) : '';
		}());

		/**
		 * Used to resolve the
		 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
		 * of values.
		 */
		var nativeObjectToString = objectProto.toString;

		/** Used to detect if a method is native. */
		var reIsNative = RegExp('^' +
		  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
		  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
		);

		/** Built-in value references. */
		var Buffer = moduleExports ? root.Buffer : undefined,
		    Symbol = root.Symbol,
		    Uint8Array = root.Uint8Array,
		    propertyIsEnumerable = objectProto.propertyIsEnumerable,
		    splice = arrayProto.splice,
		    symToStringTag = Symbol ? Symbol.toStringTag : undefined;

		/* Built-in method references for those with the same name as other `lodash` methods. */
		var nativeGetSymbols = Object.getOwnPropertySymbols,
		    nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
		    nativeKeys = overArg(Object.keys, Object);

		/* Built-in method references that are verified to be native. */
		var DataView = getNative(root, 'DataView'),
		    Map = getNative(root, 'Map'),
		    Promise = getNative(root, 'Promise'),
		    Set = getNative(root, 'Set'),
		    WeakMap = getNative(root, 'WeakMap'),
		    nativeCreate = getNative(Object, 'create');

		/** Used to detect maps, sets, and weakmaps. */
		var dataViewCtorString = toSource(DataView),
		    mapCtorString = toSource(Map),
		    promiseCtorString = toSource(Promise),
		    setCtorString = toSource(Set),
		    weakMapCtorString = toSource(WeakMap);

		/** Used to convert symbols to primitives and strings. */
		var symbolProto = Symbol ? Symbol.prototype : undefined,
		    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

		/**
		 * Creates a hash object.
		 *
		 * @private
		 * @constructor
		 * @param {Array} [entries] The key-value pairs to cache.
		 */
		function Hash(entries) {
		  var index = -1,
		      length = entries == null ? 0 : entries.length;

		  this.clear();
		  while (++index < length) {
		    var entry = entries[index];
		    this.set(entry[0], entry[1]);
		  }
		}

		/**
		 * Removes all key-value entries from the hash.
		 *
		 * @private
		 * @name clear
		 * @memberOf Hash
		 */
		function hashClear() {
		  this.__data__ = nativeCreate ? nativeCreate(null) : {};
		  this.size = 0;
		}

		/**
		 * Removes `key` and its value from the hash.
		 *
		 * @private
		 * @name delete
		 * @memberOf Hash
		 * @param {Object} hash The hash to modify.
		 * @param {string} key The key of the value to remove.
		 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
		 */
		function hashDelete(key) {
		  var result = this.has(key) && delete this.__data__[key];
		  this.size -= result ? 1 : 0;
		  return result;
		}

		/**
		 * Gets the hash value for `key`.
		 *
		 * @private
		 * @name get
		 * @memberOf Hash
		 * @param {string} key The key of the value to get.
		 * @returns {*} Returns the entry value.
		 */
		function hashGet(key) {
		  var data = this.__data__;
		  if (nativeCreate) {
		    var result = data[key];
		    return result === HASH_UNDEFINED ? undefined : result;
		  }
		  return hasOwnProperty.call(data, key) ? data[key] : undefined;
		}

		/**
		 * Checks if a hash value for `key` exists.
		 *
		 * @private
		 * @name has
		 * @memberOf Hash
		 * @param {string} key The key of the entry to check.
		 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
		 */
		function hashHas(key) {
		  var data = this.__data__;
		  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
		}

		/**
		 * Sets the hash `key` to `value`.
		 *
		 * @private
		 * @name set
		 * @memberOf Hash
		 * @param {string} key The key of the value to set.
		 * @param {*} value The value to set.
		 * @returns {Object} Returns the hash instance.
		 */
		function hashSet(key, value) {
		  var data = this.__data__;
		  this.size += this.has(key) ? 0 : 1;
		  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
		  return this;
		}

		// Add methods to `Hash`.
		Hash.prototype.clear = hashClear;
		Hash.prototype['delete'] = hashDelete;
		Hash.prototype.get = hashGet;
		Hash.prototype.has = hashHas;
		Hash.prototype.set = hashSet;

		/**
		 * Creates an list cache object.
		 *
		 * @private
		 * @constructor
		 * @param {Array} [entries] The key-value pairs to cache.
		 */
		function ListCache(entries) {
		  var index = -1,
		      length = entries == null ? 0 : entries.length;

		  this.clear();
		  while (++index < length) {
		    var entry = entries[index];
		    this.set(entry[0], entry[1]);
		  }
		}

		/**
		 * Removes all key-value entries from the list cache.
		 *
		 * @private
		 * @name clear
		 * @memberOf ListCache
		 */
		function listCacheClear() {
		  this.__data__ = [];
		  this.size = 0;
		}

		/**
		 * Removes `key` and its value from the list cache.
		 *
		 * @private
		 * @name delete
		 * @memberOf ListCache
		 * @param {string} key The key of the value to remove.
		 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
		 */
		function listCacheDelete(key) {
		  var data = this.__data__,
		      index = assocIndexOf(data, key);

		  if (index < 0) {
		    return false;
		  }
		  var lastIndex = data.length - 1;
		  if (index == lastIndex) {
		    data.pop();
		  } else {
		    splice.call(data, index, 1);
		  }
		  --this.size;
		  return true;
		}

		/**
		 * Gets the list cache value for `key`.
		 *
		 * @private
		 * @name get
		 * @memberOf ListCache
		 * @param {string} key The key of the value to get.
		 * @returns {*} Returns the entry value.
		 */
		function listCacheGet(key) {
		  var data = this.__data__,
		      index = assocIndexOf(data, key);

		  return index < 0 ? undefined : data[index][1];
		}

		/**
		 * Checks if a list cache value for `key` exists.
		 *
		 * @private
		 * @name has
		 * @memberOf ListCache
		 * @param {string} key The key of the entry to check.
		 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
		 */
		function listCacheHas(key) {
		  return assocIndexOf(this.__data__, key) > -1;
		}

		/**
		 * Sets the list cache `key` to `value`.
		 *
		 * @private
		 * @name set
		 * @memberOf ListCache
		 * @param {string} key The key of the value to set.
		 * @param {*} value The value to set.
		 * @returns {Object} Returns the list cache instance.
		 */
		function listCacheSet(key, value) {
		  var data = this.__data__,
		      index = assocIndexOf(data, key);

		  if (index < 0) {
		    ++this.size;
		    data.push([key, value]);
		  } else {
		    data[index][1] = value;
		  }
		  return this;
		}

		// Add methods to `ListCache`.
		ListCache.prototype.clear = listCacheClear;
		ListCache.prototype['delete'] = listCacheDelete;
		ListCache.prototype.get = listCacheGet;
		ListCache.prototype.has = listCacheHas;
		ListCache.prototype.set = listCacheSet;

		/**
		 * Creates a map cache object to store key-value pairs.
		 *
		 * @private
		 * @constructor
		 * @param {Array} [entries] The key-value pairs to cache.
		 */
		function MapCache(entries) {
		  var index = -1,
		      length = entries == null ? 0 : entries.length;

		  this.clear();
		  while (++index < length) {
		    var entry = entries[index];
		    this.set(entry[0], entry[1]);
		  }
		}

		/**
		 * Removes all key-value entries from the map.
		 *
		 * @private
		 * @name clear
		 * @memberOf MapCache
		 */
		function mapCacheClear() {
		  this.size = 0;
		  this.__data__ = {
		    'hash': new Hash,
		    'map': new (Map || ListCache),
		    'string': new Hash
		  };
		}

		/**
		 * Removes `key` and its value from the map.
		 *
		 * @private
		 * @name delete
		 * @memberOf MapCache
		 * @param {string} key The key of the value to remove.
		 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
		 */
		function mapCacheDelete(key) {
		  var result = getMapData(this, key)['delete'](key);
		  this.size -= result ? 1 : 0;
		  return result;
		}

		/**
		 * Gets the map value for `key`.
		 *
		 * @private
		 * @name get
		 * @memberOf MapCache
		 * @param {string} key The key of the value to get.
		 * @returns {*} Returns the entry value.
		 */
		function mapCacheGet(key) {
		  return getMapData(this, key).get(key);
		}

		/**
		 * Checks if a map value for `key` exists.
		 *
		 * @private
		 * @name has
		 * @memberOf MapCache
		 * @param {string} key The key of the entry to check.
		 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
		 */
		function mapCacheHas(key) {
		  return getMapData(this, key).has(key);
		}

		/**
		 * Sets the map `key` to `value`.
		 *
		 * @private
		 * @name set
		 * @memberOf MapCache
		 * @param {string} key The key of the value to set.
		 * @param {*} value The value to set.
		 * @returns {Object} Returns the map cache instance.
		 */
		function mapCacheSet(key, value) {
		  var data = getMapData(this, key),
		      size = data.size;

		  data.set(key, value);
		  this.size += data.size == size ? 0 : 1;
		  return this;
		}

		// Add methods to `MapCache`.
		MapCache.prototype.clear = mapCacheClear;
		MapCache.prototype['delete'] = mapCacheDelete;
		MapCache.prototype.get = mapCacheGet;
		MapCache.prototype.has = mapCacheHas;
		MapCache.prototype.set = mapCacheSet;

		/**
		 *
		 * Creates an array cache object to store unique values.
		 *
		 * @private
		 * @constructor
		 * @param {Array} [values] The values to cache.
		 */
		function SetCache(values) {
		  var index = -1,
		      length = values == null ? 0 : values.length;

		  this.__data__ = new MapCache;
		  while (++index < length) {
		    this.add(values[index]);
		  }
		}

		/**
		 * Adds `value` to the array cache.
		 *
		 * @private
		 * @name add
		 * @memberOf SetCache
		 * @alias push
		 * @param {*} value The value to cache.
		 * @returns {Object} Returns the cache instance.
		 */
		function setCacheAdd(value) {
		  this.__data__.set(value, HASH_UNDEFINED);
		  return this;
		}

		/**
		 * Checks if `value` is in the array cache.
		 *
		 * @private
		 * @name has
		 * @memberOf SetCache
		 * @param {*} value The value to search for.
		 * @returns {number} Returns `true` if `value` is found, else `false`.
		 */
		function setCacheHas(value) {
		  return this.__data__.has(value);
		}

		// Add methods to `SetCache`.
		SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
		SetCache.prototype.has = setCacheHas;

		/**
		 * Creates a stack cache object to store key-value pairs.
		 *
		 * @private
		 * @constructor
		 * @param {Array} [entries] The key-value pairs to cache.
		 */
		function Stack(entries) {
		  var data = this.__data__ = new ListCache(entries);
		  this.size = data.size;
		}

		/**
		 * Removes all key-value entries from the stack.
		 *
		 * @private
		 * @name clear
		 * @memberOf Stack
		 */
		function stackClear() {
		  this.__data__ = new ListCache;
		  this.size = 0;
		}

		/**
		 * Removes `key` and its value from the stack.
		 *
		 * @private
		 * @name delete
		 * @memberOf Stack
		 * @param {string} key The key of the value to remove.
		 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
		 */
		function stackDelete(key) {
		  var data = this.__data__,
		      result = data['delete'](key);

		  this.size = data.size;
		  return result;
		}

		/**
		 * Gets the stack value for `key`.
		 *
		 * @private
		 * @name get
		 * @memberOf Stack
		 * @param {string} key The key of the value to get.
		 * @returns {*} Returns the entry value.
		 */
		function stackGet(key) {
		  return this.__data__.get(key);
		}

		/**
		 * Checks if a stack value for `key` exists.
		 *
		 * @private
		 * @name has
		 * @memberOf Stack
		 * @param {string} key The key of the entry to check.
		 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
		 */
		function stackHas(key) {
		  return this.__data__.has(key);
		}

		/**
		 * Sets the stack `key` to `value`.
		 *
		 * @private
		 * @name set
		 * @memberOf Stack
		 * @param {string} key The key of the value to set.
		 * @param {*} value The value to set.
		 * @returns {Object} Returns the stack cache instance.
		 */
		function stackSet(key, value) {
		  var data = this.__data__;
		  if (data instanceof ListCache) {
		    var pairs = data.__data__;
		    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
		      pairs.push([key, value]);
		      this.size = ++data.size;
		      return this;
		    }
		    data = this.__data__ = new MapCache(pairs);
		  }
		  data.set(key, value);
		  this.size = data.size;
		  return this;
		}

		// Add methods to `Stack`.
		Stack.prototype.clear = stackClear;
		Stack.prototype['delete'] = stackDelete;
		Stack.prototype.get = stackGet;
		Stack.prototype.has = stackHas;
		Stack.prototype.set = stackSet;

		/**
		 * Creates an array of the enumerable property names of the array-like `value`.
		 *
		 * @private
		 * @param {*} value The value to query.
		 * @param {boolean} inherited Specify returning inherited property names.
		 * @returns {Array} Returns the array of property names.
		 */
		function arrayLikeKeys(value, inherited) {
		  var isArr = isArray(value),
		      isArg = !isArr && isArguments(value),
		      isBuff = !isArr && !isArg && isBuffer(value),
		      isType = !isArr && !isArg && !isBuff && isTypedArray(value),
		      skipIndexes = isArr || isArg || isBuff || isType,
		      result = skipIndexes ? baseTimes(value.length, String) : [],
		      length = result.length;

		  for (var key in value) {
		    if ((hasOwnProperty.call(value, key)) &&
		        !(skipIndexes && (
		           // Safari 9 has enumerable `arguments.length` in strict mode.
		           key == 'length' ||
		           // Node.js 0.10 has enumerable non-index properties on buffers.
		           (isBuff && (key == 'offset' || key == 'parent')) ||
		           // PhantomJS 2 has enumerable non-index properties on typed arrays.
		           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
		           // Skip index properties.
		           isIndex(key, length)
		        ))) {
		      result.push(key);
		    }
		  }
		  return result;
		}

		/**
		 * Gets the index at which the `key` is found in `array` of key-value pairs.
		 *
		 * @private
		 * @param {Array} array The array to inspect.
		 * @param {*} key The key to search for.
		 * @returns {number} Returns the index of the matched value, else `-1`.
		 */
		function assocIndexOf(array, key) {
		  var length = array.length;
		  while (length--) {
		    if (eq(array[length][0], key)) {
		      return length;
		    }
		  }
		  return -1;
		}

		/**
		 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
		 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
		 * symbols of `object`.
		 *
		 * @private
		 * @param {Object} object The object to query.
		 * @param {Function} keysFunc The function to get the keys of `object`.
		 * @param {Function} symbolsFunc The function to get the symbols of `object`.
		 * @returns {Array} Returns the array of property names and symbols.
		 */
		function baseGetAllKeys(object, keysFunc, symbolsFunc) {
		  var result = keysFunc(object);
		  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
		}

		/**
		 * The base implementation of `getTag` without fallbacks for buggy environments.
		 *
		 * @private
		 * @param {*} value The value to query.
		 * @returns {string} Returns the `toStringTag`.
		 */
		function baseGetTag(value) {
		  if (value == null) {
		    return value === undefined ? undefinedTag : nullTag;
		  }
		  return (symToStringTag && symToStringTag in Object(value))
		    ? getRawTag(value)
		    : objectToString(value);
		}

		/**
		 * The base implementation of `_.isArguments`.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
		 */
		function baseIsArguments(value) {
		  return isObjectLike(value) && baseGetTag(value) == argsTag;
		}

		/**
		 * The base implementation of `_.isEqual` which supports partial comparisons
		 * and tracks traversed objects.
		 *
		 * @private
		 * @param {*} value The value to compare.
		 * @param {*} other The other value to compare.
		 * @param {boolean} bitmask The bitmask flags.
		 *  1 - Unordered comparison
		 *  2 - Partial comparison
		 * @param {Function} [customizer] The function to customize comparisons.
		 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
		 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
		 */
		function baseIsEqual(value, other, bitmask, customizer, stack) {
		  if (value === other) {
		    return true;
		  }
		  if (value == null || other == null || (!isObjectLike(value) && !isObjectLike(other))) {
		    return value !== value && other !== other;
		  }
		  return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
		}

		/**
		 * A specialized version of `baseIsEqual` for arrays and objects which performs
		 * deep comparisons and tracks traversed objects enabling objects with circular
		 * references to be compared.
		 *
		 * @private
		 * @param {Object} object The object to compare.
		 * @param {Object} other The other object to compare.
		 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
		 * @param {Function} customizer The function to customize comparisons.
		 * @param {Function} equalFunc The function to determine equivalents of values.
		 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
		 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
		 */
		function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
		  var objIsArr = isArray(object),
		      othIsArr = isArray(other),
		      objTag = objIsArr ? arrayTag : getTag(object),
		      othTag = othIsArr ? arrayTag : getTag(other);

		  objTag = objTag == argsTag ? objectTag : objTag;
		  othTag = othTag == argsTag ? objectTag : othTag;

		  var objIsObj = objTag == objectTag,
		      othIsObj = othTag == objectTag,
		      isSameTag = objTag == othTag;

		  if (isSameTag && isBuffer(object)) {
		    if (!isBuffer(other)) {
		      return false;
		    }
		    objIsArr = true;
		    objIsObj = false;
		  }
		  if (isSameTag && !objIsObj) {
		    stack || (stack = new Stack);
		    return (objIsArr || isTypedArray(object))
		      ? equalArrays(object, other, bitmask, customizer, equalFunc, stack)
		      : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
		  }
		  if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
		    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
		        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

		    if (objIsWrapped || othIsWrapped) {
		      var objUnwrapped = objIsWrapped ? object.value() : object,
		          othUnwrapped = othIsWrapped ? other.value() : other;

		      stack || (stack = new Stack);
		      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
		    }
		  }
		  if (!isSameTag) {
		    return false;
		  }
		  stack || (stack = new Stack);
		  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
		}

		/**
		 * The base implementation of `_.isNative` without bad shim checks.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a native function,
		 *  else `false`.
		 */
		function baseIsNative(value) {
		  if (!isObject(value) || isMasked(value)) {
		    return false;
		  }
		  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
		  return pattern.test(toSource(value));
		}

		/**
		 * The base implementation of `_.isTypedArray` without Node.js optimizations.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
		 */
		function baseIsTypedArray(value) {
		  return isObjectLike(value) &&
		    isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
		}

		/**
		 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
		 *
		 * @private
		 * @param {Object} object The object to query.
		 * @returns {Array} Returns the array of property names.
		 */
		function baseKeys(object) {
		  if (!isPrototype(object)) {
		    return nativeKeys(object);
		  }
		  var result = [];
		  for (var key in Object(object)) {
		    if (hasOwnProperty.call(object, key) && key != 'constructor') {
		      result.push(key);
		    }
		  }
		  return result;
		}

		/**
		 * A specialized version of `baseIsEqualDeep` for arrays with support for
		 * partial deep comparisons.
		 *
		 * @private
		 * @param {Array} array The array to compare.
		 * @param {Array} other The other array to compare.
		 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
		 * @param {Function} customizer The function to customize comparisons.
		 * @param {Function} equalFunc The function to determine equivalents of values.
		 * @param {Object} stack Tracks traversed `array` and `other` objects.
		 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
		 */
		function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
		  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
		      arrLength = array.length,
		      othLength = other.length;

		  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
		    return false;
		  }
		  // Assume cyclic values are equal.
		  var stacked = stack.get(array);
		  if (stacked && stack.get(other)) {
		    return stacked == other;
		  }
		  var index = -1,
		      result = true,
		      seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new SetCache : undefined;

		  stack.set(array, other);
		  stack.set(other, array);

		  // Ignore non-index properties.
		  while (++index < arrLength) {
		    var arrValue = array[index],
		        othValue = other[index];

		    if (customizer) {
		      var compared = isPartial
		        ? customizer(othValue, arrValue, index, other, array, stack)
		        : customizer(arrValue, othValue, index, array, other, stack);
		    }
		    if (compared !== undefined) {
		      if (compared) {
		        continue;
		      }
		      result = false;
		      break;
		    }
		    // Recursively compare arrays (susceptible to call stack limits).
		    if (seen) {
		      if (!arraySome(other, function(othValue, othIndex) {
		            if (!cacheHas(seen, othIndex) &&
		                (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
		              return seen.push(othIndex);
		            }
		          })) {
		        result = false;
		        break;
		      }
		    } else if (!(
		          arrValue === othValue ||
		            equalFunc(arrValue, othValue, bitmask, customizer, stack)
		        )) {
		      result = false;
		      break;
		    }
		  }
		  stack['delete'](array);
		  stack['delete'](other);
		  return result;
		}

		/**
		 * A specialized version of `baseIsEqualDeep` for comparing objects of
		 * the same `toStringTag`.
		 *
		 * **Note:** This function only supports comparing values with tags of
		 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
		 *
		 * @private
		 * @param {Object} object The object to compare.
		 * @param {Object} other The other object to compare.
		 * @param {string} tag The `toStringTag` of the objects to compare.
		 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
		 * @param {Function} customizer The function to customize comparisons.
		 * @param {Function} equalFunc The function to determine equivalents of values.
		 * @param {Object} stack Tracks traversed `object` and `other` objects.
		 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
		 */
		function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
		  switch (tag) {
		    case dataViewTag:
		      if ((object.byteLength != other.byteLength) ||
		          (object.byteOffset != other.byteOffset)) {
		        return false;
		      }
		      object = object.buffer;
		      other = other.buffer;

		    case arrayBufferTag:
		      if ((object.byteLength != other.byteLength) ||
		          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
		        return false;
		      }
		      return true;

		    case boolTag:
		    case dateTag:
		    case numberTag:
		      // Coerce booleans to `1` or `0` and dates to milliseconds.
		      // Invalid dates are coerced to `NaN`.
		      return eq(+object, +other);

		    case errorTag:
		      return object.name == other.name && object.message == other.message;

		    case regexpTag:
		    case stringTag:
		      // Coerce regexes to strings and treat strings, primitives and objects,
		      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
		      // for more details.
		      return object == (other + '');

		    case mapTag:
		      var convert = mapToArray;

		    case setTag:
		      var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
		      convert || (convert = setToArray);

		      if (object.size != other.size && !isPartial) {
		        return false;
		      }
		      // Assume cyclic values are equal.
		      var stacked = stack.get(object);
		      if (stacked) {
		        return stacked == other;
		      }
		      bitmask |= COMPARE_UNORDERED_FLAG;

		      // Recursively compare objects (susceptible to call stack limits).
		      stack.set(object, other);
		      var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
		      stack['delete'](object);
		      return result;

		    case symbolTag:
		      if (symbolValueOf) {
		        return symbolValueOf.call(object) == symbolValueOf.call(other);
		      }
		  }
		  return false;
		}

		/**
		 * A specialized version of `baseIsEqualDeep` for objects with support for
		 * partial deep comparisons.
		 *
		 * @private
		 * @param {Object} object The object to compare.
		 * @param {Object} other The other object to compare.
		 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
		 * @param {Function} customizer The function to customize comparisons.
		 * @param {Function} equalFunc The function to determine equivalents of values.
		 * @param {Object} stack Tracks traversed `object` and `other` objects.
		 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
		 */
		function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
		  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
		      objProps = getAllKeys(object),
		      objLength = objProps.length,
		      othProps = getAllKeys(other),
		      othLength = othProps.length;

		  if (objLength != othLength && !isPartial) {
		    return false;
		  }
		  var index = objLength;
		  while (index--) {
		    var key = objProps[index];
		    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
		      return false;
		    }
		  }
		  // Assume cyclic values are equal.
		  var stacked = stack.get(object);
		  if (stacked && stack.get(other)) {
		    return stacked == other;
		  }
		  var result = true;
		  stack.set(object, other);
		  stack.set(other, object);

		  var skipCtor = isPartial;
		  while (++index < objLength) {
		    key = objProps[index];
		    var objValue = object[key],
		        othValue = other[key];

		    if (customizer) {
		      var compared = isPartial
		        ? customizer(othValue, objValue, key, other, object, stack)
		        : customizer(objValue, othValue, key, object, other, stack);
		    }
		    // Recursively compare objects (susceptible to call stack limits).
		    if (!(compared === undefined
		          ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
		          : compared
		        )) {
		      result = false;
		      break;
		    }
		    skipCtor || (skipCtor = key == 'constructor');
		  }
		  if (result && !skipCtor) {
		    var objCtor = object.constructor,
		        othCtor = other.constructor;

		    // Non `Object` object instances with different constructors are not equal.
		    if (objCtor != othCtor &&
		        ('constructor' in object && 'constructor' in other) &&
		        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
		          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
		      result = false;
		    }
		  }
		  stack['delete'](object);
		  stack['delete'](other);
		  return result;
		}

		/**
		 * Creates an array of own enumerable property names and symbols of `object`.
		 *
		 * @private
		 * @param {Object} object The object to query.
		 * @returns {Array} Returns the array of property names and symbols.
		 */
		function getAllKeys(object) {
		  return baseGetAllKeys(object, keys, getSymbols);
		}

		/**
		 * Gets the data for `map`.
		 *
		 * @private
		 * @param {Object} map The map to query.
		 * @param {string} key The reference key.
		 * @returns {*} Returns the map data.
		 */
		function getMapData(map, key) {
		  var data = map.__data__;
		  return isKeyable(key)
		    ? data[typeof key == 'string' ? 'string' : 'hash']
		    : data.map;
		}

		/**
		 * Gets the native function at `key` of `object`.
		 *
		 * @private
		 * @param {Object} object The object to query.
		 * @param {string} key The key of the method to get.
		 * @returns {*} Returns the function if it's native, else `undefined`.
		 */
		function getNative(object, key) {
		  var value = getValue(object, key);
		  return baseIsNative(value) ? value : undefined;
		}

		/**
		 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
		 *
		 * @private
		 * @param {*} value The value to query.
		 * @returns {string} Returns the raw `toStringTag`.
		 */
		function getRawTag(value) {
		  var isOwn = hasOwnProperty.call(value, symToStringTag),
		      tag = value[symToStringTag];

		  try {
		    value[symToStringTag] = undefined;
		    var unmasked = true;
		  } catch (e) {}

		  var result = nativeObjectToString.call(value);
		  if (unmasked) {
		    if (isOwn) {
		      value[symToStringTag] = tag;
		    } else {
		      delete value[symToStringTag];
		    }
		  }
		  return result;
		}

		/**
		 * Creates an array of the own enumerable symbols of `object`.
		 *
		 * @private
		 * @param {Object} object The object to query.
		 * @returns {Array} Returns the array of symbols.
		 */
		var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
		  if (object == null) {
		    return [];
		  }
		  object = Object(object);
		  return arrayFilter(nativeGetSymbols(object), function(symbol) {
		    return propertyIsEnumerable.call(object, symbol);
		  });
		};

		/**
		 * Gets the `toStringTag` of `value`.
		 *
		 * @private
		 * @param {*} value The value to query.
		 * @returns {string} Returns the `toStringTag`.
		 */
		var getTag = baseGetTag;

		// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
		if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
		    (Map && getTag(new Map) != mapTag) ||
		    (Promise && getTag(Promise.resolve()) != promiseTag) ||
		    (Set && getTag(new Set) != setTag) ||
		    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
		  getTag = function(value) {
		    var result = baseGetTag(value),
		        Ctor = result == objectTag ? value.constructor : undefined,
		        ctorString = Ctor ? toSource(Ctor) : '';

		    if (ctorString) {
		      switch (ctorString) {
		        case dataViewCtorString: return dataViewTag;
		        case mapCtorString: return mapTag;
		        case promiseCtorString: return promiseTag;
		        case setCtorString: return setTag;
		        case weakMapCtorString: return weakMapTag;
		      }
		    }
		    return result;
		  };
		}

		/**
		 * Checks if `value` is a valid array-like index.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
		 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
		 */
		function isIndex(value, length) {
		  length = length == null ? MAX_SAFE_INTEGER : length;
		  return !!length &&
		    (typeof value == 'number' || reIsUint.test(value)) &&
		    (value > -1 && value % 1 == 0 && value < length);
		}

		/**
		 * Checks if `value` is suitable for use as unique object key.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
		 */
		function isKeyable(value) {
		  var type = typeof value;
		  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
		    ? (value !== '__proto__')
		    : (value === null);
		}

		/**
		 * Checks if `func` has its source masked.
		 *
		 * @private
		 * @param {Function} func The function to check.
		 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
		 */
		function isMasked(func) {
		  return !!maskSrcKey && (maskSrcKey in func);
		}

		/**
		 * Checks if `value` is likely a prototype object.
		 *
		 * @private
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
		 */
		function isPrototype(value) {
		  var Ctor = value && value.constructor,
		      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

		  return value === proto;
		}

		/**
		 * Converts `value` to a string using `Object.prototype.toString`.
		 *
		 * @private
		 * @param {*} value The value to convert.
		 * @returns {string} Returns the converted string.
		 */
		function objectToString(value) {
		  return nativeObjectToString.call(value);
		}

		/**
		 * Converts `func` to its source code.
		 *
		 * @private
		 * @param {Function} func The function to convert.
		 * @returns {string} Returns the source code.
		 */
		function toSource(func) {
		  if (func != null) {
		    try {
		      return funcToString.call(func);
		    } catch (e) {}
		    try {
		      return (func + '');
		    } catch (e) {}
		  }
		  return '';
		}

		/**
		 * Performs a
		 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
		 * comparison between two values to determine if they are equivalent.
		 *
		 * @static
		 * @memberOf _
		 * @since 4.0.0
		 * @category Lang
		 * @param {*} value The value to compare.
		 * @param {*} other The other value to compare.
		 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
		 * @example
		 *
		 * var object = { 'a': 1 };
		 * var other = { 'a': 1 };
		 *
		 * _.eq(object, object);
		 * // => true
		 *
		 * _.eq(object, other);
		 * // => false
		 *
		 * _.eq('a', 'a');
		 * // => true
		 *
		 * _.eq('a', Object('a'));
		 * // => false
		 *
		 * _.eq(NaN, NaN);
		 * // => true
		 */
		function eq(value, other) {
		  return value === other || (value !== value && other !== other);
		}

		/**
		 * Checks if `value` is likely an `arguments` object.
		 *
		 * @static
		 * @memberOf _
		 * @since 0.1.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
		 *  else `false`.
		 * @example
		 *
		 * _.isArguments(function() { return arguments; }());
		 * // => true
		 *
		 * _.isArguments([1, 2, 3]);
		 * // => false
		 */
		var isArguments = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
		  return isObjectLike(value) && hasOwnProperty.call(value, 'callee') &&
		    !propertyIsEnumerable.call(value, 'callee');
		};

		/**
		 * Checks if `value` is classified as an `Array` object.
		 *
		 * @static
		 * @memberOf _
		 * @since 0.1.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
		 * @example
		 *
		 * _.isArray([1, 2, 3]);
		 * // => true
		 *
		 * _.isArray(document.body.children);
		 * // => false
		 *
		 * _.isArray('abc');
		 * // => false
		 *
		 * _.isArray(_.noop);
		 * // => false
		 */
		var isArray = Array.isArray;

		/**
		 * Checks if `value` is array-like. A value is considered array-like if it's
		 * not a function and has a `value.length` that's an integer greater than or
		 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
		 *
		 * @static
		 * @memberOf _
		 * @since 4.0.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
		 * @example
		 *
		 * _.isArrayLike([1, 2, 3]);
		 * // => true
		 *
		 * _.isArrayLike(document.body.children);
		 * // => true
		 *
		 * _.isArrayLike('abc');
		 * // => true
		 *
		 * _.isArrayLike(_.noop);
		 * // => false
		 */
		function isArrayLike(value) {
		  return value != null && isLength(value.length) && !isFunction(value);
		}

		/**
		 * Checks if `value` is a buffer.
		 *
		 * @static
		 * @memberOf _
		 * @since 4.3.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
		 * @example
		 *
		 * _.isBuffer(new Buffer(2));
		 * // => true
		 *
		 * _.isBuffer(new Uint8Array(2));
		 * // => false
		 */
		var isBuffer = nativeIsBuffer || stubFalse;

		/**
		 * Performs a deep comparison between two values to determine if they are
		 * equivalent.
		 *
		 * **Note:** This method supports comparing arrays, array buffers, booleans,
		 * date objects, error objects, maps, numbers, `Object` objects, regexes,
		 * sets, strings, symbols, and typed arrays. `Object` objects are compared
		 * by their own, not inherited, enumerable properties. Functions and DOM
		 * nodes are compared by strict equality, i.e. `===`.
		 *
		 * @static
		 * @memberOf _
		 * @since 0.1.0
		 * @category Lang
		 * @param {*} value The value to compare.
		 * @param {*} other The other value to compare.
		 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
		 * @example
		 *
		 * var object = { 'a': 1 };
		 * var other = { 'a': 1 };
		 *
		 * _.isEqual(object, other);
		 * // => true
		 *
		 * object === other;
		 * // => false
		 */
		function isEqual(value, other) {
		  return baseIsEqual(value, other);
		}

		/**
		 * Checks if `value` is classified as a `Function` object.
		 *
		 * @static
		 * @memberOf _
		 * @since 0.1.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
		 * @example
		 *
		 * _.isFunction(_);
		 * // => true
		 *
		 * _.isFunction(/abc/);
		 * // => false
		 */
		function isFunction(value) {
		  if (!isObject(value)) {
		    return false;
		  }
		  // The use of `Object#toString` avoids issues with the `typeof` operator
		  // in Safari 9 which returns 'object' for typed arrays and other constructors.
		  var tag = baseGetTag(value);
		  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
		}

		/**
		 * Checks if `value` is a valid array-like length.
		 *
		 * **Note:** This method is loosely based on
		 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
		 *
		 * @static
		 * @memberOf _
		 * @since 4.0.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
		 * @example
		 *
		 * _.isLength(3);
		 * // => true
		 *
		 * _.isLength(Number.MIN_VALUE);
		 * // => false
		 *
		 * _.isLength(Infinity);
		 * // => false
		 *
		 * _.isLength('3');
		 * // => false
		 */
		function isLength(value) {
		  return typeof value == 'number' &&
		    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
		}

		/**
		 * Checks if `value` is the
		 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
		 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
		 *
		 * @static
		 * @memberOf _
		 * @since 0.1.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
		 * @example
		 *
		 * _.isObject({});
		 * // => true
		 *
		 * _.isObject([1, 2, 3]);
		 * // => true
		 *
		 * _.isObject(_.noop);
		 * // => true
		 *
		 * _.isObject(null);
		 * // => false
		 */
		function isObject(value) {
		  var type = typeof value;
		  return value != null && (type == 'object' || type == 'function');
		}

		/**
		 * Checks if `value` is object-like. A value is object-like if it's not `null`
		 * and has a `typeof` result of "object".
		 *
		 * @static
		 * @memberOf _
		 * @since 4.0.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
		 * @example
		 *
		 * _.isObjectLike({});
		 * // => true
		 *
		 * _.isObjectLike([1, 2, 3]);
		 * // => true
		 *
		 * _.isObjectLike(_.noop);
		 * // => false
		 *
		 * _.isObjectLike(null);
		 * // => false
		 */
		function isObjectLike(value) {
		  return value != null && typeof value == 'object';
		}

		/**
		 * Checks if `value` is classified as a typed array.
		 *
		 * @static
		 * @memberOf _
		 * @since 3.0.0
		 * @category Lang
		 * @param {*} value The value to check.
		 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
		 * @example
		 *
		 * _.isTypedArray(new Uint8Array);
		 * // => true
		 *
		 * _.isTypedArray([]);
		 * // => false
		 */
		var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

		/**
		 * Creates an array of the own enumerable property names of `object`.
		 *
		 * **Note:** Non-object values are coerced to objects. See the
		 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
		 * for more details.
		 *
		 * @static
		 * @since 0.1.0
		 * @memberOf _
		 * @category Object
		 * @param {Object} object The object to query.
		 * @returns {Array} Returns the array of property names.
		 * @example
		 *
		 * function Foo() {
		 *   this.a = 1;
		 *   this.b = 2;
		 * }
		 *
		 * Foo.prototype.c = 3;
		 *
		 * _.keys(new Foo);
		 * // => ['a', 'b'] (iteration order is not guaranteed)
		 *
		 * _.keys('hi');
		 * // => ['0', '1']
		 */
		function keys(object) {
		  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
		}

		/**
		 * This method returns a new empty array.
		 *
		 * @static
		 * @memberOf _
		 * @since 4.13.0
		 * @category Util
		 * @returns {Array} Returns the new empty array.
		 * @example
		 *
		 * var arrays = _.times(2, _.stubArray);
		 *
		 * console.log(arrays);
		 * // => [[], []]
		 *
		 * console.log(arrays[0] === arrays[1]);
		 * // => false
		 */
		function stubArray() {
		  return [];
		}

		/**
		 * This method returns `false`.
		 *
		 * @static
		 * @memberOf _
		 * @since 4.13.0
		 * @category Util
		 * @returns {boolean} Returns `false`.
		 * @example
		 *
		 * _.times(2, _.stubFalse);
		 * // => [false, false]
		 */
		function stubFalse() {
		  return false;
		}

		module.exports = isEqual; 
	} (lodash_isequal, lodash_isequal.exports));

	var lodash_isequalExports = lodash_isequal.exports;
	var isEqual = /*@__PURE__*/getDefaultExportFromCjs(lodash_isequalExports);

	function circleLayer(color, source, vectorLayer) {
	    const layer = {
	        id: [source, vectorLayer, 'circle'].join('_'),
	        source,
	        type: 'circle',
	        paint: {
	            'circle-color': color,
	            'circle-radius': 2
	        },
	        filter: ['==', '$type', 'Point']
	    };
	    if (vectorLayer) {
	        layer['source-layer'] = vectorLayer;
	    }
	    return layer;
	}
	function polygonLayer(color, _outlineColor, source, vectorLayer) {
	    const layer = {
	        id: [source, vectorLayer, 'polygon'].join('_'),
	        source,
	        type: 'fill',
	        paint: {
	            'fill-color': color,
	            'fill-antialias': true,
	            'fill-outline-color': color
	        },
	        filter: ['==', '$type', 'Polygon']
	    };
	    if (vectorLayer) {
	        layer['source-layer'] = vectorLayer;
	    }
	    return layer;
	}
	function lineLayer(color, source, vectorLayer) {
	    const layer = {
	        id: [source, vectorLayer, 'line'].join('_'),
	        source,
	        layout: {
	            'line-join': 'round',
	            'line-cap': 'round'
	        },
	        type: 'line',
	        paint: {
	            'line-color': color
	        },
	        filter: ['==', '$type', 'LineString']
	    };
	    if (vectorLayer) {
	        layer['source-layer'] = vectorLayer;
	    }
	    return layer;
	}
	/**
	 * Generate colored layer styles for the given sources
	 * @param sources dictionary containing the vector layer IDs
	 * @param Function to generate a color for a layer
	 * @return Array of Maplibre GL layers
	 */
	function generateColoredLayers(sources, assignLayerColor) {
	    const polyLayers = [];
	    const circleLayers = [];
	    const lineLayers = [];
	    function alphaColors(layerId) {
	        const obj = {
	            circle: assignLayerColor(layerId, 0.8),
	            line: assignLayerColor(layerId, 0.6),
	            polygon: assignLayerColor(layerId, 0.3),
	            polygonOutline: assignLayerColor(layerId, 0.6),
	            default: assignLayerColor(layerId, 1)
	        };
	        return obj;
	    }
	    Object.keys(sources).forEach((sourceId) => {
	        const layers = sources[sourceId];
	        if (!layers || layers.length === 0) {
	            const colors = alphaColors(sourceId);
	            circleLayers.push(circleLayer(colors.circle, sourceId));
	            lineLayers.push(lineLayer(colors.line, sourceId));
	            polyLayers.push(polygonLayer(colors.polygon, colors.polygonOutline, sourceId));
	        }
	        else {
	            layers.forEach((layerId) => {
	                const colors = alphaColors(layerId);
	                circleLayers.push(circleLayer(colors.circle, sourceId, layerId));
	                lineLayers.push(lineLayer(colors.line, sourceId, layerId));
	                polyLayers.push(polygonLayer(colors.polygon, colors.polygonOutline, sourceId, layerId));
	            });
	        }
	    });
	    return polyLayers.concat(lineLayers).concat(circleLayers);
	}
	/**
	 * Create inspection style out of the original style and the new colored layers
	 * @param originalMapStyle - map style
	 * @param coloredLayers - array of colored Maplibre GL layers
	 * @param opts - options
	 * @return {Object} Colored inspect style
	 */
	function generateInspectStyle(originalMapStyle, coloredLayers, opts) {
	    opts = Object.assign({
	        backgroundColor: '#fff'
	    }, opts);
	    const backgroundLayer = {
	        'id': 'background',
	        'type': 'background',
	        'paint': {
	            'background-color': opts.backgroundColor
	        }
	    };
	    const sources = {};
	    Object.keys(originalMapStyle.sources).forEach((sourceId) => {
	        const source = originalMapStyle.sources[sourceId];
	        if (source.type === 'vector' || source.type === 'geojson') {
	            sources[sourceId] = source;
	        }
	    });
	    return Object.assign(originalMapStyle, {
	        layers: [backgroundLayer].concat(coloredLayers),
	        sources
	    });
	}
	var stylegen = {
	    polygonLayer,
	    lineLayer,
	    circleLayer,
	    generateInspectStyle,
	    generateColoredLayers
	};

	/**
	 * A button to toggle the inspect mode
	 */
	class InspectButton {
	    constructor(options) {
	        options = Object.assign({
	            show: true,
	            onToggle() { }
	        }, options);
	        this._btn = this.createButton();
	        this._btn.onclick = options.onToggle;
	        this.elem = this.createContainer(this._btn, options.show);
	    }
	    createButton() {
	        const btn = document.createElement('button');
	        btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-inspect';
	        btn.type = 'button';
	        btn.setAttribute('aria-label', 'Inspect');
	        return btn;
	    }
	    createContainer(child, show) {
	        const container = document.createElement('div');
	        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
	        container.appendChild(child);
	        if (!show) {
	            container.style.display = 'none';
	        }
	        return container;
	    }
	    setInspectIcon() {
	        this._btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-inspect';
	    }
	    setMapIcon() {
	        this._btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-map';
	    }
	}

	function displayValue(value) {
	    if (typeof value === 'undefined' || value === null)
	        return value;
	    if (value instanceof Date)
	        return value.toLocaleString();
	    if (typeof value === 'object' ||
	        typeof value === 'number' ||
	        typeof value === 'string')
	        return value.toString();
	    return value;
	}
	function renderProperty(propertyName, property) {
	    return `${'<div class="maplibregl-inspect_property">' +
        '<div class="maplibregl-inspect_property-name">'}${propertyName}</div>` +
	        `<div class="maplibregl-inspect_property-value">${displayValue(property)}</div>` +
	        '</div>';
	}
	function renderLayer(layerId) {
	    return `<div class="maplibregl-inspect_layer">${layerId}</div>`;
	}
	function renderProperties(feature) {
	    const sourceProperty = renderLayer(feature.layer['source-layer'] || feature.layer.source);
	    const idProperty = renderProperty('$id', feature.id);
	    const typeProperty = renderProperty('$type', feature.geometry.type);
	    const properties = Object.keys(feature.properties).map(propertyName => renderProperty(propertyName, feature.properties[propertyName]));
	    return [sourceProperty, idProperty, typeProperty].concat(properties).join('');
	}
	function renderFeatures(features) {
	    return features.map(ft => `<div class="maplibregl-inspect_feature">${renderProperties(ft)}</div>`).join('');
	}
	function renderPopup(features) {
	    return `<div class="maplibregl-inspect_popup">${renderFeatures(features)}</div>`;
	}

	var randomColor$1 = {exports: {}};

	(function (module, exports) {
	(function(root, factory) {

		  // Support CommonJS
		  {
		    var randomColor = factory();

		    // Support NodeJS & Component, which allow module.exports to be a function
		    if (module && module.exports) {
		      exports = module.exports = randomColor;
		    }

		    // Support CommonJS 1.1.1 spec
		    exports.randomColor = randomColor;

		  // Support AMD
		  }

		}(commonjsGlobal, function() {

		  // Seed to get repeatable colors
		  var seed = null;

		  // Shared color dictionary
		  var colorDictionary = {};

		  // Populate the color dictionary
		  loadColorBounds();

		  // check if a range is taken
		  var colorRanges = [];

		  var randomColor = function (options) {

		    options = options || {};

		    // Check if there is a seed and ensure it's an
		    // integer. Otherwise, reset the seed value.
		    if (options.seed !== undefined && options.seed !== null && options.seed === parseInt(options.seed, 10)) {
		      seed = options.seed;

		    // A string was passed as a seed
		    } else if (typeof options.seed === 'string') {
		      seed = stringToInteger(options.seed);

		    // Something was passed as a seed but it wasn't an integer or string
		    } else if (options.seed !== undefined && options.seed !== null) {
		      throw new TypeError('The seed value must be an integer or string');

		    // No seed, reset the value outside.
		    } else {
		      seed = null;
		    }

		    var H,S,B;

		    // Check if we need to generate multiple colors
		    if (options.count !== null && options.count !== undefined) {

		      var totalColors = options.count,
		          colors = [];
		      // Value false at index i means the range i is not taken yet.
		      for (var i = 0; i < options.count; i++) {
		        colorRanges.push(false);
		        }
		      options.count = null;

		      while (totalColors > colors.length) {

		        var color = randomColor(options);

		        if (seed !== null) {
		          options.seed = seed;
		        }

		        colors.push(color);
		      }

		      options.count = totalColors;

		      return colors;
		    }

		    // First we pick a hue (H)
		    H = pickHue(options);

		    // Then use H to determine saturation (S)
		    S = pickSaturation(H, options);

		    // Then use S and H to determine brightness (B).
		    B = pickBrightness(H, S, options);

		    // Then we return the HSB color in the desired format
		    return setFormat([H,S,B], options);
		  };

		  function pickHue(options) {
		    if (colorRanges.length > 0) {
		      var hueRange = getRealHueRange(options.hue);

		      var hue = randomWithin(hueRange);

		      //Each of colorRanges.length ranges has a length equal approximatelly one step
		      var step = (hueRange[1] - hueRange[0]) / colorRanges.length;

		      var j = parseInt((hue - hueRange[0]) / step);

		      //Check if the range j is taken
		      if (colorRanges[j] === true) {
		        j = (j + 2) % colorRanges.length;
		      }
		      else {
		        colorRanges[j] = true;
		           }

		      var min = (hueRange[0] + j * step) % 359,
		          max = (hueRange[0] + (j + 1) * step) % 359;

		      hueRange = [min, max];

		      hue = randomWithin(hueRange);

		      if (hue < 0) {hue = 360 + hue;}
		      return hue
		    }
		    else {
		      var hueRange = getHueRange(options.hue);

		      hue = randomWithin(hueRange);
		      // Instead of storing red as two seperate ranges,
		      // we group them, using negative numbers
		      if (hue < 0) {
		        hue = 360 + hue;
		      }

		      return hue;
		    }
		  }

		  function pickSaturation (hue, options) {

		    if (options.hue === 'monochrome') {
		      return 0;
		    }

		    if (options.luminosity === 'random') {
		      return randomWithin([0,100]);
		    }

		    var saturationRange = getSaturationRange(hue);

		    var sMin = saturationRange[0],
		        sMax = saturationRange[1];

		    switch (options.luminosity) {

		      case 'bright':
		        sMin = 55;
		        break;

		      case 'dark':
		        sMin = sMax - 10;
		        break;

		      case 'light':
		        sMax = 55;
		        break;
		   }

		    return randomWithin([sMin, sMax]);

		  }

		  function pickBrightness (H, S, options) {

		    var bMin = getMinimumBrightness(H, S),
		        bMax = 100;

		    switch (options.luminosity) {

		      case 'dark':
		        bMax = bMin + 20;
		        break;

		      case 'light':
		        bMin = (bMax + bMin)/2;
		        break;

		      case 'random':
		        bMin = 0;
		        bMax = 100;
		        break;
		    }

		    return randomWithin([bMin, bMax]);
		  }

		  function setFormat (hsv, options) {

		    switch (options.format) {

		      case 'hsvArray':
		        return hsv;

		      case 'hslArray':
		        return HSVtoHSL(hsv);

		      case 'hsl':
		        var hsl = HSVtoHSL(hsv);
		        return 'hsl('+hsl[0]+', '+hsl[1]+'%, '+hsl[2]+'%)';

		      case 'hsla':
		        var hslColor = HSVtoHSL(hsv);
		        var alpha = options.alpha || Math.random();
		        return 'hsla('+hslColor[0]+', '+hslColor[1]+'%, '+hslColor[2]+'%, ' + alpha + ')';

		      case 'rgbArray':
		        return HSVtoRGB(hsv);

		      case 'rgb':
		        var rgb = HSVtoRGB(hsv);
		        return 'rgb(' + rgb.join(', ') + ')';

		      case 'rgba':
		        var rgbColor = HSVtoRGB(hsv);
		        var alpha = options.alpha || Math.random();
		        return 'rgba(' + rgbColor.join(', ') + ', ' + alpha + ')';

		      default:
		        return HSVtoHex(hsv);
		    }

		  }

		  function getMinimumBrightness(H, S) {

		    var lowerBounds = getColorInfo(H).lowerBounds;

		    for (var i = 0; i < lowerBounds.length - 1; i++) {

		      var s1 = lowerBounds[i][0],
		          v1 = lowerBounds[i][1];

		      var s2 = lowerBounds[i+1][0],
		          v2 = lowerBounds[i+1][1];

		      if (S >= s1 && S <= s2) {

		         var m = (v2 - v1)/(s2 - s1),
		             b = v1 - m*s1;

		         return m*S + b;
		      }

		    }

		    return 0;
		  }

		  function getHueRange (colorInput) {

		    if (typeof parseInt(colorInput) === 'number') {

		      var number = parseInt(colorInput);

		      if (number < 360 && number > 0) {
		        return [number, number];
		      }

		    }

		    if (typeof colorInput === 'string') {

		      if (colorDictionary[colorInput]) {
		        var color = colorDictionary[colorInput];
		        if (color.hueRange) {return color.hueRange;}
		      } else if (colorInput.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)) {
		        var hue = HexToHSB(colorInput)[0];
		        return [ hue, hue ];
		      }
		    }

		    return [0,360];

		  }

		  function getSaturationRange (hue) {
		    return getColorInfo(hue).saturationRange;
		  }

		  function getColorInfo (hue) {

		    // Maps red colors to make picking hue easier
		    if (hue >= 334 && hue <= 360) {
		      hue-= 360;
		    }

		    for (var colorName in colorDictionary) {
		       var color = colorDictionary[colorName];
		       if (color.hueRange &&
		           hue >= color.hueRange[0] &&
		           hue <= color.hueRange[1]) {
		          return colorDictionary[colorName];
		       }
		    } return 'Color not found';
		  }

		  function randomWithin (range) {
		    if (seed === null) {
		      //generate random evenly destinct number from : https://martin.ankerl.com/2009/12/09/how-to-create-random-colors-programmatically/
		      var golden_ratio = 0.618033988749895;
		      var r=Math.random();
		      r += golden_ratio;
		      r %= 1;
		      return Math.floor(range[0] + r*(range[1] + 1 - range[0]));
		    } else {
		      //Seeded random algorithm from http://indiegamr.com/generate-repeatable-random-numbers-in-js/
		      var max = range[1] || 1;
		      var min = range[0] || 0;
		      seed = (seed * 9301 + 49297) % 233280;
		      var rnd = seed / 233280.0;
		      return Math.floor(min + rnd * (max - min));
		}
		  }

		  function HSVtoHex (hsv){

		    var rgb = HSVtoRGB(hsv);

		    function componentToHex(c) {
		        var hex = c.toString(16);
		        return hex.length == 1 ? '0' + hex : hex;
		    }

		    var hex = '#' + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);

		    return hex;

		  }

		  function defineColor (name, hueRange, lowerBounds) {

		    var sMin = lowerBounds[0][0],
		        sMax = lowerBounds[lowerBounds.length - 1][0],

		        bMin = lowerBounds[lowerBounds.length - 1][1],
		        bMax = lowerBounds[0][1];

		    colorDictionary[name] = {
		      hueRange: hueRange,
		      lowerBounds: lowerBounds,
		      saturationRange: [sMin, sMax],
		      brightnessRange: [bMin, bMax]
		    };

		  }

		  function loadColorBounds () {

		    defineColor(
		      'monochrome',
		      null,
		      [[0,0],[100,0]]
		    );

		    defineColor(
		      'red',
		      [-26,18],
		      [[20,100],[30,92],[40,89],[50,85],[60,78],[70,70],[80,60],[90,55],[100,50]]
		    );

		    defineColor(
		      'orange',
		      [18,46],
		      [[20,100],[30,93],[40,88],[50,86],[60,85],[70,70],[100,70]]
		    );

		    defineColor(
		      'yellow',
		      [46,62],
		      [[25,100],[40,94],[50,89],[60,86],[70,84],[80,82],[90,80],[100,75]]
		    );

		    defineColor(
		      'green',
		      [62,178],
		      [[30,100],[40,90],[50,85],[60,81],[70,74],[80,64],[90,50],[100,40]]
		    );

		    defineColor(
		      'blue',
		      [178, 257],
		      [[20,100],[30,86],[40,80],[50,74],[60,60],[70,52],[80,44],[90,39],[100,35]]
		    );

		    defineColor(
		      'purple',
		      [257, 282],
		      [[20,100],[30,87],[40,79],[50,70],[60,65],[70,59],[80,52],[90,45],[100,42]]
		    );

		    defineColor(
		      'pink',
		      [282, 334],
		      [[20,100],[30,90],[40,86],[60,84],[80,80],[90,75],[100,73]]
		    );

		  }

		  function HSVtoRGB (hsv) {

		    // this doesn't work for the values of 0 and 360
		    // here's the hacky fix
		    var h = hsv[0];
		    if (h === 0) {h = 1;}
		    if (h === 360) {h = 359;}

		    // Rebase the h,s,v values
		    h = h/360;
		    var s = hsv[1]/100,
		        v = hsv[2]/100;

		    var h_i = Math.floor(h*6),
		      f = h * 6 - h_i,
		      p = v * (1 - s),
		      q = v * (1 - f*s),
		      t = v * (1 - (1 - f)*s),
		      r = 256,
		      g = 256,
		      b = 256;

		    switch(h_i) {
		      case 0: r = v; g = t; b = p;  break;
		      case 1: r = q; g = v; b = p;  break;
		      case 2: r = p; g = v; b = t;  break;
		      case 3: r = p; g = q; b = v;  break;
		      case 4: r = t; g = p; b = v;  break;
		      case 5: r = v; g = p; b = q;  break;
		    }

		    var result = [Math.floor(r*255), Math.floor(g*255), Math.floor(b*255)];
		    return result;
		  }

		  function HexToHSB (hex) {
		    hex = hex.replace(/^#/, '');
		    hex = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;

		    var red = parseInt(hex.substr(0, 2), 16) / 255,
		          green = parseInt(hex.substr(2, 2), 16) / 255,
		          blue = parseInt(hex.substr(4, 2), 16) / 255;

		    var cMax = Math.max(red, green, blue),
		          delta = cMax - Math.min(red, green, blue),
		          saturation = cMax ? (delta / cMax) : 0;

		    switch (cMax) {
		      case red: return [ 60 * (((green - blue) / delta) % 6) || 0, saturation, cMax ];
		      case green: return [ 60 * (((blue - red) / delta) + 2) || 0, saturation, cMax ];
		      case blue: return [ 60 * (((red - green) / delta) + 4) || 0, saturation, cMax ];
		    }
		  }

		  function HSVtoHSL (hsv) {
		    var h = hsv[0],
		      s = hsv[1]/100,
		      v = hsv[2]/100,
		      k = (2-s)*v;

		    return [
		      h,
		      Math.round(s*v / (k<1 ? k : 2-k) * 10000) / 100,
		      k/2 * 100
		    ];
		  }

		  function stringToInteger (string) {
		    var total = 0;
		    for (var i = 0; i !== string.length; i++) {
		      if (total >= Number.MAX_SAFE_INTEGER) break;
		      total += string.charCodeAt(i);
		    }
		    return total
		  }

		  // get The range of given hue when options.count!=0
		  function getRealHueRange(colorHue)
		  { if (!isNaN(colorHue)) {
		    var number = parseInt(colorHue);

		    if (number < 360 && number > 0) {
		      return getColorInfo(colorHue).hueRange
		    }
		  }
		    else if (typeof colorHue === 'string') {

		      if (colorDictionary[colorHue]) {
		        var color = colorDictionary[colorHue];

		        if (color.hueRange) {
		          return color.hueRange
		       }
		    } else if (colorHue.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)) {
		        var hue = HexToHSB(colorHue)[0];
		        return getColorInfo(hue).hueRange
		    }
		  }

		    return [0,360]
		}
		  return randomColor;
		})); 
	} (randomColor$1, randomColor$1.exports));

	var randomColorExports = randomColor$1.exports;
	var randomColor = /*@__PURE__*/getDefaultExportFromCjs(randomColorExports);

	/**
	 * Assign a color to a unique layer ID and also considering
	 * common layer names such as water or wood.
	 * @param layerId - a layer ID
	 * @param alpha - alpha value for the color, default is 1
	 * @return a color in rgba string format
	 */
	function brightColor(layerId, alpha) {
	    let luminosity = 'bright';
	    let hue = undefined;
	    if (/water|ocean|lake|sea|river/.test(layerId)) {
	        hue = 'blue';
	    }
	    if (/state|country|place/.test(layerId)) {
	        hue = 'pink';
	    }
	    if (/road|highway|transport|streets/.test(layerId)) {
	        hue = 'orange';
	    }
	    if (/contour|building|earth/.test(layerId)) {
	        hue = 'monochrome';
	    }
	    if (/building/.test(layerId)) {
	        luminosity = 'dark';
	    }
	    if (/earth/.test(layerId)) {
	        luminosity = 'light';
	    }
	    if (/contour|landuse/.test(layerId)) {
	        hue = 'yellow';
	    }
	    if (/wood|forest|park|landcover|land|natural/.test(layerId)) {
	        hue = 'green';
	    }
	    const rgb = randomColor({
	        luminosity,
	        hue,
	        seed: layerId,
	        format: 'rgbArray'
	    });
	    return `rgba(${rgb.join(', ')}, ${alpha || "1"})`;
	}
	var colors = { brightColor };

	function isInspectStyle(style) {
	    return style.metadata && style.metadata['maplibregl-inspect:inspect'];
	}
	function markInspectStyle(style) {
	    return Object.assign(style, {
	        metadata: Object.assign({}, style.metadata, {
	            'maplibregl-inspect:inspect': true
	        })
	    });
	}
	/**
	 * Maplibre Inspect Control
	 */
	class MaplibreInspect {
	    constructor(options) {
	        this._onSourceChange = (e) => {
	            if (e.sourceDataType === 'visibility' || !e.isSourceLoaded) {
	                return;
	            }
	            const previousSources = Object.assign({}, this.sources);
	            this._setSourcesFromMap();
	            if (!isEqual(previousSources, this.sources) && Object.keys(this.sources).length > 0) {
	                // If the sources have changed, we need to re-render the inspect style but not too fast
	                setTimeout(() => this.render(), 1000);
	            }
	        };
	        this._onStyleChange = () => {
	            const style = this._map.getStyle();
	            if (!isInspectStyle(style)) {
	                this._originalStyle = style;
	            }
	        };
	        this._onRightClick = () => {
	            if (!this.options.showMapPopupOnHover && !this.options.showInspectMapPopupOnHover && !this.options.blockHoverPopupOnClick) {
	                if (this._popup)
	                    this._popup.remove();
	            }
	        };
	        this._onMousemove = (e) => {
	            if (this._showInspectMap) {
	                if (!this.options.showInspectMapPopup)
	                    return;
	                if (e.type === 'mousemove' && !this.options.showInspectMapPopupOnHover)
	                    return;
	                if (e.type === 'click' && this.options.showInspectMapPopupOnHover && this.options.blockHoverPopupOnClick) {
	                    this._popupBlocked = !this._popupBlocked;
	                }
	            }
	            else {
	                if (!this.options.showMapPopup)
	                    return;
	                if (e.type === 'mousemove' && !this.options.showMapPopupOnHover)
	                    return;
	                if (e.type === 'click' && this.options.showMapPopupOnHover && this.options.blockHoverPopupOnClick) {
	                    this._popupBlocked = !this._popupBlocked;
	                }
	            }
	            if (!this._popupBlocked && this._popup) {
	                let queryBox;
	                if (this.options.selectThreshold === 0) {
	                    queryBox = e.point;
	                }
	                else {
	                    // set a bbox around the pointer
	                    queryBox = [
	                        [
	                            e.point.x - this.options.selectThreshold,
	                            e.point.y + this.options.selectThreshold
	                        ], // bottom left (SW)
	                        [
	                            e.point.x + this.options.selectThreshold,
	                            e.point.y - this.options.selectThreshold
	                        ] // top right (NE)
	                    ];
	                }
	                const features = this._map.queryRenderedFeatures(queryBox, this.options.queryParameters) || [];
	                this._map.getCanvas().style.cursor = (features.length) ? 'pointer' : '';
	                if (!features.length) {
	                    this._popup.remove();
	                }
	                else {
	                    this._popup.setLngLat(e.lngLat);
	                    const renderedPopup = this.options.renderPopup(features);
	                    if (typeof renderedPopup === 'string') {
	                        this._popup.setHTML(renderedPopup);
	                    }
	                    else {
	                        this._popup.setDOMContent(renderedPopup);
	                    }
	                    this._popup.addTo(this._map);
	                }
	            }
	        };
	        if (!(this instanceof MaplibreInspect)) {
	            throw new Error('MaplibreInspect needs to be called with the new keyword');
	        }
	        let popup = null;
	        if (window.maplibregl) {
	            popup = new window.maplibregl.Popup({
	                closeButton: false,
	                closeOnClick: false
	            });
	        }
	        else if (!options.popup) {
	            console.error('Maplibre GL JS can not be found. Make sure to include it or pass an initialized MaplibreGL Popup to MaplibreInspect if you are using moduleis.');
	        }
	        this.options = Object.assign({
	            showInspectMap: false,
	            showInspectButton: true,
	            showInspectMapPopup: true,
	            showMapPopup: false,
	            showMapPopupOnHover: true,
	            showInspectMapPopupOnHover: true,
	            blockHoverPopupOnClick: false,
	            backgroundColor: '#fff',
	            assignLayerColor: colors.brightColor,
	            buildInspectStyle: stylegen.generateInspectStyle,
	            renderPopup,
	            popup,
	            selectThreshold: 5,
	            useInspectStyle: true,
	            queryParameters: {},
	            sources: {},
	            toggleCallback() { },
	            manageStyleOutside: false
	        }, options);
	        this.sources = this.options.sources;
	        this.assignLayerColor = this.options.assignLayerColor;
	        this._popup = this.options.popup;
	        this._popupBlocked = false;
	        this._showInspectMap = this.options.showInspectMap;
	        this._toggle = new InspectButton({
	            show: this.options.showInspectButton,
	            onToggle: () => this.toggleInspector()
	        });
	    }
	    toggleInspector() {
	        this._showInspectMap = !this._showInspectMap;
	        this._popupBlocked = false;
	        this.options.toggleCallback(this._showInspectMap);
	        this.render();
	    }
	    _inspectStyle() {
	        const coloredLayers = stylegen.generateColoredLayers(this.sources, this.assignLayerColor);
	        return this.options.buildInspectStyle(this._map.getStyle(), coloredLayers, {
	            backgroundColor: this.options.backgroundColor
	        });
	    }
	    render() {
	        if (this._showInspectMap) {
	            if (this.options.useInspectStyle) {
	                this._map.setStyle(markInspectStyle(this._inspectStyle()));
	            }
	            this._toggle.setMapIcon();
	        }
	        else if (this._originalStyle) {
	            if (this._popup)
	                this._popup.remove();
	            if (this.options.useInspectStyle) {
	                this._map.setStyle(this._originalStyle);
	            }
	            this._toggle.setInspectIcon();
	        }
	    }
	    _setSourcesFromMap() {
	        //NOTE: This heavily depends on the internal API of Maplibre GL
	        //so this breaks between Maplibre GL JS releases
	        const mapStyleSourcesNames = Object.keys(this._map.getStyle().sources);
	        Object.keys(this._map.style.sourceCaches).forEach((sourceId) => {
	            const sourceCache = this._map.style.sourceCaches[sourceId] || { _source: {} };
	            const layerIds = sourceCache._source.vectorLayerIds;
	            if (layerIds) {
	                this.sources[sourceId] = layerIds;
	            }
	            else if (sourceCache._source.type === 'geojson') {
	                this.sources[sourceId] = [];
	            }
	        });
	        Object.keys(this.sources).forEach((sourceId) => {
	            if (mapStyleSourcesNames.indexOf(sourceId) === -1) {
	                delete this.sources[sourceId];
	            }
	        });
	    }
	    /**
	     * This will set the original style of the map
	     * It will also update the sources assuming the map has already been loaded
	     * @param style - The original style
	     */
	    setOriginalStyle(style) {
	        this._originalStyle = style;
	        this._setSourcesFromMap();
	    }
	    onAdd(map) {
	        this._map = map;
	        // if sources have already been passed as options
	        // we do not need to figure out the sources ourselves
	        if (Object.keys(this.sources).length === 0) {
	            map.on('tiledata', this._onSourceChange);
	            map.on('sourcedata', this._onSourceChange);
	        }
	        map.on('styledata', this._onStyleChange);
	        map.on('load', this._onStyleChange);
	        map.on('mousemove', this._onMousemove);
	        map.on('click', this._onMousemove);
	        map.on('contextmenu', this._onRightClick);
	        return this._toggle.elem;
	    }
	    onRemove() {
	        this._map.off('styledata', this._onStyleChange);
	        this._map.off('load', this._onStyleChange);
	        this._map.off('tiledata', this._onSourceChange);
	        this._map.off('sourcedata', this._onSourceChange);
	        this._map.off('mousemove', this._onMousemove);
	        this._map.off('click', this._onMousemove);
	        this._map.off('contextmenu', this._onRightClick);
	        const elem = this._toggle.elem;
	        elem.parentNode.removeChild(elem);
	        this._map = undefined;
	    }
	}

	return MaplibreInspect;

}));
//# sourceMappingURL=maplibre-gl-inspect.js.map
