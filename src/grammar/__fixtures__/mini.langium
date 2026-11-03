// Miniature LikeC4 grammar, shaped like the real one but small enough to read.
// Tests that care about a *specific* version of the language use this pair:
// mini.langium is the "v1" shape, mini.v2.langium adds a shape and a block, the
// way upstream added `agent` after v1.59.4.

grammar Mini

entry MiniGrammar:
  models+=Model;

Model:
  name='model' '{'
    elements+=Element
  '}';

Element:
  kind=[ElementKind] name=Id ('{' props+=ElementProperty* '}')?;

ElementShape returns string:
  'rectangle' |
  'cylinder';

ThemeColor returns string:
  'blue' |
  'red';

BorderStyleValue returns string:
  LineOptions | 'none';

LineOptions returns string:
  'solid' |
  'dashed';

ElementProperty:
  key=('title' | 'description') ':'? value=String ';'?;

Relation<isExplicit>:
  source=FqnRef
  RelationConnector
  target=FqnRef;

fragment RelationConnector:
  '-[' kind=[RelationshipKind] (isBidirectional?=']<->' | ']->') |
  isBidirectional?='<->' |
  '->';

hidden terminal BLOCK_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal LINE_COMMENT: /\/\/[^\n\r]*/;

terminal BOOLEAN returns boolean: /\b(true|false)\b/;
terminal LIB_ICON: /(aws|tech):[-\w]*/;
terminal String: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;
terminal Number returns number: /\b\d+\b/;
terminal IdTerminal: /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/;
