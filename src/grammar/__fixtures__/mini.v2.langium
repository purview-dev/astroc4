// The same miniature grammar one release later: `agent` joins the shapes and
// `views` becomes a block — the kind of change that used to require editing the
// TextMate grammar by hand. See mini.langium.

grammar Mini

entry MiniGrammar:
  models+=Model | views+=ModelViews;

Model:
  name='model' '{'
    elements+=Element
  '}';

ModelViews:
  name='views' folder=String? '{' '}';

Element:
  kind=[ElementKind] name=Id ('{' props+=ElementProperty* '}')?;

ElementShape returns string:
  'rectangle' |
  'cylinder' |
  'agent';

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
