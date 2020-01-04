
/**
 * Expose `Delegator`.
 */

module.exports = Delegator;

/**
 * Initialize a delegator.
 *
 * @param {Object} proto
 * @param {String} target
 * @api public
 */

function Delegator(proto, target) {
    // 如果非实例化的对象就调用构造函数
    if (!(this instanceof Delegator)) return new Delegator(proto, target);
    this.proto = proto;
    this.target = target;
    this.methods = [];
    this.getters = [];
    this.setters = [];
    this.fluents = [];
}

/**
 * Automatically delegate properties
 * from a target prototype
 *
 * @param {Object} proto
 * @param {object} targetProto
 * @param {String} targetProp
 * @api public
 */

Delegator.auto = function (proto, targetProto, targetProp) {
    var delegator = Delegator(proto, targetProp);
    // 获取委托属性
    var properties = Object.getOwnPropertyNames(targetProto);
    for (var i = 0; i < properties.length; i++) {
        var property = properties[i];
        // 获取targetProto对应属性上的descriptor
        var descriptor = Object.getOwnPropertyDescriptor(targetProto, property);
        if (descriptor.get) {
            delegator.getter(property);
        }
        if (descriptor.set) {
            delegator.setter(property);
        }
        // 这里判断是否具有property，并判断函数是普通值还是函数
        if (descriptor.hasOwnProperty('value')) { // could be undefined but writable
            var value = descriptor.value;
            if (value instanceof Function) {
                delegator.method(property);
            } else {
                delegator.getter(property);
            }
            if (descriptor.writable) {
                delegator.setter(property);
            }
        }
    }
};

/**
 * Delegate method `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

Delegator.prototype.method = function (name) {
    var proto = this.proto;
    var target = this.target;
    this.methods.push(name);

    proto[name] = function () {
        return this[target][name].apply(this[target], arguments);
    };

    return this;
};

/**
 * Delegator accessor `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

Delegator.prototype.access = function (name) {
    // 链式调用，同时调用getter和setter
    return this.getter(name).setter(name);
};

/**
 * Delegator getter `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

Delegator.prototype.getter = function (name) {
    var proto = this.proto;
    var target = this.target;
    this.getters.push(name);

    // 里面的this指向proto本身，所以this[target][name] === proto[target][name]
    proto.__defineGetter__(name, function () {
        return this[target][name];
    });

    return this;
};

/**
 * Delegator setter `name`.
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */

Delegator.prototype.setter = function (name) {
    var proto = this.proto;
    var target = this.target;
    this.setters.push(name);
    // 同getter
    proto.__defineSetter__(name, function (val) {
        return this[target][name] = val;
    });

    return this;
};

/**
 * Delegator fluent accessor
 *
 * @param {String} name
 * @return {Delegator} self
 * @api public
 */
// 自动判断是getter还是setter
Delegator.prototype.fluent = function (name) {
    var proto = this.proto;
    var target = this.target;
    this.fluents.push(name);

    proto[name] = function (val) {
        if ('undefined' != typeof val) {
            this[target][name] = val;
            return this;
        } else {
            return this[target][name];
        }
    };

    return this;
};

bug: 1.传入要委托的对象是Object.freeze
     2. auto方法中传入的是一个function会走到最后一步delegator.setter(property);