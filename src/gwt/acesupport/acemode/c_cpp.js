/*
 * c_cpp.js
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
 *
 * The Original Code is Ajax.org Code Editor (ACE).
 *
 * The Initial Developer of the Original Code is
 * Ajax.org B.V.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *      Fabian Jakobs <fabian AT ajax DOT org>
 *      Gastón Kleiman <gaston.kleiman AT gmail DOT com>
 *
 * Based on Bespin's C/C++ Syntax Plugin by Marc McIntyre.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

define("mode/c_cpp", function(require, exports, module) {

var oop = require("ace/lib/oop");
var TextMode = require("ace/mode/text").Mode;
var Tokenizer = require("ace/tokenizer").Tokenizer;
var Range = require("ace/range").Range;
var c_cppHighlightRules = require("mode/c_cpp_highlight_rules").c_cppHighlightRules;

var MatchingBraceOutdent = require("mode/c_cpp_matching_brace_outdent").MatchingBraceOutdent;
var CStyleBehaviour = require("mode/behaviour/cstyle").CStyleBehaviour;

var CppStyleFoldMode = null;
if (!window.NodeWebkit)
   CppStyleFoldMode = require("mode/c_cpp_fold_mode").FoldMode;

var SweaveBackgroundHighlighter = require("mode/sweave_background_highlighter").SweaveBackgroundHighlighter;
var RCodeModel = require("mode/r_code_model").RCodeModel;
var RMatchingBraceOutdent = require("mode/r_matching_brace_outdent").RMatchingBraceOutdent;


var Mode = function(suppressHighlighting, doc, session) {
    this.$session = session;
    this.$doc = doc; 
    this.$tokenizer = new Tokenizer(new c_cppHighlightRules().getRules());
    this.$outdent = new MatchingBraceOutdent();
    this.$r_outdent = {};
    oop.implement(this.$r_outdent, RMatchingBraceOutdent);
    this.$behaviour = new CStyleBehaviour();
    this.codeModel = new RCodeModel(doc, this.$tokenizer, /^r-/, /^\s*\/\*{3,}\s+[Rr]\s*$/);
    this.$sweaveBackgroundHighlighter = new SweaveBackgroundHighlighter(
        session,
        /^\s*\/\*{3,}\s+[Rr]\s*$/,
        /^\*\/$/,
        true
    );
        
    if (!window.NodeWebkit)     
      this.foldingRules = new CppStyleFoldMode();

};
oop.inherits(Mode, TextMode);

(function() {

    this.insertChunkInfo = {
        value: "/*** R\n\n*/\n",
        position: {row: 1, column: 0}
    };

    this.toggleCommentLines = function(state, doc, startRow, endRow) {
        var outdent = true;
        var re = /^(\s*)\/\//;

        for (var i=startRow; i<= endRow; i++) {
            if (!re.test(doc.getLine(i))) {
                outdent = false;
                break;
            }
        }

        if (outdent) {
            var deleteRange = new Range(0, 0, 0, 0);
            for (var i=startRow; i<= endRow; i++)
            {
                var line = doc.getLine(i);
                var m = line.match(re);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                deleteRange.end.column = m[0].length;
                doc.replace(deleteRange, m[1]);
            }
        }
        else {
            doc.indentRows(startRow, endRow, "//");
        }
    };

    this.getLanguageMode = function(position)
    {
      return this.$session.getState(position.row).match(/^r-/) ? 'R' : 'C_CPP';
    };

    this.inRLanguageMode = function(state)
    {
        return state.match(/^r-/);
    };

    // Identify whether we're currently writing a macro -- either the current
    // line starts with a '#define' statement, or a chain of lines ending with
    // '\' leads back to a line starting with a '#define' statement.
    this.inMacro = function(lines, row) {
        if (row < 0) {
            return false;
        } else if (/^\s*#define/.test(lines[row])) {
            return true;
        } else if (/\\\s*$/.test(lines[row])) {
            return this.inMacro(lines, row - 1);
        } else {
            return false;
        }
    };

    this.complements = {
        "<" : ">",
        ">" : "<",
        "{" : "}",
        "}" : "{",
        "[" : "]",
        "]" : "[",
        "(" : ")",
        ")" : "(",
        "'" : "'",
        '"' : '"'
    };

    // Balance: we are balanced when the number of 'left' parentheses
    // is greater than or equal to the number of 'right' parentheses
    this.findMatchingBracketRow = function(str, lines, row, balance, direction) {

        direction = typeof direction !== 'undefined' ? direction : "backward";
        
        if (typeof row === "undefined") return -1;
        if (row < 0 || row > lines.length - 1) return -1;

        var line = lines[row];

        var nRight = line.split(str).length - 1;
        var nLeft = line.split(this.complements[str]).length - 1;
        // console.log("Line:");
        // console.log(line);
        // console.log("nLeft: " + nLeft);
        // console.log("nRight: " + nRight);
        // console.log("Row: " + row);

        balance = balance + nRight - nLeft;
        
        if (balance <= 0) {
            return row;
        }

        if (direction == "backward") {
            row = row - 1;
        } else if (direction == "forward") {
            row = row + 1;
        } else {
            row = row - 1;
        }

        return this.findMatchingBracketRow(str, lines, row, balance);
    };

    this.getNextLineIndent = function(state, line, tab, tabSize, row) {

        if (this.inRLanguageMode(state))
           return this.codeModel.getNextLineIndent(row, line, state, tab, tabSize);

        var indent = this.$getIndent(line);
        var unindent = indent.substr(1, indent.length - tab.length);
        var lines = this.$doc.$lines;

        var lastline;
        if (row > 0) {
            lastLine = lines[row - 1];
        } else {
            lastLine = "";
        }

        var tokenizedLine = this.$tokenizer.getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;
        var nTokens = tokens.length;

        // Decisions made should not depend on trailing comments in the line
        // So, we strip those out for the purposes of indentation
        var lineCommentMatch = line.match(/\/\//);
        if (lineCommentMatch) {
            line = line.substr(0, lineCommentMatch.index - 1);
        }

        var lastLineCommentMatch = lastLine.match(/\/\//);
        if (lastLineCommentMatch) {
            lastLine = lastLine.substr(0, lastLineCommentMatch.index - 1);
        }

        // Get the caret position, if available
        // Decisions made should depend on text up to the caret point
        try {
            var caretPosition = window.editor.getCursorPosition();
            line = line.substr(0, caretPosition.column);
        } catch(err) {}

        // Comment specific behaviors
        if (state == "comment" || state == "rd-start") {

            // Handle a beginning of a comment
            // TODO: The rules for starting an R block, e.g. within
            // "/*** R", likely would have to be modified here.
            if (/\/\*/.test(line)) {
                return indent + ' * ';
            }

            // Allow users to have text further indented in a comment block
            if (/\s*\*+\s*(\w)/.test(line)) {
                var firstCharMatch = /\w/.exec(line); // to get the first match
                if (firstCharMatch) {
                    var firstStar = /\*/.exec(line);
                    return indent + '*' + Array(firstCharMatch.index - firstStar.index).join(' ');
                } else {
                    return indent + '* ';
                }
                
            }
            
            // default behavior -- doxygen style
            return indent.substr(0, indent.length-1) + ' * ';

        }

        // Rules for the 'general' state
        if (state == "start") {

            // Indent after a #define with continuation
            if (line.match(/#define.*\\/)) {
                return indent + tab;
            }

            // Unindent after leaving a #define with continuation
            if (this.inMacro(lines, row)) {
                var match = line.match(/\\/);
                if (!match) {
                    return unindent;
                } else {
                    line = line.substr(0, match.index);
                }
            }

            // Only indent on an ending '>' if we're not in a template
            // We can do this by checking for a matching '>'
            if (line.match(/>$/)) {
                var loc = this.findMatchingBracketRow(">", lines, row, 0);
                if (loc >= 0) {
                    return indent;
                } else {
                    return indent + tab;
                }
            }

            // Unindent after leaving a block comment
            if (line.match(/\*\/\s*$/)) {
                return indent.substr(1, indent.length-1);
            }

            // Indent for a :
            if (line.match(/:\s*$/)) {
                return indent + tab;
            }

            // Unindent after leaving a naked case
            if (lastLine.match(/case\s+\w+:\s*$/)) {
                return unindent;
            }

            // Don't indent for namespaces
            if (line.match(/namespace .*\{\s*$/) ||
                line.match(/switch .*\{\s*$/)) {
                return indent;
            }

            // Indent if the line ends on an operator token
            // Can't include > here since they may be used
            // for templates (it's handled above)
            if (line.match(/[\+\-\/\*\|\<\&\^\%\=]\s*$/)) {
                return indent + tab;
            }

            // Indent a naked else
            if (line.match(/else *$/)) {
                return indent + tab;
            }

            // Unindent after leaving a naked else
            if (lastLine.match(/else\s*$/)) {
                return unindent;
            }

            // Indent e.g. "if (foo)"
            if (line.match(/if.*\)\s*$/)) {
                return indent + tab;
            }

            // Unindent after leaving a naked if
            if (lastLine.match(/if.*\)\s*$/)) {
                return unindent;
            }

            // Tricky: indent if we're ending with a parenthesis
            // We have to walk up looking for the matching parenthesis,
            // since we assume that parenthesis will have the proper scope
            // or indentation
            var match = line.match(/([\)\}\]])[;,]$/);
            if (match) {

                // this is needed because apparently 'row' is undefined
                // in the tester
                if (row) {
                    var rowMatch = this.findMatchingBracketRow(
                        match[1],
                        lines,
                        row,
                        0
                    );
                    
                    var startPos = lines[rowMatch].match(/([^\s])/).index + 1;
                    return Array(startPos).join(" ");
                }

            }

            // Vertical alignment
            // We need to handle vertical alignment for two scenarios:
            // One, for multi-line function declarations, so that e.g.
            //
            // void foo(int a, int b, 
            //
            //          ^
            //
            // and two, for cases where we have multiple objects. Maybe
            // this can just be specialized for {.
            // static object foo {
            //      {foo, bar},
            //
            //      ^
            //
            if (line.match(/,\s*$/)) {

                // get the associated brace position
                var bracePos = line.match(/[[{(]/);
                if (bracePos) {
                    var firstCharAfter = line.substr(bracePos.index).match(/([^\s])/);
                    var idx = firstCharAfter.index;

                    // Nudge out if the brace we just looked at was unmatched
                    if (!line.match("\\" + this.complements[ firstCharAfter[1] ])) {
                        idx += 1;
                    }

                    return Array(idx + bracePos.index + 1).join(" ");

                } else {
                    return indent;
                }
            }

            // Same logic for function calls
            var match = line.match(/\)\s*\{\s*$/);
            if (match) {

                // Find the row for the associated opening paren
                if (row) {
                    var rowMatch = this.findMatchingBracketRow(
                        ")",
                        lines,
                        row,
                        0
                    );
                    var startPos = lines[rowMatch].match(/[^\s]/).index + 1;
                    return Array(startPos).join(" ") + tab;
                }
                
            }

            // Indent if we're ending with a parenthesis
            // Tricky: if we're defining a class with inheritance, we may
            // have something like
            //
            // class foo :
            //     public A {
            // 
            // }^ 
            //
            // The idea: we walk through the lines, and we
            // 1. strip out potential class identifiers,
            // 2. Look that each expression is preceded by either a ':' or ',',
            // 3. If we see a ',', keep going,
            // 4. If we see a ':', look for a 'class' or 'struct' token,
            // 5. Otherwise, conclude that we're not within a class
            if (line.match(/^.*[\{\(\[]\s*$/)) {

                var numTokens = 0;
                var numCommas = 0;

                // walk up through the rows
                for (var i=row; i >= 0; --i) {

                    var line = lines[i];

                    if (line.match(/:/)) {
                        var match = line.match(/class\s+|struct\s+/);
                        // try looking one step up too
                        if (!match)
                            match = lines[i-1].match(/class\s+|struct\s+/);

                        if (match) {
                            // We found the class token! Use that
                            // for our indentation
                            return Array(match.index + 1).join(" ") + tab;
                        }
                    }

                    // strip initial whitespace
                    line = line.replace(indent, "");
                    
                    // strip out private, virtual, public, whitespace
                    line = line.replace("public ", "");
                    line = line.replace("private ", "");
                    line = line.replace("virtual ", "");

                    // strip out anything within quotes
                    line = line.replace(/".*?"/, "");

                    // collapse whitespace
                    line = line.replace(/\s+/, " ");
                    line = line.replace(/s+{?$/, "");

                    numTokens += line.split(" ").length - 1;
                    numCommas += line.split(",").length - 1;

                    // console.log(line);
                    // console.log(numTokens);
                    // console.log(numCommas);

                    // If the following condition is true, we ran into too
                    // many tokens without enough ',' or ':'
                    if (numTokens - numCommas > 1) break;
                }

                return indent + tab;
            }

        } // start state rules

        return indent;
    };
        
    this.checkOutdent = function(state, line, input) {
        if (this.inRLanguageMode(state))
            return this.$r_outdent.checkOutdent(line,input);
        else
            return this.$outdent.checkOutdent(line, input);
    };

    this.autoOutdent = function(state, doc, row) {
        if (this.inRLanguageMode(state))
            return this.$r_outdent.autoOutdent(state, doc, row);
        else
            return this.$outdent.autoOutdent(doc, row);
    };
    
    this.transformAction = function(state, action, editor, session, text) {
       if (action === 'insertion') {
            if (text === "\n") {
                // If beginning of doxygen comment, provide the end
                var pos = editor.getSelectionRange().start;
                var match = /^(\/\*[\*\!]\s*)/.exec(session.doc.getLine(pos.row));
                if (match && editor.getSelectionRange().start.column >= match[1].length) {
                    return {text: "\n * \n */\n",
                            selection: [1, 3, 1, 3]};
                }
                // If newline in a doxygen comment, continue the comment
                match = /^((\s*\/\/+')\s*)/.exec(session.doc.getLine(pos.row));
                if (match && editor.getSelectionRange().start.column >= match[2].length) {
                    return {text: "\n" + match[1]};
                }
            }
        
            else if (text === "R") {
                // If newline to start and embedded R chunk complete the chunk
                var pos = editor.getSelectionRange().start;
                var match = /^(\s*\/\*{3,}\s+)/.exec(session.doc.getLine(pos.row));
                if (match && editor.getSelectionRange().start.column >= match[1].length) {
                    return {text: "R\n\n*/\n",
                            selection: [1,0,1,0]};
                }
            }
       }
       return false;
    };

}).call(Mode.prototype);

exports.Mode = Mode;
});
