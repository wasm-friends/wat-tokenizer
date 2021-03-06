var assert = require('nanoassert')

var DICT = {
  LIST_START: 40,
  LIST_END: 41,
  QUOTE: 34,
  ESCAPE: 92,
  SEMI_COLON: 59,
  LF: 10,
  TAB: 9,
  SPACE: 32
}

module.exports = function tokenizer (prealloc) {
  if (prealloc == null) prealloc = 2048

  assert(typeof prealloc === 'number', 'prealloc must be Number')
  assert(prealloc >= 128, 'prealloc must be at least 128')
  assert(Number.isSafeInteger(prealloc), 'prealloc must be safe integer')

  // Root / top S-expression. A program can have multiple top-level S-Expressions
  var top = []
  // Our passing stack. Exploiting the fact that arrays are passed by reference
  var stack = [top]

  // Node reference as we always will be working with the last element in the
  // stack, and pop successively as we close S-Expressions. Again, reference
  // because array
  var node = stack[stack.length - 1]

  // State variables
  var insideString = false
  var insideWhitespace = false
  var insideLineComment = false

  // Source positions. Added to each token and list
  var line = 1
  var col = 1
  // Updated each time we encounter a new elm. Required since we create a new
  // string object at the bondary between each token
  var startLine = line
  var startCol = col

  // Buffer to contain the current token
  var token = Buffer.alloc(prealloc)
  // Counter used to slice the token buffer to the number of bytes written
  var tptr = 0

  var self = {final: final, update: update}

  return self

  function final (unsafe) {
    // Flush any trailing whitespace
    if (insideWhitespace || insideLineComment) addtoken()

    if (unsafe !== false) {
      assert(stack.length === 1, 'Unfinished S-expression, col: ' + startCol + ', line: ' + startLine)
      var str = token.slice(0, tptr).toString().replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\0/g, '\\u{0000}')
      assert(insideString === false, 'Unfinished string: `' + str + '`, col: ' + startCol + ', line: ' + startLine)
      assert(tptr === 0, 'Unfinished token: `' + str + '`, col: ' + startCol + ', line: ' + startLine)
    }

    return top
  }

  function update (source) {
    assert(Buffer.isBuffer(source), 'source must be Buffer')

    for (var i = 0; i < source.length; i++, col++) {
      switch (source[i]) {
        case DICT.LF:
          if (insideLineComment) addtoken()

        case DICT.TAB:
        case DICT.SPACE:
          if (!insideWhitespace && !insideString && !insideLineComment) {
            addtoken()
            insideWhitespace = true
          }

          if (source[i] === DICT.LF) {
            line++
            col = 0
          }

          break
        case DICT.SEMI_COLON:
          if (!insideLineComment && token[tptr - 1] === DICT.SEMI_COLON) {
            tptr-- // "ignore" the semi colon in the token buffer
            addtoken()
            startCol--
            token[tptr++] = DICT.SEMI_COLON // re-add the semi colon to the buffer
            insideLineComment = true
          }
          break

        case DICT.QUOTE:
          if (!insideString && !insideLineComment) {
            addtoken()
            insideString = true
            token[tptr++] = source[i] // include the initial quote
            continue // continue loop
          }

          if (insideString && token[tptr - 1] !== DICT.ESCAPE) {
            token[tptr++] = source[i] // include the final quote
            addtoken()
            continue // continue loop
          }
          break

        case DICT.LIST_START:
          if (!insideString && !insideLineComment) {
            addtoken()
            pushlist()
            continue // continue loop
          }
          break

        case DICT.LIST_END:
          if (!insideString && !insideLineComment) {
            addtoken()
            poplist()
            continue // continue loop
          }
          break

        default:
          if (!insideString && !insideLineComment && insideWhitespace) {
            addtoken()
          }

          break
      }

      // Always append token unless continue from above statements
      token[tptr++] = source[i]
    }

    return self
  }

  function pushlist () {
    var elm = []
    elm.col = startCol
    elm.line = startLine

    startCol = col + 1
    startLine = line

    stack.push(elm)
    node.push(elm)
    node = elm
  }

  function poplist () {
    stack.pop()

    startCol = col + 1
    startLine = line

    node = stack[stack.length - 1]
  }

  function addtoken () {
    insideString = false
    insideWhitespace = false
    insideLineComment = false

    // guard against empty tokens
    if (tptr === 0) return

    var t = new String(token.slice(0, tptr).toString())
    t.col = startCol
    t.line = startLine
    node.push(t)
    tptr = 0

    startCol = col
    startLine = line
  }
}
