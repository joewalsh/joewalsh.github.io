(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (factory());
}(this, (function () { 'use strict';

  var extendingChars = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u180b-\u180d\u18a9\u200c\u200d]/;
  try {
      extendingChars = new RegExp("\\p{Grapheme_Extend}", "u");
  }
  catch (_) { }
  function isExtendingChar(ch) {
      var code = ch.charCodeAt(0);
      return code >= 768 && (code >= 0xdc00 && code < 0xe000 || extendingChars.test(ch));
  }
  var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
  var wordChar;
  try {
      wordChar = new RegExp("[\\p{Alphabetic}_]", "u");
  }
  catch (_) { }
  // FIXME this doesn't work for astral chars yet (need different calling convention)
  function isWordCharBasic(ch) {
      if (wordChar)
          return wordChar.test(ch);
      return /\w/.test(ch) || ch > "\x80" &&
          (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch));
  }
  function isWordChar(ch, wordChars) {
      if (!wordChars)
          return isWordCharBasic(ch);
      if (wordChars.source.indexOf("\\w") > -1 && isWordCharBasic(ch))
          return true;
      return wordChars.test(ch);
  }
  function charType(ch, wordChars) {
      return /\s/.test(ch) ? 1 /* SPACE */ : isWordChar(ch, wordChars) ? 0 /* WORD */ : 2 /* OTHER */;
  }

  function countColumn(string, n, tabSize) {
      for (var i = 0; i < string.length; i++) {
          var code = string.charCodeAt(i);
          if (code == 9)
              n += tabSize - (n % tabSize);
          else if (code < 768 || !isExtendingChar(string.charAt(i)))
              n++;
      }
      return n;
  }
  function findColumn(string, n, col, tabSize) {
      for (var i = 0; i < string.length; i++) {
          var code = string.charCodeAt(i);
          if (code >= 768 && isExtendingChar(string.charAt(i)))
              continue;
          if (n >= col)
              return { offset: i, leftOver: 0 };
          n += code == 9 ? tabSize - (n % tabSize) : 1;
      }
      return { offset: string.length, leftOver: col - n };
  }

  /*! *****************************************************************************
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License"); you may not use
  this file except in compliance with the License. You may obtain a copy of the
  License at http://www.apache.org/licenses/LICENSE-2.0

  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
  MERCHANTABLITY OR NON-INFRINGEMENT.

  See the Apache Version 2.0 License for specific language governing permissions
  and limitations under the License.
  ***************************************************************************** */
  /* global Reflect, Promise */

  var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf ||
          ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
          function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
      return extendStatics(d, b);
  };

  function __extends(d, b) {
      extendStatics(d, b);
      function __() { this.constructor = d; }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }

  // The base size of a leaf node
  var BASE_LEAF = 512;
  // The max size of a leaf node
  var MAX_LEAF = BASE_LEAF << 1;
  // The desired amount of branches per node, as an exponent of 2 (so 3
  // means 8 branches)
  var TARGET_BRANCH_SHIFT = 3;
  // Note line numbers are 1-based
  var Text = /** @class */ (function () {
      // @internal
      function Text() {
      }
      Text.prototype.lineAt = function (pos) {
          if (pos < 0 || pos > this.length)
              throw new RangeError("Invalid position " + pos + " in document of length " + this.length);
          for (var i = 0; i < lineCache.length; i += 2) {
              if (lineCache[i] != this)
                  continue;
              var line = lineCache[i + 1];
              if (line.start <= pos && line.end >= pos)
                  return line;
          }
          return cacheLine(this, this.lineInner(pos, false, 1, 0).finish(this));
      };
      Text.prototype.line = function (n) {
          if (n < 1 || n > this.lines)
              throw new RangeError("Invalid line number ${n} in ${this.lines}-line document");
          for (var i = 0; i < lineCache.length; i += 2) {
              if (lineCache[i] != this)
                  continue;
              var line = lineCache[i + 1];
              if (line.number == n)
                  return line;
          }
          return cacheLine(this, this.lineInner(n, true, 1, 0).finish(this));
      };
      Text.prototype.replace = function (from, to, text) {
          if (text.length == 0)
              throw new RangeError("An inserted range must have at least one line");
          return this.replaceInner(from, to, text, textLength(text));
      };
      Text.prototype.sliceLines = function (from, to) {
          if (to === void 0) { to = this.length; }
          return this.sliceTo(from, to, [""]);
      };
      Text.prototype.slice = function (from, to, lineSeparator) {
          return joinLines(this.sliceLines(from, to), lineSeparator);
      };
      Text.prototype.eq = function (other) { return this == other || eqContent(this, other); };
      Text.prototype.iter = function (dir) {
          if (dir === void 0) { dir = 1; }
          return new RawTextCursor(this, dir);
      };
      Text.prototype.iterRange = function (from, to) {
          if (to === void 0) { to = this.length; }
          return new PartialTextCursor(this, from, to);
      };
      Text.prototype.iterLines = function (from) {
          if (from === void 0) { from = 0; }
          return new LineCursor(this, from);
      };
      Text.prototype.toString = function () { return this.slice(0, this.length); };
      Text.of = function (text, lineSeparator) {
          if (typeof text == "string")
              text = splitLines(text, lineSeparator);
          else if (text.length == 0)
              throw new RangeError("A document must have at least one line");
          var length = textLength(text);
          return length < MAX_LEAF ? new TextLeaf(text, length) : TextNode.from(TextLeaf.split(text, []), length);
      };
      return Text;
  }());
  var lineCache = [], lineCachePos = -2, lineCacheSize = 12;
  function cacheLine(text, line) {
      lineCachePos = (lineCachePos + 2) % lineCacheSize;
      lineCache[lineCachePos] = text;
      lineCache[lineCachePos + 1] = line;
      return line;
  }
  function splitLines(text, lineSeparator) {
      if (lineSeparator === void 0) { lineSeparator = DEFAULT_SPLIT; }
      return text.split(lineSeparator);
  }
  function joinLines(text, lineSeparator) {
      if (lineSeparator === void 0) { lineSeparator = "\n"; }
      return text.join(lineSeparator);
  }
  var DEFAULT_SPLIT = /\r\n?|\n/;
  var TextLeaf = /** @class */ (function (_super) {
      __extends(TextLeaf, _super);
      function TextLeaf(text, length) {
          if (length === void 0) { length = textLength(text); }
          var _this = _super.call(this) || this;
          _this.text = text;
          _this.length = length;
          return _this;
      }
      Object.defineProperty(TextLeaf.prototype, "lines", {
          get: function () { return this.text.length; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(TextLeaf.prototype, "children", {
          get: function () { return null; },
          enumerable: true,
          configurable: true
      });
      TextLeaf.prototype.replaceInner = function (from, to, text, length) {
          return Text.of(appendText(this.text, appendText(text, sliceText(this.text, 0, from)), to));
      };
      TextLeaf.prototype.sliceTo = function (from, to, target) {
          if (to === void 0) { to = this.length; }
          return appendText(this.text, target, from, to);
      };
      TextLeaf.prototype.lineInner = function (target, isLine, line, offset) {
          for (var i = 0;; i++) {
              var string = this.text[i], end = offset + string.length;
              if ((isLine ? line : end) >= target)
                  return new Line(offset, end, line, string);
              offset = end + 1;
              line++;
          }
      };
      TextLeaf.prototype.decomposeStart = function (to, target) {
          target.push(new TextLeaf(sliceText(this.text, 0, to), to));
      };
      TextLeaf.prototype.decomposeEnd = function (from, target) {
          target.push(new TextLeaf(sliceText(this.text, from), this.length - from));
      };
      TextLeaf.prototype.lastLineLength = function () { return this.text[this.text.length - 1].length; };
      TextLeaf.prototype.firstLineLength = function () { return this.text[0].length; };
      TextLeaf.split = function (text, target) {
          var part = [], length = -1;
          for (var _i = 0, text_1 = text; _i < text_1.length; _i++) {
              var line = text_1[_i];
              for (;;) {
                  var newLength = length + line.length + 1;
                  if (newLength < BASE_LEAF) {
                      length = newLength;
                      part.push(line);
                      break;
                  }
                  var cut = BASE_LEAF - length - 1, after_1 = line.charCodeAt(cut);
                  if (after_1 >= 0xdc00 && after_1 < 0xe000)
                      cut++;
                  part.push(line.slice(0, cut));
                  target.push(new TextLeaf(part, BASE_LEAF));
                  line = line.slice(cut);
                  length = -1;
                  part = [];
              }
          }
          if (length != -1)
              target.push(new TextLeaf(part, length));
          return target;
      };
      return TextLeaf;
  }(Text));
  var TextNode = /** @class */ (function (_super) {
      __extends(TextNode, _super);
      function TextNode(children, length) {
          var _this = _super.call(this) || this;
          _this.children = children;
          _this.length = length;
          _this.lines = 1;
          for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
              var child = children_1[_i];
              _this.lines += child.lines - 1;
          }
          return _this;
      }
      TextNode.prototype.replaceInner = function (from, to, text, length) {
          var lengthDiff = length - (to - from), newLength = this.length + lengthDiff;
          if (newLength <= BASE_LEAF)
              return new TextLeaf(appendText(this.sliceLines(to), appendText(text, this.sliceTo(0, from, [""]))), newLength);
          var children;
          for (var i = 0, pos = 0; i < this.children.length; i++) {
              var child = this.children[i], end = pos + child.length;
              if (from >= pos && to <= end &&
                  (lengthDiff > 0
                      ? child.length + lengthDiff < Math.max(newLength >> (TARGET_BRANCH_SHIFT - 1), MAX_LEAF)
                      : child.length + lengthDiff > newLength >> (TARGET_BRANCH_SHIFT + 1))) {
                  // Fast path: if the change only affects one child and the
                  // child's size remains in the acceptable range, only update
                  // that child
                  children = this.children.slice();
                  children[i] = child.replace(from - pos, to - pos, text);
                  return new TextNode(children, newLength);
              }
              else if (end >= from) {
                  // Otherwise, we must build up a new array of children
                  if (children == null)
                      children = this.children.slice(0, i);
                  if (pos < from) {
                      if (end == from)
                          children.push(child);
                      else
                          child.decomposeStart(from - pos, children);
                  }
                  if (pos <= from && end >= from)
                      TextLeaf.split(text, children);
                  if (pos >= to)
                      children.push(child);
                  else if (end > to)
                      child.decomposeEnd(to - pos, children);
              }
              pos = end;
          }
          return children ? TextNode.from(children, newLength) : this;
      };
      TextNode.prototype.sliceTo = function (from, to, target) {
          var pos = 0;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var child = _a[_i];
              var end = pos + child.length;
              if (to > pos && from < end)
                  child.sliceTo(Math.max(0, from - pos), Math.min(child.length, to - pos), target);
              pos = end;
          }
          return target;
      };
      TextNode.prototype.lineInner = function (target, isLine, line, offset) {
          for (var i = 0;; i++) {
              var child = this.children[i], end = offset + child.length, endLine = line + child.lines - 1;
              if ((isLine ? endLine : end) >= target) {
                  var inner = child.lineInner(target, isLine, line, offset), add = void 0;
                  if (inner.start == offset && (add = this.lineLengthTo(i))) {
                      inner.start -= add;
                      inner.content = null;
                  }
                  if (inner.end == end && (add = this.lineLengthFrom(i + 1))) {
                      inner.end += add;
                      inner.content = null;
                  }
                  return inner;
              }
              offset = end;
              line = endLine;
          }
      };
      TextNode.prototype.decomposeStart = function (to, target) {
          for (var i = 0, pos = 0;; i++) {
              var child = this.children[i], end = pos + child.length;
              if (end <= to) {
                  target.push(child);
              }
              else {
                  if (pos < to)
                      child.decomposeStart(to - pos, target);
                  break;
              }
              pos = end;
          }
      };
      TextNode.prototype.decomposeEnd = function (from, target) {
          var pos = 0;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var child = _a[_i];
              var end = pos + child.length;
              if (pos >= from)
                  target.push(child);
              else if (end > from && pos < from)
                  child.decomposeEnd(from - pos, target);
              pos = end;
          }
      };
      TextNode.prototype.lineLengthTo = function (to) {
          var length = 0;
          for (var i = to - 1; i >= 0; i--) {
              var child = this.children[i];
              if (child.lines > 1)
                  return length + child.lastLineLength();
              length += child.length;
          }
          return length;
      };
      TextNode.prototype.lastLineLength = function () { return this.lineLengthTo(this.children.length); };
      TextNode.prototype.lineLengthFrom = function (from) {
          var length = 0;
          for (var i = from; i < this.children.length; i++) {
              var child = this.children[i];
              if (child.lines > 1)
                  return length + child.firstLineLength();
              length += child.length;
          }
          return length;
      };
      TextNode.prototype.firstLineLength = function () { return this.lineLengthFrom(0); };
      TextNode.from = function (children, length) {
          if (length < MAX_LEAF) {
              var text = [""];
              for (var _i = 0, children_2 = children; _i < children_2.length; _i++) {
                  var child = children_2[_i];
                  child.sliceTo(0, child.length, text);
              }
              return new TextLeaf(text, length);
          }
          var chunkLength = Math.max(BASE_LEAF, length >> TARGET_BRANCH_SHIFT), maxLength = chunkLength << 1, minLength = chunkLength >> 1;
          var chunked = [], currentLength = 0, currentChunk = [];
          function add(child) {
              var childLength = child.length, last;
              if (childLength > maxLength && child instanceof TextNode) {
                  for (var _i = 0, _a = child.children; _i < _a.length; _i++) {
                      var node = _a[_i];
                      add(node);
                  }
              }
              else if (childLength > minLength && (currentLength > minLength || currentLength == 0)) {
                  flush();
                  chunked.push(child);
              }
              else if (child instanceof TextLeaf && currentLength > 0 &&
                  (last = currentChunk[currentChunk.length - 1]) instanceof TextLeaf &&
                  child.length + last.length <= BASE_LEAF) {
                  currentLength += childLength;
                  currentChunk[currentChunk.length - 1] = new TextLeaf(appendText(child.text, last.text.slice()), child.length + last.length);
              }
              else {
                  if (currentLength + childLength > chunkLength)
                      flush();
                  currentLength += childLength;
                  currentChunk.push(child);
              }
          }
          function flush() {
              if (currentLength == 0)
                  return;
              chunked.push(currentChunk.length == 1 ? currentChunk[0] : TextNode.from(currentChunk, currentLength));
              currentLength = 0;
              currentChunk.length = 0;
          }
          for (var _a = 0, children_3 = children; _a < children_3.length; _a++) {
              var child = children_3[_a];
              add(child);
          }
          flush();
          return chunked.length == 1 ? chunked[0] : new TextNode(chunked, length);
      };
      return TextNode;
  }(Text));
  function textLength(text) {
      var length = -1;
      for (var _i = 0, text_2 = text; _i < text_2.length; _i++) {
          var line = text_2[_i];
          length += line.length + 1;
      }
      return length;
  }
  function appendText(text, target, from, to) {
      if (from === void 0) { from = 0; }
      if (to === void 0) { to = 1e9; }
      for (var pos = 0, i = 0, first = true; i < text.length && pos <= to; i++) {
          var line = text[i], end = pos + line.length;
          if (end >= from) {
              if (end > to)
                  line = line.slice(0, to - pos);
              if (pos < from)
                  line = line.slice(from - pos);
              if (first) {
                  target[target.length - 1] += line;
                  first = false;
              }
              else
                  target.push(line);
          }
          pos = end + 1;
      }
      return target;
  }
  function sliceText(text, from, to) {
      return appendText(text, [""], from, to);
  }
  function eqContent(a, b) {
      if (a.length != b.length || a.lines != b.lines)
          return false;
      var iterA = new RawTextCursor(a), iterB = new RawTextCursor(b);
      for (var offA = 0, offB = 0;;) {
          if (iterA.lineBreak != iterB.lineBreak || iterA.done != iterB.done) {
              return false;
          }
          else if (iterA.done) {
              return true;
          }
          else if (iterA.lineBreak) {
              iterA.next();
              iterB.next();
              offA = offB = 0;
          }
          else {
              var strA = iterA.value.slice(offA), strB = iterB.value.slice(offB);
              if (strA.length == strB.length) {
                  if (strA != strB)
                      return false;
                  iterA.next();
                  iterB.next();
                  offA = offB = 0;
              }
              else if (strA.length > strB.length) {
                  if (strA.slice(0, strB.length) != strB)
                      return false;
                  offA += strB.length;
                  iterB.next();
                  offB = 0;
              }
              else {
                  if (strB.slice(0, strA.length) != strA)
                      return false;
                  offB += strA.length;
                  iterA.next();
                  offA = 0;
              }
          }
      }
  }
  var RawTextCursor = /** @class */ (function () {
      // @internal
      function RawTextCursor(text, dir) {
          if (dir === void 0) { dir = 1; }
          this.dir = dir;
          this.done = false;
          this.lineBreak = false;
          this.value = "";
          this.nodes = [text];
          this.offsets = [dir > 0 ? 0 : text instanceof TextLeaf ? text.text.length : text.children.length];
      }
      RawTextCursor.prototype.next = function (skip) {
          if (skip === void 0) { skip = 0; }
          for (;;) {
              var last = this.nodes.length - 1;
              if (last < 0) {
                  this.done = true;
                  this.value = "";
                  this.lineBreak = false;
                  return this;
              }
              var top_1 = this.nodes[last];
              var offset = this.offsets[last];
              if (top_1 instanceof TextLeaf) {
                  // Internal ofset with lineBreak == false means we have to
                  // count the line break at this position
                  if (offset != (this.dir > 0 ? 0 : top_1.text.length) && !this.lineBreak) {
                      this.lineBreak = true;
                      if (skip == 0) {
                          this.value = "\n";
                          return this;
                      }
                      skip--;
                      continue;
                  }
                  // Otherwise, move to the next string
                  var next = top_1.text[offset - (this.dir < 0 ? 1 : 0)];
                  this.offsets[last] = (offset += this.dir);
                  if (offset == (this.dir > 0 ? top_1.text.length : 0)) {
                      this.nodes.pop();
                      this.offsets.pop();
                  }
                  this.lineBreak = false;
                  if (next.length > skip) {
                      this.value = skip == 0 ? next : this.dir > 0 ? next.slice(skip) : next.slice(0, next.length - skip);
                      return this;
                  }
                  skip -= next.length;
              }
              else if (offset == (this.dir > 0 ? top_1.children.length : 0)) {
                  this.nodes.pop();
                  this.offsets.pop();
              }
              else {
                  var next = top_1.children[this.dir > 0 ? offset : offset - 1], len = next.length;
                  this.offsets[last] = offset + this.dir;
                  if (skip > len) {
                      skip -= len;
                  }
                  else {
                      this.nodes.push(next);
                      this.offsets.push(this.dir > 0 ? 0 : next instanceof TextLeaf ? next.text.length : next.children.length);
                  }
              }
          }
      };
      return RawTextCursor;
  }());
  var PartialTextCursor = /** @class */ (function () {
      function PartialTextCursor(text, start, end) {
          this.value = "";
          this.cursor = new RawTextCursor(text, start > end ? -1 : 1);
          if (start > end) {
              this.skip = text.length - start;
              this.limit = start - end;
          }
          else {
              this.skip = start;
              this.limit = end - start;
          }
      }
      PartialTextCursor.prototype.next = function () {
          if (this.limit <= 0) {
              this.limit = -1;
          }
          else {
              var _a = this.cursor.next(this.skip), value = _a.value, lineBreak = _a.lineBreak;
              this.skip = 0;
              this.value = value;
              var len = lineBreak ? 1 : value.length;
              if (len > this.limit)
                  this.value = this.cursor.dir > 0 ? value.slice(0, this.limit) : value.slice(len - this.limit);
              this.limit -= this.value.length;
          }
          return this;
      };
      Object.defineProperty(PartialTextCursor.prototype, "lineBreak", {
          get: function () { return this.cursor.lineBreak; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(PartialTextCursor.prototype, "done", {
          get: function () { return this.limit < 0; },
          enumerable: true,
          configurable: true
      });
      return PartialTextCursor;
  }());
  var LineCursor = /** @class */ (function () {
      function LineCursor(text, from) {
          if (from === void 0) { from = 0; }
          this.value = "";
          this.done = false;
          this.cursor = text.iter();
          this.skip = from;
      }
      LineCursor.prototype.next = function () {
          if (this.cursor.done) {
              this.done = true;
              this.value = "";
              return this;
          }
          for (this.value = "";;) {
              var _a = this.cursor.next(this.skip), value = _a.value, lineBreak = _a.lineBreak, done = _a.done;
              this.skip = 0;
              if (done || lineBreak)
                  return this;
              this.value += value;
          }
      };
      Object.defineProperty(LineCursor.prototype, "lineBreak", {
          get: function () { return false; },
          enumerable: true,
          configurable: true
      });
      return LineCursor;
  }());
  var Line = /** @class */ (function () {
      function Line(start, end, number, 
      // @internal
      content) {
          this.start = start;
          this.end = end;
          this.number = number;
          this.content = content;
      }
      Object.defineProperty(Line.prototype, "length", {
          get: function () { return this.end - this.start; },
          enumerable: true,
          configurable: true
      });
      Line.prototype.slice = function (from, to) {
          if (from === void 0) { from = 0; }
          if (to === void 0) { to = this.length; }
          if (typeof this.content == "string")
              return to == from + 1 ? this.content.charAt(from) : this.content.slice(from, to);
          if (from == to)
              return "";
          var result = this.content.slice(from, to);
          if (from == 0 && to == this.length)
              this.content = result;
          return result;
      };
      // @internal
      Line.prototype.finish = function (text) {
          if (this.content == null)
              this.content = new LineContent(text, this.start);
          return this;
      };
      return Line;
  }());
  var LineContent = /** @class */ (function () {
      function LineContent(doc, start) {
          this.doc = doc;
          this.start = start;
          this.cursor = null;
          this.strings = null;
      }
      // FIXME quadratic complexity (somewhat) when iterating long lines in small pieces
      LineContent.prototype.slice = function (from, to) {
          if (!this.cursor) {
              this.cursor = this.doc.iter();
              this.strings = [this.cursor.next(this.start).value];
          }
          for (var result = "", pos = 0, i = 0;; i++) {
              if (i == this.strings.length)
                  this.strings.push(this.cursor.next().value);
              var string = this.strings[i], end = pos + string.length;
              if (end <= from)
                  continue;
              result += string.slice(Math.max(0, from - pos), Math.min(string.length, to - pos));
              if (end >= to)
                  return result;
              pos += string.length;
          }
      };
      return LineContent;
  }());

  var SelectionRange = /** @class */ (function () {
      function SelectionRange(anchor, head) {
          if (head === void 0) { head = anchor; }
          this.anchor = anchor;
          this.head = head;
      }
      Object.defineProperty(SelectionRange.prototype, "from", {
          get: function () { return Math.min(this.anchor, this.head); },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(SelectionRange.prototype, "to", {
          get: function () { return Math.max(this.anchor, this.head); },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(SelectionRange.prototype, "empty", {
          get: function () { return this.anchor == this.head; },
          enumerable: true,
          configurable: true
      });
      SelectionRange.prototype.map = function (mapping) {
          var anchor = mapping.mapPos(this.anchor), head = mapping.mapPos(this.head);
          if (anchor == this.anchor && head == this.head)
              return this;
          else
              return new SelectionRange(anchor, head);
      };
      SelectionRange.prototype.extend = function (from, to) {
          if (to === void 0) { to = from; }
          if (from <= this.anchor && to >= this.anchor)
              return new SelectionRange(from, to);
          var head = Math.abs(from - this.anchor) > Math.abs(to - this.anchor) ? from : to;
          return new SelectionRange(this.anchor, head);
      };
      SelectionRange.prototype.eq = function (other) {
          return this.anchor == other.anchor && this.head == other.head;
      };
      SelectionRange.prototype.toJSON = function () { return this; };
      SelectionRange.fromJSON = function (json) {
          if (!json || typeof json.anchor != "number" || typeof json.head != "number")
              throw new RangeError("Invalid JSON representation for SelectionRange");
          return new SelectionRange(json.anchor, json.head);
      };
      SelectionRange.groupAt = function (state, pos, bias) {
          if (bias === void 0) { bias = 1; }
          // FIXME at some point, take language-specific identifier characters into account
          var line = state.doc.lineAt(pos), linePos = pos - line.start;
          if (line.length == 0)
              return new SelectionRange(pos);
          if (linePos == 0)
              bias = 1;
          else if (linePos == line.length)
              bias = -1;
          var read = linePos + (bias < 0 ? -1 : 0), type = charType(line.slice(read, read + 1));
          var from = pos, to = pos;
          for (var lineFrom = linePos; lineFrom > 0 && charType(line.slice(lineFrom - 1, lineFrom)) == type; lineFrom--)
              from--;
          for (var lineTo = linePos; lineTo < line.length && charType(line.slice(lineTo, lineTo + 1)) == type; lineTo++)
              to++;
          return new SelectionRange(to, from);
      };
      return SelectionRange;
  }());
  var EditorSelection = /** @class */ (function () {
      /** @internal */
      function EditorSelection(ranges, primaryIndex) {
          if (primaryIndex === void 0) { primaryIndex = 0; }
          this.ranges = ranges;
          this.primaryIndex = primaryIndex;
      }
      EditorSelection.prototype.map = function (mapping) {
          return EditorSelection.create(this.ranges.map(function (r) { return r.map(mapping); }), this.primaryIndex);
      };
      EditorSelection.prototype.eq = function (other) {
          if (this.ranges.length != other.ranges.length ||
              this.primaryIndex != other.primaryIndex)
              return false;
          for (var i = 0; i < this.ranges.length; i++)
              if (!this.ranges[i].eq(other.ranges[i]))
                  return false;
          return true;
      };
      Object.defineProperty(EditorSelection.prototype, "primary", {
          get: function () { return this.ranges[this.primaryIndex]; },
          enumerable: true,
          configurable: true
      });
      EditorSelection.prototype.asSingle = function () {
          return this.ranges.length == 1 ? this : new EditorSelection([this.primary]);
      };
      EditorSelection.prototype.addRange = function (range, primary) {
          if (primary === void 0) { primary = true; }
          return EditorSelection.create([range].concat(this.ranges), primary ? 0 : this.primaryIndex + 1);
      };
      EditorSelection.prototype.replaceRange = function (range, which) {
          if (which === void 0) { which = this.primaryIndex; }
          var ranges = this.ranges.slice();
          ranges[which] = range;
          return EditorSelection.create(ranges, this.primaryIndex);
      };
      EditorSelection.prototype.toJSON = function () {
          return this.ranges.length == 1 ? this.ranges[0].toJSON() :
              { ranges: this.ranges.map(function (r) { return r.toJSON(); }), primaryIndex: this.primaryIndex };
      };
      EditorSelection.fromJSON = function (json) {
          if (json && Array.isArray(json.ranges)) {
              if (typeof json.primaryIndex != "number" || json.primaryIndex >= json.ranges.length)
                  throw new RangeError("Invalid JSON representation for EditorSelection");
              return new EditorSelection(json.ranges.map(function (r) { return SelectionRange.fromJSON(r); }), json.primaryIndex);
          }
          return new EditorSelection([SelectionRange.fromJSON(json)]);
      };
      EditorSelection.single = function (anchor, head) {
          if (head === void 0) { head = anchor; }
          return new EditorSelection([new SelectionRange(anchor, head)], 0);
      };
      EditorSelection.create = function (ranges, primaryIndex) {
          if (primaryIndex === void 0) { primaryIndex = 0; }
          for (var pos = 0, i = 0; i < ranges.length; i++) {
              var range = ranges[i];
              if (range.empty ? range.from <= pos : range.from < pos)
                  return normalized(ranges.slice(), primaryIndex);
              pos = range.to;
          }
          return new EditorSelection(ranges, primaryIndex);
      };
      EditorSelection.default = EditorSelection.single(0);
      return EditorSelection;
  }());
  function normalized(ranges, primaryIndex) {
      if (primaryIndex === void 0) { primaryIndex = 0; }
      var primary = ranges[primaryIndex];
      ranges.sort(function (a, b) { return a.from - b.from; });
      primaryIndex = ranges.indexOf(primary);
      for (var i = 1; i < ranges.length; i++) {
          var range = ranges[i], prev = ranges[i - 1];
          if (range.empty ? range.from <= prev.to : range.from < prev.to) {
              var from = prev.from, to = Math.max(range.to, prev.to);
              if (i <= primaryIndex)
                  primaryIndex--;
              ranges.splice(--i, 2, range.anchor > range.head ? new SelectionRange(to, from) : new SelectionRange(from, to));
          }
      }
      return new EditorSelection(ranges, primaryIndex);
  }

  var fieldNames = Object.create(null);
  var StateField = /** @class */ (function () {
      function StateField(_a) {
          var init = _a.init, apply = _a.apply, _b = _a.debugName, debugName = _b === void 0 ? "field" : _b;
          this.init = init;
          this.apply = apply;
          this.key = unique("$" + debugName, fieldNames);
      }
      return StateField;
  }());
  var Plugin = /** @class */ (function () {
      function Plugin(spec) {
          this.spec = spec;
          this.config = spec.config;
          this.stateField = spec.state || null;
          this.view = spec.view;
      }
      return Plugin;
  }());
  function unique(prefix, names) {
      for (var i = 0;; i++) {
          var name_1 = prefix + (i ? "_" + i : "");
          if (!(name_1 in names))
              return names[name_1] = name_1;
      }
  }

  var empty = [];
  var ChangeDesc = /** @class */ (function () {
      function ChangeDesc(from, to, length) {
          this.from = from;
          this.to = to;
          this.length = length;
      }
      Object.defineProperty(ChangeDesc.prototype, "invertedDesc", {
          get: function () { return new ChangeDesc(this.from, this.from + this.length, this.to - this.from); },
          enumerable: true,
          configurable: true
      });
      ChangeDesc.prototype.mapPos = function (pos, bias, trackDel) {
          if (bias === void 0) { bias = -1; }
          if (trackDel === void 0) { trackDel = false; }
          var _a = this, from = _a.from, to = _a.to, length = _a.length;
          if (pos < from)
              return pos;
          if (pos > to)
              return pos + (length - (to - from));
          if (pos == to || pos == from)
              return (from == to ? bias <= 0 : pos == from) ? from : from + length;
          pos = from + (bias <= 0 ? 0 : length);
          return trackDel ? -pos - 1 : pos;
      };
      ChangeDesc.prototype.toJSON = function () { return this; };
      ChangeDesc.fromJSON = function (json) {
          if (!json || typeof json.from != "number" || typeof json.to != "number" || typeof json.length != "number")
              throw new RangeError("Invalid JSON representation for ChangeDesc");
          return new ChangeDesc(json.from, json.to, json.length);
      };
      return ChangeDesc;
  }());
  var Change = /** @class */ (function (_super) {
      __extends(Change, _super);
      function Change(from, to, text) {
          var _this = _super.call(this, from, to, textLength$1(text)) || this;
          _this.from = from;
          _this.to = to;
          _this.text = text;
          return _this;
      }
      Change.prototype.invert = function (doc) {
          return new Change(this.from, this.from + this.length, doc.sliceLines(this.from, this.to));
      };
      Change.prototype.apply = function (doc) {
          return doc.replace(this.from, this.to, this.text);
      };
      Change.prototype.map = function (mapping) {
          var from = mapping.mapPos(this.from, 1), to = mapping.mapPos(this.to, -1);
          return from > to ? null : new Change(from, to, this.text);
      };
      Object.defineProperty(Change.prototype, "desc", {
          get: function () { return new ChangeDesc(this.from, this.to, this.length); },
          enumerable: true,
          configurable: true
      });
      Change.prototype.toJSON = function () {
          return { from: this.from, to: this.to, text: this.text };
      };
      Change.fromJSON = function (json) {
          if (!json || typeof json.from != "number" || typeof json.to != "number" ||
              !Array.isArray(json.text) || json.text.some(function (val) { return typeof val != "string"; }))
              throw new RangeError("Invalid JSON representation for Change");
          return new Change(json.from, json.to, json.text);
      };
      return Change;
  }(ChangeDesc));
  function textLength$1(text) {
      var length = -1;
      for (var _i = 0, text_1 = text; _i < text_1.length; _i++) {
          var line = text_1[_i];
          length += line.length + 1;
      }
      return length;
  }
  var ChangeSet = /** @class */ (function () {
      function ChangeSet(changes, mirror) {
          if (mirror === void 0) { mirror = empty; }
          this.changes = changes;
          this.mirror = mirror;
      }
      Object.defineProperty(ChangeSet.prototype, "length", {
          get: function () {
              return this.changes.length;
          },
          enumerable: true,
          configurable: true
      });
      ChangeSet.prototype.getMirror = function (n) {
          for (var i = 0; i < this.mirror.length; i++)
              if (this.mirror[i] == n)
                  return this.mirror[i + (i % 2 ? -1 : 1)];
          return null;
      };
      ChangeSet.prototype.append = function (change, mirror) {
          return new ChangeSet(this.changes.concat(change), mirror != null ? this.mirror.concat(this.length, mirror) : this.mirror);
      };
      ChangeSet.prototype.appendSet = function (changes) {
          var _this = this;
          return changes.length == 0 ? this :
              this.length == 0 ? changes :
                  new ChangeSet(this.changes.concat(changes.changes), this.mirror.concat(changes.mirror.map(function (i) { return i + _this.length; })));
      };
      ChangeSet.prototype.mapPos = function (pos, bias, trackDel) {
          if (bias === void 0) { bias = -1; }
          if (trackDel === void 0) { trackDel = false; }
          return this.mapInner(pos, bias, trackDel, 0, this.length);
      };
      /** @internal */
      ChangeSet.prototype.mapInner = function (pos, bias, trackDel, fromI, toI) {
          var dir = toI < fromI ? -1 : 1;
          var recoverables = null;
          var hasMirrors = this.mirror.length > 0, rec, mirror, deleted = false;
          for (var i = fromI - (dir < 0 ? 1 : 0), endI = toI - (dir < 0 ? 1 : 0); i != endI; i += dir) {
              var _a = this.changes[i], from = _a.from, to = _a.to, length_1 = _a.length;
              if (dir < 0) {
                  var len = to - from;
                  to = from + length_1;
                  length_1 = len;
              }
              if (pos < from)
                  continue;
              if (pos > to) {
                  pos += length_1 - (to - from);
                  continue;
              }
              // Change touches this position
              if (recoverables && (rec = recoverables[i]) != null) { // There's a recovery for this change, and it applies
                  pos = from + rec;
                  continue;
              }
              if (hasMirrors && (mirror = this.getMirror(i)) != null &&
                  (dir > 0 ? mirror > i && mirror < toI : mirror < i && mirror >= toI)) { // A mirror exists
                  if (pos > from && pos < to) { // If this change deletes the position, skip forward to the mirror
                      i = mirror;
                      pos = this.changes[i].from + (pos - from);
                      continue;
                  }
                  (recoverables || (recoverables = {}))[mirror] = pos - from;
              }
              if (pos > from && pos < to) {
                  deleted = true;
                  pos = bias <= 0 ? from : from + length_1;
              }
              else {
                  pos = (from == to ? bias <= 0 : pos == from) ? from : from + length_1;
              }
          }
          return trackDel && deleted ? -pos - 1 : pos;
      };
      ChangeSet.prototype.partialMapping = function (from, to) {
          if (to === void 0) { to = this.length; }
          if (from == 0 && to == this.length)
              return this;
          return new PartialMapping(this, from, to);
      };
      ChangeSet.prototype.changedRanges = function () {
          var set = [];
          for (var i = 0; i < this.length; i++) {
              var change = this.changes[i];
              var fromA = change.from, toA = change.to, fromB = change.from, toB = change.from + change.length;
              if (i < this.length - 1) {
                  var mapping = this.partialMapping(i + 1);
                  fromB = mapping.mapPos(fromB, 1);
                  toB = mapping.mapPos(toB, -1);
              }
              if (i > 0) {
                  var mapping = this.partialMapping(i, 0);
                  fromA = mapping.mapPos(fromA, 1);
                  toA = mapping.mapPos(toA, -1);
              }
              new ChangedRange(fromA, toA, fromB, toB).addToSet(set);
          }
          return set;
      };
      Object.defineProperty(ChangeSet.prototype, "desc", {
          get: function () {
              if (this.changes.length == 0 || this.changes[0] instanceof ChangeDesc)
                  return this;
              return new ChangeSet(this.changes.map(function (ch) { return ch.desc; }), this.mirror);
          },
          enumerable: true,
          configurable: true
      });
      ChangeSet.prototype.toJSON = function () {
          var changes = this.changes.map(function (change) { return change.toJSON(); });
          return this.mirror.length == 0 ? changes : { mirror: this.mirror, changes: changes };
      };
      ChangeSet.fromJSON = function (ChangeType, json) {
          var mirror, changes;
          if (Array.isArray(json)) {
              mirror = empty;
              changes = json;
          }
          else if (!json || !Array.isArray(json.mirror) || !Array.isArray(json.changes)) {
              throw new RangeError("Invalid JSON representation for ChangeSet");
          }
          else {
              (mirror = json.mirror, changes = json.changes);
          }
          return new ChangeSet(changes.map(function (ch) { return ChangeType.fromJSON(ch); }), mirror);
      };
      ChangeSet.empty = new ChangeSet(empty);
      return ChangeSet;
  }());
  var PartialMapping = /** @class */ (function () {
      function PartialMapping(changes, from, to) {
          this.changes = changes;
          this.from = from;
          this.to = to;
      }
      PartialMapping.prototype.mapPos = function (pos, bias, trackDel) {
          if (bias === void 0) { bias = -1; }
          if (trackDel === void 0) { trackDel = false; }
          return this.changes.mapInner(pos, bias, trackDel, this.from, this.to);
      };
      return PartialMapping;
  }());
  var ChangedRange = /** @class */ (function () {
      function ChangedRange(fromA, toA, fromB, toB) {
          this.fromA = fromA;
          this.toA = toA;
          this.fromB = fromB;
          this.toB = toB;
      }
      ChangedRange.prototype.join = function (other) {
          return new ChangedRange(Math.min(this.fromA, other.fromA), Math.max(this.toA, other.toA), Math.min(this.fromB, other.fromB), Math.max(this.toB, other.toB));
      };
      ChangedRange.prototype.addToSet = function (set) {
          var i = set.length, me = this;
          for (; i > 0; i--) {
              var range = set[i - 1];
              if (range.fromA > me.toA)
                  continue;
              if (range.toA < me.fromA)
                  break;
              me = me.join(range);
              set.splice(i - 1, 1);
          }
          set.splice(i, 0, me);
      };
      return ChangedRange;
  }());

  var empty$1 = [];
  var Meta = /** @class */ (function () {
      function Meta(from) {
          if (from === void 0) { from = null; }
          if (from)
              for (var prop in from)
                  this[prop] = from[prop];
      }
      return Meta;
  }());
  Meta.prototype["__proto__"] = null;
  var metaSlotNames = Object.create(null);
  // _T is a phantom type parameter
  var MetaSlot = /** @class */ (function () {
      function MetaSlot(debugName) {
          if (debugName === void 0) { debugName = "meta"; }
          this.name = unique(debugName, metaSlotNames);
      }
      MetaSlot.time = new MetaSlot("time");
      MetaSlot.changeTabSize = new MetaSlot("changeTabSize");
      MetaSlot.changeLineSeparator = new MetaSlot("changeLineSeparator");
      MetaSlot.preserveGoalColumn = new MetaSlot("preserveGoalColumn");
      MetaSlot.userEvent = new MetaSlot("userEvent");
      MetaSlot.addToHistory = new MetaSlot("addToHistory");
      return MetaSlot;
  }());
  var FLAG_SELECTION_SET = 1, FLAG_SCROLL_INTO_VIEW = 2;
  var Transaction = /** @class */ (function () {
      function Transaction(startState, changes, docs, selection, meta, flags) {
          this.startState = startState;
          this.changes = changes;
          this.docs = docs;
          this.selection = selection;
          this.meta = meta;
          this.flags = flags;
      }
      Transaction.start = function (state, time) {
          if (time === void 0) { time = Date.now(); }
          var meta = new Meta;
          meta[MetaSlot.time.name] = time;
          return new Transaction(state, ChangeSet.empty, empty$1, state.selection, meta, 0);
      };
      Object.defineProperty(Transaction.prototype, "doc", {
          get: function () {
              var last = this.docs.length - 1;
              return last < 0 ? this.startState.doc : this.docs[last];
          },
          enumerable: true,
          configurable: true
      });
      Transaction.prototype.setMeta = function (slot, value) {
          var meta = new Meta(this.meta);
          meta[slot.name] = value;
          return new Transaction(this.startState, this.changes, this.docs, this.selection, meta, this.flags);
      };
      Transaction.prototype.getMeta = function (slot) {
          return this.meta[slot.name];
      };
      Transaction.prototype.change = function (change, mirror) {
          if (change.from == change.to && change.length == 0)
              return this;
          if (change.from < 0 || change.to < change.from || change.to > this.doc.length)
              throw new RangeError("Invalid change " + change.from + " to " + change.to);
          var changes = this.changes.append(change, mirror);
          return new Transaction(this.startState, changes, this.docs.concat(change.apply(this.doc)), this.selection.map(changes.partialMapping(changes.length - 1)), this.meta, this.flags);
      };
      Transaction.prototype.replace = function (from, to, text) {
          return this.change(new Change(from, to, typeof text == "string" ? this.startState.splitLines(text) : text));
      };
      Transaction.prototype.replaceSelection = function (text) {
          var content = typeof text == "string" ? this.startState.splitLines(text) : text;
          return this.reduceRanges(function (state, r) {
              var change = new Change(r.from, r.to, content);
              return { transaction: state.change(change), range: new SelectionRange(r.from + change.length) };
          });
      };
      Transaction.prototype.reduceRanges = function (f) {
          var tr = this;
          var sel = tr.selection, start = tr.changes.length, newRanges = [];
          for (var _i = 0, _a = sel.ranges; _i < _a.length; _i++) {
              var range = _a[_i];
              range = range.map(tr.changes.partialMapping(start));
              var result = f(tr, range);
              if (result instanceof Transaction) {
                  tr = result;
                  newRanges.push(range.map(tr.changes.partialMapping(tr.changes.length - 1)));
              }
              else {
                  tr = result.transaction;
                  newRanges.push(result.range);
              }
          }
          return tr.setSelection(EditorSelection.create(newRanges, sel.primaryIndex));
      };
      Transaction.prototype.mapRanges = function (f) {
          return this.reduceRanges(function (tr, range) { return ({ transaction: tr, range: f(range) }); });
      };
      Transaction.prototype.setSelection = function (selection) {
          return new Transaction(this.startState, this.changes, this.docs, this.startState.multipleSelections ? selection : selection.asSingle(), this.meta, this.flags | FLAG_SELECTION_SET);
      };
      Object.defineProperty(Transaction.prototype, "selectionSet", {
          get: function () {
              return (this.flags & FLAG_SELECTION_SET) > 0;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(Transaction.prototype, "docChanged", {
          get: function () {
              return this.changes.length > 0;
          },
          enumerable: true,
          configurable: true
      });
      Transaction.prototype.scrollIntoView = function () {
          return new Transaction(this.startState, this.changes, this.docs, this.selection, this.meta, this.flags | FLAG_SCROLL_INTO_VIEW);
      };
      Object.defineProperty(Transaction.prototype, "scrolledIntoView", {
          get: function () {
              return (this.flags & FLAG_SCROLL_INTO_VIEW) > 0;
          },
          enumerable: true,
          configurable: true
      });
      Transaction.prototype.apply = function () {
          return this.startState.applyTransaction(this);
      };
      Transaction.prototype.invertedChanges = function () {
          if (!this.changes.length)
              return ChangeSet.empty;
          var changes = [], set = this.changes;
          for (var i = set.length - 1; i >= 0; i--)
              changes.push(set.changes[i].invert(i == 0 ? this.startState.doc : this.docs[i - 1]));
          return new ChangeSet(changes, set.mirror.length ? set.mirror.map(function (i) { return set.length - i - 1; }) : set.mirror);
      };
      return Transaction;
  }());

  var Configuration = /** @class */ (function () {
      function Configuration(plugins, fields, multipleSelections, tabSize, lineSeparator) {
          this.plugins = plugins;
          this.fields = fields;
          this.multipleSelections = multipleSelections;
          this.tabSize = tabSize;
          this.lineSeparator = lineSeparator;
      }
      Configuration.create = function (config) {
          var plugins = config.plugins || [], fields = [], multiple = !!config.multipleSelections;
          for (var _i = 0, plugins_1 = plugins; _i < plugins_1.length; _i++) {
              var plugin = plugins_1[_i];
              if (plugin.spec.multipleSelections)
                  multiple = true;
              var field = plugin.stateField;
              if (!field)
                  continue;
              if (fields.indexOf(field) > -1)
                  throw new Error("A state field (" + field.key + ") can only be added to a state once");
              fields.push(field);
          }
          return new Configuration(plugins, fields, multiple, config.tabSize || 4, config.lineSeparator || null);
      };
      Configuration.prototype.updateTabSize = function (tabSize) {
          return new Configuration(this.plugins, this.fields, this.multipleSelections, tabSize, this.lineSeparator);
      };
      Configuration.prototype.updateLineSeparator = function (lineSep) {
          return new Configuration(this.plugins, this.fields, this.multipleSelections, this.tabSize, lineSep);
      };
      return Configuration;
  }());
  var EditorState = /** @class */ (function () {
      /** @internal */
      function EditorState(config, doc, selection) {
          if (selection === void 0) { selection = EditorSelection.default; }
          this.config = config;
          this.doc = doc;
          this.selection = selection;
          for (var _i = 0, _a = selection.ranges; _i < _a.length; _i++) {
              var range = _a[_i];
              if (range.to > doc.length)
                  throw new RangeError("Selection points outside of document");
          }
      }
      EditorState.prototype.getField = function (field) {
          return this[field.key];
      };
      Object.defineProperty(EditorState.prototype, "plugins", {
          get: function () { return this.config.plugins; },
          enumerable: true,
          configurable: true
      });
      EditorState.prototype.getPluginWithField = function (field) {
          for (var _i = 0, _a = this.config.plugins; _i < _a.length; _i++) {
              var plugin = _a[_i];
              if (plugin.stateField == field)
                  return plugin;
          }
          throw new Error("Plugin for field not configured");
      };
      /** @internal */
      EditorState.prototype.applyTransaction = function (tr) {
          var $conf = this.config;
          var tabSize = tr.getMeta(MetaSlot.changeTabSize), lineSep = tr.getMeta(MetaSlot.changeLineSeparator);
          if (tabSize !== undefined)
              $conf = $conf.updateTabSize(tabSize);
          // FIXME changing the line separator might involve rearranging line endings (?)
          if (lineSep !== undefined)
              $conf = $conf.updateLineSeparator(lineSep);
          var newState = new EditorState($conf, tr.doc, tr.selection);
          for (var _i = 0, _a = $conf.fields; _i < _a.length; _i++) {
              var field = _a[_i];
              newState[field.key] = field.apply(tr, this[field.key], newState);
          }
          return newState;
      };
      Object.defineProperty(EditorState.prototype, "transaction", {
          get: function () {
              return Transaction.start(this);
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(EditorState.prototype, "tabSize", {
          get: function () { return this.config.tabSize; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(EditorState.prototype, "multipleSelections", {
          get: function () { return this.config.multipleSelections; },
          enumerable: true,
          configurable: true
      });
      EditorState.prototype.joinLines = function (text) { return joinLines(text, this.config.lineSeparator || undefined); };
      EditorState.prototype.splitLines = function (text) { return splitLines(text, this.config.lineSeparator || undefined); };
      // FIXME plugin state serialization
      EditorState.prototype.toJSON = function () {
          return {
              doc: this.joinLines(this.doc.sliceLines(0, this.doc.length)),
              selection: this.selection.toJSON(),
              lineSeparator: this.config.lineSeparator,
              tabSize: this.tabSize
          };
      };
      EditorState.fromJSON = function (json, config) {
          if (config === void 0) { config = {}; }
          if (!json || (json.lineSeparator && typeof json.lineSeparator != "string") ||
              typeof json.tabSize != "number" || typeof json.doc != "string")
              throw new RangeError("Invalid JSON representation for EditorState");
          return EditorState.create({
              doc: json.doc,
              selection: EditorSelection.fromJSON(json.selection),
              plugins: config.plugins,
              tabSize: config.tabSize,
              lineSeparator: config.lineSeparator
          });
      };
      EditorState.create = function (config) {
          if (config === void 0) { config = {}; }
          var $config = Configuration.create(config);
          var doc = config.doc instanceof Text ? config.doc : Text.of(config.doc || "", config.lineSeparator || undefined);
          var selection = config.selection || EditorSelection.default;
          if (!$config.multipleSelections)
              selection = selection.asSingle();
          var state = new EditorState($config, doc, selection);
          for (var _i = 0, _a = $config.fields; _i < _a.length; _i++) {
              var field = _a[_i];
              state[field.key] = field.init(state);
          }
          return state;
      };
      return EditorState;
  }());

  var _a = typeof navigator != "undefined"
      ? [navigator, document]
      : [{ userAgent: "", vendor: "", platform: "" }, { documentElement: { style: {} } }], nav = _a[0], doc = _a[1];
  var ie_edge = /Edge\/(\d+)/.exec(nav.userAgent);
  var ie_upto10 = /MSIE \d/.test(nav.userAgent);
  var ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(nav.userAgent);
  var ie = !!(ie_upto10 || ie_11up || ie_edge);
  var gecko = !ie && /gecko\/(\d+)/i.test(nav.userAgent);
  var chrome = !ie && /Chrome\/(\d+)/.exec(nav.userAgent);
  var webkit = !ie && 'WebkitAppearance' in doc.documentElement.style;
  var browser = {
      mac: /Mac/.test(nav.platform),
      ie: ie,
      ie_version: ie_upto10 ? doc.documentMode || 6 : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0,
      gecko: gecko,
      gecko_version: gecko ? +(/Firefox\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
      chrome: !!chrome,
      chrome_version: chrome ? +chrome[1] : 0,
      ios: !ie && /AppleWebKit/.test(nav.userAgent) && /Mobile\/\w+/.test(nav.userAgent),
      android: /Android\b/.test(nav.userAgent),
      webkit: webkit,
      safari: /Apple Computer/.test(nav.vendor),
      webkit_version: webkit ? +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0
  };

  var getRoot = typeof document == "undefined" || document.getRootNode ?
      function (dom) {
          var root = dom.getRootNode();
          return root.nodeType == 9 || root.nodeType == 11 ? root : document;
      } : function () { return document; };
  // Work around Chrome issue https://bugs.chromium.org/p/chromium/issues/detail?id=447523
  // (isCollapsed inappropriately returns true in shadow dom)
  function selectionCollapsed(domSel) {
      var collapsed = domSel.isCollapsed;
      if (collapsed && browser.chrome && domSel.rangeCount && !domSel.getRangeAt(0).collapsed)
          collapsed = false;
      return collapsed;
  }
  function hasSelection(dom) {
      var sel = getRoot(dom).getSelection();
      if (!sel.anchorNode)
          return false;
      try {
          // Firefox will raise 'permission denied' errors when accessing
          // properties of `sel.anchorNode` when it's in a generated CSS
          // element.
          return dom.contains(sel.anchorNode.nodeType == 3 ? sel.anchorNode.parentNode : sel.anchorNode);
      }
      catch (_) {
          return false;
      }
  }
  function clientRectsFor(dom) {
      if (dom.nodeType == 3) {
          var range = document.createRange();
          range.setEnd(dom, dom.nodeValue.length);
          range.setStart(dom, 0);
          return range.getClientRects();
      }
      else if (dom.nodeType == 1) {
          return dom.getClientRects();
      }
      else {
          return [];
      }
  }
  // Scans forward and backward through DOM positions equivalent to the
  // given one to see if the two are in the same place (i.e. after a
  // text node vs at the end of that text node)
  function isEquivalentPosition(node, off, targetNode, targetOff) {
      return targetNode ? (scanFor(node, off, targetNode, targetOff, -1) ||
          scanFor(node, off, targetNode, targetOff, 1)) : false;
  }
  function domIndex(node) {
      for (var index = 0;; index++) {
          node = node.previousSibling;
          if (!node)
              return index;
      }
  }
  function scanFor(node, off, targetNode, targetOff, dir) {
      for (;;) {
          if (node == targetNode && off == targetOff)
              return true;
          if (off == (dir < 0 ? 0 : maxOffset(node))) {
              if (node.nodeName == "DIV" || node.nodeName == "PRE")
                  return false;
              var parent_1 = node.parentNode;
              if (!parent_1 || parent_1.nodeType != 1)
                  return false;
              off = domIndex(node) + (dir < 0 ? 0 : 1);
              node = parent_1;
          }
          else if (node.nodeType == 1) {
              node = node.childNodes[off + (dir < 0 ? -1 : 0)];
              off = dir < 0 ? maxOffset(node) : 0;
          }
          else {
              return false;
          }
      }
  }
  function maxOffset(node) {
      return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function windowRect(win) {
      return { left: 0, right: win.innerWidth,
          top: 0, bottom: win.innerHeight };
  }
  function scrollRectIntoView(dom, rect) {
      var scrollThreshold = 0, scrollMargin = 5;
      var doc = dom.ownerDocument, win = doc.defaultView;
      var gutterCover = 0, prev = dom.previousSibling;
      if (prev && getComputedStyle(prev).position == "sticky")
          gutterCover = dom.offsetLeft;
      for (var cur = dom.parentNode; cur;) {
          if (cur.nodeType == 1) { // Element or document
              var bounding = void 0, top_1 = cur == document.body;
              if (top_1) {
                  bounding = windowRect(win);
              }
              else {
                  if (cur.scrollHeight <= cur.clientHeight && cur.scrollWidth <= cur.clientWidth) {
                      cur = cur.parentNode;
                      continue;
                  }
                  var rect_1 = cur.getBoundingClientRect();
                  bounding = { left: rect_1.left, right: rect_1.left + cur.clientWidth,
                      top: rect_1.top, bottom: rect_1.top + cur.clientHeight };
              }
              var moveX = 0, moveY = 0;
              if (rect.top < bounding.top + scrollThreshold)
                  moveY = -(bounding.top - rect.top + scrollMargin);
              else if (rect.bottom > bounding.bottom - scrollThreshold)
                  moveY = rect.bottom - bounding.bottom + scrollMargin;
              if (rect.left < bounding.left + gutterCover + scrollThreshold)
                  moveX = -(bounding.left + gutterCover - rect.left + scrollMargin);
              else if (rect.right > bounding.right - scrollThreshold)
                  moveX = rect.right - bounding.right + scrollMargin;
              if (moveX || moveY) {
                  if (top_1) {
                      win.scrollBy(moveX, moveY);
                  }
                  else {
                      if (moveY)
                          cur.scrollTop += moveY;
                      if (moveX)
                          cur.scrollLeft += moveX;
                      rect = { left: rect.left - moveX, top: rect.top - moveY,
                          right: rect.right - moveX, bottom: rect.bottom - moveY };
                  }
              }
              if (top_1)
                  break;
              cur = cur.parentNode;
          }
          else if (cur.nodeType == 11) { // A shadow root
              cur = cur.host;
          }
          else {
              break;
          }
      }
  }
  var DOMSelection = /** @class */ (function () {
      function DOMSelection() {
          this.anchorNode = null;
          this.anchorOffset = 0;
          this.focusNode = null;
          this.focusOffset = 0;
      }
      DOMSelection.prototype.eq = function (domSel) {
          return this.anchorNode == domSel.anchorNode && this.anchorOffset == domSel.anchorOffset &&
              this.focusNode == domSel.focusNode && this.focusOffset == domSel.focusOffset;
      };
      DOMSelection.prototype.set = function (domSel) {
          this.anchorNode = domSel.anchorNode;
          this.anchorOffset = domSel.anchorOffset;
          this.focusNode = domSel.focusNode;
          this.focusOffset = domSel.focusOffset;
      };
      return DOMSelection;
  }());

  var none = [];
  var ContentView = /** @class */ (function () {
      function ContentView(parent, dom) {
          this.parent = parent;
          this.dom = dom;
          this.dirty = 2 /* node */;
          if (dom)
              dom.cmView = this;
          if (parent)
              this.markParentsDirty();
      }
      Object.defineProperty(ContentView.prototype, "childGap", {
          get: function () { return 0; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(ContentView.prototype, "overrideDOMText", {
          get: function () { return null; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(ContentView.prototype, "posAtStart", {
          get: function () {
              return this.parent ? this.parent.posBefore(this) : 0;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(ContentView.prototype, "posAtEnd", {
          get: function () {
              return this.posAtStart + this.length;
          },
          enumerable: true,
          configurable: true
      });
      ContentView.prototype.posBefore = function (view) {
          var pos = this.posAtStart;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var child = _a[_i];
              if (child == view)
                  return pos;
              pos += child.length + this.childGap;
          }
          throw new RangeError("Invalid child in posBefore");
      };
      ContentView.prototype.posAfter = function (view) {
          return this.posBefore(view) + view.length;
      };
      ContentView.prototype.coordsAt = function (pos) {
          for (var off = 0, i = 0; i < this.children.length; i++) {
              var child = this.children[i], end = off + child.length;
              if (end >= pos && (end != off || this.childGap))
                  return child.coordsAt(pos - off);
              off = end + this.childGap;
          }
          return null;
      };
      ContentView.prototype.syncInto = function (parent, pos) {
          return syncNodeInto(parent, pos, this.dom);
      };
      ContentView.prototype.syncDOMChildren = function () {
          var parent = this.dom, pos = parent.firstChild;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var view = _a[_i];
              pos = view.syncInto(parent, pos);
          }
          while (pos)
              pos = rm(pos);
      };
      ContentView.prototype.sync = function () {
          if (this.dirty & 2 /* node */)
              this.syncDOMChildren();
          if (this.dirty & 1 /* child */)
              for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
                  var child = _a[_i];
                  if (child.dirty)
                      child.sync();
              }
          this.dirty = 0 /* not */;
      };
      ContentView.prototype.domFromPos = function (pos) { return null; };
      ContentView.prototype.localPosFromDOM = function (node, offset) {
          var after;
          if (node == this.dom) {
              after = this.dom.childNodes[offset];
          }
          else {
              var bias = maxOffset(node) == 0 ? 0 : offset == 0 ? -1 : 1;
              for (;;) {
                  var parent_1 = node.parentNode;
                  if (parent_1 == this.dom)
                      break;
                  if (bias == 0 && parent_1.firstChild != parent_1.lastChild) {
                      if (node == parent_1.firstChild)
                          bias = -1;
                      else
                          bias = 1;
                  }
                  node = parent_1;
              }
              if (bias < 0)
                  after = node;
              else
                  after = node.nextSibling;
          }
          if (after == this.dom.firstChild)
              return 0;
          while (after && !after.cmView)
              after = after.nextSibling;
          if (!after)
              return this.length;
          for (var i = 0, pos = 0;; i++) {
              var child = this.children[i];
              if (child.dom == after)
                  return pos;
              pos += child.length + this.childGap;
          }
      };
      ContentView.prototype.domBoundsAround = function (from, to, offset) {
          if (offset === void 0) { offset = 0; }
          var fromI = -1, fromStart = -1, toI = -1, toEnd = -1;
          for (var i = 0, pos = offset; i < this.children.length; i++) {
              var child = this.children[i], end = pos + child.length;
              if (pos < from && end > to)
                  return child.domBoundsAround(from, to, pos);
              if (end >= from && fromI == -1) {
                  fromI = i;
                  fromStart = pos;
              }
              if (end >= to && toI == -1) {
                  toI = i;
                  toEnd = end;
                  break;
              }
              pos = end + this.childGap;
          }
          return { from: fromStart, to: toEnd,
              startDOM: (fromI ? this.children[fromI - 1].dom.nextSibling : null) || this.dom.firstChild,
              endDOM: toI < this.children.length - 1 ? this.children[toI + 1].dom : null };
      };
      // FIXME track precise dirty ranges, to avoid full DOM sync on every touched node?
      ContentView.prototype.markDirty = function () {
          if (this.dirty & 2 /* node */)
              return;
          this.dirty |= 2 /* node */;
          this.markParentsDirty();
      };
      ContentView.prototype.markParentsDirty = function () {
          for (var parent_2 = this.parent; parent_2; parent_2 = parent_2.parent) {
              if (parent_2.dirty & 1 /* child */)
                  return;
              parent_2.dirty |= 1 /* child */;
          }
      };
      ContentView.prototype.setParent = function (parent) {
          if (this.parent != parent) {
              this.parent = parent;
              if (this.dirty)
                  this.markParentsDirty();
          }
      };
      Object.defineProperty(ContentView.prototype, "root", {
          get: function () {
              for (var v = this;;) {
                  var parent_3 = v.parent;
                  if (!parent_3)
                      return v;
                  v = parent_3;
              }
          },
          enumerable: true,
          configurable: true
      });
      ContentView.prototype.replaceChildren = function (from, to, children) {
          if (children === void 0) { children = none; }
          var _a;
          (_a = this.children).splice.apply(_a, [from, to - from].concat(children));
          this.markDirty();
      };
      ContentView.prototype.ignoreMutation = function (rec) { return false; };
      ContentView.prototype.ignoreEvent = function (event) { return false; };
      ContentView.prototype.childPos = function (pos, bias) {
          if (bias === void 0) { bias = 1; }
          return new ChildCursor(this.children, this.length, this.childGap).findPos(pos, bias);
      };
      return ContentView;
  }());
  // Remove a DOM node and return its next sibling.
  function rm(dom) {
      var next = dom.nextSibling;
      dom.parentNode.removeChild(dom);
      return next;
  }
  function syncNodeInto(parent, pos, dom) {
      if (dom.parentNode == parent) {
          while (pos != dom)
              pos = rm(pos);
          pos = dom.nextSibling;
      }
      else {
          parent.insertBefore(dom, pos);
      }
      return pos;
  }
  var ChildCursor = /** @class */ (function () {
      function ChildCursor(children, pos, gap, i) {
          if (gap === void 0) { gap = 0; }
          if (i === void 0) { i = children.length; }
          this.children = children;
          this.pos = pos;
          this.gap = gap;
          this.i = i;
          this.off = 0;
          this.pos += gap;
      }
      ChildCursor.prototype.findPos = function (pos, bias) {
          if (bias === void 0) { bias = 1; }
          for (;;) {
              if (pos > this.pos || pos == this.pos && (bias > 0 || this.i == 0)) {
                  this.off = pos - this.pos;
                  return this;
              }
              this.pos -= this.children[--this.i].length + this.gap;
          }
      };
      return ChildCursor;
  }());

  var Range = /** @class */ (function () {
      function Range(from, to, value) {
          this.from = from;
          this.to = to;
          this.value = value;
      }
      /** @internal */
      Range.prototype.map = function (changes, oldOffset, newOffset) {
          var mapped = this.value.map(changes, this.from + oldOffset, this.to + oldOffset);
          if (mapped) {
              mapped.from -= newOffset;
              mapped.to -= newOffset;
          }
          return mapped;
      };
      /** @internal */
      Range.prototype.move = function (offset) {
          return offset ? new Range(this.from + offset, this.to + offset, this.value) : this;
      };
      Object.defineProperty(Range.prototype, "heapPos", {
          /** @internal Here so that we can put active ranges on a heap
           * and take them off at their end */
          get: function () { return this.to; },
          enumerable: true,
          configurable: true
      });
      return Range;
  }());
  var none$1 = [];
  function maybeNone(array) { return array.length ? array : none$1; }
  var BASE_NODE_SIZE_SHIFT = 5, BASE_NODE_SIZE = 1 << BASE_NODE_SIZE_SHIFT;
  var RangeSet = /** @class */ (function () {
      // @internal
      function RangeSet(
      // @internal The text length covered by this set
      length, 
      // The number of ranges in the set
      size, 
      // @internal The locally stored ranges—which are all of them
      // for leaf nodes, and the ones that don't fit in child sets for
      // non-leaves. Sorted by start position, then bias.
      local, 
      // @internal The child sets, in position order. Their total
      // length may be smaller than .length if the end is empty (never
      // greater)
      children) {
          this.length = length;
          this.size = size;
          this.local = local;
          this.children = children;
      }
      RangeSet.prototype.update = function (added, filter, filterFrom, filterTo) {
          if (added === void 0) { added = none$1; }
          if (filter === void 0) { filter = null; }
          if (filterFrom === void 0) { filterFrom = 0; }
          if (filterTo === void 0) { filterTo = this.length; }
          var maxLen = added.reduce(function (l, d) { return Math.max(l, d.to); }, this.length);
          return this.updateInner(added.length ? added.slice().sort(byPos) : added, filter, filterFrom, filterTo, 0, maxLen);
      };
      /** @internal */
      RangeSet.prototype.updateInner = function (added, filter, filterFrom, filterTo, offset, length) {
          // The new local ranges. Null means no changes were made yet
          var local = filterRanges(this.local, filter, filterFrom, filterTo, offset);
          // The new array of child sets, if changed
          var children = null;
          var size = 0;
          var decI = 0, pos = offset;
          // Iterate over the child sets, applying filters and pushing added
          // ranges into them
          for (var i = 0; i < this.children.length; i++) {
              var child = this.children[i];
              var endPos = pos + child.length, localRanges = null;
              while (decI < added.length) {
                  var next = added[decI];
                  if (next.from >= endPos)
                      break;
                  decI++;
                  if (next.to > endPos) {
                      if (!local)
                          local = this.local.slice();
                      insertSorted(local, next.move(-offset));
                  }
                  else {
                      (localRanges || (localRanges = [])).push(next);
                  }
              }
              var newChild = child;
              if (localRanges || filter && filterFrom <= endPos && filterTo >= pos)
                  newChild = newChild.updateInner(localRanges || none$1, filter, filterFrom, filterTo, pos, newChild.length);
              if (newChild != child)
                  (children || (children = this.children.slice(0, i))).push(newChild);
              else if (children)
                  children.push(newChild);
              size += newChild.size;
              pos = endPos;
          }
          // If nothing was actually updated, return the existing object
          if (!local && !children && decI == added.length)
              return this;
          // Compute final size
          size += (local || this.local).length + added.length - decI;
          // This is a small node—turn it into a flat leaf
          if (size <= BASE_NODE_SIZE)
              return collapseSet(children || this.children, local || this.local.slice(), added, decI, offset, length);
          var childSize = Math.max(BASE_NODE_SIZE, size >> BASE_NODE_SIZE_SHIFT);
          if (decI < added.length) {
              if (!children)
                  children = this.children.slice();
              if (!local)
                  local = this.local.slice();
              appendRanges(local, children, added, decI, offset, length, pos, childSize);
          }
          if (children) {
              if (!local)
                  local = this.local.slice();
              rebalanceChildren(local, children, childSize);
          }
          return new RangeSet(length, size, maybeNone(local || this.local), maybeNone(children || this.children));
      };
      RangeSet.prototype.grow = function (length) {
          return new RangeSet(this.length + length, this.size, this.local, this.children);
      };
      // Collect all ranges in this set into the target array,
      // offsetting them by `offset`
      RangeSet.prototype.collect = function (target, offset) {
          for (var _i = 0, _a = this.local; _i < _a.length; _i++) {
              var range = _a[_i];
              target.push(range.move(offset));
          }
          for (var _b = 0, _c = this.children; _b < _c.length; _b++) {
              var child = _c[_b];
              child.collect(target, offset);
              offset += child.length;
          }
      };
      RangeSet.prototype.map = function (changes) {
          if (changes.length == 0 || this == RangeSet.empty)
              return this;
          return this.mapInner(changes, 0, 0, changes.mapPos(this.length, 1)).set;
      };
      // Child boundaries are always mapped forward. This may cause ranges
      // at the start of a set to end up sticking out before its new
      // start, if they map backward. Such ranges are returned in
      // `escaped`.
      RangeSet.prototype.mapInner = function (changes, oldStart, newStart, newEnd) {
          var newLocal = null;
          var escaped = null;
          var newLength = newEnd - newStart, newSize = 0;
          for (var i = 0; i < this.local.length; i++) {
              var range = this.local[i], mapped = range.map(changes, oldStart, newStart);
              var escape_1 = mapped != null && (mapped.from < 0 || mapped.to > newLength);
              if (newLocal == null && (range != mapped || escape_1))
                  newLocal = this.local.slice(0, i);
              if (escape_1)
                  (escaped || (escaped = [])).push(mapped);
              else if (newLocal && mapped)
                  newLocal.push(mapped);
          }
          var newChildren = null;
          for (var i = 0, oldPos = oldStart, newPos = newStart; i < this.children.length; i++) {
              var child = this.children[i], newChild = child;
              var oldChildEnd = oldPos + child.length;
              var newChildEnd = changes.mapPos(oldPos + child.length, 1);
              var touch = touchesChanges(oldPos, oldChildEnd, changes.changes);
              if (touch == 0 /* yes */) {
                  var inner = child.mapInner(changes, oldPos, newPos, newChildEnd);
                  newChild = inner.set;
                  if (inner.escaped)
                      for (var _i = 0, _a = inner.escaped; _i < _a.length; _i++) {
                          var range = _a[_i];
                          range = range.move(newPos - newStart);
                          if (range.from < 0 || range.to > newLength)
                              insertSorted(escaped || (escaped = []), range);
                          else
                              insertSorted(newLocal || (newLocal = this.local.slice()), range);
                      }
              }
              else if (touch == 2 /* covered */) {
                  newChild = RangeSet.empty.grow(newChildEnd - newPos);
              }
              if (newChild != child) {
                  if (newChildren == null)
                      newChildren = this.children.slice(0, i);
                  // If the node's content was completely deleted by mapping,
                  // drop the node—which is complicated by the need to
                  // distribute its length to another child when it's not the
                  // last child
                  if (newChild.size == 0 && (newChild.length == 0 || newChildren.length || i == this.children.length)) {
                      if (newChild.length > 0 && i > 0) {
                          var last = newChildren.length - 1, lastChild = newChildren[last];
                          newChildren[last] = new RangeSet(lastChild.length + newChild.length, lastChild.size, lastChild.local, lastChild.children);
                      }
                  }
                  else {
                      newChildren.push(newChild);
                  }
              }
              else if (newChildren) {
                  newChildren.push(newChild);
              }
              newSize += newChild.size;
              oldPos = oldChildEnd;
              newPos = newChildEnd;
          }
          var set = newLength == this.length && newChildren == null && newLocal == null
              ? this
              : new RangeSet(newLength, newSize + (newLocal || this.local).length, newLocal || this.local, newChildren || this.children);
          return { set: set, escaped: escaped };
      };
      RangeSet.prototype.forEach = function (f) { this.forEachInner(f, 0); };
      RangeSet.prototype.forEachInner = function (f, offset) {
          for (var _i = 0, _a = this.local; _i < _a.length; _i++) {
              var range = _a[_i];
              f(range.from + offset, range.to + offset, range.value);
          }
          for (var _b = 0, _c = this.children; _b < _c.length; _b++) {
              var child = _c[_b];
              child.forEachInner(f, offset);
              offset += child.length;
          }
      };
      RangeSet.prototype.iter = function () {
          var heap = [];
          if (this.size > 0) {
              addIterToHeap(heap, [new IteratedSet(0, this)], 0);
              if (this.local.length)
                  addToHeap(heap, new LocalSet(0, this.local));
          }
          return {
              next: function () {
                  if (heap.length == 0)
                      return;
                  var next = takeFromHeap(heap);
                  if (next instanceof LocalSet) {
                      var range = next.ranges[next.index].move(next.offset);
                      // Put the rest of the set back onto the heap
                      if (++next.index < next.ranges.length)
                          addToHeap(heap, next);
                      else if (next.next)
                          addIterToHeap(heap, next.next, 0);
                      return range;
                  }
                  else { // It is a range
                      return next;
                  }
              }
          };
      };
      RangeSet.prototype.compare = function (other, textDiff, comparator, oldLen) {
          var oldPos = 0, newPos = 0;
          for (var _i = 0, textDiff_1 = textDiff; _i < textDiff_1.length; _i++) {
              var range = textDiff_1[_i];
              if (range.fromB > newPos && (this != other || oldPos != newPos))
                  new RangeSetComparison(this, oldPos, other, newPos, range.fromB, comparator).run();
              oldPos = range.toA;
              newPos = range.toB;
          }
          if (oldPos < this.length || newPos < other.length)
              new RangeSetComparison(this, oldPos, other, newPos, newPos + (oldLen - oldPos), comparator).run();
      };
      RangeSet.iterateSpans = function (sets, from, to, iterator) {
          var heap = [];
          for (var _i = 0, sets_1 = sets; _i < sets_1.length; _i++) {
              var set = sets_1[_i];
              if (set.size > 0) {
                  addIterToHeap(heap, [new IteratedSet(0, set)], from);
                  if (set.local.length)
                      addToHeap(heap, new LocalSet(0, set.local));
              }
          }
          var active = [];
          while (heap.length > 0) {
              var next = takeFromHeap(heap);
              if (next instanceof LocalSet) {
                  var range = next.ranges[next.index];
                  if (range.from + next.offset > to)
                      break;
                  if (range.to + next.offset >= from) {
                      if (range.from < range.to && !iterator.ignoreRange(range.value)) {
                          range = range.move(next.offset);
                          iterator.advance(range.from, active);
                          var collapsed = range.value.collapsed;
                          if (collapsed) {
                              from = range.to;
                              iterator.advanceCollapsed(Math.min(from, to), range.value);
                          }
                          else {
                              active.push(range.value);
                              addToHeap(heap, range);
                          }
                      }
                      else if (range.from == range.to && !iterator.ignorePoint(range.value)) {
                          iterator.advance(range.from, active);
                          iterator.point(range.value);
                      }
                  }
                  // Put the rest of the set back onto the heap
                  if (++next.index < next.ranges.length)
                      addToHeap(heap, next);
                  else if (next.next)
                      addIterToHeap(heap, next.next, from);
              }
              else { // It is a range that ends here
                  var range = next;
                  if (range.to >= to)
                      break;
                  iterator.advance(range.to, active);
                  active.splice(active.indexOf(range.value), 1);
              }
          }
          iterator.advance(to, active);
      };
      RangeSet.of = function (ranges) {
          return RangeSet.empty.update(ranges instanceof Range ? [ranges] : ranges);
      };
      RangeSet.empty = new RangeSet(0, 0, none$1, none$1);
      return RangeSet;
  }());
  // Stack element for iterating over a range set
  var IteratedSet = /** @class */ (function () {
      function IteratedSet(offset, set) {
          this.offset = offset;
          this.set = set;
          // Index == -1 means the set's locals have not been yielded yet.
          // Otherwise this is an index in the set's child array.
          this.index = 0;
      }
      return IteratedSet;
  }());
  // Cursor into a node-local set of ranges
  var LocalSet = /** @class */ (function () {
      function LocalSet(offset, ranges, next) {
          if (next === void 0) { next = null; }
          this.offset = offset;
          this.ranges = ranges;
          this.next = next;
          this.index = 0;
      }
      Object.defineProperty(LocalSet.prototype, "heapPos", {
          // Used to make this conform to Heapable
          get: function () { return this.ranges[this.index].from + this.offset; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(LocalSet.prototype, "value", {
          get: function () { return this.ranges[this.index].value; },
          enumerable: true,
          configurable: true
      });
      return LocalSet;
  }());
  function iterRangeSet(stack, skipTo) {
      if (skipTo === void 0) { skipTo = 0; }
      for (;;) {
          if (stack.length == 0)
              break;
          var top_1 = stack[stack.length - 1];
          if (top_1.index == top_1.set.children.length) {
              stack.pop();
          }
          else {
              var next = top_1.set.children[top_1.index], start = top_1.offset;
              top_1.index++;
              top_1.offset += next.length;
              if (top_1.offset >= skipTo) {
                  stack.push(new IteratedSet(start, next));
                  break;
              }
          }
      }
  }
  function compareHeapable(a, b) {
      return a.heapPos - b.heapPos || a.value.bias - b.value.bias;
  }
  function addIterToHeap(heap, stack, skipTo) {
      if (skipTo === void 0) { skipTo = 0; }
      for (;;) {
          iterRangeSet(stack, skipTo);
          if (stack.length == 0)
              break;
          var next = stack[stack.length - 1], local = next.set.local;
          var leaf = next.set.children.length ? null : stack;
          if (local.length)
              addToHeap(heap, new LocalSet(next.offset, local, leaf));
          if (leaf)
              break;
      }
  }
  function addToHeap(heap, elt) {
      var index = heap.push(elt) - 1;
      while (index > 0) {
          var parentIndex = index >> 1, parent_1 = heap[parentIndex];
          if (compareHeapable(elt, parent_1) >= 0)
              break;
          heap[index] = parent_1;
          heap[parentIndex] = elt;
          index = parentIndex;
      }
  }
  function takeFromHeap(heap) {
      var elt = heap[0], replacement = heap.pop();
      if (heap.length == 0)
          return elt;
      heap[0] = replacement;
      for (var index = 0;;) {
          var childIndex = (index << 1) + 1;
          if (childIndex >= heap.length)
              break;
          var child = heap[childIndex];
          if (childIndex + 1 < heap.length && compareHeapable(child, heap[childIndex + 1]) >= 0) {
              child = heap[childIndex + 1];
              childIndex++;
          }
          if (compareHeapable(replacement, child) < 0)
              break;
          heap[childIndex] = replacement;
          heap[index] = child;
          index = childIndex;
      }
      return elt;
  }
  function byPos(a, b) {
      return a.from - b.from || a.value.bias - b.value.bias;
  }
  function insertSorted(target, range) {
      var i = target.length;
      while (i > 0 && byPos(target[i - 1], range) >= 0)
          i--;
      target.splice(i, 0, range);
  }
  function filterRanges(ranges, filter, filterFrom, filterTo, offset) {
      if (!filter)
          return null;
      var copy = null;
      for (var i = 0; i < ranges.length; i++) {
          var range = ranges[i], from = range.from + offset, to = range.to + offset;
          if (filterFrom > to || filterTo < from || filter(from, to, range.value)) {
              if (copy != null)
                  copy.push(range);
          }
          else {
              if (copy == null)
                  copy = ranges.slice(0, i);
          }
      }
      return copy;
  }
  function collapseSet(children, local, add, start, offset, length) {
      var mustSort = local.length > 0 && add.length > 0, off = 0;
      for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
          var child = children_1[_i];
          child.collect(local, -off);
          off += child.length;
      }
      for (var _a = 0, add_1 = add; _a < add_1.length; _a++) {
          var added = add_1[_a];
          local.push(added.move(-offset));
      }
      if (mustSort)
          local.sort(byPos);
      return new RangeSet(length, local.length, local, none$1);
  }
  function appendRanges(local, children, ranges, start, offset, length, pos, childSize) {
      // Group added ranges after the current children into new
      // children (will usually only happen when initially creating a
      // node or adding stuff to the top-level node)
      for (var i = start; i < ranges.length;) {
          var add = [];
          var end = Math.min(i + childSize, ranges.length);
          var endPos = end == ranges.length ? offset + length : ranges[end].from;
          for (; i < end; i++) {
              var range = ranges[i];
              if (range.to > endPos)
                  insertSorted(local, range.move(-offset));
              else
                  add.push(range);
          }
          // Move locals that fit in this new child from `local` to `add`
          for (var i_1 = 0; i_1 < local.length; i_1++) {
              var range = local[i_1];
              if (range.from >= pos && range.to <= endPos) {
                  local.splice(i_1--, 1);
                  insertSorted(add, range.move(offset));
              }
          }
          if (add.length) {
              if (add.length == ranges.length)
                  children.push(new RangeSet(endPos - pos, add.length, add.map(function (r) { return r.move(-pos); }), none$1));
              else
                  children.push(RangeSet.empty.updateInner(add, null, 0, 0, pos, endPos - pos));
              pos = endPos;
          }
      }
  }
  // FIXME try to clean this up
  function rebalanceChildren(local, children, childSize) {
      var _loop_1 = function (i, off) {
          var child = children[i], next = void 0;
          if (child.size == 0 && (i > 0 || children.length == 1)) {
              // Drop empty node
              children.splice(i--, 1);
              if (i >= 0)
                  children[i] = children[i].grow(child.length);
          }
          else if (child.size > (childSize << 1) && child.local.length < (child.length >> 1)) {
              // Unwrap an overly big node
              for (var _i = 0, _a = child.local; _i < _a.length; _i++) {
                  var range = _a[_i];
                  insertSorted(local, range.move(off));
              }
              children.splice.apply(children, [i, 1].concat(child.children));
          }
          else if (child.children.length == 0 && i < children.length - 1 &&
              (next = children[i + 1]).size + child.size <= BASE_NODE_SIZE &&
              next.children.length == 0) {
              // Join two small leaf nodes
              children.splice(i, 2, new RangeSet(child.length + next.length, child.size + next.size, child.local.concat(next.local.map(function (d) { return d.move(child.length); })), none$1));
          }
          else {
              // Join a number of nodes into a wrapper node
              var joinTo = i + 1, size = child.size, length_1 = child.length;
              if (child.size < (childSize >> 1)) {
                  for (; joinTo < children.length; joinTo++) {
                      var next_1 = children[joinTo], totalSize = size + next_1.size;
                      if (totalSize > childSize)
                          break;
                      size = totalSize;
                      length_1 += next_1.length;
                  }
              }
              if (joinTo > i + 1) {
                  var joined = new RangeSet(length_1, size, none$1, children.slice(i, joinTo));
                  var joinedLocals = [];
                  for (var j = 0; j < local.length; j++) {
                      var range = local[j];
                      if (range.from >= off && range.to <= off + length_1) {
                          local.splice(j--, 1);
                          joinedLocals.push(range.move(-off));
                      }
                  }
                  if (joinedLocals.length)
                      joined = joined.update(joinedLocals.sort(byPos));
                  children.splice(i, joinTo - i, joined);
                  i++;
                  off += length_1;
              }
              else {
                  i++;
                  off += child.length;
              }
          }
          out_i_1 = i;
          out_off_1 = off;
      };
      var out_i_1, out_off_1;
      for (var i = 0, off = 0; i < children.length;) {
          _loop_1(i, off);
          i = out_i_1;
          off = out_off_1;
      }
  }
  var SIDE_A = 1, SIDE_B = 2;
  var ComparisonSide = /** @class */ (function () {
      function ComparisonSide(stack) {
          this.stack = stack;
          this.heap = [];
          this.active = [];
          this.activeTo = [];
          this.points = [];
          this.tip = null;
          this.collapsedBy = null;
          this.collapsedTo = -1;
      }
      ComparisonSide.prototype.forward = function (start, next) {
          var newTip = false;
          if (next.set.local.length) {
              var local = new LocalSet(next.offset, next.set.local);
              addToHeap(this.heap, local);
              if (!next.set.children.length) {
                  this.tip = local;
                  newTip = true;
              }
          }
          iterRangeSet(this.stack, start);
          return newTip;
      };
      ComparisonSide.prototype.findActive = function (to, value) {
          for (var i = 0; i < this.active.length; i++)
              if (this.activeTo[i] == to && this.active[i] == value)
                  return i;
          return -1;
      };
      return ComparisonSide;
  }());
  var RangeSetComparison = /** @class */ (function () {
      function RangeSetComparison(a, startA, b, startB, endB, comparator) {
          this.comparator = comparator;
          this.a = new ComparisonSide([new IteratedSet(startB - startA, a)]);
          this.b = new ComparisonSide([new IteratedSet(0, b)]);
          this.pos = startB;
          this.end = endB;
          this.forwardIter(SIDE_A | SIDE_B);
      }
      RangeSetComparison.prototype.forwardIter = function (side) {
          for (; side > 0;) {
              var nextA = this.a.stack.length ? this.a.stack[this.a.stack.length - 1] : null;
              var nextB = this.b.stack.length ? this.b.stack[this.b.stack.length - 1] : null;
              if (nextA && nextB && nextA.offset == nextB.offset && nextA.set == nextB.set) {
                  iterRangeSet(this.a.stack, this.pos);
                  iterRangeSet(this.b.stack, this.pos);
              }
              else if (nextA && (!nextB || (nextA.offset < nextB.offset ||
                  nextA.offset == nextB.offset && (this.a.stack.length == 1 ||
                      nextA.set.length >= nextB.set.length)))) {
                  if (this.a.forward(this.pos, nextA))
                      side = side & ~SIDE_A;
              }
              else if (nextB) {
                  if (this.b.forward(this.pos, nextB))
                      side = side & ~SIDE_B;
              }
              else {
                  break;
              }
          }
      };
      RangeSetComparison.prototype.run = function () {
          var heapA = this.a.heap, heapB = this.b.heap;
          for (;;) {
              if (heapA.length && (!heapB.length || compareHeapable(heapA[0], heapB[0]) < 0)) {
                  this.advance(this.a, this.b);
              }
              else if (heapB.length) {
                  this.advance(this.b, this.a);
              }
              else {
                  this.comparator.comparePoints(this.pos, this.a.points, this.b.points);
                  break;
              }
          }
      };
      RangeSetComparison.prototype.advancePos = function (pos) {
          if (pos > this.end)
              pos = this.end;
          if (pos <= this.pos)
              return;
          this.handlePoints();
          this.comparator.compareRange(this.pos, pos, this.a.active, this.b.active);
          this.pos = pos;
      };
      RangeSetComparison.prototype.handlePoints = function () {
          if (this.a.points.length || this.b.points.length) {
              this.comparator.comparePoints(this.pos, this.a.points, this.b.points);
              this.a.points.length = this.b.points.length = 0;
          }
      };
      RangeSetComparison.prototype.advance = function (side, otherSide) {
          var next = takeFromHeap(side.heap);
          if (next instanceof LocalSet) {
              var range = next.ranges[next.index++];
              if (range.from + next.offset > this.end) {
                  side.heap.length = 0;
                  this.pos = this.end;
                  return;
              }
              if (range.from < range.to && range.to + next.offset > this.pos) {
                  this.advancePos(range.from + next.offset);
                  var collapsed = range.value.collapsed;
                  if (collapsed) {
                      side.collapsedBy = range.value;
                      side.collapsedTo = Math.max(side.collapsedTo, range.to + next.offset);
                      // Skip regions that are collapsed on both sides
                      var collapsedTo = Math.min(this.a.collapsedTo, this.b.collapsedTo);
                      if (collapsedTo > this.pos) {
                          this.handlePoints();
                          this.comparator.compareCollapsed(this.pos, collapsedTo, this.a.collapsedBy, this.b.collapsedBy);
                          this.pos = collapsedTo;
                      }
                  }
                  this.addActiveRange(Math.min(this.end, range.to + next.offset), range.value, side, otherSide);
              }
              else if (range.from == range.to) {
                  this.advancePos(range.from + next.offset);
                  var found = otherSide.points.indexOf(range.value);
                  if (found > -1)
                      remove(otherSide.points, found);
                  else
                      side.points.push(range.value);
              }
              if (next.index < next.ranges.length)
                  addToHeap(side.heap, next);
              else if (next == this.a.tip)
                  this.forwardIter(SIDE_A);
              else if (next == this.b.tip)
                  this.forwardIter(SIDE_B);
          }
          else {
              var range = next;
              this.advancePos(range.to);
              var found = side.findActive(range.to, range.value);
              if (found > -1) {
                  remove(side.active, found);
                  remove(side.activeTo, found);
              }
          }
      };
      RangeSetComparison.prototype.addActiveRange = function (to, value, side, otherSide) {
          var found = otherSide.findActive(to, value);
          if (found > -1) {
              remove(otherSide.active, found);
              remove(otherSide.activeTo, found);
          }
          else {
              side.active.push(value);
              side.activeTo.push(to);
              addToHeap(side.heap, new Range(this.pos, to, value));
          }
      };
      return RangeSetComparison;
  }());
  function remove(array, index) {
      var last = array.pop();
      if (index != array.length)
          array[index] = last;
  }
  function touchesChanges(from, to, changes) {
      var result = 1 /* no */;
      for (var _i = 0, changes_1 = changes; _i < changes_1.length; _i++) {
          var change = changes_1[_i];
          if (change.to >= from && change.from <= to) {
              if (change.from < from && change.to > to)
                  result = 2 /* covered */;
              else if (result == 1 /* no */)
                  result = 0 /* yes */;
          }
          var diff = change.length - (change.to - change.from);
          if (from > change.from)
              from += diff;
          if (to > change.to)
              to += diff;
      }
      return result;
  }

  var WidgetType = /** @class */ (function () {
      function WidgetType(value) {
          this.value = value;
      }
      WidgetType.prototype.eq = function (value) { return this.value === value; };
      /** @internal */
      WidgetType.prototype.compare = function (other) {
          return this == other || this.constructor == other.constructor && this.eq(other.value);
      };
      Object.defineProperty(WidgetType.prototype, "estimatedHeight", {
          get: function () { return -1; },
          enumerable: true,
          configurable: true
      });
      WidgetType.prototype.ignoreEvent = function (event) { return true; };
      return WidgetType;
  }());
  var Decoration = /** @class */ (function () {
      // @internal
      function Decoration(
      // @internal
      bias, 
      // @internal
      widget, spec) {
          this.bias = bias;
          this.widget = widget;
          this.spec = spec;
      }
      Decoration.range = function (from, to, spec) {
          if (from >= to)
              throw new RangeError("Range decorations may not be empty");
          return new Range(from, to, new RangeDecoration(spec));
      };
      Decoration.widget = function (pos, spec) {
          return new Range(pos, pos, new WidgetDecoration(spec));
      };
      Decoration.line = function (pos, spec) {
          return new Range(pos, pos, new LineDecoration(spec));
      };
      Decoration.set = function (of) {
          return RangeSet.of(of);
      };
      Decoration.none = RangeSet.empty;
      return Decoration;
  }());
  var BIG_BIAS = 2e9;
  var RangeDecoration = /** @class */ (function (_super) {
      __extends(RangeDecoration, _super);
      function RangeDecoration(spec) {
          var _this = _super.call(this, spec.inclusiveStart === true ? -BIG_BIAS : BIG_BIAS, spec.collapsed instanceof WidgetType ? spec.collapsed : null, spec) || this;
          _this.spec = spec;
          _this.endBias = spec.inclusiveEnd == true ? BIG_BIAS : -BIG_BIAS;
          _this.collapsed = !!spec.collapsed;
          return _this;
      }
      RangeDecoration.prototype.map = function (mapping, from, to) {
          var newFrom = mapping.mapPos(from, this.bias, true), newTo = mapping.mapPos(to, this.endBias, true);
          if (newFrom < 0) {
              if (newTo < 0)
                  return null;
              newFrom = this.bias >= 0 ? -(newFrom + 1) : mapping.mapPos(from, 1);
          }
          else if (newTo < 0) {
              newTo = this.endBias < 0 ? -(newTo + 1) : mapping.mapPos(to, -1);
          }
          return newFrom < newTo ? new Range(newFrom, newTo, this) : null;
      };
      RangeDecoration.prototype.sameEffect = function (other) {
          return this == other ||
              this.spec.tagName == other.spec.tagName &&
                  this.spec.class == other.spec.class &&
                  this.collapsed == other.collapsed &&
                  widgetsEq(this.widget, other.widget) &&
                  attrsEq(this.spec.attributes, other.spec.attributes);
      };
      return RangeDecoration;
  }(Decoration));
  var WidgetDecoration = /** @class */ (function (_super) {
      __extends(WidgetDecoration, _super);
      function WidgetDecoration(spec) {
          var _this = _super.call(this, spec.side || 0, spec.widget || null, spec) || this;
          _this.spec = spec;
          return _this;
      }
      WidgetDecoration.prototype.map = function (mapping, pos) {
          pos = mapping.mapPos(pos, this.bias, true);
          return pos < 0 ? null : new Range(pos, pos, this);
      };
      WidgetDecoration.prototype.sameEffect = function (other) {
          return other instanceof WidgetDecoration && widgetsEq(this.widget, other.widget) && this.bias == other.bias;
      };
      return WidgetDecoration;
  }(Decoration));
  var LineDecoration = /** @class */ (function (_super) {
      __extends(LineDecoration, _super);
      function LineDecoration(spec) {
          return _super.call(this, -BIG_BIAS, spec.widget || null, spec) || this;
      }
      LineDecoration.prototype.map = function (mapping, pos) {
          for (var _i = 0, _a = mapping.changes; _i < _a.length; _i++) {
              var change = _a[_i];
              // If the line break before was deleted, drop this decoration
              if (change.from <= pos - 1 && change.to >= pos)
                  return null;
              if (change.from < pos)
                  pos += change.length - (change.to - change.from);
          }
          return new Range(pos, pos, this);
      };
      LineDecoration.prototype.sameEffect = function (other) {
          return other instanceof LineDecoration &&
              attrsEq(this.spec.attributes, other.spec.attributes) &&
              widgetsEq(this.widget, other.widget) &&
              this.side == other.side;
      };
      Object.defineProperty(LineDecoration.prototype, "side", {
          get: function () { return this.spec.side || 0; },
          enumerable: true,
          configurable: true
      });
      return LineDecoration;
  }(Decoration));
  function attrsEq(a, b) {
      if (a == b)
          return true;
      if (!a || !b)
          return false;
      var keysA = Object.keys(a), keysB = Object.keys(b);
      if (keysA.length != keysB.length)
          return false;
      for (var _i = 0, keysA_1 = keysA; _i < keysA_1.length; _i++) {
          var key = keysA_1[_i];
          if (keysB.indexOf(key) == -1 || a[key] !== b[key])
              return false;
      }
      return true;
  }
  function widgetsEq(a, b) {
      return a == b || !!(a && b && a.compare(b));
  }
  function compareSets(setA, setB) {
      if (setA.length != setB.length)
          return false;
      search: for (var _i = 0, setA_1 = setA; _i < setA_1.length; _i++) {
          var value = setA_1[_i];
          for (var _a = 0, setB_1 = setB; _a < setB_1.length; _a++) {
              var valueB = setB_1[_a];
              if (value.sameEffect(valueB))
                  continue search;
          }
          return false;
      }
      return true;
  }
  var MIN_RANGE_GAP = 4;
  function addRange(from, to, ranges) {
      if (ranges[ranges.length - 1] + MIN_RANGE_GAP > from)
          ranges[ranges.length - 1] = to;
      else
          ranges.push(from, to);
  }
  function joinRanges(a, b) {
      if (a.length == 0)
          return b;
      if (b.length == 0)
          return a;
      var result = [];
      for (var iA = 0, iB = 0;;) {
          if (iA < a.length && (iB == b.length || a[iA] < b[iB]))
              addRange(a[iA++], a[iA++], result);
          else if (iB < b.length)
              addRange(b[iB++], b[iB++], result);
          else
              break;
      }
      return result;
  }
  var Changes = /** @class */ (function () {
      function Changes() {
          this.content = [];
          this.height = [];
      }
      return Changes;
  }());
  var DecorationComparator = /** @class */ (function () {
      function DecorationComparator() {
          this.changes = new Changes;
      }
      DecorationComparator.prototype.compareRange = function (from, to, activeA, activeB) {
          if (!compareSets(activeA, activeB))
              addRange(from, to, this.changes.content);
      };
      DecorationComparator.prototype.compareCollapsed = function (from, to, byA, byB) {
          if (!widgetsEq(byA.widget, byB.widget)) {
              addRange(from, to, this.changes.content);
              addRange(from, to, this.changes.height);
          }
      };
      DecorationComparator.prototype.comparePoints = function (pos, pointsA, pointsB) {
          if (!compareSets(pointsA, pointsB)) {
              addRange(pos, pos, this.changes.content);
              if (pointsA.some(function (d) { return !!(d.widget && d.widget.estimatedHeight > -1); }) ||
                  pointsB.some(function (d) { return !!(d.widget && d.widget.estimatedHeight > -1); }))
                  addRange(pos, pos, this.changes.height);
          }
      };
      return DecorationComparator;
  }());
  function findChangedRanges(a, b, diff, docA) {
      var comp = new DecorationComparator();
      a.compare(b, diff, comp, docA.length);
      return comp.changes;
  }
  var HeightDecoScanner = /** @class */ (function () {
      function HeightDecoScanner() {
          this.ranges = [];
          this.pos = 0;
      }
      HeightDecoScanner.prototype.advance = function (pos, active) { this.pos = pos; };
      HeightDecoScanner.prototype.advanceCollapsed = function (pos) { addRange(this.pos, pos, this.ranges); this.pos = pos; };
      HeightDecoScanner.prototype.point = function (value) { addRange(this.pos, this.pos, this.ranges); };
      HeightDecoScanner.prototype.ignoreRange = function (value) { return true; };
      HeightDecoScanner.prototype.ignorePoint = function (value) { return !value.widget; };
      return HeightDecoScanner;
  }());
  function heightRelevantDecorations(decorations, ranges) {
      var scanner = new HeightDecoScanner;
      for (var _i = 0, ranges_1 = ranges; _i < ranges_1.length; _i++) {
          var _a = ranges_1[_i], fromB = _a.fromB, toB = _a.toB;
          if (fromB < toB) {
              scanner.pos = fromB;
              RangeSet.iterateSpans(decorations, fromB, toB, scanner);
          }
      }
      return scanner.ranges;
  }

  var none$2 = [];
  var InlineView = /** @class */ (function (_super) {
      __extends(InlineView, _super);
      function InlineView() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Object.defineProperty(InlineView.prototype, "children", {
          get: function () { return none$2; },
          enumerable: true,
          configurable: true
      });
      InlineView.prototype.cut = function (from, to) { };
      InlineView.prototype.getSide = function () { return 0; };
      InlineView.appendInline = function (a, b) {
          var i = 0;
          if (b.length && a.length) {
              var last = a[a.length - 1];
              if (last.merge(b[0], last.length))
                  i++;
          }
          for (; i < b.length; i++)
              a.push(b[i]);
          return a;
      };
      return InlineView;
  }(ContentView));
  var MAX_JOIN_LEN = 256;
  var TextView = /** @class */ (function (_super) {
      __extends(TextView, _super);
      function TextView(text, tagName, clss, attrs) {
          var _this = _super.call(this, null, null) || this;
          _this.text = text;
          _this.tagName = tagName;
          _this.attrs = attrs;
          _this.textDOM = null;
          _this.class = clss;
          return _this;
      }
      TextView.prototype.syncInto = function (parent, pos) {
          if (!this.dom) {
              var tagName = this.tagName || (this.attrs || this.class ? "span" : null);
              if (!tagName && pos && pos.nodeType == 3 && !nodeAlreadyInTree(this, pos))
                  this.textDOM = pos;
              else
                  this.textDOM = document.createTextNode(this.text);
              if (tagName) {
                  this.dom = document.createElement(tagName);
                  this.dom.appendChild(this.textDOM);
                  if (this.class)
                      this.dom.className = this.class;
                  if (this.attrs)
                      for (var name_1 in this.attrs)
                          this.dom.setAttribute(name_1, this.attrs[name_1]);
              }
              else {
                  this.dom = this.textDOM;
              }
              this.dom.cmView = this;
          }
          return _super.prototype.syncInto.call(this, parent, pos);
      };
      Object.defineProperty(TextView.prototype, "length", {
          get: function () { return this.text.length; },
          enumerable: true,
          configurable: true
      });
      TextView.prototype.sync = function () {
          if (this.dirty & 2 /* node */) {
              if (this.textDOM.nodeValue != this.text)
                  this.textDOM.nodeValue = this.text;
              var dom = this.dom;
              if (this.textDOM != dom && (this.dom.firstChild != this.textDOM || dom.lastChild != this.textDOM)) {
                  while (dom.firstChild)
                      dom.removeChild(dom.firstChild);
                  dom.appendChild(this.textDOM);
              }
          }
          this.dirty = 0 /* not */;
      };
      TextView.prototype.merge = function (other, from, to) {
          if (from === void 0) { from = 0; }
          if (to === void 0) { to = this.length; }
          if (!(other instanceof TextView) ||
              other.tagName != this.tagName || other.class != this.class ||
              !attrsEq(other.attrs, this.attrs) || this.length - (to - from) + other.length > MAX_JOIN_LEN)
              return false;
          this.text = this.text.slice(0, from) + other.text + this.text.slice(to);
          this.markDirty();
          return true;
      };
      TextView.prototype.cut = function (from, to) {
          if (to === void 0) { to = this.length; }
          this.text = this.text.slice(0, from) + this.text.slice(to);
          this.markDirty();
      };
      TextView.prototype.slice = function (from, to) {
          if (to === void 0) { to = this.length; }
          return new TextView(this.text.slice(from, to), this.tagName, this.class, this.attrs);
      };
      TextView.prototype.localPosFromDOM = function (node, offset) {
          return node == this.textDOM ? offset : offset ? this.text.length : 0;
      };
      TextView.prototype.domFromPos = function (pos) { return { node: this.textDOM, offset: pos }; };
      TextView.prototype.domBoundsAround = function (from, to, offset) {
          return { from: offset, to: offset + this.length, startDOM: this.dom, endDOM: this.dom.nextSibling };
      };
      TextView.prototype.coordsAt = function (pos) {
          var range = document.createRange();
          if (browser.chrome || browser.gecko) {
              // These browsers reliably return valid rectangles for empty ranges
              range.setEnd(this.textDOM, pos);
              range.setStart(this.textDOM, pos);
              return range.getBoundingClientRect();
          }
          else {
              // Otherwise, get the rectangle around a character and take one side
              var extend = pos == 0 ? 1 : -1;
              range.setEnd(this.textDOM, pos + (extend > 0 ? 1 : 0));
              range.setStart(this.textDOM, pos - (extend < 0 ? 1 : 0));
              var rect = range.getBoundingClientRect();
              var x = extend < 0 ? rect.right : rect.left;
              return { left: x, right: x, top: rect.top, bottom: rect.bottom };
          }
      };
      return TextView;
  }(InlineView));
  // Also used for collapsed ranges that don't have a placeholder widget!
  var WidgetView = /** @class */ (function (_super) {
      __extends(WidgetView, _super);
      function WidgetView(length, widget, side) {
          var _this = _super.call(this, null, null) || this;
          _this.length = length;
          _this.widget = widget;
          _this.side = side;
          return _this;
      }
      WidgetView.prototype.syncInto = function (parent, pos) {
          if (!this.dom) {
              this.dom = this.widget ? this.widget.toDOM() : document.createElement("span");
              this.dom.contentEditable = "false";
              this.dom.cmView = this;
          }
          return _super.prototype.syncInto.call(this, parent, pos);
      };
      WidgetView.prototype.cut = function (from, to) {
          if (to === void 0) { to = this.length; }
          this.length -= to - from;
      };
      WidgetView.prototype.slice = function (from, to) {
          if (to === void 0) { to = this.length; }
          return new WidgetView(to - from, this.widget, this.side);
      };
      WidgetView.prototype.sync = function () { this.dirty = 0 /* not */; };
      WidgetView.prototype.getSide = function () { return this.side; };
      WidgetView.prototype.merge = function (other, from, to) {
          if (from === void 0) { from = 0; }
          if (to === void 0) { to = this.length; }
          if (!(other instanceof WidgetView) || this.widget || other.widget)
              return false;
          this.length = from + other.length + (this.length - to);
          return true;
      };
      WidgetView.prototype.ignoreMutation = function () { return true; };
      WidgetView.prototype.ignoreEvent = function (event) { return this.widget ? this.widget.ignoreEvent(event) : false; };
      Object.defineProperty(WidgetView.prototype, "overrideDOMText", {
          get: function () {
              if (this.length == 0)
                  return [""];
              var top = this;
              while (top.parent)
                  top = top.parent;
              var text = top.text, start = this.posAtStart;
              return text ? text.sliceLines(start, start + this.length) : [""];
          },
          enumerable: true,
          configurable: true
      });
      WidgetView.prototype.domBoundsAround = function () { return null; };
      WidgetView.prototype.coordsAt = function (pos) {
          var rects = this.dom.getClientRects();
          for (var i = pos > 0 ? rects.length - 1 : 0;; i += (pos > 0 ? -1 : 1)) {
              var rect = rects[i];
              if (pos > 0 ? i == 0 : i == rects.length - 1 || rect.top < rect.bottom)
                  return rects[i];
          }
          return null;
      };
      return WidgetView;
  }(InlineView));
  var LineContent$1 = /** @class */ (function () {
      function LineContent(atStart) {
          if (atStart === void 0) { atStart = true; }
          this.atStart = atStart;
          this.elements = [];
          this.attrs = null;
          this.widgets = none$2;
      }
      LineContent.prototype.add = function (inline) {
          this.elements.push(inline);
          if (this.atStart && inline instanceof TextView)
              this.atStart = false;
      };
      LineContent.prototype.addLineDeco = function (deco) {
          var attrs = deco.spec.attributes;
          if (attrs) {
              if (!this.attrs)
                  this.attrs = {};
              for (var name_2 in attrs) {
                  if (name_2 == "class" && Object.prototype.hasOwnProperty.call(this.attrs, "class"))
                      this.attrs.class += " " + attrs.class;
                  else if (name_2 == "style" && Object.prototype.hasOwnProperty.call(this.attrs, "style"))
                      this.attrs.style += ";" + attrs.style;
                  else
                      this.attrs[name_2] = attrs[name_2];
              }
          }
          if (deco.widget) {
              if (this.widgets == none$2)
                  this.widgets = [];
              var pos = 0;
              while (pos < this.widgets.length && this.widgets[pos].side <= deco.side)
                  pos++;
              this.widgets.splice(pos, 0, new LineWidget(deco.widget, deco.side));
          }
      };
      return LineContent;
  }());
  var InlineBuilder = /** @class */ (function () {
      function InlineBuilder(text, pos) {
          this.pos = pos;
          this.text = "";
          this.textOff = 0;
          this.cursor = text.iter();
          this.skip = pos;
          this.lines = [new LineContent$1(text.lineAt(pos).start == pos)];
      }
      InlineBuilder.prototype.buildText = function (length, tagName, clss, attrs, ranges) {
          while (length > 0) {
              if (this.textOff == this.text.length) {
                  var _a = this.cursor.next(this.skip), value = _a.value, lineBreak = _a.lineBreak, done = _a.done;
                  this.skip = 0;
                  if (done)
                      throw new Error("Ran out of text content when drawing inline views");
                  if (lineBreak) {
                      this.lines.push(new LineContent$1);
                      length--;
                      continue;
                  }
                  else {
                      this.text = value;
                      this.textOff = 0;
                  }
              }
              var take = Math.min(this.text.length - this.textOff, length);
              this.curLine.add(new TextView(this.text.slice(this.textOff, this.textOff + take), tagName, clss, attrs));
              length -= take;
              this.textOff += take;
          }
      };
      InlineBuilder.prototype.advance = function (pos, active) {
          if (pos <= this.pos)
              return;
          var tagName = null, clss = null;
          var attrs = null;
          for (var _i = 0, _a = active; _i < _a.length; _i++) {
              var spec = _a[_i].spec;
              if (spec.tagName)
                  tagName = spec.tagName;
              if (spec.class)
                  clss = clss ? clss + " " + spec.class : spec.class;
              if (spec.attributes)
                  for (var name_3 in spec.attributes) {
                      var value = spec.attributes[name_3];
                      if (value == null)
                          continue;
                      if (name_3 == "class") {
                          clss = clss ? clss + " " + value : value;
                      }
                      else {
                          if (!attrs)
                              attrs = {};
                          if (name_3 == "style" && attrs.style)
                              value = attrs.style + ";" + value;
                          attrs[name_3] = value;
                      }
                  }
          }
          this.buildText(pos - this.pos, tagName, clss, attrs, active);
          this.pos = pos;
      };
      InlineBuilder.prototype.advanceCollapsed = function (pos, deco) {
          if (pos <= this.pos)
              return;
          var line = this.curLine;
          var widgetView = new WidgetView(pos - this.pos, deco.widget, 0);
          if (!line.elements.length || !line.elements[line.elements.length - 1].merge(widgetView))
              line.add(widgetView);
          // Advance the iterator past the collapsed content
          var length = pos - this.pos;
          if (this.textOff + length <= this.text.length) {
              this.textOff += length;
          }
          else {
              this.skip += length - (this.text.length - this.textOff);
              this.text = "";
              this.textOff = 0;
          }
          this.pos = pos;
      };
      InlineBuilder.prototype.point = function (deco) {
          if (deco instanceof WidgetDecoration)
              this.curLine.add(new WidgetView(0, deco.widget, deco.bias));
          else if (this.curLine.atStart)
              this.curLine.addLineDeco(deco);
      };
      Object.defineProperty(InlineBuilder.prototype, "curLine", {
          get: function () { return this.lines[this.lines.length - 1]; },
          enumerable: true,
          configurable: true
      });
      InlineBuilder.prototype.ignoreRange = function (deco) { return false; };
      InlineBuilder.prototype.ignorePoint = function (deco) { return false; };
      InlineBuilder.build = function (text, from, to, decorations) {
          var builder = new InlineBuilder(text, from);
          RangeSet.iterateSpans(decorations, from, to, builder);
          return builder.lines;
      };
      return InlineBuilder;
  }());
  function nodeAlreadyInTree(view, node) {
      var v = node.cmView;
      return v ? v.root == view.root : false;
  }

  var LineView = /** @class */ (function (_super) {
      __extends(LineView, _super);
      function LineView(parent, content, tail) {
          var _this = _super.call(this, parent, document.createElement("div")) || this;
          _this.widgets = none$3;
          _this.prevAttrs = undefined;
          _this.attrs = null;
          _this.length = 0;
          _this.children = [];
          if (content)
              _this.update(0, 0, content, tail);
          return _this;
      }
      LineView.prototype.setDeco = function (content) {
          if (!attrsEq(this.attrs, content.attrs)) {
              this.prevAttrs = this.attrs;
              this.attrs = content.attrs;
              this.markDirty();
          }
          // Reconcile the new widgets with the existing ones
          for (var i = 0, j = 0;;) {
              var a = i == this.widgets.length ? null : this.widgets[i];
              var b = j == content.widgets.length ? null : content.widgets[j];
              if (!a && !b)
                  break;
              if (a && b && a.eq(b)) {
                  i++;
                  j++;
              }
              else if (!a || (b && b.side <= a.side)) {
                  if (this.widgets == none$3)
                      this.widgets = [];
                  this.widgets.splice(i++, 0, b.finish());
                  this.parent.markDirty();
                  j++;
              }
              else {
                  this.widgets.splice(i, 1);
                  this.parent.markDirty();
              }
          }
      };
      LineView.prototype.update = function (from, to, content, tail) {
          if (to === void 0) { to = this.length; }
          if (from == 0)
              this.setDeco(content);
          var elts = tail ? InlineView.appendInline(content.elements, tail) : content.elements;
          var cur = new ChildCursor(this.children, this.length);
          var _a = cur.findPos(to, 1), toI = _a.i, toOff = _a.off;
          var _b = cur.findPos(from, -1), fromI = _b.i, fromOff = _b.off;
          var dLen = from - to;
          for (var _i = 0, elts_1 = elts; _i < elts_1.length; _i++) {
              var view = elts_1[_i];
              dLen += view.length;
          }
          this.length += dLen;
          // Both from and to point into the same text view
          if (fromI == toI && fromOff) {
              var start = this.children[fromI];
              // Maybe just update that view and be done
              if (elts.length == 1 && start.merge(elts[0], fromOff, toOff))
                  return;
              if (elts.length == 0)
                  return start.cut(fromOff, toOff);
              // Otherwise split it, so that we don't have to worry about aliasting front/end afterwards
              InlineView.appendInline(elts, [start.slice(toOff)]);
              toI++;
              toOff = 0;
          }
          // Make sure start and end positions fall on node boundaries
          // (fromOff/toOff are no longer used after this), and that if the
          // start or end of the elts can be merged with adjacent nodes,
          // this is done
          if (toOff) {
              var end = this.children[toI];
              if (elts.length && end.merge(elts[elts.length - 1], 0, toOff))
                  elts.pop();
              else
                  end.cut(0, toOff);
          }
          else if (toI < this.children.length && elts.length &&
              this.children[toI].merge(elts[elts.length - 1], 0, 0)) {
              elts.pop();
          }
          if (fromOff) {
              var start = this.children[fromI];
              if (elts.length && start.merge(elts[0], fromOff))
                  elts.shift();
              else
                  start.cut(fromOff);
              fromI++;
          }
          else if (fromI && elts.length && this.children[fromI - 1].merge(elts[0], this.children[fromI - 1].length)) {
              elts.shift();
          }
          // Then try to merge any mergeable nodes at the start and end of
          // the changed range
          while (fromI < toI && elts.length && this.children[toI - 1].merge(elts[elts.length - 1])) {
              elts.pop();
              toI--;
          }
          while (fromI < toI && elts.length && this.children[fromI].merge(elts[0])) {
              elts.shift();
              fromI++;
          }
          // And if anything remains, splice the child array to insert the new elts
          if (elts.length || fromI != toI) {
              for (var _c = 0, elts_2 = elts; _c < elts_2.length; _c++) {
                  var view = elts_2[_c];
                  view.setParent(this);
              }
              this.replaceChildren(fromI, toI, elts);
          }
      };
      LineView.prototype.detachTail = function (from) {
          var result = [];
          if (this.length == 0)
              return result;
          var _a = new ChildCursor(this.children, this.length).findPos(from), i = _a.i, off = _a.off;
          if (off > 0) {
              var child = this.children[i];
              result.push(child.slice(off));
              child.cut(off);
              i++;
          }
          if (i < this.children.length) {
              for (var j = i; j < this.children.length; j++)
                  result.push(this.children[j]);
              this.replaceChildren(i, this.children.length);
          }
          this.length = from;
          return result;
      };
      LineView.prototype.domFromPos = function (pos) {
          var _a = new ChildCursor(this.children, this.length).findPos(pos), i = _a.i, off = _a.off;
          if (off) {
              var child = this.children[i];
              if (child instanceof TextView)
                  return { node: child.textDOM, offset: off };
          }
          while (i > 0 && (this.children[i - 1].getSide() > 0 || this.children[i - 1].dom.parentNode != this.dom))
              i--;
          return { node: this.dom, offset: i ? domIndex(this.children[i - 1].dom) + 1 : 0 };
      };
      LineView.prototype.syncInto = function (parent, pos) {
          for (var i = 0, main = false;; i++) {
              var widget = i == this.widgets.length ? null : this.widgets[i];
              if (!main && (!widget || widget.side > 0)) {
                  main = true;
                  pos = syncNodeInto(parent, pos, this.dom);
              }
              if (!widget)
                  break;
              pos = syncNodeInto(parent, pos, widget.dom);
          }
          return pos;
      };
      // FIXME might need another hack to work around Firefox's behavior
      // of not actually displaying the cursor even though it's there in
      // the DOM
      LineView.prototype.sync = function () {
          _super.prototype.sync.call(this);
          if (this.prevAttrs !== undefined) {
              removeAttrs(this.dom, this.prevAttrs);
              setAttrs(this.dom, this.attrs);
              this.prevAttrs = undefined;
          }
          var last = this.dom.lastChild;
          if (!last || last.nodeName == "BR") {
              var hack = document.createElement("BR");
              hack.cmIgnore = true;
              this.dom.appendChild(hack);
          }
      };
      LineView.prototype.measureTextSize = function () {
          if (this.children.length == 0 || this.length > 20)
              return null;
          var totalWidth = 0;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var child = _a[_i];
              if (!(child instanceof TextView))
                  return null;
              var rects = clientRectsFor(child.dom);
              if (rects.length != 1)
                  return null;
              totalWidth += rects[0].width;
          }
          return { lineHeight: this.dom.getBoundingClientRect().height,
              charWidth: totalWidth / this.length };
      };
      LineView.prototype.coordsAt = function (pos) {
          if (this.length == 0)
              return this.dom.lastChild.getBoundingClientRect();
          return _super.prototype.coordsAt.call(this, pos);
      };
      // Ignore mutations in line widgets
      LineView.prototype.ignoreMutation = function (rec) {
          return !this.dom.contains(rec.target.nodeType == 1 ? rec.target : rec.target.parentNode);
      };
      // Find the appropriate widget, and ask it whether an event needs to be ignored
      LineView.prototype.ignoreEvent = function (event) {
          if (this.widgets.length == 0 || this.dom.contains(event.target))
              return false;
          for (var _i = 0, _a = this.widgets; _i < _a.length; _i++) {
              var widget = _a[_i];
              if (widget.dom.contains(event.target))
                  return widget.widget.ignoreEvent(event);
          }
          return true;
      };
      return LineView;
  }(ContentView));
  var LineWidget = /** @class */ (function () {
      function LineWidget(widget, side) {
          this.widget = widget;
          this.side = side;
          this.dom = null;
      }
      LineWidget.prototype.eq = function (other) {
          return this.widget.compare(other.widget) && this.side == other.side;
      };
      LineWidget.prototype.finish = function () {
          this.dom = this.widget.toDOM();
          this.dom.cmIgnore = true;
          return this;
      };
      return LineWidget;
  }());
  var none$3 = [];
  function setAttrs(dom, attrs) {
      if (attrs)
          for (var name_1 in attrs)
              dom.setAttribute(name_1, attrs[name_1]);
  }
  function removeAttrs(dom, attrs) {
      if (attrs)
          for (var name_2 in attrs)
              dom.removeAttribute(name_2);
  }

  function visiblePixelRange(dom, paddingTop) {
      var rect = dom.getBoundingClientRect();
      var top = Math.max(0, Math.min(innerHeight, rect.top)), bottom = Math.max(0, Math.min(innerHeight, rect.bottom));
      for (var parent_1 = dom.parentNode; parent_1;) { // (Cast to any because TypeScript is useless with Node types)
          if (parent_1.nodeType == 1) {
              if (parent_1.scrollHeight > parent_1.clientHeight) {
                  var parentRect = parent_1.getBoundingClientRect();
                  top = Math.min(parentRect.bottom, Math.max(parentRect.top, top));
                  bottom = Math.min(parentRect.bottom, Math.max(parentRect.top, bottom));
              }
              parent_1 = parent_1.parentNode;
          }
          else if (parent_1.nodeType == 11) { // Shadow root
              parent_1 = parent_1.host;
          }
          else {
              break;
          }
      }
      return { top: top - (rect.top + paddingTop), bottom: bottom - (rect.top + paddingTop) };
  }
  var VIEWPORT_MARGIN = 1000; // FIXME look into appropriate value of this through benchmarking etc
  var MIN_COVER_MARGIN = 10; // coveredBy requires at least this many extra pixels to be covered
  var MAX_COVER_MARGIN = VIEWPORT_MARGIN / 4;
  var ViewportState = /** @class */ (function () {
      function ViewportState() {
          this.top = 0;
          this.bottom = 0;
      }
      ViewportState.prototype.updateFromDOM = function (dom, paddingTop) {
          var _a = visiblePixelRange(dom, paddingTop), top = _a.top, bottom = _a.bottom;
          var dTop = top - this.top, dBottom = bottom - this.bottom, bias = 0;
          if (dTop > 0 && dBottom > 0)
              bias = Math.max(dTop, dBottom);
          else if (dTop < 0 && dBottom < 0)
              bias = Math.min(dTop, dBottom);
          this.top = top;
          this.bottom = bottom;
          return bias;
      };
      ViewportState.prototype.coverEverything = function () {
          this.top = -2e9;
          this.bottom = 2e9;
      };
      ViewportState.prototype.getViewport = function (doc, heightMap, bias, scrollTo) {
          // This will divide VIEWPORT_MARGIN between the top and the
          // bottom, depending on the bias (the change in viewport position
          // since the last update). It'll hold a number between 0 and 1
          var marginTop = 0.5 - Math.max(-0.5, Math.min(0.5, bias / VIEWPORT_MARGIN / 2));
          var viewport = new Viewport(heightMap.lineAt(this.top - marginTop * VIEWPORT_MARGIN, doc).start, heightMap.lineAt(this.bottom + (1 - marginTop) * VIEWPORT_MARGIN, doc).end);
          // If scrollTo is > -1, make sure the viewport includes that position
          if (scrollTo > -1) {
              if (scrollTo < viewport.from) {
                  var top_1 = heightMap.heightAt(scrollTo, doc, -1);
                  viewport = new Viewport(heightMap.lineAt(top_1 - VIEWPORT_MARGIN / 2, doc).start, heightMap.lineAt(top_1 + (this.bottom - this.top) + VIEWPORT_MARGIN / 2, doc).end);
              }
              else if (scrollTo > viewport.to) {
                  var bottom = heightMap.heightAt(scrollTo, doc, 1);
                  viewport = new Viewport(heightMap.lineAt(bottom - (this.bottom - this.top) - VIEWPORT_MARGIN / 2, doc).start, heightMap.lineAt(bottom + VIEWPORT_MARGIN / 2, doc).end);
              }
          }
          return viewport;
      };
      ViewportState.prototype.coveredBy = function (doc, viewport, heightMap, bias) {
          if (bias === void 0) { bias = 0; }
          var top = heightMap.heightAt(viewport.from, doc, -1), bottom = heightMap.heightAt(viewport.to, doc, 1);
          return (viewport.from == 0 || top <= this.top - Math.max(MIN_COVER_MARGIN, Math.min(-bias, MAX_COVER_MARGIN))) &&
              (viewport.to == doc.length || bottom >= this.bottom + Math.max(MIN_COVER_MARGIN, Math.min(bias, MAX_COVER_MARGIN)));
      };
      return ViewportState;
  }());
  var Viewport = /** @class */ (function () {
      function Viewport(from, to) {
          this.from = from;
          this.to = to;
      }
      Viewport.prototype.clip = function (pos) { return Math.max(this.from, Math.min(this.to, pos)); };
      Viewport.empty = new Viewport(0, 0);
      return Viewport;
  }());

  var observeOptions = {
      childList: true,
      characterData: true,
      subtree: true,
      characterDataOldValue: true
  };
  // IE11 has very broken mutation observers, so we also listen to
  // DOMCharacterDataModified there
  var useCharData = browser.ie && browser.ie_version <= 11;
  var DOMObserver = /** @class */ (function () {
      function DOMObserver(docView, onChange, onScrollChanged) {
          var _this = this;
          this.docView = docView;
          this.onChange = onChange;
          this.onScrollChanged = onScrollChanged;
          this.active = false;
          this.ignoreSelection = new DOMSelection;
          this.charDataQueue = [];
          this.charDataTimeout = null;
          this.scrollTargets = [];
          this.intersection = null;
          this.intersecting = true;
          this.dom = docView.dom;
          this.observer = new MutationObserver(function (mutations) { return _this.flush(mutations); });
          if (useCharData)
              this.onCharData = function (event) {
                  _this.charDataQueue.push({ target: event.target,
                      type: "characterData",
                      oldValue: event.prevValue });
                  if (_this.charDataTimeout == null)
                      _this.charDataTimeout = setTimeout(function () { return _this.flush(); }, 20);
              };
          this.onSelectionChange = function () {
              if (getRoot(_this.dom).activeElement == _this.dom)
                  _this.flush();
          };
          this.start();
          this.onScroll = this.onScroll.bind(this);
          window.addEventListener("scroll", this.onScroll);
          if (typeof IntersectionObserver == "function") {
              this.intersection = new IntersectionObserver(function (entries) {
                  if (entries[entries.length - 1].intersectionRatio > 0 != _this.intersecting) {
                      _this.intersecting = !_this.intersecting;
                      _this.onScroll();
                  }
              }, {});
              this.intersection.observe(this.dom);
          }
          this.listenForScroll();
      }
      DOMObserver.prototype.onScroll = function () {
          if (this.intersecting) {
              this.flush();
              this.onScrollChanged();
          }
      };
      DOMObserver.prototype.listenForScroll = function () {
          var i = 0, changed = null;
          for (var dom = this.dom; dom;) {
              if (dom.nodeType == 1) {
                  if (!changed && i < this.scrollTargets.length && this.scrollTargets[i] == dom)
                      i++;
                  else if (!changed)
                      changed = this.scrollTargets.slice(0, i);
                  if (changed)
                      changed.push(dom);
                  dom = dom.parentNode;
              }
              else if (dom.nodeType == 11) { // Shadow root
                  dom = dom.host;
              }
              else {
                  break;
              }
          }
          if (i < this.scrollTargets.length && !changed)
              changed = this.scrollTargets.slice(0, i);
          if (changed) {
              for (var _i = 0, _a = this.scrollTargets; _i < _a.length; _i++) {
                  var dom = _a[_i];
                  dom.removeEventListener("scroll", this.onScroll);
              }
              for (var _b = 0, _c = this.scrollTargets = changed; _b < _c.length; _b++) {
                  var dom = _c[_b];
                  dom.addEventListener("scroll", this.onScroll);
              }
          }
      };
      DOMObserver.prototype.ignore = function (f) {
          if (!this.active)
              return f();
          try {
              this.stop();
              return f();
          }
          finally {
              this.start();
              this.clear();
          }
      };
      DOMObserver.prototype.start = function () {
          if (this.active)
              return;
          this.observer.observe(this.dom, observeOptions);
          // FIXME is this shadow-root safe?
          this.dom.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
          if (useCharData)
              this.dom.addEventListener("DOMCharacterDataModified", this.onCharData);
          this.active = true;
      };
      DOMObserver.prototype.stop = function () {
          if (!this.active)
              return;
          this.active = false;
          this.observer.disconnect();
          this.dom.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
          if (useCharData)
              this.dom.removeEventListener("DOMCharacterDataModified", this.onCharData);
      };
      DOMObserver.prototype.takeCharRecords = function () {
          var result = this.charDataQueue;
          if (result.length) {
              this.charDataQueue = [];
              clearTimeout(this.charDataTimeout);
              this.charDataTimeout = null;
          }
          return result;
      };
      DOMObserver.prototype.clearSelection = function () {
          this.ignoreSelection.set(getRoot(this.dom).getSelection());
      };
      // Throw away any pending changes
      DOMObserver.prototype.clear = function () {
          this.observer.takeRecords();
          this.takeCharRecords();
          this.clearSelection();
      };
      // Apply pending changes, if any
      DOMObserver.prototype.flush = function (records) {
          var _this = this;
          if (records === void 0) { records = this.observer.takeRecords(); }
          if (this.charDataQueue.length)
              records = records.concat(this.takeCharRecords());
          var newSel = !this.ignoreSelection.eq(getRoot(this.dom).getSelection()) &&
              hasSelection(this.dom);
          if (records.length == 0 && !newSel)
              return;
          var from = -1, to = -1, typeOver = false;
          for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
              var record = records_1[_i];
              var range = this.readMutation(record);
              if (!range)
                  continue;
              if (range.typeOver)
                  typeOver = true;
              if (from == -1) {
                  (from = range.from, to = range.to);
              }
              else {
                  from = Math.min(range.from, from);
                  to = Math.max(range.to, to);
              }
          }
          var apply = from > -1 || newSel;
          if (!apply || !this.onChange(from, to, typeOver)) {
              if (this.docView.dirty)
                  this.ignore(function () { return _this.docView.sync(); });
              this.docView.updateSelection();
          }
          this.clearSelection();
      };
      DOMObserver.prototype.readMutation = function (rec) {
          var cView = this.docView.nearest(rec.target);
          if (!cView || cView.ignoreMutation(rec))
              return null;
          cView.markDirty();
          if (rec.type == "childList") {
              var childBefore = findChild(cView, rec.previousSibling || rec.target.previousSibling, -1);
              var childAfter = findChild(cView, rec.nextSibling || rec.target.nextSibling, 1);
              return { from: childBefore ? cView.posAfter(childBefore) : cView.posAtStart,
                  to: childAfter ? cView.posBefore(childAfter) : cView.posAtEnd, typeOver: false };
          }
          else { // "characterData"
              return { from: cView.posAtStart, to: cView.posAtEnd, typeOver: rec.target.nodeValue == rec.oldValue };
          }
      };
      DOMObserver.prototype.destroy = function () {
          this.stop();
          if (this.intersection)
              this.intersection.disconnect();
          for (var _i = 0, _a = this.scrollTargets; _i < _a.length; _i++) {
              var dom = _a[_i];
              dom.removeEventListener("scroll", this.onScroll);
          }
          window.removeEventListener("scroll", this.onScroll);
      };
      return DOMObserver;
  }());
  function findChild(cView, dom, dir) {
      while (dom) {
          var curView = dom.cmView;
          if (curView && curView.parent == cView)
              return curView;
          var parent_1 = dom.parentNode;
          dom = parent_1 != cView.dom ? parent_1 : dir > 0 ? dom.nextSibling : dom.previousSibling;
      }
      return null;
  }

  var wrappingWhiteSpace = ["pre-wrap", "normal", "pre-line"];
  var HeightOracle = /** @class */ (function () {
      function HeightOracle() {
          this.doc = Text.of([""]);
          this.lineWrapping = false;
          this.heightSamples = {};
          this.lineHeight = 14;
          this.charWidth = 7;
          this.lineLength = 30;
          // Used to track, during updateHeight, if any actual heights changed
          this.heightChanged = false;
      }
      HeightOracle.prototype.heightForGap = function (from, to) {
          var lines = this.doc.lineAt(to).number - this.doc.lineAt(from).number + 1;
          if (this.lineWrapping)
              lines += Math.ceil(((to - from) - (lines * this.lineLength * 0.5)) / this.lineLength);
          return this.lineHeight * lines;
      };
      HeightOracle.prototype.heightForLine = function (length) {
          if (!this.lineWrapping)
              return this.lineHeight;
          var lines = 1 + Math.max(0, Math.ceil((length - this.lineLength) / (this.lineLength - 5)));
          return lines * this.lineHeight;
      };
      HeightOracle.prototype.setDoc = function (doc) { this.doc = doc; return this; };
      HeightOracle.prototype.mustRefresh = function (lineHeights) {
          var newHeight = false;
          for (var i = 0; i < lineHeights.length; i++) {
              var h = lineHeights[i];
              if (h < 0) {
                  i++;
              }
              else if (!this.heightSamples[Math.floor(h * 10)]) { // Round to .1 pixels
                  newHeight = true;
                  this.heightSamples[Math.floor(h * 10)] = true;
              }
          }
          return newHeight;
      };
      HeightOracle.prototype.refresh = function (whiteSpace, lineHeight, charWidth, lineLength, knownHeights) {
          var lineWrapping = wrappingWhiteSpace.indexOf(whiteSpace) > -1;
          var changed = Math.round(lineHeight) != Math.round(this.lineHeight) || this.lineWrapping != lineWrapping;
          this.lineWrapping = lineWrapping;
          this.lineHeight = lineHeight;
          this.charWidth = charWidth;
          this.lineLength = lineLength;
          if (changed) {
              this.heightSamples = {};
              for (var i = 0; i < knownHeights.length; i++) {
                  var h = knownHeights[i];
                  if (h < 0)
                      i++;
                  else
                      this.heightSamples[Math.floor(h * 10)] = true;
              }
          }
          return changed;
      };
      return HeightOracle;
  }());
  // This object is used by `updateHeight` to make DOM measurements
  // arrive at the right lines. The `heights` array is a sequence of
  // line heights, starting from position `from`. When the lines have
  // line widgets, their height may be followed by a -1 or -2
  // (indicating whether the height is below or above the line) and then
  // a total widget height.
  var MeasuredHeights = /** @class */ (function () {
      function MeasuredHeights(from, heights) {
          this.from = from;
          this.heights = heights;
          this.index = 0;
      }
      Object.defineProperty(MeasuredHeights.prototype, "more", {
          get: function () { return this.index < this.heights.length; },
          enumerable: true,
          configurable: true
      });
      return MeasuredHeights;
  }());
  var LineHeight = /** @class */ (function () {
      function LineHeight(start, end, top, height, 
      // @internal
      line) {
          this.start = start;
          this.end = end;
          this.top = top;
          this.height = height;
          this.line = line;
      }
      Object.defineProperty(LineHeight.prototype, "bottom", {
          get: function () { return this.top + this.height; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(LineHeight.prototype, "textTop", {
          get: function () { return this.top + (this.line ? lineWidgetHeight(this.line.deco, -2) : 0); },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(LineHeight.prototype, "textBottom", {
          get: function () { return this.bottom - (this.line ? lineWidgetHeight(this.line.deco, -1) : 0); },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(LineHeight.prototype, "hasCollapsedRanges", {
          get: function () {
              if (this.line)
                  for (var i = 1; i < this.line.deco.length; i += 2)
                      if (this.line.deco[i] < 0)
                          return true;
              return false;
          },
          enumerable: true,
          configurable: true
      });
      return LineHeight;
  }());
  var HeightMap = /** @class */ (function () {
      function HeightMap(length, // The number of characters covered
      height, // Height of this part of the document
      outdated // Tracks whether the height needs to be recomputed
      ) {
          if (outdated === void 0) { outdated = true; }
          this.length = length;
          this.height = height;
          this.outdated = outdated;
      }
      HeightMap.prototype.setHeight = function (oracle, height) {
          if (this.height != height) {
              this.height = height;
              oracle.heightChanged = true;
          }
      };
      // from/to are node-relative positions pointing into the node itself
      // newFrom/newTo are document-relative positions in the updated
      // document, used for querying line endings and such
      HeightMap.prototype.replace = function (from, to, nodes, oracle, newFrom, newTo) {
          var result = [];
          this.decomposeLeft(from, result, nodes[0], oracle, newFrom);
          var last;
          if (nodes.length == 1) {
              last = result.pop();
          }
          else {
              for (var i = 1; i < nodes.length - 1; i++)
                  result.push(nodes[i]);
              last = nodes[nodes.length - 1];
          }
          this.decomposeRight(to, result, last, oracle, newTo);
          return HeightMap.of(result);
      };
      HeightMap.prototype.applyChanges = function (decorations, oracle, changes) {
          var me = this, off = 0;
          for (var i = 0; i < changes.length; i++) {
              var range = changes[i];
              var nodes = buildChangedNodes(oracle, decorations, range.fromB, range.toB);
              me = me.replace(range.fromA + off, range.toA + off, nodes, oracle, range.fromB, range.toB);
              off += (range.toB - range.fromB) - (range.toA - range.fromA);
          }
          return me;
      };
      HeightMap.empty = function () { return new HeightMapLine(0, 0); };
      HeightMap.of = function (nodes) {
          if (nodes.length == 1)
              return nodes[0];
          var i = 0, j = nodes.length, before = 0, after = 0;
          while (i < j) {
              if (before < after)
                  before += nodes[i++].size;
              else
                  after += nodes[--j].size;
          }
          for (;;) {
              if (before > after * 2) {
                  var _a = nodes[i - 1], left = _a.left, right = _a.right;
                  nodes.splice(i - 1, 1, left, right);
                  before -= right.size;
                  after += right.size;
              }
              else if (after > before * 2) {
                  var _b = nodes[i], left = _b.left, right = _b.right;
                  nodes.splice(i++, 1, left, right);
                  after -= left.size;
                  before += left.size;
              }
              else {
                  break;
              }
          }
          return new HeightMapBranch(HeightMap.of(nodes.slice(0, i)), HeightMap.of(nodes.slice(i)));
      };
      return HeightMap;
  }());
  var noDeco = [];
  var HeightMapLine = /** @class */ (function (_super) {
      __extends(HeightMapLine, _super);
      // Decoration information is stored in a somewhat obscure format—the
      // array of numbers in `deco` encodes all of collapsed ranges,
      // inline widgets, and widgets above/below the line. It contains a
      // series of pairs of numbers.
      //
      //  - The first number indicates the position of the decoration, or
      //    -2 for widget height above the line, or -1 for widget height
      //    below the line (see `lineWidgetHeight` and
      //    `setLineWidgetHeight`)
      //
      //  - The second number is the height of a widget when positive, or
      //    the number of collapse code points if negative.
      //
      // These are the pieces of information that need to be stored about
      // lines to somewhat effectively estimate their height when they are
      // not actually in view and thus can not be measured. Widget size
      // above/below is also necessary in heightAt, to skip it.
      //
      // The somewhat awkward format is there to reduce the amount of
      // space required—you can have a huge number of line heightmap
      // objects when scrolling through a big document, and most of them
      // don't need any extra data, and thus can just store a single
      // pointer to `noDeco`.
      function HeightMapLine(length, height, deco) {
          if (deco === void 0) { deco = noDeco; }
          var _this = _super.call(this, length, height) || this;
          _this.deco = deco;
          return _this;
      }
      Object.defineProperty(HeightMapLine.prototype, "size", {
          get: function () { return 1; },
          enumerable: true,
          configurable: true
      });
      HeightMapLine.prototype.heightAt = function (pos, doc, bias) {
          return bias < 0 ? lineWidgetHeight(this.deco, -2) : this.height - lineWidgetHeight(this.deco, -1);
      };
      HeightMapLine.prototype.lineAt = function (height, doc, offset) {
          if (offset === void 0) { offset = 0; }
          return new LineHeight(offset, offset + this.length, -height, this.height, this);
      };
      HeightMapLine.prototype.lineViewport = function (pos, doc, offset) {
          if (offset === void 0) { offset = 0; }
          return new Viewport(offset, offset + this.length);
      };
      HeightMapLine.prototype.replace = function (from, to, nodes, oracle, newFrom, newTo) {
          if (nodes.length != 1 || (nodes[0] instanceof HeightMapGap && oracle.doc.lineAt(newFrom).end < newTo))
              return _super.prototype.replace.call(this, from, to, nodes, oracle, newFrom, newTo);
          this.deco = offsetDeco(this.deco, from, to, nodes[0].length);
          if (nodes[0] instanceof HeightMapLine)
              this.deco = insertDeco(this.deco, nodes[0].deco, from);
          this.length += nodes[0].length - (to - from);
          this.outdated = true;
          return this;
      };
      HeightMapLine.prototype.decomposeLeft = function (to, target, node, oracle, newTo) {
          if (to == 0) {
              target.push(node);
          }
          else if (node instanceof HeightMapLine) {
              target.push(this.joinLine(to, this.length, node));
          }
          else {
              var nextEnd = oracle.doc.lineAt(newTo).end, breakInside = nextEnd < newTo + node.length;
              var newLen = to + (breakInside ? nextEnd - newTo : node.length);
              target.push(new HeightMapLine(newLen, this.height, offsetDeco(this.deco, to, this.length, 0)));
              if (breakInside)
                  target.push(new HeightMapGap(nextEnd + 1, newTo + node.length, oracle));
          }
      };
      HeightMapLine.prototype.decomposeRight = function (from, target, node, oracle, newFrom) {
          if (from == this.length) {
              target.push(node);
          }
          else if (node instanceof HeightMapLine) {
              target.push(this.joinLine(0, from, node));
          }
          else {
              var prevStart = oracle.doc.lineAt(newFrom).start, breakInside = prevStart > newFrom - node.length;
              if (breakInside)
                  target.push(new HeightMapGap(newFrom - node.length, prevStart - 1, oracle));
              var newLen = (breakInside ? newFrom - prevStart : node.length) + (this.length - from);
              target.push(new HeightMapLine(newLen, this.height, offsetDeco(this.deco, 0, from, newLen - this.length)));
          }
      };
      HeightMapLine.prototype.joinLine = function (from, to, node) {
          var deco = insertDeco(offsetDeco(this.deco, from, to, node.length), node.deco, from);
          return new HeightMapLine(this.length + node.length - (to - from), Math.max(this.height, node.height), deco);
      };
      HeightMapLine.prototype.updateHeight = function (oracle, offset, force, measured) {
          if (offset === void 0) { offset = 0; }
          if (force === void 0) { force = false; }
          if (measured && measured.from <= offset && measured.more) {
              var height = measured.heights[measured.index++];
              // If either this line's deco data or the measured heights contain info about 
              if (this.deco.length && this.deco[0] < 0 || measured.more && measured.heights[measured.index] < 0) {
                  var above = measured.more && measured.heights[measured.index] == -2
                      ? measured.heights[(measured.index += 2) - 1] : 0;
                  var below = measured.more && measured.heights[measured.index] == -1
                      ? measured.heights[(measured.index += 2) - 1] : 0;
                  this.deco = setLineWidgetHeight(setLineWidgetHeight(this.deco.slice(), -2, above), -1, below);
                  height += above + below;
              }
              this.setHeight(oracle, height);
          }
          else if (force || this.outdated) {
              var len = this.length, minH = 0, add = 0;
              for (var i = 1; i < this.deco.length; i += 2) {
                  var val = this.deco[i];
                  if (val < 0)
                      len += val;
                  else if (this.deco[i - 1] < 0)
                      add += val;
                  else
                      minH = Math.max(val, minH);
              }
              this.setHeight(oracle, Math.max(oracle.heightForLine(len), minH) + add);
          }
          this.outdated = false;
          return this;
      };
      HeightMapLine.prototype.toString = function () { return "line(" + this.length + (this.deco.length ? ":" + this.deco.join(",") : "") + ")"; };
      HeightMapLine.prototype.forEachLine = function (from, to, offset, oracle, f) {
          f(new LineHeight(offset, offset + this.length, 0, this.height, this));
      };
      Object.defineProperty(HeightMapLine.prototype, "hasCollapsedRanges", {
          get: function () {
              for (var i = 1; i < this.deco.length; i += 2)
                  if (this.deco[i] < 0)
                      return true;
              return false;
          },
          enumerable: true,
          configurable: true
      });
      return HeightMapLine;
  }(HeightMap));
  function offsetDeco(deco, from, to, length) {
      var result = null;
      var off = length - (to - from);
      for (var i = 0; i < deco.length; i += 2) {
          var pos = deco[i];
          if (Math.max(0, pos) < from || pos > to && off == 0)
              continue;
          if (!result)
              result = deco.slice(0, i);
          if (pos > to)
              result.push(pos + off, deco[i + 1]);
      }
      return !result ? deco : result.length ? result : noDeco;
  }
  function insertDeco(deco, newDeco, pos) {
      if (newDeco.length == 0)
          return deco;
      var result = [], inserted = false;
      for (var i = 0;; i += 2) {
          var next = i == deco.length ? 2e9 : deco[i];
          if (!inserted && next > pos) {
              for (var j = 0; j < newDeco.length; j += 2)
                  if (pos == 0 || newDeco[j] >= 0)
                      result.push(newDeco[j] + pos, newDeco[j + 1]);
              inserted = true;
          }
          if (next == 2e9)
              return result;
          result.push(next, deco[i + 1]);
      }
  }
  function lineWidgetHeight(deco, type) {
      for (var i = 0; i < deco.length; i += 2) {
          var pos = deco[i];
          if (pos >= 0)
              break;
          if (pos == type)
              return deco[i + 1];
      }
      return 0;
  }
  function setLineWidgetHeight(deco, type, height) {
      var i = 0;
      for (; i < deco.length; i += 2) {
          var pos = deco[i];
          if (pos > type)
              break;
          if (pos == type) {
              deco[i + 1] = height;
              return deco;
          }
      }
      if (height > 0)
          deco.splice(i, 0, type, height);
      return deco;
  }
  var HeightMapGap = /** @class */ (function (_super) {
      __extends(HeightMapGap, _super);
      function HeightMapGap(from, to, oracle) {
          return _super.call(this, to - from, oracle.heightForGap(from, to), false) || this;
      }
      Object.defineProperty(HeightMapGap.prototype, "size", {
          get: function () { return 1; },
          enumerable: true,
          configurable: true
      });
      HeightMapGap.prototype.heightAt = function (pos, doc, bias, offset) {
          if (offset === void 0) { offset = 0; }
          var firstLine = doc.lineAt(offset).number, lastLine = doc.lineAt(offset + this.length).number;
          var lines = lastLine - firstLine + 1;
          return (doc.lineAt(pos).number - firstLine + (bias > 0 ? 1 : 0)) * (this.height / lines);
      };
      HeightMapGap.prototype.lineAt = function (height, doc, offset) {
          if (offset === void 0) { offset = 0; }
          var firstLine = doc.lineAt(offset).number, lastLine = doc.lineAt(offset + this.length).number;
          var lines = lastLine - firstLine, line = Math.floor(lines * Math.max(0, Math.min(1, height / this.height)));
          var heightPerLine = this.height / (lines + 1), top = heightPerLine * line - height;
          var _a = doc.line(firstLine + line), start = _a.start, end = _a.end;
          return new LineHeight(start, end, top, heightPerLine, null);
      };
      HeightMapGap.prototype.lineViewport = function (pos, doc, offset) {
          if (offset === void 0) { offset = 0; }
          var _a = doc.lineAt(pos + offset), start = _a.start, end = _a.end;
          return new Viewport(start, end);
      };
      HeightMapGap.prototype.replace = function (from, to, nodes, oracle, newFrom, newTo) {
          if (nodes.length != 1 || !(nodes[0] instanceof HeightMapGap))
              return _super.prototype.replace.call(this, from, to, nodes, oracle, newFrom, newTo);
          this.length += (newTo - newFrom) - (to - from);
          var newStart = newFrom - from;
          // FIXME the Math.min is a kludge to deal with the fact that, if
          // there are further changes that'll be applied by applyChanges,
          // the estimated length here may extend past the end of the document
          this.setHeight(oracle, oracle.heightForGap(newStart, Math.min(oracle.doc.length, newStart + this.length)));
          return this;
      };
      HeightMapGap.prototype.decomposeLeft = function (to, target, node, oracle, newTo) {
          var newOffset = newTo - to;
          if (node instanceof HeightMapGap) {
              target.push(new HeightMapGap(newOffset, newTo + node.length, oracle));
          }
          else {
              var lineStart = oracle.doc.lineAt(newTo).start;
              if (lineStart > newOffset)
                  target.push(new HeightMapGap(newOffset, lineStart - 1, oracle));
              var deco = offsetDeco(node.deco, 0, 0, newTo - lineStart);
              target.push(new HeightMapLine(newTo + node.length - lineStart, node.height, deco));
          }
      };
      HeightMapGap.prototype.decomposeRight = function (from, target, node, oracle, newFrom) {
          var newEnd = newFrom + (this.length - from);
          if (node instanceof HeightMapGap) {
              target.push(new HeightMapGap(newFrom - node.length, newEnd, oracle));
          }
          else {
              var lineEnd = oracle.doc.lineAt(newFrom).end;
              target.push(new HeightMapLine(node.length + (lineEnd - newFrom), node.height, node.deco));
              if (newEnd > lineEnd)
                  target.push(new HeightMapGap(lineEnd + 1, newEnd, oracle));
          }
      };
      HeightMapGap.prototype.updateHeight = function (oracle, offset, force, measured) {
          if (offset === void 0) { offset = 0; }
          if (force === void 0) { force = false; }
          var end = offset + this.length;
          if (measured && measured.from <= offset + this.length && measured.more) {
              var nodes = [], pos = Math.max(offset, measured.from);
              if (measured.from > offset)
                  nodes.push(new HeightMapGap(offset, measured.from - 1, oracle));
              while (pos <= end && measured.more) {
                  var height = measured.heights[measured.index++], deco = undefined, wType = void 0;
                  while (measured.more && (wType = measured.heights[measured.index]) < 0) {
                      var wHeight = measured.heights[(measured.index += 2) - 1];
                      height += wHeight;
                      deco = setLineWidgetHeight(deco || [], wType, wHeight);
                  }
                  var len = oracle.doc.lineAt(pos).length;
                  nodes.push(new HeightMapLine(len, height, deco));
                  pos += len + 1;
              }
              if (pos < end)
                  nodes.push(new HeightMapGap(pos, end, oracle));
              for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
                  var node = nodes_1[_i];
                  node.outdated = false;
              }
              oracle.heightChanged = true;
              return HeightMap.of(nodes);
          }
          else if (force || this.outdated) {
              this.setHeight(oracle, oracle.heightForGap(offset, offset + this.length));
              this.outdated = false;
          }
          return this;
      };
      HeightMapGap.prototype.toString = function () { return "gap(" + this.length + ")"; };
      HeightMapGap.prototype.forEachLine = function (from, to, offset, oracle, f) {
          for (var pos = Math.max(from, offset), end = Math.min(to, offset + this.length); pos <= end;) {
              var end_1 = oracle.doc.lineAt(pos).end;
              f(new LineHeight(pos, end_1, 0, oracle.heightForLine(end_1 - pos), null));
              pos = end_1 + 1;
          }
      };
      return HeightMapGap;
  }(HeightMap));
  var HeightMapBranch = /** @class */ (function (_super) {
      __extends(HeightMapBranch, _super);
      function HeightMapBranch(left, right) {
          var _this = _super.call(this, left.length + 1 + right.length, left.height + right.height, left.outdated || right.outdated) || this;
          _this.left = left;
          _this.right = right;
          _this.size = left.size + right.size;
          return _this;
      }
      HeightMapBranch.prototype.heightAt = function (pos, doc, bias, offset) {
          if (offset === void 0) { offset = 0; }
          var rightStart = offset + this.left.length + 1;
          return pos < rightStart ? this.left.heightAt(pos, doc, bias, offset)
              : this.left.height + this.right.heightAt(pos, doc, bias, rightStart);
      };
      HeightMapBranch.prototype.lineAt = function (height, doc, offset) {
          if (offset === void 0) { offset = 0; }
          var right = height - this.left.height;
          if (right < 0)
              return this.left.lineAt(height, doc, offset);
          return this.right.lineAt(right, doc, offset + this.left.length + 1);
      };
      HeightMapBranch.prototype.lineViewport = function (pos, doc, offset) {
          if (offset === void 0) { offset = 0; }
          var rightStart = this.left.length + 1;
          return pos < rightStart ? this.left.lineViewport(pos, doc, offset)
              : this.right.lineViewport(pos - rightStart, doc, offset + rightStart);
      };
      HeightMapBranch.prototype.replace = function (from, to, nodes, oracle, newFrom, newTo) {
          var rightStart = this.left.length + 1;
          if (to < rightStart)
              return this.balanced(this.left.replace(from, to, nodes, oracle, newFrom, newTo), this.right);
          else if (from >= rightStart)
              return this.balanced(this.left, this.right.replace(from - rightStart, to - rightStart, nodes, oracle, newFrom, newTo));
          else
              return _super.prototype.replace.call(this, from, to, nodes, oracle, newFrom, newTo);
      };
      HeightMapBranch.prototype.decomposeLeft = function (to, target, node, oracle, newTo) {
          var rightStart = this.left.length + 1;
          if (to < rightStart) {
              this.left.decomposeLeft(to, target, node, oracle, newTo);
          }
          else {
              target.push(this.left);
              this.right.decomposeLeft(to - rightStart, target, node, oracle, newTo);
          }
      };
      HeightMapBranch.prototype.decomposeRight = function (from, target, node, oracle, newFrom) {
          var rightStart = this.left.length + 1;
          if (from < rightStart) {
              this.left.decomposeRight(from, target, node, oracle, newFrom);
              target.push(this.right);
          }
          else {
              this.right.decomposeRight(from - rightStart, target, node, oracle, newFrom);
          }
      };
      HeightMapBranch.prototype.balanced = function (left, right) {
          if (left.size > 2 * right.size || right.size > 2 * left.size)
              return HeightMap.of([left, right]);
          this.left = left;
          this.right = right;
          this.height = left.height + right.height;
          this.outdated = left.outdated || right.outdated;
          this.size = left.size + right.size;
          this.length = left.length + 1 + right.length;
          return this;
      };
      HeightMapBranch.prototype.updateHeight = function (oracle, offset, force, measured) {
          if (offset === void 0) { offset = 0; }
          if (force === void 0) { force = false; }
          var _a = this, left = _a.left, right = _a.right, rightStart = offset + left.length + 1, rebalance = null;
          if (measured && measured.from <= offset + left.length && measured.more)
              rebalance = left = left.updateHeight(oracle, offset, force, measured);
          else
              left.updateHeight(oracle, offset, force);
          if (measured && measured.from <= rightStart + right.length && measured.more)
              rebalance = right = right.updateHeight(oracle, rightStart, force, measured);
          else
              right.updateHeight(oracle, rightStart, force);
          if (rebalance)
              return this.balanced(left, right);
          this.height = this.left.height + this.right.height;
          this.outdated = false;
          return this;
      };
      HeightMapBranch.prototype.toString = function () { return this.left + " " + this.right; };
      HeightMapBranch.prototype.forEachLine = function (from, to, offset, oracle, f) {
          var rightStart = offset + this.left.length + 1;
          if (from < rightStart)
              this.left.forEachLine(from, to, offset, oracle, f);
          if (to >= rightStart)
              this.right.forEachLine(from, to, rightStart, oracle, f);
      };
      return HeightMapBranch;
  }(HeightMap));
  var NodeBuilder = /** @class */ (function () {
      function NodeBuilder(pos, oracle) {
          this.pos = pos;
          this.oracle = oracle;
          this.nodes = [];
          this.lineStart = -1;
          this.lineEnd = -1;
          this.curLine = null;
          this.writtenTo = pos;
      }
      NodeBuilder.prototype.advance = function (pos) {
          if (pos <= this.pos)
              return;
          if (this.curLine) {
              if (this.lineEnd < 0)
                  this.lineEnd = this.oracle.doc.lineAt(this.pos).end;
              if (pos > this.lineEnd) {
                  this.curLine.length += (this.lineEnd - this.pos);
                  this.curLine.updateHeight(this.oracle, this.lineEnd - this.curLine.length);
                  this.curLine = null;
                  this.writtenTo = this.lineEnd + 1;
                  this.lineEnd = -1;
              }
              else {
                  this.curLine.length += (pos - this.pos);
                  this.writtenTo = pos;
              }
          }
          else if (this.lineEnd > -1 && pos > this.lineEnd) {
              this.lineEnd = -1;
          }
          this.pos = pos;
      };
      NodeBuilder.prototype.advanceCollapsed = function (pos, deco) {
          if (pos <= this.pos)
              return;
          if (deco.widget && deco.widget.estimatedHeight >= 0)
              this.addDeco(deco.widget.estimatedHeight);
          this.addDeco(this.pos - pos);
          if (this.curLine) {
              this.curLine.length += pos - this.pos;
              this.writtenTo = pos;
              if (this.lineEnd < pos)
                  this.lineEnd = -1;
          }
          this.pos = pos;
      };
      NodeBuilder.prototype.point = function (deco) {
          this.addDeco(deco.widget.estimatedHeight, deco instanceof LineDecoration ? (deco.side > 0 ? -1 : -2) : undefined);
      };
      NodeBuilder.prototype.flushTo = function (pos) {
          if (pos > this.writtenTo) {
              this.nodes.push(new HeightMapGap(this.writtenTo, pos, this.oracle));
              this.writtenTo = pos;
          }
      };
      NodeBuilder.prototype.addDeco = function (val, lineWidget) {
          if (!this.curLine) {
              this.lineStart = Math.max(this.writtenTo, this.oracle.doc.lineAt(this.pos).start);
              this.flushTo(this.lineStart - 1);
              this.nodes.push(this.curLine = new HeightMapLine(this.pos - this.lineStart, 0, []));
              this.writtenTo = this.pos;
          }
          if (lineWidget == null)
              this.curLine.deco.push(this.pos - this.lineStart, val);
          else
              setLineWidgetHeight(this.curLine.deco, lineWidget, val + lineWidgetHeight(this.curLine.deco, lineWidget));
      };
      NodeBuilder.prototype.ignoreRange = function (value) { return !value.collapsed; };
      NodeBuilder.prototype.ignorePoint = function (value) { return !(value.widget && value.widget.estimatedHeight > 0); };
      return NodeBuilder;
  }());
  function buildChangedNodes(oracle, decorations, from, to) {
      var builder = new NodeBuilder(from, oracle);
      RangeSet.iterateSpans(decorations, from, to, builder);
      if (builder.curLine)
          builder.curLine.updateHeight(oracle, builder.pos - builder.curLine.length);
      else
          builder.flushTo(builder.pos);
      if (builder.nodes.length == 0)
          builder.nodes.push(new HeightMapGap(0, 0, oracle));
      return builder.nodes;
  }

  var DocView = /** @class */ (function (_super) {
      __extends(DocView, _super);
      function DocView(dom, callbacks) {
          var _this = _super.call(this, null, dom) || this;
          _this.callbacks = callbacks;
          _this.children = [new LineView(_this)];
          _this.visiblePart = Viewport.empty;
          _this.viewports = [];
          _this.text = Text.of([""]);
          _this.decorations = [];
          _this.selection = EditorSelection.default;
          _this.selectionDirty = null;
          _this.forceSelectionUpdate = false;
          _this.heightMap = HeightMap.empty();
          _this.heightOracle = new HeightOracle;
          _this.computingViewport = false;
          _this.layoutCheckScheduled = -1;
          // A document position that has to be scrolled into view at the next layout check
          _this.scrollIntoView = -1;
          _this.paddingTop = 0;
          _this.paddingBottom = 0;
          _this.dirty = 2 /* node */;
          _this.viewportState = new ViewportState;
          _this.observer = new DOMObserver(_this, callbacks.onDOMChange, function () { return _this.checkLayout(); });
          _this.publicViewport = new EditorViewport(_this, 0, 0);
          return _this;
      }
      Object.defineProperty(DocView.prototype, "length", {
          get: function () { return this.text.length; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(DocView.prototype, "childGap", {
          get: function () { return 1; },
          enumerable: true,
          configurable: true
      });
      // Update the document view to a given state. scrollIntoView can be
      // used as a hint to compute a new viewport that includes that
      // position, if we know the editor is going to scroll that position
      // into view.
      DocView.prototype.update = function (state, prevState, transactions, scrollIntoView) {
          var _this = this;
          if (prevState === void 0) { prevState = null; }
          if (transactions === void 0) { transactions = []; }
          if (scrollIntoView === void 0) { scrollIntoView = -1; }
          // FIXME need some way to stabilize viewport—if a change causes the
          // top of the visible viewport to move, scroll position should be
          // adjusted to keep the content in place
          var oldLength = this.text.length;
          this.text = state.doc;
          this.selection = state.selection;
          var changedRanges = !prevState
              ? [new ChangedRange(0, oldLength, 0, state.doc.length)]
              : (transactions.length == 1 ? transactions[0].changes :
                  transactions.reduce(function (changes, tr) { return changes.appendSet(tr.changes); }, ChangeSet.empty)).changedRanges();
          this.heightMap = this.heightMap.applyChanges([], this.heightOracle.setDoc(state.doc), changedRanges);
          var _a = this.computeViewport(changedRanges, prevState, transactions, 0, scrollIntoView), viewport = _a.viewport, contentChanges = _a.contentChanges;
          if (this.dirty == 0 /* not */ && contentChanges.length == 0 &&
              this.selection.primary.from >= this.visiblePart.from &&
              this.selection.primary.to <= this.visiblePart.to) {
              this.updateSelection();
              if (scrollIntoView > -1)
                  this.scrollPosIntoView(scrollIntoView);
          }
          else {
              this.updateInner(contentChanges, oldLength, viewport);
              this.cancelLayoutCheck();
              this.callbacks.onUpdateDOM();
              if (scrollIntoView > -1)
                  this.scrollIntoView = scrollIntoView;
              this.layoutCheckScheduled = requestAnimationFrame(function () { return _this.checkLayout(); });
          }
      };
      // Used both by update and checkLayout do perform the actual DOM
      // update
      DocView.prototype.updateInner = function (changes, oldLength, visible) {
          var _this = this;
          this.visiblePart = visible;
          var viewports = [visible];
          var _a = this.selection.primary, head = _a.head, anchor = _a.anchor;
          if (head < visible.from || head > visible.to)
              viewports.push(this.heightMap.lineViewport(head, this.text));
          if (!viewports.some(function (_a) {
              var from = _a.from, to = _a.to;
              return anchor >= from && anchor <= to;
          }))
              viewports.push(this.heightMap.lineViewport(anchor, this.text));
          viewports.sort(function (a, b) { return a.from - b.from; });
          var matchingRanges = findMatchingRanges(viewports, this.viewports, changes);
          var decoSets = this.decorations.filter(function (d) { return d.size > 0; });
          var cursor = new ChildCursor(this.children, oldLength, 1);
          var posB = this.text.length;
          for (var i = viewports.length - 1;; i--) {
              var endI = cursor.i;
              cursor.findPos(i < 0 ? 0 : matchingRanges[i].to + 1);
              var gap = null;
              if (cursor.i < endI) {
                  var nextChild = this.children[cursor.i];
                  if (nextChild instanceof GapView)
                      gap = nextChild;
              }
              var nextB = i < 0 ? 0 : viewports[i].to + 1;
              if (posB >= nextB) {
                  if (!gap || endI - cursor.i != 1) {
                      if (!gap)
                          gap = new GapView(this);
                      this.replaceChildren(cursor.i, endI, [gap]);
                  }
                  gap.update(posB - nextB, this.heightAt(posB, 1) - this.heightAt(nextB, -1));
              }
              else if (endI != cursor.i) {
                  this.replaceChildren(cursor.i, endI);
              }
              if (i < 0)
                  break;
              var viewport = viewports[i], matching = matchingRanges[i];
              endI = cursor.i;
              if (matching.from == matching.to) {
                  this.replaceChildren(cursor.i, endI, [new LineView(this)]);
                  endI = cursor.i + 1;
              }
              else {
                  cursor.findPos(matching.from);
              }
              this.updatePart(cursor.i, endI, matching, viewport, changes, decoSets);
              posB = viewport.from - 1;
          }
          this.viewports = viewports;
          this.observer.ignore(function () {
              // Lock the height during redrawing, since Chrome sometimes
              // messes with the scroll position during DOM mutation (though
              // no relayout is triggered and I cannot imagine how it can
              // recompute the scroll position without a layout)
              _this.dom.style.height = _this.heightMap.height + "px";
              _this.sync();
              _this.updateSelection();
              _this.dom.style.height = "";
          });
      };
      // Update a single viewport in the DOM
      DocView.prototype.updatePart = function (startI, endI, oldPort, newPort, changes, decoSets) {
          var plan = clipPlan(changes, oldPort, newPort);
          var cur = new ChildCursor(this.children, oldPort.to, 1, endI);
          for (var i = plan.length - 1; i >= 0; i--) {
              var _a = plan[i], fromA = _a.fromA, toA = _a.toA, fromB = _a.fromB, toB = _a.toB;
              var _b = cur.findPos(toA), toI = _b.i, toOff = _b.off;
              var _c = cur.findPos(fromA), fromI = _c.i, fromOff = _c.off;
              this.updatePartRange(fromI, fromOff, toI, toOff, InlineBuilder.build(this.text, fromB, toB, decoSets));
          }
      };
      // Update a single changed range by replacing its old DOM
      // representation with the inline views that represent the new
      // content.
      DocView.prototype.updatePartRange = function (fromI, fromOff, toI, toOff, lines) {
          // All children in the touched range should be line views
          var children = this.children;
          if (lines.length == 1) {
              if (fromI == toI) { // Change within single line
                  children[fromI].update(fromOff, toOff, lines[0]);
              }
              else { // Join lines
                  var tail = children[toI].detachTail(toOff);
                  children[fromI].update(fromOff, undefined, lines[0], tail);
                  this.replaceChildren(fromI + 1, toI + 1);
              }
          }
          else { // Across lines
              var tail = children[toI].detachTail(toOff);
              children[fromI].update(fromOff, undefined, lines[0]);
              var insert = [];
              for (var j = 1; j < lines.length; j++)
                  insert.push(new LineView(this, lines[j], j < lines.length - 1 ? undefined : tail));
              this.replaceChildren(fromI + 1, toI + 1, insert);
          }
          // When the DOM nodes around the selection are moved to another
          // parent, Chrome sometimes reports a different selection through
          // getSelection than the one that it actually shows to the user.
          // This forces a selection update when lines are joined to work
          // around that. Issue #54
          if (fromI != toI && browser.chrome)
              this.forceSelectionUpdate = true;
      };
      // Sync the DOM selection to this.selection
      DocView.prototype.updateSelection = function (takeFocus) {
          if (takeFocus === void 0) { takeFocus = false; }
          this.clearSelectionDirty();
          var root = getRoot(this.dom);
          if (!takeFocus && root.activeElement != this.dom)
              return;
          var primary = this.selection.primary;
          var anchor = this.domFromPos(primary.anchor);
          var head = this.domFromPos(primary.head);
          var domSel = root.getSelection();
          // If the selection is already here, or in an equivalent position, don't touch it
          if (!this.forceSelectionUpdate &&
              isEquivalentPosition(anchor.node, anchor.offset, domSel.anchorNode, domSel.anchorOffset) &&
              isEquivalentPosition(head.node, head.offset, domSel.focusNode, domSel.focusOffset))
              return;
          this.forceSelectionUpdate = false;
          this.observer.ignore(function () {
              var _a;
              // Selection.extend can be used to create an 'inverted' selection
              // (one where the focus is before the anchor), but not all
              // browsers support it yet.
              if (domSel.extend) {
                  domSel.collapse(anchor.node, anchor.offset);
                  if (!primary.empty)
                      domSel.extend(head.node, head.offset);
              }
              else {
                  var range = document.createRange();
                  if (primary.anchor > primary.head)
                      _a = [head, anchor], anchor = _a[0], head = _a[1];
                  range.setEnd(head.node, head.offset);
                  range.setStart(anchor.node, anchor.offset);
                  domSel.removeAllRanges();
                  domSel.addRange(range);
              }
          });
      };
      DocView.prototype.heightAt = function (pos, bias) {
          return this.heightMap.heightAt(pos, this.text, bias) + this.paddingTop;
      };
      DocView.prototype.lineAtHeight = function (height) {
          return this.heightMap.lineAt(height - this.paddingTop, this.text);
      };
      // Compute the new viewport and set of decorations, while giving
      // plugin views the opportunity to respond to state and viewport
      // changes. Might require more than one iteration to become stable.
      DocView.prototype.computeViewport = function (contentChanges, prevState, transactions, bias, scrollIntoView) {
          if (contentChanges === void 0) { contentChanges = []; }
          try {
              this.computingViewport = true;
              return this.computeViewportInner(contentChanges, prevState, transactions, bias, scrollIntoView);
          }
          finally {
              this.computingViewport = false;
          }
      };
      DocView.prototype.computeViewportInner = function (contentChanges, prevState, transactions, bias, scrollIntoView) {
          if (contentChanges === void 0) { contentChanges = []; }
          for (var i = 0;; i++) {
              var viewport = this.viewportState.getViewport(this.text, this.heightMap, bias, scrollIntoView);
              var stateChange = transactions && transactions.length > 0;
              // After 5 tries, or when the viewport is stable and no more iterations are needed, return
              if (i == 5 || (transactions == null && viewport.from == this.publicViewport._from && viewport.to == this.publicViewport._to)) {
                  if (i == 5)
                      console.warn("Viewport and decorations failed to converge");
                  return { viewport: viewport, contentChanges: contentChanges };
              }
              (this.publicViewport._from = viewport.from, this.publicViewport._to = viewport.to);
              var prevDoc = this.text;
              if (stateChange) {
                  // For a state change, call `updateState`
                  this.callbacks.onUpdateState(prevState, transactions);
                  prevDoc = prevState.doc;
              }
              else {
                  // Otherwise call `updateViewport`
                  this.callbacks.onUpdateViewport();
              }
              var decorations = this.callbacks.getDecorations();
              // If the decorations are stable, stop.
              if (!stateChange && sameArray(decorations, this.decorations))
                  return { viewport: viewport, contentChanges: contentChanges };
              // Compare the decorations (between document changes)
              var _a = decoChanges(stateChange ? contentChanges : [], decorations, this.decorations, prevDoc), content = _a.content, height = _a.height;
              this.decorations = decorations;
              // Update the heightmap with these changes. If this is the first
              // iteration and the document changed, also include decorations
              // for inserted ranges.
              var heightChanges = extendWithRanges([], height);
              if (stateChange)
                  heightChanges = extendWithRanges(heightChanges, heightRelevantDecorations(decorations, contentChanges));
              this.heightMap = this.heightMap.applyChanges(decorations, this.heightOracle, heightChanges);
              // Accumulate content changes so that they can be redrawn
              contentChanges = extendWithRanges(contentChanges, content);
              // Make sure only one iteration is marked as required / state changing
              transactions = null;
          }
      };
      DocView.prototype.focus = function () {
          this.updateSelection(true);
      };
      DocView.prototype.cancelLayoutCheck = function () {
          if (this.layoutCheckScheduled > -1) {
              cancelAnimationFrame(this.layoutCheckScheduled);
              this.layoutCheckScheduled = -1;
          }
      };
      DocView.prototype.forceLayout = function () {
          if (this.layoutCheckScheduled > -1 && !this.computingViewport)
              this.checkLayout();
      };
      DocView.prototype.checkLayout = function (forceFull) {
          if (forceFull === void 0) { forceFull = false; }
          var _a;
          this.cancelLayoutCheck();
          this.measureVerticalPadding();
          var scrollIntoView = Math.min(this.scrollIntoView, this.text.length);
          this.scrollIntoView = -1;
          var scrollBias = 0;
          if (forceFull)
              this.viewportState.coverEverything();
          else
              scrollBias = this.viewportState.updateFromDOM(this.dom, this.paddingTop);
          if (this.viewportState.top >= this.viewportState.bottom)
              return; // We're invisible!
          var lineHeights = this.measureVisibleLineHeights(), refresh = false;
          if (this.heightOracle.mustRefresh(lineHeights)) {
              var _b = this.measureTextSize(), lineHeight = _b.lineHeight, charWidth = _b.charWidth;
              refresh = this.heightOracle.refresh(getComputedStyle(this.dom).whiteSpace, lineHeight, charWidth, (this.dom).clientWidth / charWidth, lineHeights);
          }
          if (scrollIntoView > -1)
              this.scrollPosIntoView(scrollIntoView);
          var updated = false;
          for (var i = 0;; i++) {
              this.heightOracle.heightChanged = false;
              this.heightMap = this.heightMap.updateHeight(this.heightOracle, 0, refresh, new MeasuredHeights(this.visiblePart.from, lineHeights || this.measureVisibleLineHeights()));
              var covered = this.viewportState.coveredBy(this.text, this.visiblePart, this.heightMap, scrollBias);
              if (covered && !this.heightOracle.heightChanged)
                  break;
              updated = true;
              if (i > 10)
                  throw new Error("Layout failed to converge");
              var viewport = this.visiblePart, contentChanges = [];
              if (!covered)
                  (_a = this.computeViewport([], null, null, scrollBias, -1), viewport = _a.viewport, contentChanges = _a.contentChanges);
              this.updateInner(contentChanges, this.text.length, viewport);
              lineHeights = null;
              refresh = false;
              scrollBias = 0;
              this.viewportState.updateFromDOM(this.dom, this.paddingTop);
          }
          if (updated) {
              this.observer.listenForScroll();
              this.callbacks.onUpdateDOM();
          }
      };
      DocView.prototype.scrollPosIntoView = function (pos) {
          var rect = this.coordsAt(pos);
          if (rect)
              scrollRectIntoView(this.dom, rect);
      };
      DocView.prototype.nearest = function (dom) {
          for (var cur = dom; cur;) {
              var domView = cur.cmView;
              if (domView && domView.root == this)
                  return domView;
              cur = cur.parentNode;
          }
          return null;
      };
      DocView.prototype.posFromDOM = function (node, offset) {
          var view = this.nearest(node);
          if (!view)
              throw new RangeError("Trying to find position for a DOM position outside of the document");
          return view.localPosFromDOM(node, offset) + view.posAtStart;
      };
      DocView.prototype.domFromPos = function (pos) {
          var _a = new ChildCursor(this.children, this.text.length, 1).findPos(pos), i = _a.i, off = _a.off;
          return this.children[i].domFromPos(off);
      };
      DocView.prototype.measureVisibleLineHeights = function () {
          var result = [], _a = this.visiblePart, from = _a.from, to = _a.to;
          for (var pos = 0, i = 0; pos <= to; i++) {
              var child = this.children[i];
              if (pos >= from) {
                  result.push(child.dom.getBoundingClientRect().height);
                  var before_1 = 0, after_1 = 0;
                  for (var _i = 0, _b = child.widgets; _i < _b.length; _i++) {
                      var w = _b[_i];
                      var h = w.dom.getBoundingClientRect().height;
                      if (w.side > 0)
                          after_1 += h;
                      else
                          before_1 += h;
                  }
                  if (before_1)
                      result.push(-2, before_1);
                  if (after_1)
                      result.push(-1, after_1);
              }
              pos += child.length + 1;
          }
          return result;
      };
      DocView.prototype.measureVerticalPadding = function () {
          var style = window.getComputedStyle(this.dom);
          this.paddingTop = parseInt(style.paddingTop) || 0;
          this.paddingBottom = parseInt(style.paddingBottom) || 0;
      };
      DocView.prototype.measureTextSize = function () {
          var _this = this;
          for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
              var child = _a[_i];
              if (child instanceof LineView) {
                  var measure = child.measureTextSize();
                  if (measure)
                      return measure;
              }
          }
          // If no workable line exists, force a layout of a measurable element
          var dummy = document.createElement("div"), lineHeight, charWidth;
          dummy.style.cssText = "contain: strict";
          dummy.textContent = "abc def ghi jkl mno pqr stu";
          this.observer.ignore(function () {
              _this.dom.appendChild(dummy);
              var rect = clientRectsFor(dummy.firstChild)[0];
              lineHeight = dummy.getBoundingClientRect().height;
              charWidth = rect ? rect.width / 27 : 7;
              dummy.remove();
          });
          return { lineHeight: lineHeight, charWidth: charWidth };
      };
      DocView.prototype.destroy = function () {
          cancelAnimationFrame(this.layoutCheckScheduled);
          this.observer.destroy();
      };
      DocView.prototype.clearSelectionDirty = function () {
          if (this.selectionDirty != null) {
              cancelAnimationFrame(this.selectionDirty);
              this.selectionDirty = null;
          }
      };
      DocView.prototype.setSelectionDirty = function () {
          var _this = this;
          this.observer.clearSelection();
          if (this.selectionDirty == null)
              this.selectionDirty = requestAnimationFrame(function () { return _this.updateSelection(); });
      };
      return DocView;
  }(ContentView));
  var noChildren = [];
  // Browsers appear to reserve a fixed amount of bits for height
  // styles, and ignore or clip heights above that. For Chrome and
  // Firefox, this is in the 20 million range, so we try to stay below
  // that.
  var MAX_NODE_HEIGHT = 1e7;
  var GapView = /** @class */ (function (_super) {
      __extends(GapView, _super);
      function GapView(parent) {
          var _this = _super.call(this, parent, document.createElement("div")) || this;
          _this.length = 0;
          _this.height = 0;
          _this.dom.contentEditable = "false";
          return _this;
      }
      Object.defineProperty(GapView.prototype, "children", {
          get: function () { return noChildren; },
          enumerable: true,
          configurable: true
      });
      GapView.prototype.update = function (length, height) {
          this.length = length;
          if (height != this.height) {
              this.height = height;
              this.markDirty();
          }
      };
      GapView.prototype.sync = function () {
          if (this.dirty) {
              if (this.height < MAX_NODE_HEIGHT) {
                  this.dom.style.height = this.height + "px";
                  while (this.dom.firstChild)
                      this.dom.firstChild.remove();
              }
              else {
                  this.dom.style.height = "";
                  while (this.dom.firstChild)
                      this.dom.firstChild.remove();
                  for (var remaining = this.height; remaining > 0; remaining -= MAX_NODE_HEIGHT) {
                      var elt = this.dom.appendChild(document.createElement("div"));
                      elt.style.height = Math.min(remaining, MAX_NODE_HEIGHT) + "px";
                  }
              }
              this.dirty = 0 /* not */;
          }
      };
      Object.defineProperty(GapView.prototype, "overrideDOMText", {
          get: function () {
              return this.parent ? this.parent.text.sliceLines(this.posAtStart, this.posAtEnd) : [""];
          },
          enumerable: true,
          configurable: true
      });
      GapView.prototype.domBoundsAround = function () { return null; };
      return GapView;
  }(ContentView));
  function decoChanges(diff, decorations, oldDecorations, oldDoc) {
      var contentRanges = [], heightRanges = [];
      for (var i = decorations.length - 1; i >= 0; i--) {
          var deco = decorations[i], oldDeco = i < oldDecorations.length ? oldDecorations[i] : Decoration.none;
          if (deco.size == 0 && oldDeco.size == 0)
              continue;
          var newRanges = findChangedRanges(oldDeco, deco, diff, oldDoc);
          contentRanges = joinRanges(contentRanges, newRanges.content);
          heightRanges = joinRanges(heightRanges, newRanges.height);
      }
      return { content: contentRanges, height: heightRanges };
  }
  function extendWithRanges(diff, ranges) {
      var result = [];
      for (var dI = 0, rI = 0, posA = 0, posB = 0;; dI++) {
          var next = dI == diff.length ? null : diff[dI], off = posA - posB;
          var end = next ? next.fromB : 2e9;
          while (rI < ranges.length && ranges[rI] < end) {
              var from = ranges[rI], to = ranges[rI + 1];
              var fromB = Math.max(posB, from), toB = Math.min(end, to);
              if (fromB <= toB)
                  new ChangedRange(fromB + off, toB + off, fromB, toB).addToSet(result);
              if (to > end)
                  break;
              else
                  rI += 2;
          }
          if (!next)
              return result;
          new ChangedRange(next.fromA, next.toA, next.fromB, next.toB).addToSet(result);
          posA = next.toA;
          posB = next.toB;
      }
  }
  function sameArray(a, b) {
      if (a.length != b.length)
          return false;
      for (var i = 0; i < a.length; i++)
          if (a[i] !== b[i])
              return false;
      return true;
  }
  function boundAfter(viewport, pos) {
      return pos < viewport.from ? viewport.from : pos < viewport.to ? viewport.to : 2e9 + 1;
  }
  // Transforms a plan to take viewports into account. Discards changes
  // (or part of changes) that are outside of the viewport, and adds
  // ranges for text that was in one viewport but not the other (so that
  // old text is cleared out and newly visible text is drawn).
  function clipPlan(plan, viewportA, viewportB) {
      var result = [];
      var posA = 0, posB = 0;
      for (var i = 0;; i++) {
          var range = i < plan.length ? plan[i] : null;
          // Look at the unchanged range before the next range (or the end
          // if there is no next range), divide it by viewport boundaries,
          // and for each piece, if it is only in one viewport, add a
          // changed range.
          var nextA = range ? range.fromA : 2e9, nextB = range ? range.fromB : 2e9;
          while (posA < nextA) {
              var advance = Math.min(Math.min(boundAfter(viewportA, posA), nextA) - posA, Math.min(boundAfter(viewportB, posB), nextB) - posB);
              if (advance == 0)
                  break;
              var endA = posA + advance, endB = posB + advance;
              if ((posA >= viewportA.to || endA <= viewportA.from) != (posB >= viewportB.to || endB <= viewportB.from))
                  new ChangedRange(viewportA.clip(posA), viewportA.clip(endA), viewportB.clip(posB), viewportB.clip(endB)).addToSet(result);
              posA = endA;
              posB = endB;
          }
          if (!range || (range.fromA > viewportA.to && range.fromB > viewportB.to))
              break;
          // Clip existing ranges to the viewports
          if ((range.toA >= viewportA.from && range.fromA <= viewportA.to) ||
              (range.toB >= viewportB.from && range.fromB <= viewportB.to))
              new ChangedRange(viewportA.clip(range.fromA), viewportA.clip(range.toA), viewportB.clip(range.fromB), viewportB.clip(range.toB)).addToSet(result);
          posA = range.toA;
          posB = range.toB;
      }
      return result;
  }
  function mapThroughChanges(pos, bias, changes) {
      var off = 0;
      for (var _i = 0, changes_1 = changes; _i < changes_1.length; _i++) {
          var range = changes_1[_i];
          if (pos < range.fromA)
              return pos + off;
          if (pos <= range.toA)
              return bias < 0 ? range.fromA : range.toA;
          off = range.toB - range.toA;
      }
      return pos + off;
  }
  function findMatchingRanges(viewports, prevViewports, changes) {
      var prevI = 0, result = [];
      outer: for (var _i = 0, viewports_1 = viewports; _i < viewports_1.length; _i++) {
          var viewport = viewports_1[_i];
          for (var j = prevI; j < prevViewports.length; j++) {
              var prev = prevViewports[j];
              if (mapThroughChanges(prev.from, 1, changes) < viewport.to &&
                  mapThroughChanges(prev.to, -1, changes) > viewport.from) {
                  result.push(prev);
                  prevI = j + 1;
                  continue outer;
              }
          }
          var at = result.length ? result[result.length - 1].to : 0;
          result.push(new Viewport(at, at));
      }
      return result;
  }
  // Public shim for giving client code access to viewport information
  var EditorViewport = /** @class */ (function () {
      /** @internal */
      function EditorViewport(docView, _from, _to) {
          this.docView = docView;
          this._from = _from;
          this._to = _to;
      }
      Object.defineProperty(EditorViewport.prototype, "from", {
          get: function () { return this._from; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(EditorViewport.prototype, "to", {
          get: function () { return this._to; },
          enumerable: true,
          configurable: true
      });
      EditorViewport.prototype.forEachLine = function (f) {
          this.docView.heightMap.forEachLine(this.from, this.to, 0, this.docView.heightOracle, f);
      };
      return EditorViewport;
  }());

  // FIXME rename "word" to something more descriptive of what it actually does?
  function movePos(view, start, direction, granularity, action) {
      if (granularity === void 0) { granularity = "character"; }
      var sel = view.root.getSelection();
      var context = LineContext.get(view, start);
      var dir = direction == "forward" || direction == "right" ? 1 : -1;
      // Can only query native behavior when Selection.modify is
      // supported, the cursor is well inside the rendered viewport, and
      // we're not doing by-line motion on Gecko (which will mess up goal
      // column motion)
      if (sel.modify && context && !context.nearViewportEnd(view) && view.hasFocus() &&
          granularity != "word" &&
          !(granularity == "line" && (browser.gecko || view.state.selection.ranges.length > 1))) {
          return view.docView.observer.ignore(function () {
              var prepared = context.prepareForQuery(view, start);
              var startDOM = view.docView.domFromPos(start);
              var equiv = (!browser.chrome || prepared.lines.length == 0) &&
                  isEquivalentPosition(startDOM.node, startDOM.offset, sel.focusNode, sel.focusOffset) && false;
              // Firefox skips an extra character ahead when extending across
              // an uneditable element (but not when moving)
              if (prepared.atWidget && browser.gecko && action == "extend")
                  action = "move";
              if (action == "move" && !(equiv && sel.isCollapsed))
                  sel.collapse(startDOM.node, startDOM.offset);
              else if (action == "extend" && !equiv)
                  sel.extend(startDOM.node, startDOM.offset);
              sel.modify(action, direction, granularity);
              view.docView.setSelectionDirty();
              var result = view.docView.posFromDOM(sel.focusNode, sel.focusOffset);
              context.undoQueryPreparation(view, prepared);
              return result;
          });
      }
      else if (granularity == "character") {
          return moveCharacterSimple(start, dir, context, view.state.doc);
      }
      else if (granularity == "lineboundary") {
          if (context)
              return context.start + (dir < 0 ? 0 : context.line.length);
          var line = view.state.doc.lineAt(start);
          return dir < 0 ? line.start : line.end;
      }
      else if (granularity == "line") {
          if (context && !context.nearViewportEnd(view, dir)) {
              var startCoords = view.docView.coordsAt(start);
              var goal = getGoalColumn(view, start, startCoords.left);
              for (var startY = dir < 0 ? startCoords.top : startCoords.bottom, dist = 5; dist < 50; dist += 10) {
                  var pos = posAtCoords(view, { x: goal.column, y: startY + dist * dir }, dir);
                  if (pos < 0)
                      break;
                  if (pos != start) {
                      goal.pos = pos;
                      return pos;
                  }
              }
          }
          // Can't do a precise one based on DOM positions, fall back to per-column
          return moveLineByColumn(view.state.doc, view.state.tabSize, start, dir);
      }
      else if (granularity == "word") {
          return moveWord(view, start, direction);
      }
      else {
          throw new RangeError("Invalid move granularity: " + granularity);
      }
  }
  function moveLineByColumn(doc, tabSize, pos, dir) {
      var line = doc.lineAt(pos);
      // FIXME also needs goal column?
      var col = 0;
      for (var iter = doc.iterRange(line.start, pos); !iter.next().done;)
          col = countColumn(iter.value, col, tabSize);
      if (dir < 0 && line.start == 0)
          return 0;
      else if (dir > 0 && line.end == doc.length)
          return line.end;
      var otherLine = doc.line(line.number + dir);
      var result = otherLine.start;
      var seen = 0;
      for (var iter = doc.iterRange(otherLine.start, otherLine.end); seen >= col && !iter.next().done;) {
          var _a = findColumn(iter.value, seen, col, tabSize), offset = _a.offset, leftOver = _a.leftOver;
          seen = col - leftOver;
          result += offset;
      }
      return result;
  }
  function moveCharacterSimple(start, dir, context, doc) {
      if (context == null) {
          for (var pos = start;; pos += dir) {
              if (pos == 0 || pos == doc.length)
                  return pos;
              if (!isExtendingChar((dir < 0 ? doc.slice(pos - 1, pos) : doc.slice(pos, pos + 1)))) {
                  if (dir < 0)
                      return pos - 1;
                  else if (pos != start)
                      return pos;
              }
          }
      }
      for (var _a = context.line.childPos(start - context.start), i = _a.i, off = _a.off, children = context.line.children, pos = start;;) {
          if (off == (dir < 0 || i == children.length ? 0 : children[i].length)) {
              i += dir;
              if (i < 0 || i >= children.length) // End/start of line
                  return Math.max(0, Math.min(doc.length, pos + (start == pos ? dir : 0)));
              off = dir < 0 ? children[i].length : 0;
          }
          var inline = children[i];
          if (inline instanceof TextView) {
              if (!isExtendingChar(inline.text.charAt(off - (dir < 0 ? 1 : 0)))) {
                  if (dir < 0)
                      return pos - 1;
                  else if (pos != start)
                      return pos;
              }
              off += dir;
              pos += dir;
          }
          else if (inline.length > 0) {
              return pos - off + (dir < 0 ? 0 : inline.length);
          }
      }
  }
  function moveWord(view, start, direction) {
      var doc = view.state.doc;
      for (var pos = start, i = 0;; i++) {
          var next = movePos(view, pos, direction, "character", "move");
          if (next == pos)
              return pos; // End of document
          if (doc.sliceLines(Math.min(next, pos), Math.max(next, pos)).length > 1)
              return next; // Crossed a line boundary
          var group = SelectionRange.groupAt(view.state, next, next > pos ? -1 : 1);
          var away = pos < group.from && pos > group.to;
          // If the group is away from its start position, we jumped over a
          // bidi boundary, and should take the side closest (in index
          // coordinates) to the start position
          var start_1 = away ? pos < group.head : group.from == pos ? false : group.to == pos ? true : next < pos;
          pos = start_1 ? group.from : group.to;
          if (i > 0 || /\S/.test(doc.slice(group.from, group.to)))
              return pos;
          next = Math.max(0, Math.min(doc.length, pos + (start_1 ? -1 : 1)));
      }
  }
  function getGoalColumn(view, pos, column) {
      for (var _i = 0, _a = view.inputState.goalColumns; _i < _a.length; _i++) {
          var goal_1 = _a[_i];
          if (goal_1.pos == pos)
              return goal_1;
      }
      var goal = { pos: 0, column: column };
      view.inputState.goalColumns.push(goal);
      return goal;
  }
  var LineContext = /** @class */ (function () {
      function LineContext(line, start, index) {
          this.line = line;
          this.start = start;
          this.index = index;
      }
      LineContext.get = function (view, pos) {
          for (var i = 0, off = 0;; i++) {
              var line = view.docView.children[i], end = off + line.length;
              if (end >= pos)
                  return line instanceof LineView ? new LineContext(line, off, i) : null;
              off = end + 1;
          }
      };
      LineContext.prototype.nearViewportEnd = function (view, side) {
          if (side === void 0) { side = 0; }
          for (var _i = 0, _a = view.docView.viewports; _i < _a.length; _i++) {
              var _b = _a[_i], from = _b.from, to = _b.to;
              if (from > 0 && from == this.start && side <= 0 ||
                  to < view.state.doc.length && to == this.start + this.line.length && side >= 0)
                  return true;
          }
          return false;
      };
      // FIXME limit the amount of work in character motion in non-bidi
      // context? or not worth it?
      LineContext.prototype.prepareForQuery = function (view, pos) {
          var linesToSync = [], atWidget = false;
          function maybeHide(view) {
              if (!(view instanceof TextView))
                  atWidget = true;
              if (view.length > 0)
                  return false;
              view.dom.remove();
              if (linesToSync.indexOf(view.parent) < 0)
                  linesToSync.push(view.parent);
              return true;
          }
          var _a = this.line.childPos(pos - this.start), i = _a.i, off = _a.off;
          if (off == 0) {
              for (var j = i; j < this.line.children.length; j++)
                  if (!maybeHide(this.line.children[j]))
                      break;
              for (var j = i; j > 0; j--)
                  if (!maybeHide(this.line.children[j - 1]))
                      break;
          }
          function addForLine(line, omit) {
              if (omit === void 0) { omit = -1; }
              if (line.children.length == 0)
                  return;
              for (var i_1 = 0, off_1 = 0; i_1 <= line.children.length; i_1++) {
                  var next = i_1 == line.children.length ? null : line.children[i_1];
                  if ((!next || !(next instanceof TextView)) && off_1 != omit &&
                      (i_1 == 0 || !(line.children[i_1 - 1] instanceof TextView))) {
                      line.dom.insertBefore(document.createTextNode("\u200b"), next ? next.dom : null);
                      if (linesToSync.indexOf(line) < 0)
                          linesToSync.push(line);
                  }
                  if (next)
                      off_1 += next.length;
              }
          }
          if (this.index > 0)
              addForLine(this.line.parent.children[this.index - 1]);
          addForLine(this.line, pos - this.start);
          if (this.index < this.line.parent.children.length - 1)
              addForLine(this.line.parent.children[this.index + 1]);
          return { lines: linesToSync, atWidget: atWidget };
      };
      LineContext.prototype.undoQueryPreparation = function (view, toSync) {
          for (var _i = 0, _a = toSync.lines; _i < _a.length; _i++) {
              var line = _a[_i];
              line.syncDOMChildren();
          }
      };
      return LineContext;
  }());
  // Search the DOM for the {node, offset} position closest to the given
  // coordinates. Very inefficient and crude, but can usually be avoided
  // by calling caret(Position|Range)FromPoint instead.
  // FIXME holding arrow-up/down at the end of the viewport is a rather
  // common use case that will repeatedly trigger this code. Maybe
  // introduce some element of binary search after all?
  function domPosAtCoords(parent, x, y) {
      var closest, dxClosest = 2e8, xClosest, offset = 0;
      var rowBot = y, rowTop = y;
      for (var child = parent.firstChild, childIndex = 0; child; child = child.nextSibling, childIndex++) {
          var rects = clientRectsFor(child);
          for (var i = 0; i < rects.length; i++) {
              var rect = rects[i];
              if (rect.top <= rowBot && rect.bottom >= rowTop) {
                  rowBot = Math.max(rect.bottom, rowBot);
                  rowTop = Math.min(rect.top, rowTop);
                  var dx = rect.left > x ? rect.left - x
                      : rect.right < x ? x - rect.right : 0;
                  if (dx < dxClosest) {
                      closest = child;
                      dxClosest = dx;
                      xClosest = dx == 0 ? x : rect.left > x ? rect.left : rect.right;
                      if (child.nodeType == 1)
                          offset = childIndex + (x >= (rect.left + rect.right) / 2 ? 1 : 0);
                      continue;
                  }
              }
              if (!closest && (x >= rect.right && y >= rect.top ||
                  x >= rect.left && y >= rect.bottom))
                  offset = childIndex + 1;
          }
      }
      if (closest && closest.nodeType == 3)
          return domPosInText(closest, xClosest, y);
      if (!closest || closest.contentEditable == "false" || (dxClosest && closest.nodeType == 1))
          return { node: parent, offset: offset };
      return domPosAtCoords(closest, xClosest, y);
  }
  function domPosInText(node, x, y) {
      var len = node.nodeValue.length, range = document.createRange();
      for (var i = 0; i < len; i++) {
          range.setEnd(node, i + 1);
          range.setStart(node, i);
          var rects = range.getClientRects();
          for (var j = 0; j < rects.length; j++) {
              var rect = rects[j];
              if (rect.top == rect.bottom)
                  continue;
              if (rect.left - 1 <= x && rect.right + 1 >= x &&
                  rect.top - 1 <= y && rect.bottom + 1 >= y) {
                  var right = x >= (rect.left + rect.right) / 2, after_1 = right;
                  if (browser.chrome || browser.gecko) {
                      // Check for RTL on browsers that support getting client
                      // rects for empty ranges.
                      range.setEnd(node, i);
                      var rectBefore = range.getBoundingClientRect();
                      if (rectBefore.left == rect.right)
                          after_1 = !right;
                  }
                  return { node: node, offset: i + (after_1 ? 1 : 0) };
              }
          }
      }
      return { node: node, offset: 0 };
  }
  function posAtCoords(view, _a, bias) {
      var x = _a.x, y = _a.y;
      if (bias === void 0) { bias = -1; }
      var _b;
      var content = view.contentDOM.getBoundingClientRect(), heightLine;
      for (;;) {
          heightLine = view.lineAtHeight(y - content.top);
          if (heightLine.textTop > 0) {
              if (bias > 0)
                  y += heightLine.textTop + 1;
              else if (heightLine.start > 0) {
                  y += heightLine.top - 1;
                  continue;
              }
          }
          else if (heightLine.textBottom < 0) {
              if (bias < 0)
                  y += heightLine.textBottom - 1;
              else if (heightLine.end < view.state.doc.length) {
                  y += heightLine.bottom + 1;
                  continue;
              }
          }
          break;
      }
      var lineStart = heightLine.start;
      // If this is outside of the rendered viewport, we can't determine a position 
      if (lineStart < view.viewport.from)
          return view.viewport.from == 0 ? 0 : -1;
      if (lineStart > view.viewport.to)
          return view.viewport.to == view.state.doc.length ? view.state.doc.length : -1;
      // Clip x to the viewport sides
      x = Math.max(content.left + 1, Math.min(content.right - 1, x));
      var root = getRoot(view.contentDOM), element = root.elementFromPoint(x, y);
      // There's visible editor content under the point, so we can try
      // using caret(Position|Range)FromPoint as a shortcut
      var node, offset = -1;
      if (element && view.contentDOM.contains(element) && !(view.docView.nearest(element) instanceof WidgetView)) {
          // TypeScript doesn't know these methods exist on DocumentOrShadowRoot
          if (root.caretPositionFromPoint) {
              var pos = root.caretPositionFromPoint(x, y);
              if (pos)
                  (node = pos.offsetNode, offset = pos.offset);
          }
          else if (root.caretRangeFromPoint) {
              var range = root.caretRangeFromPoint(x, y);
              if (range)
                  (node = range.startContainer, offset = range.startOffset);
          }
      }
      // No luck, do our own (potentially expensive) search
      if (!node) {
          var line = LineContext.get(view, lineStart).line;
          (_b = domPosAtCoords(line.dom, x, y), node = _b.node, offset = _b.offset);
      }
      return view.docView.posFromDOM(node, offset);
  }

  // This will also be where dragging info and such goes
  var InputState = /** @class */ (function () {
      function InputState(view) {
          var _this = this;
          this.lastKeyCode = 0;
          this.lastKeyTime = 0;
          this.lastSelectionOrigin = null;
          this.lastSelectionTime = 0;
          this.registeredEvents = [];
          this.goalColumns = [];
          this.mouseSelection = null;
          var _loop_1 = function (type) {
              var handler = handlers[type];
              view.contentDOM.addEventListener(type, function (event) {
                  if (!eventBelongsToEditor(view, event))
                      return;
                  if (_this.runCustomHandlers(type, view, event))
                      event.preventDefault();
                  else
                      handler(view, event);
              });
              this_1.registeredEvents.push(type);
          };
          var this_1 = this;
          for (var type in handlers) {
              _loop_1(type);
          }
          // Must always run, even if a custom handler handled the event
          view.contentDOM.addEventListener("keydown", function (event) {
              view.inputState.lastKeyCode = event.keyCode;
              view.inputState.lastKeyTime = Date.now();
          });
          if (document.activeElement == view.contentDOM)
              view.dom.classList.add("CodeMirror-focused");
          this.customHandlers = customHandlers(view);
          var _loop_2 = function (type) {
              if (this_2.registeredEvents.indexOf(type) < 0) {
                  this_2.registeredEvents.push(type);
                  view.contentDOM.addEventListener(type, function (event) {
                      if (!eventBelongsToEditor(view, event))
                          return;
                      if (_this.runCustomHandlers(type, view, event))
                          event.preventDefault();
                  });
              }
          };
          var this_2 = this;
          for (var type in this.customHandlers) {
              _loop_2(type);
          }
      }
      InputState.prototype.setSelectionOrigin = function (origin) {
          this.lastSelectionOrigin = origin;
          this.lastSelectionTime = Date.now();
      };
      InputState.prototype.runCustomHandlers = function (type, view, event) {
          var handlers = this.customHandlers[type];
          if (handlers)
              for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
                  var handler = handlers_1[_i];
                  if (handler(view, event) || event.defaultPrevented)
                      return true;
              }
          return false;
      };
      InputState.prototype.startMouseSelection = function (view, event, update) {
          if (this.mouseSelection)
              this.mouseSelection.destroy();
          this.mouseSelection = new MouseSelection(this, view, event, update);
      };
      InputState.prototype.update = function (transactions) {
          if (this.mouseSelection)
              this.mouseSelection.map(transactions.reduce(function (set, tr) { return set.appendSet(tr.changes); }, ChangeSet.empty));
          this.lastKeyCode = this.lastSelectionTime = 0;
      };
      InputState.prototype.destroy = function () {
          if (this.mouseSelection)
              this.mouseSelection.destroy();
      };
      return InputState;
  }());
  var MouseSelection = /** @class */ (function () {
      function MouseSelection(inputState, view, event, update) {
          this.inputState = inputState;
          this.view = view;
          this.update = update;
          var doc = view.contentDOM.ownerDocument;
          doc.addEventListener("mousemove", this.move = this.move.bind(this));
          doc.addEventListener("mouseup", this.up = this.up.bind(this));
          // FIXME make these configurable somehow
          this.extend = event.shiftKey;
          this.multiple = view.state.multipleSelections && (browser.mac ? event.metaKey : event.ctrlKey);
          this.dragMove = !(browser.mac ? event.altKey : event.ctrlKey);
          this.startSelection = view.state.selection;
          var _a = this.queryPos(event), pos = _a.pos, bias = _a.bias;
          this.startPos = this.curPos = pos;
          this.startBias = this.curBias = bias;
          this.dragging = isInPrimarySelection(view, this.startPos, event) ? null : false;
          // When clicking outside of the selection, immediately apply the
          // effect of starting the selection
          if (this.dragging === false) {
              event.preventDefault();
              this.select();
          }
      }
      MouseSelection.prototype.queryPos = function (event) {
          var pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
          var coords = this.view.coordsAtPos(pos);
          var bias = !coords ? 1 :
              coords.top > event.clientY ? -1 :
                  coords.bottom < event.clientY ? 1 :
                      coords.left > event.clientX ? -1 : 1;
          return { pos: pos, bias: bias };
      };
      MouseSelection.prototype.move = function (event) {
          if (event.buttons == 0)
              return this.destroy();
          if (this.dragging !== false)
              return;
          var _a = this.queryPos(event), pos = _a.pos, bias = _a.bias;
          if (pos == this.curPos && bias == this.curBias)
              return;
          this.curPos = pos;
          this.curBias = bias;
          this.select();
      };
      MouseSelection.prototype.up = function (event) {
          if (this.dragging == null)
              this.select();
          this.destroy();
      };
      MouseSelection.prototype.destroy = function () {
          var doc = this.view.contentDOM.ownerDocument;
          doc.removeEventListener("mousemove", this.move);
          doc.removeEventListener("mouseup", this.up);
          this.inputState.mouseSelection = null;
      };
      MouseSelection.prototype.select = function () {
          var selection = this.update(this.view, this.startSelection, this.startPos, this.startBias, this.curPos, this.curBias, this.extend, this.multiple);
          if (!selection.eq(this.view.state.selection))
              this.view.dispatch(this.view.state.transaction.setSelection(selection)
                  .setMeta(MetaSlot.userEvent, "pointer"));
      };
      MouseSelection.prototype.map = function (changes) {
          if (changes.length) {
              this.startSelection = this.startSelection.map(changes);
              this.startPos = changes.mapPos(this.startPos);
              this.curPos = changes.mapPos(this.curPos);
          }
          if (this.dragging)
              this.dragging = this.dragging.map(changes);
      };
      return MouseSelection;
  }());
  function isInPrimarySelection(view, pos, event) {
      var primary = view.state.selection.primary;
      if (primary.empty)
          return false;
      if (pos < primary.from || pos > primary.to)
          return false;
      if (pos > primary.from && pos < primary.to)
          return true;
      // On boundary clicks, check whether the coordinates are inside the
      // selection's client rectangles
      var sel = view.root.getSelection();
      if (sel.rangeCount == 0)
          return true;
      var rects = sel.getRangeAt(0).getClientRects();
      for (var i = 0; i < rects.length; i++) {
          var rect = rects[i];
          if (rect.left <= event.clientX && rect.right >= event.clientX &&
              rect.top <= event.clientY && rect.bottom >= event.clientY)
              return true;
      }
      return false;
  }
  function eventBelongsToEditor(view, event) {
      if (!event.bubbles)
          return true;
      if (event.defaultPrevented)
          return false;
      for (var node = event.target; node != view.contentDOM; node = node.parentNode)
          if (!node || node.nodeType == 11 || (node.cmView && node.cmView.ignoreEvent(event)))
              return false;
      return true;
  }
  function customHandlers(view) {
      var result = Object.create(null);
      view.someProp("handleDOMEvents", function (handlers) {
          for (var eventType in handlers)
              (result[eventType] || (result[eventType] = [])).push(handlers[eventType]);
      });
      return result;
  }
  var handlers = Object.create(null);
  // This is very crude, but unfortunately both these browsers _pretend_
  // that they have a clipboard API—all the objects and methods are
  // there, they just don't work, and they are hard to test.
  var brokenClipboardAPI = (browser.ie && browser.ie_version < 15) ||
      (browser.ios && browser.webkit_version < 604);
  function capturePaste(view) {
      var doc = view.dom.ownerDocument;
      var target = doc.body.appendChild(doc.createElement("textarea"));
      target.style.cssText = "position: fixed; left: -10000px; top: 10px";
      target.focus();
      setTimeout(function () {
          view.focus();
          doc.body.removeChild(target);
          doPaste(view, target.value);
      }, 50);
  }
  function doPaste(view, text) {
      view.dispatch(view.state.transaction.replaceSelection(text)
          .setMeta(MetaSlot.userEvent, "paste").scrollIntoView());
  }
  function mustCapture(event) {
      var mods = (event.ctrlKey ? 1 /* ctrl */ : 0) | (event.metaKey ? 8 /* meta */ : 0) |
          (event.altKey ? 2 /* alt */ : 0) | (event.shiftKey ? 4 /* shift */ : 0);
      var code = event.keyCode, macCtrl = browser.mac && mods == 1 /* ctrl */;
      return code == 8 || (macCtrl && code == 72) || // Backspace, Ctrl-h on Mac
          code == 46 || (macCtrl && code == 68) || // Delete, Ctrl-d on Mac
          code == 27 || // Esc
          (mods == (browser.mac ? 8 /* meta */ : 1 /* ctrl */) && // Ctrl/Cmd-[biyz]
              (code == 66 || code == 73 || code == 89 || code == 90));
  }
  handlers.keydown = function (view, event) {
      if (mustCapture(event))
          event.preventDefault();
      view.inputState.setSelectionOrigin("keyboard");
  };
  handlers.touchdown = handlers.touchmove = function (view, event) {
      view.inputState.setSelectionOrigin("pointer");
  };
  handlers.mousedown = function (view, event) {
      if (event.button == 0)
          view.startMouseSelection(event, updateMouseSelection(event.detail));
  };
  function rangeForClick(view, pos, bias, type) {
      if (type == 1) { // Single click
          return new SelectionRange(pos);
      }
      else if (type == 2) { // Double click
          return SelectionRange.groupAt(view.state, pos, bias);
      }
      else { // Triple click
          var context_1 = LineContext.get(view, pos);
          if (context_1)
              return new SelectionRange(context_1.start + context_1.line.length, context_1.start);
          var _a = view.state.doc.lineAt(pos), start = _a.start, end = _a.end;
          return new SelectionRange(start, end);
      }
  }
  function updateMouseSelection(type) {
      return function (view, startSelection, startPos, startBias, curPos, curBias, extend, multiple) {
          var range = rangeForClick(view, curPos, curBias, type);
          if (startPos != curPos && !extend) {
              var startRange = rangeForClick(view, startPos, startBias, type);
              range = range.extend(Math.min(startRange.from, range.from), Math.max(startRange.to, range.to));
          }
          if (extend)
              return startSelection.replaceRange(startSelection.primary.extend(range.from, range.to));
          else if (multiple)
              return startSelection.addRange(range);
          else
              return EditorSelection.create([range]);
      };
  }
  handlers.dragstart = function (view, event) {
      var _a = view.state, doc = _a.doc, primary = _a.selection.primary;
      var mouseSelection = view.inputState.mouseSelection;
      if (mouseSelection)
          mouseSelection.dragging = primary;
      if (event.dataTransfer) {
          event.dataTransfer.setData("Text", doc.slice(primary.from, primary.to));
          event.dataTransfer.effectAllowed = "copyMove";
      }
  };
  handlers.drop = function (view, event) {
      if (!event.dataTransfer)
          return;
      var dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      var text = event.dataTransfer.getData("Text");
      if (dropPos < 0 || !text)
          return;
      event.preventDefault();
      var tr = view.state.transaction;
      var mouseSelection = view.inputState.mouseSelection;
      if (mouseSelection && mouseSelection.dragging && mouseSelection.dragMove) {
          tr = tr.replace(mouseSelection.dragging.from, mouseSelection.dragging.to, "");
          dropPos = tr.changes.mapPos(dropPos);
      }
      var change = new Change(dropPos, dropPos, view.state.splitLines(text));
      tr = tr.change(change)
          .setSelection(EditorSelection.single(dropPos, dropPos + change.length))
          .setMeta(MetaSlot.userEvent, "drop");
      view.focus();
      view.dispatch(tr);
  };
  handlers.paste = function (view, event) {
      view.docView.observer.flush();
      var data = brokenClipboardAPI ? null : event.clipboardData;
      var text = data && data.getData("text/plain");
      if (text) {
          doPaste(view, text);
          event.preventDefault();
      }
      else {
          capturePaste(view);
      }
  };
  function captureCopy(view, text) {
      // The extra wrapper is somehow necessary on IE/Edge to prevent the
      // content from being mangled when it is put onto the clipboard
      var doc = view.dom.ownerDocument;
      var target = doc.body.appendChild(doc.createElement("textarea"));
      target.style.cssText = "position: fixed; left: -10000px; top: 10px";
      target.value = text;
      target.focus();
      target.selectionEnd = text.length;
      target.selectionStart = 0;
      setTimeout(function () {
          doc.body.removeChild(target);
          view.focus();
      }, 50);
  }
  handlers.copy = handlers.cut = function (view, event) {
      var range = view.state.selection.primary;
      if (range.empty)
          return;
      var data = brokenClipboardAPI ? null : event.clipboardData;
      var text = view.state.joinLines(view.state.doc.sliceLines(range.from, range.to));
      if (data) {
          event.preventDefault();
          data.clearData();
          data.setData("text/plain", text);
      }
      else {
          captureCopy(view, text);
      }
      if (event.type == "cut") {
          view.dispatch(view.state.transaction.replaceSelection([""]).scrollIntoView().setMeta(MetaSlot.userEvent, "cut"));
      }
  };
  handlers.focus = function (view) {
      view.dom.classList.add("CodeMirror-focused");
  };
  handlers.blur = function (view) {
      view.dom.classList.remove("CodeMirror-focused");
  };
  handlers.beforeprint = function (view) {
      view.docView.checkLayout(true);
  };

  var LINE_SEP = "\ufdda"; // A Unicode 'non-character', used to denote newlines internally
  function applyDOMChange(view, start, end, typeOver) {
      var change, newSel;
      var sel = view.state.selection.primary, bounds;
      if (start > -1 && (bounds = view.docView.domBoundsAround(start, end, 0))) {
          var from = bounds.from, to = bounds.to;
          var selPoints = selectionPoints(view.contentDOM), reader = new DOMReader(selPoints);
          reader.readRange(bounds.startDOM, bounds.endDOM);
          newSel = selectionFromPoints(selPoints, from);
          var preferredPos = sel.from, preferredSide = null;
          // Prefer anchoring to end when Backspace is pressed
          if (view.inputState.lastKeyCode === 8 && view.inputState.lastKeyTime > Date.now() - 100) {
              preferredPos = sel.to;
              preferredSide = "end";
          }
          var diff = findDiff(view.state.doc.slice(from, to, LINE_SEP), reader.text, preferredPos - from, preferredSide);
          if (diff)
              change = new Change(from + diff.from, from + diff.toA, reader.text.slice(diff.from, diff.toB).split(LINE_SEP));
      }
      else if (view.hasFocus()) {
          var domSel = view.root.getSelection();
          var head = view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset);
          var anchor = selectionCollapsed(domSel) ? head :
              view.docView.posFromDOM(domSel.anchorNode, domSel.anchorOffset);
          if (head != sel.head || anchor != sel.anchor)
              newSel = EditorSelection.single(anchor, head);
      }
      if (!change && !newSel)
          return false;
      // Heuristic to notice typing over a selected character
      if (!change && typeOver && !sel.empty && newSel && newSel.primary.empty)
          change = new Change(sel.from, sel.to, view.state.doc.sliceLines(sel.from, sel.to));
      if (change) {
          var startState = view.state;
          // Android browsers don't fire reasonable key events for enter,
          // backspace, or delete. So this detects changes that look like
          // they're caused by those keys, and reinterprets them as key
          // events.
          if (browser.android &&
              ((change.from == sel.from && change.to == sel.to &&
                  change.length == 1 && change.text.length == 2 &&
                  dispatchKey(view, "Enter", 10)) ||
                  (change.from == sel.from - 1 && change.to == sel.to && change.length == 0 &&
                      dispatchKey(view, "Backspace", 8)) ||
                  (change.from == sel.from && change.to == sel.to + 1 && change.length == 0 &&
                      dispatchKey(view, "Delete", 46))))
              return view.state != startState;
          var tr = startState.transaction;
          if (change.from >= sel.from && change.to <= sel.to && change.to - change.from >= (sel.to - sel.from) / 3) {
              var before_1 = sel.from < change.from ? startState.doc.slice(sel.from, change.from, LINE_SEP) : "";
              var after_1 = sel.to > change.to ? startState.doc.slice(change.to, sel.to, LINE_SEP) : "";
              tr = tr.replaceSelection((before_1 + change.text.join(LINE_SEP) + after_1).split(LINE_SEP));
          }
          else {
              tr = tr.change(change);
              if (newSel && !tr.selection.primary.eq(newSel.primary))
                  tr = tr.setSelection(tr.selection.replaceRange(newSel.primary));
          }
          view.dispatch(tr.scrollIntoView());
          return true;
      }
      else if (newSel && !newSel.primary.eq(sel)) {
          var tr = view.state.transaction.setSelection(newSel);
          if (view.inputState.lastSelectionTime > Date.now() - 50) {
              if (view.inputState.lastSelectionOrigin == "keyboard")
                  tr = tr.scrollIntoView();
              else
                  tr = tr.setMeta(MetaSlot.userEvent, view.inputState.lastSelectionOrigin);
          }
          view.dispatch(tr);
          return true;
      }
      return false;
  }
  function findDiff(a, b, preferredPos, preferredSide) {
      var minLen = Math.min(a.length, b.length);
      var from = 0;
      while (from < minLen && a.charCodeAt(from) == b.charCodeAt(from))
          from++;
      if (from == minLen && a.length == b.length)
          return null;
      var toA = a.length, toB = b.length;
      while (toA > 0 && toB > 0 && a.charCodeAt(toA - 1) == b.charCodeAt(toB - 1)) {
          toA--;
          toB--;
      }
      if (preferredSide == "end") {
          var adjust = Math.max(0, from - Math.min(toA, toB));
          preferredPos -= toA + adjust - from;
      }
      if (toA < from && a.length < b.length) {
          var move = preferredPos <= from && preferredPos >= toA ? from - preferredPos : 0;
          from -= move;
          toB = from + (toB - toA);
          toA = from;
      }
      else if (toB < from) {
          var move = preferredPos <= from && preferredPos >= toB ? from - preferredPos : 0;
          from -= move;
          toA = from + (toA - toB);
          toB = from;
      }
      return { from: from, toA: toA, toB: toB };
  }
  var DOMReader = /** @class */ (function () {
      function DOMReader(points) {
          this.points = points;
          this.text = "";
      }
      DOMReader.prototype.readRange = function (start, end) {
          if (!start)
              return;
          var parent = start.parentNode;
          for (var cur = start;;) {
              this.findPointBefore(parent, cur);
              this.readNode(cur);
              var next = cur.nextSibling;
              if (next == end)
                  break;
              if (isBlockNode(cur) || (isBlockNode(next) && cur.nodeName != "BR"))
                  this.text += LINE_SEP;
              cur = next;
          }
          this.findPointBefore(parent, end);
      };
      DOMReader.prototype.readNode = function (node) {
          if (node.cmIgnore)
              return;
          var view = node.cmView;
          var fromView = view && view.overrideDOMText;
          var text;
          if (fromView != null)
              text = fromView.join(LINE_SEP);
          else if (node.nodeType == 3)
              text = node.nodeValue;
          else if (node.nodeName == "BR")
              text = node.nextSibling ? LINE_SEP : "";
          else if (node.nodeType == 1)
              this.readRange(node.firstChild, null);
          if (text != null) {
              this.findPointIn(node, text.length);
              this.text += text;
          }
      };
      DOMReader.prototype.findPointBefore = function (node, next) {
          for (var _i = 0, _a = this.points; _i < _a.length; _i++) {
              var point = _a[_i];
              if (point.node == node && node.childNodes[point.offset] == next)
                  point.pos = this.text.length;
          }
      };
      DOMReader.prototype.findPointIn = function (node, maxLen) {
          for (var _i = 0, _a = this.points; _i < _a.length; _i++) {
              var point = _a[_i];
              if (point.node == node)
                  point.pos = this.text.length + Math.min(point.offset, maxLen);
          }
      };
      return DOMReader;
  }());
  function isBlockNode(node) {
      return node.nodeType == 1 && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(node.nodeName);
  }
  var DOMPoint = /** @class */ (function () {
      function DOMPoint(node, offset) {
          this.node = node;
          this.offset = offset;
          this.pos = -1;
      }
      return DOMPoint;
  }());
  function selectionPoints(dom) {
      var result = [], root = getRoot(dom);
      if (root.activeElement != dom)
          return result;
      var _a = root.getSelection(), anchorNode = _a.anchorNode, anchorOffset = _a.anchorOffset, focusNode = _a.focusNode, focusOffset = _a.focusOffset;
      if (anchorNode) {
          result.push(new DOMPoint(anchorNode, anchorOffset));
          if (focusNode != anchorNode || focusOffset != anchorOffset)
              result.push(new DOMPoint(focusNode, focusOffset));
      }
      return result;
  }
  function selectionFromPoints(points, base) {
      if (points.length == 0)
          return null;
      var anchor = points[0].pos, head = points.length == 2 ? points[1].pos : anchor;
      return anchor > -1 && head > -1 ? EditorSelection.single(anchor + base, head + base) : null;
  }
  function dispatchKey(view, name, code) {
      var options = { key: name, code: name, keyCode: code, which: code, cancelable: true };
      var down = new KeyboardEvent("keydown", options);
      view.contentDOM.dispatchEvent(down);
      var up = new KeyboardEvent("keyup", options);
      view.contentDOM.dispatchEvent(up);
      return down.defaultPrevented || up.defaultPrevented;
  }

  var EditorView = /** @class */ (function () {
      function EditorView(state, dispatch) {
          var plugins = [];
          for (var _i = 2; _i < arguments.length; _i++) {
              plugins[_i - 2] = arguments[_i];
          }
          var _this = this;
          this.pluginViews = [];
          this.scheduledDecoUpdate = -1;
          this.updatingState = false;
          this.dispatch = dispatch || (function (tr) { return _this.updateState([tr], tr.apply()); });
          this.contentDOM = document.createElement("pre");
          this.contentDOM.className = "CodeMirror-content";
          this.contentDOM.style.cssText = contentCSS;
          this.contentDOM.setAttribute("contenteditable", "true");
          this.contentDOM.setAttribute("spellcheck", "false");
          this.contentDOM.setAttribute("autocomplete", "off");
          this.contentDOM.setAttribute("autocorrect", "off");
          this.contentDOM.setAttribute("autocapitalize", "off");
          this.dom = document.createElement("div");
          this.dom.style.cssText = editorCSS;
          this.dom.className = "CodeMirror";
          this.dom.appendChild(this.contentDOM);
          this.docView = new DocView(this.contentDOM, {
              onDOMChange: function (start, end, typeOver) { return applyDOMChange(_this, start, end, typeOver); },
              onUpdateState: function (prevState, transactions) {
                  for (var _i = 0, _a = _this.pluginViews; _i < _a.length; _i++) {
                      var pluginView = _a[_i];
                      if (pluginView.updateState)
                          pluginView.updateState(_this, prevState, transactions);
                  }
              },
              onUpdateDOM: function () {
                  for (var _i = 0, _a = _this.pluginViews; _i < _a.length; _i++) {
                      var plugin = _a[_i];
                      if (plugin.updateDOM)
                          plugin.updateDOM(_this);
                  }
              },
              onUpdateViewport: function () {
                  for (var _i = 0, _a = _this.pluginViews; _i < _a.length; _i++) {
                      var plugin = _a[_i];
                      if (plugin.updateViewport)
                          plugin.updateViewport(_this);
                  }
              },
              getDecorations: function () { return _this.pluginViews.map(function (v) { return v.decorations || Decoration.none; }); }
          });
          this.viewport = this.docView.publicViewport;
          this.setState.apply(this, [state].concat(plugins));
      }
      Object.defineProperty(EditorView.prototype, "state", {
          get: function () { return this._state; },
          enumerable: true,
          configurable: true
      });
      EditorView.prototype.setState = function (state) {
          var _this = this;
          var plugins = [];
          for (var _i = 1; _i < arguments.length; _i++) {
              plugins[_i - 1] = arguments[_i];
          }
          this._state = state;
          this.withUpdating(function () {
              setTabSize(_this.contentDOM, state.tabSize);
              _this.createPluginViews(plugins);
              _this.inputState = new InputState(_this);
              _this.docView.update(state);
          });
      };
      EditorView.prototype.updateState = function (transactions, state) {
          var _this = this;
          if (transactions.length && transactions[0].startState != this._state)
              throw new RangeError("Trying to update state with a transaction that doesn't start from the current state.");
          this.withUpdating(function () {
              var prevState = _this._state;
              _this._state = state;
              if (transactions.some(function (tr) { return tr.getMeta(MetaSlot.changeTabSize) != undefined; }))
                  setTabSize(_this.contentDOM, state.tabSize);
              if (state.doc != prevState.doc || transactions.some(function (tr) { return tr.selectionSet && !tr.getMeta(MetaSlot.preserveGoalColumn); }))
                  _this.inputState.goalColumns.length = 0;
              _this.docView.update(state, prevState, transactions, transactions.some(function (tr) { return tr.scrolledIntoView; }) ? state.selection.primary.head : -1);
              _this.inputState.update(transactions);
          });
      };
      /** @internal */
      EditorView.prototype.someProp = function (propName, f) {
          var value = undefined;
          for (var _i = 0, _a = this.pluginViews; _i < _a.length; _i++) {
              var pluginView = _a[_i];
              var prop = pluginView[propName];
              if (prop != null && (value = f(prop)) != null)
                  break;
          }
          return value;
      };
      /** @internal */
      EditorView.prototype.getProp = function (propName) {
          for (var _i = 0, _a = this.pluginViews; _i < _a.length; _i++) {
              var pluginView = _a[_i];
              var prop = pluginView[propName];
              if (prop != null)
                  return prop;
          }
          return undefined;
      };
      EditorView.prototype.withUpdating = function (f) {
          if (this.updatingState)
              throw new Error("Recursive calls of EditorView.updateState or EditorView.setState are not allowed");
          this.updatingState = true;
          try {
              f();
          }
          finally {
              this.updatingState = false;
          }
      };
      EditorView.prototype.createPluginViews = function (plugins) {
          this.destroyPluginViews();
          for (var _i = 0, plugins_1 = plugins; _i < plugins_1.length; _i++) {
              var plugin = plugins_1[_i];
              this.pluginViews.push(plugin);
          }
          for (var _a = 0, _b = this.state.plugins; _a < _b.length; _a++) {
              var plugin = _b[_a];
              if (plugin.view)
                  this.pluginViews.push(plugin.view(this));
          }
      };
      EditorView.prototype.destroyPluginViews = function () {
          for (var _i = 0, _a = this.pluginViews; _i < _a.length; _i++) {
              var pluginView = _a[_i];
              if (pluginView.destroy)
                  pluginView.destroy();
          }
          this.pluginViews.length = 0;
      };
      EditorView.prototype.domAtPos = function (pos) {
          return this.docView.domFromPos(pos);
      };
      EditorView.prototype.heightAtPos = function (pos, top) {
          this.docView.forceLayout();
          return this.docView.heightAt(pos, top ? -1 : 1);
      };
      EditorView.prototype.lineAtHeight = function (height) {
          this.docView.forceLayout();
          return this.docView.lineAtHeight(height);
      };
      Object.defineProperty(EditorView.prototype, "contentHeight", {
          get: function () {
              return this.docView.heightMap.height + this.docView.paddingTop + this.docView.paddingBottom;
          },
          enumerable: true,
          configurable: true
      });
      EditorView.prototype.movePos = function (start, direction, granularity, action) {
          if (granularity === void 0) { granularity = "character"; }
          if (action === void 0) { action = "move"; }
          return movePos(this, start, direction, granularity, action);
      };
      EditorView.prototype.posAtCoords = function (coords) {
          this.docView.forceLayout();
          return posAtCoords(this, coords);
      };
      EditorView.prototype.coordsAtPos = function (pos) { return this.docView.coordsAt(pos); };
      Object.defineProperty(EditorView.prototype, "defaultCharacterWidth", {
          get: function () { return this.docView.heightOracle.charWidth; },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(EditorView.prototype, "defaultLineHeight", {
          get: function () { return this.docView.heightOracle.lineHeight; },
          enumerable: true,
          configurable: true
      });
      // To be used by plugin views when they update their decorations asynchronously
      EditorView.prototype.decorationUpdate = function () {
          var _this = this;
          if (this.scheduledDecoUpdate < 0)
              this.scheduledDecoUpdate = requestAnimationFrame(function () {
                  _this.scheduledDecoUpdate = -1;
                  _this.docView.update(_this.state, _this.state);
              });
      };
      EditorView.prototype.startMouseSelection = function (event, update) {
          this.focus();
          this.inputState.startMouseSelection(this, event, update);
      };
      Object.defineProperty(EditorView.prototype, "root", {
          get: function () {
              return getRoot(this.dom);
          },
          enumerable: true,
          configurable: true
      });
      EditorView.prototype.hasFocus = function () {
          return getRoot(this.dom).activeElement == this.contentDOM;
      };
      EditorView.prototype.focus = function () {
          this.docView.focus();
      };
      EditorView.prototype.destroy = function () {
          this.destroyPluginViews();
          this.inputState.destroy();
          this.dom.remove();
          this.docView.destroy();
      };
      return EditorView;
  }());
  function setTabSize(elt, size) {
      elt.style.tabSize = elt.style.MozTabSize = size;
  }
  var editorCSS = "\nposition: relative;\ndisplay: flex;\nalign-items: flex-start;";
  var contentCSS = "\nmargin: 0;\nflex-grow: 2;\nmin-height: 100%;";

  var base = {
    8: "Backspace",
    9: "Tab",
    10: "Enter",
    12: "NumLock",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    44: "PrintScreen",
    45: "Insert",
    46: "Delete",
    59: ";",
    61: "=",
    91: "Meta",
    92: "Meta",
    106: "*",
    107: "+",
    108: ",",
    109: "-",
    110: ".",
    111: "/",
    144: "NumLock",
    145: "ScrollLock",
    160: "Shift",
    161: "Shift",
    162: "Control",
    163: "Control",
    164: "Alt",
    165: "Alt",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'",
    229: "q"
  };
  var base_1 = base;

  var shift = {
    48: ")",
    49: "!",
    50: "@",
    51: "#",
    52: "$",
    53: "%",
    54: "^",
    55: "&",
    56: "*",
    57: "(",
    59: ";",
    61: "+",
    173: "_",
    186: ":",
    187: "+",
    188: "<",
    189: "_",
    190: ">",
    191: "?",
    192: "~",
    219: "{",
    220: "|",
    221: "}",
    222: "\"",
    229: "Q"
  };

  var chrome$1 = typeof navigator != "undefined" && /Chrome\/(\d+)/.exec(navigator.userAgent);
  var safari = typeof navigator != "undefined" && /Apple Computer/.test(navigator.vendor);
  var gecko$1 = typeof navigator != "undefined" && /Gecko\/\d+/.test(navigator.userAgent);
  var mac = typeof navigator != "undefined" && /Mac/.test(navigator.platform);
  var brokenModifierNames = chrome$1 && (mac || +chrome$1[1] < 57) || gecko$1 && mac;

  // Fill in the digit keys
  for (var i = 0; i < 10; i++) base[48 + i] = base[96 + i] = String(i);

  // The function keys
  for (var i = 1; i <= 24; i++) base[i + 111] = "F" + i;

  // And the alphabetic keys
  for (var i = 65; i <= 90; i++) {
    base[i] = String.fromCharCode(i + 32);
    shift[i] = String.fromCharCode(i);
  }

  // For each code that doesn't have a shift-equivalent, copy the base name
  for (var code in base) if (!shift.hasOwnProperty(code)) shift[code] = base[code];

  var keyName = function(event) {
    // Don't trust event.key in Chrome when there are modifiers until
    // they fix https://bugs.chromium.org/p/chromium/issues/detail?id=633838
    var ignoreKey = brokenModifierNames && (event.ctrlKey || event.altKey || event.metaKey) ||
      safari && event.shiftKey && event.key && event.key.length == 1;
    var name = (!ignoreKey && event.key) ||
      (event.shiftKey ? shift : base)[event.keyCode] ||
      event.key || "Unidentified";
    // Edge sometimes produces wrong names (Issue #3)
    if (name == "Esc") name = "Escape";
    if (name == "Del") name = "Delete";
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8860571/
    if (name == "Left") name = "ArrowLeft";
    if (name == "Up") name = "ArrowUp";
    if (name == "Right") name = "ArrowRight";
    if (name == "Down") name = "ArrowDown";
    return name
  };

  var mac$1 = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false;
  function normalizeKeyName(name) {
      var parts = name.split(/-(?!$)/);
      var result = parts[parts.length - 1];
      if (result == "Space")
          result = " ";
      var alt, ctrl, shift, meta;
      for (var i = 0; i < parts.length - 1; ++i) {
          var mod = parts[i];
          if (/^(cmd|meta|m)$/i.test(mod))
              meta = true;
          else if (/^a(lt)?$/i.test(mod))
              alt = true;
          else if (/^(c|ctrl|control)$/i.test(mod))
              ctrl = true;
          else if (/^s(hift)?$/i.test(mod))
              shift = true;
          else if (/^mod$/i.test(mod)) {
              if (mac$1)
                  meta = true;
              else
                  ctrl = true;
          }
          else
              throw new Error("Unrecognized modifier name: " + mod);
      }
      if (alt)
          result = "Alt-" + result;
      if (ctrl)
          result = "Ctrl-" + result;
      if (meta)
          result = "Meta-" + result;
      if (shift)
          result = "Shift-" + result;
      return result;
  }
  function normalize(map) {
      var copy = Object.create(null);
      for (var prop in map)
          copy[normalizeKeyName(prop)] = map[prop];
      return copy;
  }
  function modifiers(name, event, shift) {
      if (event.altKey)
          name = "Alt-" + name;
      if (event.ctrlKey)
          name = "Ctrl-" + name;
      if (event.metaKey)
          name = "Meta-" + name;
      if (shift !== false && event.shiftKey)
          name = "Shift-" + name;
      return name;
  }
  // :: (Object) → Plugin
  // Create a keymap plugin for the given set of bindings.
  //
  // Bindings should map key names to [command](#commands)-style
  // functions, which will be called with `(EditorState, dispatch,
  // EditorView)` arguments, and should return true when they've handled
  // the key. Note that the view argument isn't part of the command
  // protocol, but can be used as an escape hatch if a binding needs to
  // directly interact with the UI.
  //
  // Key names may be strings like `"Shift-Ctrl-Enter"`—a key
  // identifier prefixed with zero or more modifiers. Key identifiers
  // are based on the strings that can appear in
  // [`KeyEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
  // Use lowercase letters to refer to letter keys (or uppercase letters
  // if you want shift to be held). You may use `"Space"` as an alias
  // for the `" "` name.
  //
  // Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or
  // `a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or
  // `Meta-`) are recognized. For characters that are created by holding
  // shift, the `Shift-` prefix is implied, and should not be added
  // explicitly.
  //
  // You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on
  // other platforms.
  //
  // You can add multiple keymap plugins to an editor. The order in
  // which they appear determines their precedence (the ones early in
  // the array get to dispatch first).
  function keymap(bindings) {
      var keydown = keydownHandler(bindings);
      return new Plugin({
          view: function () {
              return { handleDOMEvents: { keydown: keydown } };
          }
      });
  }
  // :: (Object) → (view: EditorView, event: dom.Event) → bool
  // Given a set of bindings (using the same format as
  // [`keymap`](#keymap.keymap), return a [keydown
  // handler](#view.EditorProps.handleKeyDown) handles them.
  function keydownHandler(bindings) {
      var map = normalize(bindings);
      return function (view, event) {
          var name = keyName(event), isChar = name.length == 1 && name != " ";
          var direct = map[modifiers(name, event, !isChar)];
          var baseName;
          if (direct && direct(view))
              return true;
          if (isChar && (event.shiftKey || event.altKey || event.metaKey) &&
              (baseName = base_1[event.keyCode]) && baseName != name) {
              var fromCode = map[modifiers(baseName, event, true)];
              if (fromCode && fromCode(view))
                  return true;
          }
          return false;
      };
  }

  var Item = /** @class */ (function () {
      function Item(map, inverted, selection) {
          if (inverted === void 0) { inverted = null; }
          if (selection === void 0) { selection = null; }
          this.map = map;
          this.inverted = inverted;
          this.selection = selection;
      }
      Object.defineProperty(Item.prototype, "isChange", {
          get: function () { return this.inverted != null; },
          enumerable: true,
          configurable: true
      });
      return Item;
  }());
  function updateBranch(branch, to, maxLen, newItem) {
      var start = to + 1 > maxLen + 20 ? to - maxLen - 1 : 0;
      var newBranch = branch.slice(start, to);
      newBranch.push(newItem);
      return newBranch;
  }
  function isAdjacent(prev, cur) {
      return !!prev && cur.from <= prev.mapPos(prev.to, 1) && cur.to >= prev.mapPos(prev.from);
  }
  function addChanges(branch, changes, inverted, selectionBefore, maxLen, mayMerge) {
      if (branch.length) {
          var lastItem = branch[branch.length - 1];
          if (lastItem.selection && lastItem.isChange == Boolean(inverted) && mayMerge(lastItem))
              return inverted ? updateBranch(branch, branch.length - 1, maxLen, new Item(lastItem.map.appendSet(changes.desc), inverted.appendSet(lastItem.inverted), lastItem.selection)) : branch;
      }
      return updateBranch(branch, branch.length, maxLen, new Item(changes.desc, inverted, selectionBefore));
  }
  function popChanges(branch, only) {
      var map = null;
      var idx = branch.length - 1;
      for (;; idx--) {
          if (idx < 0)
              throw new RangeError("popChanges called on empty branch");
          var entry = branch[idx];
          if (entry.isChange || (only == 1 /* Any */ && entry.selection))
              break;
          map = map ? entry.map.appendSet(map) : entry.map;
      }
      var changeItem = branch[idx];
      var newBranch = branch.slice(0, idx), changes = changeItem.inverted || ChangeSet.empty, selection = changeItem.selection;
      if (map) {
          var startIndex = changeItem.map.length;
          map = changeItem.map.appendSet(map);
          var mappedChanges = [];
          for (var i = 0; i < changes.length; i++) {
              var mapped = changes.changes[i].map(map.partialMapping(startIndex - i));
              if (mapped) {
                  map = map.append(mapped.desc);
                  mappedChanges.push(mapped);
              }
          }
          newBranch.push(new Item(map));
          changes = new ChangeSet(mappedChanges); // FIXME preserve mirror data?
          selection = selection.map(map);
      }
      return { changes: changes, branch: newBranch, selection: selection };
  }
  function nope() { return false; }
  function eqSelectionShape(a, b) {
      return a.ranges.length == b.ranges.length &&
          a.ranges.filter(function (r, i) { return r.empty != b.ranges[i].empty; }).length === 0;
  }
  var HistoryState = /** @class */ (function () {
      function HistoryState(done, undone, prevTime, prevUserEvent) {
          if (prevTime === void 0) { prevTime = null; }
          if (prevUserEvent === void 0) { prevUserEvent = undefined; }
          this.done = done;
          this.undone = undone;
          this.prevTime = prevTime;
          this.prevUserEvent = prevUserEvent;
      }
      HistoryState.prototype.resetTime = function () {
          return new HistoryState(this.done, this.undone);
      };
      HistoryState.prototype.addChanges = function (changes, inverted, selection, time, userEvent, newGroupDelay, maxLen) {
          var mayMerge = nope;
          if (this.prevTime !== null && time - this.prevTime < newGroupDelay &&
              (inverted || (this.prevUserEvent == userEvent && userEvent == "keyboard")))
              mayMerge = inverted
                  ? function (prev) { return isAdjacent(prev.map.changes[prev.map.length - 1], changes.changes[0]); }
                  : function (prev) { return eqSelectionShape(prev.selection, selection); };
          return new HistoryState(addChanges(this.done, changes, inverted, selection, maxLen, mayMerge), this.undone, time, userEvent);
      };
      HistoryState.prototype.addMapping = function (map, maxLen) {
          if (this.done.length == 0)
              return this;
          return new HistoryState(updateBranch(this.done, this.done.length, maxLen, new Item(map)), this.undone);
      };
      HistoryState.prototype.canPop = function (done, only) {
          var target = done == 0 /* Done */ ? this.done : this.undone;
          for (var _i = 0, target_1 = target; _i < target_1.length; _i++) {
              var _a = target_1[_i], isChange = _a.isChange, selection = _a.selection;
              if (isChange || (only == 1 /* Any */ && selection))
                  return true;
          }
          return false;
      };
      HistoryState.prototype.pop = function (done, only, transaction, maxLen) {
          var _a = popChanges(done == 0 /* Done */ ? this.done : this.undone, only), changes = _a.changes, branch = _a.branch, selection = _a.selection;
          var oldSelection = transaction.selection;
          for (var _i = 0, _b = changes.changes; _i < _b.length; _i++) {
              var change = _b[_i];
              transaction = transaction.change(change);
          }
          transaction = transaction.setSelection(selection);
          var otherBranch = (done == 0 /* Done */ ? this.undone : this.done);
          otherBranch = addChanges(otherBranch, transaction.changes, transaction.changes.length > 0 ? transaction.invertedChanges() : null, oldSelection, maxLen, nope);
          return { transaction: transaction, state: new HistoryState(done == 0 /* Done */ ? branch : otherBranch, done == 0 /* Done */ ? otherBranch : branch) };
      };
      HistoryState.prototype.eventCount = function (done, only) {
          var count = 0, branch = done == 0 /* Done */ ? this.done : this.undone;
          for (var _i = 0, branch_1 = branch; _i < branch_1.length; _i++) {
              var _a = branch_1[_i], isChange = _a.isChange, selection = _a.selection;
              if (isChange || (only == 1 /* Any */ && selection))
                  ++count;
          }
          return count;
      };
      HistoryState.empty = new HistoryState([], []);
      return HistoryState;
  }());

  var historyStateSlot = new MetaSlot("historyState");
  var closeHistorySlot = new MetaSlot("historyClose");
  var historyField = new StateField({
      init: function (editorState) {
          return HistoryState.empty;
      },
      apply: function (tr, state, editorState) {
          var fromMeta = tr.getMeta(historyStateSlot);
          if (fromMeta)
              return fromMeta;
          if (tr.getMeta(closeHistorySlot))
              state = state.resetTime();
          if (!tr.changes.length && !tr.selectionSet)
              return state;
          var _a = editorState.getPluginWithField(historyField).config, newGroupDelay = _a.newGroupDelay, minDepth = _a.minDepth;
          if (tr.getMeta(MetaSlot.addToHistory) !== false)
              return state.addChanges(tr.changes, tr.changes.length ? tr.invertedChanges() : null, tr.startState.selection, tr.getMeta(MetaSlot.time), tr.getMeta(MetaSlot.userEvent), newGroupDelay, minDepth);
          return state.addMapping(tr.changes.desc, minDepth);
      },
      debugName: "historyState"
  });
  function history(_a) {
      var _b = _a === void 0 ? {} : _a, _c = _b.minDepth, minDepth = _c === void 0 ? 100 : _c, _d = _b.newGroupDelay, newGroupDelay = _d === void 0 ? 500 : _d;
      return new Plugin({
          state: historyField,
          config: { minDepth: minDepth, newGroupDelay: newGroupDelay }
      });
  }
  function historyCmd(target, only, state, dispatch) {
      var historyState = state.getField(historyField);
      if (!historyState || !historyState.canPop(target, only))
          return false;
      var minDepth = state.getPluginWithField(historyField).config.minDepth;
      var _a = historyState.pop(target, only, state.transaction, minDepth), transaction = _a.transaction, newState = _a.state;
      dispatch(transaction.setMeta(historyStateSlot, newState));
      return true;
  }
  function undo(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      return historyCmd(0 /* Done */, 0 /* OnlyChanges */, state, dispatch);
  }
  function redo(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      return historyCmd(1 /* Undone */, 0 /* OnlyChanges */, state, dispatch);
  }
  function undoSelection(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      return historyCmd(0 /* Done */, 1 /* Any */, state, dispatch);
  }
  function redoSelection(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      return historyCmd(1 /* Undone */, 1 /* Any */, state, dispatch);
  }

  function gutter(config) {
      if (config === void 0) { config = {}; }
      return new Plugin({
          view: function (view) { return new GutterView(view, config); }
      });
  }
  var GutterView = /** @class */ (function () {
      function GutterView(view, config) {
          this.spaceAbove = 0;
          this.lines = [];
          this.dom = document.createElement("div");
          this.dom.className = "CodeMirror-gutter";
          this.dom.setAttribute("aria-hidden", "true");
          this.dom.style.cssText = "left: 0; box-sizing: border-box; height: 100%; overflow: hidden; flex-shrink: 0;";
          if (config.fixed !== false) {
              // FIXME IE11 fallback, which doesn't support position: sticky,
              // by using position: relative + event handlers that realign the
              // gutter (or just force fixed=false on IE11?)
              this.dom.style.position = "sticky";
          }
          view.dom.insertBefore(this.dom, view.contentDOM);
          this.formatNumber = config.formatNumber || String;
          this.lastLine = new GutterLine(1, 0, 0, 0, this.formatNumber);
          this.lastLine.dom.style.cssText += "visibility: hidden; pointer-events: none";
          this.dom.appendChild(this.lastLine.dom);
          this.updateDOM(view);
      }
      GutterView.prototype.updateDOM = function (view) {
          // Create the first number consisting of all 9s that is at least
          // as big as the line count, and put that in this.lastLine to make
          // sure the gutter width is stable
          var last = 9;
          while (last < view.state.doc.lines)
              last = last * 10 + 9;
          this.lastLine.update(last, 0, 0, 0, this.formatNumber);
          // FIXME would be nice to be able to recognize updates that didn't redraw
          this.updateGutter(view);
      };
      GutterView.prototype.updateGutter = function (view) {
          var _this = this;
          var spaceAbove = view.heightAtPos(view.viewport.from, true);
          if (spaceAbove != this.spaceAbove) {
              this.spaceAbove = spaceAbove;
              this.dom.style.paddingTop = spaceAbove + "px";
          }
          var i = 0, lineNo = -1;
          view.viewport.forEachLine(function (line) {
              var above = line.textTop, below = line.height - line.textBottom, height = line.height - above - below;
              if (lineNo < 0)
                  lineNo = view.state.doc.lineAt(line.start).number;
              if (i == _this.lines.length) {
                  var newLine = new GutterLine(lineNo, height, above, below, _this.formatNumber);
                  _this.lines.push(newLine);
                  _this.dom.appendChild(newLine.dom);
              }
              else {
                  _this.lines[i].update(lineNo, height, above, below, _this.formatNumber);
              }
              lineNo = line.hasCollapsedRanges ? -1 : lineNo + 1;
              i++;
          });
          while (this.lines.length > i)
              this.dom.removeChild(this.lines.pop().dom);
          this.dom.style.minHeight = view.contentHeight + "px";
      };
      GutterView.prototype.destroy = function () {
          this.dom.remove();
      };
      return GutterView;
  }());
  var GutterLine = /** @class */ (function () {
      function GutterLine(lineNo, height, above, below, formatNo) {
          this.lineNo = -1;
          this.height = -1;
          this.above = -1;
          this.below = -1;
          this.dom = document.createElement("div");
          this.dom.className = "CodeMirror-gutter-element";
          this.update(lineNo, height, above, below, formatNo);
      }
      GutterLine.prototype.update = function (lineNo, height, above, below, formatNo) {
          if (this.lineNo != lineNo)
              this.dom.textContent = formatNo(this.lineNo = lineNo);
          if (this.height != height)
              this.dom.style.height = (this.height = height) + "px";
          if (this.above != above)
              this.dom.style.marginTop = (this.above = above) + "px";
          if (this.below != below)
              this.dom.style.marginBottom = (this.below = below) + "px";
      };
      return GutterLine;
  }());

  function moveSelection(view, dir, granularity) {
      var transaction = view.state.transaction.mapRanges(function (range) {
          if (!range.empty && granularity != "lineboundary")
              return new SelectionRange(dir == "left" || dir == "backward" ? range.from : range.to);
          return new SelectionRange(view.movePos(range.head, dir, granularity, "move"));
      });
      if (transaction.selection.eq(view.state.selection))
          return false;
      if (granularity == "line")
          transaction = transaction.setMeta(MetaSlot.preserveGoalColumn, true);
      view.dispatch(transaction.scrollIntoView());
      return true;
  }
  var moveCharLeft = function (view) { return moveSelection(view, "left", "character"); };
  var moveCharRight = function (view) { return moveSelection(view, "right", "character"); };
  var moveWordLeft = function (view) { return moveSelection(view, "left", "word"); };
  var moveWordRight = function (view) { return moveSelection(view, "right", "word"); };
  var moveLineUp = function (view) { return moveSelection(view, "backward", "line"); };
  var moveLineDown = function (view) { return moveSelection(view, "forward", "line"); };
  var moveLineStart = function (view) { return moveSelection(view, "backward", "lineboundary"); };
  var moveLineEnd = function (view) { return moveSelection(view, "forward", "lineboundary"); };
  function extendSelection(view, dir, granularity) {
      var transaction = view.state.transaction.mapRanges(function (range) {
          return new SelectionRange(range.anchor, view.movePos(range.head, dir, granularity, "extend"));
      });
      if (transaction.selection.eq(view.state.selection))
          return false;
      if (granularity == "line")
          transaction = transaction.setMeta(MetaSlot.preserveGoalColumn, true);
      view.dispatch(transaction.scrollIntoView());
      return true;
  }
  var extendCharLeft = function (view) { return extendSelection(view, "left", "character"); };
  var extendCharRight = function (view) { return extendSelection(view, "right", "character"); };
  var extendWordLeft = function (view) { return extendSelection(view, "left", "word"); };
  var extendWordRight = function (view) { return extendSelection(view, "right", "word"); };
  var extendLineUp = function (view) { return extendSelection(view, "backward", "line"); };
  var extendLineDown = function (view) { return extendSelection(view, "forward", "line"); };
  var extendLineStart = function (view) { return extendSelection(view, "backward", "lineboundary"); };
  var extendLineEnd = function (view) { return extendSelection(view, "forward", "lineboundary"); };
  var selectDocStart = function (_a) {
      var state = _a.state, dispatch = _a.dispatch;
      dispatch(state.transaction.setSelection(EditorSelection.single(0)).scrollIntoView());
      return true;
  };
  var selectDocEnd = function (_a) {
      var state = _a.state, dispatch = _a.dispatch;
      dispatch(state.transaction.setSelection(EditorSelection.single(state.doc.length)).scrollIntoView());
      return true;
  };
  var selectAll = function (_a) {
      var state = _a.state, dispatch = _a.dispatch;
      dispatch(state.transaction.setSelection(EditorSelection.single(0, state.doc.length)));
      return true;
  };
  function deleteText(view, dir) {
      var transaction = view.state.transaction.reduceRanges(function (transaction, range) {
          var from = range.from, to = range.to;
          if (from == to) {
              var target = view.movePos(range.head, dir, "character", "move");
              from = Math.min(from, target);
              to = Math.max(to, target);
          }
          if (from == to)
              return { transaction: transaction, range: range };
          return { transaction: transaction.replace(from, to, ""),
              range: new SelectionRange(from) };
      });
      if (!transaction.docChanged)
          return false;
      view.dispatch(transaction.scrollIntoView());
      return true;
  }
  var deleteCharBackward = function (view) { return deleteText(view, "backward"); };
  var deleteCharForward = function (view) { return deleteText(view, "forward"); };
  var pcBaseKeymap = {
      "ArrowLeft": moveCharLeft,
      "ArrowRight": moveCharRight,
      "Shift-ArrowLeft": extendCharLeft,
      "Shift-ArrowRight": extendCharRight,
      "Mod-ArrowLeft": moveWordLeft,
      "Mod-ArrowRight": moveWordRight,
      "Shift-Mod-ArrowLeft": extendWordLeft,
      "Shift-Mod-ArrowRight": extendWordRight,
      "ArrowUp": moveLineUp,
      "ArrowDown": moveLineDown,
      "Shift-ArrowUp": extendLineUp,
      "Shift-ArrowDown": extendLineDown,
      "Home": moveLineStart,
      "End": moveLineEnd,
      "Shift-Home": extendLineStart,
      "Shift-End": extendLineEnd,
      "Mod-Home": selectDocStart,
      "Mod-End": selectDocEnd,
      "Mod-a": selectAll,
      "Backspace": deleteCharBackward,
      "Delete": deleteCharForward
  };
  var macBaseKeymap = {
      "Control-b": moveCharLeft,
      "Control-f": moveCharRight,
      "Shift-Control-b": extendCharLeft,
      "Shift-Control-f": extendCharRight,
      "Control-p": moveLineUp,
      "Control-n": moveLineDown,
      "Shift-Control-p": extendLineUp,
      "Shift-Control-n": extendLineDown,
      "Control-a": moveLineStart,
      "Control-e": moveLineEnd,
      "Shift-Control-a": extendLineStart,
      "Shift-Control-e": extendLineEnd,
      "Cmd-ArrowUp": selectDocStart,
      "Cmd-ArrowDown": selectDocEnd,
      "Control-d": deleteCharForward,
      "Control-h": deleteCharBackward
  };
  for (var key in pcBaseKeymap)
      macBaseKeymap[key] = pcBaseKeymap[key];
  var mac$2 = typeof navigator != "undefined" ? /Mac/.test(navigator.platform)
      : typeof os != "undefined" ? os.platform() == "darwin" : false;
  var baseKeymap = mac$2 ? macBaseKeymap : pcBaseKeymap;

  // Counts the column offset in a string, taking tabs into account.
  // Used mostly to find indentation.
  function countColumn$1(string, end, tabSize, startIndex, startValue) {
      if (end == null) {
          end = string.search(/[^\s\u00a0]/);
          if (end == -1)
              end = string.length;
      }
      for (var i = startIndex || 0, n = startValue || 0;;) {
          var nextTab = string.indexOf("\t", i);
          if (nextTab < 0 || nextTab >= end)
              return n + (end - i);
          n += nextTab - i;
          n += tabSize - (n % tabSize);
          i = nextTab + 1;
      }
  }

  // STRING STREAM
  // Fed to the mode parsers, provides helper functions to make
  // parsers more succinct.
  var StringStream = /** @class */ (function () {
      function StringStream(string, tabSize, lineOracle) {
          this.string = string;
          this.tabSize = tabSize;
          this.lineOracle = lineOracle;
          this.pos = this.start = 0;
          this.string = string;
          this.tabSize = tabSize || 8;
          this.lastColumnPos = this.lastColumnValue = 0;
          this.lineStart = 0;
          this.lineOracle = lineOracle;
      }
      StringStream.prototype.eol = function () { return this.pos >= this.string.length; };
      StringStream.prototype.sol = function () { return this.pos == this.lineStart; };
      StringStream.prototype.peek = function () { return this.string.charAt(this.pos) || undefined; };
      StringStream.prototype.next = function () {
          if (this.pos < this.string.length)
              return this.string.charAt(this.pos++);
      };
      StringStream.prototype.eat = function (match) {
          var ch = this.string.charAt(this.pos);
          var ok;
          if (typeof match == "string")
              ok = ch == match;
          else
              ok = ch && (match instanceof RegExp ? match.test(ch) : match(ch));
          if (ok) {
              ++this.pos;
              return ch;
          }
      };
      StringStream.prototype.eatWhile = function (match) {
          var start = this.pos;
          while (this.eat(match)) { }
          return this.pos > start;
      };
      StringStream.prototype.eatSpace = function () {
          var start = this.pos;
          while (/[\s\u00a0]/.test(this.string.charAt(this.pos)))
              ++this.pos;
          return this.pos > start;
      };
      StringStream.prototype.skipToEnd = function () { this.pos = this.string.length; };
      StringStream.prototype.skipTo = function (ch) {
          var found = this.string.indexOf(ch, this.pos);
          if (found > -1) {
              this.pos = found;
              return true;
          }
      };
      StringStream.prototype.backUp = function (n) { this.pos -= n; };
      StringStream.prototype.column = function () {
          if (this.lastColumnPos < this.start) {
              this.lastColumnValue = countColumn$1(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
              this.lastColumnPos = this.start;
          }
          return this.lastColumnValue - (this.lineStart ? countColumn$1(this.string, this.lineStart, this.tabSize) : 0);
      };
      StringStream.prototype.indentation = function () {
          return countColumn$1(this.string, null, this.tabSize) -
              (this.lineStart ? countColumn$1(this.string, this.lineStart, this.tabSize) : 0);
      };
      StringStream.prototype.match = function (pattern, consume, caseInsensitive) {
          if (typeof pattern == "string") {
              var cased = function (str) { return caseInsensitive ? str.toLowerCase() : str; };
              var substr = this.string.substr(this.pos, pattern.length);
              if (cased(substr) == cased(pattern)) {
                  if (consume !== false)
                      this.pos += pattern.length;
                  return true;
              }
              else
                  return null;
          }
          else {
              var match = this.string.slice(this.pos).match(pattern);
              if (match && match.index > 0)
                  return null;
              if (match && consume !== false)
                  this.pos += match[0].length;
              return match;
          }
      };
      StringStream.prototype.current = function () { return this.string.slice(this.start, this.pos); };
      StringStream.prototype.hideFirstChars = function (n, inner) {
          this.lineStart += n;
          try {
              return inner();
          }
          finally {
              this.lineStart -= n;
          }
      };
      StringStream.prototype.lookAhead = function (n) {
          var oracle = this.lineOracle;
          return oracle && oracle.lookAhead(n);
      };
      StringStream.prototype.baseToken = function () {
          var oracle = this.lineOracle;
          return oracle && oracle.baseToken(this.pos);
      };
      return StringStream;
  }());

  var StringStreamCursor = /** @class */ (function () {
      function StringStreamCursor(text, offset, tabSize) {
          if (tabSize === void 0) { tabSize = 4; }
          this.offset = offset;
          this.tabSize = tabSize;
          this.iter = text.iterLines(offset);
          this.curLineEnd = this.offset - 1;
      }
      StringStreamCursor.prototype.next = function () {
          var _a = this.iter.next(), value = _a.value, done = _a.done;
          if (done)
              throw new RangeError("Reached end of document");
          var res = new StringStream(value, this.tabSize, null);
          this.offset = this.curLineEnd + 1;
          this.curLineEnd += value.length + 1;
          return res;
      };
      return StringStreamCursor;
  }());

  function readToken(mode, stream, state) {
      for (var i = 0; i < 10; i++) {
          //if (inner) inner[0] = innerMode(mode, state).mode
          var style = mode.token(stream, state);
          if (stream.pos > stream.start)
              return style;
      }
      throw new Error("Mode " + mode.name + " failed to advance stream.");
  }
  function copyState(mode, state) {
      if (state === true)
          return state;
      if (mode.copyState)
          return mode.copyState(state);
      var nstate = {};
      for (var n in state) {
          var val = state[n];
          if (val instanceof Array)
              val = val.concat([]);
          nstate[n] = val;
      }
      return nstate;
  }

  var CachedState = /** @class */ (function () {
      function CachedState(state, pos) {
          this.state = state;
          this.pos = pos;
      }
      CachedState.prototype.copy = function (mode) { return new CachedState(copyState(mode, this.state), this.pos); };
      return CachedState;
  }());
  var MAX_SCAN_DIST = 20000;
  function cutDecoratedRange(range, at) {
      if (!range || at <= range.from)
          return null;
      return { from: range.from, to: Math.min(at, range.to), decorations: range.decorations.filter(function (_a) {
              var to = _a.to;
              return to <= at;
          }) };
  }
  var StateCache = /** @class */ (function () {
      function StateCache(states, frontier, lastDecorations) {
          this.states = states;
          this.frontier = frontier;
          this.lastDecorations = lastDecorations;
      }
      StateCache.prototype.advanceFrontier = function (editorState, to, mode, sleepTime, maxWorkTime) {
          var _this = this;
          if (this.frontier >= to)
              return Promise.reject();
          clearTimeout(this.timeout);
          return new Promise(function (resolve) {
              var f = function () {
                  var endTime = +new Date + maxWorkTime;
                  do {
                      var target = Math.min(to, _this.frontier + MAX_SCAN_DIST / 2);
                      _this.getState(editorState, target, mode);
                      if (_this.frontier >= to)
                          return resolve();
                  } while (+new Date < endTime);
                  _this.timeout = setTimeout(f, sleepTime);
              };
              _this.timeout = setTimeout(f, sleepTime);
          });
      };
      StateCache.prototype.calculateDecorations = function (editorState, from, to, mode) {
          var state = this.getState(editorState, from, mode);
          var cursor = new StringStreamCursor(editorState.doc, from, editorState.tabSize);
          var states = [], decorations = [], stream = cursor.next();
          for (var i = 0; cursor.offset + stream.start < to;) {
              if (stream.eol()) {
                  stream = cursor.next();
                  if (++i % 5 == 0)
                      states.push(new CachedState(copyState(mode, state), cursor.offset));
              }
              else {
                  var style = readToken(mode, stream, state);
                  if (style)
                      decorations.push(Decoration.range(cursor.offset + stream.start, cursor.offset + stream.pos, { class: 'cm-' + style.replace(/ /g, ' cm-') }));
                  stream.start = stream.pos;
              }
          }
          this.storeStates(from, to, states);
          return decorations;
      };
      StateCache.prototype.getDecorations = function (editorState, from, to, mode) {
          var upto = from, decorations = [];
          if (this.lastDecorations) {
              if (from < this.lastDecorations.from) {
                  upto = Math.min(to, this.lastDecorations.from);
                  decorations = this.calculateDecorations(editorState, from, upto, mode);
              }
              if (upto < to && this.lastDecorations.to > upto) {
                  upto = this.lastDecorations.to;
                  decorations = decorations.concat(this.lastDecorations.decorations);
              }
          }
          if (upto < to) {
              decorations = decorations.concat(this.calculateDecorations(editorState, upto, to, mode));
          }
          this.lastDecorations = { from: from, to: to, decorations: decorations };
          return decorations;
      };
      StateCache.prototype.storeStates = function (from, to, states) {
          var _a;
          var start = this.findIndex(from), end = this.findIndex(to);
          (_a = this.states).splice.apply(_a, [start, end - start].concat(states));
          if (from <= this.frontier)
              this.frontier = Math.max(this.frontier, to);
      };
      // Return the first index for which all cached states after it have
      // a position >= pos
      StateCache.prototype.findIndex = function (pos) {
          // FIXME could be binary search
          var i = 0;
          while (i < this.states.length && this.states[i].pos < pos)
              i++;
          return i;
      };
      StateCache.prototype.stateBefore = function (pos, mode) {
          if (pos > this.frontier && pos - this.frontier < MAX_SCAN_DIST)
              pos = this.frontier;
          var index = this.findIndex(pos);
          if (index < this.states.length && this.states[index].pos == pos)
              index++;
          return index == 0 ? new CachedState(mode.startState(), 0) : this.states[index - 1].copy(mode);
      };
      StateCache.prototype.getState = function (editorState, pos, mode) {
          var _a = this.stateBefore(pos, mode), statePos = _a.pos, state = _a.state;
          if (statePos < pos - MAX_SCAN_DIST) {
              statePos = pos;
              state = mode.startState();
          }
          else if (this.lastDecorations && (statePos < this.lastDecorations.from && this.lastDecorations.from <= pos))
              // If we are calculating a correct state for a position that is after the
              // beginning of the cached decorations (which suggests that the cached
              // decorations were rendered based on an approximate state), clear that cache
              this.lastDecorations = null;
          if (statePos < pos) {
              var cursor = new StringStreamCursor(editorState.doc, statePos, editorState.tabSize);
              var stream = cursor.next();
              var start = statePos, i = 0, states = [];
              while (statePos < pos) {
                  if (stream.eol()) {
                      stream = cursor.next();
                      statePos++;
                      if (++i % 50)
                          states.push(new CachedState(copyState(mode, state), statePos));
                  }
                  else {
                      readToken(mode, stream, state);
                      statePos += stream.pos - stream.start;
                      stream.start = stream.pos;
                  }
              }
              this.storeStates(start, pos, states);
          }
          return state;
      };
      StateCache.prototype.apply = function (transaction) {
          if (transaction.changes.length == 0)
              return this;
          var start = transaction.doc.lineAt(transaction.changes.changes.reduce(function (m, ch) { return Math.min(m, ch.from); }, 1e9)).start;
          var states = [];
          for (var _i = 0, _a = this.states; _i < _a.length; _i++) {
              var cached = _a[_i];
              var mapped = transaction.changes.mapPos(cached.pos, -1, true);
              if (mapped > 0)
                  states.push(mapped == cached.pos ? cached : new CachedState(cached.state, mapped));
          }
          return new StateCache(states, Math.min(start, this.frontier), cutDecoratedRange(this.lastDecorations, start));
      };
      return StateCache;
  }());
  function legacyMode(mode, config) {
      if (config === void 0) { config = {}; }
      var _a = config.sleepTime, sleepTime = _a === void 0 ? 100 : _a, _b = config.maxWorkTime, maxWorkTime = _b === void 0 ? 100 : _b;
      var field = new StateField({
          init: function (state) { return new StateCache([], 0, null); },
          apply: function (tr, cache) { return cache.apply(tr); },
          debugName: "mode"
      });
      var plugin = new Plugin({
          state: field,
          view: function (v) {
              var decorations = Decoration.none, from = -1, to = -1;
              function update(v, force) {
                  var vp = v.viewport;
                  if (force || vp.from < from || vp.to > to) {
                      (from = vp.from, to = vp.to);
                      var stateCache = v.state.getField(field);
                      decorations = Decoration.set(stateCache.getDecorations(v.state, from, to, mode));
                      stateCache.advanceFrontier(v.state, from, mode, sleepTime, maxWorkTime).then(function () {
                          update(v, true);
                          v.decorationUpdate();
                      }, function () { });
                  }
              }
              return {
                  get decorations() { return decorations; },
                  updateViewport: update,
                  updateState: function (v, p, trs) { return update(v, trs.some(function (tr) { return tr.docChanged; })); }
              };
          }
      });
      plugin.indentation = function (state, pos) {
          if (!mode.indent)
              return -1;
          var modeState = state.getField(field).getState(state, pos, mode);
          var line = state.doc.lineAt(pos);
          return mode.indent(modeState, line.slice(0, Math.min(line.length, 100)).match(/^\s*(.*)/)[1]);
      };
      return plugin;
  }

  var matching = { "(": ")>", ")": "(<", "[": "]>", "]": "[<", "{": "}>", "}": "{<" };
  function getStyle(decorations, at) {
      if (!decorations)
          return;
      var iter = decorations.iter();
      var decoration;
      while (decoration = iter.next())
          if (decoration.from <= at && at < decoration.to)
              return decoration.value.spec.class;
  }
  function findMatchingBracket(doc, decorations, where, config) {
      if (config === void 0) { config = {}; }
      var pos = where - 1;
      // A cursor is defined as between two characters, but in in vim command mode
      // (i.e. not insert mode), the cursor is visually represented as a
      // highlighted box on top of the 2nd character. Otherwise, we allow matches
      // from before or after the cursor.
      var match = (!config.afterCursor && pos >= 0 && matching[doc.slice(pos, pos + 1)]) ||
          matching[doc.slice(++pos, pos + 1)];
      if (!match)
          return null;
      var dir = match[1] == ">" ? 1 : -1;
      if (config.strict && (dir > 0) != (pos == where))
          return null;
      var style = getStyle(decorations, pos);
      var found = scanForBracket(doc, decorations, pos + (dir > 0 ? 1 : 0), dir, style || null, config);
      if (found == null)
          return null;
      return { from: pos, to: found ? found.pos : null,
          match: found && found.ch == match.charAt(0), forward: dir > 0 };
  }
  // bracketRegex is used to specify which type of bracket to scan
  // should be a regexp, e.g. /[[\]]/
  //
  // Note: If "where" is on an open bracket, then this bracket is ignored.
  //
  // Returns false when no bracket was found, null when it reached
  // maxScanDistance and gave up
  function scanForBracket(doc, decorations, where, dir, style, config) {
      var maxScanDistance = config.maxScanDistance || 10000;
      var re = config.bracketRegex || /[(){}[\]]/;
      var stack = [];
      var iter = doc.iterRange(where, dir > 0 ? doc.length : 0);
      for (var distance = 0; !iter.done && distance <= maxScanDistance;) {
          iter.next();
          var text = iter.value;
          if (dir < 0)
              distance += text.length;
          var basePos = where + distance * dir;
          for (var pos = dir > 0 ? 0 : text.length - 1, end = dir > 0 ? text.length : -1; pos != end; pos += dir) {
              var ch = text.charAt(pos);
              if (re.test(ch) && (style === undefined || getStyle(decorations, basePos + pos) == style)) {
                  var match = matching[ch];
                  if ((match.charAt(1) == ">") == (dir > 0))
                      stack.push(ch);
                  else if (!stack.length)
                      return { pos: basePos + pos, ch: ch };
                  else
                      stack.pop();
              }
          }
          if (dir > 0)
              distance += text.length;
      }
      return iter.done ? false : null;
  }
  function doMatchBrackets(state, referenceDecorations, config) {
      var decorations = [];
      for (var _i = 0, _a = state.selection.ranges; _i < _a.length; _i++) {
          var range = _a[_i];
          if (!range.empty)
              continue;
          var match = findMatchingBracket(state.doc, referenceDecorations, range.head, config);
          if (!match)
              continue;
          var style = match.match ? "CodeMirror-matchingbracket" : "CodeMirror-nonmatchingbracket";
          decorations.push(Decoration.range(match.from, match.from + 1, { class: style }));
          if (match.to)
              decorations.push(Decoration.range(match.to, match.to + 1, { class: style }));
      }
      return Decoration.set(decorations);
  }
  function matchBrackets(config) {
      if (config === void 0) { config = {}; }
      return new Plugin({
          view: function (v) {
              var idx = config.decorationsPlugin && v.state.plugins.filter(function (p) { return p.view; }).indexOf(config.decorationsPlugin);
              var decorations = Decoration.none;
              return {
                  get decorations() { return decorations; },
                  updateState: function (v) {
                      var refDecos = idx == undefined ? undefined : v.pluginViews[idx].decorations;
                      decorations = doMatchBrackets(v.state, refDecos, config);
                  }
              };
          }
      });
  }

  /* eslint-disable no-use-before-define */

  	function eatMnemonic( stream, style, mnemonicStyle ) {
  		var ok;
  		if ( stream.eat( '#' ) ) {
  			if ( stream.eat( 'x' ) ) {
  				ok = stream.eatWhile( /[a-fA-F\d]/ ) && stream.eat( ';' );
  			} else {
  				ok = stream.eatWhile( /[\d]/ ) && stream.eat( ';' );
  			}
  		} else {
  			ok = stream.eatWhile( /[\w.\-:]/ ) && stream.eat( ';' );
  		}
  		if ( ok ) {
  			mnemonicStyle += ' mw-mnemonic';
  			return mnemonicStyle;
  		}
  		return style;
  	}

    function mediawiki(config, parserConfig) {
  		
  		var mwConfig = {
  			"pluginModules": [],
  			"tagModes": {
  			  "ref": "text/mediawiki",
  			  "pre": "mw-tag-pre",
  			  "nowiki": "mw-tag-nowiki"
  			},
  			"tags": {
  			  "pre": true,
  			  "nowiki": true,
  			  "gallery": true,
  			  "indicator": true,
  			  "timeline": true,
  			  "hiero": true,
  			  "charinsert": true,
  			  "ref": true,
  			  "references": true,
  			  "inputbox": true,
  			  "imagemap": true,
  			  "source": true,
  			  "syntaxhighlight": true,
  			  "poem": true,
  			  "categorytree": true,
  			  "section": true,
  			  "score": true,
  			  "templatestyles": true,
  			  "templatedata": true,
  			  "math": true,
  			  "ce": true,
  			  "chem": true,
  			  "graph": true,
  			  "maplink": true,
  			  "mapframe": true
  			},
  			"doubleUnderscore": [
  			  {
  				"__notoc__": "notoc",
  				"__nogallery__": "nogallery",
  				"__forcetoc__": "forcetoc",
  				"__toc__": "toc",
  				"__noeditsection__": "noeditsection",
  				"__notitleconvert__": "notitleconvert",
  				"__notc__": "notitleconvert",
  				"__nocontentconvert__": "nocontentconvert",
  				"__nocc__": "nocontentconvert"
  			  },
  			  {
  				"__NEWSECTIONLINK__": "newsectionlink",
  				"__NONEWSECTIONLINK__": "nonewsectionlink",
  				"__HIDDENCAT__": "hiddencat",
  				"__INDEX__": "index",
  				"__NOINDEX__": "noindex",
  				"__STATICREDIRECT__": "staticredirect",
  				"__NOGLOBAL__": "noglobal",
  				"__DISAMBIG__": "disambiguation"
  			  }
  			],
  			"functionSynonyms": [
  			  {
  				"ns": "ns",
  				"nse": "nse",
  				"urlencode": "urlencode",
  				"lcfirst": "lcfirst",
  				"ucfirst": "ucfirst",
  				"lc": "lc",
  				"uc": "uc",
  				"localurl": "localurl",
  				"localurle": "localurle",
  				"fullurl": "fullurl",
  				"fullurle": "fullurle",
  				"canonicalurl": "canonicalurl",
  				"canonicalurle": "canonicalurle",
  				"formatnum": "formatnum",
  				"grammar": "grammar",
  				"gender": "gender",
  				"plural": "plural",
  				"bidi": "bidi",
  				"#language": "language",
  				"padleft": "padleft",
  				"padright": "padright",
  				"anchorencode": "anchorencode",
  				"filepath": "filepath",
  				"pageid": "pageid",
  				"int": "int",
  				"#special": "special",
  				"#speciale": "speciale",
  				"#tag": "tag",
  				"#formatdate": "formatdate",
  				"#dateformat": "formatdate",
  				"noexternallanglinks": "noexternallanglinks",
  				"#property": "property",
  				"#statements": "statements",
  				"#if": "if",
  				"#ifeq": "ifeq",
  				"#switch": "switch",
  				"#ifexist": "ifexist",
  				"#ifexpr": "ifexpr",
  				"#iferror": "iferror",
  				"#time": "time",
  				"#timel": "timel",
  				"#expr": "expr",
  				"#rel2abs": "rel2abs",
  				"#titleparts": "titleparts",
  				"#categorytree": "categorytree",
  				"#lst": "lst",
  				"#section": "lst",
  				"#lstx": "lstx",
  				"#section-x": "lstx",
  				"#lsth": "lsth",
  				"#section-h": "lsth",
  				"#target": "target",
  				"#babel": "babel",
  				"#coordinates": "coordinates",
  				"#invoke": "invoke",
  				"#related": "related",
  				"#assessment": "assessment",
  				"#pagesusingpendingchanges": "pagesusingpendingchanges",
  				"pendingchangelevel": "pendingchangelevel",
  				"articlepath": "articlepath",
  				"server": "server",
  				"servername": "servername",
  				"scriptpath": "scriptpath",
  				"stylepath": "stylepath",
  				"wbreponame": "wbreponame",
  				"numberofwikis": "numberofwikis"
  			  },
  			  {
  				"NUMBEROFPAGES": "numberofpages",
  				"NUMBEROFUSERS": "numberofusers",
  				"NUMBEROFACTIVEUSERS": "numberofactiveusers",
  				"NUMBEROFARTICLES": "numberofarticles",
  				"NUMBEROFFILES": "numberoffiles",
  				"NUMBEROFADMINS": "numberofadmins",
  				"NUMBERINGROUP": "numberingroup",
  				"NUMINGROUP": "numberingroup",
  				"NUMBEROFEDITS": "numberofedits",
  				"DEFAULTSORT": "defaultsort",
  				"DEFAULTSORTKEY": "defaultsort",
  				"DEFAULTCATEGORYSORT": "defaultsort",
  				"PAGESINCATEGORY": "pagesincategory",
  				"PAGESINCAT": "pagesincategory",
  				"PAGESIZE": "pagesize",
  				"PROTECTIONLEVEL": "protectionlevel",
  				"PROTECTIONEXPIRY": "protectionexpiry",
  				"NAMESPACEE": "namespacee",
  				"NAMESPACENUMBER": "namespacenumber",
  				"TALKSPACE": "talkspace",
  				"TALKSPACEE": "talkspacee",
  				"SUBJECTSPACE": "subjectspace",
  				"ARTICLESPACE": "subjectspace",
  				"SUBJECTSPACEE": "subjectspacee",
  				"ARTICLESPACEE": "subjectspacee",
  				"PAGENAME": "pagename",
  				"PAGENAMEE": "pagenamee",
  				"FULLPAGENAME": "fullpagename",
  				"FULLPAGENAMEE": "fullpagenamee",
  				"ROOTPAGENAME": "rootpagename",
  				"ROOTPAGENAMEE": "rootpagenamee",
  				"BASEPAGENAME": "basepagename",
  				"BASEPAGENAMEE": "basepagenamee",
  				"SUBPAGENAME": "subpagename",
  				"SUBPAGENAMEE": "subpagenamee",
  				"TALKPAGENAME": "talkpagename",
  				"TALKPAGENAMEE": "talkpagenamee",
  				"SUBJECTPAGENAME": "subjectpagename",
  				"ARTICLEPAGENAME": "subjectpagename",
  				"SUBJECTPAGENAMEE": "subjectpagenamee",
  				"ARTICLEPAGENAMEE": "subjectpagenamee",
  				"REVISIONID": "revisionid",
  				"REVISIONDAY": "revisionday",
  				"REVISIONDAY2": "revisionday2",
  				"REVISIONMONTH": "revisionmonth",
  				"REVISIONMONTH1": "revisionmonth1",
  				"REVISIONYEAR": "revisionyear",
  				"REVISIONTIMESTAMP": "revisiontimestamp",
  				"REVISIONUSER": "revisionuser",
  				"CASCADINGSOURCES": "cascadingsources",
  				"NAMESPACE": "namespace",
  				"DISPLAYTITLE": "displaytitle",
  				"SHORTDESC": "shortdesc",
  				"!": "!",
  				"CURRENTMONTH": "currentmonth",
  				"CURRENTMONTH2": "currentmonth",
  				"CURRENTMONTH1": "currentmonth1",
  				"CURRENTMONTHNAME": "currentmonthname",
  				"CURRENTMONTHNAMEGEN": "currentmonthnamegen",
  				"CURRENTMONTHABBREV": "currentmonthabbrev",
  				"CURRENTDAY": "currentday",
  				"CURRENTDAY2": "currentday2",
  				"CURRENTDAYNAME": "currentdayname",
  				"CURRENTYEAR": "currentyear",
  				"CURRENTTIME": "currenttime",
  				"CURRENTHOUR": "currenthour",
  				"LOCALMONTH": "localmonth",
  				"LOCALMONTH2": "localmonth",
  				"LOCALMONTH1": "localmonth1",
  				"LOCALMONTHNAME": "localmonthname",
  				"LOCALMONTHNAMEGEN": "localmonthnamegen",
  				"LOCALMONTHABBREV": "localmonthabbrev",
  				"LOCALDAY": "localday",
  				"LOCALDAY2": "localday2",
  				"LOCALDAYNAME": "localdayname",
  				"LOCALYEAR": "localyear",
  				"LOCALTIME": "localtime",
  				"LOCALHOUR": "localhour",
  				"SITENAME": "sitename",
  				"CURRENTWEEK": "currentweek",
  				"CURRENTDOW": "currentdow",
  				"LOCALWEEK": "localweek",
  				"LOCALDOW": "localdow",
  				"REVISIONSIZE": "revisionsize",
  				"CURRENTVERSION": "currentversion",
  				"CURRENTTIMESTAMP": "currenttimestamp",
  				"LOCALTIMESTAMP": "localtimestamp",
  				"DIRECTIONMARK": "directionmark",
  				"DIRMARK": "directionmark",
  				"CONTENTLANGUAGE": "contentlanguage",
  				"CONTENTLANG": "contentlanguage",
  				"PAGELANGUAGE": "pagelanguage"
  			  }
  			],
  			"urlProtocols": "bitcoin\\:|ftp\\:\\/\\/|ftps\\:\\/\\/|geo\\:|git\\:\\/\\/|gopher\\:\\/\\/|http\\:\\/\\/|https\\:\\/\\/|irc\\:\\/\\/|ircs\\:\\/\\/|magnet\\:|mailto\\:|mms\\:\\/\\/|news\\:|nntp\\:\\/\\/|redis\\:\\/\\/|sftp\\:\\/\\/|sip\\:|sips\\:|sms\\:|ssh\\:\\/\\/|svn\\:\\/\\/|tel\\:|telnet\\:\\/\\/|urn\\:|worldwind\\:\\/\\/|xmpp\\:|\\/\\/",
  			"linkTrailCharacters": "/^([a-z]+)(.*)$/sD"
  		  },
  			urlProtocols = new RegExp( mwConfig.urlProtocols, 'i' ),
  			permittedHtmlTags = { b: true, bdi: true, del: true, i: true, ins: true,
  				u: true, font: true, big: true, small: true, sub: true, sup: true,
  				h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, cite: true,
  				code: true, em: true, s: true, strike: true, strong: true, tt: true,
  				'var': true, div: true, center: true, blockquote: true, ol: true, ul: true,
  				dl: true, table: true, caption: true, pre: true, ruby: true, rb: true,
  				rp: true, rt: true, rtc: true, p: true, span: true, abbr: true, dfn: true,
  				kbd: true, samp: true, data: true, time: true, mark: true, br: true,
  				wbr: true, hr: true, li: true, dt: true, dd: true, td: true, th: true,
  				tr: true, noinclude: true, includeonly: true, onlyinclude: true, translate: true },
  			voidHtmlTags = { br: true, hr: true, wbr: true },
  			isBold, isItalic, firstsingleletterword, firstmultiletterword, firstspace, mBold, mItalic, mTokens = [],
  			mStyle;

  		function makeStyle( style, state, endGround ) {
  			if ( isBold ) {
  				style += ' strong';
  			}
  			if ( isItalic ) {
  				style += ' em';
  			}
  			return makeLocalStyle( style, state, endGround );
  		}

  		function makeLocalStyle( style, state, endGround ) {
  			var ground = '';
  			switch ( state.nTemplate ) {
  				case 0:
  					break;
  				case 1:
  					ground += '-template';
  					break;
  				case 2:
  					ground += '-template2';
  					break;
  				default:
  					ground += '-template3';
  					break;
  			}
  			switch ( state.nExt ) {
  				case 0:
  					break;
  				case 1:
  					ground += '-ext';
  					break;
  				case 2:
  					ground += '-ext2';
  					break;
  				default:
  					ground += '-ext3';
  					break;
  			}
  			if ( state.nLink > 0 ) {
  				ground += '-link';
  			}
  			if ( ground !== '' ) {
  				style = 'mw' + ground + '-ground ' + style;
  			}
  			if ( endGround ) {
  				state[ endGround ]--;
  			}
  			return style;
  		}

  		function eatBlock( style, terminator ) {
  			return function ( stream, state ) {
  				while ( !stream.eol() ) {
  					if ( stream.match( terminator ) ) {
  						state.tokenize = state.stack.pop();
  						break;
  					}
  					stream.next();
  				}
  				return makeLocalStyle( style, state );
  			};
  		}

  		function eatEnd( style ) {
  			return function ( stream, state ) {
  				stream.skipToEnd();
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( style, state );
  			};
  		}

  		function eatChar( char, style ) {
  			return function ( stream, state ) {
  				state.tokenize = state.stack.pop();
  				if ( stream.eat( char ) ) {
  					return makeLocalStyle( style, state );
  				}
  				return makeLocalStyle( 'error', state );
  			};
  		}

  		function eatSectionHeader( count ) {
  			return function ( stream, state ) {
  				if ( stream.match( /[^&<[{~]+/ ) ) {
  					if ( stream.eol() ) {
  						stream.backUp( count );
  						state.tokenize = eatEnd( 'mw-section-header' );
  					}
  					return makeLocalStyle('mw-section-' + count + '-title', state);
  				}
  				return eatWikiText( '', '' )( stream, state );
  			};
  		}

  		function inVariable( stream, state ) {
  			if ( stream.match( /[^{}|]+/ ) ) {
  				return makeLocalStyle( 'mw-templatevariable-name', state );
  			}
  			if ( stream.eat( '|' ) ) {
  				state.tokenize = inVariableDefault;
  				return makeLocalStyle( 'mw-templatevariable-delimiter', state );
  			}
  			if ( stream.match( '}}}' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-templatevariable-bracket', state );
  			}
  			if ( stream.match( '{{{' ) ) {
  				state.stack.push( state.tokenize );
  				return makeLocalStyle( 'mw-templatevariable-bracket', state );
  			}
  			stream.next();
  			return makeLocalStyle( 'mw-templatevariable-name', state );
  		}

  		function inVariableDefault( stream, state ) {
  			if ( stream.match( /[^{}[<&~]+/ ) ) {
  				return makeLocalStyle( 'mw-templatevariable', state );
  			}
  			if ( stream.match( '}}}' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-templatevariable-bracket', state );
  			}
  			return eatWikiText( 'mw-templatevariable', '' )( stream, state );
  		}

  		function inParserFunctionName( stream, state ) {
  			if ( stream.match( /#?[^:}{~]+/ ) ) { // FIXME: {{#name}} and {{uc}} are wrong, must have ':'
  				return makeLocalStyle( 'mw-parserfunction-name', state );
  			}
  			if ( stream.eat( ':' ) ) {
  				state.tokenize = inParserFunctionArguments;
  				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
  			}
  			if ( stream.match( '}}' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
  			}
  			return eatWikiText( 'mw-parserfunction', '' )( stream, state );
  		}

  		function inParserFunctionArguments( stream, state ) {
  			if ( stream.match( /[^|}{[<&~]+/ ) ) {
  				return makeLocalStyle( 'mw-parserfunction', state );
  			} else if ( stream.eat( '|' ) ) {
  				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
  			} else if ( stream.match( '}}' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
  			}
  			return eatWikiText( 'mw-parserfunction', '' )( stream, state );
  		}

  		function eatTemplatePageName( haveAte ) {
  			return function ( stream, state ) {
  				if ( stream.match( /[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
  					state.tokenize = eatTemplateArgument( true );
  					return makeLocalStyle( 'mw-template-delimiter', state );
  				}
  				if ( stream.match( /[\s\u00a0]*\}\}/ ) ) {
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
  				}
  				if ( haveAte && stream.sol() ) {
  					// @todo error message
  					state.nTemplate--;
  					state.tokenize = state.stack.pop();
  					return;
  				}
  				if ( stream.match( /[\s\u00a0]*[^\s\u00a0|}<{&~]+/ ) ) {
  					state.tokenize = eatTemplatePageName( true );
  					return makeLocalStyle( 'mw-template-name mw-pagename', state );
  				} else if ( stream.eatSpace() ) {
  					if ( stream.eol() === true ) {
  						return makeLocalStyle( 'mw-template-name', state );
  					}
  					return makeLocalStyle( 'mw-template-name mw-pagename', state );
  				}
  				return eatWikiText( 'mw-template-name mw-pagename', 'mw-template-name-mnemonic mw-pagename' )( stream, state );
  			};
  		}

  		function eatTemplateArgument( expectArgName ) {
  			return function ( stream, state ) {
  				if ( expectArgName && stream.eatWhile( /[^=|}{[<&~]/ ) ) {
  					if ( stream.eat( '=' ) ) {
  						state.tokenize = eatTemplateArgument( false );
  						return makeLocalStyle( 'mw-template-argument-name', state );
  					}
  					return makeLocalStyle( 'mw-template', state );
  				} else if ( stream.eatWhile( /[^|}{[<&~]/ ) ) {
  					return makeLocalStyle( 'mw-template', state );
  				} else if ( stream.eat( '|' ) ) {
  					state.tokenize = eatTemplateArgument( true );
  					return makeLocalStyle( 'mw-template-delimiter', state );
  				} else if ( stream.match( '}}' ) ) {
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
  				}
  				return eatWikiText( 'mw-template', '' )( stream, state );
  			};
  		}

  		function eatExternalLinkProtocol( chars ) {
  			return function ( stream, state ) {
  				while ( chars > 0 ) {
  					chars--;
  					stream.next();
  				}
  				if ( stream.eol() ) {
  					state.nLink--;
  					// @todo error message
  					state.tokenize = state.stack.pop();
  				} else {
  					state.tokenize = inExternalLink;
  				}
  				return makeLocalStyle( 'mw-extlink-protocol', state );
  			};
  		}

  		function inExternalLink( stream, state ) {
  			if ( stream.sol() ) {
  				state.nLink--;
  				// @todo error message
  				state.tokenize = state.stack.pop();
  				return;
  			}
  			if ( stream.match( /[\s\u00a0]*\]/ ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
  			}
  			if ( stream.eatSpace() ) {
  				state.tokenize = inExternalLinkText;
  				return makeStyle( '', state );
  			}
  			if ( stream.match( /[^\s\u00a0\]{&~']+/ ) || stream.eatSpace() ) {
  				if ( stream.peek() === '\'' ) {
  					if ( stream.match( '\'\'', false ) ) {
  						state.tokenize = inExternalLinkText;
  					} else {
  						stream.next();
  					}
  				}
  				return makeStyle( 'mw-extlink', state );
  			}
  			return eatWikiText( 'mw-extlink', '' )( stream, state );
  		}

  		function inExternalLinkText( stream, state ) {
  			if ( stream.sol() ) {
  				state.nLink--;
  				// @todo error message
  				state.tokenize = state.stack.pop();
  				return;
  			}
  			if ( stream.eat( ']' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
  			}
  			if ( stream.match( /[^'\]{&~]+/ ) ) {
  				return makeStyle( 'mw-extlink-text', state );
  			}
  			return eatWikiText( 'mw-extlink-text', '' )( stream, state );
  		}

  		function inLink( stream, state ) {
  			if ( stream.sol() ) {
  				state.nLink--;
  				// @todo error message
  				state.tokenize = state.stack.pop();
  				return;
  			}
  			if ( stream.match( /[\s\u00a0]*#[\s\u00a0]*/ ) ) {
  				state.tokenize = inLinkToSection;
  				return makeLocalStyle( 'mw-link', state );
  			}
  			if ( stream.match( /[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
  				state.tokenize = eatLinkText();
  				return makeLocalStyle( 'mw-link-delimiter', state );
  			}
  			if ( stream.match( /[\s\u00a0]*\]\]/ ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
  				// if ( !stream.eatSpace() ) {
  				// state.ImInBlock.push( 'LinkTrail' );
  				// }
  			}
  			if ( stream.match( /[\s\u00a0]*[^\s\u00a0#|\]&~{]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
  				return makeStyle( 'mw-link-pagename mw-pagename', state );
  			}
  			return eatWikiText( 'mw-link-pagename mw-pagename', 'mw-pagename' )( stream, state );
  		}

  		function inLinkToSection( stream, state ) {
  			if ( stream.sol() ) {
  				// @todo error message
  				state.nLink--;
  				state.tokenize = state.stack.pop();
  				return;
  			}
  			if ( stream.match( /[^|\]&~{}]+/ ) ) { // FIXME '{{' brokes Link, sample [[z{{page]]
  				return makeLocalStyle( 'mw-link-tosection', state );
  			}
  			if ( stream.eat( '|' ) ) {
  				state.tokenize = eatLinkText();
  				return makeLocalStyle( 'mw-link-delimiter', state );
  			}
  			if ( stream.match( ']]' ) ) {
  				state.tokenize = state.stack.pop();
  				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
  				// if ( !stream.eatSpace() ) {
  				// state.ImInBlock.push( 'LinkTrail' );
  				// }
  			}
  			return eatWikiText( 'mw-link-tosection', '' )( stream, state );
  		}

  		function eatLinkText() {
  			var linkIsBold, linkIsItalic;
  			return function ( stream, state ) {
  				var tmpstyle;
  				if ( stream.match( ']]' ) ) {
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
  				}
  				if ( stream.match( '\'\'\'' ) ) {
  					linkIsBold = !linkIsBold;
  					return makeLocalStyle( 'mw-link-text mw-apostrophes', state );
  				}
  				if ( stream.match( '\'\'' ) ) {
  					linkIsItalic = !linkIsItalic;
  					return makeLocalStyle( 'mw-link-text mw-apostrophes', state );
  				}
  				tmpstyle = 'mw-link-text';
  				if ( linkIsBold ) {
  					tmpstyle += ' strong';
  				}
  				if ( linkIsItalic ) {
  					tmpstyle += ' em';
  				}
  				if ( stream.match( /[^'\]{&~]+/ ) ) {
  					return makeStyle( tmpstyle, state );
  				}
  				return eatWikiText( tmpstyle, '' )( stream, state );
  			};
  		}

  		function eatTagName( chars, isCloseTag, isHtmlTag ) {
  			return function ( stream, state ) {
  				var name = '';
  				while ( chars > 0 ) {
  					chars--;
  					name = name + stream.next();
  				}
  				if ( stream.eol() ) {
  					// @todo error message
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( ( isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name' ), state );
  				}
  				stream.eatSpace();
  				if ( stream.eol() ) {
  					// @todo error message
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( ( isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name' ), state );
  				}

  				if ( isHtmlTag ) {
  					if ( isCloseTag && !( name in voidHtmlTags ) ) {
  						state.tokenize = eatChar( '>', 'mw-htmltag-bracket' );
  					} else {
  						state.tokenize = eatHtmlTagAttribute( name );
  					}
  					return makeLocalStyle( 'mw-htmltag-name', state );
  				} // it is the extension tag
  				if ( isCloseTag ) {
  					state.tokenize = eatChar( '>', 'mw-exttag-bracket mw-ext-' + name );
  				} else {
  					state.tokenize = eatExtTagAttribute( name );
  				}
  				return makeLocalStyle( 'mw-exttag-name mw-ext-' + name, state );
  			};
  		}

  		function eatHtmlTagAttribute( name ) {
  			return function ( stream, state ) {
  				if ( stream.match( /[^>/<{&~]+/ ) ) {
  					return makeLocalStyle( 'mw-htmltag-attribute', state );
  				}
  				if ( stream.eat( '>' ) ) {
  					if ( !( name in voidHtmlTags ) ) {
  						state.InHtmlTag.push( name );
  					}
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-htmltag-bracket', state );
  				}
  				if ( stream.match( '/>' ) ) {
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-htmltag-bracket', state );
  				}
  				return eatWikiText( 'mw-htmltag-attribute', '' )( stream, state );
  			};
  		}

  		function eatExtTagAttribute( name ) {
  			return function ( stream, state ) {
  				if ( stream.match( /[^>/<{&~]+/ ) ) {
  					return makeLocalStyle( 'mw-exttag-attribute mw-ext-' + name, state );
  				}
  				if ( stream.eat( '>' ) ) {
  					state.extName = name;
            // if ( name in mwConfig.tagModes ) {
            //   state.extMode = CodeMirror.getMode( config, mwConfig.tagModes[ name ] );
            //   state.extState = CodeMirror.startState( state.extMode );
            // }
  					state.tokenize = eatExtTagArea( name );
  					return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
  				}
  				if ( stream.match( '/>' ) ) {
  					state.tokenize = state.stack.pop();
  					return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
  				}
  				return eatWikiText( 'mw-exttag-attribute mw-ext-' + name, '' )( stream, state );
  			};
  		}

  		function eatExtTagArea( name ) {
  			return function ( stream, state ) {
  				var origString = false,
  					from = stream.pos,
  					to,
  					pattern = new RegExp( '</' + name + '\\s*>' ),
  					m = pattern.exec( from ? stream.string.slice( from ) : stream.string );

  				if ( m ) {
  					if ( m.index === 0 ) {
  						state.tokenize = eatExtCloseTag( name );
  						state.extName = false;
  						if ( state.extMode !== false ) {
  							state.extMode = false;
  							state.extState = false;
  						}
  						return state.tokenize( stream, state );
  					}
  					to = m.index + from;
  					origString = stream.string;
  					stream.string = origString.slice( 0, to );
  				}

  				state.stack.push( state.tokenize );
  				state.tokenize = eatExtTokens( origString );
  				return state.tokenize( stream, state );
  			};
  		}

  		function eatExtCloseTag( name ) {
  			return function ( stream, state ) {
  				stream.next(); // eat <
  				stream.next(); // eat /
  				state.tokenize = eatTagName( name.length, true, false );
  				return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + name, state );
  			};
  		}

  		function eatExtTokens( origString ) {
  			return function ( stream, state ) {
  				var ret;
  				if ( state.extMode === false ) {
  					ret = ( origString === false && stream.sol() ? 'line-cm-mw-exttag' : 'mw-exttag' );
  					stream.skipToEnd();
  				} else {
  					ret = ( origString === false && stream.sol() ? 'line-cm-mw-tag-' : 'mw-tag-' ) + state.extName;
  					ret += ' ' + state.extMode.token( stream, state.extState, origString === false );
  				}
  				if ( stream.eol() ) {
  					if ( origString !== false ) {
  						stream.string = origString;
  					}
  					state.tokenize = state.stack.pop();
  				}
  				return makeLocalStyle( ret, state );
  			};
  		}

  		function eatStartTable( stream, state ) {
  			stream.match( '{|' );
  			stream.eatSpace();
  			state.tokenize = inTableDefinition;
  			return 'mw-table-bracket';
  		}

  		function inTableDefinition( stream, state ) {
  			if ( stream.sol() ) {
  				state.tokenize = inTable;
  				return inTable( stream, state );
  			}
  			return eatWikiText( 'mw-table-definition', '' )( stream, state );
  		}

  		function inTableCaption( stream, state ) {
  			if ( stream.sol() && stream.match( /[\s\u00a0]*[|!]/, false ) ) {
  				state.tokenize = inTable;
  				return inTable( stream, state );
  			}
  			return eatWikiText( 'mw-table-caption', '' )( stream, state );
  		}

  		function inTable( stream, state ) {
  			if ( stream.sol() ) {
  				stream.eatSpace();
  				if ( stream.eat( '|' ) ) {
  					if ( stream.eat( '-' ) ) {
  						stream.eatSpace();
  						state.tokenize = inTableDefinition;
  						return makeLocalStyle( 'mw-table-delimiter', state );
  					}
  					if ( stream.eat( '+' ) ) {
  						stream.eatSpace();
  						state.tokenize = inTableCaption;
  						return makeLocalStyle( 'mw-table-delimiter', state );
  					}
  					if ( stream.eat( '}' ) ) {
  						state.tokenize = state.stack.pop();
  						return makeLocalStyle( 'mw-table-bracket', state );
  					}
  					stream.eatSpace();
  					state.tokenize = eatTableRow( true, false );
  					return makeLocalStyle( 'mw-table-delimiter', state );
  				}
  				if ( stream.eat( '!' ) ) {
  					stream.eatSpace();
  					state.tokenize = eatTableRow( true, true );
  					return makeLocalStyle( 'mw-table-delimiter', state );
  				}
  			}
  			return eatWikiText( '', '' )( stream, state );
  		}

  		function eatTableRow( isStart, isHead ) {
  			return function ( stream, state ) {
  				if ( stream.sol() ) {
  					if ( stream.match( /[\s\u00a0]*[|!]/, false ) ) {
  						state.tokenize = inTable;
  						return inTable( stream, state );
  					}
  				} else {
  					if ( stream.match( /[^'|{[<&~!]+/ ) ) {
  						return makeStyle( ( isHead ? 'strong' : '' ), state );
  					}
  					if ( stream.match( '||' ) || isHead && stream.match( '!!' ) || ( isStart && stream.eat( '|' ) ) ) {
  						isBold = false;
  						isItalic = false;
  						if ( isStart ) {
  							state.tokenize = eatTableRow( false, isHead );
  						}
  						return makeLocalStyle( 'mw-table-delimiter', state );
  					}
  				}
  				return eatWikiText( ( isHead ? 'strong' : '' ), ( isHead ? 'strong' : '' ) )( stream, state );
  			};
  		}

  		function eatFreeExternalLinkProtocol( stream, state ) {
  			stream.match( urlProtocols );
  			state.tokenize = eatFreeExternalLink;
  			return makeLocalStyle( 'mw-free-extlink-protocol', state );
  		}

  		function eatFreeExternalLink( stream, state ) {
  			if ( stream.eol() ) ; else if ( stream.match( /[^\s\u00a0{[\]<>~).,']*/ ) ) {
  				if ( stream.peek() === '~' ) {
  					if ( !stream.match( /~{3,}/, false ) ) {
  						stream.match( /~*/ );
  						return makeLocalStyle( 'mw-free-extlink', state );
  					}
  				} else if ( stream.peek() === '{' ) {
  					if ( !stream.match( /\{\{/, false ) ) {
  						stream.next();
  						return makeLocalStyle( 'mw-free-extlink', state );
  					}
  				} else if ( stream.peek() === '\'' ) {
  					if ( !stream.match( '\'\'', false ) ) {
  						stream.next();
  						return makeLocalStyle( 'mw-free-extlink', state );
  					}
  				} else if ( stream.match( /[).,]+(?=[^\s\u00a0{[\]<>~).,])/ ) ) {
  					return makeLocalStyle( 'mw-free-extlink', state );
  				}
  			}
  			state.tokenize = state.stack.pop();
  			return makeLocalStyle( 'mw-free-extlink', state );
  		}

  		function eatWikiText( style, mnemonicStyle ) {
  			return function ( stream, state ) {
  				var ch, tmp, mt, name, isCloseTag, tagname,
  					sol = stream.sol();

  				function chain( parser ) {
  					state.stack.push( state.tokenize );
  					state.tokenize = parser;
  					return parser( stream, state );
  				}

  				if ( sol ) {
  					if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) { // highlight free external links, bug T108448
  						state.stack.push( state.tokenize );
  						state.tokenize = eatFreeExternalLink;
  						return makeLocalStyle( 'mw-free-extlink-protocol', state );
  					}
  					ch = stream.next();
  					switch ( ch ) {
  						case '-':
  							if ( stream.match( /----*/ ) ) {
  								return 'mw-hr';
  							}
  							break;
  						case '=':
  							tmp = stream.match( /(={0,5})(.+?(=\1\s*))$/ );
  							if ( tmp ) { // Title
  								stream.backUp( tmp[ 2 ].length );
  								state.stack.push( state.tokenize );
  								state.tokenize = eatSectionHeader( tmp[ 3 ].length );
  								return 'mw-section-header line-cm-mw-section-' + ( tmp[ 1 ].length + 1 );
  							}
  							break;
  						case '*':
  						case '#':
  							if ( stream.match( /[*#]*:*/ ) ) {
  								return 'mw-list';
  							}
  							break;
  						case ':':
  							if ( stream.match( /:*{\|/, false ) ) { // Highlight indented tables :{|, bug T108454
  								state.stack.push( state.tokenize );
  								state.tokenize = eatStartTable;
  							}
  							if ( stream.match( /:*[*#]*/ ) ) {
  								return 'mw-indenting';
  							}
  							break;
  						case ' ':
  							if ( stream.match( /[\s\u00a0]*:*{\|/, false ) ) { // Leading spaces is the correct syntax for a table, bug T108454
  								stream.eatSpace();
  								if ( stream.match( /:+/ ) ) { // ::{|
  									state.stack.push( state.tokenize );
  									state.tokenize = eatStartTable;
  									return 'mw-indenting';
  								}
  								stream.eat( '{' );
  							} else {
  								return 'mw-skipformatting';
  							}
  							// break is not necessary here
  							// falls through
  						case '{':
  							if ( stream.eat( '|' ) ) {
  								stream.eatSpace();
  								state.stack.push( state.tokenize );
  								state.tokenize = inTableDefinition;
  								return 'mw-table-bracket';
  							}
  					}
  				} else {
  					ch = stream.next();
  				}

  				switch ( ch ) {
  					case '&':
  						return makeStyle( eatMnemonic( stream, style, mnemonicStyle ), state );
  					case '\'':
  						if ( stream.match( /'*(?=''''')/ ) || stream.match( /'''(?!')/, false ) ) { // skip the irrelevant apostrophes ( >5 or =4 )
  							break;
  						}
  						if ( stream.match( '\'\'' ) ) { // bold
  							if ( !( firstsingleletterword || stream.match( '\'\'', false ) ) ) {
  								prepareItalicForCorrection( stream );
  							}
  							isBold = !isBold;
  							return makeLocalStyle( 'mw-apostrophes-bold', state );
  						} else if ( stream.eat( '\'' ) ) { // italic
  							isItalic = !isItalic;
  							return makeLocalStyle( 'mw-apostrophes-italic', state );
  						}
  						break;
  					case '[':
  						if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
  							stream.eatSpace();
  							if ( /[^\]|[]/.test( stream.peek() ) ) {
  								state.nLink++;
  								state.stack.push( state.tokenize );
  								state.tokenize = inLink;
  								return makeLocalStyle( 'mw-link-bracket', state );
  							}
  						} else {
  							mt = stream.match( urlProtocols );
  							if ( mt ) {
  								state.nLink++;
  								stream.backUp( mt[ 0 ].length );
  								state.stack.push( state.tokenize );
  								state.tokenize = eatExternalLinkProtocol( mt[ 0 ].length );
  								return makeLocalStyle( 'mw-extlink-bracket', state );
  							}
  						}
  						break;
  					case '{':
  						if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) { // Template parameter (skip parameters inside a template transclusion, Bug: T108450)
  							stream.eatSpace();
  							state.stack.push( state.tokenize );
  							state.tokenize = inVariable;
  							return makeLocalStyle( 'mw-templatevariable-bracket', state );
  						} else if ( stream.match( /\{[\s\u00a0]*/ ) ) {
  							if ( stream.peek() === '#' ) { // Parser function
  								state.nExt++;
  								state.stack.push( state.tokenize );
  								state.tokenize = inParserFunctionName;
  								return makeLocalStyle( 'mw-parserfunction-bracket', state );
  							}
  							// Check for parser function without '#'
  							name = stream.match( /([^\s\u00a0}[\]<{'|&:]+)(:|[\s\u00a0]*)(\}\}?)?(.)?/ );
  							if ( name ) {
  								stream.backUp( name[ 0 ].length );
  								if ( ( name[ 2 ] === ':' || name[ 4 ] === undefined || name[ 3 ] === '}}' ) && ( name[ 1 ].toLowerCase() in mwConfig.functionSynonyms[ 0 ] || name[ 1 ] in mwConfig.functionSynonyms[ 1 ] ) ) {
  									state.nExt++;
  									state.stack.push( state.tokenize );
  									state.tokenize = inParserFunctionName;
  									return makeLocalStyle( 'mw-parserfunction-bracket', state );
  								}
  							}
  							// Template
  							state.nTemplate++;
  							state.stack.push( state.tokenize );
  							state.tokenize = eatTemplatePageName( false );
  							return makeLocalStyle( 'mw-template-bracket', state );
  						}
  						break;
  					case '<':
  						isCloseTag = !!stream.eat( '/' );
  						tagname = stream.match( /[^>/\s\u00a0.*,[\]{}$^+?|/\\'`~<=!@#%&()-]+/ );
  						if ( stream.match( '!--' ) ) { // comment
  							return chain( eatBlock( 'mw-comment', '-->' ) );
  						}
  						if ( tagname ) {
  							tagname = tagname[ 0 ].toLowerCase();
  							if ( tagname in mwConfig.tags ) { // Parser function
  								if ( isCloseTag === true ) {
  									// @todo message
  									return 'error';
  								}
  								stream.backUp( tagname.length );
  								state.stack.push( state.tokenize );
  								state.tokenize = eatTagName( tagname.length, isCloseTag, false );
  								return makeLocalStyle( 'mw-exttag-bracket mw-ext-' + tagname, state );
  							}
  							if ( tagname in permittedHtmlTags ) { // Html tag
  								if ( isCloseTag === true && tagname !== state.InHtmlTag.pop() ) {
  									// @todo message
  									return 'error';
  								}
  								if ( isCloseTag === true && tagname in voidHtmlTags ) {
  									// @todo message
  									return 'error';
  								}
  								stream.backUp( tagname.length );
  								state.stack.push( state.tokenize );
  								// || ( tagname in voidHtmlTags ) because opening void tags should also be treated as the closing tag.
  								state.tokenize = eatTagName( tagname.length, isCloseTag || ( tagname in voidHtmlTags ), true );
  								return makeLocalStyle( 'mw-htmltag-bracket', state );
  							}
  							stream.backUp( tagname.length );
  						}
  						break;
  					case '~':
  						if ( stream.match( /~{2,4}/ ) ) {
  							return 'mw-signature';
  						}
  						break;
  					case '_': // Maybe double undescored Magic Word as __TOC__
  						tmp = 1;
  						while ( stream.eat( '_' ) ) { // Optimize processing of many underscore symbols
  							tmp++;
  						}
  						if ( tmp > 2 ) { // Many underscore symbols
  							if ( !stream.eol() ) {
  								stream.backUp( 2 ); // Leave last two underscore symbols for processing again in next iteration
  							}
  							return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
  						} else if ( tmp === 2 ) { // Check on double underscore Magic Word
  							name = stream.match( /([^\s\u00a0>}[\]<{'|&:~]+?)__/ ); // The same as the end of function except '_' inside and with '__' at the end of string
  							if ( name && name[ 0 ] ) {
  								if ( '__' + name[ 0 ].toLowerCase() in mwConfig.doubleUnderscore[ 0 ] || '__' + name[ 0 ] in mwConfig.doubleUnderscore[ 1 ] ) {
  									return 'mw-doubleUnderscore';
  								}
  								if ( !stream.eol() ) {
  									stream.backUp( 2 ); // Two underscore symbols at the end can be begining of other double undescored Magic Word
  								}
  								return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
  							}
  						}
  						break;
  					default:
  						if ( /[\s\u00a0]/.test( ch ) ) {
  							stream.eatSpace();
  							if ( stream.match( urlProtocols, false ) && !stream.match( '//' ) ) { // highlight free external links, bug T108448
  								state.stack.push( state.tokenize );
  								state.tokenize = eatFreeExternalLinkProtocol;
  								return makeStyle( style, state );
  							}
  						}
  						break;
  				}
  				stream.match( /[^\s\u00a0_>}[\]<{'|&:~]+/ );
  				return makeStyle( style, state );
  			};
  		}

  		/**
  		 * Remembers position and status for rollbacking.
  		 * It needed for change bold to italic with apostrophe before it if required
  		 *
  		 * see https://phabricator.wikimedia.org/T108455
  		 *
  		 * @param {Object} stream CodeMirror.StringStream
  		 */
  		function prepareItalicForCorrection( stream ) {
  			// see Parser::doQuotes() in MediaWiki core, it works similar
  			// firstsingleletterword has maximum priority
  			// firstmultiletterword has medium priority
  			// firstspace has low priority
  			var end = stream.pos,
  				str = stream.string.substr( 0, end - 3 ),
  				x1 = str.substr( -1, 1 ),
  				x2 = str.substr( -2, 1 );

  			// firstsingleletterword olways is undefined here
  			if ( x1 === ' ' ) {
  				if ( firstmultiletterword || firstspace ) {
  					return;
  				}
  				firstspace = end;
  			} else if ( x2 === ' ' ) {
  				firstsingleletterword = end;
  			} else if ( firstmultiletterword ) {
  				return;
  			} else {
  				firstmultiletterword = end;
  			}
  			// remember bold and italic state for restore
  			mBold = isBold;
  			mItalic = isItalic;
  		}

  		return {
  			startState: function () {
  				return { tokenize: eatWikiText( '', '' ), stack: [], InHtmlTag: [], extName: false, extMode: false, extState: false, nTemplate: 0, nLink: 0, nExt: 0 };
  			},
  			copyState: function ( state ) {
  				return {
  					tokenize: state.tokenize,
  					stack: state.stack.concat( [] ),
  					InHtmlTag: state.InHtmlTag.concat( [] ),
  					extName: state.extName,
  					extMode: state.extMode,
  					extState: state.extMode !== false, //&& CodeMirror.copyState( state.extMode, state.extState ),
  					nTemplate: state.nTemplate,
  					nLink: state.nLink,
  					nExt: state.nExt
  				};
  			},
  			token: function ( stream, state ) {
  				var style, p, t, f,
  					readyTokens = [],
  					tmpTokens = [];

  				if ( mTokens.length > 0 ) { // just send saved tokens till they exists
  					t = mTokens.shift();
  					stream.pos = t.pos;
  					state = t.state;
  					return t.style;
  				}

  				if ( stream.sol() ) { // reset bold and italic status in every new line
  					isBold = false;
  					isItalic = false;
  					firstsingleletterword = undefined;
  					firstmultiletterword = undefined;
  					firstspace = undefined;
  				}

  				do {
  					style = state.tokenize( stream, state ); // get token style
  					f = firstsingleletterword || firstmultiletterword || firstspace;
  					if ( f ) { // rollback point exists
  						if ( f !== p ) { // new rollbak point
  							p = f;
  							if ( tmpTokens.length > 0 ) { // it's not first rollbak point
  								readyTokens = readyTokens.concat( tmpTokens ); // save tokens
  								tmpTokens = [];
  							}
  						}
  						tmpTokens.push( { // save token
  							pos: stream.pos,
  							style: style,
  							state: state//CodeMirror.copyState( state.extMode ? state.extMode : 'mediawiki', state )
  						} );
  					} else { // rollback point not exists
  						mStyle = style; // remember style before possible rollback point
  						return style; // just return token style
  					}
  				} while ( !stream.eol() );

  				if ( isBold && isItalic ) { // needs to rollback
  					isItalic = mItalic; // restore status
  					isBold = mBold;
  					firstsingleletterword = undefined;
  					firstmultiletterword = undefined;
  					firstspace = undefined;
  					if ( readyTokens.length > 0 ) { // it contains tickets before the point of rollback
  						readyTokens[ readyTokens.length - 1 ].pos++; // add one apostrophe, next token will be italic (two apostrophes)
  						mTokens = readyTokens; // for sending tokens till the point of rollback
  					} else { // there are no tikets before the point of rollback
  						stream.pos = tmpTokens[ 0 ].pos - 2; // eat( '\'')
  						return mStyle; // send saved Style
  					}
  				} else { // not needs to rollback
  					mTokens = readyTokens.concat( tmpTokens ); // send all saved tokens
  				}
  				// return first saved token
  				t = mTokens.shift();
  				stream.pos = t.pos;
  				state = t.state;
  				return t.style;
  			},
  			blankLine: function ( state ) {
  				var ret;
  				if ( state.extName ) {
  					if ( state.extMode ) {
  						ret = '';
  						if ( state.extMode.blankLine ) {
  							ret = ' ' + state.extMode.blankLine( state.extState );
  						}
  						return 'line-cm-mw-tag-' + state.extName + ret;
  					}
  					return 'line-cm-mw-exttag';
  				}
  			},
        indent: function(state, textAfter) {
          return 0;
        }
  		};
  	} //);

    // CodeMirror.defineMIME( 'text/mediawiki', 'mediawiki' );
    //
    // function eatNowiki( style, lineStyle ) {
    //   return function ( stream, state, ownLine ) {
    //     var s;
    //     if ( ownLine && stream.sol() ) {
    //       state.ownLine = true;
    //     } else if ( ownLine === false && state.ownLine ) {
    //       state.ownLine = false;
    //     }
    //     s = ( state.ownLine ? lineStyle : style );
    //     if ( stream.match( /[^&]+/ ) ) {
    //       return s;
    //     }
    //     stream.next(); // eat &
    //     return eatMnemonic( stream, s, s );
    //   };
    // }
    //
    // CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
    //   return {
    //     startState: function () { return {}; },
    //     token: eatNowiki( 'mw-tag-pre', 'line-cm-mw-tag-pre' )
    //   };
    // } );
    //
    // CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
    //   return {
    //     startState: function () { return {}; },
    //     token: eatNowiki( 'mw-tag-nowiki', 'line-cm-mw-tag-nowiki' )
    //   };
    // } );

  function specialChars(options) {
      if (options === void 0) { options = {}; }
      return new Plugin({
          view: function (view) {
              return new SpecialCharHighlighter(view, options);
          }
      });
  }
  var JOIN_GAP = 10;
  var SpecialCharHighlighter = /** @class */ (function () {
      function SpecialCharHighlighter(view, options) {
          this.view = view;
          this.options = options;
          this.decorations = Decoration.none;
          this.from = 0;
          this.to = 0;
          this.updateForViewport();
          this.specials = options.specialChars || SPECIALS;
          if (options.addSpecialChars)
              this.specials = new RegExp(this.specials.source + "|" + options.addSpecialChars.source, "gu");
          var styles = document.body.style;
          if (this.replaceTabs = (styles.tabSize || styles.MozTabSize) == null)
              this.specials = new RegExp("\t|" + this.specials.source, "gu");
      }
      SpecialCharHighlighter.prototype.updateState = function (_view, _prev, transactions) {
          var allChanges = transactions.reduce(function (ch, tr) { return ch.appendSet(tr.changes); }, ChangeSet.empty);
          if (allChanges.length) {
              this.decorations = this.decorations.map(allChanges);
              this.from = allChanges.mapPos(this.from, 1);
              this.to = allChanges.mapPos(this.to, -1);
              this.closeHoles(allChanges.changedRanges());
          }
          this.updateForViewport();
      };
      SpecialCharHighlighter.prototype.updateViewport = function () {
          this.updateForViewport();
      };
      SpecialCharHighlighter.prototype.closeHoles = function (ranges) {
          var decorations = [], vp = this.view.viewport, replaced = [];
          for (var i = 0; i < ranges.length; i++) {
              var _a = ranges[i], from = _a.fromB, to = _a.toB;
              // Must redraw all tabs further on the line
              if (this.replaceTabs)
                  to = this.view.state.doc.lineAt(to).end;
              while (i < ranges.length - 1 && ranges[i + 1].fromB < to + JOIN_GAP)
                  to = Math.max(to, ranges[++i].toB);
              // Clip to current viewport, to avoid doing work for invisible text
              from = Math.max(vp.from, from);
              to = Math.min(vp.to, to);
              if (from >= to)
                  continue;
              this.getDecorationsFor(from, to, decorations);
              replaced.push(from, to);
          }
          if (decorations.length)
              this.decorations = this.decorations.update(decorations, function (pos) {
                  for (var i = 0; i < replaced.length; i += 2)
                      if (pos >= replaced[i] && pos < replaced[i + 1])
                          return false;
                  return true;
              }, replaced[0], replaced[replaced.length - 1]);
      };
      SpecialCharHighlighter.prototype.updateForViewport = function () {
          var vp = this.view.viewport;
          // Viewports match, don't do anything
          if (this.from == vp.from && this.to == vp.to)
              return;
          var decorations = [];
          if (this.from >= vp.to || this.to <= vp.from) {
              this.getDecorationsFor(vp.from, vp.to, decorations);
              this.decorations = Decoration.set(decorations);
          }
          else {
              if (vp.from < this.from)
                  this.getDecorationsFor(vp.from, this.from, decorations);
              if (this.to < vp.to)
                  this.getDecorationsFor(this.to, vp.to, decorations);
              this.decorations = this.decorations.update(decorations, function (from, to) { return from >= vp.from && to <= vp.to; });
          }
          this.from = vp.from;
          this.to = vp.to;
      };
      SpecialCharHighlighter.prototype.getDecorationsFor = function (from, to, target) {
          var doc = this.view.state.doc;
          for (var pos = from, cursor = doc.iterRange(from, to), m = void 0; !cursor.next().done;) {
              if (!cursor.lineBreak) {
                  while (m = SPECIALS.exec(cursor.value)) {
                      var code = m[0].codePointAt ? m[0].codePointAt(0) : m[0].charCodeAt(0), widget = void 0;
                      if (code == null)
                          continue;
                      if (code == 9) {
                          var line = doc.lineAt(pos + m.index);
                          var size = this.view.state.tabSize, col = countColumn(doc.slice(line.start, pos + m.index), 0, size);
                          widget = new TabWidget((size - (col % size)) * this.view.defaultCharacterWidth);
                      }
                      else {
                          widget = new SpecialCharWidget(this.options, code);
                      }
                      target.push(Decoration.range(pos + m.index, pos + m.index + m[0].length, { collapsed: widget }));
                  }
              }
              pos += cursor.value.length;
          }
      };
      return SpecialCharHighlighter;
  }());
  // FIXME configurable
  var SPECIALS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/gu;
  var NAMES = {
      0: "null",
      7: "bell",
      8: "backspace",
      10: "newline",
      11: "vertical tab",
      13: "carriage return",
      27: "escape",
      8203: "zero width space",
      8204: "zero width non-joiner",
      8205: "zero width joiner",
      8206: "left-to-right mark",
      8207: "right-to-left mark",
      8232: "line separator",
      8233: "paragraph separator",
      65279: "zero width no-break space"
  };
  // Assigns placeholder characters from the Control Pictures block to
  // ASCII control characters
  function placeHolder(code) {
      if (code >= 32)
          return null;
      if (code == 10)
          return "\u2424";
      return String.fromCharCode(9216 + code);
  }
  var DEFAULT_PLACEHOLDER = "\u2022";
  var SpecialCharWidget = /** @class */ (function (_super) {
      __extends(SpecialCharWidget, _super);
      function SpecialCharWidget(options, code) {
          var _this = _super.call(this, code) || this;
          _this.options = options;
          return _this;
      }
      SpecialCharWidget.prototype.toDOM = function () {
          var ph = placeHolder(this.value) || DEFAULT_PLACEHOLDER;
          var desc = "Control character " + (NAMES[this.value] || this.value);
          var custom = this.options.render && this.options.render(this.value, desc, ph);
          if (custom)
              return custom;
          var span = document.createElement("span");
          span.textContent = ph;
          span.title = desc;
          span.setAttribute("aria-label", desc);
          span.style.color = "red";
          return span;
      };
      SpecialCharWidget.prototype.ignoreEvent = function () { return false; };
      return SpecialCharWidget;
  }(WidgetType));
  var TabWidget = /** @class */ (function (_super) {
      __extends(TabWidget, _super);
      function TabWidget() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      TabWidget.prototype.toDOM = function () {
          var span = document.createElement("span");
          span.textContent = "\t";
          span.className = "CodeMirror-tab";
          span.style.width = this.value + "px";
          return span;
      };
      TabWidget.prototype.ignoreEvent = function () { return false; };
      return TabWidget;
  }(WidgetType));

  function multipleSelections() {
      return new Plugin({
          multipleSelections: true,
          view: function (view) { return new MultipleSelectionView(view); }
      });
  }
  var CursorWidget = /** @class */ (function (_super) {
      __extends(CursorWidget, _super);
      function CursorWidget() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      CursorWidget.prototype.toDOM = function () {
          var span = document.createElement("span");
          span.className = "CodeMirror-secondary-cursor";
          return span;
      };
      return CursorWidget;
  }(WidgetType));
  var MultipleSelectionView = /** @class */ (function () {
      function MultipleSelectionView(view) {
          this.decorations = Decoration.none;
          this.update(view.state);
          this.rangeConfig = { class: "CodeMirror-secondary-selection" }; // FIXME configurable?
      }
      MultipleSelectionView.prototype.updateState = function (view, prevState) {
          if (prevState.doc != view.state.doc || !prevState.selection.eq(view.state.selection))
              this.update(view.state);
      };
      MultipleSelectionView.prototype.update = function (state) {
          var _a = state.selection, ranges = _a.ranges, primaryIndex = _a.primaryIndex;
          if (ranges.length == 0) {
              this.decorations = Decoration.none;
              return;
          }
          var deco = [];
          for (var i = 0; i < ranges.length; i++)
              if (i != primaryIndex) {
                  var range = ranges[i];
                  deco.push(range.empty ? Decoration.widget(range.from, { widget: new CursorWidget(null) })
                      : Decoration.range(ranges[i].from, ranges[i].to, this.rangeConfig));
              }
          this.decorations = Decoration.set(deco);
      };
      return MultipleSelectionView;
  }());

  var _a$1;
  var mode = legacyMode(mediawiki({ indentUnit: 2 }, {}));
  // FIXME these should move to commands and access the indentation
  // feature through some kind of generic mechanism that allows plugins
  // to advertise that they can do indentation
  function crudeInsertNewlineAndIndent(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      var indentation = mode.indentation(state, state.selection.primary.from);
      if (indentation > -1)
          dispatch(state.transaction.replaceSelection("\n" + " ".repeat(indentation)).scrollIntoView());
      return true;
  }
  function crudeIndentLine(_a) {
      var state = _a.state, dispatch = _a.dispatch;
      var cursor = state.selection.primary.head; // FIXME doesn't indent multiple lines
      var line = state.doc.lineAt(cursor), text = line.slice(0, 100);
      var space = /^ */.exec(text)[0].length; // FIXME doesn't handle tabs
      var indentation = mode.indentation(state, line.start);
      if (indentation == -1)
          indentation = space;
      var tr = state.transaction.replace(line.start, line.start + space, " ".repeat(indentation)).scrollIntoView();
      if (cursor <= line.start + space)
          tr = tr.setSelection(EditorSelection.single(line.start + indentation));
      dispatch(tr);
      return true;
  }
  var isMac = /Mac/.test(navigator.platform);
  var state = EditorState.create({ doc: "{{about|the type of website|other uses|Wiki (disambiguation)}}\n{{redirect|WikiNode|WikiNode of Wikipedia|Wikipedia:WikiNode|the app for the Apple iPad|WikiNodes}}\n{{pp-semi-indef}}\n{{pp-move-indef}}\n{{Use mdy dates|date=November 2017}}\n<!--This page is ''not'' for test edits or new page creation. Please read http://en.wikipedia.org/wiki/Wikipedia:Your_first_article. Thank you.-->\n[[File:Ward Cunningham, Inventor of the Wiki.webm|thumb|right|Interview with [[Ward Cunningham]], inventor of the wiki]]\nA '''wiki''' ({{IPAc-en|audio=en-us-wiki.ogg|\u02C8|w|\u026A|k|i}} {{respell|WIK|ee}}) is a [[website]] on which users [[collaborative software|collaboratively]] modify content and structure directly from the [[web browser]]. In a typical wiki, text is written using a simplified [[markup language]] and often edited with the help of a [[Online rich-text editor|rich-text editor]].<ref name=\"Britannica\">{{citation|title=wiki|encyclopedia=[[Encyclop\u00E6dia Britannica]]|volume=1|publisher=[[Encyclop\u00E6dia Britannica, Inc.]]|year=2007|location=London|url=http://www.britannica.com/EBchecked/topic/1192819/wiki|accessdate=April 10, 2008|deadurl=no|archiveurl=https://web.archive.org/web/20080424074513/http://www.britannica.com/EBchecked/topic/1192819/wiki|archivedate=April 24, 2008|df=mdy-all}}</ref>\n\nA wiki is run using [[wiki software]], otherwise known as a wiki engine. A wiki engine is a type of [[content management system]], but it differs from most other such systems, including [[blog software]], in that the content is created without any defined owner or leader, and wikis have little inherent structure, allowing structure to emerge according to the needs of the users.<ref name=\"Easy Wiki Hosting \"/> There are dozens of different wiki engines in use, both standalone and part of other software, such as [[bug tracking system]]s. Some wiki engines are [[open source]], whereas others are [[proprietary software|proprietary]]. Some permit control over different functions (levels of access); for example, editing rights may permit changing, adding, or removing material. Others may permit access without enforcing access control. Other rules may be imposed to organize content.\n\nThe online encyclopedia project [[Wikipedia]] is the most popular wiki-based website, and is one of the most widely viewed sites in the world, having been ranked in the top ten since 2007.<ref name=\"Alexa Top Sites\">{{citation|url=http://www.alexa.com/topsites|title=Alexa Top Sites|accessdate=December 1, 2016|deadurl=no|archiveurl=https://web.archive.org/web/20150302173920/http://www.alexa.com/topsites|archivedate=March 2, 2015|df=mdy-all}}</ref> Wikipedia is not a single wiki but rather a collection of hundreds of wikis, with each one pertaining to a specific language. In addition to Wikipedia, there are tens of thousands of other wikis in use, both public and private, including wikis functioning as [[knowledge management]] resources, [[notetaking software|notetaking]] tools, [[Web community|community websites]], and [[intranet]]s. The English-language Wikipedia has the largest collection of articles; as of September 2016, it had over five million articles. [[Ward Cunningham]], the developer of the first wiki software, [[WikiWikiWeb]], originally described it as \"the simplest online database that could possibly work\".<ref>{{citation|url=http://www.wiki.org/wiki.cgi?WhatIsWiki|title=What is a Wiki|accessdate=April 10, 2008|publisher=WikiWikiWeb|last=Cunningham|first=Ward|date=June 27, 2002|authorlink=Ward Cunningham|deadurl=no|archiveurl=https://web.archive.org/web/20080416212802/http://www.wiki.org/wiki.cgi?WhatIsWiki|archivedate=April 16, 2008|df=mdy-all}}</ref> \"[[wikt:wiki#Hawaiian|Wiki]]\" (pronounced {{IPA-haw|\u02C8wiki|}}{{refn|group=note|The realization of the Hawaiian {{IPA|/w/|lang=haw}} [[phoneme]] varies between {{IPA|[w]|lang=haw}} and {{IPA|[v]|lang=haw}}, and the realization of the {{IPA|/k/|lang=haw}} phoneme varies between {{IPA|[k]|lang=haw}} and {{IPA|[t]|lang=haw}}, among other realizations. Thus, the pronunciation of the Hawaiian word ''wiki'' varies between {{IPA|['wiki]|lang=haw}}, {{IPA|['witi]|lang=haw}}, {{IPA|['viki]|lang=haw}}, and {{IPA|['viti]|lang=haw}}. See [[Hawaiian phonology]] for more details.}}) is a [[Hawaiian language|Hawaiian]] word meaning \"quick\".<ref>{{vcite web|url=http://www.mauimapp.com/moolelo/hwnwdshw.htm|title=Hawaiian Words; Hawaiian to English|publisher=mauimapp.com|accessdate=September 19, 2008|deadurl=no|archiveurl=https://web.archive.org/web/20080914154748/http://www.mauimapp.com/moolelo/hwnwdshw.htm|archivedate=September 14, 2008|df=mdy-all}}</ref><ref>{{Citation|last=Hasan|first=Heather|title=Wikipedia, 3.5 million articles and counting|year=2012|isbn=9781448855575|page=11}}</ref><ref>{{Citation|last=Andrews|first=Lorrin|title=A dictionary of the Hawaiian language to which is appended an English-Hawaiian vocabulary and a chronological table of remarkable events|year=1865|publisher=Henry M. Whitney|url=https://archive.org/details/dictionaryofhawa00andrrich/|page=514}}</ref>\n\n==Characteristics==\n{{refimprove section|date=March 2017}}\n[[File:Ward Cunningham - Commons-1.jpg|thumb|[[Ward Cunningham]], inventor of the wiki]]\nWard Cunningham and co-author [[Bo Leuf]], in their book ''[[The Wiki Way|The Wiki Way: Quick Collaboration on the Web]]'', described the essence of the Wiki concept as follows:<ref>{{harvnb|Leuf| Cunningham|2001 }}. See Ward Cunningham's site {{cite web |url=http://c2.com/cgi/wiki?WikiDesignPrinciples |title=Archived copy |accessdate=2002-04-30 |deadurl=no |archiveurl=https://web.archive.org/web/20020430181259/http://c2.com/cgi/wiki?WikiDesignPrinciples |archivedate=April 30, 2002 |df=mdy-all }}</ref><!-- page number requested -->\n* A wiki invites all users\u2014not just experts\u2014to edit any [[Web page|page]] or to create new pages within the wiki Web site, using only a standard [[vanilla software|\"plain-vanilla\"]] Web browser without any extra [[browser extension|add-ons]].\n* Wiki promotes meaningful topic associations between different pages by making page link creation intuitively easy and showing whether an intended target page exists or not.\n* A wiki is ''not'' a carefully crafted site created by experts and professional writers, and designed for casual visitors. Instead, it seeks to involve the typical visitor/user in an ongoing process of creation and collaboration that constantly changes the website landscape.\n\nA wiki enables communities of editors and contributors to write documents collaboratively. All that people require to contribute is a computer, [[Internet]] access, a [[web browser]], and a basic understanding of a simple [[markup language]] (e.g., [[HTML]]). A single page in a wiki website is referred to as a \"wiki page\", while the entire collection of pages, which are usually well-interconnected by [[hyperlink]]s, is \"the wiki\". A wiki is essentially a database for creating, browsing, and searching through information. A wiki allows non-linear, evolving, complex, and networked text, while also allowing for editor argument, debate, and interaction regarding the content and formatting.<ref name=Legal>{{citation|title=Legal Issues for Wikis: The Challenge of User-generated and Peer-produced Knowledge, Content and Culture|last1=Black|first1=Peter|last2=Delaney|first2=Hayden|last3=Fitzgerald|first3=Brian|volume=14|publisher=eLaw J.|year=2007|url=https://elaw.murdoch.edu.au/archives/issues/2007/1/eLaw_legal%20issues%20for%20wikis.pdf|deadurl=yes|archiveurl=https://web.archive.org/web/20121222125337/https://elaw.murdoch.edu.au/archives/issues/2007/1/eLaw_legal%20issues%20for%20wikis.pdf|archivedate=December 22, 2012|df=mdy-all}}</ref> A defining characteristic of wiki technology is the ease with which pages can be created and updated. Generally, there is no review by a moderator or gatekeeper before modifications are accepted and thus lead to changes on the website. Many wikis are open to alteration by the general public without requiring registration of [[User (computing)|user]] accounts. Many edits can be made in [[Real-time web|real-time]] and appear almost instantly online. However, this feature facilitates abuse of the system. Private wiki servers require [[Authentication|user authentication]] to edit pages, and sometimes even to read them. [[Maged N. Kamel Boulos]], Cito Maramba, and [[Steve Wheeler]] write that the open wikis produce a process of [[Social Darwinism]]. {{\"'}}Unfit' sentences and sections are ruthlessly culled, edited, and replaced if they are not considered 'fit', which hopefully results in the evolution of a higher quality and more relevant page. While such [[openness]] may invite 'vandalism' and the posting of untrue information, this same openness also makes it possible to rapidly correct or restore a 'quality' wiki page.\"<ref name=BMC/>\n\n===Editing===\n{{for|the project page on editing Wikitext on Wikipedia|Help:Wikitext}}\n{{Wikitext navbox}}\nSome wikis have an Edit button or link directly on the page being viewed, if the user has permission to edit the page. This can lead to a text-based editing page where participants can structure and format wiki pages with a simplified markup language, sometimes known as '''Wikitext''', '''Wiki markup''' or '''Wikicode''' (it can also lead to a [[WYSIWYG]] editing page; see the paragraph after the table below). For example, starting lines of text with [[asterisk]]s could create a [[Bullet (typography)|bulleted list]]. The style and syntax of wikitexts can vary greatly among wiki implementations,{{example needed|date=August 2018}} some of which also allow [[HTML]] tags.\n\nWikis have favoured plain-text editing, with fewer and simpler conventions than HTML, for indicating style and structure. Although limiting access to HTML and [[Cascading Style Sheets]] (CSS) of wikis limits user ability to alter the structure and formatting of wiki content, there are some benefits. Limited access to CSS promotes consistency in the look and feel, and having [[JavaScript]] disabled prevents a user from implementing code that may limit other users' access.\n\n{| class=\"wikitable noprint\"\n|-\n! style=\"width:33.3%;\"|[[MediaWiki]] syntax (the \"behind the scenes\" code used to add formatting to text)\n! style=\"width:33.3%;\"|Equivalent HTML (another type of \"behind the scenes\" code used to add formatting to text)\n! style=\"width:33.3%;\"|Rendered output (seen onscreen by a regular web user)\n|- style=\"vertical-align:top;\"\n|<syntaxhighlight lang=\"moin\">\"Take some more [[tea]],\" the March Hare said to Alice, very earnestly.\n\n\"I've had '''nothing''' yet,\" Alice replied in an offended tone, \"so I can't take more.\"\n\n\"You mean you can't take ''less''?\" said the Hatter. \"It's very easy to take ''more'' than nothing.\"</syntaxhighlight>\n|<syntaxhighlight lang=html><p>\"Take some more <a href=\"/wiki/Tea\" title=\"Tea\">tea</a>,\" the March Hare said to Alice, very earnestly.</p>\n\n<p>\"I've had <b>nothing</b> yet,\" Alice replied in an offended tone, \"so I can't take more.\"</p>\n\n<p>\"You mean you can't take <i>less</i>?\" said the Hatter. \"It's very easy to take <i>more</i> than nothing.\"</p></syntaxhighlight>\n|\"Take some more [[tea]],\" the March Hare said to Alice, very earnestly.\n\n\"I've had '''nothing''' yet,\" Alice replied in an offended tone, \"so I can't take more.\"\n\n\"You mean you can't take ''less''?\" said the Hatter. \"It's very easy to take ''more'' than nothing.\"\n|}\n\nWikis can also make [[WYSIWYG]] editing available to users, usually by means of JavaScript control that translates graphically entered formatting instructions into the corresponding [[HTML element|HTML tags]] or wikitext. In those implementations, the markup of a newly edited, marked-up version of the page is generated and submitted to the server [[transparency (human-computer interaction)|transparently]], shielding the user from this technical detail. An example of this is the [[VisualEditor]] on Wikipedia. However, WYSIWYG controls do not always provide all of the features available in wikitext, and some users prefer not to use a WYSIWYG editor. Hence, many of these sites offer some means to edit the wikitext directly.\n\nSome wikis keep a record of changes made to wiki pages; often, every version of the page is stored. This means that authors can revert to an older version of the page should it be necessary because a mistake has been made, such as the content accidentally being deleted or the page has been vandalized to include offensive or malicious text or other inappropriate content.\n\nMany wiki implementations, such as [[MediaWiki]], allow users to supply an ''edit summary'' when they edit a page. This is a short piece of text summarizing the changes they have made (e.g., \"Corrected grammar,\" or \"Fixed formatting in table.\"). It is not inserted into the article's main text, but is stored along with that revision of the page, allowing users to explain what has been done and why, similar to a log message when making changes in a [[revision control|revision-control]] system. This enables other users to see which changes have been made by whom and why, often in a list of summaries, dates and other short, relevant content, a list which is called a \"log\" or \"history.\"\n\n===Navigation===\nWithin the text of most pages, there are usually a large number of [[hypertext]] links to other pages within the wiki. This form of non-linear navigation is more \"native\" to a wiki than structured/formalized navigation schemes. Users can also create any number of index or table-of-contents pages, with hierarchical categorization or whatever form of organization they like. These may be challenging to maintain \"by hand\", as multiple authors and users may create and delete pages in an [[ad hoc]], unorganized manner. Wikis can provide one or more ways to categorize or tag pages to support the maintenance of such index pages. Some wikis, including the original, have a [[backlink]] feature, which displays all pages that link to a given page. It is also typically possible in a wiki to create links to pages that do not yet exist, as a way to invite others to share what they know about a subject new to the wiki. Wiki users can typically \"tag\" pages with categories or keywords, to make it easier for other users to find the article. For example, a user creating a new article on [[cold weather cycling]] might \"tag\" this page under the categories of commuting, winter sports and bicycling. This would make it easier for other users to find the article.\n\n===Linking and creating pages===\nLinks are created using a specific syntax, the so-called \"link pattern\". Originally, most wikis{{citation needed|date=July 2013}} used [[CamelCase]] to name pages and create links. These are produced by capitalizing words in a phrase and removing the spaces between them (the word \"CamelCase\" is itself an example). While CamelCase makes linking easy, it also leads to links in a form that deviates from the standard spelling. To link to a page with a single-word title, one must abnormally capitalize one of the letters in the word (e.g. \"WiKi\" instead of \"Wiki\"). CamelCase-based wikis are instantly recognizable because they have many links with names such as \"TableOfContents\" and \"BeginnerQuestions.\" It is possible for a wiki to render the visible anchor of such links \"pretty\" by reinserting spaces, and possibly also reverting to lower case. However, this reprocessing of the link to improve the readability of the anchor is limited by the loss of capitalization information caused by CamelCase reversal. For example, \"RichardWagner\" should be rendered as \"Richard Wagner\", whereas \"PopularMusic\" should be rendered as \"popular music\". There is no easy way to determine which [[capital letter]]s should remain capitalized. As a result, many wikis now have \"free linking\" using brackets, and some disable CamelCase by default.\n\n===Searching===\nMost wikis offer at least a title [[search algorithm|search]], and sometimes a [[Full text search|full-text search]]. The scalability of the search depends on whether the wiki engine uses a database. Some wikis, such as [[PmWiki]], use [[flat file]]s.<ref name=Augar>{{cite journal |title=Teaching and learning online with wikis |last1=Naomi |first1=Augar |first2=Ruth |last2=Raitman |first3=Wanlei |last3=Zhou |publisher=Proceedings of Beyond the Comfort Zone: 21st ASCILITE Conference |citeseerx=10.1.1.133.1456|year=2004}}</ref> MediaWiki's first versions used flat files, but it was rewritten by [[Lee Daniel Crocker]] in the early 2000s (decade) to be a database application. Indexed database access is necessary for high speed searches on large wikis. Alternatively, external [[Web search engine|search engines]] such as [[Google Search]] can sometimes be used on wikis with limited searching functions in order to obtain more precise results.\n\n==History==\n{{Main|History of wikis}}\n[[File:HNL Wiki Wiki Bus.jpg|thumb|[[Wiki Wiki Shuttle]] at [[Honolulu International Airport]]]]\n[[WikiWikiWeb]] was the first wiki.<ref name=\"ebersbach10\">{{harvnb|Ebersbach|2008|p=10}}</ref> Ward Cunningham started developing WikiWikiWeb in Portland, Oregon, in 1994, and installed it on the [[Domain name|Internet domain]] [[c2.com]] on March 25, 1995. It was named by Cunningham, who remembered a [[Honolulu International Airport]] counter employee telling him to take the \"[[Wiki Wiki Shuttle]]\" bus that runs between the airport's terminals. According to Cunningham, \"I chose wiki-wiki as an alliterative substitute for 'quick' and thereby avoided naming this stuff quick-web.\"<ref name=\"cunningham\">{{cite web | last = Cunningham | first = Ward | url = http://c2.com/doc/etymology.html | title = Correspondence on the Etymology of Wiki | date = November 1, 2003 | publisher = WikiWikiWeb | accessdate = March 9, 2007 | deadurl = no | archiveurl = https://web.archive.org/web/20070317120823/http://c2.com/doc/etymology.html | archivedate = March 17, 2007 | df = mdy-all }}</ref><ref name=\"history\">{{cite web |last=Cunningham |first=Ward |url=http://c2.com/cgi/wiki?WikiHistory |title=Wiki History |publisher=WikiWikiWeb |date=February 25, 2008 |accessdate=March 9, 2007 |deadurl=no |archiveurl=https://web.archive.org/web/20020621221535/http://c2.com/cgi/wiki?WikiHistory |archivedate=June 21, 2002 |df=mdy-all }}</ref>\n\nCunningham was, in part, inspired by [[Apple Inc.]]'s [[HyperCard]], which he had used. HyperCard, however, was single-user.<ref name=\"artima\">{{cite web |title=Exploring with Wiki: A Conversation with Ward Cunningham, Part I |author=Bill Venners |date=October 20, 2003 |url=http://www.artima.com/intv/wiki.html |publisher=artima developer |accessdate=December 12, 2014 |deadurl=no |archiveurl=https://web.archive.org/web/20150205091836/http://www.artima.com/intv/wiki.html |archivedate=February 5, 2015 |df=mdy-all }}</ref> Apple had designed a system allowing users to create virtual \"card stacks\" supporting links among the various cards. Cunningham developed [[Vannevar Bush]]'s ideas by allowing users to \"comment on and change one another's text.\"<ref name=\"Britannica\"/><ref name=\"hypercard\">{{cite web | last = Cunningham | first = Ward | url = http://c2.com/cgi/wiki?WikiWikiHyperCard | title = Wiki Wiki Hyper Card | publisher = WikiWikiWeb | date = July 26, 2007 | accessdate = March 9, 2007 | deadurl = no | archiveurl = https://web.archive.org/web/20070406064446/http://c2.com/cgi/wiki?WikiWikiHyperCard | archivedate = April 6, 2007 | df = mdy-all }}</ref> Cunningham says his goals were to link together people's experiences to create a new literature to document programming [[Pattern language|patterns]], and to harness people's natural desire to talk and tell stories with a technology that would feel comfortable to those not used to \"authoring\".<ref name=\"artima\" />\n\n[[Wikipedia]] became the most famous wiki site, entering the top ten most popular websites in 2007. In the early 2000s (decade), wikis were increasingly adopted in enterprise as collaborative software. Common uses included project communication, intranets, and documentation, initially for technical users. Some [[corporate wiki|companies use wikis]] as their only collaborative software and as a replacement for static intranets, and some schools and universities use wikis to enhance [[group learning]]. There may be greater use of wikis behind [[Firewall (computing)|firewalls]] than on the public Internet. On March 15, 2007, the word ''wiki'' was listed in the online ''[[Oxford English Dictionary]]''.<ref name=\"OED1\">{{cite web | url = http://www.oed.com/public/update0703/march-2007-update | title = March 2007 update | publisher = [[Oxford English Dictionary]] | date = March 1, 2007 | last = Diamond | first = Graeme | accessdate = March 16, 2007 | deadurl = no | archiveurl = https://web.archive.org/web/20110107132110/http://www.oed.com/public/update0703/march-2007-update | archivedate = January 7, 2011 | df = mdy-all }}</ref>\n\n==Alternative definitions==\nIn the late 1990s and early 2000s, the word \"wiki\" was used to refer to both user-editable websites and the software that powers them; the latter definition is still occasionally in use.<ref name=\"Easy Wiki Hosting\">{{citation |url=http://msdn.microsoft.com/en-us/magazine/cc700339.aspx |title=Easy Wiki Hosting, Scott Hanselman's blog, and Snagging Screens |date=July 2008 |last=Mitchell |first=Scott |publisher=MSDN Magazine |accessdate=March 9, 2010 |deadurl=no |archiveurl=https://web.archive.org/web/20100316192702/http://msdn.microsoft.com/en-us/magazine/cc700339.aspx |archivedate=March 16, 2010 |df=mdy-all }}</ref> Wiki inventor Ward Cunningham wrote in 2014<ref>[https://twitter.com/wardcunningham/status/531149812976996352 The plural of wiki is wiki.] {{webarchive|url=https://web.archive.org/web/20160101210215/https://twitter.com/wardcunningham/status/531149812976996352 |date=January 1, 2016 }}, Ward Cunningham, Twitter, November 8, 2014</ref> that the word \"wiki\" should not be used to refer to a single website, but rather to a mass of user-editable pages and or sites, so that a single website is not \"a wiki\" but \"an instance of wiki\". He wrote that the concept of wiki federation, in which the same content can be hosted and edited in more than one location in a manner similar to [[distributed version control]], meant that the concept of a single discrete \"wiki\" no longer made sense.<ref>{{cite web|url=http://forage.ward.fed.wiki.org/view/an-install-of-wiki|title=Smallest Federated Wiki|work=wiki.org|accessdate=September 28, 2015|deadurl=no|archiveurl=https://web.archive.org/web/20150928165957/http://forage.ward.fed.wiki.org/view/an-install-of-wiki|archivedate=September 28, 2015|df=mdy-all}}</ref>\n\n==Implementations==\n{{see also|List of wiki software}}\n[[Wiki software]] is a type of [[collaborative software]] that runs a wiki system, allowing web pages to be created and edited using a common web browser. It may be implemented as a series of scripts behind an existing [[web server]], or as a standalone [[application server]] that runs on one or more web servers. The content is stored in a [[file system]], and changes to the content are stored in a [[relational database management system]]. A commonly implemented software package is [[MediaWiki]], which runs [[Wikipedia]]. Alternatively, [[personal wiki]]s run as a standalone application on a single computer. [[WikidPad]] is an example. One application, [[TiddlyWiki]], simply makes use of an even single local HTML file with JavaScript inside.\n\nWikis can also be created on a \"[[wiki farm]]\", where the server-side software is implemented by the wiki farm owner. [[PBwiki]], [[Socialtext]], and [[Wikia]] are popular examples of such services. Some wiki farms can also make private, password-protected wikis. Note that free wiki farms generally contain advertising on every page. For more information, see [[Comparison of wiki farms]].\n\n==Trust and security==\n\n===Controlling changes===\n{{Selfref|\"Recent changes\" redirects here. For the Wikipedia help page, see [[Help:Recent changes]]. For the recent changes page itself, see [[Special:RecentChanges]]}}\n[[File:History Comparison Example (Vector).png|thumb|History comparison reports highlight the changes between two revisions of a page.]]\nWikis are generally designed with the philosophy of making it easy to correct mistakes, rather than making it difficult to make them. Thus, while wikis are very open, they provide a means to verify the validity of recent additions to the body of pages. The most prominent, on almost every wiki, is the \"Recent Changes\" page\u2014a specific list numbering recent edits, or a list of edits made within a given time frame.<ref>{{harvnb|Ebersbach|2008|p=20}}</ref> Some wikis can filter the list to remove minor edits and edits made by automatic importing scripts (\"[[Internet bot|bots]]\").<ref>{{harvnb|Ebersbach|2008|p=54}}</ref> From the change log, other functions are accessible in most wikis: the [[Changelog|revision history]] shows previous page versions and the [[diff]] feature highlights the changes between two revisions. Using the revision history, an editor can view and restore a previous version of the article. The diff feature can be used to decide whether or not this is necessary. A regular wiki user can view the diff of an edit listed on the \"Recent Changes\" page and, if it is an unacceptable edit, consult the history, restoring a previous revision; this process is more or less streamlined, depending on the wiki software used.<ref>{{harvnb|Ebersbach|2008|p=178}}</ref>\n\nIn case unacceptable edits are missed on the \"recent changes\" page, some wiki engines provide additional content control. It can be monitored to ensure that a page, or a set of pages, keeps its quality. A person willing to maintain pages will be warned of modifications to the pages, allowing him or her to verify the validity of new editions quickly.<ref>{{harvnb|Ebersbach|2008|p=109}}</ref> A watchlist is a common implementation of this. Some wikis also implement \"patrolled revisions\", in which editors with the requisite credentials can mark some edits as not vandalism. A \"flagged revisions\" system can prevent edits from going live until they have been reviewed.<ref>{{citation|title=Wikipedia's Labor Squeeze and its Consequences|journal=Journal on Telecommunications and High Technology Law|last = Goldman | first = Eric|volume=8}}</ref>\n\n===Trustworthiness and reliability of content===\nCritics of publicly editable wiki systems argue that these systems could be easily tampered with by malicious individuals (\"vandals\") or even by well-meaning but unskilled users who introduce errors into the content. While proponents argue that the community of users can catch malicious content and correct it.<ref name=\"Britannica\"/> [[Lars Aronsson]], a data systems specialist, summarizes the controversy as follows: \"Most people, when they first learn about the wiki concept, assume that a Web site that can be edited by anybody would soon be rendered useless by destructive input. It sounds like offering free spray cans next to a grey concrete wall. The only likely outcome would be ugly [[graffiti]] and simple tagging, and many artistic efforts would not be long lived. Still, it seems to work very well.\"<ref name=\"ebersbach10\"/> High editorial standards in medicine and health sciences articles, in which users typically use peer-reviewed journals or university textbooks as sources, have led to the idea of expert-moderated wikis.<ref>{{citation |title=Introducing Web 2.0: wikis for health librarians |first1=Eugene |last1=Barsky |first2=Dean |last2=Giustini |date=December 2007 |work=Journal of the Canadian Health Libraries Association |url=http://circle.ubc.ca/bitstream/handle/2429/497/c07-036.pdf |volume=28 |issue=4 |pages=147\u2013150 |accessdate=November 7, 2011 |postscript=. |doi=10.5596/c07-036 |ISSN=1708-6892 |deadurl=no |archiveurl=https://web.archive.org/web/20120430195019/https://circle.ubc.ca/bitstream/handle/2429/497/c07-036.pdf |archivedate=April 30, 2012 |df=mdy-all }}</ref> Some wikis allow one to link to specific versions of articles, which has been useful to the scientific community, in that expert peer reviewers could analyse articles, improve them and provide links to the trusted version of that article.<ref>{{citation|title=Wiki ware could harness the Internet for science|first=Kevin|last=Yager|date=March 16, 2006|url=http://www.nature.com/nature/journal/v440/n7082/full/440278a.html|bibcode=2006Natur.440..278Y|volume=440|pages=278|journal=Nature|doi=10.1038/440278a|issue=7082|pmid=16541049|deadurl=no|archiveurl=https://web.archive.org/web/20110513135539/http://www.nature.com/nature/journal/v440/n7082/full/440278a.html|archivedate=May 13, 2011|df=mdy-all}}{{Subscription required}}</ref> Noveck points out that \"participants are accredited by members of the wiki community, who have a vested interest in preserving the quality of the work product, on the basis of their ongoing participation.\" On controversial topics that have been subject to disruptive editing, a wiki may restrict editing to registered users.<ref name=Noveck/>\n\n===Security===\n{{selfref|\"Edit war\" redirects here. For Wikipedia's policy on edit warring, see [[Wikipedia:Edit warring]].}}\nThe open philosophy of wiki&nbsp;\u2013 allowing anyone to edit content \u2013 does not ensure that every editor's intentions are well-mannered. For example, [[cybervandalism|vandalism]] (changing wiki content to something offensive, adding nonsense, or deliberately adding incorrect information, such as [[hoax]] information) can be a major problem. On larger wiki sites, such as those run by the [[Wikimedia Foundation]], [[vandalism]] ''can ''go unnoticed for some period of time. Wikis, because of their open nature, are susceptible to intentional disruption, known as \"[[troll (Internet)|trolling]]\".\nWikis tend to take a ''[[soft security|soft-security]]''<ref name=\"soft security\">{{citation|url=http://www.usemod.com/cgi-bin/mb.pl?SoftSecurity|title=Soft Security|accessdate=March 9, 2007|publisher=[[UseModWiki]]|date=September 20, 2006|deadurl=no|archiveurl=https://web.archive.org/web/20070204012847/http://www.usemod.com/cgi-bin/mb.pl?SoftSecurity|archivedate=February 4, 2007|df=mdy-all}}</ref>{{Unreliable source?|date=July 2013|failed=y}} approach to the problem of vandalism, making damage easy to undo rather than attempting to prevent damage. Larger wikis often employ sophisticated methods, such as bots that automatically identify and revert vandalism and JavaScript enhancements that show characters that have been added in each edit. In this way, vandalism can be limited to just \"minor vandalism\" or \"sneaky vandalism\", where the characters added/eliminated are so few that bots do not identify them and users do not pay much attention to them.<ref>{{cite web |url=http://m3m.homelinux.org/wikiMC/index.php/Security |title=Security |publisher=Assothink |accessdate=February 16, 2013 |deadurl=yes |archiveurl=https://web.archive.org/web/20140106040941/http://m3m.homelinux.org/wikiMC/index.php/Security |archivedate=January 6, 2014 |df=mdy-all }}</ref>{{Unreliable source?|date=July 2013|failed=y}} An example of a bot that reverts vandalism on Wikipedia is ClueBot NG. ClueBot NG can revert edits, often within minutes, if not seconds. The bot uses [[machine learning]] in lieu of [[Heuristic (computer science)|heuristics]].<ref>{{Cite web|url = https://www.theverge.com/2014/2/18/5412636/this-machine-kills-trolls-how-wikipedia-robots-snuff-out-vandalism|title = This machine kills trolls|date = February 18, 2014|accessdate = September 7, 2014|publisher = The Verge|last = Hicks|first = Jesse|deadurl = no|archiveurl = https://web.archive.org/web/20140827115824/http://www.theverge.com/2014/2/18/5412636/this-machine-kills-trolls-how-wikipedia-robots-snuff-out-vandalism|archivedate = August 27, 2014|df = mdy-all}}</ref>\n\nThe amount of vandalism a wiki receives depends on how open the wiki is. For instance, some wikis allow unregistered users, identified by their [[IP address]]es, to edit content, while others limit this function to just registered users. Most wikis allow anonymous editing without an account,<ref>{{harvnb|Ebersbach|2008|p=108}}</ref> but give registered users additional editing functions; on most wikis, becoming a registered user is a short and simple process. Some wikis require an additional waiting period before gaining access to certain tools. For example, on the [[English Wikipedia]], registered users can rename pages only if their account is at least four days old and has made at least ten edits. Other wikis such as the [[Portuguese Wikipedia]] use an editing requirement instead of a time requirement, granting extra tools after the user has made a certain number of edits to prove their trustworthiness and usefulness as an editor. [[Vandalism of Wikipedia]] is common (though policed and usually reverted) because it is extremely open, allowing anyone with a computer and Internet access to edit it, although this makes it grow rapidly. In contrast, [[Citizendium]] requires an editor's real name and short autobiography, affecting the growth of the wiki but sometimes helping stop vandalism.\n\nEdit wars can also occur as users repetitively revert a page to the version they favor. In some cases, editors with opposing views of which content should appear or what formatting style should be used will change and re-change each other's edits. This results in the page being \"unstable\" from a general users' perspective, because each time a general user comes to the page, it may look different. Some wiki software allows an administrator to stop such edit wars by locking a page from further editing until a decision has been made on what version of the page would be most appropriate.<ref name=Legal/> Some wikis are in a better position than others to control behavior due to governance structures existing outside the wiki. For instance, a college teacher can create incentives for students to behave themselves on a class wiki they administer by limiting editing to logged-in users and pointing out that all contributions can be traced back to the contributors. Bad behavior can then be dealt with in accordance with university policies.<ref name=Augar/> The issue of wiki vandalism is debated. In some cases, when an editor deletes an entire article and replaces it with nonsense content, it may be a \"test edit\", made by the user as she or he is experimenting with the wiki system. Some editors may not realize that they have damaged the page, or if they do realize it, they may not know how to undo the mistake or restore the content.\n\n====Potential malware vector====\n[[Malware]] can also be a problem for wikis, as users can add links to sites hosting malicious code. For example, a German Wikipedia article about the [[Blaster Worm]] was edited to include a hyperlink to a malicious website. Users of vulnerable Microsoft Windows systems who followed the link would be infected.<ref name=Legal/> A countermeasure is the use of software that prevents users from saving an edit that contains a link to a site listed on a [[blacklist]] of malware sites.<ref>[[meta:Spam blacklist/About|Meta.wikimedia.org]]</ref>\n\n==Communities==\n\n===Applications===\n[[File:EnglishWikipedia 29June2017.png|thumb|right|The home page of the English Wikipedia]]\nThe English Wikipedia has the largest user base among wikis on the [[World Wide Web]]<ref>{{cite web|url=http://s23.org/wikistats/largest_html.php?sort=users_desc&th=8000&lines=500 |title=List of largest (Media)wikis |accessdate=December 12, 2014 |publisher=S23-Wiki |date=April 3, 2008 |deadurl=yes |archiveurl=https://web.archive.org/web/20140825164715/http://s23.org/wikistats/largest_html.php?sort=users_desc&th=8000&lines=500 |archivedate=August 25, 2014 }}</ref> and ranks in the top 10 among all Web sites in terms of traffic.<ref>{{cite web|url=http://www.alexa.com/topsites|title=Alexa Top 500 Global Sites|accessdate=April 26, 2015|publisher=[[Alexa Internet]]|deadurl=no|archiveurl=https://web.archive.org/web/20150302173920/http://www.alexa.com/topsites|archivedate=March 2, 2015|df=mdy-all}}</ref> Other large wikis include the [[WikiWikiWeb]], [[Memory Alpha]], [[Wikivoyage]], and [[Susning.nu]], a Swedish-language knowledge base. [[List of medical wikis|Medical]] and health-related wiki examples include [[Ganfyd]], an online collaborative medical reference that is edited by medical professionals and invited non-medical experts.<ref name=BMC>{{citation|title=Wikis, blogs and podcasts: a new generation of Web-based tools for virtual collaborative clinical practice and education|doi=10.1186/1472-6920-6-41|pmc=1564136|url=http://www.biomedcentral.com/1472-6920/6/41/|journal=BMC Medical Education|volume=6|pmid=16911779|page=41|publisher=BMC Medical Education|year=2006|first1=M. N. K.|last1=Boulos|first2=I.|last2=Maramba|first3=S.|last3=Wheeler|deadurl=no|archiveurl=https://web.archive.org/web/20100707001625/http://www.biomedcentral.com/1472-6920/6/41|archivedate=July 7, 2010|df=mdy-all}}</ref> Many wiki [[online community|communities]] are private, particularly within [[Enterprise software|enterprises]]. They are often used as [[internal documentation]] for in-house systems and applications. Some companies use wikis to allow customers to help produce software documentation.<ref>{{cite journal | title = Wikis for Collaborative Software Documentation | first1 = C. | last1 = M\u00FCller | first2 = L. | last2 = Birn | url = http://i-know.tugraz.at/wp-content/uploads/2008/11/47_wikis-for-collaborative-software-documentation.pdf | publisher = Proceedings of I-KNOW '06 | date = September 6\u20138, 2006 | deadurl = yes | archiveurl = https://web.archive.org/web/20110706095145/http://i-know.tugraz.at/wp-content/uploads/2008/11/47_wikis-for-collaborative-software-documentation.pdf | archivedate = July 6, 2011 | df = mdy-all }}</ref> A study of corporate wiki users found that they could be divided into \"synthesizers\" and \"adders\" of content. Synthesizers' frequency of contribution was affected more by their impact on other wiki users, while adders' contribution frequency was affected more by being able to accomplish their immediate work.<ref>{{citation |first1 = A. | last1 = Majchrzak | first2 = C. | last2 = Wagner | first3 = D. | last3 = Yates |chapter=Corporate wiki users: results of a survey |title=Proceedings of the 2006 international symposium on Wikis | publisher=Symposium on Wikis |year=2006 |pages=99\u2013104 |url=http://portal.acm.org/citation.cfm?id=1149472 |doi=10.1145/1149453.1149472 |isbn=1-59593-413-8 |accessdate=April 25, 2011}}</ref> from a study of 1000s of wiki deployments, Jonathan Grudin concluded careful stakeholder analysis and education are crucial to successful wiki deployment.<ref>{{cite web |url=http://research.microsoft.com/apps/pubs/default.aspx?id=138573 |title=Wikis at work: Success factors and challenges for sustainability of enterprise wikis \u2013 Microsoft Research |first=Jonathan |last=Grudin |work=research.microsoft.com |year=2015 |accessdate=June 16, 2015 |deadurl=no |archiveurl=https://web.archive.org/web/20150904031729/http://research.microsoft.com/apps/pubs/default.aspx?id=138573 |archivedate=September 4, 2015 |df=mdy-all }}</ref>\n\nIn 2005, the Gartner Group, noting the increasing popularity of wikis, estimated that they would become mainstream collaboration tools in at least 50% of companies by 2009.<ref>{{citation|first=Michelle|last=Conlin|title=E-Mail Is So Five Minutes Ago|date=November 28, 2005|work=Bloomberg BusinessWeek|url=http://www.businessweek.com/stories/2005-11-27/e-mail-is-so-five-minutes-ago|deadurl=no|archiveurl=https://web.archive.org/web/20121017131307/http://www.businessweek.com/stories/2005-11-27/e-mail-is-so-five-minutes-ago|archivedate=October 17, 2012|df=mdy-all}}</ref>{{update inline|date=July 2013}} Wikis can be used for [[project management]].<ref>{{vcite web|title=HomePage|url=http://projectmanagementwiki.org|work=Project Management Wiki.org|accessdate=May 8, 2012|deadurl=no|archiveurl=https://web.archive.org/web/20140816221509/http://projectmanagementwiki.org/|archivedate=August 16, 2014|df=mdy-all}}</ref><ref>{{vcite web|title=Ways to Wiki: Project Management|url=http://www.editme.com/Ways-to-Wiki-Project-Management|work=EditMe|date=January 4, 2010|deadurl=no|archiveurl=https://web.archive.org/web/20120508152328/http://www.editme.com/Ways-to-Wiki-Project-Management|archivedate=May 8, 2012|df=mdy-all}}</ref>{{unreliable source?|failed=y|date=July 2013}}<!--As of 2014-12-12, Japanese with title translating to \"Check the cause of sensitive skin\" --> Wikis have also been used in the academic community for sharing and dissemination of information across institutional and international boundaries.<ref>{{cite journal |url=http://portal.acm.org/citation.cfm?id=1142215.1142259|title=SensorWiki.org: a collaborative resource for researchers and interface designers |isbn=2-84426-314-3|first1 = M. M. | last1 = Wanderley | first2 = D. | last2 = Birnbaum | first3 = J. | last3 = Malloch | year=2006 |journal=NIME '06 Proceedings of the 2006 conference on New interfaces for musical expression |publisher=IRCAM \u2013 Centre Pompidou|pages=180\u2013183 }}</ref> In those settings, they have been found useful for collaboration on [[grant writing]], [[strategic planning]], departmental documentation, and committee work.<ref>{{cite journal |title=Putting Wikis to Work in Libraries |url=http://www.informaworld.com/smpp/content~content=a901841555&db=all |archive-url=https://archive.is/20121129052327/http://www.informaworld.com/smpp/content~content=a901841555&db=all |dead-url=yes |archive-date=November 29, 2012 |first=Nancy T. |last=Lombardo |volume=27 |issue=2 |date=June 2008 |journal=Medical Reference Services Quarterly |pages=129\u2013145 |doi=10.1080/02763860802114223 |df=mdy-all }}</ref> In the mid-2000s (decade), the increasing trend among industries toward collaboration was placing a heavier impetus upon educators to make students proficient in collaborative work, inspiring even greater interest in wikis being used in the classroom.<ref name=Legal/>\n\nWikis have found some use within the legal profession, and within government. Examples include the [[Central Intelligence Agency]]'s [[Intellipedia]], designed to share and collect [[Intelligence assessment|intelligence]], dKospedia, which was used by the [[American Civil Liberties Union]] to assist with review of documents pertaining to internment of detainees in [[Guant\u00E1namo Bay]];<ref>{{cite web|url=http://www.dailykos.com/story/2005/06/09/120607/-SusanHu-s-FOIA-Project-UPDATE|title=SusanHu's FOIA Project UPDATE|accessdate=June 25, 2013|deadurl=no|archiveurl=https://web.archive.org/web/20130530181455/http://www.dailykos.com/story/2005/06/09/120607/-SusanHu-s-FOIA-Project-UPDATE|archivedate=May 30, 2013|df=mdy-all}}</ref> and the wiki of the [[United States Court of Appeals for the Seventh Circuit]], used to post court rules and allow practitioners to comment and ask questions. The [[United States Patent and Trademark Office]] operates [[Peer-to-Patent]], a wiki to allow the public to collaborate on finding [[prior art]] relevant to examination of pending patent applications. [[Queens]], New York has used a wiki to allow citizens to collaborate on the design and planning of a local park. [[Cornell Law School]] founded a wiki-based legal dictionary called Wex, whose growth has been hampered by restrictions on who can edit.<ref name=Noveck>{{Citation|title=Wikipedia and the Future of Legal Education|last=Noveck|first=Beth Simone|journal=Journal of Legal Education|volume=57|issue=1|url=http://heinonline.org/HOL/LandingPage?collection=journals&handle=hein.journals/jled57&div=8&id=&page=|date=March 2007|deadurl=no|archiveurl=https://web.archive.org/web/20140703005842/http://heinonline.org/HOL/LandingPage?collection=journals&handle=hein.journals%2Fjled57&div=8&id=&page=|archivedate=July 3, 2014|df=mdy-all}}{{paywall}}</ref>\n\n===City wikis===\nA city wiki (or local wiki) is a wiki used as a [[knowledge management|knowledge base]] and [[social network]] for a specific [[geography|geographical]] locale.<ref>Andersen, Michael (November 6, 2009) \"[http://www.niemanlab.org/2009/11/welcome-to-davis-calif-six-lessons-from-the-worlds-best-local-wiki/ Welcome to Davis, Calif.: Six lessons from the world\u2019s best local wiki] {{webarchive|url=https://web.archive.org/web/20130808084426/http://www.niemanlab.org/2009/11/welcome-to-davis-calif-six-lessons-from-the-worlds-best-local-wiki/ |date=August 8, 2013 }}.\" Niemen Journalism Lab. Niemen Foundation/Harvard University</ref><ref>McGann, Laura (June 18, 2010) \"[http://www.niemanlab.org/2010/06/knight-news-challenge-is-a-wiki-site-coming-to-your-city-local-wiki-will-build-software-to-make-it-simple/ Knight News Challenge: Is a wiki site coming to your city? Local Wiki will build software to make it simple] {{webarchive|url=https://web.archive.org/web/20130625035936/http://www.niemanlab.org/2010/06/knight-news-challenge-is-a-wiki-site-coming-to-your-city-local-wiki-will-build-software-to-make-it-simple/ |date=June 25, 2013 }}.\" Niemen Journalism Lab. Niemen Foundation/Harvard University</ref><ref>[[Wired (magazine)|Wired]]: Makice, Kevin (July 15, 2009). [http://archive.wired.com/geekdad/2009/07/hey-kid-support-your-local-wiki/ Hey, Kid: Support Your Local Wiki] {{webarchive|url=https://web.archive.org/web/20150427080359/http://archive.wired.com/geekdad/2009/07/hey-kid-support-your-local-wiki/ |date=April 27, 2015 }}</ref> The term 'city wiki' or its foreign language equivalent (e.g. German 'Stadtwiki') is sometimes also used for wikis that cover not just a city, but a small town or an entire region. A city wiki contains information about specific instances of things, ideas, people and places. Much of this information might not be appropriate for [[encyclopedia]]s such as [[Wikipedia]] (e.g., articles on every retail outlet in a town), but might be appropriate for a wiki with more localized content and viewers. A city wiki could also contain information about the following subjects, that may or may not be appropriate for a general knowledge wiki, such as:\n* Details of public establishments such as public houses, bars, accommodation or social centers\n* Owner name, opening hours and statistics for a specific shop\n* Statistical information about a specific road in a city\n* Flavors of ice cream served at a local ice cream parlor\n* A biography of a local mayor and other persons\n\n===WikiNodes===\n[[File:Development of \"Mathe f\u00FCr Nicht-Freaks\" from Sep 2009 to June 2016.webm|thumb|Visualization of the collaborative work in\nthe German wiki project [[b:de:Mathe f\u00FCr Nicht-Freaks|Mathe f\u00FCr Nicht-Freaks]]]]\n{{distinguish|WikiNodes (Apple)}}\nWikiNodes are pages on wikis that describe related wikis. They are usually organized as neighbors and delegates. A ''neighbor'' wiki is simply a wiki that may discuss similar content or may otherwise be of interest. A ''delegate'' wiki is a wiki that agrees to have certain content delegated to that wiki.<ref>{{cite web |publisher=WikiNodes |title=Frequently Asked Questions |url=http://wikinodes.wiki.taoriver.net/moin.fcg/FrequentlyAskedQuestions |archiveurl=https://web.archive.org/web/20070810213702/http://wikinodes.wiki.taoriver.net/moin.fcg/FrequentlyAskedQuestions |archivedate=August 10, 2007}}</ref> One way of finding a wiki on a specific subject is to follow the wiki-node network from wiki to wiki; another is to take a Wiki \"bus tour\", for example: {{srlink|Wikipedia:TourBusStop|Wikipedia's Tour Bus Stop}}.\n\n===Participants===\nThe four basic types of users who participate in wikis are reader, author, wiki administrator and system administrator. The system administrator is responsible for installation and maintenance of the wiki engine and the container web server. The wiki administrator maintains wiki content and is provided additional functions pertaining to pages (e.g. page protection and deletion), and can adjust users' access rights by, for instance, blocking them from editing.<ref>{{cite journal|title=Analysis of the use of Wiki-based collaborations in enhancing student learning|last=Cubric|first=Marija|publisher=University of Hertfordshire|year=2007|url=https://uhra.herts.ac.uk/dspace/handle/2299/3672|accessdate=April 25, 2011|deadurl=no|archiveurl=https://web.archive.org/web/20110515005430/https://uhra.herts.ac.uk/dspace/handle/2299/3672|archivedate=May 15, 2011|df=mdy-all}}</ref>\n\n===Growth factors===\nA study of several hundred wikis showed that a relatively high number of administrators for a given content size is likely to reduce growth;<ref>{{cite journal | title = Measuring wiki viability. An empirical assessment of the social dynamics of a large sample of wikis | publisher = The Centre for Research in Social Simulation | first1 = C. | last1 = Roth | first2 = D. | last2 = Taraborelli | first3 = N. | last3 = Gilbert | year = 2008 | page = 3 | quote = Figure 4 shows that having a relatively high number of administrators for a given content size is likely to reduce growth. | url = http://nitens.org/docs/wikidyn.pdf | deadurl = no | archiveurl = https://web.archive.org/web/20171011105517/http://nitens.org/docs/wikidyn.pdf | archivedate = October 11, 2017 | df = mdy-all }}</ref> that access controls restricting editing to registered users tends to reduce growth; that a lack of such access controls tends to fuel new user registration; and that higher administration ratios (i.e. admins/user) have no significant effect on content or population growth.<ref>{{cite journal | title = Measuring wiki viability. An empirical assessment of the social dynamics of a large sample of wikis | publisher = The Centre for Research in Social Simulation | first1 = C. | last1 = Roth | first2 = D. | last2 = Taraborelli | first3 = N. | last3 = Gilbert | year = 2008 | url = http://epubs.surrey.ac.uk:80/1565/1/fulltext.pdf | archive-url = https://web.archive.org/web/20120616204038/http://epubs.surrey.ac.uk:80/1565/1/fulltext.pdf | dead-url = yes | archive-date = 2012-06-16 }}</ref>\n\n==Conferences==\nActive conferences and meetings about wiki-related topics include:\n* Atlassian Summit, an annual conference for users of [[Atlassian]] software, including [[Confluence (software)|Confluence]].<ref>{{vcite web |url=http://summit.atlassian.com/ |title=Atlassian Summit homepage |publisher=Summit.atlassian.com |accessdate=June 20, 2011 |deadurl=no |archiveurl=https://web.archive.org/web/20110613081406/http://summit.atlassian.com/ |archivedate=June 13, 2011 |df=mdy-all }}</ref>\n* [[OpenSym]] (called WikiSym until 2014), an [[academic conference]] dedicated to research about wikis and open collaboration.\n* SMWCon, a bi-annual conference for users and developers of [[Semantic MediaWiki]].<ref>{{vcite web |url=http://semantic-mediawiki.org/wiki/SMWCon |title=SMWCon homepage |publisher=Semantic-mediawiki.org |accessdate=June 20, 2011 |deadurl=no |archiveurl=https://web.archive.org/web/20110714183910/http://semantic-mediawiki.org/wiki/SMWCon |archivedate=July 14, 2011 |df=mdy-all }}</ref>\n* TikiFest, a frequently held meeting for users and developers of [[Tiki Wiki CMS Groupware]].<ref>{{vcite web |url=http://tiki.org/TikiFest |title=TikiFest homepage |publisher=Tiki.org |accessdate=June 20, 2011 |deadurl=no |archiveurl=https://web.archive.org/web/20110630070137/http://tiki.org/TikiFest |archivedate=June 30, 2011 |df=mdy-all }}</ref>\n* [[Wikimania]], an annual conference dedicated to the research and practice of [[Wikimedia Foundation]] projects like Wikipedia.\n\nFormer wiki-related events include:\n* [[RecentChangesCamp]] (2006\u20132012), an [[unconference]] on wiki-related topics.\n* RegioWikiCamp (2009\u20132013), a semi-annual unconference on \"regiowikis\", or wikis on cities and other geographic areas.<ref>{{vcite web |url=http://wiki.regiowiki.eu/Main_Page |title=European RegioWikiSociety homepage |publisher=Wiki.regiowiki.eu |date=June 10, 2011 |accessdate=June 20, 2011 |archiveurl=https://web.archive.org/web/20090813101324/http://wiki.regiowiki.eu/Main_Page |archivedate=August 13, 2009 |deadurl=yes |df=mdy-all }}</ref>\n\n==Rules==\nWikis typically have a set of rules governing user behavior. Wikipedia, for instance, has a labyrinthine set of policies and guidelines summed up in its five pillars: Wikipedia is an encyclopedia; Wikipedia has a neutral point of view; Wikipedia is free content; Wikipedians should interact in a respectful and civil manner; and Wikipedia does not have firm rules. Many wikis have adopted a set of commandments. For instance, [[Conservapedia]] commands, among other things, that its editors use \"[[Before Christ|B.C.]]\" rather than \"[[B.C.E.]]\" when referring to years prior to [[Common Era|C.E.]] 1 and refrain from \"unproductive activity.\"<ref>{{vcite web |url=http://www.conservapedia.com/Conservapedia:Commandments |work=Conservapedia.com |title=Conservapedia Commandments |date=May 15, 2010 |accessdate=July 24, 2010 |deadurl=no |archiveurl=https://web.archive.org/web/20101022014810/http://conservapedia.com/Conservapedia:Commandments |archivedate=October 22, 2010 |df=mdy-all }}</ref> One teacher instituted a commandment for a class wiki, \"[[The Golden Rule|Wiki unto others as you would have them wiki unto you]].\"<ref name=Augar/>\n\n==Legal environment==\nJoint authorship of articles, in which different users participate in correcting, editing, and compiling the finished product, can also cause editors to become [[tenants in common]] of the copyright, making it impossible to republish without permission of all co-owners, some of whose identities may be unknown due to pseudonymous or anonymous editing.<ref name=Legal/> However, where persons contribute to a [[collective work]] such as an encyclopedia, there is no joint ownership if the contributions are separate and distinguishable.<ref>{{citation |work=Redwood Music Ltd v. B Feldman & Co Ltd|year=1979|publisher=RPC 385}}</ref> Despite most wikis' tracking of individual contributions, the action of contributing to a wiki page is still arguably one of jointly correcting, editing, or compiling, which would give rise to joint ownership. Some copyright issues can be alleviated through the use of an [[open content]] license. Version 2 of the [[GNU Free Documentation License]] includes a specific provision for wiki relicensing; [[Creative Commons]] licenses are also popular. When no license is specified, an implied license to read and add content to a wiki may be deemed to exist on the grounds of business necessity and the inherent nature of a wiki, although the legal basis for such an implied license may not exist in all circumstances.{{citation needed|date=July 2013}}\n\nWikis and their users can be held liable for certain activities that occur on the wiki. If a wiki owner displays indifference and forgoes controls (such as banning copyright infringers) that he could have exercised to stop copyright infringement, he may be deemed to have authorized infringement, especially if the wiki is primarily used to infringe copyrights or obtains direct financial benefit, such as advertising revenue, from infringing activities.<ref name=Legal/> In the United States, wikis may benefit from [[Section 230 of the Communications Decency Act]], which protects sites that engage in \"[[Good Samaritan]]\" policing of harmful material, with no requirement on the quality or quantity of such self-policing.<ref>{{cite journal | title = Self-Regulation: How Wikipedia Leverages User-Generated Quality Control Under Section 230 | first1 = Kathleen M. | last1 = Walsh | first2 = Sarah | last2 = Oh | date = February 23, 2010 | url = http://works.bepress.com/cgi/viewcontent.cgi?article=1000&context=sarah_oh | deadurl = no | archiveurl = https://web.archive.org/web/20140106040705/http://works.bepress.com/cgi/viewcontent.cgi?article=1000&context=sarah_oh | archivedate = January 6, 2014 | df = mdy-all }}</ref> However, it has also been argued that a wiki's enforcement of certain rules, such as anti-bias, verifiability, reliable sourcing, and no-original-research policies, could pose legal risks.<ref>{{Citation|last = Myers | first = Ken S.|title=Wikimmunity: Fitting the Communications Decency Act to Wikipedia |journal=Harvard Journal of Law and Technology|publisher=The Berkman Center for Internet and Society|year=2008|ssrn=916529|volume=20|page=163}}</ref> When [[defamation]] occurs on a wiki, theoretically all users of the wiki can be held liable, because any of them had the ability to remove or amend the defamatory material from the \"publication.\" It remains to be seen whether wikis will be regarded as more akin to an [[internet service provider]], which is generally not held liable due to its lack of control over publications' contents, than a publisher.<ref name=Legal/> It has been recommended that trademark owners monitor what information is presented about their trademarks on wikis, since courts may use such content as evidence pertaining to public perceptions. Joshua Jarvis notes, \"Once misinformation is identified, the trade mark owner can simply edit the entry.\"<ref>{{citation|work=Managing Intellectual Property|last=Jarvis|first=Joshua|title=Police your marks in a wiki world|url=http://heinonline.org/HOL/LandingPage?collection=journals&handle=hein.journals/manintpr179&div=31&id=&page=|pages=101\u2013103|date=May 2008|issue=179|deadurl=no|archiveurl=https://web.archive.org/web/20160304044437/http://heinonline.org/HOL/LandingPage?collection=journals&handle=hein.journals%2Fmanintpr179&div=31&id=&page=|archivedate=March 4, 2016|df=mdy-all}}</ref>\n\n==See also==\n{{portal|Internet}}\n{{div col}}\n* [[Comparison of wiki software]]\n* [[Content management system]]\n* [[CURIE]]\n* [[Dispersed knowledge]]\n* [[List of wikis]]\n* [[Mass collaboration]]\n* [[Universal Edit Button]]\n* [[Wikis and education]]\n{{div col end}}\n\n==Notes==\n{{reflist|group=note}}\n\n==References==\n{{Reflist|30em}}\n\n==Further reading==\n{{refbegin}}\n* {{citation|title=Wiki: Web Collaboration|last=Ebersbach|first= Anja|publisher=[[Springer Science+Business Media]]|year=2008|isbn=3-540-35150-7}}\n* {{citation|title= The Wiki Way: Quick Collaboration on the Web |last1 = Leuf |first1 = Bo |last2= Cunningham |first2= Ward |publisher= [[Addison\u2013Wesley]] |date=April 13, 2001|isbn=0-201-71499-X}}\n* {{citation|title=Wikipatterns| last = Mader | first = Stewart|publisher=[[John Wiley & Sons]]|date=December 10, 2007|isbn=0-470-22362-6}}\n* {{citation|title=Wikinomics: How [[Mass Collaboration]] Changes Everything| last = Tapscott | first = Don|publisher=Portfolio Hardcover|date=April 17, 2008|isbn=1-59184-193-3}}\n{{refend}}\n\n==External links==\n{{Spoken Wikipedia|En-Wiki2.ogg|2007-03-14}}\n{{sisterlinks|d=Q171|commons=category:Wiki software|voy=no|mw=wiki|m=no|wikt=wiki|s=no|q=no|b=no}}\n* {{DMOZ|Computers/Software/Groupware/Wiki/}}\n* [http://www.artima.com/intv/wiki.html ''Exploring with Wiki''], an interview with [[Ward Cunningham]] by Bill Verners\n* [[WikiIndex:Welcome|WikiIndex]] and [https://wikiapiary.com WikiApiary], directories of wikis\n* [http://www.wikimatrix.org/ WikiMatrix], a website for comparing wiki software and hosts\n* [http://wikipapers.referata.com/wiki/Main_Page WikiPapers], a wiki about publications about wikis\n* [https://github.com/WikiTeam/wikiteam WikiTeam], a volunteer group to preserve wikis\n* Murphy, Paula (April 2006). [https://web.archive.org/web/20110709101821/http://www.ucop.edu/tltc/news/2006/04/wiki.html Topsy-turvy World of Wiki]. [[University of California]].\n* [http://c2.com/doc/etymology.html Ward Cunningham's correspondence with etymologists]\n\n{{Wiki topics|state=expanded}}\n{{Wiki software}}\n{{Computer-mediated communication}}\n\n{{Authority control}}\n\n[[Category:Wikis| ]]\n[[Category:Hawaiian words and phrases]]\n[[Category:Hypertext]]\n[[Category:Self-organization]]\n[[Category:Social information processing]]\n[[Category:Articles containing video clips]]\n", plugins: [
          gutter(),
          history(),
          specialChars({}),
          multipleSelections(),
          mode,
          matchBrackets({ decorationsPlugin: mode }),
          keymap((_a$1 = {
                  "Mod-z": undo,
                  "Mod-Shift-z": redo,
                  "Mod-u": function (view) { return undoSelection(view) || true; }
              },
              _a$1[isMac ? "Mod-Shift-u" : "Alt-u"] = redoSelection,
              _a$1["Ctrl-y"] = isMac ? undefined : redo,
              _a$1["Enter"] = crudeInsertNewlineAndIndent,
              _a$1["Shift-Tab"] = crudeIndentLine,
              _a$1)),
          keymap(baseKeymap),
      ] });
  var view = window.view = new EditorView(state);
  document.querySelector("#editor").appendChild(view.dom);

})));
//# sourceMappingURL=mediawiki-demo_built.js.map
