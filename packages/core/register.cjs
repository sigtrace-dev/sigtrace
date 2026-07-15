const fs = require('fs');
const parser = require('@babel/parser');
const traverseObj = require('@babel/traverse');
const generateObj = require('@babel/generator');
const t = require('@babel/types');

const traverse = traverseObj.default || traverseObj;
const generate = generateObj.default || generateObj;

const originalReadFile = fs.readFileSync;

function transformAngularCode(code, filename) {
  if (!code.includes('signal') && !code.includes('computed') && !code.includes('effect')) {
    return code;
  }

  // Replace ts-expect-error with ts-ignore to prevent "Unused ts-expect-error" compiler warnings
  code = code.replace(/\/\/\s*@ts-expect-error/g, '// @ts-ignore');

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy']
    });

    let hasRewrittenImport = false;

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        if (source === '@angular/core') {
          const specifiers = path.node.specifiers;
          const targetPrims = ['signal', 'computed', 'effect'];
          
          const targetSpecifiers = specifiers.filter((s) => 
            t.isImportSpecifier(s) && targetPrims.includes(s.imported.name)
          );
          const remainingSpecifiers = specifiers.filter((s) => 
            !t.isImportSpecifier(s) || !targetPrims.includes(s.imported.name)
          );
          
          if (targetSpecifiers.length > 0) {
            hasRewrittenImport = true;
            if (remainingSpecifiers.length > 0) {
              const newImport = t.importDeclaration(
                remainingSpecifiers,
                t.stringLiteral('@angular/core')
              );
              path.insertAfter(newImport);
            }
            path.node.specifiers = targetSpecifiers;
            path.node.source.value = '@sigtrace/core/angular';
          }
        }
      },
      CallExpression(path) {
        const callee = path.node.callee;
        let funcName = '';
        if (t.isIdentifier(callee)) {
          funcName = callee.name;
        } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
          funcName = callee.property.name;
        }

        if (funcName === 'signal' || funcName === 'computed' || funcName === 'effect') {
          const loc = path.node.loc;
          const line = loc ? loc.start.line : 0;
          const column = loc ? loc.start.column : 0;

          // Find variable, property or assignment name
          let varName = '';
          const parent = path.parentPath;
          if (parent && parent.node) {
            const type = parent.node.type;
            if (type === 'VariableDeclarator') {
              const id = parent.node.id;
              if (t.isIdentifier(id)) {
                varName = id.name;
              }
            } else if (type === 'ClassProperty' || type === 'PropertyDefinition' || type === 'ObjectProperty') {
              const key = parent.node.key;
              if (t.isIdentifier(key)) {
                varName = key.name;
              } else if (t.isStringLiteral(key)) {
                varName = key.value;
              }
            } else if (type === 'AssignmentExpression') {
              const left = parent.node.left;
              if (t.isMemberExpression(left) && t.isIdentifier(left.property)) {
                varName = left.property.name;
              } else if (t.isIdentifier(left)) {
                varName = left.name;
              }
            }
          }

          if (!varName) {
            varName = `${funcName}_line${line}`;
          }

          // Extract enclosing component or class name
          let componentName = '';
          const componentParent = path.findParent((p) => 
            p.isClassDeclaration() || 
            p.isFunctionDeclaration() || 
            (p.isArrowFunctionExpression() && p.parentPath.isVariableDeclarator())
          );
          if (componentParent) {
            if (componentParent.isClassDeclaration()) {
              componentName = componentParent.node.id ? componentParent.node.id.name : '';
            } else if (componentParent.isFunctionDeclaration()) {
              componentName = componentParent.node.id ? componentParent.node.id.name : '';
            } else if (componentParent.isArrowFunctionExpression() && componentParent.parentPath.isVariableDeclarator()) {
              const varId = componentParent.parentPath.node.id;
              if (t.isIdentifier(varId)) {
                componentName = varId.name;
              }
            }
          }
          if (!componentName) {
            const parts = filename.split('/');
            const base = parts[parts.length - 1] || 'Global';
            componentName = base.split('.')[0] || 'Global';
          }

          const safeFilename = filename.replace(/\\/g, '/');
          const sourceLocNode = t.objectExpression([
            t.objectProperty(t.identifier('file'), t.stringLiteral(safeFilename)),
            t.objectProperty(t.identifier('line'), t.numericLiteral(line)),
            t.objectProperty(t.identifier('column'), t.numericLiteral(column))
          ]);

          const debugObj = t.objectExpression([
            t.objectProperty(t.identifier('name'), t.stringLiteral(varName)),
            t.objectProperty(t.identifier('component'), t.stringLiteral(componentName)),
            t.objectProperty(t.identifier('__source'), sourceLocNode)
          ]);

          if (funcName === 'signal') {
            if (path.node.arguments.length === 0) {
              path.node.arguments.push(t.identifier('undefined'));
            }
            if (path.node.arguments.length === 1) {
              path.node.arguments.push(debugObj);
            } else if (path.node.arguments.length >= 2) {
              const originalOpts = path.node.arguments[1];
              if (t.isObjectExpression(originalOpts)) {
                const nameProp = originalOpts.properties.find(p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
                if (!nameProp) {
                  originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
                }
                originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
              }
            }
          } else if (funcName === 'computed' || funcName === 'effect') {
            if (path.node.arguments.length === 1) {
              path.node.arguments.push(debugObj);
            } else if (path.node.arguments.length >= 2) {
              const originalOpts = path.node.arguments[1];
              if (t.isObjectExpression(originalOpts)) {
                const nameProp = originalOpts.properties.find(p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
                if (!nameProp) {
                  originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
                }
                originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
              }
            }
          }
        }
      }
    });

    if (!hasRewrittenImport) {
      return code;
    }

    const output = generate(ast, {}, code);
    return output.code;
  } catch (err) {
    console.error(`[SigTrace Hook Error] Failed to process ${filename}:`, err);
    return code;
  }
}

// Override fs.readFileSync
fs.readFileSync = function (filePath, options) {
  const content = originalReadFile.apply(this, arguments);

  if (
    typeof filePath === 'string' &&
    filePath.endsWith('.ts') &&
    !filePath.includes('node_modules') &&
    !filePath.includes('dist')
  ) {
    try {
      if (typeof content === 'string') {
        return transformAngularCode(content, filePath);
      } else if (content instanceof Buffer) {
        const str = content.toString('utf8');
        const transformed = transformAngularCode(str, filePath);
        return Buffer.from(transformed, 'utf8');
      }
    } catch (e) {
      console.error(`[SigTrace Hook Error] Failed to transform ${filePath}:`, e);
    }
  }

  return content;
};

console.log('[SigTrace] Build-time monkeypatch loaded: Auto-injecting reactivity tracing.');
