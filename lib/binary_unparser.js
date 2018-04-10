var Context = require("./context").Context;
var Parser = require("./binary_parser");
var vm = require("vm");

class UnParser {
  constructor(obj) {
    obj && Object.assign(this, obj);

    if (obj) {
      // this.prototype = Object.getPrototypeOf(obj);
      this.parser = obj;
      this.resolveReferences = obj.resolveReferences;
    }
    this.generateString = this.generateStringUnparser;
  }

  convertToUnParser(parser) {
    return new UnParser(parser);
  }

  unparse (data, buffer) {
    if (!this.unparserCompiled) {
      this.compileUnparser();
    }

    return this.unparserCompiled(buffer, this.constructorFn, data);
  }

compileUnparser() {
  var src = "(function unparser(buffer, constructorFn, vars) { " + this.getUnparserCode() + " })";
  this.unparserCompiled = vm.runInThisContext(src);
};

getUnparserCode () {
  var ctx = new Context();
  ctx.isUnparser = true;

  if (!this.alias) {
    this.addRawUnparserCode(ctx);
  } else {
    console.error('TODO: Aliased code not supported');
    this.addAliasedCode(ctx);
  }

  if (this.alias) {
    ctx.pushCode("return {0}(0).result;", FUNCTION_PREFIX + this.alias);
  } else {
    ctx.pushCode("return buffer;");
  }

  return ctx.code;
};

addRawUnparserCode(ctx) {
  ctx.pushCode("var offset = 0;");

  this.generateUnparser(ctx);

  this.resolveReferences(ctx);

  ctx.pushCode("return buffer;");
};

generateUnparser(ctx) {
  if (this.type) {
    this["generate" + this.type].bind(this)(ctx);
    this.generateAssert(ctx);
  }

  var varName = ctx.generateVariable(this.varName);
  if (this.options.formatter) {
    this.generateFormatter(ctx, varName, this.options.formatter);
  }

  return this.generateNext(ctx);
};

generateStringUnparser (ctx) {
  var name = ctx.generateVariable(this.varName);
  var start = ctx.generateTmpVariable();
  console.error('generateStringUnparser', ctx);

  if (this.options.length && this.options.zeroTerminated) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode(
      "while(buffer.readUInt8(offset++) !== 0 && offset - {0}  < {1});",
      start,
      this.options.length
    );
    ctx.pushCode(
      "buffer.write('{0}', {1}, offset - {2} < {3} ? offset - 1 : offset, '{3}');",
      name,
      start,
      this.options.length,
      this.options.encoding
    );
  } else if (this.options.length) {
   
    ctx.pushCode(
      "buffer.write({0}, offset, offset + {2}, '{3}');",
      name,
      start,
      ctx.generateOption(this.options.length),
      this.options.encoding
    );
    ctx.pushCode("offset += {0};", ctx.generateOption(this.options.length));
  } else if (this.options.zeroTerminated) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode("while(buffer.readUInt8(offset++) !== 0);");
    ctx.pushCode(
      "{0} = buffer.toString('{1}', {2}, offset - 1);",
      name,
      this.options.encoding,
      start
    );
  } else if (this.options.greedy) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode("while(buffer.length > offset++);");
    ctx.pushCode(
      "{0} = buffer.toString('{1}', {2}, offset);",
      name,
      this.options.encoding,
      start
    );
  }
  if (this.options.stripNull) {
    ctx.pushCode("{0} = {0}.replace(/\\x00+$/g, '')", name);
  }
};

  // Recursively call code generators and append results
  generateNext (ctx) {
    if (this.next) {
      ctx = this.convertToUnParser(this.next).generate(ctx);
    }

    return ctx;
  };

  generate (ctx) {
    if (this.type) {
      this["generate" + this.type](ctx);
    }

    var varName = ctx.generateVariable(this.varName);
    if (this.options.formatter) {
      this.generateFormatter(ctx, varName, this.options.formatter);
    }

    return this.generateNext(ctx);
  };

  generateNest (ctx) {
    var nestVar = ctx.generateVariable(this.varName);

    if (this.options.type instanceof Parser.Parser) {
      if (this.varName && !ctx.isUnparser) {
        ctx.pushCode("{0} = {};", nestVar);
      }
      ctx.pushPath(this.varName);
      this.convertToUnParser(this.options.type).generate(ctx);
      ctx.popPath(this.varName);
    } else if (aliasRegistry[this.options.type]) {
      var tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        "var {0} = {1}(offset);",
        tempVar,
        FUNCTION_PREFIX + this.options.type
      );
      ctx.pushCode("{0} = {1}.result; offset = {1}.offset;", nestVar, tempVar);
      if (this.options.type !== this.alias) ctx.addReference(this.options.type);
    }
  };

  generateArray (ctx) {
    var length = ctx.generateOption(this.options.length);
    var lengthInBytes = ctx.generateOption(this.options.lengthInBytes);
    var type = this.options.type;
    var counter = ctx.generateTmpVariable();
    var lhs = ctx.generateVariable(this.varName);
    var item = ctx.generateTmpVariable();
    var key = this.options.key;
    var isHash = typeof key === "string";

    if (typeof this.options.readUntil === "function") {
      ctx.pushCode("do {");
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode("for (var {0} = 0; offset < buffer.length; {0}++) {", counter);
    } else if (lengthInBytes !== undefined) {
      ctx.pushCode(
        "for (var {0} = offset; offset - {0} < {1}; ) {",
        counter,
        lengthInBytes
      );
    } else {
      ctx.pushCode("for (var {0} = 0; {0} < {1}; {0}++) {", counter, length);
    }

    if (typeof type === "string") {
      if (!aliasRegistry[type]) {
        ctx.pushCode("var {0} = buffer.read{1}(offset);", item, NAME_MAP[type]);
        ctx.pushCode("offset += {0};", PRIMITIVE_TYPES[NAME_MAP[type]]);
      } else {
        var tempVar = ctx.generateTmpVariable();
        ctx.pushCode("var {0} = {1}(offset);", tempVar, FUNCTION_PREFIX + type);
        ctx.pushCode("console.log('testtodo'); var {0} = {1}.result; offset = {1}.offset;", item, tempVar);
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser.Parser) {
      if (ctx.isUnparser) {
        ctx.pushCode("{0} = {1}[{2}];", item, lhs, counter);
      } else {
        ctx.pushCode("var {0} = {};", item);
      }

      ctx.pushScope(item);
      this.convertToUnParser(type).generate(ctx);
      ctx.popScope();
    }

    if (!ctx.isUnparser) {
      if (isHash) {
        ctx.pushCode("{0}[{2}.{1}] = {2};", lhs, key, item);
      } else {
        ctx.pushCode("{0}.push({1});", lhs, item);
      }
    }

    ctx.pushCode("}");

    if (typeof this.options.readUntil === "function") {
      ctx.pushCode(
        " while (!({0}).call(this, {1}, buffer.slice(offset)));",
        this.options.readUntil,
        item
      );
    }
  };

  generateChoice (ctx) {
    var tag = ctx.generateOption(this.options.tag);
    ctx.pushCode("switch({0}) {", tag);
    Object.keys(this.options.choices).forEach(function (tag) {
      var type = this.options.choices[tag];

      ctx.pushCode("case {0}:", tag);
      this.generateChoiceCase(ctx, this.varName, type);
      ctx.pushCode("break;");
    }, this);
    ctx.pushCode("default:");
    if (this.options.defaultChoice) {
      this.generateChoiceCase(ctx, this.varName, this.options.defaultChoice);
    } else {
      ctx.generateError('"Met undefined tag value " + {0} + " at choice"', tag);
    }
    ctx.pushCode("}");
  };

  generateChoiceCase (ctx, varName, type) {
    if (typeof type === "string") {
      if (!aliasRegistry[type]) {
        ctx.pushCode(
          "{0} = buffer.read{1}(offset);",
          ctx.generateVariable(this.varName),
          NAME_MAP[type]
        );
        ctx.pushCode("offset += {0};", PRIMITIVE_TYPES[NAME_MAP[type]]);
      } else {
        var tempVar = ctx.generateTmpVariable();
        ctx.pushCode("var {0} = {1}(offset);", tempVar, FUNCTION_PREFIX + type);
        ctx.pushCode(
          "{0} = {1}.result; offset = {1}.offset;",
          ctx.generateVariable(this.varName),
          tempVar
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser.Parser) {
      ctx.pushPath(varName);
      this.convertToUnParser(type).generate(ctx);
      ctx.popPath(varName);
    }
  };

}

class FileUnparser extends UnParser {};

class ReactUnparser extends UnParser {

  constructor(obj) {
    super(obj);
    obj && Object.assign(this, obj);

    if (obj) {
      this.parser = obj;
      this.resolveReferences = obj.resolveReferences;
    }
    this.generateString = this.generateStringUnparser;
  }

  convertToUnParser(parser) {
    return new ReactUnparser(parser);
  }

  generateStringUnparser(ctx) {
    var name = ctx.generateVariable(this.varName);
    var start = ctx.generateTmpVariable();
    console.error('generateStringUnparser', ctx);

    if (this.options.length && this.options.zeroTerminated) {
      ctx.pushCode("var {0} = offset;", start);
      ctx.pushCode(
        "while(buffer.readUInt8(offset++) !== 0 && offset - {0}  < {1});",
        start,
        this.options.length
      );
      ctx.pushCode(
        "buffer.write('{0}', {1}, offset - {2} < {3} ? offset - 1 : offset, '{3}');",
        name,
        start,
        this.options.length,
        this.options.encoding
      );
    } else if (this.options.length) {
      
      var classNames = name.split('.').slice(1).join(' ');
      ctx.pushCode(
        `buffer+='<span class="${classNames}" title="${classNames}">'+{0}.replace(/ /g,'_').substring(0,{2})+'</span>'; /*buffer.write('<span>{0}</span>', offset, offset + {2}, '{3}');*/`,
        name,
        start,
        ctx.generateOption(this.options.length),
        this.options.encoding
      );
      ctx.pushCode("offset += {0};", ctx.generateOption(this.options.length));
    } else if (this.options.zeroTerminated) {
      ctx.pushCode("var {0} = offset;", start);
      ctx.pushCode("while(buffer.readUInt8(offset++) !== 0);");
      ctx.pushCode(
        "{0} = buffer.toString('{1}', {2}, offset - 1);",
        name,
        this.options.encoding,
        start
      );
    } else if (this.options.greedy) {
      ctx.pushCode("var {0} = offset;", start);
      ctx.pushCode("while(buffer.length > offset++);");
      ctx.pushCode(
        "{0} = buffer.toString('{1}', {2}, offset);",
        name,
        this.options.encoding,
        start
      );
    }
    if (this.options.stripNull) {
      ctx.pushCode("{0} = {0}.replace(/\\x00+$/g, '')", name);
    }
  };

};

exports.FileUnparser = FileUnparser;
exports.ReactUnparser = ReactUnparser;
