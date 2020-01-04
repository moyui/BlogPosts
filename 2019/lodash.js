export default function get(object, path, defaultValue) {
    const result = object == null ? undefined : baseGet(object, path)
    return result === undefined ? defaultValue : result
}

function baseGet(object, path) {
    path = castPath(path, object)

    let index = 0
    const length = path.length

    while (object != null && index < length) {
        object = object[toKey(path[index++])]
    }
    return (index && index == length) ? object : undefined
}

function castPath(value, object) {
    if (Array.isArray(value)) {
        return value
    }
    return [];
}

const INFINITY = 1 / 0

function toKey(value) {
    if (typeof value === 'string') {
        return value
    }
    const result = `${value}`
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result
}
