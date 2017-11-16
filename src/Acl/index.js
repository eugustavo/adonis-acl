'use strict'

/**
 * adonis-acl
 * Copyright(c) 2017 Evgeny Razumov
 * MIT Licensed
 */

const InvalidExpression = require('../Exceptions/InvalidExpression')

const Acl = exports = module.exports = {}

const operators = {
  or: {
    precedence: 1,
    func: async (a, b, toBool) => {
      a = await toBool(a)
      b = await toBool(b)
      return a || b
    }
  },
  and: {
    precedence: 2,
    func: async (a, b, toBool) => {
      a = await toBool(a)
      b = await toBool(b)
      return a && b
    }
  },
  not: {
    precedence: 3,
    func: async (b, toBool) => {
      b = await toBool(b)
      return !b
    },
    n: 1
  }
}

// synonyms
operators['&&'] = operators.and
operators['||'] = operators.or
operators['!'] = operators.not

// add whitespace to '(', ')', and '!' operators so that
// "(a && !b)" -> "( a && ! b )"
const addSpaces = (string) => {
  const split = string.split('')
  const characters = split.map((character, i) => {
    if (character === '(' || character === ')') {
      if (split[i - 1] !== ' ') character = ' ' + character
      if (split[i + 1] !== ' ') character = character + ' '
    }
    if (character === '!') {
      if (split[i + 1] !== ' ' && split[i + 1] !== '=') {
        character = character + ' '
      }
    }
    return character
  })
  return characters.join('')
}

// Uses the shunting-yard algorithm to convert infix notation
// into Reverse Polish Notation
const convertToRPN = (exp) => {
  const stack = []
  const rpn = []
  for (let token of exp.trim().split(' ')) {
    if (operators[token]) {
      // This assumes no right-associative operators
      while (
          stack[stack.length - 1] &&
          operators[stack[stack.length - 1]] &&
          operators[token].precedence <= operators[stack[stack.length - 1]].precedence) {
        rpn.push(stack.pop())
      }
      stack.push(token)
    } else if (token === '(') {
      stack.push(token)
    } else if (token === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') {
        rpn.push(stack.pop())
      }
      if (stack[stack.length - 1] === '(') {
        stack.pop()
      } else {
        throw new InvalidExpression()
      }
    } else if (/^[a-zA-Z_-]+$/.test(token)) {
      rpn.push(token)
    } else {
      throw new InvalidExpression()
    }
  }
  return rpn.concat(stack.reverse())
}

const calculateRPN = async (rpn, toBool) => {
  const stack = []
  for (let token of rpn) {
    const operator = operators[token]
    if (operator) {
      const numArgs = operator.n || 2
      let args = []
      for (let i = 1; i <= numArgs; i++) {
        args.push(stack.pop())
      }
      args = args.reverse().concat(toBool)
      const result = await operator.func(...args)
      stack.push(result)
    } else {
      stack.push(token)
    }
  }
  return stack[0]
}

Acl.check = (expression, toBool) => {
  if (typeof expression !== 'string') {
    throw new InvalidExpression()
  }
  expression = expression
               .replace(/\s+/g, ' ')
               .replace(/\s+$/, '')
               .replace(/^\s+/, '')
  expression = addSpaces(expression)
  return calculateRPN(convertToRPN(expression), (operand) => {
    if (typeof operand === 'boolean') {
      return operand
    }
    return toBool(operand)
  })
}